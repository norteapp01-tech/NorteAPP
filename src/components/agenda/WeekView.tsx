import { useCallback, useEffect, useMemo, useRef } from "react";
import { formatDuration } from "@/lib/agenda-intervals";
import { loadForDate, occurrencesForDay } from "@/lib/agenda-occurrences";
import { weekDates, WEEKDAY_NAMES } from "@/lib/agenda-navigation";
import { weekdayOf } from "@/lib/agenda-recurrence";
import { timeToMinutes } from "@/lib/agenda-time";
import { initialScrollTop } from "@/lib/agenda-timeline";
import { HourLines, TIMELINE_HEIGHT, TimelineColumn } from "./Timeline";
import type { ViewProps } from "./view-types";
import "./agenda-ui.css";

/** Semana pensada primeiro para o telefone: três dias por vez com deslize
 * horizontal, horários fixos à esquerda e o cabeçalho dos dias sempre visível.
 * Em telas largas cabem os sete dias. */
export function WeekView(props: ViewProps & { onOpenDay: (date: string) => void }) {
  const {
    selectedDate,
    today,
    occurrences,
    labelsById,
    conflictIds,
    settings,
    timeFormat,
    weekStart,
    nowMinute,
    selectedKey,
    onSelectDate,
    onOpenDay,
    onOpen,
    onCreate,
    onCommit,
    onDropFit,
  } = props;
  const dates = useMemo(
    () => weekDates(selectedDate, weekStart, settings.showWeekends),
    [selectedDate, weekStart, settings.showWeekends],
  );
  const scrollRef = useRef<HTMLDivElement>(null);
  const windowMinutes = {
    start: timeToMinutes(settings.dayStart),
    end: timeToMinutes(settings.dayEnd),
  };
  const windowLength = Math.max(1, windowMinutes.end - windowMinutes.start);

  // Posiciona na vertical (agora/dia habitual) e na horizontal (dia selecionado).
  const positioned = useRef<string | null>(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const key = dates.join(",");
    if (positioned.current !== key) {
      positioned.current = key;
      const anchor = dates.includes(today) ? nowMinute : windowMinutes.start;
      el.scrollTop = initialScrollTop(anchor, el.clientHeight - 56);
    }
    // Alinha o dia selecionado depois que o layout assenta (as colunas dependem
    // da largura do contêiner), e de novo se a largura mudar.
    const align = () => {
      const col = el.querySelector<HTMLElement>(`[data-week-col="${selectedDate}"]`);
      if (!col) return;
      const gutter = 46;
      const box = el.getBoundingClientRect();
      const rect = col.getBoundingClientRect();
      if (rect.left < box.left + gutter - 1 || rect.right > box.right + 1)
        el.scrollLeft += rect.left - box.left - gutter;
    };
    const frame = requestAnimationFrame(() => requestAnimationFrame(align));
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(align);
    observer?.observe(el);
    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
    };
  }, [dates, selectedDate, today, nowMinute, windowMinutes.start]);

  // Soltar um bloco: em qual coluna o ponteiro está?
  const resolveDropDate = useCallback((clientX: number) => {
    const columns = scrollRef.current?.querySelectorAll<HTMLElement>("[data-agenda-col]");
    if (!columns) return null;
    for (const col of columns) {
      const rect = col.getBoundingClientRect();
      if (clientX >= rect.left && clientX <= rect.right) return col.dataset.agendaCol ?? null;
    }
    return null;
  }, []);

  return (
    <div className="agenda-day-sheet card-surface relative mt-3 overflow-hidden px-0 py-0">
      <div
        ref={scrollRef}
        role="region"
        tabIndex={0}
        aria-label="Semana. Deslize para os lados para ver outros dias; toque num espaço vazio para criar."
        className="agenda-timeline-scroll agenda-week-scroll overflow-auto"
        style={{ height: "min(68vh, 680px)", scrollSnapType: "x proximity" }}
      >
        <div
          className="agenda-week-grid"
          style={{ ["--cols" as string]: dates.length } as React.CSSProperties}
        >
          {/* Cabeçalho (sticky): dia, número e carga do dia */}
          <div className="agenda-week-head agenda-week-gutter" style={{ gridColumn: 1 }} />
          {dates.map((date) => {
            const load = loadForDate(occurrences, date);
            const ratio = Math.min(1, load.busy / windowLength);
            const dayConflicts = occurrencesForDay(occurrences, date).today.filter((o) =>
              conflictIds.has(o.key),
            ).length;
            const isSelected = date === selectedDate;
            return (
              <button
                key={date}
                type="button"
                className="agenda-week-head agenda-day-head"
                data-today={date === today || undefined}
                data-selected={isSelected || undefined}
                onClick={() => (isSelected ? onOpenDay(date) : onSelectDate(date))}
                aria-label={`${WEEKDAY_NAMES[weekdayOf(date)]} ${Number(date.slice(8))}, ${formatDuration(load.busy)} ocupadas${dayConflicts ? `, ${dayConflicts} em conflito` : ""}${isSelected ? ". Toque para abrir o dia." : ""}`}
              >
                <span>{WEEKDAY_NAMES[weekdayOf(date)].slice(0, 3)}</span>
                <strong>{Number(date.slice(8))}</strong>
                <span className="agenda-load" data-heavy={ratio >= 0.8 || undefined} aria-hidden>
                  <span style={{ width: `${Math.round(ratio * 100)}%` }} />
                </span>
              </button>
            );
          })}

          {/* Margem das horas (sticky à esquerda) */}
          <div className="agenda-week-gutter relative" style={{ height: TIMELINE_HEIGHT }}>
            <div className="absolute inset-0">
              <HourLines timeFormat={timeFormat} labels />
            </div>
          </div>
          {dates.map((date) => {
            const { today: dayItems, overnight } = occurrencesForDay(occurrences, date);
            return (
              <div
                key={date}
                className="agenda-week-col"
                data-week-col={date}
                data-selected={date === selectedDate || undefined}
                style={{ scrollSnapAlign: "start" }}
              >
                <TimelineColumn
                  date={date}
                  items={dayItems.filter((o) => o.startTime && !o.allDay)}
                  overnight={overnight}
                  labelsById={labelsById}
                  conflictIds={conflictIds}
                  timeFormat={timeFormat}
                  nowMinute={date === today ? nowMinute : undefined}
                  selectedKey={selectedKey}
                  workWindow={windowMinutes}
                  compact
                  onOpen={onOpen}
                  onCreate={onCreate}
                  onCommit={onCommit}
                  onDropFit={onDropFit}
                  resolveDropDate={resolveDropDate}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
