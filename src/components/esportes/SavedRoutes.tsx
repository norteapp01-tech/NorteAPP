import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ChevronRight, MapPin, Play, Route as RouteIcon } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { formatDateBR } from "@/lib/goals-store";
import { useSportRouteAttempts, useSportRoutes, type SportRoute } from "@/lib/sport-routes-data";
import {
  useSportStore,
  formatDistanceKm,
  formatDurationClock,
  formatPace,
  type SportModality,
} from "@/lib/sport-store";
import { routeStats, type RouteRun } from "@/lib/sport-analytics";
import { RoutePreview } from "./RoutePreview";

// ---------------------------------------------------------------------------
// Rotas salvas — o mesmo percurso repetido no tempo.
//
// O gráfico é UM só, com alternância entre tempo e ritmo. Mostrar os dois ao
// mesmo tempo seria redundante: numa distância fixa eles são praticamente a
// mesma curva, e duas linhas idênticas sugeririam duas informações.
// ---------------------------------------------------------------------------

export function SavedRoutesSection({ modality }: { modality: SportModality }) {
  const routes = useSportRoutes(modality);
  const [open, setOpen] = useState<SportRoute | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  return (
    <section className="sp-saved-routes">
      <div className="sp-routes-heading">
        <h3>Rotas salvas</h3>
        {routes.length > 2 && (
          <button onClick={() => setShowAll((value) => !value)} className="interactive-press">
            {showAll ? "Ver menos" : "Ver todas"} <ChevronRight aria-hidden />
          </button>
        )}
      </div>
      {routes.length === 0 ? (
        <div className="sp-routes-empty">
          <div className="sp-routes-map" aria-hidden>
            <svg viewBox="0 0 250 150">
              <path d="M30 112C58 105 59 55 101 75s47-31 88-22" />
              <circle cx="30" cy="112" r="7" />
              <circle cx="189" cy="53" r="7" />
            </svg>
            <MapPin className="sp-map-pin sp-map-pin--a" />
            <MapPin className="sp-map-pin sp-map-pin--b" />
          </div>
          <div className="sp-routes-empty-copy">
            <strong>Salve seus percursos favoritos</strong>
            <p>Ao concluir uma atividade, guarde a rota para repetir depois.</p>
            <button onClick={() => setHelpOpen(true)} className="interactive-press">
              Como funciona
            </button>
          </div>
        </div>
      ) : (
        <div className="sp-routes-list">
          {routes.slice(0, showAll ? routes.length : 2).map((route) => (
            <SavedRouteCard key={route.id} route={route} onOpen={() => setOpen(route)} />
          ))}
        </div>
      )}
      {open && <RouteDetailSheet route={open} onClose={() => setOpen(null)} />}
      {helpOpen && (
        <Modal title="Como salvar uma rota" onClose={() => setHelpOpen(false)}>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Inicie uma atividade com o GPS. Ao concluir, escolha salvar o percurso. Ele aparecerá
            aqui para você repetir e comparar seu desempenho nas próximas vezes.
          </p>
        </Modal>
      )}
    </section>
  );
}

function useRouteStats(route: SportRoute) {
  const attempts = useSportRouteAttempts();
  const activities = useSportStore((s) => s.activities);
  return useMemo(
    () => routeStats(route.id, attempts, activities),
    [route.id, attempts, activities],
  );
}

/** Abre a gravação já apontada para a rota — o percurso salvo aparece como
 * referência no mapa e a atividade nasce vinculada. */
function useRunRoute() {
  const navigate = useNavigate();
  return (route: SportRoute) =>
    navigate({ to: "/esportes/gravar", search: { modalidade: route.modality, rota: route.id } });
}

function SavedRouteCard({ route, onOpen }: { route: SportRoute; onOpen: () => void }) {
  const stats = useRouteStats(route);
  const runRoute = useRunRoute();

  return (
    <div className="sp-route-card">
      <button onClick={onOpen} className="interactive-press sp-route-open">
        <RoutePreview points={route.points} className="sp-route-preview" />
        <div className="sp-route-copy">
          <p>{route.title}</p>
          <span>
            {formatDistanceKm(route.distanceM)} ·{" "}
            {stats.count === 0
              ? "nenhuma execução"
              : `${stats.count} ${stats.count === 1 ? "execução" : "execuções"}`}
          </span>
          <span>
            {stats.last ? `Última: ${formatDateBR(stats.last.dateIso)}` : "Ainda não percorrida"}
          </span>
        </div>
        <ChevronRight aria-hidden />
      </button>
      <button
        onClick={() => runRoute(route)}
        aria-label={`Correr a rota ${route.title}`}
        className="interactive-press sp-route-play"
      >
        <Play className="h-4 w-4 fill-current" />
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Detalhe da rota
// ---------------------------------------------------------------------------

export function RouteDetailSheet({ route, onClose }: { route: SportRoute; onClose: () => void }) {
  const stats = useRouteStats(route);
  const runRoute = useRunRoute();
  const [mode, setMode] = useState<"tempo" | "ritmo">("tempo");

  return (
    <Modal
      title={route.title}
      onClose={onClose}
      footer={
        <button
          onClick={() => runRoute(route)}
          className="interactive-press flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-bold text-primary-foreground"
        >
          <Play className="h-4 w-4 fill-current" /> Correr esta rota
        </button>
      }
    >
      <RoutePreview points={route.points} className="h-40 w-full rounded-xl" />

      <div className="mt-3 grid grid-cols-2 gap-3">
        <Stat label="Distância" value={formatDistanceKm(route.distanceM)} />
        <Stat label="Vezes percorrida" value={stats.count === 0 ? "—" : String(stats.count)} />
        <Stat
          label="Último tempo"
          value={stats.last ? formatDurationClock(stats.last.activeDurationS) : "—"}
          note={stats.last ? formatDateBR(stats.last.dateIso) : "Sem execução"}
        />
        <Stat
          label="Melhor tempo"
          value={stats.best ? formatDurationClock(stats.best.activeDurationS) : "—"}
          note={stats.best ? formatDateBR(stats.best.dateIso) : undefined}
        />
      </div>
      <div className="mt-3">
        <Stat label="Melhor ritmo" value={formatPace(stats.bestPaceSPerKm)} />
      </div>

      {stats.count === 0 ? (
        <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
          Esta rota ainda não foi percorrida. Assim que houver uma execução, o tempo dela aparece
          aqui.
        </p>
      ) : (
        <>
          <div className="mt-5 flex items-center justify-between gap-2">
            <h3 className="norte-section-title mb-3">Evolução</h3>
            <div className="flex gap-1">
              {(["tempo", "ritmo"] as const).map((key) => (
                <button
                  key={key}
                  onClick={() => setMode(key)}
                  aria-pressed={mode === key}
                  className={`interactive-press rounded-md px-2.5 py-1 text-[11px] font-semibold capitalize ${
                    mode === key ? "bg-primary/15 text-primary" : "text-muted-foreground"
                  }`}
                >
                  {key}
                </button>
              ))}
            </div>
          </div>

          {stats.count === 1 ? (
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Uma execução registrada. Com duas dá para mostrar a evolução — por enquanto, o que
              existe é o resultado acima.
            </p>
          ) : (
            <TrendChart runs={stats.runs} mode={mode} />
          )}

          <h3 className="norte-section-title mb-3">Execuções</h3>
          <ul className="mt-2 space-y-1">
            {[...stats.runs].reverse().map((run) => (
              <li
                key={run.activityId}
                className="flex items-baseline justify-between gap-2 rounded-lg bg-surface-2 px-2.5 py-2 text-xs"
              >
                <span className="text-muted-foreground">{formatDateBR(run.dateIso)}</span>
                <span className="font-mono tabular-nums">
                  {formatDurationClock(run.activeDurationS)} · {formatPace(run.paceSPerKm)}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </Modal>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="font-mono text-base font-bold tabular-nums">{value}</p>
      {note && <p className="text-[10px] text-muted-foreground">{note}</p>}
    </div>
  );
}

/** Um gráfico só, alternado. Menor é melhor nos dois modos, então o eixo é
 * invertido igual ao ritmo da Visão geral. */
function TrendChart({ runs, mode }: { runs: RouteRun[]; mode: "tempo" | "ritmo" }) {
  const values = runs.map((r) => (mode === "tempo" ? r.activeDurationS : (r.paceSPerKm ?? 0)));
  const usable = runs.filter((_, i) => values[i] > 0);
  if (usable.length < 2) {
    return (
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        Sem dois registros comparáveis nesta métrica.
      </p>
    );
  }
  const vs = usable.map((r) => (mode === "tempo" ? r.activeDurationS : r.paceSPerKm!));
  const min = Math.min(...vs);
  const max = Math.max(...vs);
  const span = max - min || 1;
  const W = 300;
  const H = 96;
  const x = (i: number) => (i / (usable.length - 1)) * (W - 8) + 4;
  // Invertido: o melhor resultado (menor) fica no topo.
  const y = (v: number) => 12 + ((v - min) / span) * (H - 28);

  return (
    <div className="mt-2">
      <svg
        data-norte-chart="line"
        viewBox={`0 0 ${W} ${H}`}
        className="h-24 w-full"
        role="img"
        aria-label={`Evolução de ${mode}: ${usable
          .map(
            (r, i) =>
              `${formatDateBR(r.dateIso)} ${mode === "tempo" ? formatDurationClock(vs[i]) : formatPace(vs[i])}`,
          )
          .join(", ")}`}
      >
        <polyline
          data-series="true"
          points={usable.map((_, i) => `${x(i)},${y(vs[i])}`).join(" ")}
          fill="none"
          stroke="var(--color-primary)"
          strokeWidth="2"
          vectorEffect="non-scaling-stroke"
        />
        {usable.map((r, i) => (
          <circle key={r.activityId} cx={x(i)} cy={y(vs[i])} r="3.5" fill="var(--color-primary)" />
        ))}
      </svg>
      <div className="flex justify-between text-[10px] text-muted-foreground">
        <span>{formatDateBR(usable[0].dateIso)}</span>
        <span>melhor no topo</span>
        <span>{formatDateBR(usable.at(-1)!.dateIso)}</span>
      </div>
    </div>
  );
}

export { RouteIcon };
