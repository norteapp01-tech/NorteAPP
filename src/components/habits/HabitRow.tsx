import { useState } from "react";
import { Check, ChevronRight, MoreHorizontal, Undo2, X, Play, Plus, Timer } from "lucide-react";
import type { DayEval, PeriodEval } from "@/lib/habits/engine";
import { formatAmount } from "@/lib/habits/units";
import { logHabit, newKey, undoLog } from "@/lib/habits/store";
import type { Habit, HabitLog } from "@/lib/habits/types";
import {
  INTENT_LABEL,
  OUTCOME_LABEL,
  goalText,
  progressFraction,
  progressText,
  scheduleText,
  stepsFor,
} from "@/lib/habits/format";

export type LogDone = (message: string, undo: () => Promise<unknown>) => void;

/** Estado mostrado ao lado do nome: nunca só pela cor. */
export function OutcomeMark({
  outcome,
  size = 20,
}: {
  outcome: DayEval["outcome"];
  size?: number;
}) {
  const common = { width: size, height: size, viewBox: "0 0 20 20", "aria-hidden": true as const };
  switch (outcome) {
    case "completed":
      return (
        <svg {...common} className="text-primary">
          <circle cx="10" cy="10" r="9" fill="currentColor" opacity=".18" />
          <path
            d="M5.5 10.5l3 3 6-7"
            stroke="currentColor"
            strokeWidth="2"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "partial":
    case "open":
    case "within":
      return (
        <svg {...common} className="text-primary">
          <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="1.6" fill="none" />
          <path d="M10 2a8 8 0 0 1 0 16z" fill="currentColor" opacity=".55" />
        </svg>
      );
    case "skipped":
      return (
        <svg {...common} className="text-muted-foreground">
          <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="1.6" fill="none" />
          <path d="M6 10h8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      );
    case "missed":
    case "exceeded":
      return (
        <svg {...common} className="text-danger">
          <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="1.6" fill="none" />
          <path
            d="M7 7l6 6M13 7l-6 6"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
      );
    case "paused":
      return (
        <svg {...common} className="text-muted-foreground">
          <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="1.6" fill="none" />
          <path d="M8 7v6M12 7v6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      );
    case "unconfirmed":
      return (
        <svg {...common} className="text-muted-foreground">
          <circle
            cx="10"
            cy="10"
            r="8"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeDasharray="3 2.5"
            fill="none"
          />
        </svg>
      );
    default:
      return (
        <svg {...common} className="text-muted-foreground/60">
          <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="1.4" fill="none" />
        </svg>
      );
  }
}

const SKIP_REASONS = ["Sem tempo", "Cansaço", "Doente", "Viagem", "Outro"];

export function HabitRow({
  habit,
  day,
  period,
  date,
  todayLogs,
  onOpen,
  onQuick,
  onTimer,
  onDone,
  onError,
}: {
  habit: Habit;
  day: DayEval;
  period: PeriodEval;
  date: string;
  /** Registros deste hábito na data mostrada (para desfazer o último). */
  todayLogs: HabitLog[];
  onOpen: () => void;
  onQuick: () => void;
  onTimer: () => void;
  onDone: LogDone;
  onError: (message: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [menu, setMenu] = useState(false);
  const fraction = progressFraction(habit, day, period);
  const unit = habit.measure === "duration" ? "min" : habit.unit;
  const step = stepsFor(habit)[0];
  const recorded = todayLogs.filter((l) => l.status === "recorded");
  const last = recorded[recorded.length - 1];
  const settled =
    day.outcome === "completed" || day.outcome === "skipped" || day.outcome === "missed";
  const reduction = habit.intent !== "build";

  const run = async (message: string, action: () => Promise<HabitLog | void>) => {
    if (busy) return;
    setBusy(true);
    try {
      const created = await action();
      if (created)
        onDone(created.pending ? "Guardado neste aparelho. Aguardando conexão." : message, () =>
          undoLog(created.id),
        );
    } catch (e) {
      onError(e instanceof Error ? e.message : "Não foi possível registrar.");
    } finally {
      setBusy(false);
    }
  };

  const toggleBinary = () => {
    if (day.outcome === "completed" && last) {
      void run("Registro desfeito.", async () => {
        await undoLog(last.id);
      });
      return;
    }
    void run(`${habit.name}: feito.`, () =>
      logHabit({ habitId: habit.id, date, value: 1, key: newKey() }),
    );
  };

  const add = () =>
    void run(`+${formatAmount(step, unit)} em ${habit.name}.`, () =>
      logHabit({ habitId: habit.id, date, value: step, key: newKey() }),
    );

  const skip = (reason: string) => {
    setMenu(false);
    void run(`${habit.name}: pulada.`, () =>
      logHabit({ habitId: habit.id, date, status: "skipped", reason, key: newKey() }),
    );
  };

  const miss = () => {
    setMenu(false);
    void run(`${habit.name}: marcada como não realizada.`, () =>
      logHabit({ habitId: habit.id, date, status: "missed", key: newKey() }),
    );
  };

  const confirmDay = () => {
    setMenu(false);
    void run(`Dia fechado: ${habit.name} dentro do limite.`, () =>
      logHabit({ habitId: habit.id, date, status: "confirmed", key: newKey() }),
    );
  };

  const undoLast = () => {
    setMenu(false);
    if (last) void run("Último registro desfeito.", async () => void (await undoLog(last.id)));
  };

  const stateLog = todayLogs.find((l) => l.status !== "recorded");

  return (
    <li className="habit-row" data-outcome={day.outcome}>
      {habit.measure === "binary" && !reduction ? (
        <button
          type="button"
          onClick={toggleBinary}
          disabled={busy}
          aria-pressed={day.outcome === "completed"}
          aria-label={
            day.outcome === "completed"
              ? `Desfazer ${habit.name}`
              : `Marcar ${habit.name} como feita`
          }
          className="habit-check interactive-press"
        >
          {day.outcome === "completed" ? <Check className="h-5 w-5" strokeWidth={3} /> : null}
        </button>
      ) : (
        <button
          type="button"
          onClick={add}
          disabled={busy}
          aria-label={`Registrar ${formatAmount(step, unit)} em ${habit.name}`}
          className="habit-add interactive-press"
        >
          <Plus className="h-4 w-4" strokeWidth={2.6} />
          <span>{step % 1 === 0 ? step : String(step).replace(".", ",")}</span>
        </button>
      )}

      <button
        type="button"
        onClick={onOpen}
        className="habit-main interactive-press"
        aria-label={`Abrir ${habit.name}`}
      >
        <span className="flex items-center gap-1.5">
          <strong className="truncate">{habit.name}</strong>
          {reduction && <span className="habit-chip">{INTENT_LABEL[habit.intent]}</span>}
        </span>
        <span className="habit-sub">
          <OutcomeMark outcome={day.outcome} size={14} />
          <span className="min-w-0">
            {stateLog ? OUTCOME_LABEL[day.outcome] : progressText(habit, day, period)}
            {!stateLog &&
            day.outcome !== "open" &&
            day.outcome !== "completed" &&
            day.outcome !== "partial" &&
            day.outcome !== "within"
              ? ` · ${OUTCOME_LABEL[day.outcome]}`
              : ""}
          </span>
        </span>
        <span className="habit-bar" aria-hidden="true">
          <i style={{ width: `${Math.round(fraction * 100)}%` }} />
        </span>
        <span className="sr-only">
          {goalText(habit, day.version)}. {scheduleText(day.version)}.
        </span>
      </button>

      <div className="habit-actions">
        {habit.measure !== "binary" && (
          <button
            type="button"
            onClick={onQuick}
            className="habit-icon-btn interactive-press"
            aria-label={`Informar valor de ${habit.name}`}
          >
            <span className="text-xs font-semibold">123</span>
          </button>
        )}
        {habit.measure === "duration" && (
          <button
            type="button"
            onClick={onTimer}
            className="habit-icon-btn interactive-press"
            aria-label={`Iniciar timer de ${habit.name}`}
          >
            <Timer className="h-4 w-4" />
          </button>
        )}
        <button
          type="button"
          onClick={() => setMenu((v) => !v)}
          aria-expanded={menu}
          aria-label={`Mais ações de ${habit.name}`}
          className="habit-icon-btn interactive-press"
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </div>

      {menu && (
        <div className="habit-menu" role="menu">
          {reduction && day.outcome !== "completed" && date <= day.date && (
            <button role="menuitem" onClick={confirmDay} disabled={busy}>
              <Check className="h-4 w-4" /> Fechar o dia dentro do limite
            </button>
          )}
          {last && (
            <button role="menuitem" onClick={undoLast} disabled={busy}>
              <Undo2 className="h-4 w-4" /> Desfazer último registro
            </button>
          )}
          <p className="habit-menu-title">Pular hoje</p>
          <div className="flex flex-wrap gap-1.5 px-3 pb-2">
            {SKIP_REASONS.map((r) => (
              <button
                key={r}
                role="menuitem"
                onClick={() => skip(r)}
                disabled={busy}
                className="habit-reason"
              >
                {r}
              </button>
            ))}
          </div>
          <button role="menuitem" onClick={miss} disabled={busy}>
            <X className="h-4 w-4" /> Marcar como não realizada
          </button>
          <button role="menuitem" onClick={onOpen}>
            <Play className="h-4 w-4 opacity-0" /> Ver detalhes{" "}
            <ChevronRight className="ml-auto h-4 w-4" />
          </button>
        </div>
      )}
    </li>
  );
}
