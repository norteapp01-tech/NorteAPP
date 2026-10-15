import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Plus,
  Search,
  CalendarSync,
  SlidersHorizontal,
  Tag,
} from "lucide-react";
import { AppMenuButton, WeekdaySelector } from "@/components/ui/app-design-system";
import { SettingsPanel } from "@/components/settings/SettingsPanel";
import { AgendaFeedbackProvider, useAgendaFeedback } from "@/components/agenda/agenda-feedback";
import { AgendaSettingsSheet } from "@/components/agenda/AgendaSettingsSheet";
import { CalendarPicker } from "@/components/agenda/CalendarPicker";
import { DayView } from "@/components/agenda/DayView";
import { EventComposer, type ComposerSeed } from "@/components/agenda/EventComposer";
import { EventSheet } from "@/components/agenda/EventSheet";
import { FilterSheet } from "@/components/agenda/FilterSheet";
import { FitList } from "@/components/agenda/FitList";
import { LabelManager } from "@/components/agenda/LabelManager";
import { LabelFilterChips } from "@/components/agenda/LabelChips";
import { MonthView } from "@/components/agenda/MonthView";
import { OccurrenceCard } from "@/components/agenda/OccurrenceCard";
import { SearchSheet } from "@/components/agenda/SearchSheet";
import type { CommitPatch } from "@/components/agenda/Timeline";
import { UpcomingView } from "@/components/agenda/UpcomingView";
import { useAgendaData, useSeriesMaterialization } from "@/components/agenda/use-agenda-data";
import type { ViewProps } from "@/components/agenda/view-types";
import { WeekView } from "@/components/agenda/WeekView";
import { conflictingIds, findConflicts } from "@/lib/agenda-intervals";
import {
  formatLongDate,
  rangeForView,
  shiftDate,
  titleForView,
  weekDates,
  WEEKDAY_LETTERS,
} from "@/lib/agenda-navigation";
import { minutesToTime, timeToMinutes } from "@/lib/agenda-time";
import type { AgendaOccurrence } from "@/lib/agenda-occurrences";
import { weekdayOf } from "@/lib/agenda-recurrence";
import {
  EMPTY_FILTERS,
  filterOccurrences,
  hasActiveFilters,
  toConflictable,
  type AgendaFilters,
} from "@/lib/agenda-search";
import type { AgendaView } from "@/lib/agenda-settings";
import { moveOccurrence } from "@/lib/agenda-series-store";
import { removeAgendaSession, scheduleExecution, todayISO } from "@/lib/goals-store";
import { nowDate } from "@/lib/test-clock";
import {
  RETURN_MESSAGES,
  completeGoogleConnect,
  useGoogleCalendar,
} from "@/lib/google-calendar-store";
import "@/components/agenda.css";
import "@/components/agenda/agenda-ui.css";

export const Route = createFileRoute("/agenda")({
  head: () => ({ meta: [{ title: "Agenda — Norte" }] }),
  // O Google devolve a pessoa para cá depois do consentimento.
  validateSearch: (
    search: Record<string, unknown>,
  ): { google_ticket?: string; google?: string; reason?: string; date?: string } => ({
    // Abre a Agenda em um dia (vindo do Espelho).
    date:
      typeof search.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(search.date)
        ? search.date
        : undefined,
    google_ticket: typeof search.google_ticket === "string" ? search.google_ticket : undefined,
    google: typeof search.google === "string" ? search.google : undefined,
    reason: typeof search.reason === "string" ? search.reason : undefined,
  }),
  component: AgendaRoute,
});

function AgendaRoute() {
  return (
    <AgendaFeedbackProvider>
      <AgendaScreen />
    </AgendaFeedbackProvider>
  );
}

const VIEWS: { id: AgendaView; label: string }[] = [
  { id: "dia", label: "Dia" },
  { id: "semana", label: "Semana" },
  { id: "mes", label: "Mês" },
  { id: "proximos", label: "Próximos" },
];

const clock = (minutes: number) => minutesToTime(((minutes % 1440) + 1440) % 1440);

function AgendaScreen() {
  useSeriesMaterialization();
  const feedback = useAgendaFeedback();
  const search = Route.useSearch();
  const navigate = useNavigate();
  const googleState = useGoogleCalendar();

  // UM estado manda: o dia selecionado. Semana, título e conteúdo derivam dele.
  const [selectedDate, setSelectedDate] = useState(() => search.date ?? todayISO());
  const [pickedView, setPickedView] = useState<AgendaView | null>(null);
  const [filters, setFilters] = useState<AgendaFilters>(EMPTY_FILTERS);

  const [openOcc, setOpenOcc] = useState<AgendaOccurrence | null>(null);
  const [composer, setComposer] = useState<ComposerSeed | null>(null);
  const [panel, setPanel] = useState<
    "search" | "filters" | "labels" | "settings" | "calendar" | "app" | null
  >(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [connectingGoogle, setConnectingGoogle] = useState(Boolean(search.google_ticket));

  // Voltou do Google: confirma o bilhete com a sessão atual (só a pessoa que
  // iniciou consegue) ou explica o que aconteceu.
  const handledReturn = useRef(false);
  useEffect(() => {
    if (handledReturn.current) return;
    if (!search.google_ticket && !search.google) return;
    handledReturn.current = true;
    const clean = () => void navigate({ to: "/agenda", search: {}, replace: true });
    if (search.google_ticket) {
      setPanel("settings");
      completeGoogleConnect(search.google_ticket)
        .then((r) => feedback.notify(`Google Agenda conectado: ${r.email}.`))
        .catch((e) =>
          feedback.notifyError(e instanceof Error ? e.message : RETURN_MESSAGES.unexpected),
        )
        .finally(() => {
          setConnectingGoogle(false);
          clean();
        });
      return;
    }
    setPanel("settings");
    feedback.notifyError(RETURN_MESSAGES[search.reason ?? ""] ?? RETURN_MESSAGES.unexpected);
    clean();
  }, [search.google_ticket, search.google, search.reason, navigate, feedback]);

  const { settings, profile } = useAgendaData({ from: selectedDate, to: selectedDate });
  const view = pickedView ?? settings.defaultView;
  const today = todayISO();
  const weekStart = profile.weekStart;

  const range = useMemo(
    () => rangeForView(selectedDate, view, weekStart),
    [selectedDate, view, weekStart],
  );
  const data = useAgendaData(range);
  const { labels } = data;

  // Conflitos são calculados sobre tudo o que está carregado, mesmo com filtro.
  const conflictIds = useMemo(
    () => conflictingIds(data.occurrences.map(toConflictable)),
    [data.occurrences],
  );
  const visible = useMemo(
    () => filterOccurrences(data.occurrences, filters),
    [data.occurrences, filters],
  );

  const labelFilter = filters.labelIds;
  const toggleLabelFilter = (id: string) =>
    setFilters((f) => ({
      ...f,
      labelIds: f.labelIds.includes(id) ? f.labelIds.filter((x) => x !== id) : [...f.labelIds, id],
    }));

  const go = useCallback(
    (delta: number) => setSelectedDate((d) => shiftDate(d, view, delta)),
    [view],
  );

  // ----- Criação -----
  const defaultStartFor = useCallback(
    (date: string) => {
      if (date === todayISO()) {
        const now = nowDate();
        const rounded = Math.ceil((now.getHours() * 60 + now.getMinutes() + 1) / 30) * 30;
        return Math.min(rounded, 23 * 60);
      }
      const [h, m] = settings.dayStart.split(":").map(Number);
      return h * 60 + m;
    },
    [settings.dayStart],
  );

  const openComposerAt = useCallback(
    (date: string, minute: number) =>
      setComposer({
        mode: "create",
        date,
        startTime: clock(minute),
        endTime: clock(minute + settings.defaultDurationMin),
      }),
    [settings.defaultDurationMin],
  );

  const openNew = useCallback(() => {
    openComposerAt(selectedDate, defaultStartFor(selectedDate));
  }, [openComposerAt, selectedDate, defaultStartFor]);

  const duplicate = useCallback(
    (occ: AgendaOccurrence) =>
      setComposer({
        mode: "create",
        source: occ,
        date: occ.date,
        startTime: occ.startTime ?? clock(defaultStartFor(occ.date)),
        endTime:
          occ.endTime ??
          clock(
            (occ.startTime ? timeToMinutes(occ.startTime) : defaultStartFor(occ.date)) +
              settings.defaultDurationMin,
          ),
      }),
    [defaultStartFor, settings.defaultDurationMin],
  );

  // ----- Mover / redimensionar (arraste ou teclado) -----
  const commit = useCallback(
    async (occ: AgendaOccurrence, patch: CommitPatch) => {
      const others = data.occurrences.filter((o) => o.key !== occ.key).map(toConflictable);
      const conflicts = findConflicts(
        { date: patch.date, startTime: patch.startTime, endTime: patch.endTime },
        others,
      );
      const warning =
        conflicts.length > 0
          ? ` Atenção: conflita com ${conflicts
              .slice(0, 2)
              .map((c) => c.title)
              .join(" e ")}.`
          : "";
      await feedback.run(`Horário alterado.${warning}`, () =>
        moveOccurrence(occ, patch.date, patch.startTime, patch.endTime),
      );
    },
    [data.occurrences, feedback],
  );

  // Soltar uma ação de "Para encaixar" direto na linha do tempo (computador).
  const dropFit = useCallback(
    async (executionId: string, date: string, minute: number) => {
      await feedback.run("Ação encaixada na Agenda.", async () => {
        const sessionId = await scheduleExecution(
          executionId,
          date,
          clock(minute),
          clock(minute + settings.defaultDurationMin),
        );
        return { undo: async () => void (await removeAgendaSession(executionId, sessionId)) };
      });
    },
    [feedback, settings.defaultDurationMin],
  );

  // ----- Atalhos de teclado (telas com teclado) -----
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        target?.closest("input, textarea, select, [contenteditable], [role='dialog']")
      )
        return;
      const map: Record<string, () => void> = {
        t: () => setSelectedDate(todayISO()),
        d: () => setPickedView("dia"),
        s: () => setPickedView("semana"),
        m: () => setPickedView("mes"),
        p: () => setPickedView("proximos"),
        n: openNew,
        "/": () => setPanel("search"),
        ArrowLeft: () => go(-1),
        ArrowRight: () => go(1),
      };
      const action = map[event.key];
      if (action) {
        event.preventDefault();
        action();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, openNew]);

  const viewProps: ViewProps = {
    selectedDate,
    today,
    occurrences: visible,
    labelsById: labels.byId,
    conflictIds,
    settings,
    timeFormat: profile.timeFormat,
    weekStart,
    nowMinute: data.nowMinute,
    selectedKey: openOcc?.key ?? null,
    onSelectDate: setSelectedDate,
    onOpen: setOpenOcc,
    onCreate: openComposerAt,
    onCommit: commit,
    onDropFit: dropFit,
  };

  const openDay = (date: string) => {
    setSelectedDate(date);
    setPickedView("dia");
  };

  const dayEvents = useMemo(
    () => visible.filter((o) => o.date === selectedDate),
    [visible, selectedDate],
  );
  const week = weekDates(selectedDate, weekStart, true);
  const filtersActive = hasActiveFilters(filters);

  return (
    <div className="norte-page agenda-page">
      <header className="agenda-header relative min-h-24 pr-14">
        <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Agenda</p>
        <h1 className="norte-page-title mt-2">Seus compromissos</h1>
        <p className="mt-2 text-sm text-muted-foreground">Seu tempo, com clareza.</p>
        <AppMenuButton
          onClick={() => setPanel("app")}
          aria-label="Abrir configurações"
          className="norte-local-global-action absolute -right-2 -top-2"
        />
        <div className="absolute right-0 top-11 flex">
          <button
            type="button"
            onClick={() => setPanel("search")}
            aria-label="Buscar na Agenda"
            className="interactive-press flex h-11 w-11 items-center justify-center text-muted-foreground hover:text-primary"
          >
            <Search className="h-5 w-5" />
          </button>
        </div>
      </header>

      <div className="agenda-toolbar mt-5">
        <div className="agenda-views" role="group" aria-label="Visualização">
          {VIEWS.map((v) => (
            <button
              key={v.id}
              type="button"
              aria-pressed={view === v.id}
              onClick={() => setPickedView(v.id)}
            >
              {v.label}
            </button>
          ))}
        </div>

        {/* Navegação: o título e o conteúdo vêm do mesmo dia selecionado */}
        <div className="flex items-center justify-between gap-1">
          <button
            type="button"
            onClick={() => go(-1)}
            aria-label={
              view === "dia" ? "Dia anterior" : view === "mes" ? "Mês anterior" : "Semana anterior"
            }
            className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-surface-2"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={() => setPanel("calendar")}
            className="flex min-h-11 flex-1 items-center justify-center gap-2 px-2 text-sm font-bold"
            aria-label={`${titleForView(selectedDate, view, weekStart)}. Abrir calendário.`}
          >
            <CalendarDays className="h-4 w-4 text-muted-foreground" />
            {titleForView(selectedDate, view, weekStart)}
          </button>
          {selectedDate !== today && (
            <button
              type="button"
              onClick={() => setSelectedDate(today)}
              className="interactive-press min-h-9 rounded-full border border-primary/50 px-3 text-xs font-semibold text-primary"
            >
              Hoje
            </button>
          )}
          <button
            type="button"
            onClick={() => go(1)}
            aria-label={
              view === "dia" ? "Próximo dia" : view === "mes" ? "Próximo mês" : "Próxima semana"
            }
            className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-surface-2"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>

        {view === "dia" && (
          <div className="agenda-week-card card-surface overflow-hidden px-3 pb-3 pt-1">
            <WeekdaySelector
              items={week.map((d, index) => ({ day: index, label: WEEKDAY_LETTERS[weekdayOf(d)] }))}
              selectedDay={week.indexOf(selectedDate)}
              currentDay={week.indexOf(today)}
              onSelect={(index) => setSelectedDate(week[index])}
              primary={(index) => Number(week[index].slice(8))}
            />
          </div>
        )}

        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            {labels.active.length > 0 ? (
              <LabelFilterChips
                labels={labels.active}
                selected={labelFilter}
                onToggle={toggleLabelFilter}
              />
            ) : (
              <button type="button" onClick={() => setPanel("labels")} className="agenda-chip">
                <Tag className="h-3.5 w-3.5" /> Criar rótulos
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={() => setPanel("filters")}
            aria-label={filtersActive ? "Filtros (ativos)" : "Filtros"}
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border ${filtersActive ? "border-primary text-primary" : "border-border text-muted-foreground"}`}
          >
            <SlidersHorizontal className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setPanel("settings")}
            aria-label={googleState.connection ? "Google Agenda" : "Conectar Google Agenda"}
            title="Google Agenda"
            className="agenda-google-button relative flex h-10 shrink-0 items-center gap-1.5 rounded-full border border-primary/60 bg-primary/10 px-3 text-primary"
          >
            <CalendarSync className="h-4 w-4" aria-hidden="true" />
            <span className="text-xs font-semibold">
              {googleState.connection ? "Google" : "Conectar"}
            </span>
            {!googleState.connection && (
              <span
                aria-hidden="true"
                className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-primary"
              />
            )}
          </button>
        </div>
      </div>

      <div className="agenda-day-heading mt-5 flex items-center justify-between">
        <h2 className="norte-section-title">
          {view === "dia" || view === "mes"
            ? formatLongDate(selectedDate)
            : titleForView(selectedDate, view, weekStart)}
        </h2>
        <button
          type="button"
          onClick={openNew}
          className="interactive-press flex min-h-11 items-center gap-1 rounded-full bg-primary/10 px-4 text-xs font-semibold text-primary"
        >
          <Plus className="h-4 w-4" /> Novo
        </button>
      </div>

      {view === "dia" && <DayView {...viewProps} />}
      {view === "semana" && <WeekView {...viewProps} onOpenDay={openDay} />}
      {view === "mes" && <MonthView {...viewProps} onOpenDay={openDay} />}
      {view === "proximos" && <UpcomingView {...viewProps} />}

      {view === "dia" && (
        <div className="agenda-details card-surface-quiet mt-5 overflow-hidden">
          <button
            type="button"
            onClick={() => setDetailsOpen((open) => !open)}
            aria-expanded={detailsOpen}
            className="flex min-h-14 w-full items-center justify-between gap-3 px-4 py-3 text-left"
          >
            <span className="font-semibold">Agenda detalhada</span>
            <span className="ml-auto text-xs text-muted-foreground">
              {dayEvents.length} compromisso{dayEvents.length === 1 ? "" : "s"}
            </span>
          </button>
          {detailsOpen && (
            <div className="space-y-2.5 border-t border-border p-3">
              {dayEvents.length === 0 ? (
                <p className="py-5 text-center text-sm text-muted-foreground">
                  Nada agendado nesse dia.
                </p>
              ) : (
                dayEvents.map((occ) => (
                  <OccurrenceCard
                    key={occ.key}
                    occ={occ}
                    label={occ.labelId ? labels.byId.get(occ.labelId) : undefined}
                    conflict={conflictIds.has(occ.key)}
                    timeFormat={profile.timeFormat}
                    onOpen={setOpenOcc}
                  />
                ))
              )}
            </div>
          )}
        </div>
      )}

      <FitList
        today={today}
        onPick={(item) =>
          setComposer({
            mode: "create",
            date: selectedDate >= today ? selectedDate : today,
            startTime: clock(defaultStartFor(selectedDate >= today ? selectedDate : today)),
            endTime: clock(
              defaultStartFor(selectedDate >= today ? selectedDate : today) +
                settings.defaultDurationMin,
            ),
            selection: {
              kind: "execution",
              goal: item.goal,
              execution: item.execution,
            },
          })
        }
      />

      {openOcc && (
        <EventSheet
          occ={openOcc}
          onClose={() => setOpenOcc(null)}
          onEdit={(occ) =>
            setComposer({
              mode: "edit",
              source: occ,
              date: occ.date,
              startTime: occ.startTime ?? "09:00",
              endTime: occ.endTime ?? "10:00",
            })
          }
          onDuplicate={duplicate}
        />
      )}
      {composer && (
        <EventComposer
          key={composer.mode + (composer.source?.key ?? "") + composer.date + composer.startTime}
          seed={composer}
          onClose={() => setComposer(null)}
        />
      )}
      {panel === "search" && (
        <SearchSheet
          filters={filters}
          onOpenFilters={() => setPanel("filters")}
          onOpen={setOpenOcc}
          onClose={() => setPanel(null)}
        />
      )}
      {panel === "filters" && (
        <FilterSheet
          filters={filters}
          labels={labels.active}
          onChange={setFilters}
          onClose={() => setPanel(null)}
        />
      )}
      {panel === "labels" && <LabelManager onClose={() => setPanel(null)} />}
      {panel === "settings" && (
        <AgendaSettingsSheet onClose={() => setPanel(null)} connectingGoogle={connectingGoogle} />
      )}
      {panel === "calendar" && (
        <CalendarPicker
          selectedDate={selectedDate}
          today={today}
          weekStart={weekStart}
          onSelect={(date) => {
            setSelectedDate(date);
            setPanel(null);
          }}
          onClose={() => setPanel(null)}
        />
      )}
      {panel === "app" && <SettingsPanel onClose={() => setPanel(null)} />}
    </div>
  );
}
