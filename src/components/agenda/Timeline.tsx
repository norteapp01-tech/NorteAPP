import { useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";
import { AlertTriangle, CalendarSync, Check, Lock, Repeat } from "lucide-react";
import { DAY_MIN, crossesMidnight, durationMinutes, layoutColumns } from "@/lib/agenda-intervals";
import { minutesToTime, timeToMinutes } from "@/lib/agenda-time";
import { HOUR_HEIGHT, TIMELINE_HEIGHT } from "@/lib/agenda-timeline";
import { formatTime } from "@/lib/format-utils";
import type { AgendaOccurrence } from "@/lib/agenda-occurrences";
import type { AgendaLabel } from "@/lib/agenda-labels-store";
import type { TimeFormat } from "@/lib/profile-store";
import "./agenda-ui.css";

export { HOUR_HEIGHT, TIMELINE_HEIGHT };

const STEP = 15;
const DRAG_START_PX = 4;
const MIN_BLOCK_PX = 30;

const snap = (minutes: number) => Math.round(minutes / STEP) * STEP;
/** 1440 vira "00:00": é a meia-noite do FIM do dia, e o campo de hora não aceita 24:00. */
const clockOf = (minutes: number) => minutesToTime(((minutes % DAY_MIN) + DAY_MIN) % DAY_MIN);

export type CommitPatch = { date: string; startTime: string; endTime: string };

/** Linhas das horas; com `labels` mostra "07:00" na margem esquerda. */
export function HourLines({ timeFormat, labels }: { timeFormat: TimeFormat; labels: boolean }) {
  return (
    <>
      {Array.from({ length: 25 }, (_, hour) => (
        <div key={hour} className="agenda-hour-line" style={{ top: hour * HOUR_HEIGHT }}>
          {labels && (
            <span>{formatTime(`${String(hour % 24).padStart(2, "0")}:00`, timeFormat)}</span>
          )}
        </div>
      ))}
    </>
  );
}

/** Um bloco como a linha do tempo o desenha: parte do dia, colunas e flags. */
type BlockSpec = {
  occ: AgendaOccurrence;
  ghost: boolean;
  start: number;
  end: number;
};

function blockSpecs(items: AgendaOccurrence[], overnight: AgendaOccurrence[]): BlockSpec[] {
  const specs: BlockSpec[] = [];
  for (const occ of overnight) {
    if (!occ.startTime || !occ.endTime) continue;
    const end = timeToMinutes(occ.endTime);
    specs.push({ occ, ghost: true, start: 0, end: end === 0 ? DAY_MIN : end });
  }
  for (const occ of items) {
    if (!occ.startTime || occ.allDay) continue;
    const start = timeToMinutes(occ.startTime);
    const duration = durationMinutes(occ.startTime, occ.endTime);
    // Passou da meia-noite: neste dia o bloco vai até 24:00.
    specs.push({ occ, ghost: false, start, end: Math.min(DAY_MIN, start + duration) });
  }
  return specs;
}

export function TimelineColumn({
  date,
  items,
  overnight,
  labelsById,
  conflictIds,
  timeFormat,
  nowMinute,
  selectedKey,
  workWindow,
  compact = false,
  lines = true,
  onOpen,
  onCreate,
  onCommit,
  resolveDropDate,
  onDropFit,
}: {
  date: string;
  items: AgendaOccurrence[];
  overnight: AgendaOccurrence[];
  labelsById: Map<string, AgendaLabel>;
  conflictIds: Set<string>;
  timeFormat: TimeFormat;
  /** Minuto do dia, só quando esta coluna é hoje. */
  nowMinute?: number;
  selectedKey?: string | null;
  /** Horário habitual do dia, em minutos — apenas destaque visual. */
  workWindow?: { start: number; end: number };
  compact?: boolean;
  /** Desenha as linhas das horas (a visão do dia as desenha por conta própria). */
  lines?: boolean;
  onOpen: (occ: AgendaOccurrence) => void;
  onCreate: (date: string, minute: number) => void;
  onCommit: (occ: AgendaOccurrence, patch: CommitPatch) => Promise<void>;
  /** Na visão semanal, descobre em qual dia o ponteiro soltou o bloco. */
  resolveDropDate?: (clientX: number) => string | null;
  /** Soltar uma ação de "Para encaixar" neste horário. */
  onDropFit?: (executionId: string, date: string, minute: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const specs = blockSpecs(items, overnight);
  const layout = new Map(
    layoutColumns(
      specs.map((s) => ({ id: s.occ.key + (s.ghost ? ":g" : ""), start: s.start, end: s.end })),
    ).map((l) => [l.id, l]),
  );

  const handleClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest("[data-agenda-block]")) return;
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    const minute = Math.max(
      0,
      Math.min(DAY_MIN - STEP, Math.floor(((event.clientY - rect.top) / HOUR_HEIGHT) * 4) * STEP),
    );
    onCreate(date, minute);
  };

  const minuteAt = (clientY: number) => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return 0;
    return Math.max(
      0,
      Math.min(DAY_MIN - STEP, Math.floor(((clientY - rect.top) / HOUR_HEIGHT) * 4) * STEP),
    );
  };

  return (
    <div
      ref={ref}
      data-agenda-col={date}
      onClick={handleClick}
      onDragOver={
        onDropFit
          ? (e) => {
              if (e.dataTransfer.types.includes("application/x-norte-fit")) {
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
              }
            }
          : undefined
      }
      onDrop={
        onDropFit
          ? (e) => {
              const id = e.dataTransfer.getData("application/x-norte-fit");
              if (!id) return;
              e.preventDefault();
              onDropFit(id, date, minuteAt(e.clientY));
            }
          : undefined
      }
      className="relative"
      style={{ height: TIMELINE_HEIGHT }}
    >
      {workWindow && (
        <div
          className="agenda-work-window"
          style={{
            top: (workWindow.start / 60) * HOUR_HEIGHT,
            height: ((workWindow.end - workWindow.start) / 60) * HOUR_HEIGHT,
          }}
        />
      )}
      {lines && <HourLines timeFormat={timeFormat} labels={false} />}
      {nowMinute !== undefined && (
        <div className="agenda-now-line" style={{ top: (nowMinute / 60) * HOUR_HEIGHT }}>
          <span />
        </div>
      )}
      {specs.map((spec) => {
        const id = spec.occ.key + (spec.ghost ? ":g" : "");
        const slot = layout.get(id) ?? { column: 0, columns: 1 };
        return (
          <OccurrenceBlock
            key={id}
            spec={spec}
            date={date}
            column={slot.column}
            columns={slot.columns}
            label={spec.occ.labelId ? labelsById.get(spec.occ.labelId) : undefined}
            conflict={conflictIds.has(spec.occ.key)}
            timeFormat={timeFormat}
            selected={selectedKey === spec.occ.key}
            compact={compact}
            onOpen={onOpen}
            onCommit={onCommit}
            resolveDropDate={resolveDropDate}
          />
        );
      })}
    </div>
  );
}

function OccurrenceBlock({
  spec,
  date,
  column,
  columns,
  label,
  conflict,
  timeFormat,
  selected,
  compact,
  onOpen,
  onCommit,
  resolveDropDate,
}: {
  spec: BlockSpec;
  date: string;
  column: number;
  columns: number;
  label?: AgendaLabel;
  conflict: boolean;
  timeFormat: TimeFormat;
  selected: boolean;
  compact: boolean;
  onOpen: (occ: AgendaOccurrence) => void;
  onCommit: (occ: AgendaOccurrence, patch: CommitPatch) => Promise<void>;
  resolveDropDate?: (clientX: number) => string | null;
}) {
  const { occ, ghost } = spec;
  const [drag, setDrag] = useState<{ mode: "move" | "resize"; dy: number; dx: number } | null>(
    null,
  );
  const [saving, setSaving] = useState(false);
  const gesture = useRef<{
    mode: "move" | "resize";
    x: number;
    y: number;
    moved: boolean;
  } | null>(null);

  const realDuration = occ.startTime ? durationMinutes(occ.startTime, occ.endTime) : 60;
  const crosses = occ.startTime ? crossesMidnight(occ.startTime, occ.endTime) : false;
  // Evento de agenda do Google somente leitura aparece, mas não se mexe aqui.
  const canEdit = !ghost && occ.status !== "cancelada" && !occ.readOnly;
  const canResize = canEdit && !crosses;

  // Pré-visualização durante o arraste.
  let start = spec.start;
  let end = spec.end;
  if (drag?.mode === "move") {
    const next = Math.max(
      0,
      Math.min(DAY_MIN - STEP, snap(spec.start + (drag.dy / HOUR_HEIGHT) * 60)),
    );
    start = next;
    end = Math.min(DAY_MIN, next + realDuration);
  } else if (drag?.mode === "resize") {
    const duration = Math.max(
      STEP,
      Math.min(DAY_MIN - spec.start, snap(realDuration + (drag.dy / HOUR_HEIGHT) * 60)),
    );
    end = spec.start + duration;
  }

  const top = (start / 60) * HOUR_HEIGHT;
  const height = Math.max(MIN_BLOCK_PX, ((end - start) / 60) * HOUR_HEIGHT - 1);
  const tall = height >= 46;
  // Três ou mais lado a lado numa coluna estreita: só o título, sem enfeites.
  const squeezed = compact && columns >= 3;
  const style: CSSProperties = {
    top,
    height,
    left: `calc(${(column / columns) * 100}% + 1px)`,
    width: `calc(${100 / columns}% - 3px)`,
    ["--lbl" as string]: label?.color ?? occ.externalColor,
    transform: drag?.mode === "move" && drag.dx ? `translateX(${drag.dx}px)` : undefined,
  };

  const begin = (mode: "move" | "resize", event: PointerEvent<HTMLElement>) => {
    if (!canEdit || saving) return;
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    gesture.current = { mode, x: event.clientX, y: event.clientY, moved: false };
  };

  const move = (event: PointerEvent<HTMLElement>) => {
    const g = gesture.current;
    if (!g) return;
    const dx = event.clientX - g.x;
    const dy = event.clientY - g.y;
    if (!g.moved && Math.hypot(dx, dy) < DRAG_START_PX) return;
    g.moved = true;
    setDrag({ mode: g.mode, dy, dx: g.mode === "move" && resolveDropDate ? dx : 0 });
  };

  const finish = async (event: PointerEvent<HTMLElement>) => {
    const g = gesture.current;
    gesture.current = null;
    event.stopPropagation();
    if (!g) return;
    if (!g.moved) {
      setDrag(null);
      onOpen(occ);
      return;
    }
    const dy = event.clientY - g.y;
    setDrag(null);
    if (!occ.startTime) return;
    let patch: CommitPatch;
    if (g.mode === "move") {
      const next = Math.max(
        0,
        Math.min(DAY_MIN - STEP, snap(spec.start + (dy / HOUR_HEIGHT) * 60)),
      );
      const targetDate = resolveDropDate?.(event.clientX) ?? date;
      patch = {
        date: targetDate,
        startTime: clockOf(next),
        endTime: clockOf(next + realDuration),
      };
      if (
        patch.date === occ.date &&
        patch.startTime === occ.startTime &&
        patch.endTime === (occ.endTime ?? "")
      )
        return;
    } else {
      const duration = Math.max(
        STEP,
        Math.min(DAY_MIN - spec.start, snap(realDuration + (dy / HOUR_HEIGHT) * 60)),
      );
      patch = {
        date: occ.date,
        startTime: occ.startTime,
        endTime: clockOf(spec.start + duration),
      };
      if (duration === realDuration) return;
    }
    setSaving(true);
    try {
      await onCommit(occ, patch);
    } catch {
      // A falha já foi avisada por quem salvou; o bloco volta ao horário real.
    } finally {
      setSaving(false);
    }
  };

  const keyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onOpen(occ);
      return;
    }
    if (!canEdit || !occ.startTime || (event.key !== "ArrowUp" && event.key !== "ArrowDown"))
      return;
    event.preventDefault();
    const delta = event.key === "ArrowUp" ? -STEP : STEP;
    const startMin = timeToMinutes(occ.startTime);
    if (event.shiftKey) {
      if (crosses) return;
      const duration = Math.max(STEP, realDuration + delta);
      void onCommit(occ, {
        date: occ.date,
        startTime: occ.startTime,
        endTime: clockOf(startMin + duration),
      });
    } else {
      const next = Math.max(0, Math.min(DAY_MIN - STEP, startMin + delta));
      void onCommit(occ, {
        date: occ.date,
        startTime: clockOf(next),
        endTime: clockOf(next + realDuration),
      });
    }
  };

  const timeText = `${formatTime(clockOf(start), timeFormat)}–${formatTime(clockOf(end), timeFormat)}`;
  const description = [
    occ.title,
    ghost ? "continua de ontem" : timeText,
    label?.name,
    occ.status === "concluida"
      ? "concluído"
      : occ.status === "perdida"
        ? "perdido"
        : occ.status === "cancelada"
          ? "cancelado"
          : "",
    occ.rigid ? "rígido" : "",
    occ.readOnly
      ? "somente leitura, do Google Agenda"
      : occ.source === "external"
        ? "do Google Agenda"
        : "",
    occ.syncState === "conflict" ? "mudou no Norte e no Google, aguardando decisão" : "",
    conflict ? "em conflito com outro compromisso" : "",
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <div
      data-agenda-block
      data-status={occ.status}
      data-conflict={conflict || undefined}
      data-ghost={ghost || undefined}
      data-selected={selected || undefined}
      data-dragging={drag ? "true" : undefined}
      className={`agenda-block ${canEdit ? "cursor-grab active:cursor-grabbing" : ""} ${saving ? "opacity-60" : ""}`}
      style={style}
      role="button"
      tabIndex={0}
      aria-label={`${description}. ${canEdit ? "Toque para abrir, arraste para mudar o horário." : "Toque para abrir."}`}
      onPointerDown={(e) => begin("move", e)}
      onPointerMove={move}
      onPointerUp={finish}
      onPointerCancel={() => {
        gesture.current = null;
        setDrag(null);
      }}
      onKeyDown={keyDown}
    >
      <p className="agenda-block-title flex items-center gap-1">
        {!squeezed && occ.status === "concluida" && (
          <Check className="h-3 w-3 shrink-0 text-success" />
        )}
        {!squeezed && occ.rigid && <Lock className="h-2.5 w-2.5 shrink-0 text-muted-foreground" />}
        {!squeezed && occ.recurring && (
          <Repeat className="h-2.5 w-2.5 shrink-0 text-muted-foreground" />
        )}
        {conflict && !squeezed && <AlertTriangle className="h-2.5 w-2.5 shrink-0 text-warning" />}
        {!squeezed && occ.syncState === "conflict" && (
          <AlertTriangle className="h-2.5 w-2.5 shrink-0 text-danger" />
        )}
        {!squeezed && occ.source === "external" && (
          <CalendarSync className="h-2.5 w-2.5 shrink-0 text-muted-foreground" />
        )}
        <span className="truncate">{occ.title}</span>
      </p>
      {!squeezed && (tall || !compact) && height >= 38 && (
        <p className="agenda-block-meta">
          {ghost ? `até ${formatTime(clockOf(end), timeFormat)} · de ontem` : timeText}
        </p>
      )}
      {tall && !compact && occ.location && <p className="agenda-block-meta">{occ.location}</p>}
      {canResize && (
        <div
          className="agenda-resize"
          aria-label="Ajustar duração"
          onPointerDown={(e) => begin("resize", e)}
          onPointerMove={move}
          onPointerUp={finish}
          onPointerCancel={() => {
            gesture.current = null;
            setDrag(null);
          }}
        >
          <span />
        </div>
      )}
    </div>
  );
}
