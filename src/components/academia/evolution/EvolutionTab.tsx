import { useMemo, useState } from "react";
import { CalendarDays, ListFilter, X } from "lucide-react";
import { formatDateShortBR } from "@/lib/goals-store";
import { useWorkoutStore } from "@/lib/workout-store";
import { blocksForCycle, useCycleStore } from "@/lib/workout-cycle-store";
import {
  applyFilters,
  indicators,
  muscleGroupLabel,
  previousRange,
  rangeOfLastDays,
  UNCLASSIFIED,
  type DateRange,
  type EvolutionFilters,
  type Indicator,
  type MuscleGroupFilter,
} from "@/lib/workout-evolution";
import { ProgressionModule } from "./ProgressionModule";
import { DistributionModule } from "./DistributionModule";
import { DeepDives } from "./DeepDives";
import { FilterDrawer } from "./FilterDrawer";
import { SessionListDrawer, DaysCalendarDrawer, SetsByExerciseDrawer } from "./IndicatorDrawers";

// ---------------------------------------------------------------------------
// Evolução da Academia.
//
// Responde a quatro perguntas, nesta ordem: mantive a frequência, em quais
// exercícios progredi, como distribuí o treino, e o que mudou. Tudo parte de
// UM conjunto filtrado (`applyFilters`), então o número do topo e o ponto do
// gráfico não têm como discordar — e cada número abre os registros que o
// compõem.
//
// Funciona sem planejamento nenhum: escolher um é filtro, nunca requisito.
// ---------------------------------------------------------------------------

type Preset = "30" | "90" | "custom";

export function EvolutionTab({
  initialStageId,
}: {
  /** Etapa já selecionada ao chegar por "Ver evolução desta etapa". */
  initialStageId?: string;
}) {
  const sessions = useWorkoutStore((s) => s.sessions);
  const exercises = useWorkoutStore((s) => s.exercises);
  const plans = useWorkoutStore((s) => s.plans);
  const bodyWeights = useWorkoutStore((s) => s.bodyWeights);
  const cycles = useCycleStore((s) => s.cycles);
  const blocks = useCycleStore((s) => s.blocks);
  const blockPlans = useCycleStore((s) => s.blockPlans);
  const cycleGoals = useCycleStore((s) => s.cycleGoals);
  const measurements = useCycleStore((s) => s.measurements);

  const initialStage = initialStageId ? blocks.find((b) => b.id === initialStageId) : undefined;
  const [preset, setPreset] = useState<Preset>(initialStage ? "custom" : "30");
  const [custom, setCustom] = useState<DateRange>(() =>
    initialStage ? { from: initialStage.startDate, to: initialStage.endDate } : rangeOfLastDays(30),
  );
  const [cycleId, setCycleId] = useState<string>(initialStage?.cycleId ?? "");
  const [stageId, setStageId] = useState<string>(initialStageId ?? "");
  const [planLineageId, setPlanLineageId] = useState<string>("");
  const [muscleGroup, setMuscleGroup] = useState<MuscleGroupFilter | "">("");
  const [filterOpen, setFilterOpen] = useState(false);
  const [detail, setDetail] = useState<Indicator["key"] | null>(null);

  const cycle = cycles.find((c) => c.id === cycleId);
  const stage = blocks.find((b) => b.id === stageId);
  const scope: DateRange | undefined = stage
    ? { from: stage.startDate, to: stage.endDate }
    : undefined;

  const range: DateRange =
    preset === "custom" ? custom : rangeOfLastDays(preset === "30" ? 30 : 90);

  // Treinos do escopo escolhido: uma etapa filtra pelos treinos DELA, não por
  // qualquer sessão nas mesmas datas.
  const scopedPlanLineages = useMemo(() => {
    if (planLineageId) return [planLineageId];
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
  }, [planLineageId, stage, cycle, blocks, blockPlans, plans]);

  const filters: EvolutionFilters = {
    range,
    scope,
    planLineageIds: scopedPlanLineages,
    muscleGroup: muscleGroup || undefined,
  };
  const data = useMemo(
    () => applyFilters(sessions, exercises, plans, filters),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sessions, exercises, plans, JSON.stringify(filters)],
  );

  // A comparação usa o intervalo imediatamente anterior, de mesma duração —
  // mas só quando ele cabe dentro do escopo da etapa. Uma etapa sem histórico
  // anterior comparável não ganha um número inventado.
  const previous = useMemo(() => {
    const candidate = previousRange(data.effectiveRange);
    if (scope && candidate.from < scope.from) return null;
    return applyFilters(sessions, exercises, plans, { ...filters, range: candidate });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessions, exercises, plans, JSON.stringify(filters), data.effectiveRange.from]);

  const cards = indicators(
    data,
    previous,
    scope ? "Sem histórico anterior dentro desta etapa" : "Sem comparação disponível",
  );

  const chips: { label: string; onRemove: () => void }[] = [];
  if (cycle)
    chips.push({
      label: `Planejamento: ${cycle.name}`,
      onRemove: () => {
        setCycleId("");
        setStageId("");
      },
    });
  if (stage)
    chips.push({
      label: `Etapa: ${stage.name}`,
      onRemove: () => setStageId(""),
    });
  if (planLineageId) {
    const label = plans.find((p) => p.lineageId === planLineageId);
    chips.push({
      label: `Treino: ${label ? `${label.letter} · ${label.name}` : "selecionado"}`,
      onRemove: () => setPlanLineageId(""),
    });
  }
  if (muscleGroup)
    chips.push({
      label: `Músculo: ${muscleGroup === UNCLASSIFIED ? "Não classificado" : muscleGroupLabel[muscleGroup]}`,
      onRemove: () => setMuscleGroup(""),
    });

  return (
    <div className="space-y-4">
      {/* A. período e filtros -------------------------------------------- */}
      <section className="card-surface p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex gap-1">
            {(["30", "90"] as const).map((p) => (
              <button
                key={p}
                onClick={() => setPreset(p)}
                aria-pressed={preset === p}
                className={`interactive-press rounded-lg px-2.5 py-1.5 text-[11px] font-semibold ${
                  preset === p ? "bg-primary/15 text-primary" : "text-muted-foreground"
                }`}
              >
                {p} dias
              </button>
            ))}
            <button
              onClick={() => setPreset("custom")}
              aria-pressed={preset === "custom"}
              className={`interactive-press rounded-lg px-2.5 py-1.5 text-[11px] font-semibold ${
                preset === "custom" ? "bg-primary/15 text-primary" : "text-muted-foreground"
              }`}
            >
              Personalizado
            </button>
          </div>
          <button
            onClick={() => setFilterOpen(true)}
            className="interactive-press flex shrink-0 items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-[11px] font-semibold"
          >
            <ListFilter className="h-3.5 w-3.5" /> Filtrar
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
                setPlanLineageId("");
                setMuscleGroup("");
              }}
              className="interactive-press text-[10px] font-semibold text-primary underline"
            >
              Limpar filtros
            </button>
          </div>
        )}
      </section>

      {/* B. três indicadores --------------------------------------------- */}
      <div className="grid grid-cols-3 gap-2">
        {cards.map((card) => (
          <button
            key={card.key}
            onClick={() => setDetail(card.key)}
            className="card-surface interactive-press p-2.5 text-left"
          >
            <p className="text-[9px] font-bold uppercase leading-tight tracking-wider text-muted-foreground">
              {card.label}
            </p>
            <p className="mt-1 font-mono text-2xl font-bold tabular-nums">{card.value}</p>
            {card.delta !== undefined ? (
              <p
                className={`text-[10px] ${card.delta > 0 ? "text-success" : card.delta < 0 ? "text-muted-foreground" : "text-muted-foreground"}`}
              >
                {card.delta > 0 ? "+" : ""}
                {card.delta} vs. anterior
              </p>
            ) : (
              <p className="text-[10px] leading-tight text-muted-foreground">
                {card.comparisonUnavailableReason}
              </p>
            )}
          </button>
        ))}
      </div>
      {cards[0]?.comparison && (
        <p className="-mt-2 text-[10px] text-muted-foreground">
          Comparado com {formatDateShortBR(cards[0].comparison.from)} —{" "}
          {formatDateShortBR(cards[0].comparison.to)}, mesmo escopo.
        </p>
      )}

      {/* C. evolução por exercício --------------------------------------- */}
      <ProgressionModule data={data} />

      {/* D. distribuição -------------------------------------------------- */}
      <DistributionModule
        data={data}
        onSelectMuscle={(key) =>
          setMuscleGroup(key === muscleGroup ? "" : (key as MuscleGroupFilter))
        }
        selectedMuscle={muscleGroup || null}
        onSelectPlan={(lineageId) => setPlanLineageId(lineageId === planLineageId ? "" : lineageId)}
        selectedPlan={planLineageId || null}
      />

      {/* E. aprofundamentos ---------------------------------------------- */}
      <DeepDives
        data={data}
        allSessions={sessions}
        exercises={exercises}
        plans={plans}
        bodyWeights={bodyWeights}
        cycles={cycles}
        blocks={blocks}
        cycleGoals={cycleGoals}
        measurements={measurements}
        stage={stage}
        cycle={cycle}
      />

      {filterOpen && (
        <FilterDrawer
          cycles={cycles}
          blocks={blocks}
          blockPlans={blockPlans}
          plans={plans}
          data={data}
          cycleId={cycleId}
          stageId={stageId}
          planLineageId={planLineageId}
          muscleGroup={muscleGroup}
          onChange={(next) => {
            setCycleId(next.cycleId);
            setStageId(next.stageId);
            setPlanLineageId(next.planLineageId);
            setMuscleGroup(next.muscleGroup);
            // Escolher uma etapa passa a usar as datas dela como período.
            const chosen = blocks.find((b) => b.id === next.stageId);
            if (chosen && next.stageId !== stageId) {
              setPreset("custom");
              setCustom({ from: chosen.startDate, to: chosen.endDate });
            }
          }}
          onClose={() => setFilterOpen(false)}
        />
      )}

      {detail === "treinos" && (
        <SessionListDrawer data={data} plans={plans} onClose={() => setDetail(null)} />
      )}
      {detail === "dias" && <DaysCalendarDrawer data={data} onClose={() => setDetail(null)} />}
      {detail === "series" && <SetsByExerciseDrawer data={data} onClose={() => setDetail(null)} />}
    </div>
  );
}
