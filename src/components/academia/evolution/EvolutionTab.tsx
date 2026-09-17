import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, ListFilter, X } from "lucide-react";
import { formatDateShortBR, todayISO } from "@/lib/goals-store";
import { useWorkoutLoading, useWorkoutStore, type MuscleGroup } from "@/lib/workout-store";
import {
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
  previousRange,
  rangeOfLastDays,
  topMuscle,
  volumeWithComparison,
  type AttentionPoint,
  type DateRange,
  type EvolutionFilters,
} from "@/lib/workout-evolution";
import { BodyMap } from "./BodyMap";
import { RadarDistribution } from "./RadarDistribution";
import { OverloadList } from "./OverloadList";
import { AttentionCard } from "./AttentionCard";
import { IndicatorCards } from "./IndicatorCards";
import { ExerciseDetailSheet } from "./ExerciseDetailSheet";
import { MeasurementsCard } from "./MeasurementsCard";
import { EvolutionFilterSheet } from "./FilterDrawer";
import { ModuleCard, SkeletonBlock } from "./shared";

// ---------------------------------------------------------------------------
// Evolução da Academia — UMA página contínua, nesta ordem: filtros,
// indicadores, mapa de estímulo, sobrecarga progressiva, distribuição, pontos
// de atenção e medidas corporais.
//
// Dois níveis de filtro, visualmente distintos:
// - GLOBAIS (período, programa, etapa): afetam tudo.
// - SELEÇÃO DE MÚSCULO: detalha a lista de exercícios. O mapa e o radar
//   continuam mostrando o corpo inteiro, só destacando o grupo — é o que
//   preserva o contexto da comparação.
//
// Funciona para quem nunca criou um programa: escolher um é recorte, não
// requisito.
// ---------------------------------------------------------------------------

type Preset = "7" | "30" | "90" | "365" | "custom";

const PRESETS: { key: Preset; label: string; days: number }[] = [
  { key: "7", label: "7 dias", days: 7 },
  { key: "30", label: "30 dias", days: 30 },
  { key: "90", label: "3 meses", days: 90 },
  { key: "365", label: "1 ano", days: 365 },
];

export function EvolutionTab({ initialStageId }: { initialStageId?: string }) {
  const sessions = useWorkoutStore((s) => s.sessions);
  const exercises = useWorkoutStore((s) => s.exercises);
  const plans = useWorkoutStore((s) => s.plans);
  const bodyWeights = useWorkoutStore((s) => s.bodyWeights);
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
  const [muscle, setMuscle] = useState<MuscleGroup | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const [openExercise, setOpenExercise] = useState<string | null>(null);
  const overloadRef = useRef<HTMLDivElement>(null);

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
  const key = JSON.stringify(filters);
  const data = useMemo(
    () => applyFilters(sessions, exercises, plans, filters),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sessions, exercises, plans, key],
  );
  const previous = useMemo(() => {
    const candidate = previousRange(data.effectiveRange);
    if (scope && candidate.from < scope.from) return null;
    return applyFilters(sessions, exercises, plans, { ...filters, range: candidate });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessions, exercises, plans, key, data.effectiveRange.from]);

  const stimulus = useMemo(() => muscleStimulus(data.sets), [data.sets]);
  const progressions = useMemo(() => loadProgressions(data.sets, 5), [data.sets]);

  // Programação histórica: só as etapas do ciclo têm datas fixas. A atribuição
  // semanal solta é estado ATUAL e não pode dizer o que estava previsto no
  // passado — sem ela, o card mostra o realizado, sem porcentagem.
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
  const vol = volumeWithComparison(data.sets, previous?.sets ?? null);
  const top = topMuscle(stimulus);
  const points = attentionPoints(data, progressions, stimulus, freq, todayISO());

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

  const scrollToExercises = () =>
    overloadRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });

  const openAttention = (point: AttentionPoint) => {
    if (point.target.kind === "exercicio") {
      setOpenExercise(point.target.lineageId);
      return;
    }
    if (point.target.kind === "musculo" && point.target.group !== "nao_classificado") {
      setMuscle(point.target.group as MuscleGroup);
    }
    scrollToExercises();
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <SkeletonBlock height={92} />
        <SkeletonBlock height={96} />
        <SkeletonBlock height={320} />
        <SkeletonBlock height={220} />
      </div>
    );
  }

  const empty = data.sessions.length === 0;

  return (
    <div className="space-y-4">
      {/* 1. filtros globais ---------------------------------------------- */}
      <section className="card-surface p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 flex-wrap gap-1">
            {PRESETS.map((p) => (
              <button
                key={p.key}
                onClick={() => setPreset(p.key)}
                aria-pressed={preset === p.key}
                className={`interactive-press rounded-lg px-2.5 py-1.5 text-[11px] font-semibold ${
                  preset === p.key ? "bg-primary/15 text-primary" : "text-muted-foreground"
                }`}
              >
                {p.label}
              </button>
            ))}
            <button
              onClick={() => setPreset("custom")}
              aria-pressed={preset === "custom"}
              className={`interactive-press rounded-lg px-2.5 py-1.5 text-[11px] font-semibold ${
                preset === "custom" ? "bg-primary/15 text-primary" : "text-muted-foreground"
              }`}
            >
              Personalizar
            </button>
          </div>
          <button
            onClick={() => setFilterOpen(true)}
            className="interactive-press flex shrink-0 items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-[11px] font-semibold"
          >
            <ListFilter className="h-3.5 w-3.5" /> Filtros
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

        <p className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <CalendarDays className="h-3.5 w-3.5 shrink-0" />
          {formatDateShortBR(data.effectiveRange.from)} —{" "}
          {formatDateShortBR(data.effectiveRange.to)}
          {scope && " · limitado pela etapa"}
        </p>

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
              onClick={() => {
                setCycleId("");
                setStageId("");
                setMuscle(null);
              }}
              className="interactive-press text-[10px] font-semibold text-primary underline"
            >
              Limpar filtros
            </button>
          </div>
        )}
      </section>

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
          <IndicatorCards
            frequency={freq}
            volume={vol}
            top={top}
            comparison={previous?.effectiveRange}
            data={data}
          />

          <ModuleCard title="Mapa de estímulo">
            <BodyMap stimulus={stimulus} selected={muscle} onSelect={setMuscle} />
            {muscle && (
              <MuscleDetail
                stimulus={stimulus}
                muscle={muscle}
                onSeeExercises={scrollToExercises}
              />
            )}
          </ModuleCard>

          <div ref={overloadRef} className="scroll-mt-4">
            <OverloadList data={data} selectedMuscle={muscle} onOpen={setOpenExercise} />
          </div>

          <ModuleCard title="Distribuição de séries">
            <RadarDistribution stimulus={stimulus} selected={muscle} onSelect={setMuscle} />
          </ModuleCard>

          <AttentionCard points={points} onOpen={openAttention} />

          <MeasurementsCard
            bodyWeights={bodyWeights}
            measurements={measurements}
            range={data.effectiveRange}
          />
        </>
      )}

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

      {openExercise && (
        <ExerciseDetailSheet
          lineageId={openExercise}
          data={data}
          onClose={() => setOpenExercise(null)}
        />
      )}
    </div>
  );
}

/** Detalhe do músculo selecionado — séries diretas, participação, sessões e
 * último registro, com caminho para os exercícios que formam o número. */
function MuscleDetail({
  stimulus,
  muscle,
  onSeeExercises,
}: {
  stimulus: ReturnType<typeof muscleStimulus>;
  muscle: MuscleGroup;
  onSeeExercises: () => void;
}) {
  const info = stimulus.find((s) => s.group === muscle);
  return (
    <div className="mt-3 rounded-xl border border-primary/30 bg-primary/5 p-3">
      <p className="text-sm font-bold">{muscleGroupLabel[muscle]}</p>
      {!info || info.directSets === 0 ? (
        <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
          Sem registros neste período. Isso descreve o que foi registrado — não conclui que você
          deixou de treinar.
        </p>
      ) : (
        <>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {info.directSets} séries diretas · {info.sessions}{" "}
            {info.sessions === 1 ? "sessão" : "sessões"}
            {info.lastDate ? ` · último registro em ${formatDateShortBR(info.lastDate)}` : ""}
          </p>
          {info.assistedSets > 0 && (
            <p className="text-[11px] text-muted-foreground">
              Participou como músculo secundário em outras {info.assistedSets} séries — contadas à
              parte.
            </p>
          )}
        </>
      )}
      <button
        onClick={onSeeExercises}
        className="interactive-press mt-2 text-[11px] font-bold text-primary underline"
      >
        Ver exercícios deste músculo
      </button>
    </div>
  );
}
