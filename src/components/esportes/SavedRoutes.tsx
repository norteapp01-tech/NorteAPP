import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ChevronRight, Play, Route as RouteIcon } from "lucide-react";
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

  return (
    <section>
      <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
        Rotas salvas
      </h3>
      {routes.length === 0 ? (
        <p className="text-sm leading-relaxed text-muted-foreground">
          Nenhuma rota salva ainda. Ao concluir uma atividade gravada você pode salvar o percurso
          para repetir depois.
        </p>
      ) : (
        <div className="space-y-2">
          {routes.map((route) => (
            <SavedRouteCard key={route.id} route={route} onOpen={() => setOpen(route)} />
          ))}
        </div>
      )}
      {open && <RouteDetailSheet route={open} onClose={() => setOpen(null)} />}
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
    <div className="card-surface flex items-center gap-3 p-3">
      <button
        onClick={onOpen}
        className="interactive-press flex min-w-0 flex-1 items-center gap-3 text-left"
      >
        <RoutePreview points={route.points} className="h-14 w-14 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold">{route.title}</p>
          <p className="truncate text-[11px] text-muted-foreground">
            {formatDistanceKm(route.distanceM)} ·{" "}
            {stats.count === 0
              ? "nenhuma execução"
              : `${stats.count} ${stats.count === 1 ? "execução" : "execuções"}`}
          </p>
          <p className="truncate text-[11px] text-muted-foreground">
            {stats.last ? `Última: ${formatDateBR(stats.last.dateIso)}` : "Ainda não percorrida"}
          </p>
        </div>
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
      </button>
      <button
        onClick={() => runRoute(route)}
        aria-label={`Correr a rota ${route.title}`}
        className="interactive-press flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground"
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
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              Evolução
            </h3>
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

          <h3 className="mt-5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            Execuções
          </h3>
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
