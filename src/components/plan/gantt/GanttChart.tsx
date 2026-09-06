import { useEffect, useMemo, useRef, useState } from "react";
import { GanttBar } from "@/components/plan/gantt/GanttBar";
import { GanttActionSheet } from "@/components/plan/gantt/GanttActionSheet";
import { CreateActionOnGanttSheet } from "@/components/plan/gantt/CreateActionOnGanttSheet";
import { ScaleSelector } from "@/components/plan/gantt/ScaleSelector";
import { UnscheduledDrawer } from "@/components/plan/gantt/UnscheduledDrawer";
import {
  addDays,
  assignLanes,
  daysBetweenISO,
  formatDateShortBR,
  ganttBuckets,
  hasPlannedRange,
  nextPlanAction,
  stepsForGoal,
  toISODate,
  todayISO,
  type Execution,
  type GanttScale,
  type Goal,
  type Step,
} from "@/lib/goals-store";

const MIN_BUCKET_WIDTH_PX: Record<GanttScale, number> = {
  semana: 56,
  mes: 88,
  "45dias": 82,
  "90dias": 78,
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
    const endISO =
      [goal.deadlineISO, ...plannedDates, today]
        .filter((d): d is string => !!d)
        .sort()
        .at(-1) ?? today;
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
  const bucketDaySpan = daysBetweenISO(buckets[0].startISO, buckets[0].endISO) + 1;
  // O painel sempre ocupa a largura disponível. Em escalas longas, preserva uma
  // largura mínima e passa a rolar horizontalmente, como um calendário real.
  const bucketWidth = Math.max(
    MIN_BUCKET_WIDTH_PX[scale],
    viewportWidth > 0 ? viewportWidth / buckets.length : 0,
  );
  const pxPerDay = bucketWidth / bucketDaySpan;
  const totalWidth = buckets.length * bucketWidth;

  const planNext = nextPlanAction(goal, steps, executions);
  const highlightId = planNext.kind === "action" ? planNext.execution.id : null;

  const scheduled = executions.filter(hasPlannedRange);
  const todayOffsetDays = daysBetweenISO(window_.startISO, today);
  const deadlineOffsetDays = goal.deadlineISO
    ? daysBetweenISO(window_.startISO, goal.deadlineISO)
    : null;
  const deadlineVisible =
    deadlineOffsetDays !== null &&
    deadlineOffsetDays >= 0 &&
    deadlineOffsetDays < window_.totalDays;
  const deadlineOutOfView = deadlineOffsetDays !== null && !deadlineVisible;

  const unscheduled = executions.filter((e) => !hasPlannedRange(e));

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

  const corridors = ordered.map((step, i) => {
    const stepExecs = scheduled.filter((e) => e.stepId === step.id);
    const { laneOf, laneCount } = assignLanes(
      stepExecs.map((e) => ({ id: e.id, start: e.plannedStartDate!, end: e.plannedEndDate! })),
    );
    return { step, index: i, stepExecs, laneOf, laneCount };
  });

  const handleEmptySpaceClick = (step: Step) => (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const offsetX = e.clientX - rect.left;
    const dayOffset = Math.max(0, Math.floor(offsetX / pxPerDay));
    const startISO = toISODate(addDays(new Date(window_.startISO + "T00:00:00"), dayOffset));
    const endISO = toISODate(addDays(new Date(startISO + "T00:00:00"), 2));
    setCreateFor({ step, startISO, endISO });
  };

  return (
    <div>
      <ScaleSelector scale={scale} onChange={setScale} />
      <div
        ref={viewportRef}
        className="mt-4 -mx-5 overflow-x-auto border-y border-border bg-background [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <div className="relative min-h-[320px]" style={{ width: totalWidth }}>
          {/* régua temporal fixa ao topo do painel */}
          <div className="sticky top-0 z-40 flex h-12 border-b border-border bg-background/95 backdrop-blur">
            {buckets.map((b) => (
              <div
                key={b.startISO}
                className="flex shrink-0 items-center justify-center border-r border-border/60 px-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground last:border-r-0"
                style={{ width: bucketWidth }}
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
                  style={{ width: bucketWidth }}
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
                      isHighlighted={e.id === highlightId}
                      onOpenDetails={() => setOpenExecution(e)}
                      onError={setError}
                    />
                  ))}
                </div>
              </section>
            ))}

            {/* linha de hoje */}
            <div
              className="pointer-events-none absolute bottom-0 top-0 z-30 w-px bg-primary shadow-[0_0_8px_hsl(var(--primary)/0.2)]"
              style={{ left: todayOffsetDays * pxPerDay }}
            >
              <span className="absolute left-1 top-1 whitespace-nowrap rounded-md bg-primary px-2 py-1 text-[9px] font-bold text-primary-foreground">
                HOJE · {new Date(today + "T00:00:00").getDate()}
              </span>
            </div>

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

      <UnscheduledDrawer executions={unscheduled} steps={ordered} onOpen={setOpenExecution} />

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
