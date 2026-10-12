import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { MONTH_NAMES, monthGrid, WEEKDAY_LETTERS } from "@/lib/agenda-navigation";
import { weekdayOf } from "@/lib/agenda-recurrence";
import type { WeekStart } from "@/lib/profile-store";
import { useAgendaData } from "./use-agenda-data";
import "./agenda-ui.css";

/** Seletor de data: mês com contagem por dia e visão do ano inteiro. Cancelados
 * não contam — a mesma regra da Agenda. */
export function CalendarPicker({
  selectedDate,
  today,
  weekStart,
  onSelect,
  onClose,
}: {
  selectedDate: string;
  today: string;
  weekStart: WeekStart;
  onSelect: (date: string) => void;
  onClose: () => void;
}) {
  const [annual, setAnnual] = useState(false);
  const [cursor, setCursor] = useState(selectedDate);
  const year = Number(cursor.slice(0, 4));
  const month = Number(cursor.slice(5, 7));
  const range = useMemo(() => ({ from: `${year}-01-01`, to: `${year}-12-31` }), [year]);
  const { occurrences } = useAgendaData(range);

  const counts = useMemo(() => {
    const byDay = new Map<string, number>();
    for (const o of occurrences) {
      if (o.status === "cancelada") continue;
      byDay.set(o.date, (byDay.get(o.date) ?? 0) + 1);
    }
    return byDay;
  }, [occurrences]);
  const monthTotal = (m: number) => {
    let total = 0;
    const prefix = `${year}-${String(m).padStart(2, "0")}`;
    for (const [date, n] of counts) if (date.startsWith(prefix)) total += n;
    return total;
  };

  const shiftMonth = (delta: number) => {
    const total = year * 12 + (month - 1) + delta;
    const y = Math.floor(total / 12);
    const m = (total % 12) + 1;
    setCursor(`${y}-${String(m).padStart(2, "0")}-01`);
  };

  const rows = monthGrid(cursor, weekStart);
  const header = rows[0].map((cell) => WEEKDAY_LETTERS[weekdayOf(cell.date)]);

  return (
    <Modal onClose={onClose} title={annual ? "Escolher mês" : "Escolher data"}>
      <button
        type="button"
        onClick={() => setAnnual((v) => !v)}
        className="mx-auto flex min-h-11 items-center gap-1 text-sm font-semibold text-primary"
      >
        {annual ? "Voltar ao mês" : `Ver ${year} completo`}
        <ChevronRight className="h-3.5 w-3.5" />
      </button>

      <div className="card-surface mt-3 p-4">
        <div className="flex items-center justify-between">
          <button
            type="button"
            aria-label={annual ? "Ano anterior" : "Mês anterior"}
            onClick={() => (annual ? shiftMonth(-12) : shiftMonth(-1))}
            className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-surface-2"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <p className="text-sm font-bold">{annual ? year : `${MONTH_NAMES[month - 1]} ${year}`}</p>
          <button
            type="button"
            aria-label={annual ? "Próximo ano" : "Próximo mês"}
            onClick={() => (annual ? shiftMonth(12) : shiftMonth(1))}
            className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-surface-2"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        {annual ? (
          <div className="mt-4 grid grid-cols-3 gap-2">
            {MONTH_NAMES.map((name, i) => {
              const total = monthTotal(i + 1);
              return (
                <button
                  key={name}
                  type="button"
                  onClick={() => {
                    setCursor(`${year}-${String(i + 1).padStart(2, "0")}-01`);
                    setAnnual(false);
                  }}
                  className="rounded-xl border border-border bg-surface-2 p-3 text-left hover:border-primary/40"
                >
                  <p className="text-xs font-bold">{name.slice(0, 3)}</p>
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    {total} compromisso{total === 1 ? "" : "s"}
                  </p>
                  <div className="mt-2 h-1 overflow-hidden rounded-full bg-border">
                    <div
                      className="h-full bg-primary"
                      style={{ width: `${Math.min(total * 6, 100)}%` }}
                    />
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <>
            <div className="mt-3 grid grid-cols-7 text-center text-[10px] uppercase text-muted-foreground">
              {header.map((letter, i) => (
                <div key={i}>{letter}</div>
              ))}
            </div>
            <div className="mt-1 grid grid-cols-7 gap-1">
              {rows.flat().map(({ date, inMonth }) => {
                const n = counts.get(date) ?? 0;
                const selected = date === selectedDate;
                return (
                  <button
                    key={date}
                    type="button"
                    onClick={() => onSelect(date)}
                    aria-label={`${Number(date.slice(8))}${n ? `, ${n} compromisso${n === 1 ? "" : "s"}` : ""}`}
                    className={`aspect-square rounded-lg text-xs font-medium transition-colors ${
                      selected
                        ? "bg-primary text-primary-foreground"
                        : date === today
                          ? "border border-primary/50 bg-primary/10 text-primary"
                          : inMonth
                            ? "hover:bg-surface-2"
                            : "text-muted-foreground/50 hover:bg-surface-2"
                    }`}
                  >
                    <div className="flex h-full flex-col items-center justify-center">
                      <span>{Number(date.slice(8))}</span>
                      {n > 0 && (
                        <span
                          aria-hidden
                          className={`mt-0.5 h-1 w-1 rounded-full ${selected ? "bg-primary-foreground" : "bg-primary"}`}
                        />
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
