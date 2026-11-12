import { useEffect, useState } from "react";
import { Pause, Play, Square, Trash2 } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { InlineError } from "@/components/ui/inline-error";
import { NumberField } from "@/components/ui/number-field";
import { discardTimer, finishTimer, pauseTimer, resumeTimer, startTimer } from "@/lib/habits/store";
import { DEFAULT_POMODORO, formatClock, viewOf } from "@/lib/habits/timer";
import type { Habit, HabitTimer, TimerMode } from "@/lib/habits/types";
import type { LogDone } from "./HabitRow";
import { undoLog } from "@/lib/habits/store";

const MODES: { id: TimerMode; label: string }[] = [
  { id: "stopwatch", label: "Cronômetro" },
  { id: "countdown", label: "Contagem" },
  { id: "pomodoro", label: "Pomodoro" },
];

/** Relógio que só REDESENHA: o tempo vem dos timestamps, não deste intervalo. */
export function useNow(active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    // Voltar para a aba depois de minutos recalcula na hora.
    const onVisible = () => setNow(Date.now());
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [active]);
  return now;
}

export function TimerSheet({
  habit,
  timer,
  onClose,
  onDone,
}: {
  habit: Habit;
  timer: HabitTimer | null;
  onClose: () => void;
  onDone: LogDone;
}) {
  const [mode, setMode] = useState<TimerMode>("stopwatch");
  const [minutes, setMinutes] = useState(25);
  const [pomodoro, setPomodoro] = useState(DEFAULT_POMODORO);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const mine = timer && timer.habitId === habit.id ? timer : null;
  const now = useNow(!!mine && mine.state === "running");

  const act = async (fn: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível concluir.");
    } finally {
      setBusy(false);
    }
  };

  if (timer && !mine) {
    return (
      <Modal onClose={onClose} title="Timer em andamento">
        <p className="text-sm text-muted-foreground">
          Já existe um timer rodando em outra rotina. Encerre-o antes de iniciar outro.
        </p>
      </Modal>
    );
  }

  if (!mine) {
    return (
      <Modal
        onClose={onClose}
        title={`Timer · ${habit.name}`}
        footer={
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              act(async () => {
                await startTimer({
                  habitId: habit.id,
                  mode,
                  targetSeconds: mode === "countdown" ? Math.round(minutes * 60) : undefined,
                  pomodoro: mode === "pomodoro" ? pomodoro : undefined,
                });
              })
            }
            className="interactive-press min-h-12 w-full rounded-xl bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-40"
          >
            <Play className="mr-1 inline h-4 w-4" /> Iniciar
          </button>
        }
      >
        <div className="space-y-4">
          <div role="radiogroup" aria-label="Tipo de timer" className="flex gap-2">
            {MODES.map((m) => (
              <button
                key={m.id}
                role="radio"
                aria-checked={mode === m.id}
                onClick={() => setMode(m.id)}
                className={`interactive-press min-h-11 flex-1 rounded-xl border text-xs font-semibold ${
                  mode === m.id
                    ? "border-primary/60 bg-primary/15 text-primary"
                    : "border-border text-muted-foreground"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
          {mode === "countdown" && (
            <label className="block text-sm">
              <span className="mb-1 block text-[11px] uppercase tracking-wider text-muted-foreground">
                Minutos
              </span>
              <NumberField
                integer
                value={minutes}
                onValue={(v) => setMinutes(Math.min(1440, Math.max(1, v)))}
                aria-label="Minutos"
                className="min-h-12 w-full rounded-xl border border-border bg-surface px-3 text-center text-lg font-semibold"
              />
            </label>
          )}
          {mode === "pomodoro" && (
            <fieldset className="grid grid-cols-2 gap-3">
              <legend className="mb-3 text-sm">Seu ritmo de foco</legend>
              {(
                [
                  ["focus", "Foco (min)", 120],
                  ["short", "Pausa curta (min)", 60],
                  ["long", "Pausa final (min)", 120],
                  ["cycles", "Sessões", 12],
                ] as const
              ).map(([key, label, max]) => (
                <label key={key} className="text-sm">
                  {label}
                  <NumberField
                    integer
                    aria-label={label}
                    value={key === "cycles" ? pomodoro[key] : pomodoro[key] / 60}
                    onValue={(value) =>
                      setPomodoro((old) => ({
                        ...old,
                        [key]:
                          Math.min(max, Math.max(1, Math.round(value))) *
                          (key === "cycles" ? 1 : 60),
                      }))
                    }
                    className="mt-1 min-h-12 w-full rounded-xl border border-border bg-surface px-3 text-center text-lg font-semibold"
                  />
                </label>
              ))}
              <p className="col-span-2 text-xs text-muted-foreground">
                Só o tempo de foco conta na rotina.
              </p>
            </fieldset>
          )}
          <p className="text-[11px] text-muted-foreground">
            O tempo vem dos horários, não de um relógio rodando: fechar o app ou recarregar a página
            não perde nada.
          </p>
          {error && <InlineError message={error} />}
        </div>
      </Modal>
    );
  }

  const view = viewOf(mine, now);
  const main =
    view.remaining !== undefined ? formatClock(view.remaining) : formatClock(view.elapsed);
  const over = view.remaining !== undefined && view.remaining < 0;

  return (
    <Modal onClose={onClose} title={`Timer · ${habit.name}`}>
      <div className="space-y-5 text-center">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">{view.label}</p>
        <p
          className={`font-mono text-6xl font-bold tabular-nums ${over ? "text-primary" : ""}`}
          role="timer"
          aria-live="off"
          aria-label={`${main}${over ? " além da meta" : ""}`}
        >
          {over ? "+" : ""}
          {main}
        </p>
        {view.phase && (
          <p className="text-sm text-muted-foreground">
            Foco acumulado: {formatClock(view.phase.focusSeconds)}
          </p>
        )}
        {mine.mode === "countdown" && view.done && (
          <p className="text-sm text-primary">
            Meta de tempo atingida — o que passar disso também conta.
          </p>
        )}
        <div className="flex justify-center gap-3">
          {mine.state === "running" ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => act(() => pauseTimer(mine))}
              className="timer-btn interactive-press"
              aria-label="Pausar"
            >
              <Pause className="h-5 w-5" /> Pausar
            </button>
          ) : (
            <button
              type="button"
              disabled={busy}
              onClick={() => act(() => resumeTimer(mine))}
              className="timer-btn interactive-press"
              aria-label="Retomar"
            >
              <Play className="h-5 w-5" /> Retomar
            </button>
          )}
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              act(async () => {
                const log = await finishTimer(mine, habit);
                if (log)
                  onDone(
                    `${habit.name}: ${formatClock(log.durationSeconds ?? 0)} registrado.`,
                    () => undoLog(log.id),
                  );
                onClose();
              })
            }
            className="timer-btn timer-btn-primary interactive-press"
            aria-label="Encerrar e registrar"
          >
            <Square className="h-5 w-5" /> Encerrar
          </button>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            act(async () => {
              await discardTimer(mine);
              onClose();
            })
          }
          className="interactive-press inline-flex min-h-11 items-center gap-1.5 text-xs text-muted-foreground"
        >
          <Trash2 className="h-3.5 w-3.5" /> Descartar sem registrar
        </button>
        {error && <InlineError message={error} />}
      </div>
    </Modal>
  );
}
