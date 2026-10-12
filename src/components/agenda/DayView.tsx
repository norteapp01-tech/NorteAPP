import { useLayoutEffect, useMemo, useRef } from "react";
import { AlertTriangle } from "lucide-react";
import { formatDuration } from "@/lib/agenda-intervals";
import { loadForDate, occurrencesForDay } from "@/lib/agenda-occurrences";
import { timeToMinutes } from "@/lib/agenda-time";
import { initialScrollTop } from "@/lib/agenda-timeline";
import { OccurrenceCard } from "./OccurrenceCard";
import { HourLines, HOUR_HEIGHT, TIMELINE_HEIGHT, TimelineColumn } from "./Timeline";
import type { ViewProps } from "./view-types";
import "./agenda-ui.css";

/** Âncora de leitura do dia: agora, o primeiro compromisso ou o começo do dia habitual. */
function anchorMinute(
  isToday: boolean,
  nowMinute: number,
  firstStart: number | null,
  dayStart: string,
) {
  if (isToday) return nowMinute;
  return firstStart ?? timeToMinutes(dayStart);
}

export function DayView(props: ViewProps) {
  const {
    selectedDate,
    today,
    occurrences,
    labelsById,
    conflictIds,
    settings,
    timeFormat,
    nowMinute,
    selectedKey,
    onOpen,
    onCreate,
    onCommit,
    onDropFit,
  } = props;
  const { today: items, overnight } = useMemo(
    () => occurrencesForDay(occurrences, selectedDate),
    [occurrences, selectedDate],
  );
  const timed = items.filter((o) => o.startTime && !o.allDay);
  const untimed = items.filter((o) => !o.startTime || o.allDay);
  const load = useMemo(() => loadForDate(occurrences, selectedDate), [occurrences, selectedDate]);
  const dayConflicts = items.filter((o) => conflictIds.has(o.key)).length;

  const scrollRef = useRef<HTMLDivElement>(null);
  // Reposiciona só quando muda o dia (ou quando o dia passa a ter compromissos),
  // para a tela não "pular" enquanto a pessoa consulta os horários.
  const positioned = useRef<{ date: string; withEvents: boolean } | null>(null);
  const isToday = selectedDate === today;
  const firstStart = timed.length
    ? Math.min(...timed.map((o) => timeToMinutes(o.startTime!)))
    : null;

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const withEvents = timed.length > 0;
    const done = positioned.current;
    if (done && done.date === selectedDate && (done.withEvents || !withEvents)) return;
    positioned.current = { date: selectedDate, withEvents };
    el.scrollTop = initialScrollTop(
      anchorMinute(isToday, nowMinute, firstStart, settings.dayStart),
      el.clientHeight,
    );
  }, [selectedDate, timed.length, isToday, nowMinute, firstStart, settings.dayStart]);

  const windowMinutes = {
    start: timeToMinutes(settings.dayStart),
    end: timeToMinutes(settings.dayEnd),
  };

  return (
    <div>
      <p className="mt-2 text-center text-[11px] text-muted-foreground">
        {items.filter((o) => o.status !== "cancelada").length} compromisso
        {items.filter((o) => o.status !== "cancelada").length === 1 ? "" : "s"} ·{" "}
        {formatDuration(load.busy)} ocupadas · {formatDuration(load.free)} livres
        {dayConflicts > 0 && (
          <span className="ml-2 inline-flex items-center gap-1 text-warning">
            <AlertTriangle className="h-3 w-3" /> {dayConflicts} em conflito
          </span>
        )}
      </p>

      {untimed.length > 0 && (
        <div className="mt-3 space-y-2" aria-label="Dia inteiro e sem horário">
          {untimed.map((occ) => (
            <OccurrenceCard
              key={occ.key}
              occ={occ}
              label={occ.labelId ? labelsById.get(occ.labelId) : undefined}
              timeFormat={timeFormat}
              onOpen={onOpen}
            />
          ))}
        </div>
      )}

      <div className="agenda-day-sheet card-surface relative mt-3 overflow-hidden px-3 py-4">
        <div
          ref={scrollRef}
          role="region"
          tabIndex={0}
          aria-label="Linha do tempo do dia, de 00:00 às 24:00. Toque num espaço vazio para criar."
          className="agenda-timeline-scroll overflow-y-auto"
          style={{ height: "min(62vh, 620px)" }}
        >
          <div className="relative ml-12" style={{ height: TIMELINE_HEIGHT }}>
            <HourLines timeFormat={timeFormat} labels />
            <div className="absolute inset-0">
              <TimelineColumn
                date={selectedDate}
                items={timed}
                overnight={overnight}
                labelsById={labelsById}
                conflictIds={conflictIds}
                timeFormat={timeFormat}
                nowMinute={isToday ? nowMinute : undefined}
                selectedKey={selectedKey}
                workWindow={windowMinutes}
                lines={false}
                onOpen={onOpen}
                onCreate={onCreate}
                onCommit={onCommit}
                onDropFit={onDropFit}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export { HOUR_HEIGHT };
