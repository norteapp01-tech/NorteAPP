import { useState, useEffect } from "react";
import { Link } from "@tanstack/react-router";
import { nowDate } from "@/lib/test-clock";
import { Play, Check, Flame, EllipsisVertical, X, Sparkles, CalendarClock } from "lucide-react";
import { categoryMeta, statusDot, statusLabel, type TaskStatus } from "@/lib/mock-data";
import { useProfile, greeting, updateProfile } from "@/lib/profile-store";
import { formatTime } from "@/lib/format-utils";
import { HydrationCard } from "@/components/hydration/HydrationCard";
import { RemindersCard } from "@/components/RemindersCard";
import { SubagendasGrid } from "@/components/SubagendasGrid";
import { DaySummaryCard } from "@/components/DaySummaryCard";
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
  confidenceIndexByCategory,
  streakForTitle,
  insightsComputed,
  isMissed,
  toISODate,
  addDays,
  todayISO,
  formatDateBR,
  scheduleExecution,
  type Execution,
} from "@/lib/goals-store";

type EnergyMood = "fogo" | "normal" | "cansado" | "doente" | null;

const weightLabel: Record<string, string> = { leve: "Leve", medio: "Médio", pesado: "Pesado" };
const weightDots: Record<string, number> = { leve: 1, medio: 2, pesado: 3 };

const moodOptions = [
  { v: "fogo", emoji: "🔥", label: "Fogo" },
  { v: "normal", emoji: "😐", label: "Normal" },
  { v: "cansado", emoji: "😴", label: "Cansado" },
  { v: "doente", emoji: "🤒", label: "Doente" },
] as const;

function reliabilityFor(category: string, executions: Execution[]): TaskStatus {
  const entry = confidenceIndexByCategory(executions).find((c) => c.category === category);
  if (!entry) return "white";
  if (entry.pct >= 80) return "green";
  if (entry.pct >= 40) return "yellow";
  return "red";
}

export function TodayScreen() {
  const state = useGoalsStore((s) => s);
  const { executions, goals } = state;
  const profile = useProfile();

  const todayMood = (profile.moodDate === todayISO() ? profile.moodValue : null) as EnergyMood;
  const [moodPanelFor, setMoodPanelFor] = useState<EnergyMood>(null);
  const [savingMood, setSavingMood] = useState(false);
  const [focus, setFocus] = useState<Execution | null>(null);
  const [skipping, setSkipping] = useState<Execution | null>(null);
  const [showEod, setShowEod] = useState(false);
  const [reorganizing, setReorganizing] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const tasks = todayExecutions(executions).filter((t) => t.status !== "cancelada");
  const done = tasks.filter((t) => t.status === "concluida").length;
  const total = tasks.length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const displayTasks = orderedTodayTasks(tasks);
  const nextTaskId = displayTasks.find((t) => t.status !== "concluida")?.id;

  const pendingTasks = tasks.filter((t) => t.status === "planejada");
  const insight = insightsComputed(state)[0];

  const pickMood = async (m: EnergyMood) => {
    if (savingMood || m === todayMood) return;
    setSavingMood(true);
    try {
      await updateProfile({ moodDate: todayISO(), moodValue: m });
      setMoodPanelFor(m);
    } finally {
      setSavingMood(false);
    }
  };

  return (
    <div className="px-5 pt-12">
      <header className="flex items-end justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
            {nowDate().toLocaleDateString("pt-BR", {
              weekday: "long",
              day: "2-digit",
              month: "short",
            })}
          </p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight">
            {greeting()}
            {profile.displayName ? `, ${profile.displayName}` : ""}.
          </h1>
          <p className="mt-1 text-sm text-muted-foreground text-balance-tight">
            {pendingTasks.some((t) => isMissed(t))
              ? "Tem coisa atrasada aí embaixo. Encara."
              : "Hoje é dia de seguir o plano."}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className="text-xs font-medium text-muted-foreground">
            {done} de {total} concluídas
          </span>
          <div className="h-1.5 w-24 overflow-hidden rounded-full bg-surface-2">
            <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
          </div>
        </div>
        <button
          onClick={() => setSettingsOpen(true)}
          aria-label="Configurações"
          className="-m-2.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-surface"
        >
          <EllipsisVertical className="h-4 w-4" />
        </button>
        {settingsOpen && <SettingsPanel onClose={() => setSettingsOpen(false)} />}
      </header>

      {/* Como você está? — sempre visível, seleção persistida no perfil */}
      <section className="mt-5">
        <p className="text-sm font-medium">Como você está?</p>
        <div className="mt-2.5 grid grid-cols-4 gap-2">
          {moodOptions.map((o) => {
            const selected = todayMood === o.v;
            return (
              <button
                key={o.v}
                onClick={() => pickMood(o.v)}
                disabled={savingMood}
                aria-pressed={selected}
                aria-label={o.label}
                className={`flex min-h-11 flex-col items-center justify-center rounded-full border-2 py-2.5 transition-colors disabled:opacity-60 ${selected ? "border-primary bg-primary/10" : "border-transparent bg-surface-2 hover:border-border"}`}
              >
                <span className={`text-xl ${selected ? "" : "opacity-70"}`}>{o.emoji}</span>
              </button>
            );
          })}
        </div>
        {moodPanelFor && (
          <MoodActionPanel
            mood={moodPanelFor}
            onFinish={async (action) => {
              const tomorrow = toISODate(addDays(nowDate(), 1));
              if (action === "adiar-pesados") {
                await Promise.all(
                  tasks
                    .filter((t) => t.weight === "pesado" && t.status === "planejada" && !t.rigid)
                    .map((t) =>
                      rescheduleExecution(
                        t.id,
                        tomorrow,
                        t.startTime ?? "09:00",
                        t.endTime,
                        "adiado — dia cansado",
                      ),
                    ),
                );
              }
              if (action === "elevar") {
                const leitura = tasks.find(
                  (t) => t.category === "leitura" && t.status === "planejada",
                );
                if (leitura)
                  await patchExecution(leitura.id, {
                    how: "16 páginas (dobrado) — modo fogo",
                    weight: "medio",
                  });
              }
              if (action === "remover-flex") {
                await Promise.all(
                  tasks
                    .filter((t) => t.status === "planejada" && !t.rigid)
                    .map((t) => cancelExecution(t.id, "removida — dia sem energia pra flexíveis")),
                );
              }
              setMoodPanelFor(null);
            }}
            onClose={() => setMoodPanelFor(null)}
          />
        )}
      </section>

      <div className="mt-5 flex items-stretch gap-3">
        <RemindersCard compact />
        <HydrationCard className="flex-1" />
      </div>

      <div className="mt-7 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Tarefas de hoje</h2>
        <span className="text-xs text-muted-foreground">
          {done} de {total}
        </span>
      </div>

      <ul className="mt-3 space-y-3">
        {displayTasks.map((t) => {
          const cat = categoryMeta[t.category] ?? categoryMeta.generico;
          const streak = streakForTitle(executions, t.title);
          const reliability = reliabilityFor(t.category, executions);
          const missed = isMissed(t);
          const doneNow = t.status === "concluida";
          const isNext = t.id === nextTaskId;
          return (
            <li
              key={`${t.id}-${t.agendaSessionId ?? t.agendaDate}`}
              className={`card-surface group relative overflow-hidden p-4 transition-opacity ${doneNow ? "opacity-50" : ""} ${isNext ? "border-l-2 border-l-primary" : ""}`}
            >
              <div className="flex items-start gap-3">
                <button
                  onClick={async () => {
                    await toggleExecutionDone(t.id);
                  }}
                  aria-label={doneNow ? "Reabrir tarefa" : "Concluir tarefa"}
                  className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border transition-colors ${doneNow ? "border-primary bg-primary text-primary-foreground" : "border-border bg-surface-2"}`}
                >
                  {doneNow && <Check className="h-4 w-4" strokeWidth={3} />}
                </button>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    {isNext && (
                      <span className="text-[10px] font-bold uppercase tracking-wider text-primary">
                        Próxima
                      </span>
                    )}
                    <span
                      className={`h-2 w-2 rounded-full ${statusDot[reliability]}`}
                      title={statusLabel[reliability]}
                    />
                    <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                      {cat.emoji} {cat.label}
                    </span>
                    {t.rigid && (
                      <span className="rounded-full bg-danger/15 px-1.5 py-0.5 text-[10px] font-semibold text-danger">
                        RÍGIDA
                      </span>
                    )}
                    {missed && !doneNow && (
                      <span className="rounded-full bg-danger/15 px-1.5 py-0.5 text-[10px] font-semibold text-danger">
                        PERDIDA
                      </span>
                    )}
                    {streak > 0 && (
                      <span className="ml-auto flex items-center gap-0.5 text-[11px] text-warning">
                        <Flame className="h-3 w-3" />
                        {streak}
                      </span>
                    )}
                  </div>
                  <p
                    className={`mt-1 font-semibold leading-snug ${doneNow ? "text-muted-foreground line-through" : ""}`}
                  >
                    {t.title}
                  </p>
                  {t.how && <p className="mt-0.5 text-xs text-muted-foreground">{t.how}</p>}
                  {t.goalId && (
                    <p className="mt-0.5 text-[11px] text-primary">
                      ← {goals.find((g) => g.id === t.goalId)?.title ?? "planejamento"}
                    </p>
                  )}
                  <div className="mt-2.5 flex items-center gap-3 text-[11px] text-muted-foreground">
                    <span className="font-mono font-semibold text-foreground">
                      {formatTime(t.startTime, profile.timeFormat)}
                      {t.endTime ? `–${formatTime(t.endTime, profile.timeFormat)}` : ""}
                    </span>
                    <span className="flex gap-0.5">
                      {[1, 2, 3].map((i) => (
                        <span
                          key={i}
                          className={`h-1 w-3 rounded-full ${i <= weightDots[t.weight] ? "bg-foreground/80" : "bg-border"}`}
                        />
                      ))}
                      <span className="ml-1">{weightLabel[t.weight]}</span>
                    </span>
                  </div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-2">
                  {!doneNow && isNext && (
                    <button
                      onClick={() => setFocus(t)}
                      aria-label="Iniciar Modo Foco"
                      className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground transition-transform active:scale-95"
                    >
                      <Play className="h-4 w-4 fill-current" />
                    </button>
                  )}
                  {!doneNow && (
                    <button
                      onClick={() => setSkipping(t)}
                      aria-label="Mais ações"
                      className="-m-2 flex h-9 w-9 items-center justify-center text-muted-foreground hover:text-foreground"
                    >
                      <EllipsisVertical className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            </li>
          );
        })}
        {tasks.length === 0 && (
          <li className="card-surface flex flex-col items-center gap-2 p-6 text-center">
            <p className="text-sm text-muted-foreground">Nada planejado para hoje.</p>
            <Link to="/agenda" className="text-xs font-semibold text-primary">
              Adicionar algo pro dia →
            </Link>
          </li>
        )}
      </ul>

      {/* Minha rotina */}
      <div className="mt-7">
        <h2 className="text-lg font-semibold">Minha rotina</h2>
      </div>
      <div className="mt-3">
        <SubagendasGrid />
      </div>

      <DaySummaryCard
        insight={insight}
        pendingCount={pendingTasks.length}
        onReorganize={() => setReorganizing(true)}
        onCloseDay={() => setShowEod(true)}
      />

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

/** Painel de ação contextual do humor — reaproveita as mesmas opções/ações de sempre
 * (adiar pesados, elevar metas, remover flexíveis), só deixou de tomar a tela inteira:
 * some assim que o usuário escolhe uma ação ou fecha, a seleção acima continua marcada. */
function MoodActionPanel({
  mood,
  onFinish,
  onClose,
}: {
  mood: EnergyMood;
  onFinish: (action: string) => void;
  onClose: () => void;
}) {
  const opening: Record<
    Exclude<EnergyMood, null>,
    { line: string; prompt: string; options: { label: string; action: string; tone?: string }[] }
  > = {
    fogo: {
      line: "Dia raro. Bora aproveitar.",
      prompt: "Como quer usar essa energia?",
      options: [
        {
          label: "Elevar as metas de hoje (mais páginas, mais carga)",
          action: "elevar",
          tone: "primary",
        },
        { label: "Antecipar tarefas de amanhã", action: "antecipar" },
        { label: "Manter o plano — só executar bem", action: "manter" },
      ],
    },
    normal: {
      line: "Dia comum. Plano em pé.",
      prompt: "Alguma coisa mudou desde ontem?",
      options: [
        { label: "Nada, seguir o plano", action: "manter", tone: "primary" },
        { label: "Estou meio disperso — reduz o supérfluo", action: "remover-flex" },
      ],
    },
    cansado: {
      line: "Ok. Não te forço.",
      prompt: "O que faço com os pesados?",
      options: [
        { label: "Adiar todos os pesados p/ amanhã", action: "adiar-pesados", tone: "primary" },
        { label: "Manter só os rígidos e cancelar o resto", action: "remover-flex" },
        { label: "Deixa comigo — sigo o plano", action: "manter" },
      ],
    },
    doente: {
      line: "Primeiro: descansa. Vamos negociar o dia.",
      prompt: "Quais tarefas são indispensáveis hoje?",
      options: [
        {
          label: "Só o essencial (rígidas) — resto reagenda",
          action: "remover-flex",
          tone: "primary",
        },
        { label: "Zerar o dia — cuido de mim", action: "adiar-pesados" },
        { label: "Consigo o básico, sem os pesados", action: "adiar-pesados" },
      ],
    },
  };

  if (!mood) return null;
  const cfg = opening[mood];

  return (
    <section className="card-surface mt-3 space-y-4 border-primary/30 bg-primary/5 p-4">
      <div className="flex items-start gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/15">
          <Sparkles className="h-4 w-4 text-primary" />
        </div>
        <div className="flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-primary">
            {cfg.line}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">{cfg.prompt}</p>
        </div>
        <button onClick={onClose} aria-label="Fechar" className="text-muted-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="space-y-2">
        {cfg.options.map((o) => (
          <button
            key={o.label}
            onClick={() => onFinish(o.action)}
            className={`w-full rounded-xl px-4 py-3 text-left text-sm transition-colors ${o.tone === "primary" ? "bg-primary text-primary-foreground font-semibold" : "border border-border bg-surface hover:border-primary/40"}`}
          >
            {o.label}
          </button>
        ))}
      </div>
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
