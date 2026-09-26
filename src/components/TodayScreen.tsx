import { useState, useEffect, useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { nowDate } from "@/lib/test-clock";
import {
  Check,
  X,
  Sparkles,
  CalendarClock,
  ChevronDown,
  MessageCircle,
  CalendarDays,
  ListTodo,
  SlidersHorizontal,
  Moon,
  Plus,
} from "lucide-react";
import { AppMenuButton, DawnMark } from "@/components/ui/app-design-system";
import { InlineError } from "@/components/ui/inline-error";
import { useAsyncAction } from "@/hooks/use-async-action";
import { useCompletedInSession } from "@/hooks/use-completed-in-session";
import { categoryMeta } from "@/lib/mock-data";
import { useProfile, greeting, updateProfile } from "@/lib/profile-store";
import { formatTime } from "@/lib/format-utils";
import { HydrationCard } from "@/components/hydration/HydrationCard";
import { RemindersCard } from "@/components/RemindersCard";
import { SubagendasGrid } from "@/components/SubagendasGrid";
import { MoodCard } from "@/components/MoodCard";
import { Modal } from "@/components/ui/modal";
import { DateField } from "@/components/ui/date-wheel-picker";
import {
  ScheduleFields,
  scheduleTimesValid,
  type ScheduleValue,
} from "@/components/plan/ScheduleFields";
import { SettingsPanel } from "@/components/settings/SettingsPanel";
import {
  useGoalsStore,
  todayExecutions,
  orderedTodayTasks,
  toggleExecutionDone,
  completeExecution,
  markMissed,
  cancelExecution,
  rescheduleExecution,
  redistributeExecution,
  patchExecution,
  streakForTitle,
  isMissed,
  toISODate,
  addDays,
  todayISO,
  formatDateBR,
  scheduleExecution,
  updateAgendaSession,
  removeAgendaSession,
  type Execution,
} from "@/lib/goals-store";

type EnergyMood = "fogo" | "normal" | "cansado" | "doente" | null;

const moodOptions = [
  { v: "fogo", emoji: "🔥", label: "Energia alta" },
  { v: "normal", emoji: "🙂", label: "Estou bem" },
  { v: "cansado", emoji: "🪫", label: "Energia baixa" },
  { v: "doente", emoji: "🤒", label: "Doente" },
] as const;

export function TodayScreen({ onOpenChat }: { onOpenChat?: () => void } = {}) {
  const state = useGoalsStore((s) => s);
  const { executions } = state;
  const profile = useProfile();

  const todayMood = (profile.moodDate === todayISO() ? profile.moodValue : null) as EnergyMood;
  const [moodPanelFor, setMoodPanelFor] = useState<EnergyMood>(null);
  const [savingMood, setSavingMood] = useState(false);
  const [focus, setFocus] = useState<Execution | null>(null);
  const [skipping, setSkipping] = useState<Execution | null>(null);
  const [showEod, setShowEod] = useState(false);
  const [reorganizing, setReorganizing] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [lastAdjustment, setLastAdjustment] = useState<{
    kind: "move" | "remove";
    tasks: Execution[];
  } | null>(null);

  // Memoizado: essas funções varrem todo o dataset (todo o goalPace/insights
  // roda um loop sobre todos os goals) — sem isso, abrir qualquer modal desta
  // tela (settings, foco, confronto) recomputava tudo de novo sem necessidade,
  // já que só o estado local mudava, não os dados.
  const tasks = useMemo(
    () => todayExecutions(executions).filter((t) => t.status !== "cancelada"),
    [executions],
  );
  const done = tasks.filter((t) => t.status === "concluida").length;
  const total = tasks.length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const displayTasks = useMemo(() => orderedTodayTasks(tasks), [tasks]);
  const nextTaskId = displayTasks.find((t) => t.status !== "concluida")?.id;
  const agendaPreview = displayTasks.slice(0, 3);
  const hiddenAgendaItems = Math.max(0, displayTasks.length - agendaPreview.length);
  const scheduledCount = tasks.filter((task) => task.rigid || task.startTime).length;
  const flexibleCount = Math.max(0, total - scheduledCount);

  const pendingTasks = tasks.filter((t) => t.status === "planejada");
  const extraTasks = useMemo(() => {
    if (profile.moodDate !== todayISO()) return [];
    return profile.moodExtraExecutionIds
      .map((id) => executions.find((execution) => execution.id === id))
      .filter(
        (execution): execution is Execution => !!execution && execution.status === "planejada",
      );
  }, [executions, profile.moodDate, profile.moodExtraExecutionIds]);
  const extraCandidates = useMemo(() => {
    const today = todayISO();
    const todayIds = new Set(tasks.map((task) => task.id));
    return executions
      .filter(
        (execution) =>
          execution.status === "planejada" &&
          !todayIds.has(execution.id) &&
          ((execution.agendaDate && execution.agendaDate > today) ||
            (execution.plannedStartDate && execution.plannedStartDate > today) ||
            execution.dueDate > today),
      )
      .sort((a, b) =>
        (a.agendaDate ?? a.plannedStartDate ?? a.dueDate).localeCompare(
          b.agendaDate ?? b.plannedStartDate ?? b.dueDate,
        ),
      )
      .slice(0, 6);
  }, [executions, tasks]);

  const pickMood = async (m: EnergyMood) => {
    if (savingMood) return;
    if (m === todayMood) {
      setMoodPanelFor(m);
      return;
    }
    setSavingMood(true);
    try {
      await updateProfile({
        moodDate: todayISO(),
        moodValue: m,
        moodExtraExecutionIds:
          m === "fogo" && profile.moodDate === todayISO() ? profile.moodExtraExecutionIds : [],
      });
      setMoodPanelFor(m);
    } finally {
      setSavingMood(false);
    }
  };

  return (
    <div className="norte-page today-page">
      <header className="today-hero relative">
        <div className="flex items-center justify-between gap-4">
          <DawnMark />
          <div className="flex items-center gap-1">
            {onOpenChat && (
              <button
                aria-label="Conversar com o Norte"
                onClick={onOpenChat}
                className="interactive-press grid h-11 w-11 place-items-center rounded-full text-muted-foreground hover:bg-surface-quiet hover:text-foreground"
              >
                <MessageCircle className="h-5 w-5" strokeWidth={1.6} />
              </button>
            )}
            <AppMenuButton
              onClick={() => setSettingsOpen(true)}
              aria-label="Configurações"
              className="rounded-full hover:bg-surface-quiet"
            />
          </div>
        </div>
        <h1 className="today-greeting mt-9">
          {greeting()}
          {profile.displayName ? `, ${profile.displayName}` : ""}
        </h1>
        <p className="mt-1 text-[17px] capitalize text-muted-foreground">
          {nowDate().toLocaleDateString("pt-BR", {
            weekday: "long",
            day: "2-digit",
            month: "long",
          })}
        </p>
        <div className="today-day-progress mt-6">
          <div className="flex items-center justify-between gap-4 text-sm">
            <span className="text-muted-foreground">
              {pendingTasks.some((task) => isMissed(task))
                ? "Seu dia pede um ajuste"
                : "Seu dia está no rumo"}
            </span>
            <span className="whitespace-nowrap font-medium text-primary">
              {done} de {total} concluída{done === 1 ? "" : "s"}
            </span>
          </div>
          <div className="mt-3 h-px overflow-hidden bg-border-quiet">
            <div className="progress-fill h-full bg-primary" style={{ width: `${pct}%` }} />
          </div>
        </div>
        {settingsOpen && <SettingsPanel onClose={() => setSettingsOpen(false)} />}
      </header>

      {lastAdjustment && (
        <div className="card-surface-quiet mt-3 flex items-center gap-3 px-4 py-3">
          <p className="min-w-0 flex-1 text-xs text-muted-foreground">
            Dia ajustado · {lastAdjustment.tasks.length}{" "}
            {lastAdjustment.kind === "move" ? "movida(s) para amanhã" : "retirada(s) de hoje"}
          </p>
          <button
            className="min-h-11 text-xs font-semibold text-primary"
            onClick={async () => {
              await Promise.all(
                lastAdjustment.tasks.map((task) =>
                  lastAdjustment.kind === "move"
                    ? updateAgendaSession(
                        task.id,
                        task.agendaSessionId,
                        todayISO(),
                        task.startTime ?? "09:00",
                        task.endTime,
                      )
                    : scheduleExecution(
                        task.id,
                        todayISO(),
                        task.startTime ?? "09:00",
                        task.endTime,
                      ),
                ),
              );
              setLastAdjustment(null);
            }}
          >
            Desfazer
          </button>
        </div>
      )}

      <section className="today-agenda mt-10">
        <div className="flex items-end justify-between gap-4">
          <h2 className="norte-view-title">Agenda de hoje</h2>
          <Link to="/agenda" className="norte-secondary-action min-h-11 py-3 text-xs">
            Ver dia completo →
          </Link>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <Link to="/agenda" className="today-stat-card interactive-press">
            <CalendarDays className="h-7 w-7" strokeWidth={1.5} />
            <strong>{scheduledCount}</strong>
            <span>compromisso{scheduledCount === 1 ? "" : "s"}</span>
          </Link>
          <Link to="/agenda" className="today-stat-card interactive-press">
            <ListTodo className="h-7 w-7" strokeWidth={1.5} />
            <strong>{flexibleCount}</strong>
            <span>tarefa{flexibleCount === 1 ? "" : "s"}</span>
          </Link>
        </div>
      </section>

      <ul className="today-agenda-list mt-5">
        {agendaPreview.map((t) => {
          const cat = categoryMeta[t.category] ?? categoryMeta.generico;
          const missed = isMissed(t);
          const doneNow = t.status === "concluida";
          const isNext = t.id === nextTaskId;
          return (
            <li
              key={`${t.id}-${t.agendaSessionId ?? t.agendaDate}`}
              className={`today-agenda-row group relative transition-opacity ${doneNow ? "opacity-45" : ""}`}
            >
              {isNext && !doneNow && <span className="today-next-line" aria-hidden="true" />}
              <div className="flex items-center gap-3">
                <TaskCheckbox id={t.id} done={doneNow} />
                <span className="w-[52px] shrink-0 font-mono text-sm text-muted-foreground">
                  {formatTime(t.startTime, profile.timeFormat)}
                </span>
                <div className="min-w-0 flex-1 py-1">
                  <button
                    onClick={() => !doneNow && setFocus(t)}
                    className={`block w-full truncate text-left text-[15px] font-medium leading-snug ${doneNow ? "text-muted-foreground line-through" : ""}`}
                  >
                    {t.title}
                  </button>
                  <div className="mt-0.5 flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground">
                    <span>{cat.label}</span>
                    {t.endTime && <span>· até {formatTime(t.endTime, profile.timeFormat)}</span>}
                    {missed && !doneNow && <span className="text-danger">· atrasada</span>}
                  </div>
                </div>
                <AppMenuButton
                  onClick={() => setSkipping(t)}
                  aria-label="Mais ações"
                  className="-m-2"
                />
              </div>
            </li>
          );
        })}
        {tasks.length === 0 && (
          <li className="flex flex-col items-center gap-2 border-y border-border-quiet py-8 text-center">
            <p className="text-sm text-muted-foreground">Nada planejado para hoje.</p>
            <Link to="/agenda" className="text-xs font-semibold text-primary">
              Adicionar algo pro dia →
            </Link>
          </li>
        )}
      </ul>

      <div className="mt-1 flex min-h-12 items-center justify-between gap-3">
        <Link
          to="/criar"
          search={{ modo: "agenda" }}
          className="interactive-press inline-flex min-h-11 items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          <Plus className="h-4 w-4" /> adicionar
        </Link>
        {(hiddenAgendaItems > 0 || extraTasks.length > 0) && (
          <Link
            to="/agenda"
            className="rounded-full border border-border px-4 py-2 text-xs text-muted-foreground"
          >
            {hiddenAgendaItems + extraTasks.length} extras
          </Link>
        )}
      </div>

      {extraTasks.length > 0 && (
        <details className="norte-disclosure card-surface-quiet mt-4 overflow-hidden">
          <summary className="px-4 py-3">
            <span className="flex-1">
              <span className="block text-sm font-medium">Extras de hoje</span>
              <span className="block text-[11px] text-muted-foreground">
                Se sobrar energia, você adianta.
              </span>
            </span>
            <span className="text-xs text-muted-foreground">{extraTasks.length}</span>
            <ChevronDown size={16} aria-hidden />
          </summary>
          <div className="divide-y divide-border border-t border-border">
            {extraTasks.map((task) => (
              <ExtraTaskRow key={task.id} id={task.id} title={task.title} dueDate={task.dueDate} />
            ))}
          </div>
        </details>
      )}

      <div className="today-status-strip mt-6">
        <RemindersCard inline />
        <HydrationCard inline />
        <MoodCard
          inline
          options={moodOptions}
          value={todayMood}
          saving={savingMood}
          onPick={(v) => pickMood(v as EnergyMood)}
        />
      </div>

      <div className="mt-9 flex items-end justify-between gap-4">
        <h2 className="norte-view-title">Minha rotina</h2>
        <span className="pb-1 text-[11px] text-muted-foreground">deslize para acessar →</span>
      </div>
      <div className="mt-3">
        <SubagendasGrid />
      </div>

      {moodPanelFor && (
        <MoodActionPanel
          key={moodPanelFor}
          mood={moodPanelFor}
          todayTasks={pendingTasks}
          extraCandidates={extraCandidates}
          initialExtras={profile.moodExtraExecutionIds}
          onSaveExtras={async (ids) => {
            await updateProfile({ moodExtraExecutionIds: ids });
            setMoodPanelFor(null);
          }}
          onMoveTomorrow={async (selected) => {
            const tomorrow = toISODate(addDays(nowDate(), 1));
            await Promise.all(
              selected.map((task) =>
                updateAgendaSession(
                  task.id,
                  task.agendaSessionId,
                  tomorrow,
                  task.startTime ?? "09:00",
                  task.endTime,
                ),
              ),
            );
            setLastAdjustment({ kind: "move", tasks: selected });
            setMoodPanelFor(null);
          }}
          onRemoveToday={async (selected) => {
            await Promise.all(
              selected.map((task) => removeAgendaSession(task.id, task.agendaSessionId)),
            );
            setLastAdjustment({ kind: "remove", tasks: selected });
            setMoodPanelFor(null);
          }}
          onClose={() => setMoodPanelFor(null)}
        />
      )}

      <div className="today-closing-actions mt-7 grid grid-cols-2 border-y border-border-quiet">
        <button
          onClick={() => setReorganizing(true)}
          className="interactive-press flex min-h-16 items-center justify-center gap-2 border-r border-border-quiet text-sm text-foreground"
        >
          <SlidersHorizontal className="h-4 w-4" strokeWidth={1.5} />
          Reorganizar meu dia
        </button>
        <button
          onClick={() => setShowEod(true)}
          className="interactive-press flex min-h-16 items-center justify-center gap-2 text-sm text-foreground"
        >
          <Moon className="h-4 w-4" strokeWidth={1.5} />
          Fechar o dia
        </button>
      </div>

      {focus && (
        <FocusModal
          task={focus}
          onClose={() => setFocus(null)}
          onDone={async () => {
            await completeExecution(focus.id);
            setFocus(null);
          }}
        />
      )}
      {skipping && <ConfrontModal task={skipping} onClose={() => setSkipping(null)} />}
      {showEod && (
        <EndOfDayModal pending={pendingTasks} mode="fechar" onClose={() => setShowEod(false)} />
      )}
      {reorganizing && (
        <EndOfDayModal
          pending={pendingTasks}
          mode="reorganizar"
          onClose={() => setReorganizing(false)}
        />
      )}
    </div>
  );
}

/** Checkbox de concluir: responde no frame do toque (o store já escreve no
 * cache antes do servidor), trava envio duplo e, se a escrita falhar, o
 * store desfaz e o erro aparece na própria linha com "tentar de novo". */
function TaskCheckbox({ id, done }: { id: string; done: boolean }) {
  const { run, pending, error, clearError } = useAsyncAction();
  const justCompleted = useCompletedInSession(done);
  const toggle = () => run(() => toggleExecutionDone(id));

  return (
    <>
      <button
        onClick={toggle}
        disabled={pending}
        aria-label={done ? "Reabrir tarefa" : "Concluir tarefa"}
        className={`interactive-press mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border transition-colors ${done ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground bg-transparent"}`}
      >
        {done && (
          <Check className={`h-4 w-4 ${justCompleted ? "check-enter" : ""}`} strokeWidth={3} />
        )}
      </button>
      {error && (
        <InlineError
          message={error}
          onRetry={() => {
            clearError();
            toggle();
          }}
          className="absolute inset-x-4 bottom-1"
        />
      )}
    </>
  );
}

/** Extra concluído sai da lista (o filtro de `extraTasks` só mantém
 * "planejada"), então aqui a trava importa dobrado: sem ela, um toque duplo
 * escrevia duas vezes numa linha que já estava saindo da tela. */
function ExtraTaskRow({ id, title, dueDate }: { id: string; title: string; dueDate: string }) {
  const { run, pending, error, clearError } = useAsyncAction();
  const complete = () => run(() => completeExecution(id));

  return (
    <div>
      <button
        onClick={complete}
        disabled={pending}
        className="interactive-press flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left disabled:opacity-60"
      >
        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full border border-primary text-primary">
          <Check className="h-3.5 w-3.5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{title}</span>
          <span className="block text-[11px] text-muted-foreground">
            Prazo {formatDateBR(dueDate)}
          </span>
        </span>
      </button>
      {error && (
        <InlineError
          message={error}
          onRetry={() => {
            clearError();
            complete();
          }}
          className="px-4 pb-2"
        />
      )}
    </div>
  );
}

/** Ajuste direto do dia: nenhuma tarefa vem pré-selecionada e nenhuma decisão é
 * tomada pelo sistema. Tocar escolhe; o botão inferior aplica tudo em lote. */
function MoodActionPanel({
  mood,
  todayTasks,
  extraCandidates,
  initialExtras,
  onSaveExtras,
  onMoveTomorrow,
  onRemoveToday,
  onClose,
}: {
  mood: Exclude<EnergyMood, null>;
  todayTasks: Execution[];
  extraCandidates: Execution[];
  initialExtras: string[];
  onSaveExtras: (ids: string[]) => Promise<void>;
  onMoveTomorrow: (tasks: Execution[]) => Promise<void>;
  onRemoveToday: (tasks: Execution[]) => Promise<void>;
  onClose: () => void;
}) {
  const [selected, setSelected] = useState<string[]>(
    mood === "fogo" ? initialExtras.filter((id) => extraCandidates.some((e) => e.id === id)) : [],
  );
  const [busy, setBusy] = useState(false);
  const choices = mood === "fogo" ? extraCandidates : todayTasks;
  const chosenTasks = choices.filter((task) => selected.includes(task.id));
  const toggle = (id: string) =>
    setSelected((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );

  const title =
    mood === "fogo"
      ? "Aproveitar o ritmo"
      : mood === "normal"
        ? "Seguir o plano"
        : mood === "cansado"
          ? "Revisar o ritmo"
          : "Reorganizar o dia";
  const prompt =
    mood === "fogo"
      ? "Toque no que você gostaria de adiantar."
      : mood === "normal"
        ? "Seu plano continua como está."
        : mood === "cansado"
          ? "Selecione somente o que prefere mover de hoje."
          : "Selecione o que precisa sair de hoje.";

  const run = async (action: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    try {
      await action();
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card-surface mt-3 space-y-4 p-4">
      <div className="flex items-start gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/15">
          <Sparkles className="h-4 w-4 text-primary" />
        </div>
        <div className="flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-primary">{title}</p>
          <p className="mt-1 text-sm text-muted-foreground">{prompt}</p>
        </div>
        <button onClick={onClose} aria-label="Fechar" className="text-muted-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>
      {mood === "normal" ? (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface px-3 py-2.5">
          <p className="text-xs text-muted-foreground">
            {todayTasks.length} tarefa{todayTasks.length === 1 ? "" : "s"} pendente
            {todayTasks.length === 1 ? "" : "s"}
          </p>
          <button onClick={onClose} className="min-h-11 px-2 text-xs font-semibold text-primary">
            Continuar meu dia
          </button>
        </div>
      ) : (
        <>
          <div className="max-h-64 space-y-2 overflow-y-auto">
            {choices.map((task) => {
              const active = selected.includes(task.id);
              const when = task.agendaDate ?? task.plannedStartDate ?? task.dueDate;
              return (
                <button
                  key={task.id}
                  onClick={() => toggle(task.id)}
                  className={`interactive-press flex min-h-14 w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left ${active ? "border-primary bg-primary/10" : "border-border bg-surface"}`}
                >
                  <span
                    className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border ${active ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground"}`}
                  >
                    {active ? (
                      <Check className="check-enter h-3.5 w-3.5" />
                    ) : mood === "fogo" ? (
                      "+"
                    ) : (
                      ""
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{task.title}</span>
                    <span className="mt-0.5 flex flex-wrap gap-1.5 text-[11px] text-muted-foreground">
                      {mood === "fogo" && <span>{formatDateBR(when)}</span>}
                      {task.dueDate === todayISO() && (
                        <span className="text-warning">vence hoje</span>
                      )}
                      {task.rigid && <span>· compromisso fixo</span>}
                    </span>
                  </span>
                </button>
              );
            })}
            {choices.length === 0 && (
              <p className="rounded-xl border border-border bg-surface px-3 py-4 text-center text-xs text-muted-foreground">
                {mood === "fogo"
                  ? "Nenhuma ação futura disponível para antecipar."
                  : "Nenhuma tarefa pendente para revisar."}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 border-t border-border pt-3">
            <span className="mr-auto text-[11px] text-muted-foreground">
              {selected.length} selecionada{selected.length === 1 ? "" : "s"}
            </span>
            {mood === "doente" && (
              <button
                disabled={selected.length === 0 || busy}
                onClick={() => run(() => onRemoveToday(chosenTasks))}
                className="min-h-11 px-2 text-xs font-semibold text-muted-foreground disabled:opacity-40"
              >
                Retirar de hoje
              </button>
            )}
            <button
              disabled={(mood !== "fogo" && selected.length === 0) || busy}
              onClick={() =>
                run(() => (mood === "fogo" ? onSaveExtras(selected) : onMoveTomorrow(chosenTasks)))
              }
              className="min-h-11 rounded-xl bg-primary px-3 text-xs font-semibold text-primary-foreground disabled:opacity-40"
            >
              {mood === "fogo" ? "Aplicar extras" : "Mover para amanhã"}
            </button>
          </div>
        </>
      )}
    </section>
  );
}

function FocusModal({
  task,
  onClose,
  onDone,
}: {
  task: Execution;
  onClose: () => void;
  onDone: () => void;
}) {
  const [seconds, setSeconds] = useState(0);
  const [askingCompletion, setAskingCompletion] = useState(false);
  const [schedulingAgain, setSchedulingAgain] = useState(false);
  const [saving, setSaving] = useState(false);
  const tomorrow = toISODate(addDays(nowDate(), 1));
  const [nextSession, setNextSession] = useState<ScheduleValue>({
    date: tomorrow,
    startTime: "",
    endTime: "",
  });
  useEffect(() => {
    const id = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, []);
  const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
  const ss = String(seconds % 60).padStart(2, "0");
  if (askingCompletion) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/95 px-5 backdrop-blur-xl">
        <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-5">
          <p className="text-xs uppercase tracking-[0.18em] text-primary">Sessão finalizada</p>
          <h2 className="mt-2 text-xl font-bold">Você concluiu 100% desta ação?</h2>
          <p className="mt-1 text-sm text-muted-foreground">{task.title}</p>
          {!schedulingAgain ? (
            <div className="mt-5 space-y-2">
              <button
                onClick={onDone}
                className="w-full rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground"
              >
                Sim, concluir ação
              </button>
              <button
                onClick={() => setSchedulingAgain(true)}
                className="w-full rounded-xl border border-dashed border-primary/70 py-3 text-sm font-semibold text-primary"
              >
                Ainda não — agendar outra sessão
              </button>
            </div>
          ) : (
            <div className="mt-5">
              <ScheduleFields
                value={nextSession}
                onChange={setNextSession}
                disabled={saving}
                size="md"
              />
              <button
                disabled={!scheduleTimesValid(nextSession) || saving}
                onClick={async () => {
                  setSaving(true);
                  try {
                    await scheduleExecution(
                      task.id,
                      nextSession.date,
                      nextSession.startTime,
                      nextSession.endTime,
                    );
                    onClose();
                  } finally {
                    setSaving(false);
                  }
                }}
                className="mt-3 w-full rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground disabled:opacity-50"
              >
                {saving ? "Agendando…" : "Confirmar nova sessão"}
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background/95 backdrop-blur-xl">
      <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Modo Foco</p>
      <h2 className="mt-3 max-w-xs px-6 text-center text-2xl font-bold text-balance-tight">
        {task.title}
      </h2>
      {task.how && (
        <p className="mt-2 max-w-xs px-6 text-center text-sm text-muted-foreground">{task.how}</p>
      )}
      <div className="my-12 font-mono text-7xl font-bold tracking-tighter text-primary">
        {mm}:{ss}
      </div>
      <div className="flex gap-3">
        <button
          onClick={onClose}
          className="rounded-full border border-border bg-surface px-6 py-3 text-sm font-medium"
        >
          Pausar
        </button>
        <button
          onClick={() => setAskingCompletion(true)}
          className="rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground"
        >
          Conseguiu? ✓
        </button>
      </div>
    </div>
  );
}

function ConfrontModal({ task, onClose }: { task: Execution; onClose: () => void }) {
  const [step, setStep] = useState<"why" | "reason" | "recover">("why");
  const [reagendarOpen, setReagendarOpen] = useState(false);
  const [date, setDate] = useState(toISODate(addDays(nowDate(), 1)));
  const [startTime, setStartTime] = useState(task.startTime ?? "");
  const [endTime, setEndTime] = useState(task.endTime ?? "");
  const [applied, setApplied] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const linkedGoal = useGoalsStore((s) => s.goals.find((g) => g.id === task.goalId));
  const executions = useGoalsStore((s) => s.executions);
  const profile = useProfile();
  const timesValid = !!startTime && !!endTime && endTime > startTime;

  const chooseReason = async (reason: string) => {
    if (busy) return;
    setBusy(true);
    try {
      if (task.rigid) {
        const tomorrow = toISODate(addDays(nowDate(), 1));
        await markMissed(task.id, reason);
        await rescheduleExecution(task.id, tomorrow, "06:00", undefined, reason, { rigid: true });
        setApplied(`Reagendado com prioridade alta para amanhã 06:00 (${reason}).`);
        setStep("recover");
      } else {
        await markMissed(task.id, reason);
        setStep("recover");
      }
    } finally {
      setBusy(false);
    }
  };

  const applyReagendar = async () => {
    if (!timesValid || busy) return;
    setBusy(true);
    try {
      await rescheduleExecution(task.id, date, startTime, endTime, "reagendado manualmente");
      setApplied(
        `Reagendado para ${formatDateBR(date)} às ${formatTime(startTime, profile.timeFormat)}.`,
      );
      setReagendarOpen(false);
    } finally {
      setBusy(false);
    }
  };

  const stepTitle =
    step === "why" ? "Antes de pular" : step === "reason" ? "Sem julgamento" : "Perda registrada";

  return (
    <Modal onClose={onClose} title={stepTitle}>
      {step === "why" && (
        <>
          <h3 className="text-xl font-bold">Lembra por que isso importa?</h3>
          {task.why ? (
            <p className="mt-4 rounded-xl border border-primary/30 bg-primary/5 p-4 text-sm italic text-foreground">
              "{task.why}"
            </p>
          ) : (
            <p className="mt-4 text-sm text-muted-foreground">
              Você não registrou um motivo para essa execução.
            </p>
          )}
          <div className="mt-6 flex flex-col gap-2">
            <button
              onClick={onClose}
              className="rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground"
            >
              Vou fazer agora
            </button>
            <button
              onClick={() => setStep("reason")}
              className="rounded-xl border border-border bg-surface py-3 text-sm"
            >
              Mesmo assim, preciso pular
            </button>
          </div>
        </>
      )}
      {step === "reason" && (
        <>
          <h3 className="text-xl font-bold">Você esqueceu ou não conseguiu?</h3>
          <div className="mt-5 space-y-2">
            {[
              "Esqueci totalmente",
              "Não consegui fazer",
              "Não quis fazer",
              "Era impossível hoje",
            ].map((r) => (
              <button
                key={r}
                onClick={() => chooseReason(r)}
                className="w-full rounded-xl border border-border bg-surface-2 px-4 py-3 text-left text-sm hover:border-primary/50"
              >
                {r}
              </button>
            ))}
          </div>
          {task.rigid && (
            <p className="mt-4 rounded-xl bg-danger/10 p-3 text-xs text-danger">
              Essa execução é rígida. Vou reagendar com prioridade alta para amanhã 06:00.
            </p>
          )}
        </>
      )}
      {step === "recover" && (
        <>
          <h3 className="text-xl font-bold">
            {linkedGoal ? (
              <>
                Esta atividade faz parte do plano{" "}
                <span className="text-primary">{linkedGoal.title}</span>. O que fazemos?
              </>
            ) : (
              "Isso pertencia a um planejamento maior. O que fazemos?"
            )}
          </h3>
          {applied && (
            <p className="mt-3 rounded-xl bg-success/10 p-3 text-xs text-success">{applied}</p>
          )}
          {!applied && (
            <div className="mt-5 space-y-2">
              {!reagendarOpen ? (
                <button
                  onClick={() => setReagendarOpen(true)}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground"
                >
                  <CalendarClock className="h-4 w-4" /> Reagendar
                </button>
              ) : (
                <div className="rounded-xl border border-border bg-surface-2 p-3">
                  <DateField
                    value={date}
                    onChange={setDate}
                    className="flex w-full items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-left text-sm outline-none focus:border-primary"
                  />
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <input
                      type="time"
                      value={startTime}
                      onChange={(e) => setStartTime(e.target.value)}
                      className="rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
                    />
                    <input
                      type="time"
                      value={endTime}
                      onChange={(e) => setEndTime(e.target.value)}
                      className="rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
                    />
                  </div>
                  <button
                    disabled={!timesValid || busy}
                    onClick={applyReagendar}
                    className="mt-2 w-full rounded-lg bg-primary py-2 text-xs font-semibold text-primary-foreground disabled:opacity-50"
                  >
                    Confirmar novo horário
                  </button>
                </div>
              )}
              <button
                onClick={async () => {
                  await redistributeExecution(task.id, executions);
                  setApplied("Redistribuído para o dia com menos carga nos próximos 3 dias.");
                }}
                className="w-full rounded-xl border border-border bg-surface py-3 text-sm"
              >
                Redistribuir automaticamente
              </button>
              <button
                onClick={() => setApplied("Mantido como perdida — segue no histórico.")}
                className="w-full rounded-xl border border-border bg-surface py-3 text-sm"
              >
                Manter como perdida
              </button>
              <button
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await cancelExecution(task.id, "descarte consciente");
                    setApplied("Descartado conscientemente.");
                  } finally {
                    setBusy(false);
                  }
                }}
                className="w-full rounded-xl border border-dashed border-border py-3 text-sm text-muted-foreground disabled:opacity-50"
              >
                Descartar conscientemente
              </button>
            </div>
          )}
          <button
            onClick={onClose}
            className="mt-4 w-full rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground"
          >
            Fechar
          </button>
        </>
      )}
    </Modal>
  );
}

function EndOfDayModal({
  pending,
  onClose,
  mode = "fechar",
}: {
  pending: Execution[];
  onClose: () => void;
  mode?: "fechar" | "reorganizar";
}) {
  const [decisions, setDecisions] = useState<Record<string, string>>({});
  const goals = useGoalsStore((s) => s.goals);
  const executions = useGoalsStore((s) => s.executions);
  const profile = useProfile();
  const decide = async (t: Execution, action: string) => {
    setDecisions((p) => ({ ...p, [t.id]: action }));
    const tomorrow = toISODate(addDays(nowDate(), 1));
    await markMissed(t.id, `fechamento do dia: ${action}`);
    if (action === "reagendar")
      await rescheduleExecution(
        t.id,
        tomorrow,
        t.startTime ?? "09:00",
        t.endTime,
        "reagendado no fechamento do dia",
      );
    if (action === "descartar") await cancelExecution(t.id, "descartado no fechamento do dia");
    if (action === "prioridade")
      await rescheduleExecution(
        t.id,
        tomorrow,
        "07:00",
        undefined,
        "priorizado no fechamento do dia",
        {
          rigid: true,
        },
      );
    if (action === "redistribuir") await redistributeExecution(t.id, executions);
  };
  const allDecided = pending.every((t) => decisions[t.id]);
  const doneCount = executions.filter(
    (e) => e.agendaDate === todayISO() && e.status === "concluida",
  ).length;
  const streak = useGoalsStore((s) => streakForTitle(s.executions, pending[0]?.title ?? ""));

  return (
    <Modal
      onClose={onClose}
      title={mode === "reorganizar" ? "Seu dia mudou" : "Fim do dia"}
      footer={
        <div className="space-y-2">
          <div className="rounded-xl bg-primary/5 p-3 text-[11px] text-muted-foreground">
            <span className="font-semibold text-primary">Sugestão:</span> "Redistribuir" já escolhe
            o dia com menos carga nos próximos 3 dias, respeitando sua capacidade diária.
          </div>
          <button
            disabled={!allDecided}
            onClick={onClose}
            className="w-full rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground disabled:opacity-40"
          >
            {mode === "reorganizar" ? "Aplicar e continuar o dia" : "Aplicar e encerrar o dia"}
          </button>
        </div>
      }
    >
      <h3 className="text-xl font-bold">
        {mode === "reorganizar" ? "O que fazemos com o resto?" : "Como foi hoje?"}
      </h3>

      <div className="mt-4 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-xl bg-success/10 p-3">
          <p className="text-2xl font-bold text-success">{doneCount}</p>
          <p className="text-[10px] uppercase text-muted-foreground">cumpridas</p>
        </div>
        <div className="rounded-xl bg-warning/10 p-3">
          <p className="text-2xl font-bold text-warning">{pending.length}</p>
          <p className="text-[10px] uppercase text-muted-foreground">pendentes</p>
        </div>
        <div className="rounded-xl bg-primary/10 p-3">
          <p className="text-2xl font-bold text-primary">{streak}d</p>
          <p className="text-[10px] uppercase text-muted-foreground">sequência</p>
        </div>
      </div>

      <div className="mt-5">
        <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
          O que fazer com o que ficou?
        </p>
        {pending.length === 0 && (
          <p className="mt-3 text-sm text-muted-foreground">Nada pendente. Dia limpo.</p>
        )}
        <ul className="mt-2 space-y-3">
          {pending.map((t) => (
            <li key={t.id} className="rounded-xl border border-border bg-surface-2 p-3">
              <p className="text-sm font-semibold">{t.title}</p>
              <p className="text-[11px] text-muted-foreground">
                {categoryMeta[t.category]?.label ?? t.category} ·{" "}
                {formatTime(t.startTime, profile.timeFormat)}
                {t.endTime ? `–${formatTime(t.endTime, profile.timeFormat)}` : ""}
              </p>
              {t.goalId && (
                <p className="mt-0.5 text-[11px] text-primary">
                  plano: {goals.find((g) => g.id === t.goalId)?.title ?? "—"}
                </p>
              )}
              <div className="mt-2 grid grid-cols-2 gap-1.5">
                {[
                  { k: "reagendar", l: "Reagendar" },
                  { k: "descartar", l: "Descartar" },
                  { k: "prioridade", l: "↑ Prioridade" },
                  { k: "redistribuir", l: "Redistribuir" },
                ].map((a) => (
                  <button
                    key={a.k}
                    disabled={!!decisions[t.id]}
                    onClick={() => decide(t, a.k)}
                    className={`rounded-lg px-2 py-2 text-[11px] font-medium transition-colors disabled:opacity-40 ${decisions[t.id] === a.k ? "bg-primary text-primary-foreground" : "border border-border bg-surface text-foreground hover:border-primary/50"}`}
                  >
                    {a.l}
                  </button>
                ))}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </Modal>
  );
}
