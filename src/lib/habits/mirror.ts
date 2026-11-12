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
  /** Dias com resultado informado. */
  informed: number;
  /** Dias com resultado informado + dias sem informação. */
  judged: number;
  completed: number;
  none: number;
  paused: number;
  skipped: number;
};

export type HabitMirror = {
  rows: HabitMirrorRow[];
  judged: number;
  /** Dias com resultado informado. */
  informed: number;
  completed: number;
  /** Cumprimento registrado: cumpridos ÷ dias com resultado informado. */
  completionRate: number | null;
  /** Cobertura: dias informados ÷ (informados + sem informação). */
  coverage: number | null;
  /** Adesão ao planejado (ausência conta como não cumprido) — só com esse nome. */
  planAdherence: number | null;
  pausedDays: number;
  noRecordDays: number;
  byArea: {
    area: string;
    judged: number;
    informed: number;
    completed: number;
    completionRate: number | null;
    habits: number;
  }[];
  /** Rotinas com base suficiente, da mais para a menos regular. */
  steady: HabitMirrorRow[];
  needsAttention: HabitMirrorRow[];
  feelings: { leve: number; neutro: number; pesado: number; answered: number };
  /** Há dado suficiente para falar em padrão? */
  sufficient: boolean;
};

const judgedOf = (s: Summary) => s.informed + s.noInfo;

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
      informed: summary.informed,
      judged: judgedOf(summary),
      completed: summary.totals.completed ?? 0,
      none: (summary.totals.none ?? 0) + (summary.totals.unconfirmed ?? 0),
      paused: summary.totals.paused ?? 0,
      skipped: summary.totals.skipped ?? 0,
    });
  }
  const judged = rows.reduce((s, r) => s + r.judged, 0);
  const informed = rows.reduce((s, r) => s + r.informed, 0);
  const completed = rows.reduce((s, r) => s + r.completed, 0);

  const areaMap = new Map<
    string,
    { judged: number; informed: number; completed: number; habits: number }
  >();
  for (const r of rows) {
    const key = r.habit.area ?? "Sem área";
    const cur = areaMap.get(key) ?? { judged: 0, informed: 0, completed: 0, habits: 0 };
    cur.judged += r.judged;
    cur.informed += r.informed;
    cur.completed += r.completed;
    cur.habits += 1;
    areaMap.set(key, cur);
  }

  const ranked = rows
    // Só rotinas com resultado INFORMADO suficiente entram em destaque: ausência de registro não rebaixa ninguém.
    .filter((r) => r.informed >= MIN_JUDGED && r.summary.completionRate !== null)
    .sort((a, b) => (b.summary.completionRate ?? 0) - (a.summary.completionRate ?? 0));

  const feelings = { leve: 0, neutro: 0, pesado: 0, answered: 0 };
  for (const l of logs) {
    if (l.deletedAt || !l.feeling || l.localDate < from || l.localDate > to) continue;
    feelings[l.feeling] += 1;
    feelings.answered += 1;
  }

  return {
    rows,
    judged,
    informed,
    completed,
    completionRate: informed > 0 ? completed / informed : null,
    coverage: judged > 0 ? informed / judged : null,
    planAdherence: judged > 0 ? completed / judged : null,
    pausedDays: rows.reduce((s, r) => s + r.paused, 0),
    noRecordDays: rows.reduce((s, r) => s + r.none, 0),
    byArea: [...areaMap.entries()]
      .map(([area, v]) => ({
        area,
        ...v,
        completionRate: v.informed > 0 ? v.completed / v.informed : null,
      }))
      .sort((a, b) => b.judged - a.judged),
    steady: ranked.slice(0, 3),
    needsAttention: [...ranked]
      .reverse()
      .filter((r) => (r.summary.completionRate ?? 1) < 0.5)
      .slice(0, 3),
    feelings,
    sufficient: informed >= MIN_JUDGED,
  };
}
