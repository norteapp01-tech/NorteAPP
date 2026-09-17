import { useMemo, useState } from "react";
import { TrendingUp } from "lucide-react";
import { formatDateShortBR, todayISO } from "@/lib/goals-store";
import { exerciseSeriesByLineage, useWorkoutStore } from "@/lib/workout-store";
import {
  cycleProgress,
  isManualGoal,
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
  const [selectedId, setSelectedId] = useState("");
  const today = todayISO();
  const block =
    blocks.find((b) => b.id === selectedId) ??
    blocks.find((b) => b.startDate <= today && b.endDate >= today) ??
    blocks[0];
  if (!block)
    return (
      <p className="text-sm text-muted-foreground">Crie uma etapa para acompanhar a evolução.</p>
    );
  return (
    <div className="space-y-4">
      <label className="block text-sm font-medium">
        Evolução da etapa
        <select
          aria-label="Etapa a acompanhar"
          value={block.id}
          onChange={(e) => setSelectedId(e.target.value)}
          className="mt-2 w-full rounded-xl border border-border bg-surface p-3"
        >
          {blocks.map((b, i) => (
            <option key={b.id} value={b.id}>
              {i + 1}. {b.name}
            </option>
          ))}
        </select>
      </label>
      <p className="text-xs text-muted-foreground">
        {formatDateShortBR(block.startDate)} — {formatDateShortBR(block.endDate)} · Registros desta
        etapa
      </p>
      <StageEvolution
        key={block.id}
        cycle={{ ...cycle, startDate: block.startDate, endDate: block.endDate }}
        blocks={[block]}
        evaluations={evaluations.filter((ev) => ev.goal.blockId === block.id)}
      />
    </div>
  );
}

function StageEvolution({
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
  const allSessions = useWorkoutStore((s) => s.sessions);
  const allExercises = useWorkoutStore((s) => s.exercises);
  const allWeights = useWorkoutStore((s) => s.bodyWeights);
  const planIds = new Set(
    blockPlans.filter((p) => blocks.some((b) => b.id === p.blockId)).map((p) => p.planId),
  );
  const sessions = allSessions.filter((s) => planIds.has(s.planId));
  const exercises = allExercises.filter((e) => planIds.has(e.planId));
  const weights = allWeights
    .filter((w) => w.date >= cycle.startDate && w.date <= cycle.endDate && w.date <= todayISO())
    .sort((a, b) => a.date.localeCompare(b.date));
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
    for (const session of sessions) {
      for (const exercise of session.plannedSnapshot ?? []) {
        const id = exercise.lineageId ?? exercise.exerciseId;
        if (!seen.has(id)) seen.set(id, exercise.name);
      }
    }
    return [...seen.entries()].map(([id, name]) => ({ id, name }));
  }, [exercises, sessions]);

  const selectedLineage = lineageId || exerciseOptions[0]?.id || "";
  const series = selectedLineage
    ? exerciseSeriesByLineage(sessions, exercises, selectedLineage)
    : [];
  const inCycle = series.filter(
    (p) => p.date >= cycle.startDate && p.date <= cycle.endDate && p.date <= today,
  );
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
            Defina uma meta na etapa, em Planejamento, para acompanhar seu alvo aqui.
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
          value={selectedLineage}
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

        {inCycle.length === 0 && (
          <p className="mt-2.5 text-sm text-muted-foreground">
            Nenhum registro deste exercício nesta etapa ainda.
          </p>
        )}

        {inCycle.length > 0 && (
          <>
            <p className="mt-3 text-sm">
              Primeiro registro: {inCycle[0].maxWeight} kg · Último:{" "}
              {inCycle[inCycle.length - 1].maxWeight} kg
            </p>
            {inCycle.length > 1 && (
              <p className="mt-1 text-sm text-primary">
                Variação de carga:{" "}
                {(inCycle[inCycle.length - 1].maxWeight - inCycle[0].maxWeight).toFixed(1)} kg
              </p>
            )}
            <ul className="mt-2.5 space-y-1">
              {inCycle.slice(-8).map((point) => (
                <li
                  key={`${point.date}-${inCycle.indexOf(point)}`}
                  className="flex items-center gap-2 text-[11px]"
                >
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

      <Card label="Peso corporal na etapa">
        {weights.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma pesagem registrada neste período.</p>
        ) : (
          <>
            <p className="text-sm">
              Primeiro registro: {weights[0].weight} kg · Último:{" "}
              {weights[weights.length - 1].weight} kg
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {formatDateShortBR(weights[0].date)} →{" "}
              {formatDateShortBR(weights[weights.length - 1].date)}
            </p>
            {weights.length > 1 ? (
              <p className="mt-2 text-sm">
                Variação: {(weights[weights.length - 1].weight - weights[0].weight).toFixed(1)} kg
              </p>
            ) : (
              <p className="mt-2 text-xs text-muted-foreground">
                Registre outra pesagem para comparar.
              </p>
            )}
          </>
        )}
      </Card>
      <p className="text-xs text-muted-foreground">
        Tempo de cardio ainda não é registrado separadamente dos treinos e não entra nesta
        comparação.
      </p>
    </div>
  );
}
