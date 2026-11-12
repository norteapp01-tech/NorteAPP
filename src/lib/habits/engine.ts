import { addDaysISO, dayIndex } from "../agenda-intervals";
import { weekdayOf } from "../agenda-recurrence";
import type { EndCondition, GoalPeriod, Habit, HabitLog, HabitVersion, Pause } from "./types";

// ---------------------------------------------------------------------------
// Motor de rotinas — funções puras (nada lê estado, banco nem relógio).
//
// Regras que atravessam o arquivo:
//  * A meta que vale num dia é a da VERSÃO vigente naquele dia: mudar a meta
//    hoje nunca reescreve o passado.
//  * Ausência de informação NÃO é falha. "Sem registro" é uma categoria própria
//    e não entra como sucesso nem como erro.
//  * Em metas de redução (limitar/abandonar), zero registrado não prova um dia
//    sem consumo: só vira "cumprido" quando a pessoa fecha o dia (log
//    `confirmed`). Dia aberto = "dentro do limite até agora".
//  * Pausa tira o dia das contas; ela não vira falha nem sucesso.
//  * Datas são datas civis (YYYY-MM-DD) já no fuso da pessoa.
// ---------------------------------------------------------------------------

export type Outcome =
  | "completed" // meta cumprida
  | "partial" // houve progresso, mas não chegou na meta
  | "skipped" // pulado de propósito
  | "missed" // marcado como "não realizei"
  | "paused" // em pausa
  | "none" // dia passado sem nenhuma informação
  | "open" // hoje, ainda em andamento
  | "within" // redução: dentro do limite até agora (dia/período aberto)
  | "unconfirmed" // redução: dia passado dentro do limite, mas nunca fechado
  | "exceeded" // redução: passou do limite
  | "not_scheduled" // não estava programado
  | "before_start" // antes do início da rotina
  | "future";

export type EvalContext = {
  today: string;
  /** 0 = domingo, 1 = segunda. */
  weekStart: 0 | 1;
  pauses: Pause[];
};

export type DayEval = {
  date: string;
  outcome: Outcome;
  scheduled: boolean;
  value: number;
  goal: number;
  /** Houve algum registro de valor neste dia? */
  hasEntries: boolean;
  checks: string[];
  version?: HabitVersion;
};

// ---------------------------------------------------------------------------
// Datas
// ---------------------------------------------------------------------------

export function monthDayOf(iso: string): number {
  return Number(iso.slice(8, 10));
}

export function daysInMonth(iso: string): number {
  const y = Number(iso.slice(0, 4));
  const m = Number(iso.slice(5, 7));
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function startOfPeriod(iso: string, period: GoalPeriod, weekStart: 0 | 1): string {
  if (period === "day") return iso;
  if (period === "week") {
    const back = (weekdayOf(iso) - weekStart + 7) % 7;
    return addDaysISO(iso, -back);
  }
  if (period === "month") return `${iso.slice(0, 7)}-01`;
  return `${iso.slice(0, 4)}-01-01`;
}

export function endOfPeriod(iso: string, period: GoalPeriod, weekStart: 0 | 1): string {
  if (period === "day") return iso;
  const start = startOfPeriod(iso, period, weekStart);
  if (period === "week") return addDaysISO(start, 6);
  if (period === "month")
    return `${start.slice(0, 7)}-${String(daysInMonth(start)).padStart(2, "0")}`;
  return `${start.slice(0, 4)}-12-31`;
}

export function previousPeriodStart(iso: string, period: GoalPeriod, weekStart: 0 | 1): string {
  return startOfPeriod(addDaysISO(startOfPeriod(iso, period, weekStart), -1), period, weekStart);
}

export function eachDay(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDaysISO(d, 1)) out.push(d);
  return out;
}

// ---------------------------------------------------------------------------
// Versões, programação e pausa
// ---------------------------------------------------------------------------

/** Versão de meta/frequência que vale em `date` (a última com vigência até ele). */
export function versionAt(habit: Habit, date: string): HabitVersion | undefined {
  let found: HabitVersion | undefined;
  for (const v of habit.versions) {
    if (v.effectiveFrom <= date && (!found || v.effectiveFrom >= found.effectiveFrom)) found = v;
  }
  return found;
}

/** A rotina aparece neste dia? (Meta flexível aparece todo dia: não tem dia fixo.) */
export function isScheduledOn(
  habit: Habit,
  date: string,
  version = versionAt(habit, date),
): boolean {
  if (!version || date < habit.startDate) return false;
  if (version.flexible) return true;
  const s = version.schedule;
  switch (s.type) {
    case "daily":
      return true;
    case "weekdays":
      return s.weekdays.includes(weekdayOf(date));
    case "monthdays": {
      const day = monthDayOf(date);
      const last = daysInMonth(date);
      // Dia 31 num mês de 30 dias cai no último dia, em vez de sumir do mês.
      return s.days.some((d) => d === day || (d > last && day === last));
    }
    case "interval": {
      const anchor =
        version.effectiveFrom < habit.startDate ? habit.startDate : version.effectiveFrom;
      const diff = dayIndex(date) - dayIndex(anchor);
      return diff >= 0 && diff % Math.max(1, s.every) === 0;
    }
  }
}

/** Pausa que cobre este hábito neste dia (individual, da área ou global). */
export function pauseOn(habit: Habit, date: string, pauses: Pause[]): Pause | undefined {
  return pauses.find((p) => {
    if (date < p.startDate || (p.endDate && date > p.endDate)) return false;
    if (p.scope === "global") return true;
    if (p.scope === "habit") return p.habitId === habit.id;
    return !!habit.area && p.area === habit.area;
  });
}

// ---------------------------------------------------------------------------
// Registros
// ---------------------------------------------------------------------------

export type LogIndex = Map<string, HabitLog[]>;

export function indexLogs(logs: HabitLog[]): LogIndex {
  const map: LogIndex = new Map();
  for (const l of logs) {
    if (l.deletedAt) continue;
    const list = map.get(l.localDate);
    if (list) list.push(l);
    else map.set(l.localDate, [l]);
  }
  return map;
}

function dayLogs(index: LogIndex, date: string) {
  const list = index.get(date) ?? [];
  const entries = list.filter((l) => l.status === "recorded");
  return {
    entries,
    value: entries.reduce((sum, l) => sum + l.value, 0),
    skipped: list.some((l) => l.status === "skipped"),
    missed: list.some((l) => l.status === "missed"),
    confirmed: list.some((l) => l.status === "confirmed"),
    checks: [...new Set(list.flatMap((l) => l.checks))],
  };
}

const isReduction = (h: Habit) => h.intent !== "build";

/** Limite numérico de uma rotina de redução ("abandonar" é limite zero). */
export function limitOf(habit: Habit, version: HabitVersion | undefined): number {
  return habit.intent === "quit" ? 0 : (version?.goalValue ?? 0);
}

// ---------------------------------------------------------------------------
// Avaliação de um dia
// ---------------------------------------------------------------------------

export function evaluateDay(
  ctx: EvalContext,
  habit: Habit,
  index: LogIndex,
  date: string,
): DayEval {
  const version = versionAt(habit, date);
  const base = {
    date,
    value: 0,
    goal: version?.goalValue ?? 1,
    hasEntries: false,
    checks: [] as string[],
    version,
  };
  if (date > ctx.today) return { ...base, outcome: "future", scheduled: false };
  if (date < habit.startDate || !version)
    return { ...base, outcome: "before_start", scheduled: false };

  const day = dayLogs(index, date);
  const scheduled = isScheduledOn(habit, date, version);
  const common = {
    ...base,
    value: day.value,
    hasEntries: day.entries.length > 0,
    checks: day.checks,
    scheduled,
  };

  if (pauseOn(habit, date, ctx.pauses) && day.value === 0) return { ...common, outcome: "paused" };

  // Meta que não é diária se avalia no PERÍODO; o dia só mostra a contribuição.
  if (version.goalPeriod !== "day") {
    if (day.skipped) return { ...common, outcome: "skipped" };
    if (day.missed) return { ...common, outcome: "missed" };
    if (day.value > 0) return { ...common, outcome: date === ctx.today ? "open" : "partial" };
    return {
      ...common,
      outcome: scheduled ? (date === ctx.today ? "open" : "none") : "not_scheduled",
    };
  }

  if (!scheduled && day.value === 0 && !day.skipped && !day.missed) {
    return { ...common, outcome: "not_scheduled" };
  }
  if (day.skipped) return { ...common, outcome: "skipped" };
  if (day.missed) return { ...common, outcome: "missed" };

  if (isReduction(habit)) {
    const limit = limitOf(habit, version);
    const goal = limit;
    if (day.value > limit) return { ...common, goal, outcome: "exceeded" };
    if (day.confirmed) return { ...common, goal, outcome: "completed" };
    if (date >= ctx.today) return { ...common, goal, outcome: "within" };
    // Dia passado, dentro do limite, mas nunca fechado: não prova nada.
    return { ...common, goal, outcome: "unconfirmed" };
  }

  const goal = habit.measure === "binary" ? 1 : version.goalValue;
  if (day.value >= goal && goal > 0) return { ...common, goal, outcome: "completed" };
  if (day.value > 0) return { ...common, goal, outcome: date === ctx.today ? "open" : "partial" };
  return { ...common, goal, outcome: date === ctx.today ? "open" : "none" };
}

// ---------------------------------------------------------------------------
// Avaliação de um período (semana, mês, ano) — e do dia, que é um período de 1 dia
// ---------------------------------------------------------------------------

export type PeriodEval = {
  period: GoalPeriod;
  start: string;
  end: string;
  value: number;
  /** Meta ajustada pelos dias em pausa. */
  goal: number;
  pausedDays: number;
  activeDays: number;
  outcome: Outcome;
  /** Para metas abertas de construir: quanto falta por dia restante. */
  remainingPerDay?: number;
  closed: boolean;
};

export function evaluatePeriod(
  ctx: EvalContext,
  habit: Habit,
  index: LogIndex,
  anchor: string,
): PeriodEval {
  const version = versionAt(habit, anchor);
  const period = version?.goalPeriod ?? "day";
  const start = startOfPeriod(anchor, period, ctx.weekStart);
  const end = endOfPeriod(anchor, period, ctx.weekStart);
  const days = eachDay(
    start < habit.startDate ? habit.startDate : start,
    end > ctx.today ? end : end,
  );
  const closed = end < ctx.today;

  let value = 0;
  let pausedDays = 0;
  const doneDays = new Set<string>();
  let confirmedAtEnd = false;
  for (const d of days) {
    if (d > ctx.today) break;
    const l = dayLogs(index, d);
    value += l.value;
    if (l.value > 0) doneDays.add(d);
    if (l.confirmed && d === end) confirmedAtEnd = true;
    if (pauseOn(habit, d, ctx.pauses) && l.value === 0) pausedDays += 1;
  }
  // Rotina binária numa meta de período conta DIAS cumpridos, não toques.
  if (habit.measure === "binary" && period !== "day") value = doneDays.size;

  const totalDays = days.length || 1;
  const activeDays = Math.max(0, totalDays - pausedDays);
  const baseGoal = version?.goalValue ?? 1;
  let goal = baseGoal;
  if (isReduction(habit)) goal = limitOf(habit, version);
  else if (pausedDays > 0 && period !== "day") {
    const scaled = (baseGoal * activeDays) / totalDays;
    goal =
      habit.measure === "quantity" || habit.measure === "duration"
        ? Math.round(scaled * 100) / 100
        : Math.ceil(scaled);
  }

  const common = { period, start, end, value, goal, pausedDays, activeDays, closed };
  if (!version || end < habit.startDate) return { ...common, outcome: "before_start" };
  if (start > ctx.today) return { ...common, outcome: "future" };
  if (activeDays === 0) return { ...common, outcome: "paused" };

  if (isReduction(habit)) {
    if (value > goal) return { ...common, outcome: "exceeded" };
    if (!closed) return { ...common, outcome: "within" };
    return { ...common, outcome: confirmedAtEnd ? "completed" : "unconfirmed" };
  }
  if (goal > 0 && value >= goal) return { ...common, outcome: "completed" };
  if (!closed) {
    const left = Math.max(0, goal - value);
    const remainingDays = Math.max(1, eachDay(ctx.today, end).length);
    return {
      ...common,
      outcome: value > 0 ? "open" : "open",
      remainingPerDay: left / remainingDays,
    };
  }
  return { ...common, outcome: value > 0 ? "partial" : "none" };
}

// ---------------------------------------------------------------------------
// O que mostrar hoje
// ---------------------------------------------------------------------------

export type TodayItem = {
  habit: Habit;
  day: DayEval;
  period: PeriodEval;
  /** Aparece na lista de hoje? (programado, flexível ou com registro). */
  due: boolean;
  /** Já resolvido para hoje: cumprido, pulado, em pausa… */
  settled: boolean;
};

export function todayItem(ctx: EvalContext, habit: Habit, index: LogIndex): TodayItem {
  const day = evaluateDay(ctx, habit, index, ctx.today);
  const period = evaluatePeriod(ctx, habit, index, ctx.today);
  const version = day.version;
  const flexible = !!version?.flexible || (version?.goalPeriod ?? "day") !== "day";
  const due =
    !habit.archivedAt &&
    (day.scheduled || flexible || day.hasEntries) &&
    day.outcome !== "before_start";
  const periodDone = period.outcome === "completed" && period.period !== "day";
  const settled =
    day.outcome === "completed" ||
    day.outcome === "skipped" ||
    day.outcome === "missed" ||
    day.outcome === "paused" ||
    periodDone;
  return { habit, day, period, due, settled };
}

// ---------------------------------------------------------------------------
// Condição de encerramento
// ---------------------------------------------------------------------------

export type EndState = { ended: boolean; progress: number; detail: string };

export function endState(ctx: EvalContext, habit: Habit, logs: HabitLog[]): EndState | null {
  const c: EndCondition | undefined = habit.endCondition;
  if (!c) return null;
  const live = logs.filter((l) => !l.deletedAt);
  if (c.type === "date") {
    return {
      ended: ctx.today > c.date,
      progress: ctx.today > c.date ? 1 : 0,
      detail: `até ${c.date}`,
    };
  }
  if (c.type === "total") {
    const total = live.filter((l) => l.status === "recorded").reduce((s, l) => s + l.value, 0);
    return {
      ended: total >= c.amount,
      progress: Math.min(1, total / c.amount),
      detail: `${total} de ${c.amount}`,
    };
  }
  // completions: dias com a meta cumprida
  const index = indexLogs(live);
  let count = 0;
  for (const d of eachDay(habit.startDate, ctx.today)) {
    if (evaluateDay(ctx, habit, index, d).outcome === "completed") count += 1;
  }
  return {
    ended: count >= c.count,
    progress: Math.min(1, count / c.count),
    detail: `${count} de ${c.count}`,
  };
}

// ---------------------------------------------------------------------------
// Métricas, sequência e série para gráficos
// ---------------------------------------------------------------------------

export type Summary = {
  from: string;
  to: string;
  totals: Record<Outcome, number>;
  scheduledDays: number;
  /** Dias com resultado informado: cumpridos + parciais + não realizados + acima do limite. */
  informed: number;
  /** Dias passados sem informação (sem registro, ou redução nunca fechada): não são falha nem sucesso. */
  noInfo: number;
  /** Cumprimento REGISTRADO: cumpridos ÷ dias com resultado informado. */
  completionRate: number | null;
  /** Cobertura dos registros: dias informados ÷ (informados + sem informação). */
  coverage: number | null;
  /** Adesão ao planejado: cumpridos ÷ todos os dias programados avaliáveis, tratando
   * a ausência de registro como não cumprido. Só use com esse nome. */
  planAdherence: number | null;
  value: number;
  activeDays: number;
  average: number | null;
  sessions: number;
  durationSeconds: number;
};

export function summarize(
  ctx: EvalContext,
  habit: Habit,
  logs: HabitLog[],
  from: string,
  to: string,
): Summary {
  const index = indexLogs(logs);
  const totals = {} as Record<Outcome, number>;
  const days = eachDay(from, to > ctx.today ? ctx.today : to);
  let scheduledDays = 0;
  let value = 0;
  for (const d of days) {
    const e = evaluateDay(ctx, habit, index, d);
    totals[e.outcome] = (totals[e.outcome] ?? 0) + 1;
    if (e.scheduled && e.outcome !== "paused" && e.outcome !== "not_scheduled") scheduledDays += 1;
    value += e.value;
  }
  const t = (o: Outcome) => totals[o] ?? 0;
  const informed = t("completed") + t("partial") + t("missed") + t("exceeded");
  const noInfo = t("none") + t("unconfirmed");
  const judged = informed + noInfo;
  const inRange = logs.filter(
    (l) => !l.deletedAt && l.status === "recorded" && l.localDate >= from && l.localDate <= to,
  );
  const activeDays = new Set(inRange.map((l) => l.localDate)).size;
  return {
    from,
    to,
    totals,
    scheduledDays,
    informed,
    noInfo,
    completionRate: informed > 0 ? t("completed") / informed : null,
    coverage: judged > 0 ? informed / judged : null,
    planAdherence: judged > 0 ? t("completed") / judged : null,
    value,
    activeDays,
    average: activeDays > 0 ? value / activeDays : null,
    sessions: inRange.length,
    durationSeconds: inRange.reduce((s, l) => s + (l.durationSeconds ?? 0), 0),
  };
}

/** Sequência de PERÍODOS cumpridos. Pular/pausar/sem programação não quebram;
 * ficar sem registro ou parcial quebram. É só informação — nunca apaga histórico. */
export function streaks(
  ctx: EvalContext,
  habit: Habit,
  logs: HabitLog[],
): { current: number; best: number } {
  const index = indexLogs(logs);
  const version = versionAt(habit, ctx.today);
  const period = version?.goalPeriod ?? "day";
  const outcomes: Outcome[] = [];
  if (period === "day") {
    for (const d of eachDay(habit.startDate, ctx.today))
      outcomes.push(evaluateDay(ctx, habit, index, d).outcome);
  } else {
    let cursor = startOfPeriod(habit.startDate, period, ctx.weekStart);
    while (cursor <= ctx.today) {
      outcomes.push(evaluatePeriod(ctx, habit, index, cursor).outcome);
      cursor = addDaysISO(endOfPeriod(cursor, period, ctx.weekStart), 1);
    }
  }
  let current = 0;
  let best = 0;
  for (let i = 0; i < outcomes.length; i++) {
    const o = outcomes[i];
    const isLast = i === outcomes.length - 1;
    if (o === "completed") {
      current += 1;
      best = Math.max(best, current);
    } else if (
      ["skipped", "paused", "not_scheduled", "before_start", "future", "within"].includes(o)
    ) {
      // neutro
    } else if (o === "open" && isLast) {
      // período em andamento ainda não quebrou
    } else {
      current = 0;
    }
  }
  return { current, best };
}

export type HeatCell = { date: string; outcome: Outcome; value: number; goal: number };

export function heatmap(
  ctx: EvalContext,
  habit: Habit,
  logs: HabitLog[],
  from: string,
  to: string,
): HeatCell[] {
  const index = indexLogs(logs);
  return eachDay(from, to).map((d) => {
    const e = evaluateDay(ctx, habit, index, d);
    return { date: d, outcome: e.outcome, value: e.value, goal: e.goal };
  });
}

export type SeriesPoint = { start: string; end: string; value: number; goal: number };

/** Total por dia, semana, mês ou ano, para o gráfico de colunas. */
export function series(
  ctx: EvalContext,
  habit: Habit,
  logs: HabitLog[],
  granularity: GoalPeriod,
  from: string,
  to: string,
): SeriesPoint[] {
  const index = indexLogs(logs);
  const out: SeriesPoint[] = [];
  let cursor = startOfPeriod(from, granularity, ctx.weekStart);
  while (cursor <= to) {
    const end = endOfPeriod(cursor, granularity, ctx.weekStart);
    let value = 0;
    for (const d of eachDay(cursor, end > ctx.today ? ctx.today : end))
      value += dayLogs(index, d).value;
    const v = versionAt(habit, cursor);
    out.push({
      start: cursor,
      end,
      value,
      goal: granularity === (v?.goalPeriod ?? "day") ? (v?.goalValue ?? 0) : 0,
    });
    cursor = addDaysISO(end, 1);
  }
  return out;
}

export function motivesOfSkips(logs: HabitLog[]): { reason: string; count: number }[] {
  const map = new Map<string, number>();
  for (const l of logs) {
    if (l.deletedAt || (l.status !== "skipped" && l.status !== "missed") || !l.reason) continue;
    map.set(l.reason, (map.get(l.reason) ?? 0) + 1);
  }
  return [...map.entries()]
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count);
}

export function feelingCounts(logs: HabitLog[]): {
  leve: number;
  neutro: number;
  pesado: number;
  answered: number;
} {
  const out = { leve: 0, neutro: 0, pesado: 0, answered: 0 };
  for (const l of logs) {
    if (l.deletedAt || !l.feeling) continue;
    out[l.feeling] += 1;
    out.answered += 1;
  }
  return out;
}
