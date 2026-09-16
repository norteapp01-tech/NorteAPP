import { useMemo, useState } from "react";
import { TrendingUp } from "lucide-react";
import { formatDateShortBR, todayISO } from "@/lib/goals-store";
import {
  exerciseSeriesByLineage,
  finishedSessionsInRange,
  useWorkoutStore,
} from "@/lib/workout-store";
import {
  blockDurationDays,
  cycleProgress,
  daysOfBlock,
  isManualGoal,
  plannedSessionsInRange,
  stageState,
  useCycleStore,
  type CycleBlock,
  type GoalEvaluation,
  type WorkoutCycle,
} from "@/lib/workout-cycle-store";

// ---------------------------------------------------------------------------
// Evolução do ciclo — três coisas que NÃO se somam: tempo transcorrido,
// cumprimento dos treinos e alcance das metas. Uma etapa cuja data acabou não
// teve, por isso, seus treinos feitos nem suas metas atingidas.
//
// Sem histórico, nada é estimado: a tela diz que não há dado.
// ---------------------------------------------------------------------------

function Card({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="card-surface p-4">
      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <div className="mt-2.5">{children}</div>
    </div>
  );
}

export function CycleEvolution({
  cycle,
  blocks,
  evaluations,
}: {
  cycle: WorkoutCycle;
  blocks: CycleBlock[];
  evaluations: GoalEvaluation[];
}) {
  const blockDays = useCycleStore((s) => s.blockDays);
  const blockPlans = useCycleStore((s) => s.blockPlans);
  const sessions = useWorkoutStore((s) => s.sessions);
  const exercises = useWorkoutStore((s) => s.exercises);
  const [lineageId, setLineageId] = useState("");
  const today = todayISO();

  const progress = cycleProgress(cycle, blocks, blockDays, sessions, evaluations, today);
  const adherence =
    progress.plannedSessions > 0
      ? Math.round((progress.doneSessions / progress.plannedSessions) * 100)
      : null;

  const exerciseOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const e of [...exercises].sort((a, b) => a.name.localeCompare(b.name))) {
      if (!seen.has(e.lineageId)) seen.set(e.lineageId, e.name);
    }
    return [...seen.entries()].map(([id, name]) => ({ id, name }));
  }, [exercises]);

  const series = lineageId ? exerciseSeriesByLineage(sessions, exercises, lineageId) : [];
  const inCycle = series.filter((p) => p.date >= cycle.startDate && p.date <= cycle.endDate);
  const reached = evaluations.filter((e) => e.reached);
  const pending = evaluations.filter((e) => !e.reached);

  return (
    <div className="space-y-4">
      <Card label="Treinos realizados versus programados">
        <p className="font-mono text-3xl font-bold tabular-nums">
          {progress.doneSessions}
          <span className="text-lg text-muted-foreground">/{progress.plannedSessions}</span>
        </p>
        <p className="mt-1 text-[11px] text-muted-foreground">
          {adherence !== null
            ? `${adherence}% do que estava programado até hoje`
            : "Nenhum treino programado até aqui — nada a comparar."}
        </p>
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
          <div
            className="progress-fill h-full rounded-full bg-primary"
            style={{ width: `${Math.min(100, adherence ?? 0)}%` }}
          />
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
          {progress.elapsedDays} de {progress.totalDays} dias corridos. O prazo andar não é o mesmo
          que o treino ter sido feito.
        </p>
      </Card>

      <Card label="Metas">
        {evaluations.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhuma meta definida — sem meta, o ciclo mede só o que foi feito.
          </p>
        ) : (
          <>
            <p className="font-mono text-3xl font-bold tabular-nums">
              {reached.length}
              <span className="text-lg text-muted-foreground">/{evaluations.length}</span>
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">atingidas</p>
            {pending.length > 0 && (
              <ul className="mt-2.5 space-y-1">
                {pending.map((ev) => (
                  <li
                    key={ev.goal.id}
                    className="flex items-center justify-between gap-2 text-[11px]"
                  >
                    <span className="min-w-0 truncate">{ev.goal.title || "Meta"}</span>
                    <span className="shrink-0 text-muted-foreground">
                      {ev.hasData
                        ? `${Math.round(ev.progress * 100)}%`
                        : isManualGoal(ev.goal.kind)
                          ? "sem registro"
                          : "sem dado"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </Card>

      <Card label="Evolução de um exercício">
        <select
          value={lineageId}
          onChange={(e) => setLineageId(e.target.value)}
          aria-label="Exercício a acompanhar"
          className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
        >
          <option value="">Escolha um exercício…</option>
          {exerciseOptions.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>

        {lineageId && inCycle.length === 0 && (
          <p className="mt-2.5 text-sm text-muted-foreground">
            Nenhum registro deste exercício dentro do ciclo ainda.
          </p>
        )}

        {inCycle.length > 0 && (
          <>
            <ul className="mt-2.5 space-y-1">
              {inCycle.slice(-8).map((point) => (
                <li key={point.date} className="flex items-center gap-2 text-[11px]">
                  <span className="w-16 shrink-0 text-muted-foreground">
                    {formatDateShortBR(point.date)}
                  </span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2">
                    <div
                      className="progress-fill h-full rounded-full bg-primary"
                      style={{
                        width: `${Math.round((point.maxWeight / Math.max(...inCycle.map((p) => p.maxWeight))) * 100)}%`,
                      }}
                    />
                  </div>
                  <span className="w-12 shrink-0 text-right font-mono tabular-nums">
                    {point.maxWeight}kg
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-2 flex items-start gap-1.5 text-[11px] leading-relaxed text-muted-foreground">
              <TrendingUp className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Carga máxima por sessão. Subir o peso sozinho não prova melhora — compare junto com as
              repetições e o número de séries registrados no treino.
            </p>
          </>
        )}
      </Card>

      <Card label="Resumo por etapa">
        <ul className="space-y-2">
          {blocks.map((block) => {
            const until = today < block.endDate ? today : block.endDate;
            const planned =
              until < block.startDate
                ? 0
                : plannedSessionsInRange(blocks, blockDays, block.startDate, until);
            const done =
              until < block.startDate
                ? 0
                : finishedSessionsInRange(sessions, block.startDate, until).length;
            const state = stageState(block, blockPlans, today);
            return (
              <li
                key={block.id}
                className="flex items-center justify-between gap-2 rounded-lg border border-border bg-surface-2 p-2.5"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{block.name}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {formatDateShortBR(block.startDate)} — {formatDateShortBR(block.endDate)} ·{" "}
                    {blockDurationDays(block)} dias · {state}
                  </p>
                </div>
                <span className="shrink-0 font-mono text-sm font-bold tabular-nums">
                  {done}
                  <span className="text-muted-foreground">/{planned}</span>
                </span>
              </li>
            );
          })}
        </ul>
        {blocks.some((b) => daysOfBlock(blockDays, b.id).length === 0) && (
          <p className="mt-2 text-[11px] text-muted-foreground">
            Etapas sem dias marcados não programam treino — por isso aparecem com 0 no denominador,
            e não como 100% cumpridas.
          </p>
        )}
      </Card>
    </div>
  );
}
