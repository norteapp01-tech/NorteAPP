// Tempo e fusos para a integração com o Google Agenda.
//
// Autocontido de propósito: as Edge Functions (Deno) só enxergam a pasta
// `supabase/functions`, então nada aqui importa de `src/`.
//
// O Norte guarda data e hora "ingênuas" ("2026-10-12", "14:00") lidas no fuso
// do app. O Google guarda instantes (ou data + fuso). Toda conversão passa por
// aqui, sempre via Intl — nunca pelo fuso do servidor.

export const pad2 = (n: number) => String(n).padStart(2, "0");

export function dayIndex(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86_400_000);
}

export function isoFromDayIndex(index: number): string {
  const d = new Date(index * 86_400_000);
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

export const addDaysISO = (iso: string, delta: number) => isoFromDayIndex(dayIndex(iso) + delta);

export function weekdayOf(iso: string): number {
  return new Date(dayIndex(iso) * 86_400_000).getUTCDay();
}

export function isValidTimeZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

/** Data e hora (HH:MM) que um instante tem num fuso. */
export function dateAndTimeInZone(date: Date, zone: string): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? "00";
  return {
    date: `${value("year")}-${value("month")}-${value("day")}`,
    time: `${value("hour")}:${value("minute")}`,
  };
}

/** Instante UTC cuja leitura no fuso é "data hora". Um passo de correção basta:
 * nenhum fuso muda de offset dentro do próprio minuto de correção. */
export function zonedTimeToUtc(dateStr: string, timeStr: string, zone: string): Date {
  const hm = timeStr.length === 5 ? `${timeStr}:00` : timeStr;
  const wanted = new Date(`${dateStr}T${hm}Z`);
  const read = dateAndTimeInZone(wanted, zone);
  const readAsUtc = new Date(`${read.date}T${read.time}:00Z`);
  const correction = new Date(`${dateStr}T${hm.slice(0, 5)}:00Z`).getTime() - readAsUtc.getTime();
  return new Date(wanted.getTime() + correction);
}

/** Converte um valor `start`/`end` do Google (dateTime ISO com offset) para a
 * data e hora no fuso do Norte. */
export function instantToZoned(iso: string, zone: string): { date: string; time: string } {
  return dateAndTimeInZone(new Date(iso), zone);
}

/** "2026-10-12", "14:00" → "20261012T140000" (hora local, sem Z). */
export function toRRuleLocal(date: string, time: string): string {
  return `${date.replace(/-/g, "")}T${time.replace(":", "")}00`;
}

export function toRRuleUtc(date: Date): string {
  return `${date.getUTCFullYear()}${pad2(date.getUTCMonth() + 1)}${pad2(date.getUTCDate())}T${pad2(date.getUTCHours())}${pad2(date.getUTCMinutes())}${pad2(date.getUTCSeconds())}Z`;
}

export function minutesBetween(
  startDate: string,
  startTime: string,
  endDate: string,
  endTime: string,
) {
  const a =
    dayIndex(startDate) * 1440 + Number(startTime.slice(0, 2)) * 60 + Number(startTime.slice(3, 5));
  const b =
    dayIndex(endDate) * 1440 + Number(endTime.slice(0, 2)) * 60 + Number(endTime.slice(3, 5));
  return b - a;
}
