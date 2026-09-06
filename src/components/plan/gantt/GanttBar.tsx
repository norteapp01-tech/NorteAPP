import { useEffect, useRef, useState } from "react";
import { Check, GripVertical, MoreHorizontal } from "lucide-react";
import {
  addDays,
  daysBetweenISO,
  isPlannedOverdue,
  setPlannedRange,
  toISODate,
  todayISO,
  type Execution,
} from "@/lib/goals-store";

const DRAG_THRESHOLD_PX = 6;
const HANDLE_WIDTH_PX = 16;
const MIN_MOVE_ZONE_PX = 8;

type DragMode = "move" | "resize-left" | "resize-right";

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * Barra de uma ação no cronograma. Arrastar move (início+fim deslocam juntos);
 * puxar as alças das pontas redimensiona (a outra ponta fica fixa); toque
 * sem cruzar o limiar de arrasto abre os detalhes. A mutation
 * (`setPlannedRange`) só é chamada no `pointerup` — nunca a cada pixel —
 * com atualização otimista local e reversão em erro.
 */
export function GanttBar({
  execution,
  windowStartISO,
  pxPerDay,
  rowHeight,
  lane,
  isHighlighted,
  onOpenDetails,
  onError,
}: {
  execution: Execution;
  windowStartISO: string;
  pxPerDay: number;
  rowHeight: number;
  lane: number;
  isHighlighted: boolean;
  onOpenDetails: () => void;
  onError: (message: string) => void;
}) {
  const [optimisticRange, setOptimisticRange] = useState<{ start: string; end: string } | null>(
    null,
  );
  const [liveDeltaDays, setLiveDeltaDays] = useState(0);
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<{
    mode: DragMode;
    startX: number;
    startY: number;
    committed: boolean;
    origStart: string;
    origEnd: string;
  } | null>(null);

  // Sincroniza com o servidor: assim que o dado real bate com o otimista
  // (ou muda por outra via), solta a sobreposição local.
  useEffect(() => {
    if (
      optimisticRange &&
      execution.plannedStartDate === optimisticRange.start &&
      execution.plannedEndDate === optimisticRange.end
    ) {
      setOptimisticRange(null);
    }
  }, [execution.plannedStartDate, execution.plannedEndDate, optimisticRange]);

  const start = optimisticRange?.start ?? execution.plannedStartDate!;
  const end = optimisticRange?.end ?? execution.plannedEndDate!;
  const overdue = isPlannedOverdue(execution, todayISO());
  const done = execution.status === "concluida";

  const startOffsetDays = daysBetweenISO(windowStartISO, start);
  const durationDays = daysBetweenISO(start, end) + 1;

  const onPointerDown = (mode: DragMode) => (e: React.PointerEvent) => {
    if (done) return; // concluída não se move
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = {
      mode,
      startX: e.clientX,
      startY: e.clientY,
      committed: false,
      origStart: start,
      origEnd: end,
    };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    if (!drag.committed) {
      if (Math.abs(dx) > DRAG_THRESHOLD_PX && Math.abs(dx) > Math.abs(dy)) {
        drag.committed = true;
        setDragging(true);
      } else if (Math.abs(dy) > DRAG_THRESHOLD_PX) {
        dragRef.current = null; // gesto vertical — deixa a página rolar
        return;
      } else {
        return;
      }
    }
    e.preventDefault();
    const deltaDays = Math.round(dx / pxPerDay);
    setLiveDeltaDays(deltaDays);
  };

  const finishDrag = async (e: React.PointerEvent) => {
    const drag = dragRef.current;
    dragRef.current = null;
    (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
    if (!drag) return;
    if (!drag.committed) {
      // não cruzou o limiar — foi um toque, não um arrasto.
      onOpenDetails();
      return;
    }
    setDragging(false);
    setLiveDeltaDays(0);
    let newStart = drag.origStart;
    let newEnd = drag.origEnd;
    const deltaDays = Math.round((e.clientX - drag.startX) / pxPerDay);
    if (drag.mode === "move") {
      newStart = toISODate(addDays(new Date(drag.origStart + "T00:00:00"), deltaDays));
      newEnd = toISODate(addDays(new Date(drag.origEnd + "T00:00:00"), deltaDays));
    } else if (drag.mode === "resize-left") {
      const candidate = toISODate(addDays(new Date(drag.origStart + "T00:00:00"), deltaDays));
      newStart = candidate <= drag.origEnd ? candidate : drag.origEnd; // duração mínima de 1 dia
    } else if (drag.mode === "resize-right") {
      const candidate = toISODate(addDays(new Date(drag.origEnd + "T00:00:00"), deltaDays));
      newEnd = candidate >= drag.origStart ? candidate : drag.origStart;
    }
    if (newStart === drag.origStart && newEnd === drag.origEnd) return; // não moveu de verdade
    setOptimisticRange({ start: newStart, end: newEnd });
    navigator.vibrate?.(10);
    try {
      await setPlannedRange(execution.id, newStart, newEnd);
    } catch (err) {
      setOptimisticRange(null);
      onError(err instanceof Error ? err.message : "Não foi possível mover. Tente de novo.");
    }
  };

  const activeMode = dragging ? dragRef.current?.mode : undefined;
  const leftShiftDays = activeMode === "move" || activeMode === "resize-left" ? liveDeltaDays : 0;
  const widthDays =
    activeMode === "resize-left"
      ? durationDays - liveDeltaDays
      : activeMode === "resize-right"
        ? durationDays + liveDeltaDays
        : durationDays;
  const left = (startOffsetDays + leftShiftDays) * pxPerDay;
  const width = Math.max(Math.max(widthDays, 1) * pxPerDay - 8, 52);
  // Barras curtas não podem deixar as duas alças comerem a área de mover
  // inteira (senão nunca sobra espaço pra "pegar" a barra pelo meio) — encolhe
  // as alças proporcionalmente e, abaixo de um mínimo, esconde-as (a barra
  // continua redimensionável pelos campos de data no modal de detalhes).
  const handleWidth = Math.min(
    HANDLE_WIDTH_PX,
    Math.max(0, Math.floor((width - MIN_MOVE_ZONE_PX) / 2)),
  );
  const showHandles = !done && handleWidth >= 6;

  const tone = done
    ? "border-border/80 bg-surface-2/60 text-muted-foreground"
    : isHighlighted
      ? "border-primary bg-primary/10 text-primary"
      : "border-border bg-surface-2/95 text-foreground";

  const reduceMotion = prefersReducedMotion();

  return (
    <div
      className={`absolute select-none overflow-hidden rounded-lg border px-2 py-1.5 ${tone} ${dragging ? "z-20 opacity-90 shadow-lg" : "z-10 shadow-sm"} ${!dragging && !reduceMotion ? "transition-[left,width] duration-150" : ""}`}
      style={{ left, width, top: lane * rowHeight + 4, height: rowHeight - 10 }}
      onPointerDown={onPointerDown("move")}
      onPointerMove={onPointerMove}
      onPointerUp={finishDrag}
      onPointerCancel={finishDrag}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex h-full items-center gap-1.5 overflow-hidden">
        {isHighlighted && showHandles && (
          <GripVertical className="h-4 w-3 shrink-0 text-primary/80" aria-hidden />
        )}
        {done && <Check className="h-3.5 w-3.5 shrink-0 text-primary" strokeWidth={2.5} />}
        <span className={`truncate text-xs font-medium ${done ? "line-through" : ""}`}>
          {execution.title}
        </span>
        {overdue && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-danger" aria-hidden />}
        {!done && width >= 120 && (
          <MoreHorizontal className="ml-auto h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        )}
      </div>
      {showHandles && (
        <>
          <div
            className="absolute inset-y-0 left-0 cursor-ew-resize"
            style={{ width: handleWidth }}
            onPointerDown={onPointerDown("resize-left")}
            onPointerMove={onPointerMove}
            onPointerUp={finishDrag}
            onPointerCancel={finishDrag}
            onClick={(e) => e.stopPropagation()}
          />
          <div
            className="absolute inset-y-0 right-0 cursor-ew-resize"
            style={{ width: handleWidth }}
            onPointerDown={onPointerDown("resize-right")}
            onPointerMove={onPointerMove}
            onPointerUp={finishDrag}
            onPointerCancel={finishDrag}
            onClick={(e) => e.stopPropagation()}
          />
        </>
      )}
    </div>
  );
}
