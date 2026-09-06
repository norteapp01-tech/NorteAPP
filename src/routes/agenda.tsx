import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  MapPin,
  Lock,
  Link2,
  Target,
  X,
  Check,
  AlertTriangle,
} from "lucide-react";
import { categoryMeta } from "@/lib/mock-data";
import {
  useGoalsStore,
  agendaByDate,
  linkExecutionToGoal,
  effectiveStatus,
  isGoalComplete,
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

export const Route = createFileRoute("/agenda")({
  head: () => ({ meta: [{ title: "Agenda — Norte" }] }),
  component: AgendaScreen,
});

type View = "mes" | "semana" | "dia" | "ano";

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
  const [view, setView] = useState<View>("mes");
  const [cursor, setCursor] = useState(() => nowDate());
  const [selectedDate, setSelectedDate] = useState<string>(() => localISO(nowDate()));

  const executions = useGoalsStore((s) => s.executions);
  const eventsByDate = useMemo(() => agendaByDate(executions), [executions]);
  const profile = useProfile();

  const selectedEvents = eventsByDate[selectedDate] ?? [];

  return (
    <div className="px-5 pt-12">
      <header>
        <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Agenda</p>
        <h1 className="mt-1 text-3xl font-bold">Seus compromissos</h1>
        <p className="mt-2 text-sm text-muted-foreground text-balance-tight">
          Calendário limpo. Aqui vive o que tem hora marcada — sem planejamentos.
        </p>
      </header>

      <div className="mt-5 flex gap-1 rounded-2xl border border-border bg-surface p-1">
        {(["dia", "semana", "mes", "ano"] as View[]).map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`flex-1 rounded-xl py-2 text-xs font-semibold capitalize transition-colors ${view === v ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
          >
            {v === "dia" ? "Dia" : v === "semana" ? "Semana" : v === "mes" ? "Mês" : "Ano"}
          </button>
        ))}
      </div>

      {view === "mes" && (
        <MonthGrid
          cursor={cursor}
          setCursor={setCursor}
          eventsByDate={eventsByDate}
          selectedDate={selectedDate}
          onSelect={setSelectedDate}
          weekStart={profile.weekStart}
        />
      )}
      {view === "semana" && (
        <WeekStrip
          cursor={cursor}
          setCursor={setCursor}
          eventsByDate={eventsByDate}
          selectedDate={selectedDate}
          onSelect={setSelectedDate}
          weekStart={profile.weekStart}
        />
      )}
      {view === "dia" && (
        <DayView
          date={selectedDate}
          onNav={(d) => setSelectedDate(d)}
          eventsByDate={eventsByDate}
          timeFormat={profile.timeFormat}
        />
      )}
      {view === "ano" && (
        <YearGrid
          cursor={cursor}
          setCursor={setCursor}
          eventsByDate={eventsByDate}
          onPick={(d) => {
            setSelectedDate(d);
            setView("mes");
            setCursor(new Date(d));
          }}
        />
      )}

      {view !== "ano" && (
        <div className="mt-6">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
              {formatFullDate(selectedDate)}
            </h2>
            <Link
              to="/criar"
              search={{ modo: "agenda" }}
              className="flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-semibold text-primary"
            >
              <Plus className="h-3 w-3" /> novo
            </Link>
          </div>
          <div className="mt-3 space-y-2.5">
            {selectedEvents.length === 0 ? (
              <div className="card-surface p-6 text-center">
                <p className="text-sm text-muted-foreground">Nada agendado nesse dia.</p>
              </div>
            ) : (
              selectedEvents.map((e) => (
                <EventCard
                  key={`${e.id}-${e.agendaSessionId ?? e.agendaDate}`}
                  e={e}
                  timeFormat={profile.timeFormat}
                />
              ))
            )}
          </div>
        </div>
      )}

      <div className="mt-6 rounded-2xl border border-border bg-surface/60 p-4 text-xs text-muted-foreground">
        <span className="font-semibold text-foreground">Agenda ≠ Planejamento.</span> Aqui só entram
        compromissos com hora. Planejamentos vivem na aba{" "}
        <Link to="/planejamento" className="text-primary underline">
          Plano
        </Link>
        .
      </div>
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
  weekStart,
}: {
  cursor: Date;
  setCursor: (d: Date) => void;
  eventsByDate: Record<string, Execution[]>;
  selectedDate: string;
  onSelect: (d: string) => void;
  weekStart: WeekStart;
}) {
  const start = startOfWeekLocal(cursor, weekStart);
  const week = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
  return (
    <div className="card-surface mt-4 p-4">
      <div className="flex items-center justify-between">
        <button
          onClick={() => {
            const d = new Date(cursor);
            d.setDate(d.getDate() - 7);
            setCursor(d);
          }}
          className="rounded-full p-1.5 hover:bg-surface-2"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <p className="text-sm font-bold">
          Semana de {start.getDate()}/{start.getMonth() + 1}
        </p>
        <button
          onClick={() => {
            const d = new Date(cursor);
            d.setDate(d.getDate() + 7);
            setCursor(d);
          }}
          className="rounded-full p-1.5 hover:bg-surface-2"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
      <div className="mt-3 grid grid-cols-7 gap-1.5">
        {week.map((d) => {
          const iso = localISO(d);
          const evts = eventsByDate[iso] ?? [];
          const isSel = iso === selectedDate;
          return (
            <button
              key={iso}
              onClick={() => onSelect(iso)}
              className={`rounded-lg p-2 text-center transition-colors ${isSel ? "bg-primary text-primary-foreground" : "bg-surface-2"}`}
            >
              <p className="text-[10px] uppercase">{weekLabels[d.getDay()]}</p>
              <p className="mt-1 text-base font-bold">{d.getDate()}</p>
              <p className="mt-1 text-[10px] opacity-80">
                {evts.length ? `${evts.length} ev` : "—"}
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function DayView({
  date,
  onNav,
  eventsByDate,
  timeFormat,
}: {
  date: string;
  onNav: (d: string) => void;
  eventsByDate: Record<string, Execution[]>;
  timeFormat: TimeFormat;
}) {
  const d = new Date(date + "T00:00:00");
  const shift = (n: number) => {
    const x = new Date(d);
    x.setDate(d.getDate() + n);
    onNav(localISO(x));
  };
  const hours = Array.from({ length: 15 }, (_, i) => 7 + i);
  const evts = eventsByDate[date] ?? [];
  return (
    <div className="card-surface mt-4 p-4">
      <div className="flex items-center justify-between">
        <button onClick={() => shift(-1)} className="rounded-full p-1.5 hover:bg-surface-2">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <p className="text-sm font-bold">{formatFullDate(date)}</p>
        <button onClick={() => shift(1)} className="rounded-full p-1.5 hover:bg-surface-2">
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
      <div className="mt-3 space-y-0.5">
        {hours.map((h) => {
          const hh = String(h).padStart(2, "0");
          const ev = evts.find((e) => e.startTime?.startsWith(hh));
          return (
            <div key={h} className="flex items-start gap-3">
              <span className="w-12 pt-1 font-mono text-[10px] text-muted-foreground">
                {formatTime(`${hh}:00`, timeFormat)}
              </span>
              <div className="flex-1 border-t border-border/50 py-2">
                {ev && (
                  <div className="rounded-lg border border-primary/30 bg-primary/10 p-2">
                    <p className="text-xs font-semibold">{ev.title}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {formatTime(ev.startTime, timeFormat)}
                      {ev.endTime ? `–${formatTime(ev.endTime, timeFormat)}` : ""}{" "}
                      {ev.location ? `· ${ev.location}` : ""}
                    </p>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
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

function formatFullDate(iso: string) {
  const d = new Date(iso + "T00:00:00");
  const dias = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
  return `${dias[d.getDay()]}, ${d.getDate()} ${monthNames[d.getMonth()].slice(0, 3)}`;
}
