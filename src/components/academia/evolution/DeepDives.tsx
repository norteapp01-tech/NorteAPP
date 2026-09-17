import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronDown, Trophy } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { formatDateShortBR, todayISO } from "@/lib/goals-store";
import type { BodyWeightEntry, Exercise, WorkoutPlan, WorkoutSession } from "@/lib/workout-store";
import {
  blockOn,
  blocksForCycle,
  cycleGoalKindLabel,
  evaluateCycleGoal,
  isManualGoal,
  type BodyMeasurement,
  type CycleBlock,
  type CycleGoal,
  type WorkoutCycle,
} from "@/lib/workout-cycle-store";
import {
  personalRecords,
  resolveSets,
  type FilteredData,
  type PersonalRecord,
} from "@/lib/workout-evolution";
import { EmptyNote } from "./shared";

// ---------------------------------------------------------------------------
// Aprofundamentos: conquistas, metas e peso corporal, recolhidos por padrão.
// São detalhes sob demanda, não a primeira coisa a ler.
// ---------------------------------------------------------------------------

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <section className="card-surface p-4">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 text-left"
      >
        <div className="min-w-0 flex-1">
          <h2 className="text-[13px] font-bold">{title}</h2>
          <p className="text-[11px] text-muted-foreground">{subtitle}</p>
        </div>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && <div className="mt-3 border-t border-border pt-3">{children}</div>}
    </section>
  );
}

export function DeepDives({
  data,
  allSessions,
  exercises,
  plans,
  bodyWeights,
  cycles,
  blocks,
  cycleGoals,
  measurements,
  stage,
  cycle,
}: {
  data: FilteredData;
  allSessions: WorkoutSession[];
  exercises: Exercise[];
  plans: WorkoutPlan[];
  bodyWeights: BodyWeightEntry[];
  cycles: WorkoutCycle[];
  blocks: CycleBlock[];
  cycleGoals: CycleGoal[];
  measurements: BodyMeasurement[];
  stage?: CycleBlock;
  cycle?: WorkoutCycle;
}) {
  // Recordes comparam com TODO o histórico, não só com o período visível —
  // senão encurtar a janela fabricaria recordes.
  const allSets = useMemo(
    () => resolveSets(allSessions, exercises, plans),
    [allSessions, exercises, plans],
  );
  const records = useMemo(
    () => personalRecords(allSets, data.effectiveRange),
    [allSets, data.effectiveRange],
  );

  return (
    <div className="space-y-3">
      <AchievementsSection records={records} allSets={allSets} />
      <GoalsSection
        cycles={cycles}
        blocks={blocks}
        cycleGoals={cycleGoals}
        measurements={measurements}
        allSessions={allSessions}
        exercises={exercises}
        bodyWeights={bodyWeights}
        stage={stage}
        cycle={cycle}
      />
      <BodyWeightSection bodyWeights={bodyWeights} range={data.effectiveRange} stage={stage} />
    </div>
  );
}

function AchievementsSection({
  records,
  allSets,
}: {
  records: PersonalRecord[];
  allSets: ReturnType<typeof resolveSets>;
}) {
  const [open, setOpen] = useState<PersonalRecord | null>(null);
  return (
    <>
      <Section
        title="Conquistas"
        subtitle={
          records.length > 0
            ? `${records.length} recorde(s) pessoal(is) no período`
            : "Nenhum recorde novo no período"
        }
      >
        {records.length === 0 ? (
          <EmptyNote>
            Um recorde é mais carga com as mesmas repetições, ou mais repetições com a mesma carga,
            comparado com todo o seu histórico anterior. Empate não conta, e o primeiro registro de
            um exercício estabelece a referência em vez de virar recorde.
          </EmptyNote>
        ) : (
          <ul className="space-y-1.5">
            {records.map((r) => (
              <li key={`${r.sessionId}-${r.lineageId}`}>
                <button
                  onClick={() => setOpen(r)}
                  className="interactive-press flex w-full items-center gap-2 rounded-lg border border-border bg-surface-2 px-2.5 py-2 text-left"
                >
                  <Trophy className="h-4 w-4 shrink-0 text-primary" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold">{r.name}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {r.kind === "carga"
                        ? `${r.weight} kg com ${r.reps} repetições — antes ${r.previousWeight} kg`
                        : `${r.reps} repetições com ${r.weight} kg — antes ${r.previousReps}`}
                    </p>
                  </div>
                  <span className="shrink-0 text-[10px] text-muted-foreground">
                    {formatDateShortBR(r.date)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {open && (
        <Modal onClose={() => setOpen(null)} title={open.name}>
          <p className="text-xs text-muted-foreground">
            {formatDateShortBR(open.date)} ·{" "}
            {open.kind === "carga"
              ? `carga anterior: ${open.previousWeight} kg em ${open.reps} repetições`
              : `melhor anterior: ${open.previousReps} repetições com ${open.weight} kg`}
          </p>
          <p className="mt-3 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            Séries desta sessão
          </p>
          <ul className="mt-1.5 space-y-1">
            {allSets
              .filter((s) => s.sessionId === open.sessionId && s.lineageId === open.lineageId)
              .map((s) => (
                <li
                  key={s.setIndex}
                  className="flex justify-between gap-2 rounded-lg border border-border bg-surface-2 px-2.5 py-2 text-xs"
                >
                  <span className="text-muted-foreground">Série {s.setIndex + 1}</span>
                  <span className="font-mono tabular-nums">
                    {s.weight} kg × {s.reps}
                  </span>
                </li>
              ))}
          </ul>
          <p className="mt-3 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            Melhor registro anterior
          </p>
          <ul className="mt-1.5 space-y-1">
            {allSets
              .filter(
                (s) =>
                  s.lineageId === open.lineageId &&
                  s.date < open.date &&
                  (open.kind === "carga" ? s.reps === open.reps : s.weight === open.weight),
              )
              .sort((a, b) => (open.kind === "carga" ? b.weight - a.weight : b.reps - a.reps))
              .slice(0, 3)
              .map((s) => (
                <li
                  key={`${s.sessionId}-${s.setIndex}`}
                  className="flex justify-between gap-2 rounded-lg border border-border px-2.5 py-2 text-xs"
                >
                  <span className="text-muted-foreground">{formatDateShortBR(s.date)}</span>
                  <span className="font-mono tabular-nums">
                    {s.weight} kg × {s.reps}
                  </span>
                </li>
              ))}
          </ul>
        </Modal>
      )}
    </>
  );
}

function GoalsSection({
  cycles,
  blocks,
  cycleGoals,
  measurements,
  allSessions,
  exercises,
  bodyWeights,
  stage,
  cycle,
}: {
  cycles: WorkoutCycle[];
  blocks: CycleBlock[];
  cycleGoals: CycleGoal[];
  measurements: BodyMeasurement[];
  allSessions: WorkoutSession[];
  exercises: Exercise[];
  bodyWeights: BodyWeightEntry[];
  stage?: CycleBlock;
  cycle?: WorkoutCycle;
}) {
  const today = todayISO();
  // Sem filtro de etapa, mostra as metas das etapas VIGENTES, dizendo de onde
  // cada uma vem.
  const relevant = useMemo(() => {
    if (stage)
      return cycleGoals.filter(
        (g) => g.blockId === stage.id || (!g.blockId && cycle && g.cycleId === cycle.id),
      );
    const currentStages = cycles
      .filter((c) => c.status === "ativo")
      .flatMap((c) => {
        const current = blockOn(blocksForCycle(blocks, c.id), today);
        return current ? [current] : [];
      });
    const stageIds = new Set(currentStages.map((b) => b.id));
    const cycleIds = new Set(currentStages.map((b) => b.cycleId));
    return cycleGoals.filter(
      (g) => (g.blockId && stageIds.has(g.blockId)) || (!g.blockId && cycleIds.has(g.cycleId)),
    );
  }, [cycleGoals, stage, cycle, cycles, blocks, today]);

  const evaluations = relevant.map((goal) => {
    const owner = cycles.find((c) => c.id === goal.cycleId);
    const stageOf = goal.blockId ? blocks.find((b) => b.id === goal.blockId) : undefined;
    return {
      goal,
      owner,
      stageOf,
      evaluation: owner
        ? evaluateCycleGoal(goal, {
            cycle: owner,
            blocks: blocksForCycle(blocks, owner.id),
            blockDays: [],
            sessions: allSessions,
            exercises,
            bodyWeights,
            measurements,
          })
        : null,
    };
  });

  return (
    <Section
      title="Metas"
      subtitle={
        evaluations.length > 0
          ? `${evaluations.filter((e) => e.evaluation?.reached).length} de ${evaluations.length} atingidas`
          : "Nenhuma meta nas etapas vigentes"
      }
    >
      {evaluations.length === 0 ? (
        <EmptyNote>
          Metas são cadastradas dentro das etapas do planejamento. Sem etapa vigente, não há meta
          para acompanhar aqui.
        </EmptyNote>
      ) : (
        <ul className="space-y-1.5">
          {evaluations.map(({ goal, owner, stageOf, evaluation }) => (
            <li key={goal.id} className="rounded-lg border border-border bg-surface-2 px-2.5 py-2">
              <div className="flex items-baseline justify-between gap-2">
                <p className="min-w-0 truncate text-xs font-semibold">
                  {goal.title || cycleGoalKindLabel[goal.kind]}
                  {isManualGoal(goal.kind) && (
                    <span className="ml-1.5 rounded-full bg-surface px-1.5 py-0.5 text-[9px] font-bold uppercase text-muted-foreground">
                      manual
                    </span>
                  )}
                </p>
                {goal.kind !== "descritiva" && evaluation && (
                  <span className="shrink-0 font-mono text-[11px] tabular-nums">
                    {evaluation.hasData ? evaluation.current : "—"}
                    <span className="text-muted-foreground">/{goal.targetValue}</span>
                  </span>
                )}
              </div>
              <p className="text-[10px] text-muted-foreground">
                {stageOf ? stageOf.name : owner ? `${owner.name} (ciclo inteiro)` : "—"}
                {goal.deadline ? ` · até ${formatDateShortBR(goal.deadline)}` : ""}
                {" · início "}
                {goal.startValue}
                {evaluation && !evaluation.hasData && " · sem registro comprovando"}
              </p>
              {owner?.goalId && (
                <Link
                  to="/ciclo/$id"
                  params={{ id: owner.id }}
                  className="interactive-press mt-1 inline-block text-[10px] font-semibold text-primary underline"
                >
                  abrir etapa
                </Link>
              )}
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

function BodyWeightSection({
  bodyWeights,
  range,
  stage,
}: {
  bodyWeights: BodyWeightEntry[];
  range: { from: string; to: string };
  stage?: CycleBlock;
}) {
  const inRange = bodyWeights
    .filter((b) => b.date >= range.from && b.date <= range.to)
    .sort((a, b) => a.date.localeCompare(b.date));
  const first = inRange[0];
  const last = inRange.at(-1);
  const delta =
    first && last && first.id !== last.id
      ? Math.round((last.weight - first.weight) * 10) / 10
      : undefined;

  return (
    <Section
      title="Peso corporal"
      subtitle={
        inRange.length > 0
          ? `${inRange.length} pesagem(ns) no período`
          : "Sem pesagens registradas no período"
      }
    >
      {inRange.length === 0 ? (
        <EmptyNote>
          Nenhuma pesagem registrada entre {formatDateShortBR(range.from)} e{" "}
          {formatDateShortBR(range.to)}. Você registra o peso na aba Treino.
        </EmptyNote>
      ) : (
        <>
          <div className="flex items-baseline gap-3">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Primeiro</p>
              <p className="font-mono text-lg font-bold tabular-nums">{first!.weight} kg</p>
              <p className="text-[10px] text-muted-foreground">{formatDateShortBR(first!.date)}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Último</p>
              <p className="font-mono text-lg font-bold tabular-nums">{last!.weight} kg</p>
              <p className="text-[10px] text-muted-foreground">{formatDateShortBR(last!.date)}</p>
            </div>
            {delta !== undefined && (
              <div className="ml-auto text-right">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Variação
                </p>
                {/* Sem cor de "bom" ou "ruim": o app não sabe qual direção é o
                    objetivo desta pessoa. */}
                <p className="font-mono text-lg font-bold tabular-nums">
                  {delta > 0 ? "+" : ""}
                  {delta} kg
                </p>
              </div>
            )}
          </div>

          <ul className="mt-3 space-y-1">
            {inRange.map((entry) => (
              <li
                key={entry.id}
                className="flex justify-between gap-2 rounded-lg border border-border px-2.5 py-1.5 text-[11px]"
              >
                <span className="text-muted-foreground">{formatDateShortBR(entry.date)}</span>
                <span className="font-mono tabular-nums">{entry.weight} kg</span>
              </li>
            ))}
          </ul>
        </>
      )}

      <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
        Filtros de exercício, treino e músculo não se aplicam às pesagens — só o período
        {stage ? " e a etapa" : ""} delimitam estas datas.
      </p>
    </Section>
  );
}
