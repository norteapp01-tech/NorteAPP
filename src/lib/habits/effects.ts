import { addDaysISO } from "../agenda-intervals";
import { dateAndTimeInZone, zonedTimeToUtcISO } from "../app-time-zone";
import {
  evaluateDay,
  evaluatePeriod,
  indexLogs,
  isScheduledOn,
  pauseOn,
  versionAt,
  type EvalContext,
  type Outcome,
} from "./engine";
import type { Chain, Habit, HabitLog, HabitReminder } from "./types";

// ---------------------------------------------------------------------------
// Efeitos de um registro (encadeamento e lembretes) — funções puras.
//
// Um registro só "conclui" uma rotina quando ele muda o ESTADO da meta de não
// concluída para concluída. 100 ml de uma meta de 2 L não conclui nada; um
// segundo registro depois da meta também não conclui de novo.
// ---------------------------------------------------------------------------

/** Estado da meta (dia, ou período quando a meta não é diária) na data do registro. */
export function goalOutcome(
  ctx: EvalContext,
  habit: Habit,
  logs: HabitLog[],
  date: string,
): Outcome {
  const index = indexLogs(logs.filter((l) => l.habitId === habit.id));
  const version = versionAt(habit, date);
  if (version && version.goalPeriod !== "day")
    return evaluatePeriod(ctx, habit, index, date).outcome;
  return evaluateDay(ctx, habit, index, date).outcome;
}

export type Transition = { before: Outcome; after: Outcome };

/** Estado antes e depois de `changed`. `logs` já contém o registro no estado final. */
export function transitionOf(
  ctx: EvalContext,
  habit: Habit,
  logs: HabitLog[],
  changed: HabitLog,
  mode: "added" | "removed" = "added",
): Transition {
  const withIt = logs.some((l) => l.id === changed.id) ? logs : [...logs, changed];
  const without = logs.filter((l) => l.id !== changed.id);
  const date = changed.localDate;
  const a = goalOutcome(ctx, habit, withIt, date);
  const b = goalOutcome(ctx, habit, without, date);
  return mode === "added" ? { before: b, after: a } : { before: a, after: b };
}

/** Este registro dispara `chain.trigger`? Só na transição real. */
export function firesTrigger(trigger: Chain["trigger"], changed: HabitLog, t: Transition): boolean {
  if (changed.deletedAt) return false;
  switch (trigger) {
    case "done":
      return t.after === "completed" && t.before !== "completed";
    case "skipped":
      return changed.status === "skipped" && t.after === "skipped" && t.before !== "skipped";
    case "missed":
      return changed.status === "missed" && t.after === "missed" && t.before !== "missed";
  }
}

export type TargetVerdict = { ok: true } | { ok: false; reason: string };

/** A rotina-alvo ainda precisa de um aviso hoje? */
export function targetNeedsReminder(
  ctx: EvalContext,
  target: Habit,
  targetLogs: HabitLog[],
  today: string,
): TargetVerdict {
  if (target.archivedAt) return { ok: false, reason: "arquivada" };
  if (pauseOn(target, today, ctx.pauses)) return { ok: false, reason: "em pausa" };
  const version = versionAt(target, today);
  if (!version || !isScheduledOn(target, today, version))
    return { ok: false, reason: "não programada hoje" };
  const out = goalOutcome(ctx, target, targetLogs, today);
  if (out === "completed" || out === "skipped" || out === "missed")
    return { ok: false, reason: "já resolvida hoje" };
  return { ok: true };
}

/** Identidade do evento: o mesmo registro de origem, no mesmo encadeamento, para a mesma data de destino. */
export const chainEventKey = (chainId: string, sourceLogId: string, targetDate: string) =>
  `${chainId}:${sourceLogId}:${targetDate}`;

// --- horário silencioso ----------------------------------------------------

export type QuietHours = { start: string; end: string } | null;

const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

/** Dentro do silêncio? (a janela pode atravessar a meia-noite, ex. 22:00–07:00) */
export function inQuietHours(time: string, quiet: QuietHours): boolean {
  if (!quiet || quiet.start === quiet.end) return false;
  const m = toMin(time);
  const s = toMin(quiet.start);
  const e = toMin(quiet.end);
  return s < e ? m >= s && m < e : m >= s || m < e;
}

/**
 * Instante em que o aviso deve sair: `now + delay`, empurrado para o fim do
 * silêncio quando cai nele. Devolve também a data local do aviso — um aviso
 * empurrado para outro dia não vale mais para "hoje" (devolve null).
 */
export function scheduleAt(
  now: Date,
  delayMinutes: number,
  zone: string,
  quiet: QuietHours,
  today: string,
): { at: Date; date: string } | null {
  let at = new Date(now.getTime() + delayMinutes * 60_000);
  at.setSeconds(0, 0);
  const local = dateAndTimeInZone(at, zone);
  const moved = shiftOutOfQuiet(local.date, local.time, quiet);
  if (moved.date !== local.date || moved.time !== local.time)
    at = new Date(zonedTimeToUtcISO(moved.date, moved.time, zone));
  if (moved.date !== today) return null;
  return { at, date: moved.date };
}

/** Se o horário cai no silêncio, vai para o fim dele (no dia seguinte quando o silêncio atravessa a noite). */
export function shiftOutOfQuiet(
  date: string,
  time: string,
  quiet: QuietHours,
): { date: string; time: string } {
  if (!quiet || !inQuietHours(time, quiet)) return { date, time };
  const crossesNight = toMin(quiet.start) > toMin(quiet.end);
  return {
    date: crossesNight && toMin(time) >= toMin(quiet.start) ? addDaysISO(date, 1) : date,
    time: quiet.end,
  };
}

// --- lembretes por horário -------------------------------------------------

export type Occurrence = { reminderId: string; date: string; time: string; at: string };

/**
 * Próximas ocorrências dos lembretes de uma rotina nos próximos `days` dias.
 * Pula dia não programado, pausa, rotina arquivada, silêncio e horário passado.
 */
export function reminderOccurrences(
  ctx: EvalContext,
  habit: Habit,
  reminders: HabitReminder[],
  opts: { now: Date; days: number; zone: string; quiet: QuietHours },
): Occurrence[] {
  if (habit.archivedAt) return [];
  const out: Occurrence[] = [];
  const today = dateAndTimeInZone(opts.now, opts.zone).date;
  for (let i = 0; i < opts.days; i++) {
    const date = addDaysISO(today, i);
    const version = versionAt(habit, date);
    if (!version || !isScheduledOn(habit, date, version)) continue;
    if (pauseOn(habit, date, ctx.pauses)) continue;
    const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
    for (const r of reminders) {
      if (!r.enabled || !r.weekdays.includes(weekday)) continue;
      const moved = shiftOutOfQuiet(date, r.time, opts.quiet);
      const at = zonedTimeToUtcISO(moved.date, moved.time, opts.zone);
      if (new Date(at).getTime() <= opts.now.getTime()) continue;
      out.push({ reminderId: r.id, date, time: moved.time, at });
    }
  }
  return out;
}
