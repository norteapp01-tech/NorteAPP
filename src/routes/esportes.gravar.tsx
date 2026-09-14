import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { X, Volume2, VolumeX, Camera, Share2 } from "lucide-react";
import { MapboxRouteMap } from "@/components/esportes/MapboxRouteMap";
import { RoutePicker, type RouteSelection } from "@/components/esportes/RoutePicker";
import { RoutePreview } from "@/components/esportes/RoutePreview";
import { ShareActivitySheet } from "@/components/esportes/ShareActivitySheet";
import { useSportRecorder } from "@/lib/sport-recorder-context";
import { supabase } from "@/lib/supabase/client";
import {
  linkActivityToExecution,
  saveRecordedActivity,
  updateActivity,
  computeDurations,
  computeDistanceM,
} from "@/lib/sport-store";
import {
  modalityLabel,
  modalityActionLabel,
  formatDistanceKm,
  formatDurationClock,
  formatPace,
  formatSpeedKmh,
  computePaceSPerKm,
  computeSpeedKmh,
  activityTypeLabel,
  effortLevelLabel,
  type SportModality,
  type SportActivity,
  type ActivityType,
  type EffortLevel,
} from "@/lib/sport-store";
import { formatChangeDistanceM } from "@/lib/sport-route-geometry";

const OFF_ROUTE_THRESHOLD_M = 40;
const CHANGE_ALERT_RADIUS_M = 60;

/** Beep curto via Web Audio (sem arquivo de áudio) — melhor esforço, a
 * gravação nunca depende disso pra funcionar. */
function playChangeAlertBeep() {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.3);
  } catch {
    // Melhor esforço — sem som nunca deve travar ou interromper a gravação.
  }
}

export const Route = createFileRoute("/esportes/gravar")({
  head: () => ({ meta: [{ title: "Gravar atividade — Norte" }] }),
  validateSearch: (
    s: Record<string, unknown>,
  ): { modalidade: SportModality; execucao?: string } => ({
    modalidade:
      s.modalidade === "caminhada" || s.modalidade === "ciclismo" ? s.modalidade : "corrida",
    execucao: typeof s.execucao === "string" ? s.execucao : undefined,
  }),
  component: GravarPage,
});

function GravarPage() {
  const { modalidade, execucao } = Route.useSearch();
  const navigate = useNavigate();
  const recorder = useSportRecorder();
  const [discardConfirm, setDiscardConfirm] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [finishedData, setFinishedData] = useState<ReturnType<typeof recorder.finish>>(null);
  const [routeSelection, setRouteSelection] = useState<RouteSelection | null>(null);
  const alertedChangeIndexRef = useRef<number | null>(null);

  const activeModality = recorder.modality ?? modalidade;
  const isBusy = recorder.status === "recording" || recorder.status === "paused";

  useEffect(() => {
    if (recorder.route?.guidanceMode !== "com_avisos") return;
    const state = recorder.routeGuidanceState;
    if (!state?.nextChange || state.distanceToNextChangeM === null) return;
    if (
      state.distanceToNextChangeM <= CHANGE_ALERT_RADIUS_M &&
      alertedChangeIndexRef.current !== state.nextChange.pointIndex
    ) {
      alertedChangeIndexRef.current = state.nextChange.pointIndex;
      if (soundEnabled) playChangeAlertBeep();
    }
  }, [recorder.routeGuidanceState, recorder.route, soundEnabled]);

  const leaveToOverview = () =>
    navigate({ to: "/sub-agenda/$categoria", params: { categoria: "esportes" } });

  if (recorder.recoverable) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-6 text-center">
        <p className="text-lg font-bold">Encontramos uma atividade não finalizada</p>
        <p className="text-sm text-muted-foreground">
          {modalityLabel[recorder.recoverable.modality]} iniciada em{" "}
          {new Date(recorder.recoverable.startedAt).toLocaleString("pt-BR")} —{" "}
          {recorder.recoverable.points.length} pontos salvos localmente. Pode haver uma lacuna se o
          app fechou no meio.
        </p>
        <div className="flex w-full max-w-xs flex-col gap-2">
          <button
            onClick={recorder.resumeFromRecovered}
            className="w-full rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground"
          >
            Retomar
          </button>
          <button
            onClick={recorder.discardRecovered}
            className="w-full rounded-xl border border-border py-3 text-sm font-semibold text-muted-foreground"
          >
            Descartar
          </button>
        </div>
      </div>
    );
  }

  if (recorder.status === "finished" && finishedData) {
    return (
      <FinishForm
        data={finishedData}
        executionId={execucao}
        onSaved={() => {
          recorder.reset();
          setFinishedData(null);
          leaveToOverview();
        }}
      />
    );
  }

  if (!isBusy) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background px-6 text-center">
        <button
          onClick={leaveToOverview}
          aria-label="Voltar"
          className="absolute left-4 top-12 text-muted-foreground"
        >
          <X className="h-6 w-6" />
        </button>
        <p className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          {modalityLabel[activeModality]}
        </p>
        <div>
          <p className="text-sm text-muted-foreground">
            {recorder.gpsError
              ? recorder.gpsError
              : recorder.gpsReady
                ? "GPS pronto"
                : "Verificando GPS…"}
          </p>
        </div>
        <div className="rounded-xl border border-warning/30 bg-warning/10 p-4 text-xs text-warning">
          Mantenha a tela ligada e a Norte em primeiro plano durante a atividade — gravação com tela
          bloqueada ainda não é suportada nesta versão.
        </div>
        <div className="w-full max-w-xs text-left">
          <RoutePicker
            modality={activeModality}
            value={routeSelection}
            onChange={setRouteSelection}
          />
        </div>
        <button
          disabled={!recorder.gpsReady}
          onClick={() => {
            alertedChangeIndexRef.current = null;
            recorder.start(activeModality, execucao, routeSelection ?? undefined);
          }}
          className="w-full max-w-xs rounded-2xl bg-primary py-4 text-base font-bold text-primary-foreground disabled:opacity-40"
        >
          {modalityActionLabel[activeModality]}
        </button>
      </div>
    );
  }

  const distanceM = computeDistanceM(recorder.points);
  const { activeDurationS } = computeDurations(
    recorder.startedAt ?? new Date().toISOString(),
    null,
    recorder.pauses,
  );
  const pace = activeModality !== "ciclismo" ? computePaceSPerKm(distanceM, activeDurationS) : null;
  const speed = activeModality === "ciclismo" ? computeSpeedKmh(distanceM, activeDurationS) : null;

  const showRouteBanner =
    recorder.route?.guidanceMode === "com_avisos" && recorder.routeGuidanceState;
  const isOffRoute =
    showRouteBanner && (recorder.routeGuidanceState?.offRouteM ?? 0) > OFF_ROUTE_THRESHOLD_M;

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <div className="relative flex-1">
        <MapboxRouteMap points={recorder.points} routePoints={recorder.route?.points} />
        <div className="absolute left-4 top-12 flex gap-2">
          <button
            onClick={() => setDiscardConfirm(true)}
            aria-label="Descartar atividade"
            className="flex h-10 w-10 items-center justify-center rounded-full bg-background/90 text-foreground shadow-lg backdrop-blur"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <button
          onClick={() => setSoundEnabled((v) => !v)}
          aria-label="Avisos sonoros"
          className="absolute right-4 top-12 flex h-10 w-10 items-center justify-center rounded-full bg-background/90 text-foreground shadow-lg backdrop-blur"
        >
          {soundEnabled ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}
        </button>
        {showRouteBanner && (
          <div className="absolute left-1/2 top-24 w-max max-w-[85%] -translate-x-1/2 rounded-full bg-background/90 px-3 py-1.5 text-center text-[11px] font-semibold backdrop-blur">
            {isOffRoute ? (
              <span className="text-warning">
                Fora da rota por {formatChangeDistanceM(recorder.routeGuidanceState!.offRouteM)}
              </span>
            ) : recorder.routeGuidanceState!.distanceToNextChangeM !== null ? (
              <span>
                Muda de direção em{" "}
                {formatChangeDistanceM(recorder.routeGuidanceState!.distanceToNextChangeM)}
              </span>
            ) : (
              <span className="text-muted-foreground">Fim do trajeto planejado</span>
            )}
          </div>
        )}
      </div>

      <div className="border-t border-border bg-surface px-5 pb-[calc(env(safe-area-inset-bottom)+16px)] pt-5">
        <div className="grid grid-cols-3 gap-2 text-center">
          <div>
            <p className="font-mono text-3xl font-bold">
              {formatDistanceKm(distanceM).replace(" km", "")}
            </p>
            <p className="text-[10px] uppercase text-muted-foreground">km</p>
          </div>
          <div>
            <p className="font-mono text-3xl font-bold">{formatDurationClock(activeDurationS)}</p>
            <p className="text-[10px] uppercase text-muted-foreground">tempo ativo</p>
          </div>
          <div>
            <p className="font-mono text-3xl font-bold">
              {activeModality === "ciclismo" ? formatSpeedKmh(speed) : formatPace(pace)}
            </p>
            <p className="text-[10px] uppercase text-muted-foreground">
              {activeModality === "ciclismo" ? "km/h" : "min/km"}
            </p>
          </div>
        </div>

        <div className="mt-5 flex gap-2">
          {recorder.status === "recording" ? (
            <button
              onClick={recorder.pause}
              className="flex-1 rounded-2xl border border-border py-3.5 text-sm font-bold text-foreground"
            >
              Pausar
            </button>
          ) : (
            <>
              <button
                onClick={recorder.resume}
                className="flex-1 rounded-2xl border border-border py-3.5 text-sm font-bold text-foreground"
              >
                Continuar
              </button>
              <button
                onClick={() => setFinishedData(recorder.finish())}
                className="flex-1 rounded-2xl bg-primary py-3.5 text-sm font-bold text-primary-foreground"
              >
                Finalizar
              </button>
            </>
          )}
        </div>
      </div>

      {discardConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6">
          <div className="w-full max-w-xs rounded-2xl bg-surface p-5 text-center">
            <p className="text-sm font-semibold">Descartar esta atividade?</p>
            <p className="mt-1 text-xs text-muted-foreground">
              O percurso gravado não pode ser recuperado.
            </p>
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => {
                  recorder.discard();
                  setDiscardConfirm(false);
                  leaveToOverview();
                }}
                className="flex-1 rounded-lg bg-danger py-2 text-xs font-semibold text-white"
              >
                Descartar
              </button>
              <button
                onClick={() => setDiscardConfirm(false)}
                className="flex-1 rounded-lg border border-border py-2 text-xs font-semibold"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function FinishForm({
  data,
  executionId,
  onSaved,
}: {
  data: NonNullable<ReturnType<ReturnType<typeof useSportRecorder>["finish"]>>;
  executionId?: string;
  onSaved: () => void;
}) {
  const now = new Date(data.startedAt);
  const weekday = now.toLocaleDateString("pt-BR", { weekday: "long" });
  const period = now.getHours() < 12 ? "de manhã" : now.getHours() < 18 ? "à tarde" : "à noite";
  const defaultTitle = `${modalityLabel[data.modality]} de ${weekday} ${period}`;

  const [title, setTitle] = useState(defaultTitle);
  const [note, setNote] = useState("");
  const [activityType, setActivityType] = useState<ActivityType | undefined>(undefined);
  const [effortLevel, setEffortLevel] = useState<EffortLevel | undefined>(undefined);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedActivity, setSavedActivity] = useState<SportActivity | null>(null);
  const [shareOpen, setShareOpen] = useState(false);

  const distanceM = computeDistanceM(data.points);
  const { activeDurationS, totalDurationS } = computeDurations(
    data.startedAt,
    data.endedAt,
    data.pauses,
  );
  const avgPaceSPerKm = computePaceSPerKm(distanceM, activeDurationS);
  const avgSpeedKmh = computeSpeedKmh(distanceM, activeDurationS);

  const onPhotoFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoFile(file);
    setPhotoPreviewUrl(URL.createObjectURL(file));
  };

  const save = async () => {
    setSaving(true);
    try {
      const finalTitle = title.trim() || defaultTitle;
      const activityId = await saveRecordedActivity({
        modality: data.modality,
        title: finalTitle,
        note: note || undefined,
        startedAt: data.startedAt,
        endedAt: data.endedAt,
        points: data.points,
        pauses: data.pauses,
        executionId: data.executionId ?? executionId,
        routeId: data.routeId,
        activityType,
        effortLevel,
      });
      if (data.executionId ?? executionId) {
        await linkActivityToExecution(activityId, (data.executionId ?? executionId)!);
      }

      let photoUrl: string | undefined;
      if (photoFile) {
        const { data: userData } = await supabase.auth.getUser();
        const userId = userData.user?.id;
        if (userId) {
          const ext = photoFile.name.split(".").pop() ?? "jpg";
          const path = `${userId}/${activityId}.${ext}`;
          const { error } = await supabase.storage
            .from("sport-photos")
            .upload(path, photoFile, { upsert: true });
          if (!error) {
            await updateActivity(activityId, { photoUrl: path });
            photoUrl = path;
          }
        }
      }

      setSavedActivity({
        id: activityId,
        modality: data.modality,
        source: "gravado",
        title: finalTitle,
        note: note || undefined,
        startedAt: data.startedAt,
        endedAt: data.endedAt,
        activeDurationS,
        totalDurationS,
        distanceM,
        avgPaceSPerKm: avgPaceSPerKm ?? undefined,
        avgSpeedKmh: avgSpeedKmh ?? undefined,
        routeId: data.routeId,
        activityType,
        effortLevel,
        photoUrl,
        privacyHideRoute: false,
        privacyHideStartEnd: false,
        isPrivate: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    } finally {
      setSaving(false);
    }
  };

  if (savedActivity) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-5 bg-background px-6 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/15 text-2xl">
          ✓
        </div>
        <div>
          <p className="text-lg font-bold">Atividade salva</p>
          <p className="mt-1 text-sm text-muted-foreground">{savedActivity.title}</p>
        </div>
        <div className="flex w-full max-w-xs flex-col gap-2">
          <button
            onClick={() => setShareOpen(true)}
            className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-primary py-3 text-sm font-bold text-primary-foreground"
          >
            <Share2 className="h-4 w-4" /> Compartilhar
          </button>
          <button
            onClick={onSaved}
            className="w-full rounded-xl border border-border py-3 text-sm font-semibold text-foreground"
          >
            Concluir
          </button>
        </div>
        {shareOpen && (
          <ShareActivitySheet
            activity={savedActivity}
            points={data.points}
            onClose={() => setShareOpen(false)}
          />
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background px-5 pb-10 pt-12">
      <p className="text-xs font-semibold uppercase tracking-wider text-primary">
        Atividade concluída
      </p>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="mt-2 w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-xl font-bold outline-none focus:border-primary"
      />

      <RoutePreview points={data.points} className="mt-4 h-44" />

      <div className="mt-4 grid grid-cols-2 gap-2">
        <div className="rounded-xl bg-primary/10 p-3">
          <p className="text-xl font-bold text-primary">{formatDistanceKm(distanceM)}</p>
          <p className="text-[10px] uppercase text-muted-foreground">distância</p>
        </div>
        <div className="rounded-xl bg-surface-2 p-3">
          <p className="text-xl font-bold">{formatDurationClock(activeDurationS)}</p>
          <p className="text-[10px] uppercase text-muted-foreground">tempo ativo</p>
        </div>
        <div className="rounded-xl bg-surface-2 p-3">
          <p className="text-xl font-bold">{formatDurationClock(totalDurationS)}</p>
          <p className="text-[10px] uppercase text-muted-foreground">tempo total</p>
        </div>
        <div className="rounded-xl bg-surface-2 p-3">
          <p className="text-xl font-bold">
            {data.modality === "ciclismo" ? formatSpeedKmh(avgSpeedKmh) : formatPace(avgPaceSPerKm)}
          </p>
          <p className="text-[10px] uppercase text-muted-foreground">
            {data.modality === "ciclismo" ? "velocidade média" : "ritmo médio"}
          </p>
        </div>
      </div>

      <div className="mt-5">
        <p className="mb-1.5 text-[11px] uppercase text-muted-foreground">Tipo (opcional)</p>
        <div className="flex flex-wrap gap-1.5">
          {(Object.keys(activityTypeLabel) as ActivityType[]).map((type) => (
            <button
              key={type}
              onClick={() => setActivityType((v) => (v === type ? undefined : type))}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                activityType === type
                  ? "bg-primary text-primary-foreground"
                  : "border border-border text-muted-foreground"
              }`}
            >
              {activityTypeLabel[type]}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-3">
        <p className="mb-1.5 text-[11px] uppercase text-muted-foreground">
          Como foi o esforço (opcional)
        </p>
        <div className="flex flex-wrap gap-1.5">
          {(Object.keys(effortLevelLabel) as EffortLevel[]).map((level) => (
            <button
              key={level}
              onClick={() => setEffortLevel((v) => (v === level ? undefined : level))}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                effortLevel === level
                  ? "bg-primary text-primary-foreground"
                  : "border border-border text-muted-foreground"
              }`}
            >
              {effortLevelLabel[level]}
            </button>
          ))}
        </div>
      </div>

      <label className="mt-5 block text-sm">
        <span className="mb-1 block text-[11px] uppercase text-muted-foreground">
          Observação (opcional)
        </span>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          placeholder="Como foi essa atividade? O que você viu no caminho?"
          className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-primary"
        />
      </label>

      {photoPreviewUrl && (
        <img src={photoPreviewUrl} alt="" className="mt-3 h-40 w-full rounded-xl object-cover" />
      )}
      <label className="mt-3 flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-border py-2.5 text-xs text-muted-foreground hover:border-primary/40 hover:text-primary">
        <Camera className="h-3.5 w-3.5" />
        {photoFile ? "Trocar foto" : "Adicionar foto"}
        <input type="file" accept="image/*" className="hidden" onChange={onPhotoFile} />
      </label>

      <button
        disabled={saving}
        onClick={save}
        className="mt-6 w-full rounded-2xl bg-primary py-3.5 text-sm font-bold text-primary-foreground disabled:opacity-60"
      >
        {saving ? "Salvando…" : "Salvar atividade"}
      </button>
    </div>
  );
}
