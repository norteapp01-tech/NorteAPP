import { addDaysISO, dayIndex, isoFromDayIndex } from "./agenda-intervals";

// ---------------------------------------------------------------------------
// Recorrência da Agenda — UMA regra para tudo.
//
// Uma série guarda a regra; as ocorrências são calculadas, não gravadas. Só
// quando uma ocorrência é tocada (concluída, movida, cancelada, editada) ela
// vira um registro próprio, uma exceção. Assim "toda segunda" não cria linhas
// infinitas no banco e editar a série não precisa reescrever o futuro.
//
// Funções puras: nada aqui lê estado nem relógio.
// ---------------------------------------------------------------------------

export type RecurrenceFreq = "daily" | "weekly" | "monthly" | "yearly";

export type RecurrenceRule = {
  freq: RecurrenceFreq;
  /** A cada N dias/semanas/meses/anos. Mínimo 1. */
  interval: number;
  /** 0 = domingo … 6 = sábado. Só semanal. Vazio = o dia da semana do início. */
  byWeekday?: number[];
  /** Dia do mês. Só mensal. Vazio = o dia do início. Meses curtos usam o último dia. */
  byMonthDay?: number;
  /** Último dia possível (inclusive). */
  until?: string;
  /** Total de ocorrências a partir do início da série. */
  count?: number;
};

const MAX_ITERATIONS = 20_000;
const MAX_INTERVAL = 999;

export function normalizeRule(rule: RecurrenceRule): RecurrenceRule {
  const interval = Math.min(MAX_INTERVAL, Math.max(1, Math.floor(rule.interval || 1)));
  const out: RecurrenceRule = { freq: rule.freq, interval };
  if (rule.freq === "weekly" && rule.byWeekday?.length)
    out.byWeekday = [...new Set(rule.byWeekday)]
      .filter((d) => d >= 0 && d <= 6)
      .sort((a, b) => a - b);
  if (rule.freq === "monthly" && rule.byMonthDay)
    out.byMonthDay = Math.min(31, Math.max(1, Math.floor(rule.byMonthDay)));
  if (rule.until) out.until = rule.until;
  if (rule.count && rule.count > 0) out.count = Math.floor(rule.count);
  return out;
}

function parts(iso: string): { y: number; m: number; d: number } {
  const [y, m, d] = iso.split("-").map(Number);
  return { y, m, d };
}

const pad = (n: number) => String(n).padStart(2, "0");

function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** 0 = domingo. */
export function weekdayOf(iso: string): number {
  return new Date(dayIndex(iso) * 86_400_000).getUTCDay();
}

/** Segunda-feira da semana de `iso` — âncora fixa, para que "a cada 2 semanas"
 * não mude de paridade quando a pessoa troca o primeiro dia da semana. */
function mondayOf(iso: string): number {
  const index = dayIndex(iso);
  const wd = weekdayOf(iso);
  return index - ((wd + 6) % 7);
}

/** Datas candidatas do "período" de ordem k (0 = período do início). */
function candidatesForPeriod(rule: RecurrenceRule, start: string, k: number): string[] {
  const s = parts(start);
  if (rule.freq === "daily") return [addDaysISO(start, k * rule.interval)];
  if (rule.freq === "weekly") {
    const weekdays = rule.byWeekday?.length ? rule.byWeekday : [weekdayOf(start)];
    const monday = mondayOf(start) + k * rule.interval * 7;
    return weekdays.map((wd) => isoFromDayIndex(monday + ((wd + 6) % 7))).sort();
  }
  if (rule.freq === "monthly") {
    const total = s.y * 12 + (s.m - 1) + k * rule.interval;
    const y = Math.floor(total / 12);
    const m = (total % 12) + 1;
    const day = Math.min(rule.byMonthDay ?? s.d, daysInMonth(y, m));
    return [`${y}-${pad(m)}-${pad(day)}`];
  }
  const y = s.y + k * rule.interval;
  const day = Math.min(s.d, daysInMonth(y, s.m));
  return [`${y}-${pad(s.m)}-${pad(day)}`];
}

/** Datas da série que caem em [from, to] (inclusive). Nunca antes do início. */
export function expandRule(
  rawRule: RecurrenceRule,
  start: string,
  from: string,
  to: string,
): string[] {
  const rule = normalizeRule(rawRule);
  const last = rule.until && rule.until < to ? rule.until : to;
  if (last < from || last < start) return [];
  const out: string[] = [];
  let emitted = 0;
  for (let k = 0; k < MAX_ITERATIONS; k++) {
    const dates = candidatesForPeriod(rule, start, k);
    // Períodos avançam sempre para frente: se o primeiro candidato já passou
    // do limite, não há mais nada a gerar.
    if (dates[0] > last && dates.every((d) => d > last)) break;
    for (const date of dates) {
      if (date < start) continue;
      if (rule.count !== undefined && emitted >= rule.count) return out;
      emitted += 1;
      if (date > last) return out;
      if (date >= from) out.push(date);
    }
    if (rule.count !== undefined && emitted >= rule.count) break;
  }
  return out;
}

/** Quantas ocorrências a série tem ANTES de `date` — usado para dividir uma
 * série com contagem em duas ("esta e as próximas"). */
export function countBefore(rule: RecurrenceRule, start: string, date: string): number {
  if (date <= start) return 0;
  return expandRule(
    { ...rule, until: undefined, count: undefined },
    start,
    start,
    addDaysISO(date, -1),
  ).length;
}

/** Primeira ocorrência estritamente depois de `after`, ou null. */
export function nextOccurrence(rule: RecurrenceRule, start: string, after: string): string | null {
  const horizon = addDaysISO(after, 366 * 5);
  const found = expandRule(rule, start, addDaysISO(after, 1), horizon);
  return found[0] ?? null;
}

// ---------------------------------------------------------------------------
// Escopos de edição: esta / esta e as próximas / toda a série
// ---------------------------------------------------------------------------

export type EditScope = "this" | "following" | "all";

export const scopeLabels: Record<EditScope, string> = {
  this: "Somente esta ocorrência",
  following: "Esta e as próximas",
  all: "Toda a série",
};

export type SeriesLike = {
  startDate: string;
  rule: RecurrenceRule;
};

/** Divide uma série na ocorrência `date`: a antiga termina no dia anterior; a
 * nova começa em `date` herdando o que sobrou da contagem. */
export function splitSeries(
  series: SeriesLike,
  date: string,
): { oldRule: RecurrenceRule; newRule: RecurrenceRule } {
  const rule = normalizeRule(series.rule);
  const before = rule.count !== undefined ? countBefore(rule, series.startDate, date) : 0;
  const oldRule: RecurrenceRule = { ...rule, until: addDaysISO(date, -1) };
  delete oldRule.count;
  if (rule.count !== undefined) oldRule.count = Math.max(1, before);
  const newRule: RecurrenceRule = { ...rule };
  if (rule.count !== undefined) newRule.count = Math.max(1, rule.count - before);
  return { oldRule, newRule };
}

// ---------------------------------------------------------------------------
// Texto para a interface
// ---------------------------------------------------------------------------

const WEEKDAY_SHORT = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const WEEKDAY_LONG = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

export function describeRule(rawRule: RecurrenceRule, start?: string): string {
  const rule = normalizeRule(rawRule);
  const n = rule.interval;
  let base: string;
  if (rule.freq === "daily") base = n === 1 ? "Todos os dias" : `A cada ${n} dias`;
  else if (rule.freq === "weekly") {
    const days = rule.byWeekday?.length ? rule.byWeekday : start ? [weekdayOf(start)] : [];
    const names =
      days.length === 7
        ? ""
        : days.length === 5 && !days.includes(0) && !days.includes(6)
          ? " (dias úteis)"
          : days.length
            ? ` (${days.map((d) => WEEKDAY_SHORT[d]).join(", ")})`
            : "";
    base = n === 1 ? `Toda semana${names}` : `A cada ${n} semanas${names}`;
  } else if (rule.freq === "monthly") {
    const day = rule.byMonthDay ?? (start ? parts(start).d : undefined);
    base = (n === 1 ? "Todo mês" : `A cada ${n} meses`) + (day ? `, dia ${day}` : "");
  } else base = n === 1 ? "Todo ano" : `A cada ${n} anos`;
  if (rule.until) {
    const { y, m, d } = parts(rule.until);
    base += ` · até ${pad(d)}/${pad(m)}/${y}`;
  } else if (rule.count) base += ` · ${rule.count} vezes`;
  return base;
}

export const weekdayShortLabel = (d: number) => WEEKDAY_SHORT[d];
export const weekdayLongLabel = (d: number) => WEEKDAY_LONG[d];

/** Atalhos que a interface oferece antes do "personalizado". */
export function presetRules(start: string): { id: string; label: string; rule: RecurrenceRule }[] {
  const wd = weekdayOf(start);
  return [
    { id: "daily", label: "Todos os dias", rule: { freq: "daily", interval: 1 } },
    {
      id: "weekly",
      label: `Toda ${WEEKDAY_LONG[wd]}`,
      rule: { freq: "weekly", interval: 1, byWeekday: [wd] },
    },
    {
      id: "weekdays",
      label: "Dias úteis (seg–sex)",
      rule: { freq: "weekly", interval: 1, byWeekday: [1, 2, 3, 4, 5] },
    },
    {
      id: "biweekly",
      label: "A cada 2 semanas",
      rule: { freq: "weekly", interval: 2, byWeekday: [wd] },
    },
    { id: "monthly", label: "Todo mês", rule: { freq: "monthly", interval: 1 } },
    { id: "yearly", label: "Todo ano", rule: { freq: "yearly", interval: 1 } },
  ];
}
