import type { HabitTimer, PomodoroConfig } from "./types";

// ---------------------------------------------------------------------------
// Timer por TIMESTAMPS. O tempo decorrido é sempre
//   acumulado + (rodando ? agora − início do trecho : 0)
// Nada depende de um setInterval que continue vivo: fechar o app, recarregar,
// suspender o aparelho ou trocar de tela não perde nem duplica segundos. O
// intervalo da interface só REDESENHA.
// ---------------------------------------------------------------------------

export const DEFAULT_POMODORO: PomodoroConfig = {
  focus: 25 * 60,
  short: 5 * 60,
  long: 15 * 60,
  cycles: 4,
};

export function elapsedSeconds(
  timer: Pick<HabitTimer, "state" | "startedAt" | "accumulatedSeconds">,
  nowMs: number,
): number {
  if (timer.state !== "running") return timer.accumulatedSeconds;
  const delta = Math.floor((nowMs - new Date(timer.startedAt).getTime()) / 1000);
  // Relógio do aparelho voltou para trás? Não perde o que já tinha.
  return timer.accumulatedSeconds + Math.max(0, delta);
}

export type PomodoroPhase = {
  phase: "focus" | "short" | "long";
  /** Começa em 1. */
  cycle: number;
  phaseElapsed: number;
  phaseRemaining: number;
  /** Segundos de foco já completos até agora (só as fases de foco contam como tempo da rotina). */
  focusSeconds: number;
  /** Todas as sessões previstas terminaram. */
  finished: boolean;
};

/** Em que fase do Pomodoro estamos depois de `elapsed` segundos. */
export function pomodoroPhase(config: PomodoroConfig, elapsed: number): PomodoroPhase {
  const { focus, short, long, cycles } = config;
  let t = elapsed;
  let focusSeconds = 0;
  for (let cycle = 1; cycle <= cycles; cycle++) {
    if (t < focus)
      return {
        phase: "focus",
        cycle,
        phaseElapsed: t,
        phaseRemaining: focus - t,
        focusSeconds: focusSeconds + t,
        finished: false,
      };
    t -= focus;
    focusSeconds += focus;
    const breakLen = cycle === cycles ? long : short;
    if (cycle === cycles) {
      // Depois da última sessão de foco vem a pausa longa e a sequência termina.
      if (t < breakLen)
        return {
          phase: "long",
          cycle,
          phaseElapsed: t,
          phaseRemaining: breakLen - t,
          focusSeconds,
          finished: false,
        };
      return {
        phase: "long",
        cycle,
        phaseElapsed: breakLen,
        phaseRemaining: 0,
        focusSeconds,
        finished: true,
      };
    }
    if (t < breakLen)
      return {
        phase: "short",
        cycle,
        phaseElapsed: t,
        phaseRemaining: breakLen - t,
        focusSeconds,
        finished: false,
      };
    t -= breakLen;
  }
  return {
    phase: "long",
    cycle: cycles,
    phaseElapsed: 0,
    phaseRemaining: 0,
    focusSeconds,
    finished: true,
  };
}

/** Segundos que contam como tempo REAL da rotina quando o timer é encerrado. */
export function measuredSeconds(timer: HabitTimer, nowMs: number): number {
  const elapsed = elapsedSeconds(timer, nowMs);
  if (timer.mode === "pomodoro" && timer.pomodoro)
    return pomodoroPhase(timer.pomodoro, elapsed).focusSeconds;
  if (timer.mode === "countdown" && timer.targetSeconds) return elapsed; // o que passou além da meta também foi tempo real
  return elapsed;
}

export type TimerView = {
  elapsed: number;
  /** Contagem regressiva / fase do Pomodoro: segundos restantes (negativo = passou do fim). */
  remaining?: number;
  label: string;
  phase?: PomodoroPhase;
  done: boolean;
};

export function viewOf(timer: HabitTimer, nowMs: number): TimerView {
  const elapsed = elapsedSeconds(timer, nowMs);
  if (timer.mode === "countdown" && timer.targetSeconds) {
    const remaining = timer.targetSeconds - elapsed;
    return { elapsed, remaining, label: "Contagem regressiva", done: remaining <= 0 };
  }
  if (timer.mode === "pomodoro" && timer.pomodoro) {
    const phase = pomodoroPhase(timer.pomodoro, elapsed);
    const label =
      phase.phase === "focus"
        ? `Foco ${phase.cycle}/${timer.pomodoro.cycles}`
        : phase.phase === "short"
          ? "Pausa curta"
          : "Pausa longa";
    return { elapsed, remaining: phase.phaseRemaining, label, phase, done: phase.finished };
  }
  return { elapsed, label: "Cronômetro", done: false };
}

export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.floor(Math.abs(seconds)));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(sec).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}
