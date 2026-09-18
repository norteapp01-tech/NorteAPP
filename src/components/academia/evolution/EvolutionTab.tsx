import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, ListFilter, X } from "lucide-react";
import { addDays, formatDateShortBR, todayISO, toISODate } from "@/lib/goals-store";
import { useWorkoutLoading, useWorkoutStore, type MuscleGroup } from "@/lib/workout-store";
import {
  activeCycle,
  blockOn,
  blocksForCycle,
  daysOfBlock,
  plannedSessionsInRange,
  useCycleStore,
} from "@/lib/workout-cycle-store";
import {
  applyFilters,
  attentionPoints,
  frequency,
  loadProgressions,
  muscleGroupLabel,
  muscleStimulus,
  personalRecords,
  previousRange,
  rangeOfLastDays,
  resolveSets,
  UNCLASSIFIED,
  type AttentionPoint,
  type DateRange,
  type EvolutionFilters,
} from "@/lib/workout-evolution";
import {
  comparabilityKeyOf,
  exerciseEvolutions,
  muscleEvolutions,
  nextPlannedDateForMuscle,
  progressionIndicator,
  PROLONGED_STABILITY_SESSIONS,
  type ExerciseEvolution,
  type NextStep,
} from "@/lib/workout-explorer";
import { BodyAtlas, type BodyMode } from "./BodyAtlas";
import { MuscleAnalysis } from "./MuscleAnalysis";
import { Indicators } from "./Indicators";
import { AttentionCard } from "./AttentionCard";
import { RadarDistribution } from "./RadarDistribution";
import { MeasurementsCard } from "./MeasurementsCard";
import { EvolutionFilterSheet } from "./FilterDrawer";
import { Disclosure, ModuleCard, SkeletonBlock } from "./shared";
import "./evolution.css";

// ---------------------------------------------------------------------------
// Evolução da Academia — UM explorador contínuo: corpo → músculo → exercício →
// sessões.
//
// As subabas "Corpo" e "Desempenho" acabaram. Tudo que estava em Desempenho
// (gráficos, comparações por referência, recordes, histórico de séries) passou
// para dentro da análise do músculo e do exercício, que é onde a pergunta
// nasce. Nada foi removido: o que é menos usado ficou em "Mais análises".
//
// A página abre curta de propósito — filtros, três indicadores e o corpo. O
// detalhe aparece conforme a pessoa escolhe.
//
// Os filtros globais (período, programa, etapa) valem para TUDO. Selecionar
// músculo ou exercício nunca mexe no período escolhido.
// ---------------------------------------------------------------------------

type Preset = "7" | "30" | "90" | "365" | "custom";

const PRESETS: { key: Preset; label: string; days: number }[] = [
  { key: "7", label: "7 dias", days: 7 },
  { key: "30", label: "30 dias", days: 30 },
  { key: "90", label: "3 meses", days: 90 },
  { key: "365", label: "1 ano", days: 365 },
];

/** Quantos dias à frente procuramos o próximo treino do músculo. */
const LOOKAHEAD_DAYS = 14;

export function EvolutionTab({
  initialStageId,
  onReviewNext,
}: {
  initialStageId?: string;
  onReviewNext?: () => void;
}) {
  const sessions = useWorkoutStore((s) => s.sessions);
  const exercises = useWorkoutStore((s) => s.exercises);
  const plans = useWorkoutStore((s) => s.plans);
  const bodyWeights = useWorkoutStore((s) => s.bodyWeights);
  const weeklyAssignment = useWorkoutStore((s) => s.weeklyAssignment);
  const cycles = useCycleStore((s) => s.cycles);
  const blocks = useCycleStore((s) => s.blocks);
  const blockPlans = useCycleStore((s) => s.blockPlans);
  const blockDays = useCycleStore((s) => s.blockDays);
  const measurements = useCycleStore((s) => s.measurements);
  const loading = useWorkoutLoading();

  const initialStage = initialStageId ? blocks.find((b) => b.id === initialStageId) : undefined;
  const [preset, setPreset] = useState<Preset>(initialStage ? "custom" : "30");
  const [custom, setCustom] = useState<DateRange>(() =>
    initialStage ? { from: initialStage.startDate, to: initialStage.endDate } : rangeOfLastDays(30),
  );
  const [cycleId, setCycleId] = useState(initialStage?.cycleId ?? "");
  const [stageId, setStageId] = useState(initialStageId ?? "");
  const [filterOpen, setFilterOpen] = useState(false);
  const [mode, setMode] = useState<BodyMode>("estimulo");
  const [muscle, setMuscle] = useState<MuscleGroup | null>(null);
  const [exercisesOpen, setExercisesOpen] = useState(false);
  const [openExerciseKey, setOpenExerciseKey] = useState<string | null>(null);
  const analysisRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (initialStageId) setStageId(initialStageId);
  }, [initialStageId]);

  const cycle = cycles.find((c) => c.id === cycleId);
  const stage = blocks.find((b) => b.id === stageId);
  const scope = stage ? { from: stage.startDate, to: stage.endDate } : undefined;
  const range =
    preset === "custom"
      ? custom
      : rangeOfLastDays(PRESETS.find((p) => p.key === preset)?.days ?? 30);

  // Uma etapa filtra pelos treinos DELA, não por qualquer sessão nas mesmas
  // datas.
  const planLineageIds = useMemo(() => {
    const ids = stage
      ? blockPlans.filter((bp) => bp.blockId === stage.id).map((bp) => bp.planId)
      : cycle
        ? blocksForCycle(blocks, cycle.id).flatMap((b) =>
            blockPlans.filter((bp) => bp.blockId === b.id).map((bp) => bp.planId),
          )
        : [];
    if (ids.length === 0) return undefined;
    return [
      ...new Set(ids.map((id) => plans.find((p) => p.id === id)?.lineageId).filter(Boolean)),
    ] as string[];
  }, [stage, cycle, blocks, blockPlans, plans]);

  const filters: EvolutionFilters = { range, scope, planLineageIds };
  const filterKey = JSON.stringify(filters);
  const data = useMemo(
    () => applyFilters(sessions, exercises, plans, filters),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sessions, exercises, plans, filterKey],
  );

  // Período anterior de mesma duração — só quando ele cabe dentro da etapa
  // escolhida, senão a comparação sairia do recorte.
  const previous = useMemo(() => {
    const before = previousRange(data.effectiveRange);
    if (scope && before.from < scope.from) return null;
    return applyFilters(sessions, exercises, plans, { ...filters, range: before });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessions, exercises, plans, filterKey, data.effectiveRange]);

  const stimulus = useMemo(() => muscleStimulus(data.sets), [data.sets]);
  const evolution = useMemo(() => muscleEvolutions(data.sets), [data.sets]);
  const progression = useMemo(() => progressionIndicator(data.sets), [data.sets]);

  // Recordes olham TODO o histórico anterior à sessão, não só o período
  // visível — senão encurtar a janela fabricaria recordes.
  const records = useMemo(() => {
    const scoped = new Set(data.sessions.map((s) => s.id));
    return personalRecords(
      resolveSets(sessions, exercises, plans),
      data.effectiveRange,
      Number.MAX_SAFE_INTEGER,
    ).filter((r) => scoped.has(r.sessionId));
  }, [sessions, exercises, plans, data]);

  // Programação histórica: só as etapas do ciclo têm datas fixas. A escala
  // semanal solta é estado ATUAL e não pode dizer o que estava previsto há dois
  // meses — sem ela, o indicador mostra o realizado, sem porcentagem.
  const plannedCount = useMemo(() => {
    const relevant = cycle
      ? blocksForCycle(blocks, cycle.id)
      : blocks.filter((b) => cycles.some((c) => c.id === b.cycleId));
    const scoped = stage ? [stage] : relevant;
    const withDays = scoped.filter((b) => daysOfBlock(blockDays, b.id).some((d) => d.planId));
    if (withDays.length === 0) return null;
    return plannedSessionsInRange(
      withDays,
      blockDays,
      data.effectiveRange.from,
      data.effectiveRange.to,
    );
  }, [cycle, stage, blocks, blockDays, cycles, data.effectiveRange]);

  const freq = frequency(data, plannedCount);

  // Próximos dias programados e quais músculos cada um trabalha. Aqui a escala
  // semanal PODE ser usada: ela descreve o futuro, que é o que ela é.
  const plannedDays = useMemo(() => {
    const today = todayISO();
    const running = activeCycle(cycles);
    const out: { date: string; muscleGroups: MuscleGroup[] }[] = [];
    for (let i = 0; i <= LOOKAHEAD_DAYS; i++) {
      const date = toISODate(addDays(new Date(today + "T00:00:00"), i));
      const weekday = new Date(date + "T12:00:00").getDay();
      let planId: string | null = null;
      if (running) {
        const block = blockOn(blocksForCycle(blocks, running.id), date);
        planId = block
          ? (blockDays.find((d) => d.blockId === block.id && d.weekday === weekday)?.planId ?? null)
          : null;
      } else {
        planId = weeklyAssignment[weekday] ?? null;
      }
      if (!planId) continue;
      const groups = exercises
        .filter((e) => e.planId === planId && e.muscleGroup)
        .map((e) => e.muscleGroup!);
      out.push({ date, muscleGroups: [...new Set(groups)] });
    }
    return out;
  }, [cycles, blocks, blockDays, weeklyAssignment, exercises]);

  // Pontos de atenção gerais: os do explorador (queda e estabilidade) primeiro,
  // depois os antigos (progressão em destaque, frequência, músculo parado).
  const points: AttentionPoint[] = useMemo(() => {
    const fromExercises: AttentionPoint[] = progression.attention.slice(0, 2).map((e) => ({
      id: `exercicio-${e.key}`,
      tone: "alerta",
      text:
        e.status === "queda"
          ? `${e.name}: redução registrada de ${Math.abs(e.pct!).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% no período.`
          : `${e.name} manteve a mesma referência em ${e.stableStreak} sessões.`,
      target: { kind: "exercicio", lineageId: e.lineageId },
    }));
    const legacy = attentionPoints(
      data,
      loadProgressions(data.sets, 5),
      stimulus,
      freq,
      todayISO(),
    );
    return [...fromExercises, ...legacy].slice(0, 3);
  }, [progression, data, stimulus, freq]);

  const chips: { label: string; onRemove: () => void }[] = [];
  if (cycle)
    chips.push({
      label: `Programa: ${cycle.name}`,
      onRemove: () => {
        setCycleId("");
        setStageId("");
      },
    });
  if (stage) chips.push({ label: `Etapa: ${stage.name}`, onRemove: () => setStageId("") });
  if (muscle)
    chips.push({
      label: `Músculo: ${muscleGroupLabel[muscle]}`,
      onRemove: () => selectMuscle(null),
    });

  /** Trocar de músculo fecha o exercício aberto: um só por vez, sempre. */
  function selectMuscle(next: MuscleGroup | null) {
    setMuscle(next);
    setOpenExerciseKey(null);
    if (!next) setExercisesOpen(false);
  }

  const scrollToAnalysis = () => {
    window.setTimeout(() => {
      analysisRef.current?.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "instant"
          : "smooth",
        // "start" esconderia o corpo; "center" mantém parte da figura visível.
        block: "center",
      });
    }, 60);
  };

  /** Atalho completo: seleciona o músculo, abre a gaveta, expande o exercício
   * e rola até a análise. */
  const focusExercise = (lineageId: string) => {
    const found = exerciseEvolutions(data.sets).find((e) => e.lineageId === lineageId);
    if (!found) return;
    if (found.muscleGroup) setMuscle(found.muscleGroup);
    setExercisesOpen(true);
    setOpenExerciseKey(found.key);
    scrollToAnalysis();
  };

  const openAttention = (point: AttentionPoint) => {
    if (point.target.kind === "exercicio") {
      focusExercise(point.target.lineageId);
      return;
    }
    if (point.target.kind === "musculo" && point.target.group !== UNCLASSIFIED) {
      selectMuscle(point.target.group as MuscleGroup);
      scrollToAnalysis();
      return;
    }
    onReviewNext?.();
  };

  const runNextStep = (step: NextStep) => {
    if (!step.action) return;
    if (step.action.kind === "exercicio") focusExercise(step.action.lineageId);
    else onReviewNext?.();
  };

  const clearAll = () => {
    setCycleId("");
    setStageId("");
    selectMuscle(null);
    setPreset("30");
  };

  if (loading) {
    return (
      <div className="space-y-3">
        <SkeletonBlock height={78} />
        <SkeletonBlock height={96} />
        <SkeletonBlock height={420} />
      </div>
    );
  }

  const empty = data.sessions.length === 0;
  const classified = data.sets.some((s) => s.muscleGroup);

  return (
    <div className="evolution-dashboard space-y-3 pb-6">
      {/* 1. filtros globais ---------------------------------------------- */}
      <section>
        <div className="evo-period">
          <div className="evo-period-group">
            {PRESETS.map((p) => (
              <button
                key={p.key}
                onClick={() => setPreset(p.key)}
                aria-pressed={preset === p.key}
                className="interactive-press"
              >
                {p.label}
              </button>
            ))}
          </div>
          <button
            onClick={() => setPreset("custom")}
            aria-pressed={preset === "custom"}
            className="evo-custom"
          >
            <CalendarDays size={15} />
            <span>Personalizar</span>
          </button>
        </div>

        {preset === "custom" && (
          <div className="mt-2 flex items-center gap-2">
            <input
              type="date"
              value={custom.from}
              aria-label="Início do período"
              onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value || c.from }))}
              className="min-w-0 flex-1 rounded-md border border-border bg-surface px-2 py-1.5 text-xs outline-none focus:border-primary"
            />
            <span className="text-[11px] text-muted-foreground">até</span>
            <input
              type="date"
              value={custom.to}
              aria-label="Fim do período"
              onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value || c.to }))}
              className="min-w-0 flex-1 rounded-md border border-border bg-surface px-2 py-1.5 text-xs outline-none focus:border-primary"
            />
          </div>
        )}

        <div className="mt-2 flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
          <p className="flex min-w-0 items-center gap-1.5">
            <CalendarDays className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">
              {formatDateShortBR(data.effectiveRange.from)} —{" "}
              {formatDateShortBR(data.effectiveRange.to)}
              {scope && " · limitado pela etapa"}
            </span>
          </p>
          <button
            onClick={() => setFilterOpen(true)}
            className="flex shrink-0 items-center gap-1 py-1"
          >
            <ListFilter size={13} /> Programa e etapa
          </button>
        </div>

        {chips.length > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {chips.map((chip) => (
              <button
                key={chip.label}
                onClick={chip.onRemove}
                className="interactive-press flex items-center gap-1 rounded-full bg-surface-2 px-2 py-1 text-[10px] font-semibold"
              >
                {chip.label}
                <X className="h-3 w-3 text-muted-foreground" />
              </button>
            ))}
            <button
              onClick={clearAll}
              className="interactive-press text-[10px] font-semibold text-primary underline"
            >
              Limpar filtros
            </button>
          </div>
        )}
      </section>

      {/* 2. três indicadores ---------------------------------------------- */}
      <Indicators
        frequency={freq}
        progression={progression}
        onOpenExercise={(e) => focusExercise(e.lineageId)}
      />

      {empty ? (
        <ModuleCard title="Sem registros neste período">
          <p className="text-sm leading-relaxed text-muted-foreground">
            Não há treinos concluídos entre {formatDateShortBR(data.effectiveRange.from)} e{" "}
            {formatDateShortBR(data.effectiveRange.to)}. O período escolhido foi mantido — escolha
            outro acima ou registre um treino na aba Treino.
          </p>
        </ModuleCard>
      ) : (
        <>
          {/* 3. corpo + 4-6. análise do músculo, exercícios e análise do
              exercício, tudo na mesma gaveta contínua ------------------- */}
          <ModuleCard>
            <BodyAtlas
              mode={mode}
              onModeChange={setMode}
              stimulus={stimulus}
              evolution={evolution}
              selected={muscle}
              onSelect={selectMuscle}
            />
            {!classified && (
              <p className="mt-3 rounded-lg bg-warning/10 px-2.5 py-2 text-[11px] leading-relaxed text-warning">
                Nenhuma série do período tem grupo muscular definido. Classifique os exercícios na
                ficha do treino para o corpo ganhar leitura — nada foi classificado por suposição.
              </p>
            )}
            <div ref={analysisRef} className="drawer-collapse" data-open={!!muscle}>
              <div inert={!muscle} aria-hidden={!muscle}>
                {muscle && (
                  <MuscleAnalysis
                    group={muscle}
                    sets={data.sets}
                    previousSets={previous?.sets ?? null}
                    range={data.effectiveRange}
                    records={records}
                    nextPlannedDate={nextPlannedDateForMuscle(plannedDays, muscle, todayISO())}
                    onAction={runNextStep}
                    openExerciseKey={openExerciseKey}
                    onOpenExerciseKey={setOpenExerciseKey}
                    exercisesOpen={exercisesOpen}
                    onExercisesOpenChange={setExercisesOpen}
                  />
                )}
              </div>
            </div>
          </ModuleCard>

          {/* 7. pontos de atenção -------------------------------------- */}
          <AttentionCard points={points} onOpen={openAttention} onReviewNext={onReviewNext} />

          {/* 8. análises complementares e medidas ---------------------- */}
          <ModuleCard title="Mais análises">
            <Disclosure title="Distribuição de séries">
              <RadarDistribution stimulus={stimulus} selected={muscle} onSelect={selectMuscle} />
            </Disclosure>
            <Disclosure title={`Recordes pessoais · ${records.length}`}>
              {records.length === 0 ? (
                <p className="evo-note">
                  Nenhum recorde superado neste período. O primeiro registro de uma combinação
                  estabelece a referência e não conta como recorde.
                </p>
              ) : (
                <ul className="space-y-1">
                  {records.slice(0, 12).map((record) => (
                    <li key={`${record.sessionId}-${record.lineageId}`}>
                      <button
                        onClick={() => focusExercise(record.lineageId)}
                        className="interactive-press flex w-full items-baseline justify-between gap-2 py-1 text-left"
                      >
                        <span className="min-w-0 flex-1 truncate text-xs font-semibold">
                          {record.name}
                        </span>
                        <span className="shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground">
                          {record.kind === "carga"
                            ? `${record.weight} kg × ${record.reps}`
                            : `${record.reps} reps × ${record.weight} kg`}{" "}
                          · {formatDateShortBR(record.date)}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Disclosure>
            <Disclosure title="Medidas corporais e peso">
              <MeasurementsCard
                bodyWeights={bodyWeights}
                measurements={measurements}
                range={data.effectiveRange}
                bare
              />
            </Disclosure>
          </ModuleCard>
        </>
      )}

      <p className="text-center text-[10px] leading-relaxed text-muted-foreground">
        Tudo aqui descreve os treinos registrados. Carga e repetições não indicam qualidade técnica,
        recuperação, lesão, motivação nem hipertrofia. Exercícios de equipamentos diferentes nunca
        são comparados entre si. Estabilidade prolongada = mesma referência em{" "}
        {PROLONGED_STABILITY_SESSIONS} sessões ou mais.
      </p>

      {filterOpen && (
        <EvolutionFilterSheet
          cycles={cycles}
          blocks={blocks}
          cycleId={cycleId}
          stageId={stageId}
          onChange={(next) => {
            setCycleId(next.cycleId);
            setStageId(next.stageId);
            const chosen = blocks.find((b) => b.id === next.stageId);
            if (chosen && next.stageId !== stageId) {
              setPreset("custom");
              setCustom({ from: chosen.startDate, to: chosen.endDate });
            }
          }}
          onClose={() => setFilterOpen(false)}
        />
      )}
    </div>
  );
}

export type { ExerciseEvolution };
