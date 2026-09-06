import { createFileRoute, Link } from "@tanstack/react-router";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Plus,
  MapPin,
  Lock,
  Link2,
  Target,
  X,
  Check,
  AlertTriangle,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { categoryMeta } from "@/lib/mock-data";
import {
  useGoalsStore,
  agendaByDate,
  linkExecutionToGoal,
  effectiveStatus,
  isGoalComplete,
  removeAgendaSession,
  updateAgendaSession,
  type Execution,
} from "@/lib/goals-store";
import { useProfile } from "@/lib/profile-store";
import {
  formatTime,
  startOfWeekLocal,
  weekdayLabelsFor,
  weekStartsOnFor,
} from "@/lib/format-utils";
import type { TimeFormat, WeekStart } from "@/lib/profile-store";
import { nowDate } from "@/lib/test-clock";
import { Modal } from "@/components/ui/modal";
import {
  ScheduleFields,
  scheduleTimesValid,
  type ScheduleValue,
} from "@/components/plan/ScheduleFields";

export const Route = createFileRoute("/agenda")({
  head: () => ({ meta: [{ title: "Agenda — Norte" }] }),
  component: AgendaScreen,
});

const monthNames = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];
const weekLabels = ["D", "S", "T", "Q", "Q", "S", "S"];

function localISO(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function AgendaScreen() {
  const [cursor, setCursor] = useState(() => nowDate());
  const [selectedDate, setSelectedDate] = useState<string>(() => localISO(nowDate()));
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);

  const executions = useGoalsStore((s) => s.executions);
  const eventsByDate = useMemo(() => agendaByDate(executions), [executions]);
  const profile = useProfile();

  const selectedEvents = eventsByDate[selectedDate] ?? [];
  const occupiedMinutes = selectedEvents.reduce((sum, event) => {
    const start = timeToMinutes(event.startTime ?? "00:00");
    const end = timeToMinutes(event.endTime ?? event.startTime ?? "00:00");
    return sum + Math.max(0, end - start);
  }, 0);
  const availableMinutes = Math.max(0, 15 * 60 - occupiedMinutes);

  return (
    <div className="px-5 pt-12">
      <header className="relative pr-14">
        <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Agenda</p>
        <h1 className="mt-1 text-3xl font-bold">Seus compromissos</h1>
        <p className="mt-2 text-sm text-muted-foreground">Seu tempo, com clareza.</p>
        <button
          onClick={() => setCalendarOpen(true)}
          aria-label="Abrir calendário do mês"
          className="absolute right-0 top-0 flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-surface text-muted-foreground hover:border-primary/40 hover:text-primary"
        >
          <CalendarDays className="h-5 w-5" />
        </button>
      </header>

      <WeekStrip
        cursor={cursor}
        setCursor={setCursor}
        eventsByDate={eventsByDate}
        selectedDate={selectedDate}
        onSelect={(date) => {
          setSelectedDate(date);
          setCursor(new Date(date + "T00:00:00"));
        }}
        onOpenCalendar={() => setCalendarOpen(true)}
        weekStart={profile.weekStart}
      />

      <p className="mt-3 text-center text-[11px] text-muted-foreground">
        {selectedEvents.length} compromisso{selectedEvents.length === 1 ? "" : "s"} ·{" "}
        {formatMinutes(occupiedMinutes)} ocupada · {formatMinutes(availableMinutes)} livres
      </p>

      <div className="mt-6 flex items-center justify-between">
        <h2 className="text-base font-semibold">{formatLongDate(selectedDate)}</h2>
        <Link
          to="/criar"
          search={{ modo: "agenda" }}
          className="flex min-h-11 items-center gap-1 px-2 text-xs font-semibold text-primary"
        >
          <Plus className="h-4 w-4" /> Novo
        </Link>
      </div>

      <DayView date={selectedDate} events={selectedEvents} timeFormat={profile.timeFormat} />

      <div className="card-surface mt-5 overflow-hidden">
        <button
          onClick={() => setDetailsOpen((open) => !open)}
          className="flex min-h-14 w-full items-center justify-between gap-3 px-4 py-3 text-left"
        >
          <span className="font-semibold">Agenda detalhada</span>
          <span className="ml-auto text-xs text-muted-foreground">
            {selectedEvents.length} compromisso{selectedEvents.length === 1 ? "" : "s"}
          </span>
          {detailsOpen ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </button>
        {detailsOpen && (
          <div className="space-y-2.5 border-t border-border p-3">
            {selectedEvents.length === 0 ? (
              <p className="py-5 text-center text-sm text-muted-foreground">
                Nada agendado nesse dia.
              </p>
            ) : (
              selectedEvents.map((event) => (
                <EventCard
                  key={`${event.id}-${event.agendaSessionId ?? event.agendaDate}`}
                  e={event}
                  timeFormat={profile.timeFormat}
                />
              ))
            )}
          </div>
        )}
      </div>

      <div className="mt-6 rounded-2xl border border-border bg-surface/60 p-4 text-xs text-muted-foreground">
        <span className="font-semibold text-foreground">Agenda ≠ Planejamento.</span> Aqui só entram
        compromissos com hora. Planejamentos vivem na aba{" "}
        <Link to="/planejamento" className="text-primary underline">
          Plano
        </Link>
        .
      </div>

      {calendarOpen && (
        <CalendarPicker
          cursor={cursor}
          setCursor={setCursor}
          eventsByDate={eventsByDate}
          selectedDate={selectedDate}
          onSelect={(date) => {
            setSelectedDate(date);
            setCursor(new Date(date + "T00:00:00"));
            setCalendarOpen(false);
          }}
          weekStart={profile.weekStart}
          onClose={() => setCalendarOpen(false)}
        />
      )}
    </div>
  );
}

function EventCard({ e, timeFormat }: { e: Execution; timeFormat: TimeFormat }) {
  const cat = categoryMeta[e.category] ?? categoryMeta.generico;
  const goals = useGoalsStore((s) => s.goals);
  const linkedGoal = goals.find((g) => g.id === e.goalId);
  const [picker, setPicker] = useState(false);
  const [busy, setBusy] = useState(false);
  const status = effectiveStatus(e);

  return (
    <div className={`card-surface p-3.5 ${e.status === "cancelada" ? "opacity-50" : ""}`}>
      <div className="flex items-start gap-3">
        <div className="flex flex-col items-center rounded-lg bg-surface-2 px-2.5 py-2">
          <span className="font-mono text-sm font-bold">
            {formatTime(e.startTime, timeFormat)}
            {e.endTime ? `–${formatTime(e.endTime, timeFormat)}` : ""}
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
              {cat.emoji} {cat.label}
            </span>
            {e.rigid && (
              <span className="flex items-center gap-1 rounded-full bg-danger/15 px-1.5 py-0.5 text-[10px] font-semibold text-danger">
                <Lock className="h-2.5 w-2.5" />
                rígido
              </span>
            )}
            {status === "concluida" && (
              <span className="flex items-center gap-1 rounded-full bg-success/15 px-1.5 py-0.5 text-[10px] font-semibold text-success">
                <Check className="h-2.5 w-2.5" />
                feita
              </span>
            )}
            {status === "perdida" && (
              <span className="flex items-center gap-1 rounded-full bg-danger/15 px-1.5 py-0.5 text-[10px] font-semibold text-danger">
                <AlertTriangle className="h-2.5 w-2.5" />
                perdida
              </span>
            )}
            {e.status === "cancelada" && (
              <span className="rounded-full bg-surface-2 px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                descartada
              </span>
            )}
          </div>
          <p className="mt-1 font-semibold leading-snug">{e.title}</p>
          {e.how && <p className="mt-0.5 text-[11px] text-muted-foreground">{e.how}</p>}
          {e.location && (
            <p className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
              <MapPin className="h-3 w-3" /> {e.location}
            </p>
          )}
          {linkedGoal ? (
            <Link
              to="/objetivo/$id"
              params={{ id: linkedGoal.id }}
              className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2 py-1 text-[10px] font-semibold text-primary hover:bg-primary/20"
            >
              <Target className="h-3 w-3" /> {linkedGoal.title}
            </Link>
          ) : (
            <button
              onClick={() => setPicker(true)}
              className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-dashed border-border px-2 py-1 text-[10px] font-medium text-muted-foreground hover:border-primary/50 hover:text-primary"
            >
              <Link2 className="h-3 w-3" /> vincular a planejamento
            </button>
          )}
        </div>
        {linkedGoal && (
          <button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await linkExecutionToGoal(e.id, null);
              } finally {
                setBusy(false);
              }
            }}
            className="text-muted-foreground hover:text-danger disabled:opacity-50"
            title="Desvincular"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      {picker && (
        <GoalPicker
          onPick={async (id) => {
            setBusy(true);
            try {
              await linkExecutionToGoal(e.id, id);
              setPicker(false);
            } finally {
              setBusy(false);
            }
          }}
          onClose={() => setPicker(false)}
        />
      )}
    </div>
  );
}

function GoalPicker({ onPick, onClose }: { onPick: (id: string) => void; onClose: () => void }) {
  const goals = useGoalsStore((s) => s.goals);
  const steps = useGoalsStore((s) => s.steps);
  const executions = useGoalsStore((s) => s.executions);
  // Plano concluído não recebe novos compromissos — só planos ativos aparecem aqui.
  const activeGoals = goals.filter((g) => !isGoalComplete(g, steps, executions));
  return (
    <Modal onClose={onClose} title="Vincular a um planejamento">
      <p className="text-xs text-muted-foreground">
        Toque num planejamento. Este compromisso vai contar como avanço.
      </p>
      <div className="mt-4 space-y-2">
        {activeGoals.length === 0 && (
          <p className="p-4 text-center text-sm text-muted-foreground">
            Nenhum plano ativo pra vincular.
          </p>
        )}
        {activeGoals.map((g) => {
          const c = categoryMeta[g.category] ?? categoryMeta.generico;
          return (
            <button
              key={g.id}
              onClick={() => onPick(g.id)}
              className="card-surface flex w-full items-center gap-3 p-3 text-left hover:border-primary/40"
            >
              <span className="text-lg">{c.emoji}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{g.title}</p>
                <p className="text-[11px] text-muted-foreground">
                  {g.lifeArea} · prazo {g.deadlineLabel}
                </p>
              </div>
            </button>
          );
        })}
      </div>
    </Modal>
  );
}

function MonthGrid({
  cursor,
  setCursor,
  eventsByDate,
  selectedDate,
  onSelect,
  weekStart,
}: {
  cursor: Date;
  setCursor: (d: Date) => void;
  eventsByDate: Record<string, Execution[]>;
  selectedDate: string;
  onSelect: (d: string) => void;
  weekStart: WeekStart;
}) {
  const y = cursor.getFullYear();
  const m = cursor.getMonth();
  const first = new Date(y, m, 1).getDay();
  const leadingBlanks = (first - weekStartsOnFor(weekStart) + 7) % 7;
  const days = new Date(y, m + 1, 0).getDate();
  const cells: (Date | null)[] = [];
  for (let i = 0; i < leadingBlanks; i++) cells.push(null);
  for (let d = 1; d <= days; d++) cells.push(new Date(y, m, d));
  const todayIso = localISO(nowDate());
  const orderedLabels = weekdayLabelsFor(weekStart, weekLabels);

  return (
    <div className="card-surface mt-4 p-4">
      <div className="flex items-center justify-between">
        <button
          onClick={() => setCursor(new Date(y, m - 1, 1))}
          className="rounded-full p-1.5 hover:bg-surface-2"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <p className="text-sm font-bold">
          {monthNames[m]} {y}
        </p>
        <button
          onClick={() => setCursor(new Date(y, m + 1, 1))}
          className="rounded-full p-1.5 hover:bg-surface-2"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
      <div className="mt-3 grid grid-cols-7 gap-1 text-center text-[10px] uppercase text-muted-foreground">
        {orderedLabels.map((d, i) => (
          <div key={i}>{d}</div>
        ))}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1">
        {cells.map((c, i) => {
          if (!c) return <div key={i} />;
          const iso = localISO(c);
          const evts = eventsByDate[iso] ?? [];
          const isToday = iso === todayIso;
          const isSel = iso === selectedDate;
          return (
            <button
              key={i}
              onClick={() => onSelect(iso)}
              className={`aspect-square rounded-lg text-xs font-medium transition-colors ${isSel ? "bg-primary text-primary-foreground" : isToday ? "border border-primary/50 bg-primary/10 text-primary" : "hover:bg-surface-2"}`}
            >
              <div className="flex h-full flex-col items-center justify-center">
                <span>{c.getDate()}</span>
                {evts.length > 0 && (
                  <div className="mt-0.5 flex gap-0.5">
                    {evts.slice(0, 3).map((_, k) => (
                      <span
                        key={k}
                        className={`h-1 w-1 rounded-full ${isSel ? "bg-primary-foreground" : "bg-primary"}`}
                      />
                    ))}
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function WeekStrip({
  cursor,
  setCursor,
  eventsByDate,
  selectedDate,
  onSelect,
  onOpenCalendar,
  weekStart,
}: {
  cursor: Date;
  setCursor: (d: Date) => void;
  eventsByDate: Record<string, Execution[]>;
  selectedDate: string;
  onSelect: (d: string) => void;
  onOpenCalendar: () => void;
  weekStart: WeekStart;
}) {
  const start = startOfWeekLocal(cursor, weekStart);
  const week = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
  return (
    <div className="card-surface mt-6 overflow-hidden">
      <div className="flex items-center justify-between">
        <button
          onClick={() => {
            const d = new Date(cursor);
            d.setDate(d.getDate() - 7);
            setCursor(d);
          }}
          className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-surface-2"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button
          onClick={onOpenCalendar}
          className="flex min-h-11 items-center gap-1.5 px-3 text-sm font-bold"
        >
          {monthNames[new Date(selectedDate + "T00:00:00").getMonth()]}{" "}
          {new Date(selectedDate + "T00:00:00").getFullYear()}
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
        <button
          onClick={() => {
            const d = new Date(cursor);
            d.setDate(d.getDate() + 7);
            setCursor(d);
          }}
          className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-surface-2"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1 px-3 pb-4">
        {week.map((d) => {
          const iso = localISO(d);
          const evts = eventsByDate[iso] ?? [];
          const isSel = iso === selectedDate;
          return (
            <button
              key={iso}
              onClick={() => onSelect(iso)}
              className={`flex min-h-16 flex-col items-center justify-center rounded-2xl px-1 text-center transition-colors ${isSel ? "bg-primary text-primary-foreground" : "hover:bg-surface-2"}`}
            >
              <p className="text-[9px] uppercase opacity-75">{weekLabels[d.getDay()]}</p>
              <p className="mt-1 text-base font-bold">{d.getDate()}</p>
              <span
                className={`mt-1 h-1 w-1 rounded-full ${evts.length > 0 ? (isSel ? "bg-primary-foreground" : "bg-primary") : "bg-transparent"}`}
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}

function DayView({
  date,
  events,
  timeFormat,
}: {
  date: string;
  events: Execution[];
  timeFormat: TimeFormat;
}) {
  const startHour = 7;
  const endHour = 22;
  const hourHeight = 52;
  const hours = Array.from({ length: endHour - startHour + 1 }, (_, i) => startHour + i);
  return (
    <div className="card-surface relative mt-3 overflow-hidden px-3 py-4">
      <div className="relative ml-14" style={{ height: (endHour - startHour) * hourHeight }}>
        {hours.map((hour, index) => (
          <div
            key={hour}
            className="absolute right-0 left-0 border-t border-border/50"
            style={{ top: index * hourHeight }}
          >
            <span className="absolute -left-14 -translate-y-1/2 font-mono text-[10px] text-muted-foreground">
              {formatTime(`${String(hour).padStart(2, "0")}:00`, timeFormat)}
            </span>
          </div>
        ))}
        {events.map((event) => (
          <AgendaEventBlock
            key={`${event.id}-${event.agendaSessionId ?? event.agendaDate}`}
            event={event}
            date={date}
            startHour={startHour}
            endHour={endHour}
            hourHeight={hourHeight}
            timeFormat={timeFormat}
          />
        ))}
      </div>
    </div>
  );
}

function AgendaEventBlock({
  event,
  date,
  startHour,
  endHour,
  hourHeight,
  timeFormat,
}: {
  event: Execution;
  date: string;
  startHour: number;
  endHour: number;
  hourHeight: number;
  timeFormat: TimeFormat;
}) {
  const initialStart = timeToMinutes(event.startTime ?? `${String(startHour).padStart(2, "0")}:00`);
  const initialEnd = timeToMinutes(event.endTime ?? minutesToTime(initialStart + 60));
  const [start, setStart] = useState(initialStart);
  const [end, setEnd] = useState(Math.max(initialStart + 15, initialEnd));
  const [menuOpen, setMenuOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [schedule, setSchedule] = useState<ScheduleValue>({
    date,
    startTime: event.startTime ?? minutesToTime(initialStart),
    endTime: event.endTime ?? minutesToTime(initialEnd),
  });
  const drag = useRef<{
    mode: "move" | "resize";
    y: number;
    start: number;
    end: number;
    moved: boolean;
  } | null>(null);
  const preview = useRef({ start: initialStart, end: Math.max(initialStart + 15, initialEnd) });

  useEffect(() => {
    const nextStart = timeToMinutes(event.startTime ?? `${String(startHour).padStart(2, "0")}:00`);
    const nextEnd = timeToMinutes(event.endTime ?? minutesToTime(nextStart + 60));
    setStart(nextStart);
    setEnd(Math.max(nextStart + 15, nextEnd));
    preview.current = { start: nextStart, end: Math.max(nextStart + 15, nextEnd) };
    setSchedule({
      date,
      startTime: event.startTime ?? minutesToTime(nextStart),
      endTime: event.endTime ?? minutesToTime(nextEnd),
    });
  }, [date, event.endTime, event.startTime, startHour]);

  const beginDrag = (mode: "move" | "resize", e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { mode, y: e.clientY, start, end, moved: false };
  };

  const moveDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    const delta = Math.round(((e.clientY - drag.current.y) / hourHeight) * 4) * 15;
    if (Math.abs(delta) >= 15) drag.current.moved = true;
    const min = startHour * 60;
    const max = endHour * 60;
    if (drag.current.mode === "move") {
      const duration = drag.current.end - drag.current.start;
      const nextStart = Math.max(min, Math.min(max - duration, drag.current.start + delta));
      setStart(nextStart);
      setEnd(nextStart + duration);
      preview.current = { start: nextStart, end: nextStart + duration };
    } else {
      const nextEnd = Math.max(drag.current.start + 15, Math.min(max, drag.current.end + delta));
      setEnd(nextEnd);
      preview.current = { start: drag.current.start, end: nextEnd };
    }
  };

  const finishDrag = async (e: ReactPointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    const changed = drag.current?.moved;
    drag.current = null;
    if (!changed) {
      setMenuOpen(true);
      return;
    }
    setSaving(true);
    try {
      await updateAgendaSession(
        event.id,
        event.agendaSessionId,
        date,
        minutesToTime(preview.current.start),
        minutesToTime(preview.current.end),
      );
    } finally {
      setSaving(false);
    }
  };

  const top = ((start - startHour * 60) / 60) * hourHeight;
  const height = Math.max(34, ((end - start) / 60) * hourHeight);

  return (
    <>
      <div
        onPointerDown={(e) => beginDrag("move", e)}
        onPointerMove={moveDrag}
        onPointerUp={finishDrag}
        className={`absolute right-1 left-0 z-10 touch-none select-none rounded-xl border border-primary/40 bg-primary/10 px-3 py-2 text-left shadow-sm ${saving ? "opacity-60" : "cursor-grab active:cursor-grabbing"}`}
        style={{ top, height }}
        role="button"
        tabIndex={0}
        aria-label={`${event.title}. Arraste para mudar o horário ou toque para mais opções.`}
      >
        <p className="truncate text-xs font-semibold">{event.title}</p>
        <p className="text-[10px] text-muted-foreground">
          {formatTime(minutesToTime(start), timeFormat)}–
          {formatTime(minutesToTime(end), timeFormat)}
        </p>
        <div
          onPointerDown={(e) => beginDrag("resize", e)}
          onPointerMove={moveDrag}
          onPointerUp={finishDrag}
          className="absolute right-0 bottom-0 left-0 flex h-4 touch-none items-end justify-center pb-1"
          aria-label="Ajustar duração"
        >
          <span className="h-0.5 w-8 rounded-full bg-primary/60" />
        </div>
      </div>

      {menuOpen && (
        <Modal onClose={() => setMenuOpen(false)} title={event.title}>
          {!deleting ? (
            <div>
              <p className="text-xs text-muted-foreground">
                {formatLongDate(schedule.date)} · {schedule.startTime}–{schedule.endTime}
              </p>
              <div className="mt-4">
                <ScheduleFields
                  value={schedule}
                  onChange={setSchedule}
                  disabled={saving}
                  size="md"
                />
              </div>
              <button
                disabled={!scheduleTimesValid(schedule) || saving}
                onClick={async () => {
                  setSaving(true);
                  try {
                    await updateAgendaSession(
                      event.id,
                      event.agendaSessionId,
                      schedule.date,
                      schedule.startTime,
                      schedule.endTime,
                    );
                    setMenuOpen(false);
                  } finally {
                    setSaving(false);
                  }
                }}
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground disabled:opacity-40"
              >
                <RotateCcw className="h-4 w-4" /> {saving ? "Salvando…" : "Reagendar"}
              </button>
              <button
                onClick={() => setDeleting(true)}
                className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl border border-danger/40 py-3 text-sm font-semibold text-danger"
              >
                <Trash2 className="h-4 w-4" /> Excluir da Agenda
              </button>
            </div>
          ) : (
            <div>
              <p className="text-sm font-semibold">Excluir este compromisso da Agenda?</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {event.goalId
                  ? "A ação continuará existindo no planejamento e poderá ser agendada novamente."
                  : "O compromisso deixará de aparecer no calendário."}
              </p>
              <button
                disabled={saving}
                onClick={async () => {
                  setSaving(true);
                  try {
                    await removeAgendaSession(event.id, event.agendaSessionId);
                    setMenuOpen(false);
                  } finally {
                    setSaving(false);
                  }
                }}
                className="mt-4 w-full rounded-xl bg-danger py-3 text-sm font-semibold text-white disabled:opacity-40"
              >
                {saving ? "Excluindo…" : "Sim, excluir da Agenda"}
              </button>
              <button
                onClick={() => setDeleting(false)}
                className="mt-2 w-full rounded-xl border border-border py-3 text-sm text-muted-foreground"
              >
                Cancelar
              </button>
            </div>
          )}
        </Modal>
      )}
    </>
  );
}

function CalendarPicker({
  cursor,
  setCursor,
  eventsByDate,
  selectedDate,
  onSelect,
  weekStart,
  onClose,
}: {
  cursor: Date;
  setCursor: (date: Date) => void;
  eventsByDate: Record<string, Execution[]>;
  selectedDate: string;
  onSelect: (date: string) => void;
  weekStart: WeekStart;
  onClose: () => void;
}) {
  const [annual, setAnnual] = useState(false);
  return (
    <Modal onClose={onClose} title={annual ? "Escolher mês" : "Escolher data"}>
      <button
        onClick={() => setAnnual((value) => !value)}
        className="mx-auto flex min-h-11 items-center gap-1 text-sm font-semibold text-primary"
      >
        {annual ? "Voltar ao mês" : `Ver ${cursor.getFullYear()} completo`}
        <ChevronRight className="h-3.5 w-3.5" />
      </button>
      {annual ? (
        <YearGrid
          cursor={cursor}
          setCursor={setCursor}
          eventsByDate={eventsByDate}
          onPick={(date) => {
            setCursor(new Date(date + "T00:00:00"));
            setAnnual(false);
          }}
        />
      ) : (
        <MonthGrid
          cursor={cursor}
          setCursor={setCursor}
          eventsByDate={eventsByDate}
          selectedDate={selectedDate}
          onSelect={onSelect}
          weekStart={weekStart}
        />
      )}
    </Modal>
  );
}

function YearGrid({
  cursor,
  setCursor,
  eventsByDate,
  onPick,
}: {
  cursor: Date;
  setCursor: (d: Date) => void;
  eventsByDate: Record<string, Execution[]>;
  onPick: (iso: string) => void;
}) {
  const y = cursor.getFullYear();
  const counts = (m: number) => {
    let c = 0;
    for (const k in eventsByDate)
      if (
        new Date(k + "T00:00:00").getFullYear() === y &&
        new Date(k + "T00:00:00").getMonth() === m
      )
        c += eventsByDate[k].length;
    return c;
  };
  return (
    <div className="card-surface mt-4 p-4">
      <div className="flex items-center justify-between">
        <button
          onClick={() => setCursor(new Date(y - 1, 0, 1))}
          className="rounded-full p-1.5 hover:bg-surface-2"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <p className="text-sm font-bold">{y}</p>
        <button
          onClick={() => setCursor(new Date(y + 1, 0, 1))}
          className="rounded-full p-1.5 hover:bg-surface-2"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2">
        {monthNames.map((mn, i) => (
          <button
            key={mn}
            onClick={() => onPick(localISO(new Date(y, i, 1)))}
            className="rounded-xl border border-border bg-surface-2 p-3 text-left hover:border-primary/40"
          >
            <p className="text-xs font-bold">{mn.slice(0, 3)}</p>
            <p className="mt-1 text-[10px] text-muted-foreground">{counts(i)} eventos</p>
            <div className="mt-2 h-1 overflow-hidden rounded-full bg-border">
              <div
                className="h-full bg-primary"
                style={{ width: `${Math.min(counts(i) * 15, 100)}%` }}
              />
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function formatLongDate(iso: string) {
  const date = new Date(iso + "T00:00:00");
  const weekdays = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
  return `${weekdays[date.getDay()]}, ${date.getDate()} de ${monthNames[date.getMonth()].toLowerCase()}`;
}

function timeToMinutes(time: string) {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

function minutesToTime(total: number) {
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function formatMinutes(total: number) {
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  if (hours === 0) return `${minutes}min`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h${String(minutes).padStart(2, "0")}`;
}
