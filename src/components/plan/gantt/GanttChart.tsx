import { useMemo, useState } from "react";
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
  ganttWindow,
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

const BUCKET_WIDTH_PX: Record<GanttScale, number> = {
  semana: 56,
  mes: 90,
  "45dias": 90,
  "90dias": 90,
};
const ROW_HEIGHT = 44;
const CORRIDOR_GAP = 12;

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

  const ordered = useMemo(() => stepsForGoal(steps, goal.id), [steps, goal.id]);
  const today = todayISO();
  const window_ = useMemo(() => ganttWindow(scale, today), [scale, today]);
  const buckets = useMemo(
    () => ganttBuckets(window_.startISO, window_.endISO, scale),
    [window_.startISO, window_.endISO, scale],
  );
  const bucketDaySpan = daysBetweenISO(buckets[0].startISO, buckets[0].endISO) + 1;
  const pxPerDay = BUCKET_WIDTH_PX[scale] / bucketDaySpan;
  const totalWidth = buckets.length * BUCKET_WIDTH_PX[scale];

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
      <div className="mt-3 -mx-5 overflow-x-auto px-5">
        <div className="relative" style={{ width: totalWidth }}>
          {/* régua */}
          <div className="flex border-b border-border pb-2">
            {buckets.map((b) => (
              <div
                key={b.startISO}
                className="shrink-0 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
                style={{ width: BUCKET_WIDTH_PX[scale] }}
              >
                {b.label}
              </div>
            ))}
          </div>

          {/* corredores */}
          <div className="relative mt-2" style={{ paddingBottom: 8 }}>
            {corridors.map(({ step, index, stepExecs, laneOf, laneCount }) => (
              <div key={step.id} style={{ marginBottom: CORRIDOR_GAP }}>
                <p className="mb-1 truncate text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {index + 1}. {step.title}
                </p>
                <div
                  className="relative rounded-lg border border-border/60 bg-surface/40"
                  style={{ height: laneCount * ROW_HEIGHT }}
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
              </div>
            ))}

            {/* linha de hoje */}
            <div
              className="pointer-events-none absolute -top-[26px] bottom-0 z-30 w-px bg-primary"
              style={{ left: todayOffsetDays * pxPerDay }}
            >
              <span className="absolute -top-[2px] left-1 whitespace-nowrap rounded bg-primary px-1.5 py-0.5 text-[9px] font-bold text-primary-foreground">
                HOJE · {new Date(today + "T00:00:00").getDate()}
              </span>
            </div>

            {/* prazo final */}
            {deadlineVisible && (
              <div
                className="pointer-events-none absolute -top-[26px] bottom-0 z-20 border-l border-dashed border-muted-foreground/50"
                style={{ left: deadlineOffsetDays! * pxPerDay }}
              >
                <span className="absolute -top-[2px] left-1 whitespace-nowrap text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
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

      <p className="mt-4 text-center text-[11px] text-muted-foreground">
        Arraste para mover · puxe as bordas para ajustar duração
      </p>

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
