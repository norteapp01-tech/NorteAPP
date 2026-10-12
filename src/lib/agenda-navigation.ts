import { addDaysISO, dayIndex } from "./agenda-intervals";
import type { AgendaView } from "./agenda-settings";
import { weekdayOf } from "./agenda-recurrence";
import type { WeekStart } from "./profile-store";

// ---------------------------------------------------------------------------
// Navegação da Agenda. UM estado manda: o dia selecionado. A semana exibida, o
// título do mês e a linha do tempo são todos DERIVADOS dele — assim voltar ou
// avançar uma semana nunca deixa o título num mês e o conteúdo em outro.
// ---------------------------------------------------------------------------

export const MONTH_NAMES = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];
export const WEEKDAY_NAMES = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
export const WEEKDAY_LETTERS = ["D", "S", "T", "Q", "Q", "S", "S"];

function parts(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return { y, m, d };
}
const pad = (n: number) => String(n).padStart(2, "0");

export function weekStartIndex(weekStart: WeekStart): number {
  return weekStart === "sunday" ? 0 : 1;
}

/** Primeiro dia da semana que contém `iso`. */
export function startOfWeekISO(iso: string, weekStart: WeekStart): string {
  const offset = (weekdayOf(iso) - weekStartIndex(weekStart) + 7) % 7;
  return addDaysISO(iso, -offset);
}

/** Dias da semana de `iso`; sem fins de semana, só segunda a sexta. */
export function weekDates(iso: string, weekStart: WeekStart, showWeekends = true): string[] {
  const start = startOfWeekISO(iso, weekStart);
  const all = Array.from({ length: 7 }, (_, i) => addDaysISO(start, i));
  return showWeekends ? all : all.filter((d) => ![0, 6].includes(weekdayOf(d)));
}

export function addMonthsISO(iso: string, delta: number): string {
  const { y, m, d } = parts(iso);
  const total = y * 12 + (m - 1) + delta;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  const last = new Date(Date.UTC(ny, nm, 0)).getUTCDate();
  return `${ny}-${pad(nm)}-${pad(Math.min(d, last))}`;
}

/** Avançar/voltar em cada visão. O dia selecionado ACOMPANHA: uma semana
 * adiante é o mesmo dia da semana, sete dias depois. */
export function shiftDate(iso: string, view: AgendaView, delta: number): string {
  if (view === "dia") return addDaysISO(iso, delta);
  if (view === "mes") return addMonthsISO(iso, delta);
  return addDaysISO(iso, 7 * delta);
}

/** Dias que a visão precisa carregar (inclui a véspera, por causa de
 * compromissos que atravessam a meia-noite). */
export function rangeForView(
  iso: string,
  view: AgendaView,
  weekStart: WeekStart,
): { from: string; to: string } {
  if (view === "dia") return { from: addDaysISO(iso, -1), to: iso };
  if (view === "semana") {
    const start = startOfWeekISO(iso, weekStart);
    return { from: addDaysISO(start, -1), to: addDaysISO(start, 6) };
  }
  if (view === "mes") {
    const { y, m } = parts(iso);
    const first = `${y}-${pad(m)}-01`;
    const last = `${y}-${pad(m)}-${pad(new Date(Date.UTC(y, m, 0)).getUTCDate())}`;
    return {
      from: startOfWeekISO(first, weekStart),
      to: addDaysISO(startOfWeekISO(last, weekStart), 6),
    };
  }
  return { from: addDaysISO(iso, -1), to: addDaysISO(iso, 90) };
}

/** Grade do mês: linhas de 7 dias começando no primeiro dia da semana. */
export function monthGrid(
  iso: string,
  weekStart: WeekStart,
): { date: string; inMonth: boolean }[][] {
  const { y, m } = parts(iso);
  const { from, to } = rangeForView(iso, "mes", weekStart);
  const rows: { date: string; inMonth: boolean }[][] = [];
  const total = dayIndex(to) - dayIndex(from) + 1;
  for (let i = 0; i < total; i += 7) {
    rows.push(
      Array.from({ length: 7 }, (_, j) => {
        const date = addDaysISO(from, i + j);
        const p = parts(date);
        return { date, inMonth: p.y === y && p.m === m };
      }),
    );
  }
  return rows;
}

export function formatLongDate(iso: string): string {
  const { m, d } = parts(iso);
  return `${WEEKDAY_NAMES[weekdayOf(iso)]}, ${d} de ${MONTH_NAMES[m - 1].toLowerCase()}`;
}

export function formatShortDate(iso: string): string {
  const { m, d } = parts(iso);
  return `${d} ${MONTH_NAMES[m - 1].slice(0, 3).toLowerCase()}`;
}

/** Título do cabeçalho conforme a visão. */
export function titleForView(iso: string, view: AgendaView, weekStart: WeekStart): string {
  const { y, m } = parts(iso);
  if (view === "semana") {
    const days = weekDates(iso, weekStart, true);
    const a = parts(days[0]);
    const b = parts(days[6]);
    if (a.m === b.m) return `${a.d}–${b.d} de ${MONTH_NAMES[a.m - 1].toLowerCase()}`;
    return `${a.d} ${MONTH_NAMES[a.m - 1].slice(0, 3).toLowerCase()} – ${b.d} ${MONTH_NAMES[b.m - 1].slice(0, 3).toLowerCase()}`;
  }
  if (view === "proximos") return "Próximos compromissos";
  return `${MONTH_NAMES[m - 1]} ${y}`;
}

export function relativeDayLabel(iso: string, today: string): string {
  const diff = dayIndex(iso) - dayIndex(today);
  if (diff === 0) return "Hoje";
  if (diff === 1) return "Amanhã";
  if (diff === -1) return "Ontem";
  return formatLongDate(iso);
}

export type UpcomingSection<T> = { id: string; title: string; items: T[] };

/** Seções da visão "Próximos": hoje, amanhã, esta semana, próximas semanas. */
export function upcomingSections<T extends { date: string }>(
  items: T[],
  today: string,
  weekStart: WeekStart,
): UpcomingSection<T>[] {
  const tomorrow = addDaysISO(today, 1);
  const weekEnd = addDaysISO(startOfWeekISO(today, weekStart), 6);
  const buckets: UpcomingSection<T>[] = [
    { id: "hoje", title: "Hoje", items: [] },
    { id: "amanha", title: "Amanhã", items: [] },
    { id: "semana", title: "Esta semana", items: [] },
    { id: "proximas", title: "Próximas semanas", items: [] },
  ];
  for (const item of items) {
    if (item.date < today) continue;
    if (item.date === today) buckets[0].items.push(item);
    else if (item.date === tomorrow) buckets[1].items.push(item);
    else if (item.date <= weekEnd) buckets[2].items.push(item);
    else buckets[3].items.push(item);
  }
  return buckets.filter((b) => b.items.length > 0);
}
