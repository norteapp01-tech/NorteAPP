import { useMemo, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Filter,
  Pause,
  Plus,
  Search,
  Timer as TimerIcon,
  X,
} from "lucide-react";
import { AppMenuButton, UnderlineTabs } from "@/components/ui/app-design-system";
import { addDaysISO } from "@/lib/agenda-intervals";
import { weekdayOf } from "@/lib/agenda-recurrence";
import { formatLongDate } from "@/lib/agenda-navigation";
import {
  endOfPeriod,
  evaluateDay,
  evaluatePeriod,
  pauseOn,
  startOfPeriod,
  todayItem,
  versionAt,
  type Outcome,
} from "@/lib/habits/engine";
import { indexFor, useHabitData, type HabitData } from "@/lib/habits/store";
import { formatClock, viewOf } from "@/lib/habits/timer";
import type { Habit, TimeOfDay } from "@/lib/habits/types";
import { HabitDetail } from "./HabitDetail";
import { HabitEditor } from "./HabitEditor";
import { HabitToast, type ToastState } from "./HabitToast";
import { HabitRow, OutcomeMark, type LogDone } from "./HabitRow";
import { PauseSheet } from "./PauseSheet";
import { QuickValueSheet } from "./QuickValueSheet";
import { ReflectionsSheet } from "./ReflectionsSheet";
import { TimerSheet, useNow } from "./TimerSheet";
import {
  OUTCOME_LABEL,
  TIME_OF_DAY_LABEL,
  WEEKDAY_ABBR,
  goalText,
  scheduleText,
} from "@/lib/habits/format";
import "./habits.css";

type Tab = "hoje" | "semana" | "todas";
type Sheet =
  | { kind: "editor"; habitId?: string }
  | { kind: "detail"; habitId: string }
  | { kind: "quick"; habitId: string; date: string }
  | { kind: "timer"; habitId: string }
  | { kind: "pause"; habitId?: string }
  | { kind: "reflections" }
  | null;

const GROUP_ORDER: (TimeOfDay | "any")[] = ["morning", "afternoon", "evening", "any"];
const GROUP_LABEL: Record<TimeOfDay | "any", string> = {
  ...TIME_OF_DAY_LABEL,
  any: "Qualquer hora",
};

export function HabitsScreen() {
  const data = useHabitData();
  const [tab, setTab] = useState<Tab>("hoje");
  const [date, setDate] = useState<string | null>(null);
  const [weekAnchor, setWeekAnchor] = useState<string | null>(null);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [area, setArea] = useState("");
  const [query, setQuery] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [toast, setToast] = useState<ToastState>(null);

  const today = data.ctx.today;
  const shownDate = date ?? today;
  const areas = useMemo(
    () => [...new Set(data.habits.filter((h) => h.area).map((h) => h.area as string))].sort(),
    [data.habits],
  );
  const byId = (id?: string) => data.habits.find((h) => h.id === id);

  const onDone: LogDone = (message, undo) => {
    setToast({ message, undo });
    window.setTimeout(() => setToast((t) => (t?.message === message ? null : t)), 7000);
  };
  const onError = (message: string) => setToast({ message, error: true });

  const visible = (h: Habit) => {
    if (!showArchived && h.archivedAt) return false;
    if (showArchived && !h.archivedAt) return false;
    if (area && h.area !== area) return false;
    if (
      query.trim() &&
      !h.name.toLocaleLowerCase("pt-BR").includes(query.trim().toLocaleLowerCase("pt-BR"))
    )
      return false;
    return true;
  };

  const filtersActive = !!area || !!query.trim() || showArchived;
  const activePause = data.pauses.find(
    (p) => p.scope === "global" && today >= p.startDate && (!p.endDate || today <= p.endDate),
  );

  return (
    <main className="norte-page habits-page">
      <header className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[.2em] text-muted-foreground">
            Rotinas
          </p>
          <h1 className="norte-page-title mt-2">Seu ritmo, no seu tempo.</h1>
        </div>
        <AppMenuButton className="norte-local-global-action" />
      </header>

      <UnderlineTabs
        className="mt-6"
        items={
          [
            { key: "hoje", label: "Hoje" },
            { key: "semana", label: "Semana" },
            { key: "todas", label: "Todas" },
          ] as const
        }
        value={tab}
        onChange={setTab}
      />

      <div className="mt-4 flex items-center gap-2">
        <button
          type="button"
          onClick={() => setSheet({ kind: "editor" })}
          className="habit-new interactive-press"
        >
          <Plus className="h-4 w-4" /> Nova rotina
        </button>
        <button
          type="button"
          onClick={() => setFiltersOpen((v) => !v)}
          aria-expanded={filtersOpen}
          aria-label={filtersActive ? "Filtros (ativos)" : "Filtros"}
          className={`habit-icon-btn interactive-press ${filtersActive ? "text-primary" : ""}`}
        >
          <Filter className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => setSheet({ kind: "pause" })}
          aria-label="Pausar rotinas"
          className="habit-icon-btn interactive-press"
        >
          <Pause className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => setSheet({ kind: "reflections" })}
          className="habit-link ml-auto interactive-press"
        >
          Reflexões
        </button>
      </div>

      {filtersOpen && (
        <section className="card-surface mt-3 space-y-3 p-3" aria-label="Filtros">
          <label className="relative block">
            <Search
              className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground"
              aria-hidden
            />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar rotina"
              aria-label="Buscar rotina"
              className="min-h-11 w-full rounded-xl border border-border bg-surface pl-9 pr-3 text-sm outline-none focus:border-primary"
            />
          </label>
          {areas.length > 0 && (
            <div role="group" aria-label="Área" className="flex flex-wrap gap-2">
              <button
                type="button"
                aria-pressed={!area}
                onClick={() => setArea("")}
                className={`habit-chip-btn ${!area ? "is-on" : ""}`}
              >
                Todas as áreas
              </button>
              {areas.map((a) => (
                <button
                  key={a}
                  type="button"
                  aria-pressed={area === a}
                  onClick={() => setArea(a)}
                  className={`habit-chip-btn ${area === a ? "is-on" : ""}`}
                >
                  {a}
                </button>
              ))}
            </div>
          )}
          <label className="flex min-h-11 items-center gap-3 text-sm">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(e) => setShowArchived(e.target.checked)}
              className="h-5 w-5 accent-primary"
            />
            Ver arquivadas
          </label>
        </section>
      )}

      {activePause && (
        <p role="status" className="habit-banner mt-3">
          <Pause className="h-4 w-4 shrink-0" aria-hidden /> Todas as rotinas estão em pausa
          {activePause.endDate ? ` até ${activePause.endDate.split("-").reverse().join("/")}` : ""}.
          Nada conta como falha.{" "}
          <button className="font-semibold underline" onClick={() => setSheet({ kind: "pause" })}>
            Gerenciar
          </button>
        </p>
      )}

      <ActiveTimerCard data={data} onOpen={(id) => setSheet({ kind: "timer", habitId: id })} />

      <div className="mt-4" aria-live="polite">
        {data.loading && data.habits.length === 0 ? (
          <div className="space-y-3" role="status" aria-label="Carregando rotinas">
            <div className="card-surface h-20 animate-pulse" />
            <div className="card-surface h-20 animate-pulse" />
          </div>
        ) : data.error ? (
          <section className="card-surface p-5" role="alert">
            <p className="text-sm font-semibold">Não consegui carregar suas rotinas.</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Seus dados estão guardados. Verifique a conexão e tente de novo.
            </p>
            <button
              type="button"
              onClick={data.retry}
              className="interactive-press mt-3 min-h-10 rounded-full border border-primary/50 px-4 text-sm font-semibold text-primary"
            >
              Tentar de novo
            </button>
          </section>
        ) : data.habits.length === 0 ? (
          <Empty onCreate={() => setSheet({ kind: "editor" })} />
        ) : tab === "hoje" ? (
          <TodayTab
            data={data}
            date={shownDate}
            setDate={(d) => setDate(d === today ? null : d)}
            visible={visible}
            onOpen={(id) => setSheet({ kind: "detail", habitId: id })}
            onQuick={(id) => setSheet({ kind: "quick", habitId: id, date: shownDate })}
            onTimer={(id) => setSheet({ kind: "timer", habitId: id })}
            onDone={onDone}
            onError={onError}
          />
        ) : tab === "semana" ? (
          <WeekTab
            data={data}
            anchor={weekAnchor ?? today}
            setAnchor={(a) => setWeekAnchor(a)}
            visible={visible}
            onOpen={(id) => setSheet({ kind: "detail", habitId: id })}
            onCell={(id, d) => setSheet({ kind: "quick", habitId: id, date: d })}
          />
        ) : (
          <AllTab
            data={data}
            visible={visible}
            onOpen={(id) => setSheet({ kind: "detail", habitId: id })}
          />
        )}
      </div>

      <HabitToast toast={toast} onClose={() => setToast(null)} onUndoError={onError} />

      {sheet?.kind === "editor" && (
        <HabitEditor
          habit={byId(sheet.habitId)}
          reminders={data.reminders}
          knownAreas={areas}
          onClose={() => setSheet(null)}
          onSaved={(_id, created) => {
            setToast({ message: created ? "Rotina criada." : "Alterações salvas." });
            window.setTimeout(() => setToast(null), 4000);
          }}
        />
      )}
      {sheet?.kind === "detail" && byId(sheet.habitId) && (
        <HabitDetail
          habit={byId(sheet.habitId)!}
          habits={data.habits}
          chains={data.chains}
          ctx={data.ctx}
          onClose={() => setSheet(null)}
          onEdit={() => setSheet({ kind: "editor", habitId: sheet.habitId })}
          onQuick={() => setSheet({ kind: "quick", habitId: sheet.habitId, date: today })}
          onTimer={() => setSheet({ kind: "timer", habitId: sheet.habitId })}
          onPause={() => setSheet({ kind: "pause", habitId: sheet.habitId })}
        />
      )}
      {sheet?.kind === "quick" && byId(sheet.habitId) && (
        <QuickValueSheet
          habit={byId(sheet.habitId)!}
          date={sheet.date}
          onClose={() => setSheet(null)}
          onDone={onDone}
        />
      )}
      {sheet?.kind === "timer" && byId(sheet.habitId) && (
        <TimerSheet
          habit={byId(sheet.habitId)!}
          timer={data.timer}
          onClose={() => setSheet(null)}
          onDone={onDone}
        />
      )}
      {sheet?.kind === "pause" && (
        <PauseSheet
          habits={data.habits}
          pauses={data.pauses}
          habit={byId(sheet.habitId)}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet?.kind === "reflections" && (
        <ReflectionsSheet habits={data.habits} onClose={() => setSheet(null)} />
      )}
    </main>
  );
}

function Empty({ onCreate }: { onCreate: () => void }) {
  return (
    <section className="card-surface p-6 text-center">
      <h2 className="text-lg font-semibold">Comece pequeno</h2>
      <p className="mx-auto mt-2 max-w-xs text-sm text-muted-foreground">
        Uma rotina é algo que você quer construir, reduzir ou deixar de fazer. Conte em uma frase ou
        escolha um modelo.
      </p>
      <button
        type="button"
        onClick={onCreate}
        className="interactive-press mt-4 min-h-12 rounded-full bg-primary px-6 text-sm font-semibold text-primary-foreground"
      >
        Criar a primeira rotina
      </button>
    </section>
  );
}

function ActiveTimerCard({ data, onOpen }: { data: HabitData; onOpen: (habitId: string) => void }) {
  const timer = data.timer;
  const now = useNow(!!timer && timer.state === "running");
  if (!timer) return null;
  const habit = data.habits.find((h) => h.id === timer.habitId);
  const view = viewOf(timer, now);
  const main =
    view.remaining !== undefined ? formatClock(view.remaining) : formatClock(view.elapsed);
  return (
    <button
      type="button"
      onClick={() => onOpen(timer.habitId)}
      className="habit-timer-card interactive-press mt-4"
      aria-label={`Timer de ${habit?.name ?? "rotina"} em andamento`}
    >
      <TimerIcon className="h-5 w-5 text-primary" aria-hidden />
      <span className="min-w-0 flex-1 text-left">
        <strong className="block truncate">{habit?.name ?? "Rotina"}</strong>
        <span className="text-xs text-muted-foreground">
          {view.label} · {timer.state === "paused" ? "pausado" : "rodando"}
        </span>
      </span>
      <span className="font-mono text-lg font-bold tabular-nums">{main}</span>
    </button>
  );
}

function TodayTab({
  data,
  date,
  setDate,
  visible,
  onOpen,
  onQuick,
  onTimer,
  onDone,
  onError,
}: {
  data: HabitData;
  date: string;
  setDate: (d: string) => void;
  visible: (h: Habit) => boolean;
  onOpen: (id: string) => void;
  onQuick: (id: string) => void;
  onTimer: (id: string) => void;
  onDone: LogDone;
  onError: (m: string) => void;
}) {
  const ctxForDate = { ...data.ctx, today: data.ctx.today };
  const items = data.habits.filter(visible).map((h) => {
    const idx = indexFor(data, h.id);
    const day = evaluateDay(ctxForDate, h, idx, date);
    const period = evaluatePeriod(ctxForDate, h, idx, date);
    const base = todayItem(
      { ...data.ctx, today: date <= data.ctx.today ? date : data.ctx.today },
      h,
      idx,
    );
    const dayLogs = (idx.get(date) ?? []).filter((l) => !l.deletedAt);
    return {
      habit: h,
      day,
      period,
      due: base.due || day.hasEntries,
      settled: base.settled || day.outcome === "completed",
      dayLogs,
    };
  });
  const due = items.filter((i) => i.due);
  const pending = due.filter((i) => !i.settled);
  const settled = due.filter((i) => i.settled);
  const isToday = date === data.ctx.today;
  const earliest = data.ctx.today && addDaysISO(data.ctx.today, -27);

  const groups = GROUP_ORDER.map((g) => ({
    key: g,
    rows: pending.filter((i) => {
      const t = versionAt(i.habit, date)?.timesOfDay[0];
      return g === "any" ? !t : t === g;
    }),
  })).filter((g) => g.rows.length > 0);

  const row = (i: (typeof items)[number]) => (
    <HabitRow
      key={i.habit.id}
      habit={i.habit}
      day={i.day}
      period={i.period}
      date={date}
      todayLogs={i.dayLogs}
      onOpen={() => onOpen(i.habit.id)}
      onQuick={() => onQuick(i.habit.id)}
      onTimer={() => onTimer(i.habit.id)}
      onDone={onDone}
      onError={onError}
    />
  );

  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setDate(addDaysISO(date, -1))}
          disabled={!!earliest && date <= earliest}
          aria-label="Dia anterior"
          className="habit-icon-btn interactive-press disabled:opacity-30"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="text-center">
          <h2 className="text-base font-semibold">{isToday ? "Hoje" : formatLongDate(date)}</h2>
          {!isToday && <p className="text-[11px] text-primary">Registrando em um dia anterior</p>}
          {isToday && <p className="text-[11px] text-muted-foreground">{formatLongDate(date)}</p>}
        </div>
        <button
          type="button"
          onClick={() => setDate(addDaysISO(date, 1))}
          disabled={isToday}
          aria-label="Próximo dia"
          className="habit-icon-btn interactive-press disabled:opacity-30"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {due.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          Nada programado para este dia.
        </p>
      ) : (
        <>
          <p className="mt-3 text-xs text-muted-foreground">
            {settled.length} de {due.length} resolvidas
          </p>
          <div className="mt-2 space-y-5">
            {groups.map((g) => (
              <section key={g.key} aria-label={GROUP_LABEL[g.key]}>
                {(groups.length > 1 || g.key !== "any") && (
                  <h3 className="habit-group-title">{GROUP_LABEL[g.key]}</h3>
                )}
                <ul className="card-surface divide-y divide-border">{g.rows.map(row)}</ul>
              </section>
            ))}
            {settled.length > 0 && (
              <details className="habit-settled" open={pending.length === 0}>
                <summary>
                  {pending.length === 0 ? "Tudo resolvido" : "Resolvidas"} · {settled.length}
                </summary>
                <ul className="card-surface mt-2 divide-y divide-border">{settled.map(row)}</ul>
              </details>
            )}
          </div>
        </>
      )}
    </div>
  );
}

const CELL_OUTCOMES: Outcome[] = [];

function WeekTab({
  data,
  anchor,
  setAnchor,
  visible,
  onOpen,
  onCell,
}: {
  data: HabitData;
  anchor: string;
  setAnchor: (a: string) => void;
  visible: (h: Habit) => boolean;
  onOpen: (id: string) => void;
  onCell: (id: string, date: string) => void;
}) {
  const start = startOfPeriod(anchor, "week", data.ctx.weekStart);
  const days = Array.from({ length: 7 }, (_, i) => addDaysISO(start, i));
  const end = endOfPeriod(anchor, "week", data.ctx.weekStart);
  const rows = data.habits.filter(visible);
  const label = `${start.slice(8)}/${start.slice(5, 7)} – ${end.slice(8)}/${end.slice(5, 7)}`;
  void CELL_OUTCOMES;
  return (
    <div>
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setAnchor(addDaysISO(start, -1))}
          aria-label="Semana anterior"
          className="habit-icon-btn interactive-press"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <h2 className="text-base font-semibold">{label}</h2>
        <button
          type="button"
          onClick={() => setAnchor(addDaysISO(end, 1))}
          disabled={end >= data.ctx.today}
          aria-label="Próxima semana"
          className="habit-icon-btn interactive-press disabled:opacity-30"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
      {rows.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          Nenhuma rotina para mostrar.
        </p>
      ) : (
        <div className="card-surface mt-3 overflow-x-auto p-3">
          <table className="habit-week" aria-label={`Semana de ${label}`}>
            <thead>
              <tr>
                <th scope="col" className="text-left">
                  <span className="sr-only">Rotina</span>
                </th>
                {days.map((d) => (
                  <th key={d} scope="col" className={d === data.ctx.today ? "is-today" : ""}>
                    <span>{WEEKDAY_ABBR[weekdayOf(d)].slice(0, 1)}</span>
                    <b>{d.slice(8)}</b>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((h) => {
                const idx = indexFor(data, h.id);
                return (
                  <tr key={h.id}>
                    <th scope="row" className="text-left">
                      <button
                        type="button"
                        onClick={() => onOpen(h.id)}
                        className="habit-week-name interactive-press"
                      >
                        {h.name}
                      </button>
                    </th>
                    {days.map((d) => {
                      const e = evaluateDay(data.ctx, h, idx, d);
                      const paused = !!pauseOn(h, d, data.pauses);
                      const clickable = d <= data.ctx.today && e.outcome !== "before_start";
                      return (
                        <td key={d}>
                          <button
                            type="button"
                            disabled={!clickable}
                            onClick={() => onCell(h.id, d)}
                            aria-label={`${h.name}, ${d.split("-").reverse().join("/")}: ${OUTCOME_LABEL[paused && e.outcome === "paused" ? "paused" : e.outcome]}`}
                            className="habit-week-cell interactive-press"
                          >
                            {e.outcome === "not_scheduled" ||
                            e.outcome === "future" ||
                            e.outcome === "before_start" ? (
                              <span className="habit-dot" aria-hidden />
                            ) : (
                              <OutcomeMark outcome={e.outcome} size={18} />
                            )}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-3 text-[11px] text-muted-foreground">
        Toque em um dia para registrar ou corrigir. Cada símbolo tem nome — a cor não é a única
        pista.
      </p>
    </div>
  );
}

function AllTab({
  data,
  visible,
  onOpen,
}: {
  data: HabitData;
  visible: (h: Habit) => boolean;
  onOpen: (id: string) => void;
}) {
  const rows = data.habits.filter(visible);
  if (rows.length === 0)
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">Nenhuma rotina encontrada.</p>
    );
  return (
    <ul className="card-surface divide-y divide-border">
      {rows.map((h) => {
        const v = versionAt(h, data.ctx.today) ?? h.versions[h.versions.length - 1];
        const paused = !!pauseOn(h, data.ctx.today, data.pauses);
        return (
          <li key={h.id}>
            <button
              type="button"
              onClick={() => onOpen(h.id)}
              className="flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left interactive-press"
            >
              <span
                className="h-8 w-1.5 shrink-0 rounded-full"
                style={{ background: h.color ?? "var(--primary)" }}
                aria-hidden
              />
              <span className="min-w-0 flex-1">
                <strong className="block truncate">{h.name}</strong>
                <span className="block truncate text-xs text-muted-foreground">
                  {goalText(h, v)} · {scheduleText(v)}
                  {h.area ? ` · ${h.area}` : ""}
                </span>
              </span>
              {paused && <span className="habit-chip">Em pausa</span>}
              {h.archivedAt && <span className="habit-chip">Arquivada</span>}
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            </button>
          </li>
        );
      })}
    </ul>
  );
}
