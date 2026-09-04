import type { TimeFormat, WeekStart } from "./profile-store";

/** "14:00" -> "14:00" (24h) ou "2:00 PM" (12h) — única função de formatação de
 * horário do app, pra preferência de Configurações valer em toda tela de verdade. */
export function formatTime(hhmm: string | undefined | null, format: TimeFormat): string {
  if (!hhmm) return "";
  if (format === "24h") return hhmm;
  const [hStr, m] = hhmm.split(":");
  const h24 = parseInt(hStr, 10);
  if (Number.isNaN(h24)) return hhmm;
  const suffix = h24 >= 12 ? "PM" : "AM";
  let h12 = h24 % 12;
  if (h12 === 0) h12 = 12;
  return `${h12}:${m} ${suffix}`;
}

/** Convenção de `Date.getDay()`/date-fns `weekStartsOn`: 0 = domingo, 1 = segunda. */
export function weekStartsOnFor(weekStart: WeekStart): 0 | 1 {
  return weekStart === "sunday" ? 0 : 1;
}

/** Início (local, sem UTC) da semana que contém `date`, respeitando a preferência
 * do usuário — substitui os vários `d.getDate() - d.getDay()` espalhados, que
 * assumiam domingo como primeiro dia independente da preferência salva. */
export function startOfWeekLocal(date: Date, weekStart: WeekStart): Date {
  const startsOn = weekStartsOnFor(weekStart);
  const d = new Date(date);
  const day = d.getDay();
  const diff = (day - startsOn + 7) % 7;
  d.setDate(d.getDate() - diff);
  return d;
}

/** Rótulos de dia da semana (curtos) já na ordem certa pra preferência do usuário. */
export function weekdayLabelsFor(weekStart: WeekStart, labels: string[]): string[] {
  const startsOn = weekStartsOnFor(weekStart);
  return [...labels.slice(startsOn), ...labels.slice(0, startsOn)];
}
