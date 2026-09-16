import { useEffect, useMemo, useRef, useState } from "react";
import { Target } from "lucide-react";
import {
  daysBetweenISO,
  formatDateShortBR,
  ganttBuckets,
  todayISO,
  type GanttScale,
} from "@/lib/goals-store";
import { useWorkoutStore } from "@/lib/workout-store";
import {
  blockDurationDays,
  plansOfBlock,
  stageDivision,
  stageState,
  useCycleStore,
  type CycleBlock,
  type CycleGoal,
  type WorkoutCycle,
} from "@/lib/workout-cycle-store";

// ---------------------------------------------------------------------------
// Cronograma do ciclo — o nível é a ETAPA. Uma barra por série ou por exercício
// viraria uma lista gigante que não se lê; os treinos ficam no detalhe, ao
// tocar na etapa.
//
// Reaproveita os buckets e a escala do cronograma de Planos para o eixo ficar
// com a mesma linguagem visual.
// ---------------------------------------------------------------------------

const MIN_PX_PER_DAY: Record<GanttScale, number> = {
  dia: 54,
  semana: 8,
  mes: 3,
  "45dias": 2,
  "90dias": 0.9,
};
const ROW_HEIGHT = 56;
const SCALES: { key: GanttScale; label: string }[] = [
  { key: "semana", label: "Semana" },
  { key: "mes", label: "Mês" },
  { key: "45dias", label: "45 dias" },
  { key: "90dias", label: "90 dias" },
];

export function CycleTimeline({
  cycle,
  blocks,
  goals,
  onOpenStage,
}: {
  cycle: WorkoutCycle;
  blocks: CycleBlock[];
  goals: CycleGoal[];
  onOpenStage: (blockId: string) => void;
}) {
  const blockPlans = useCycleStore((s) => s.blockPlans);
  const plans = useWorkoutStore((s) => s.plans);
  const [scale, setScale] = useState<GanttScale>("mes");
  const viewportRef = useRef<HTMLDivElement>(null);
  const [viewportWidth, setViewportWidth] = useState(0);
  const today = todayISO();

  useEffect(() => {
    const element = viewportRef.current;
    if (!element) return;
    const update = () => setViewportWidth(element.clientWidth);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const totalDays = daysBetweenISO(cycle.startDate, cycle.endDate) + 1;
  const pxPerDay = Math.max(MIN_PX_PER_DAY[scale], viewportWidth / Math.max(1, totalDays));
  const width = totalDays * pxPerDay;
  const buckets = useMemo(
    () => ganttBuckets(cycle.startDate, cycle.endDate, scale),
    [cycle.startDate, cycle.endDate, scale],
  );
  const todayOffset =
    today >= cycle.startDate && today <= cycle.endDate
      ? daysBetweenISO(cycle.startDate, today) * pxPerDay
      : null;

  return (
    <section className="card-surface p-4">
      <div className="flex items-baseline justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            Período total
          </p>
          <p className="text-sm font-semibold">
            {formatDateShortBR(cycle.startDate)} — {formatDateShortBR(cycle.endDate)}
          </p>
          <p className="text-[11px] text-muted-foreground">
            {totalDays} dias · {blocks.length} etapas
          </p>
        </div>
        <div className="flex shrink-0 gap-1">
          {SCALES.map((s) => (
            <button
              key={s.key}
              onClick={() => setScale(s.key)}
              aria-pressed={scale === s.key}
              className={`interactive-press rounded-md px-2 py-1 text-[10px] font-semibold ${
                scale === s.key ? "bg-primary/15 text-primary" : "text-muted-foreground"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <div ref={viewportRef} className="mt-3 overflow-x-auto">
        <div className="relative" style={{ width, minWidth: "100%" }}>
          {/* eixo */}
          <div className="flex border-b border-border pb-1">
            {buckets.map((bucket) => {
              const days = daysBetweenISO(bucket.startISO, bucket.endISO) + 1;
              return (
                <div
                  key={bucket.startISO}
                  style={{ width: days * pxPerDay }}
                  className="shrink-0 truncate border-l border-border pl-1 text-[9px] text-muted-foreground"
                >
                  {bucket.label}
                </div>
              );
            })}
          </div>

          <div className="relative mt-2" style={{ height: blocks.length * ROW_HEIGHT }}>
            {todayOffset !== null && (
              <div
                aria-hidden
                className="absolute top-0 z-10 w-px bg-primary"
                style={{ left: todayOffset, height: blocks.length * ROW_HEIGHT }}
              />
            )}

            {blocks.map((block, i) => {
              const offset = daysBetweenISO(cycle.startDate, block.startDate) * pxPerDay;
              const barWidth = Math.max(24, blockDurationDays(block) * pxPerDay);
              const state = stageState(block, blockPlans, today);
              return (
                <button
                  key={block.id}
                  onClick={() => onOpenStage(block.id)}
                  className={`interactive-press absolute flex flex-col justify-center overflow-hidden rounded-lg border px-2 text-left ${
                    state === "vigente"
                      ? "border-primary bg-primary/15"
                      : state === "rascunho"
                        ? "border-dashed border-warning/50 bg-warning/5"
                        : "border-border bg-surface-2"
                  }`}
                  style={{
                    left: offset,
                    width: barWidth,
                    top: i * ROW_HEIGHT,
                    height: ROW_HEIGHT - 8,
                  }}
                >
                  <span className="truncate text-[11px] font-semibold">{block.name}</span>
                  <span className="truncate text-[10px] text-muted-foreground">
                    {stageDivision(blockPlans, plans, block.id)}
                  </span>
                </button>
              );
            })}
          </div>

          {/* marcos das metas com prazo */}
          {goals.some((g) => g.deadline) && (
            <div className="relative mt-1 h-6 border-t border-border">
              {goals
                .filter(
                  (g) => g.deadline && g.deadline >= cycle.startDate && g.deadline <= cycle.endDate,
                )
                .map((g) => (
                  <div
                    key={g.id}
                    title={`${g.title || "Meta"} · ${formatDateShortBR(g.deadline!)}`}
                    className="absolute top-1 flex items-center gap-0.5"
                    style={{ left: daysBetweenISO(cycle.startDate, g.deadline!) * pxPerDay }}
                  >
                    <Target className="h-3 w-3 text-primary" />
                  </div>
                ))}
            </div>
          )}
        </div>
      </div>

      <p className="mt-2 text-[11px] text-muted-foreground">
        Toque numa etapa para abrir seus treinos. Os alvos com prazo aparecem como marcos.
      </p>

      {blocks.length === 0 && (
        <p className="mt-3 text-sm text-muted-foreground">
          Este ciclo ainda não tem etapas para posicionar.
        </p>
      )}
    </section>
  );
}
