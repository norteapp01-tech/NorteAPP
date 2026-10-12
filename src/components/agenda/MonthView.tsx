import { useMemo } from "react";
import { AlertTriangle } from "lucide-react";
import { monthGrid, WEEKDAY_LETTERS, formatLongDate } from "@/lib/agenda-navigation";
import { weekdayOf } from "@/lib/agenda-recurrence";
import { loadForDate, occurrencesForDay } from "@/lib/agenda-occurrences";
import { OccurrenceCard } from "./OccurrenceCard";
import type { ViewProps } from "./view-types";
import "./agenda-ui.css";

const MAX_DOTS = 3;
/** Dia "cheio": mais da metade do horário habitual ocupado. */
const FULL_RATIO = 0.5;

export function MonthView(props: ViewProps & { onOpenDay: (date: string) => void }) {
  const {
    selectedDate,
    today,
    occurrences,
    labelsById,
    conflictIds,
    settings,
    timeFormat,
    weekStart,
    onSelectDate,
    onOpenDay,
    onOpen,
  } = props;
  const rows = useMemo(() => {
    const grid = monthGrid(selectedDate, weekStart);
    return settings.showWeekends
      ? grid
      : grid.map((row) => row.filter((cell) => ![0, 6].includes(weekdayOf(cell.date))));
  }, [selectedDate, weekStart, settings.showWeekends]);
  const header = rows[0].map((cell) => WEEKDAY_LETTERS[weekdayOf(cell.date)]);

  const byDate = useMemo(() => {
    const map = new Map<string, typeof occurrences>();
    for (const row of rows) {
      for (const { date } of row) {
        const { today: startedToday, overnight } = occurrencesForDay(occurrences, date);
        map.set(
          date,
          [...startedToday, ...overnight].filter((o) => o.status !== "cancelada"),
        );
      }
    }
    return map;
  }, [occurrences, rows]);

  const windowMinutes =
    Number(settings.dayEnd.slice(0, 2)) * 60 +
    Number(settings.dayEnd.slice(3)) -
    (Number(settings.dayStart.slice(0, 2)) * 60 + Number(settings.dayStart.slice(3)));
  const dayEvents = (byDate.get(selectedDate) ?? []).slice();

  return (
    <div>
      <div className="card-surface-quiet mt-3 p-3" role="grid" aria-label="Calendário do mês">
        <div
          className="grid text-center text-[10px] uppercase text-muted-foreground"
          style={{ gridTemplateColumns: `repeat(${header.length}, minmax(0, 1fr))` }}
        >
          {header.map((letter, i) => (
            <div key={i} className="py-1">
              {letter}
            </div>
          ))}
        </div>
        {rows.map((row, r) => (
          <div
            key={r}
            className="grid gap-0.5"
            role="row"
            style={{ gridTemplateColumns: `repeat(${row.length}, minmax(0, 1fr))` }}
          >
            {row.map(({ date, inMonth }) => {
              const events = byDate.get(date) ?? [];
              const colors = [
                ...new Set(
                  events.map(
                    (e) => (e.labelId ? labelsById.get(e.labelId)?.color : undefined) ?? "",
                  ),
                ),
              ];
              const hasConflict = events.some((e) => conflictIds.has(e.key));
              const busy = loadForDate(occurrences, date).busy;
              const crowded = windowMinutes > 0 && busy / windowMinutes >= FULL_RATIO;
              return (
                <button
                  key={date}
                  type="button"
                  role="gridcell"
                  className="agenda-month-cell"
                  data-out={!inMonth || undefined}
                  data-today={date === today || undefined}
                  data-selected={date === selectedDate || undefined}
                  onClick={() => onSelectDate(date)}
                  onDoubleClick={() => onOpenDay(date)}
                  aria-label={`${Number(date.slice(8))}: ${events.length} compromisso${events.length === 1 ? "" : "s"}${hasConflict ? ", com conflito" : ""}${crowded ? ", dia cheio" : ""}`}
                  aria-selected={date === selectedDate}
                >
                  <span>{Number(date.slice(8))}</span>
                  <span className="agenda-month-dots" aria-hidden>
                    {colors.slice(0, MAX_DOTS).map((color, i) => (
                      <i
                        key={i}
                        className="agenda-dot"
                        style={{ ["--dot" as string]: color || "var(--muted-foreground)" }}
                      />
                    ))}
                  </span>
                  <span className="agenda-month-count" aria-hidden>
                    {events.length > 0 ? events.length : ""}
                    {hasConflict && (
                      <AlertTriangle className="ml-0.5 inline h-2.5 w-2.5 text-warning" />
                    )}
                    {!hasConflict && crowded && <span className="text-warning"> ●</span>}
                  </span>
                </button>
              );
            })}
          </div>
        ))}
      </div>

      <div className="mt-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold">{formatLongDate(selectedDate)}</h3>
        <button
          type="button"
          onClick={() => onOpenDay(selectedDate)}
          className="min-h-11 px-2 text-xs font-semibold text-primary"
        >
          Abrir o dia
        </button>
      </div>
      <div className="mt-1 space-y-2">
        {dayEvents.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Nada agendado nesse dia.</p>
        ) : (
          dayEvents.map((occ) => (
            <OccurrenceCard
              key={occ.key}
              occ={occ}
              label={occ.labelId ? labelsById.get(occ.labelId) : undefined}
              conflict={conflictIds.has(occ.key)}
              timeFormat={timeFormat}
              onOpen={onOpen}
            />
          ))
        )}
      </div>
    </div>
  );
}
