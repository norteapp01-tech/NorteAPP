import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  CalendarPlus,
  ChevronDown,
  ChevronUp,
  Clock,
  GripVertical,
} from "lucide-react";
import { fitCandidates, suggestSlotsFor, type FitItem } from "@/lib/agenda-fit";
import { addDaysISO, type FreeSlot } from "@/lib/agenda-intervals";
import { relativeDayLabel, formatShortDate } from "@/lib/agenda-navigation";
import { removeAgendaSession, scheduleExecution } from "@/lib/goals-store";
import { toConflictable } from "@/lib/agenda-search";
import { formatTime } from "@/lib/format-utils";
import { useAgendaFeedback } from "./agenda-feedback";
import { useAgendaData } from "./use-agenda-data";
import "./agenda-ui.css";

function deadlineText(item: FitItem, today: string): string {
  if (item.overdue) return `venceu em ${formatShortDate(item.deadline)}`;
  const relative = relativeDayLabel(item.deadline, today);
  return relative === "Hoje" || relative === "Amanhã"
    ? relative.toLowerCase()
    : formatShortDate(item.deadline);
}

export const FIT_DRAG_TYPE = "application/x-norte-fit";

/** “Para encaixar”: ações de planos ativos com prazo e sem horário. Só entram
 * na linha do tempo depois que recebem um horário — esta área é a ponte, não
 * uma segunda agenda. */
export function FitList({
  today,
  onPick,
}: {
  today: string;
  /** Escolher o horário à mão (abre o formulário já ligado à ação). */
  onPick: (item: FitItem) => void;
}) {
  const feedback = useAgendaFeedback();
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const range = useMemo(() => ({ from: today, to: addDaysISO(today, 16) }), [today]);
  const { occurrences, executions, goals, steps, settings, profile, nowMinute } =
    useAgendaData(range);

  const items = useMemo(
    () => fitCandidates(executions, goals, steps, today),
    [executions, goals, steps, today],
  );
  const occupied = useMemo(
    () => occurrences.filter((o) => !o.allDay && o.startTime).map(toConflictable),
    [occurrences],
  );

  if (items.length === 0) return null;
  const urgent = items.filter((i) => i.overdue || i.soon).length;

  const schedule = async (item: FitItem, slot: FreeSlot) => {
    const id = item.execution.id;
    await feedback.run("Ação encaixada na Agenda.", async () => {
      const sessionId = await scheduleExecution(id, slot.date, slot.start, slot.end);
      return {
        undo: async () => {
          await removeAgendaSession(id, sessionId);
        },
      };
    });
  };

  return (
    <section
      className="agenda-fit card-surface-quiet mt-5 overflow-hidden"
      aria-label="Para encaixar"
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex min-h-14 w-full items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <span className="whitespace-nowrap font-semibold">Para encaixar</span>
        <span className="ml-auto flex items-center gap-2 whitespace-nowrap text-xs text-muted-foreground">
          {urgent > 0 && (
            <span className="rounded-full bg-warning/15 px-2 py-0.5 font-semibold text-warning">
              {urgent} urgente{urgent === 1 ? "" : "s"}
            </span>
          )}
          {items.length}
        </span>
        {open ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        )}
      </button>

      {open && (
        <div className="space-y-2.5 border-t border-border p-3">
          <p className="text-[11px] text-muted-foreground">
            Ações dos seus planos que têm prazo mas ainda não têm horário. Toque para encaixar, ou
            arraste para a linha do tempo no computador.
          </p>
          {items.map((item) => {
            const slots =
              expanded === item.execution.id
                ? suggestSlotsFor(item, occupied, settings, { date: today, minute: nowMinute })
                : [];
            return (
              <div
                key={item.execution.id}
                className="rounded-xl border border-border bg-surface p-3"
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData(FIT_DRAG_TYPE, item.execution.id);
                  e.dataTransfer.effectAllowed = "move";
                }}
              >
                <div className="flex items-start gap-2">
                  <GripVertical className="mt-0.5 hidden h-4 w-4 shrink-0 text-muted-foreground md:block" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{item.execution.title}</p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground">
                      <Link
                        to="/objetivo/$id"
                        params={{ id: item.goal.id }}
                        className="truncate text-primary"
                      >
                        {item.goal.title}
                      </Link>
                      <span
                        className={`inline-flex items-center gap-1 ${item.overdue ? "text-danger" : item.soon ? "text-warning" : ""}`}
                      >
                        {(item.overdue || item.soon) && <AlertTriangle className="h-3 w-3" />}
                        prazo {deadlineText(item, today)}
                      </span>
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setExpanded(expanded === item.execution.id ? null : item.execution.id)
                    }
                    aria-expanded={expanded === item.execution.id}
                    className="interactive-press flex min-h-10 shrink-0 items-center gap-1 rounded-lg border border-border px-3 text-xs font-semibold"
                  >
                    <CalendarPlus className="h-3.5 w-3.5" /> Encaixar
                  </button>
                </div>

                {expanded === item.execution.id && (
                  <div className="mt-3 border-t border-border pt-3">
                    {slots.length > 0 ? (
                      <>
                        <p className="mb-1.5 flex items-center gap-1 text-[11px] text-muted-foreground">
                          <Clock className="h-3 w-3" /> Sugestões do Norte, em horários livres
                        </p>
                        <div className="agenda-chips">
                          {slots.map((slot) => (
                            <button
                              key={`${slot.date}${slot.start}`}
                              type="button"
                              className="agenda-chip"
                              onClick={() => void schedule(item, slot)}
                            >
                              {relativeDayLabel(slot.date, today).split(",")[0]}{" "}
                              {formatTime(slot.start, profile.timeFormat)}
                            </button>
                          ))}
                        </div>
                      </>
                    ) : (
                      <p className="text-[11px] text-muted-foreground">
                        Não há horário livre antes do prazo no seu dia habitual.
                      </p>
                    )}
                    <button
                      type="button"
                      onClick={() => onPick(item)}
                      className="mt-2 min-h-10 text-xs font-semibold text-primary"
                    >
                      Escolher outro dia e horário…
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
