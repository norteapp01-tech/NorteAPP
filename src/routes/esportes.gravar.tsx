import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { X, Volume2, VolumeX } from "lucide-react";
import { MapboxRouteMap } from "@/components/esportes/MapboxRouteMap";
import { useSportRecorder } from "@/lib/sport-recorder-context";
import {
  linkActivityToExecution,
  saveRecordedActivity,
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
  type SportModality,
} from "@/lib/sport-store";

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

  const activeModality = recorder.modality ?? modalidade;
  const isBusy = recorder.status === "recording" || recorder.status === "paused";

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
        <button
          disabled={!recorder.gpsReady}
          onClick={() => recorder.start(activeModality, execucao)}
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

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <div className="relative flex-1">
        <MapboxRouteMap points={recorder.points} />
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
  const [saving, setSaving] = useState(false);

  const distanceM = computeDistanceM(data.points);
  const { activeDurationS, totalDurationS } = computeDurations(
    data.startedAt,
    data.endedAt,
    data.pauses,
  );

  const save = async () => {
    setSaving(true);
    try {
      const activityId = await saveRecordedActivity({
        modality: data.modality,
        title: title.trim() || defaultTitle,
        note: note || undefined,
        startedAt: data.startedAt,
        endedAt: data.endedAt,
        points: data.points,
        pauses: data.pauses,
        executionId: data.executionId ?? executionId,
      });
      if (data.executionId ?? executionId) {
        await linkActivityToExecution(activityId, (data.executionId ?? executionId)!);
      }
      onSaved();
    } finally {
      setSaving(false);
    }
  };

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

      <div className="mt-5 grid grid-cols-2 gap-2">
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
            {data.modality === "ciclismo"
              ? formatSpeedKmh(computeSpeedKmh(distanceM, activeDurationS))
              : formatPace(computePaceSPerKm(distanceM, activeDurationS))}
          </p>
          <p className="text-[10px] uppercase text-muted-foreground">
            {data.modality === "ciclismo" ? "velocidade média" : "ritmo médio"}
          </p>
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
          className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-primary"
        />
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
