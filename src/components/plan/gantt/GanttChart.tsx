import { useEffect, useMemo, useRef, useState } from "react";
import { GitBranch, RefreshCw } from "lucide-react";
import { GanttBar } from "@/components/plan/gantt/GanttBar";
import { GanttActionSheet } from "@/components/plan/gantt/GanttActionSheet";
import { CreateActionOnGanttSheet } from "@/components/plan/gantt/CreateActionOnGanttSheet";
import { ScaleSelector } from "@/components/plan/gantt/ScaleSelector";
import { UnscheduledDrawer } from "@/components/plan/gantt/UnscheduledDrawer";
import {
  addDays,
  daysBetweenISO,
  dependencyReplanSuggestions,
  formatDateShortBR,
  ganttBuckets,
  hasPlannedRange,
  isScheduled,
  isExecutionBlocked,
  reorganizePlanDependencies,
  stepsForGoal,
  toISODate,
  todayISO,
  type Execution,
  type GanttScale,
  type Goal,
  type Step,
} from "@/lib/goals-store";

const MIN_PX_PER_DAY: Record<GanttScale, number> = {
  dia: 54,
  semana: 8,
  mes: 3,
  "45dias": 2,
  "90dias": 0.9,
};
const ROW_HEIGHT = 58;
const STAGE_LABEL_HEIGHT = 42;

export function GanttChart({
  goal,
  steps,
  executions,
}: {
  goal: Goal;
  steps: Step[];
  executions: Execution[];
}) {
  const [scale, setScale] = useState<GanttScale>("mes");
  const [error, setError] = useState("");
  const [reorganizing, setReorganizing] = useState(false);
  const [openExecution, setOpenExecution] = useState<Execution | null>(null);
  const [createFor, setCreateFor] = useState<{
    step: Step;
    startISO: string;
    endISO: string;
  } | null>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const [viewportWidth, setViewportWidth] = useState(0);

  useEffect(() => {
    const element = viewportRef.current;
    if (!element) return;
    const update = () => setViewportWidth(element.clientWidth);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const ordered = useMemo(() => stepsForGoal(steps, goal.id), [steps, goal.id]);
  const today = todayISO();
  const window_ = useMemo(() => {
    const createdISO = goal.createdAt.slice(0, 10);
    const plannedDates = executions.flatMap((e) =>
      [e.plannedStartDate, e.plannedEndDate].filter((d): d is string => !!d),
    );
    const startISO = [createdISO, ...plannedDates, today].sort()[0];
    const endISO = goal.deadlineISO ?? [createdISO, ...plannedDates, today].sort().at(-1) ?? today;
    return {
      startISO,
      endISO,
      totalDays: daysBetweenISO(startISO, endISO) + 1,
    };
  }, [executions, goal.createdAt, goal.deadlineISO, today]);
  const buckets = useMemo(
    () => ganttBuckets(window_.startISO, window_.endISO, scale),
    [window_.startISO, window_.endISO, scale],
  );
  const pxPerDay = Math.max(
    MIN_PX_PER_DAY[scale],
    viewportWidth > 0 ? viewportWidth / window_.totalDays : 0,
  );
  const totalWidth = window_.totalDays * pxPerDay;
  const bucketWidth = (startISO: string, endISO: string) =>
    (daysBetweenISO(startISO, endISO) + 1) * pxPerDay;

  const scheduled = useMemo(
    () =>
      executions.filter(
        (execution) =>
          hasPlannedRange(execution) &&
          execution.status !== "cancelada" &&
          execution.status !== "reagendada",
      ),
    [executions],
  );
  const todayOffsetDays = daysBetweenISO(window_.startISO, today);
  const todayVisible = todayOffsetDays >= 0 && todayOffsetDays < window_.totalDays;
  const deadlineOffsetDays = goal.deadlineISO
    ? daysBetweenISO(window_.startISO, goal.deadlineISO)
    : null;
  const deadlineVisible =
    deadlineOffsetDays !== null &&
    deadlineOffsetDays >= 0 &&
    deadlineOffsetDays < window_.totalDays;
  const deadlineOutOfView = deadlineOffsetDays !== null && !deadlineVisible;

  const toSchedule = useMemo(
    () =>
      executions
        .filter((e) => e.status !== "concluida" && e.status !== "cancelada" && !isScheduled(e))
        .sort((a, b) =>
          (a.plannedStartDate ?? a.dueDate).localeCompare(b.plannedStartDate ?? b.dueDate),
        ),
    [executions],
  );

  // Precisa vir antes do `return` condicional abaixo — hooks não podem ser
  // chamados condicionalmente. Recalcula só quando as etapas ou as ações com
  // período realmente mudam, não a cada abertura/fechamento de sheet.
  const corridors = useMemo(
    () =>
      ordered.map((step, i) => {
        const stepExecs = scheduled
          .filter((e) => e.stepId === step.id)
          .sort((a, b) => {
            const byStart = a.plannedStartDate!.localeCompare(b.plannedStartDate!);
            return byStart !== 0 ? byStart : a.plannedEndDate!.localeCompare(b.plannedEndDate!);
          });
        const laneOf = Object.fromEntries(stepExecs.map((execution, lane) => [execution.id, lane]));
        const laneCount = Math.max(1, stepExecs.length);
        return { step, index: i, stepExecs, laneOf, laneCount };
      }),
    [ordered, scheduled],
  );

  const geometry = useMemo(() => {
    const result = new Map<string, { xStart: number; xEnd: number; y: number }>();
    let top = 0;
    for (const corridor of corridors) {
      for (const execution of corridor.stepExecs) {
        result.set(execution.id, {
          xStart: daysBetweenISO(window_.startISO, execution.plannedStartDate!) * pxPerDay,
          xEnd: (daysBetweenISO(window_.startISO, execution.plannedEndDate!) + 1) * pxPerDay - 8,
          y:
            top +
            STAGE_LABEL_HEIGHT +
            corridor.laneOf[execution.id] * ROW_HEIGHT +
            (ROW_HEIGHT - 2) / 2,
        });
      }
      top += STAGE_LABEL_HEIGHT + Math.max(1, corridor.laneCount) * ROW_HEIGHT + 8;
    }
    return { actions: result, height: top };
  }, [corridors, pxPerDay, window_.startISO]);

  const dependencyLines = useMemo(
    () =>
      scheduled.flatMap((execution) => {
        if (!execution.dependsOnExecutionId) return [];
        const from = geometry.actions.get(execution.dependsOnExecutionId);
        const to = geometry.actions.get(execution.id);
        if (!from || !to) return [];
        return [{ execution, from, to }];
      }),
    [geometry.actions, scheduled],
  );
  const replanSuggestions = useMemo(() => dependencyReplanSuggestions(executions), [executions]);
  const blockedActions = executions.filter((execution) =>
    isExecutionBlocked(execution, executions),
  );
  const affectedActions = new Set(
    executions
      .filter(
        (execution) =>
          execution.dependsOnExecutionId &&
          blockedActions.some((blocked) => blocked.id === execution.dependsOnExecutionId),
      )
      .map((execution) => execution.id),
  ).size;

  if (ordered.length === 0) {
    return (
      <div>
        <ScaleSelector scale={scale} onChange={setScale} />
        <div className="card-surface mt-4 p-6 text-center">
          <p className="text-sm text-muted-foreground text-balance-tight">
            Crie etapas na aba Planejamento para ver o cronograma deste plano.
          </p>
        </div>
      </div>
    );
  }

  const handleEmptySpaceClick = (step: Step) => (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const offsetX = e.clientX - rect.left;
    const dayOffset = Math.max(0, Math.floor(offsetX / pxPerDay));
    const startISO = toISODate(addDays(new Date(window_.startISO + "T00:00:00"), dayOffset));
    const suggestedEnd = toISODate(addDays(new Date(startISO + "T00:00:00"), 2));
    const endISO =
      goal.deadlineISO && suggestedEnd > goal.deadlineISO ? goal.deadlineISO : suggestedEnd;
    if (goal.deadlineISO && startISO > goal.deadlineISO) return;
    setCreateFor({ step, startISO, endISO });
  };

  return (
    <div className="plan-gantt">
      <ScaleSelector scale={scale} onChange={setScale} />
      <div
        ref={viewportRef}
        className="plan-gantt-viewport mt-4 -mx-5 overflow-x-auto border-y border-border bg-background [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <div className="relative min-h-[320px]" style={{ width: totalWidth }}>
          {/* régua temporal fixa ao topo do painel */}
          <div className="sticky top-0 z-40 flex h-12 border-b border-border bg-background/95 backdrop-blur">
            {buckets.map((b) => (
              <div
                key={b.startISO}
                className="flex shrink-0 items-center justify-center border-r border-border/60 px-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground last:border-r-0"
                style={{ width: bucketWidth(b.startISO, b.endISO) }}
              >
                {b.label}
              </div>
            ))}
          </div>

          {/* corredores: uma única grade contínua, não uma pilha de caixas vazias */}
          <div className="relative">
            <div className="pointer-events-none absolute inset-0 z-0 flex">
              {buckets.map((b) => (
                <div
                  key={`grid-${b.startISO}`}
                  className="h-full shrink-0 border-r border-border/50 last:border-r-0"
                  style={{ width: bucketWidth(b.startISO, b.endISO) }}
                />
              ))}
            </div>
            {corridors.map(({ step, index, stepExecs, laneOf, laneCount }) => (
              <section
                key={step.id}
                className="relative z-10 border-b border-border/70 last:border-b-0"
              >
                <div className="flex items-end px-4 pb-2" style={{ height: STAGE_LABEL_HEIGHT }}>
                  <p className="max-w-[min(72vw,420px)] truncate text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                    {index + 1}. {step.title}
                  </p>
                </div>
                <div
                  className="relative cursor-crosshair bg-surface/10 transition-colors hover:bg-surface/20"
                  style={{ height: Math.max(1, laneCount) * ROW_HEIGHT + 8 }}
                  onClick={handleEmptySpaceClick(step)}
                >
                  {stepExecs.map((e) => (
                    <GanttBar
                      key={e.id}
                      execution={e}
                      windowStartISO={window_.startISO}
                      pxPerDay={pxPerDay}
                      rowHeight={ROW_HEIGHT}
                      lane={laneOf[e.id]}
                      isTodayActive={e.plannedStartDate! <= today && e.plannedEndDate! >= today}
                      blocked={isExecutionBlocked(e, executions)}
                      onOpenDetails={() => setOpenExecution(e)}
                      onError={setError}
                      goalId={goal.id}
                      goalDeadlineISO={goal.deadlineISO}
                    />
                  ))}
                </div>
              </section>
            ))}

            {dependencyLines.length > 0 && (
              <svg
                className="pointer-events-none absolute left-0 top-0 z-20 overflow-visible"
                width={totalWidth}
                height={geometry.height}
                aria-hidden="true"
              >
                <defs>
                  <marker
                    id="plan-dependency-arrow"
                    viewBox="0 0 10 10"
                    refX="8"
                    refY="5"
                    markerWidth="5"
                    markerHeight="5"
                    orient="auto-start-reverse"
                  >
                    <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--muted-foreground)" />
                  </marker>
                  <marker
                    id="plan-dependency-arrow-danger"
                    viewBox="0 0 10 10"
                    refX="8"
                    refY="5"
                    markerWidth="5"
                    markerHeight="5"
                    orient="auto-start-reverse"
                  >
                    <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--danger)" />
                  </marker>
                </defs>
                {dependencyLines.map(({ execution, from, to }) => {
                  const turnX = Math.max(from.xEnd + 10, to.xStart - 12);
                  const blocked = isExecutionBlocked(execution, executions);
                  return (
                    <path
                      key={`dependency-${execution.id}`}
                      d={`M ${from.xEnd} ${from.y} H ${turnX} V ${to.y} H ${to.xStart}`}
                      fill="none"
                      stroke={blocked ? "var(--danger)" : "var(--muted-foreground)"}
                      strokeOpacity={blocked ? 0.72 : 0.42}
                      strokeWidth="1.4"
                      strokeDasharray={blocked ? "4 3" : undefined}
                      markerEnd={`url(#plan-dependency-arrow${blocked ? "-danger" : ""})`}
                      className={blocked ? "text-danger" : "text-muted-foreground"}
                    />
                  );
                })}
              </svg>
            )}

            {/* linha de hoje */}
            {todayVisible && (
              <div
                className="pointer-events-none absolute bottom-0 top-0 z-30 w-px bg-primary shadow-[0_0_8px_hsl(var(--primary)/0.2)]"
                style={{ left: todayOffsetDays * pxPerDay }}
              >
                <span className="absolute left-1/2 top-1 -translate-x-1/2 whitespace-nowrap rounded-md bg-primary px-2 py-1 text-[9px] font-bold text-primary-foreground">
                  HOJE · {new Date(today + "T00:00:00").getDate()}
                </span>
              </div>
            )}

            {/* prazo final */}
            {deadlineVisible && (
              <div
                className="pointer-events-none absolute bottom-0 top-0 z-20 border-l border-dashed border-muted-foreground/60"
                style={{ left: deadlineOffsetDays! * pxPerDay }}
              >
                <span className="absolute left-1 top-2 whitespace-nowrap text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Prazo
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {deadlineOutOfView && (
        <p className="mt-2 text-[11px] text-muted-foreground">
          {deadlineOffsetDays! < 0
            ? "← Prazo já passou"
            : `Prazo em ${formatDateShortBR(goal.deadlineISO!)} →`}
        </p>
      )}

      {error && <p className="mt-2 text-[11px] text-danger">{error}</p>}

      <div className="mt-4 flex items-center justify-center rounded-xl border border-border/70 px-3 py-3">
        <p className="text-center text-[11px] text-muted-foreground">
          Arraste para mover · puxe as bordas para ajustar duração
        </p>
      </div>

      {(blockedActions.length > 0 || replanSuggestions.length > 0) && (
        <section className="mt-3 rounded-2xl border border-border-quiet bg-surface p-4">
          <div className="flex items-start gap-3">
            <GitBranch className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">
                {blockedActions.length > 0
                  ? `${blockedActions.length} ${blockedActions.length === 1 ? "bloqueio" : "bloqueios"} no caminho`
                  : "Datas fora da ordem das dependências"}
              </p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {affectedActions > 0
                  ? `${affectedActions} ${affectedActions === 1 ? "ação depende" : "ações dependem"} desses pontos.`
                  : replanSuggestions.length > 0
                    ? `${replanSuggestions.length} ${replanSuggestions.length === 1 ? "ação pode ser reposicionada" : "ações podem ser reposicionadas"}.`
                    : "Abra as ações bloqueadas para decidir como seguir."}
              </p>
            </div>
            {replanSuggestions.length > 0 && (
              <button
                disabled={reorganizing}
                onClick={async () => {
                  const latest = replanSuggestions
                    .map((suggestion) => suggestion.plannedEndDate)
                    .sort()
                    .at(-1);
                  if (latest && goal.deadlineISO && latest > goal.deadlineISO) {
                    const accepted = window.confirm(
                      `A reorganização estende o prazo do plano até ${formatDateShortBR(latest)}. Continuar?`,
                    );
                    if (!accepted) return;
                  }
                  setReorganizing(true);
                  setError("");
                  try {
                    await reorganizePlanDependencies(goal, executions);
                  } catch (cause) {
                    setError(
                      cause instanceof Error ? cause.message : "Não foi possível reorganizar.",
                    );
                  } finally {
                    setReorganizing(false);
                  }
                }}
                className="flex min-h-10 shrink-0 items-center gap-1.5 rounded-xl bg-primary px-3 text-xs font-bold text-primary-foreground disabled:opacity-50"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${reorganizing ? "animate-spin" : ""}`} />
                Reorganizar
              </button>
            )}
          </div>
        </section>
      )}

      <UnscheduledDrawer executions={toSchedule} steps={ordered} onOpen={setOpenExecution} />

      {openExecution && (
        <GanttActionSheet
          execution={openExecution}
          goal={goal}
          onClose={() => setOpenExecution(null)}
        />
      )}
      {createFor && (
        <CreateActionOnGanttSheet
          step={createFor.step}
          goal={goal}
          startISO={createFor.startISO}
          endISO={createFor.endISO}
          onClose={() => setCreateFor(null)}
        />
      )}
    </div>
  );
}
