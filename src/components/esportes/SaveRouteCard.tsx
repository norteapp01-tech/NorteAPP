import { useMemo, useState } from "react";
import { Check, MapPinned } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { linkRouteAttempt, saveRouteFromActivity, useSportRoutes } from "@/lib/sport-routes-data";
import { formatDistanceKm, type GeoPoint, type SportModality } from "@/lib/sport-store";
import { bestRouteMatch, type RouteCandidate } from "@/lib/sport-route-match";
import { RoutePreview } from "./RoutePreview";

// ---------------------------------------------------------------------------
// "Salvar esta rota", no fim da atividade.
//
// Regra que manda aqui: NADA é vinculado em silêncio. Quando o app acha uma
// rota parecida, ele diz qual é e oferece três saídas — confirmar, escolher
// outra ou salvar como nova. Vincular sozinho contaminaria os recordes de uma
// rota inteira sem a pessoa perceber.
//
// Salvar a rota também não interrompe a conclusão: o card vive ao lado do
// resto do fluxo e, salvo ou não, o botão de concluir continua onde estava.
// ---------------------------------------------------------------------------

export function SaveRouteCard({
  activityId,
  modality,
  points,
  distanceM,
  defaultTitle,
  /** Rota da qual a gravação partiu — já vinculada, então não há o que propor. */
  startedFromRouteId,
}: {
  activityId: string;
  modality: SportModality;
  points: GeoPoint[];
  distanceM: number;
  defaultTitle: string;
  startedFromRouteId?: string;
}) {
  const routes = useSportRoutes(modality);
  const [dialog, setDialog] = useState<"fechado" | "nomear" | "escolher">("fechado");
  const [savedLabel, setSavedLabel] = useState<string | null>(null);

  const candidates: RouteCandidate[] = useMemo(
    () =>
      routes.map((r) => ({
        id: r.id,
        modality: r.modality,
        title: r.title,
        points: r.points,
        distanceM: r.distanceM,
        startLat: r.startLat,
        startLng: r.startLng,
        endLat: r.endLat,
        endLng: r.endLng,
      })),
    [routes],
  );
  const match = useMemo(
    () => (startedFromRouteId ? null : bestRouteMatch(points, modality, candidates)),
    [points, modality, candidates, startedFromRouteId],
  );

  if (startedFromRouteId) {
    const route = routes.find((r) => r.id === startedFromRouteId);
    return <Done label={`Vinculada à rota ${route?.title ?? "escolhida"}`} />;
  }
  if (savedLabel) return <Done label={savedLabel} />;
  if (points.length < 2) return null;

  return (
    <div className="mt-4 rounded-xl border border-border bg-surface-2 p-3">
      <div className="flex items-center gap-3">
        <RoutePreview points={points} className="h-14 w-14 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold">Salvar esta rota</p>
          <p className="text-[11px] text-muted-foreground">
            {formatDistanceKm(distanceM)} · reutilize o percurso depois
          </p>
        </div>
      </div>

      {match && (
        <div className="mt-3 rounded-lg border border-primary/30 bg-primary/5 p-2.5">
          <p className="text-[11px] leading-relaxed">
            Esta corrida parece corresponder à rota{" "}
            <strong className="font-bold">{match.route.title}</strong>.
          </p>
          <p className="mt-0.5 text-[10px] text-muted-foreground">
            {match.reasons.join(" · ")}
            {!match.highConfidence && " · confirme antes, a semelhança não é forte."}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              onClick={async () => {
                await linkRouteAttempt(match.route.id, activityId, "confirmada");
                setSavedLabel(`Vinculada à rota ${match.route.title}`);
              }}
              className="interactive-press rounded-lg bg-primary px-3 py-1.5 text-[11px] font-bold text-primary-foreground"
            >
              É essa rota
            </button>
            {routes.length > 1 && (
              <button
                onClick={() => setDialog("escolher")}
                className="interactive-press rounded-lg border border-border px-3 py-1.5 text-[11px] font-semibold"
              >
                Escolher outra
              </button>
            )}
            <button
              onClick={() => setDialog("nomear")}
              className="interactive-press rounded-lg border border-border px-3 py-1.5 text-[11px] font-semibold"
            >
              Salvar como nova
            </button>
          </div>
        </div>
      )}

      {!match && (
        <button
          onClick={() => setDialog("nomear")}
          className="interactive-press mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl border border-primary py-2.5 text-xs font-bold text-primary"
        >
          <MapPinned className="h-4 w-4" /> Salvar esta rota
        </button>
      )}

      {dialog === "nomear" && (
        <NameRouteModal
          defaultTitle={defaultTitle}
          points={points}
          distanceM={distanceM}
          onClose={() => setDialog("fechado")}
          onSave={async (title) => {
            await saveRouteFromActivity({
              modality,
              title,
              points: points.map((p) => ({ lat: p.lat, lng: p.lng })),
              sourceActivityId: activityId,
              distanceM,
            });
            setDialog("fechado");
            setSavedLabel(`Rota "${title}" salva`);
          }}
        />
      )}

      {dialog === "escolher" && (
        <Modal title="Escolher rota" onClose={() => setDialog("fechado")}>
          <div className="space-y-2">
            {routes.map((route) => (
              <button
                key={route.id}
                onClick={async () => {
                  await linkRouteAttempt(route.id, activityId, "confirmada");
                  setDialog("fechado");
                  setSavedLabel(`Vinculada à rota ${route.title}`);
                }}
                className="card-surface flex w-full items-center gap-3 p-3 text-left hover:border-primary/40"
              >
                <RoutePreview points={route.points} className="h-12 w-12 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{route.title}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {formatDistanceKm(route.distanceM)}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </Modal>
      )}
    </div>
  );
}

function Done({ label }: { label: string }) {
  return (
    <p className="mt-4 flex items-center justify-center gap-1.5 text-xs font-semibold text-success">
      <Check className="h-4 w-4" /> {label}
    </p>
  );
}

function NameRouteModal({
  defaultTitle,
  points,
  distanceM,
  onClose,
  onSave,
}: {
  defaultTitle: string;
  points: GeoPoint[];
  distanceM: number;
  onClose: () => void;
  onSave: (title: string) => Promise<void>;
}) {
  const [title, setTitle] = useState(defaultTitle);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    const finalTitle = title.trim() || defaultTitle;
    setSaving(true);
    setError(null);
    try {
      await onSave(finalTitle);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível salvar a rota.");
      setSaving(false);
    }
  };

  return (
    <Modal
      title="Salvar rota"
      onClose={onClose}
      footer={
        <button
          onClick={submit}
          disabled={saving}
          className="interactive-press w-full rounded-xl bg-primary py-3 text-sm font-bold text-primary-foreground disabled:opacity-50"
        >
          {saving ? "Salvando…" : "Salvar rota"}
        </button>
      }
    >
      <RoutePreview points={points} className="h-36 w-full rounded-xl" />
      <p className="mt-2 text-center text-xs text-muted-foreground">
        {formatDistanceKm(distanceM)}
      </p>
      <label className="mt-4 block">
        <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Nome da rota
        </span>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Ex: Volta do parque"
          className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm outline-none focus:border-primary"
        />
      </label>
      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
    </Modal>
  );
}
