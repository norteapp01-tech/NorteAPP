import { useState, useEffect } from "react";
import { Link } from "@tanstack/react-router";
import { nowDate } from "@/lib/test-clock";
import {
  Play,
  Check,
  Flame,
  Zap,
  MoreHorizontal,
  X,
  Sparkles,
  Lightbulb,
  Moon,
  CalendarClock,
  RefreshCcw,
  EllipsisVertical,
  Settings,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { categoryMeta, statusDot, statusLabel, type TaskStatus } from "@/lib/mock-data";
import { useProfile, greeting } from "@/lib/profile-store";
import { formatTime } from "@/lib/format-utils";
import { HydrationCard } from "@/components/hydration/HydrationCard";
import { SubagendasGrid } from "@/components/SubagendasGrid";
import {
  useGoalsStore,
  todayExecutions,
  toggleExecutionDone,
  completeExecution,
  markMissed,
  cancelExecution,
  rescheduleExecution,
  redistributeExecution,
  patchExecution,
  plannedHoursForDate,
  confidenceIndexByCategory,
  streakForTitle,
  insightsComputed,
  isMissed,
  toISODate,
  addDays,
  todayISO,
  formatDateBR,
  DAILY_CAPACITY_HOURS,
  type Execution,
} from "@/lib/goals-store";

type EnergyMood = "fogo" | "normal" | "cansado" | "doente" | null;

const weightLabel: Record<string, string> = { leve: "Leve", medio: "Médio", pesado: "Pesado" };
const weightDots: Record<string, number> = { leve: 1, medio: 2, pesado: 3 };
const weightHours: Record<string, number> = { leve: 0.5, medio: 1.5, pesado: 2.5 };

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

  const [mood, setMood] = useState<EnergyMood>(null);
  const [moodStep, setMoodStep] = useState<"ask" | "converse" | "done">("ask");
  const [focus, setFocus] = useState<Execution | null>(null);
  const [skipping, setSkipping] = useState<Execution | null>(null);
  const [showEod, setShowEod] = useState(false);
  const [reorganizing, setReorganizing] = useState(false);

  const tasks = todayExecutions(executions).filter((t) => t.status !== "cancelada");
  const done = tasks.filter((t) => t.status === "concluida").length;
  const total = tasks.length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const capacity = DAILY_CAPACITY_HOURS;
  const planned = plannedHoursForDate(executions, todayISO());

  const pendingTasks = tasks.filter((t) => t.status === "planejada");
  const insight = insightsComputed(state)[0];

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
        <div className="flex items-center gap-2">
          <div className="rounded-full border border-border bg-surface px-3 py-1 text-xs font-semibold text-primary">
            {pct}%
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                aria-label="Menu"
                className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-surface"
              >
                <EllipsisVertical className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild>
                <Link to="/configuracoes" className="flex items-center gap-2">
                  <Settings className="h-4 w-4" /> Configurações
                </Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {/* Morning conversation */}
      {moodStep !== "done" && (
        <MorningConversation
          mood={mood}
          step={moodStep}
          onPick={(m) => {
            setMood(m);
            setMoodStep("converse");
          }}
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
            setMoodStep("done");
          }}
          onReset={() => {
            setMood(null);
            setMoodStep("ask");
          }}
        />
      )}
      {moodStep === "done" && mood && (
        <section className="card-surface mt-6 flex items-center justify-between p-4">
          <div className="text-sm">
            <p className="font-medium">
              {mood === "doente" && "Dia doente — modo mínimo ativo."}
              {mood === "cansado" && "Dia cansado — pesados adiados."}
              {mood === "normal" && "Dia normal — plano preservado."}
              {mood === "fogo" && "Modo fogo — metas elevadas."}
            </p>
            <p className="text-xs text-muted-foreground">
              {mood === "doente" && "Só o essencial. Resto reagendei."}
              {mood === "cansado" && "Amanhã você pega os pesos."}
              {mood === "fogo" && "Aproveita — hoje é raro."}
              {mood === "normal" && "Capacidade do dia ok."}
            </p>
          </div>
          <button
            onClick={() => {
              setMood(null);
              setMoodStep("ask");
            }}
            className="text-xs text-muted-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </section>
      )}

      {/* Capacity */}
      <section className="mt-4 flex items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3">
        <Zap className="h-4 w-4 text-warning" />
        <div className="flex-1">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Capacidade do dia</span>
            <span className="font-semibold">
              {planned.toFixed(1)}h / {capacity}h
            </span>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-2">
            <div
              className={`h-full rounded-full ${planned > capacity ? "bg-danger" : "bg-primary"}`}
              style={{ width: `${Math.min(100, (planned / capacity) * 100)}%` }}
            />
          </div>
          {planned > capacity && (
            <p className="mt-1 text-[10px] text-danger">
              Sobrecarregado — considere redistribuir algo.
            </p>
          )}
        </div>
      </section>

      {/* Insight do dia + Hidratação */}
      <div className="mt-4 flex items-stretch gap-3">
        {insight && (
          <section className="card-surface flex min-w-0 flex-1 items-start gap-3 border-primary/40 bg-primary/5 p-4">
            <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-primary">
                Insight do dia
              </p>
              <p className="mt-1 text-sm font-medium text-balance-tight">{insight.detail}</p>
              {insight.action && (
                <Link
                  to="/dashboard"
                  className="mt-2 inline-block text-xs font-semibold text-primary"
                >
                  {insight.action} →
                </Link>
              )}
            </div>
          </section>
        )}
        <HydrationCard className="w-28 shrink-0" />
      </div>

      <div className="mt-7 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Tarefas de hoje</h2>
        <span className="text-xs text-muted-foreground">
          {done} de {total}
        </span>
      </div>

      <ul className="mt-3 space-y-3">
        {tasks.map((t) => {
          const cat = categoryMeta[t.category] ?? categoryMeta.generico;
          const streak = streakForTitle(executions, t.title);
          const reliability = reliabilityFor(t.category, executions);
          const missed = isMissed(t);
          const doneNow = t.status === "concluida";
          return (
            <li
              key={t.id}
              className={`card-surface group relative overflow-hidden p-4 transition-opacity ${doneNow ? "opacity-50" : ""}`}
            >
              <div className="flex items-start gap-3">
                <button
                  onClick={async () => {
                    await toggleExecutionDone(t.id);
                  }}
                  className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border transition-colors ${doneNow ? "border-primary bg-primary text-primary-foreground" : "border-border bg-surface-2"}`}
                >
                  {doneNow && <Check className="h-4 w-4" strokeWidth={3} />}
                </button>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
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
                  <p className={`mt-1 font-semibold leading-snug ${doneNow ? "line-through" : ""}`}>
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
                <div className="flex flex-col items-end gap-2">
                  {!doneNow && (
                    <button
                      onClick={() => setFocus(t)}
                      className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground transition-transform active:scale-95"
                    >
                      <Play className="h-4 w-4 fill-current" />
                    </button>
                  )}
                  {!doneNow && (
                    <button
                      onClick={() => setSkipping(t)}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <MoreHorizontal className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            </li>
          );
        })}
        {tasks.length === 0 && (
          <li className="card-surface p-6 text-center text-sm text-muted-foreground">
            Nada planejado para hoje.
          </li>
        )}
      </ul>

      {/* End of day / reorganize triggers */}
      <div className="mt-5 flex gap-2.5">
        <button
          onClick={() => setReorganizing(true)}
          className="card-surface flex flex-1 items-center gap-2.5 p-4 text-left transition-colors hover:border-primary/50"
        >
          <RefreshCcw className="h-4 w-4 text-primary" />
          <div className="min-w-0">
            <p className="text-sm font-semibold">Reorganizar meu dia</p>
            <p className="text-[11px] text-muted-foreground">Seu dia mudou? Ajuste agora.</p>
          </div>
        </button>
        <button
          onClick={() => setShowEod(true)}
          className="card-surface flex flex-1 items-center gap-2.5 p-4 text-left transition-colors hover:border-primary/50"
        >
          <Moon className="h-4 w-4 text-warning" />
          <div className="min-w-0">
            <p className="text-sm font-semibold">Fechar o dia</p>
            <p className="text-[11px] text-muted-foreground">{pendingTasks.length} pendentes.</p>
          </div>
        </button>
      </div>

      {/* Subagendas */}
      <div className="mt-8">
        <h2 className="text-lg font-semibold">Subagendas</h2>
      </div>
      <div className="mt-3">
        <SubagendasGrid />
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

function MorningConversation({
  mood,
  step,
  onPick,
  onFinish,
  onReset,
}: {
  mood: EnergyMood;
  step: "ask" | "converse";
  onPick: (m: EnergyMood) => void;
  onFinish: (action: string) => void;
  onReset: () => void;
}) {
  if (step === "ask") {
    return (
      <section className="card-surface mt-6 p-4">
        <p className="text-sm font-medium">Como você está hoje?</p>
        <div className="mt-3 grid grid-cols-4 gap-2">
          {(
            [
              { v: "fogo", emoji: "🔥", label: "Fogo" },
              { v: "normal", emoji: "😐", label: "Normal" },
              { v: "cansado", emoji: "😴", label: "Cansado" },
              { v: "doente", emoji: "🤒", label: "Doente" },
            ] as const
          ).map((o) => (
            <button
              key={o.v}
              onClick={() => onPick(o.v)}
              className="rounded-xl border border-border bg-surface-2 py-3 text-center transition-colors hover:border-primary/50"
            >
              <div className="text-2xl">{o.emoji}</div>
              <div className="mt-1 text-[10px] text-muted-foreground">{o.label}</div>
            </button>
          ))}
        </div>
      </section>
    );
  }

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
    <section className="card-surface mt-6 space-y-4 border-primary/30 bg-primary/5 p-5">
      <div className="flex items-start gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/15">
          <Sparkles className="h-4 w-4 text-primary" />
        </div>
        <div className="flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-primary">
            Revisão matinal
          </p>
          <p className="mt-1 text-base font-semibold text-balance-tight">{cfg.line}</p>
          <p className="mt-2 text-sm text-muted-foreground">{cfg.prompt}</p>
        </div>
        <button onClick={onReset} className="text-muted-foreground">
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
  useEffect(() => {
    const id = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, []);
  const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
  const ss = String(seconds % 60).padStart(2, "0");
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
          onClick={onDone}
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

  return (
    <div
      className="fixed inset-0 z-50 flex items-end bg-background/80 backdrop-blur-sm sm:items-center sm:justify-center"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="card-surface w-full max-w-md rounded-b-none rounded-t-3xl border-x-0 border-b-0 p-6 sm:rounded-3xl sm:border"
      >
        {step === "why" && (
          <>
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Antes de pular</p>
            <h3 className="mt-2 text-xl font-bold">Lembra por que isso importa?</h3>
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
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Sem julgamento</p>
            <h3 className="mt-2 text-xl font-bold">Você esqueceu ou não conseguiu?</h3>
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
            <p className="text-xs uppercase tracking-wider text-muted-foreground">
              Perda registrada
            </p>
            <h3 className="mt-2 text-xl font-bold">
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
                    <input
                      type="date"
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                      className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
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
      </div>
    </div>
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
    <div
      className="fixed inset-0 z-50 flex items-end bg-background/85 backdrop-blur-sm sm:items-center sm:justify-center"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="card-surface flex w-full max-w-md flex-col rounded-b-none rounded-t-3xl border-x-0 border-b-0 p-6 sm:rounded-3xl sm:border"
        style={{ maxHeight: "88vh" }}
      >
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground">
              {mode === "reorganizar" ? "Seu dia mudou" : "Fim do dia"}
            </p>
            <h3 className="mt-1 text-xl font-bold">
              {mode === "reorganizar" ? "O que fazemos com o resto?" : "Como foi hoje?"}
            </h3>
          </div>
          <button onClick={onClose}>
            <X className="h-5 w-5 text-muted-foreground" />
          </button>
        </div>

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

        <div className="mt-5 flex-1 overflow-y-auto">
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

        <div className="mt-4 space-y-2">
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
      </div>
    </div>
  );
}
