import { summarize, type EvalContext, type Summary } from "./engine";
import type { Habit, HabitLog } from "./types";

// ---------------------------------------------------------------------------
// Espelho das rotinas: o que o conjunto de rotinas mostra num período.
// Só conta o que foi avaliável: pausa e dia pulado ficam fora, e dia sem
// registro aparece como tal (não como falha). Poucos dados → sem conclusão.
// ---------------------------------------------------------------------------

/** Dias avaliados mínimos para uma rotina entrar em destaque. */
export const MIN_JUDGED = 4;

export type HabitMirrorRow = {
  habit: Habit;
  summary: Summary;
  judged: number;
  completed: number;
  none: number;
  paused: number;
  skipped: number;
};

export type HabitMirror = {
  rows: HabitMirrorRow[];
  judged: number;
  completed: number;
  /** completed / judged, ou null sem base. */
  consistency: number | null;
  pausedDays: number;
  noRecordDays: number;
  byArea: {
    area: string;
    judged: number;
    completed: number;
    consistency: number | null;
    habits: number;
  }[];
  /** Rotinas com base suficiente, da mais para a menos regular. */
  steady: HabitMirrorRow[];
  needsAttention: HabitMirrorRow[];
  feelings: { leve: number; neutro: number; pesado: number; answered: number };
  /** Há dado suficiente para falar em padrão? */
  sufficient: boolean;
};

const judgedOf = (s: Summary) =>
  (s.totals.completed ?? 0) +
  (s.totals.partial ?? 0) +
  (s.totals.missed ?? 0) +
  (s.totals.none ?? 0) +
  (s.totals.exceeded ?? 0) +
  (s.totals.unconfirmed ?? 0);

export function mirrorHabits(
  ctx: EvalContext,
  habits: Habit[],
  logs: HabitLog[],
  from: string,
  to: string,
): HabitMirror {
  const byHabit = new Map<string, HabitLog[]>();
  for (const l of logs) {
    const list = byHabit.get(l.habitId);
    if (list) list.push(l);
    else byHabit.set(l.habitId, [l]);
  }
  const rows: HabitMirrorRow[] = [];
  for (const habit of habits) {
    const start = from < habit.startDate ? habit.startDate : from;
    // Rotina arquivada antes do período não entra; a que começou depois, só do início.
    if (start > to) continue;
    if (habit.archivedAt && habit.archivedAt.slice(0, 10) < from) continue;
    const summary = summarize(ctx, habit, byHabit.get(habit.id) ?? [], start, to);
    rows.push({
      habit,
      summary,
      judged: judgedOf(summary),
      completed: summary.totals.completed ?? 0,
      none: (summary.totals.none ?? 0) + (summary.totals.unconfirmed ?? 0),
      paused: summary.totals.paused ?? 0,
      skipped: summary.totals.skipped ?? 0,
    });
  }
  const judged = rows.reduce((s, r) => s + r.judged, 0);
  const completed = rows.reduce((s, r) => s + r.completed, 0);

  const areaMap = new Map<string, { judged: number; completed: number; habits: number }>();
  for (const r of rows) {
    const key = r.habit.area ?? "Sem área";
    const cur = areaMap.get(key) ?? { judged: 0, completed: 0, habits: 0 };
    cur.judged += r.judged;
    cur.completed += r.completed;
    cur.habits += 1;
    areaMap.set(key, cur);
  }

  const ranked = rows
    .filter((r) => r.judged >= MIN_JUDGED && r.summary.consistency !== null)
    .sort((a, b) => (b.summary.consistency ?? 0) - (a.summary.consistency ?? 0));

  const feelings = { leve: 0, neutro: 0, pesado: 0, answered: 0 };
  for (const l of logs) {
    if (l.deletedAt || !l.feeling || l.localDate < from || l.localDate > to) continue;
    feelings[l.feeling] += 1;
    feelings.answered += 1;
  }

  return {
    rows,
    judged,
    completed,
    consistency: judged > 0 ? completed / judged : null,
    pausedDays: rows.reduce((s, r) => s + r.paused, 0),
    noRecordDays: rows.reduce((s, r) => s + r.none, 0),
    byArea: [...areaMap.entries()]
      .map(([area, v]) => ({
        area,
        ...v,
        consistency: v.judged > 0 ? v.completed / v.judged : null,
      }))
      .sort((a, b) => b.judged - a.judged),
    steady: ranked.slice(0, 3),
    needsAttention: [...ranked]
      .reverse()
      .filter((r) => (r.summary.consistency ?? 1) < 0.5)
      .slice(0, 3),
    feelings,
    sufficient: judged >= MIN_JUDGED,
  };
}
