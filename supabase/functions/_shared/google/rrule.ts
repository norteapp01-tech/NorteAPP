import {
  dateAndTimeInZone,
  dayIndex,
  toRRuleLocal,
  toRRuleUtc,
  weekdayOf,
  zonedTimeToUtc,
} from "./time.ts";

// ---------------------------------------------------------------------------
// Recorrência: RRULE (Google) ↔ regra do Norte.
//
// O Norte representa: diária, semanal (dias da semana, a cada N), mensal (dia
// do mês), anual, com fim por data ou quantidade. Qualquer coisa além disso
// (primeira segunda-feira do mês, BYSETPOS, RDATE…) NÃO é adivinhada: volta
// como `unsupported`, e o evento entra no Norte somente leitura.
// ---------------------------------------------------------------------------

export type Rule = {
  freq: "daily" | "weekly" | "monthly" | "yearly";
  interval: number;
  byWeekday?: number[];
  byMonthDay?: number;
  until?: string;
  count?: number;
};

export type ParsedRecurrence = {
  rule: Rule | null;
  /** Datas (no fuso do Norte) excluídas da série. */
  exdates: string[];
  /** Motivo, quando a repetição não cabe no modelo do Norte. */
  unsupported?: string;
};

const DAY_CODES = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
const FREQ: Record<string, Rule["freq"]> = {
  DAILY: "daily",
  WEEKLY: "weekly",
  MONTHLY: "monthly",
  YEARLY: "yearly",
};
const UNSUPPORTED_PARTS = [
  "BYSETPOS",
  "BYHOUR",
  "BYMINUTE",
  "BYSECOND",
  "BYWEEKNO",
  "BYYEARDAY",
  "HOURLY",
  "MINUTELY",
  "SECONDLY",
];

function parseParams(line: string): Record<string, string> {
  const body = line.slice(line.indexOf(":") + 1);
  const out: Record<string, string> = {};
  for (const part of body.split(";")) {
    const eq = part.indexOf("=");
    if (eq > 0) out[part.slice(0, eq).toUpperCase()] = part.slice(eq + 1);
  }
  return out;
}

/** "20261012", "20261012T090000", "20261012T120000Z" → data no fuso. */
function dateFromRRuleValue(value: string, zone: string): string {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/.exec(value.trim());
  if (!m) throw new Error(`Data inválida na recorrência: ${value}`);
  const date = `${m[1]}-${m[2]}-${m[3]}`;
  if (!m[4]) return date;
  if (m[7]) return dateAndTimeInZone(new Date(`${date}T${m[4]}:${m[5]}:${m[6]}Z`), zone).date;
  return date;
}

export function parseRecurrence(
  lines: string[] | undefined,
  ctx: { startDate: string; zone: string; dayShift?: number },
): ParsedRecurrence {
  const exdates: string[] = [];
  let rule: Rule | null = null;
  let unsupported: string | undefined;
  const shift = ctx.dayShift ?? 0;

  for (const raw of lines ?? []) {
    const line = raw.trim();
    const name = line.slice(0, line.search(/[:;]/)).toUpperCase();
    if (name === "RRULE") {
      const p = parseParams(line);
      const freq = FREQ[p.FREQ ?? ""];
      if (!freq) {
        unsupported = `Repetição ${p.FREQ ?? "desconhecida"} não é suportada pelo Norte.`;
        continue;
      }
      const bad = UNSUPPORTED_PARTS.find((k) => k in p);
      if (bad) {
        unsupported = `Repetição com ${bad} não é suportada pelo Norte.`;
        continue;
      }
      const parsed: Rule = { freq, interval: Math.max(1, Number(p.INTERVAL ?? 1) || 1) };

      if (p.BYDAY) {
        const days: number[] = [];
        for (const token of p.BYDAY.split(",")) {
          const m = /^([+-]?\d+)?(SU|MO|TU|WE|TH|FR|SA)$/.exec(token.trim());
          if (!m || m[1]) {
            unsupported =
              "Repetição por posição no mês (ex.: segunda semana) não é suportada pelo Norte.";
            break;
          }
          days.push((DAY_CODES.indexOf(m[2]) + shift + 7) % 7);
        }
        if (freq === "weekly") parsed.byWeekday = [...new Set(days)].sort((a, b) => a - b);
        else if (!unsupported)
          unsupported = "Repetição por dia da semana só é suportada na frequência semanal.";
      }
      if (p.BYMONTHDAY) {
        const days = p.BYMONTHDAY.split(",");
        const n = Number(days[0]);
        if (freq !== "monthly" || days.length > 1 || !Number.isFinite(n) || n < 1) {
          unsupported = "Repetição por dia do mês nesse formato não é suportada pelo Norte.";
        } else parsed.byMonthDay = n;
      }
      if (p.BYMONTH) {
        const month = Number(ctx.startDate.slice(5, 7));
        if (freq !== "yearly" || Number(p.BYMONTH) !== month)
          unsupported = "Repetição por mês nesse formato não é suportada pelo Norte.";
      }
      if (p.UNTIL) parsed.until = dateFromRRuleValue(p.UNTIL, ctx.zone);
      if (p.COUNT) parsed.count = Math.max(1, Number(p.COUNT) || 1);
      if (p.UNTIL && p.COUNT) unsupported = "Repetição com UNTIL e COUNT juntos é inválida.";
      rule = parsed;
    } else if (name === "EXDATE") {
      const value = line.slice(line.indexOf(":") + 1);
      for (const part of value.split(",")) {
        if (part.trim()) exdates.push(dateFromRRuleValue(part, ctx.zone));
      }
    } else if (name === "RDATE") {
      unsupported = "Datas extras de repetição (RDATE) não são suportadas pelo Norte.";
    }
    // EXRULE é obsoleto e ignorado.
  }
  return { rule: unsupported ? null : rule, exdates: [...new Set(exdates)].sort(), unsupported };
}

export function formatRecurrence(input: {
  rule: Rule;
  startDate: string;
  startTime?: string;
  allDay: boolean;
  zone: string;
  exdates?: string[];
}): string[] {
  const { rule, startDate, startTime, allDay, zone } = input;
  const parts = [`FREQ=${rule.freq.toUpperCase()}`];
  if (rule.interval > 1) parts.push(`INTERVAL=${rule.interval}`);
  if (rule.freq === "weekly") {
    const days = rule.byWeekday?.length ? rule.byWeekday : [weekdayOf(startDate)];
    parts.push(`BYDAY=${days.map((d) => DAY_CODES[d]).join(",")}`);
  }
  if (rule.freq === "monthly" && rule.byMonthDay) parts.push(`BYMONTHDAY=${rule.byMonthDay}`);
  if (rule.until) {
    // O tipo do UNTIL acompanha o do início: data para dia inteiro, UTC para hora.
    parts.push(
      allDay
        ? `UNTIL=${rule.until.replace(/-/g, "")}`
        : `UNTIL=${toRRuleUtc(zonedTimeToUtc(rule.until, `${startTime ?? "00:00"}`.slice(0, 5), zone))}`,
    );
  } else if (rule.count) parts.push(`COUNT=${rule.count}`);

  const lines = [`RRULE:${parts.join(";")}`];
  const ex = [...new Set(input.exdates ?? [])].sort();
  if (ex.length > 0) {
    lines.push(
      allDay
        ? `EXDATE;VALUE=DATE:${ex.map((d) => d.replace(/-/g, "")).join(",")}`
        : `EXDATE;TZID=${zone}:${ex.map((d) => toRRuleLocal(d, startTime ?? "00:00")).join(",")}`,
    );
  }
  return lines;
}

/** Quantos dias o início do evento andou ao trocar de fuso (para ajustar BYDAY). */
export function dayShiftBetween(fromDate: string, toDate: string): number {
  const diff = dayIndex(toDate) - dayIndex(fromDate);
  return Math.abs(diff) <= 1 ? diff : 0;
}
