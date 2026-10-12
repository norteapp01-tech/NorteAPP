import { minutesToTime, timeToMinutes } from "./agenda-time";

// ---------------------------------------------------------------------------
// Intervalos da Agenda.
//
// Todo compromisso com horário vira um intervalo em MINUTOS ABSOLUTOS (dias
// desde 1970-01-01 × 1440 + minutos do dia). É isso que permite tratar um
// compromisso que vira a meia-noite como UM intervalo contínuo — sem "fim menor
// que o início" espalhado pela interface — e somar tempo ocupado sem contar o
// mesmo minuto duas vezes.
//
// Funções puras: nada aqui lê estado nem relógio.
// ---------------------------------------------------------------------------

export const DAY_MIN = 24 * 60;
export const DEFAULT_EVENT_MINUTES = 60;

export type Interval = { start: number; end: number };

/** Dias desde 1970-01-01 para uma data "YYYY-MM-DD" — aritmética em UTC, sem
 * depender do fuso nem do horário de verão do aparelho. */
export function dayIndex(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86_400_000);
}

export function isoFromDayIndex(index: number): string {
  const d = new Date(index * 86_400_000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

export function addDaysISO(iso: string, delta: number): string {
  return isoFromDayIndex(dayIndex(iso) + delta);
}

/** O que a Agenda precisa saber de um compromisso para medir tempo e conflito.
 * `OccurrenceLike` evita acoplar este arquivo ao formato do banco. */
export type TimedLike = {
  date: string;
  startTime?: string;
  endTime?: string;
  allDay?: boolean;
  status?: string;
};

/** Cancelado não ocupa tempo; "reagendada" foi substituída pela nova execução. */
export function occupiesTime(item: Pick<TimedLike, "status">): boolean {
  return item.status !== "cancelada" && item.status !== "reagendada";
}

/** Minutos do fim, entendendo "00:00" como "meia-noite do FIM do dia". */
function endMinutesFor(start: number, endTime: string | undefined, fallback: number): number {
  if (!endTime) return start + fallback;
  const raw = timeToMinutes(endTime);
  // 22:30–00:00 termina à meia-noite; 00:00–00:00 é o dia inteiro (24h).
  if (raw === 0) return DAY_MIN;
  return raw;
}

/** Duração em minutos, entendendo que fim <= início vira o dia (23:00–01:00 =
 * 120 min). Nunca devolve valor negativo nem zero. */
export function durationMinutes(
  startTime: string,
  endTime: string | undefined,
  fallback = DEFAULT_EVENT_MINUTES,
): number {
  const start = timeToMinutes(startTime);
  const end = endMinutesFor(start, endTime, fallback);
  const span = end > start ? end - start : end + DAY_MIN - start;
  return span > 0 ? span : fallback;
}

/** Intervalo de horário aceitável: os dois preenchidos e diferentes. Fim menor
 * que o início significa que o compromisso vira o dia (23:00–01:00). */
export function isValidTimeRange(startTime: string | undefined, endTime: string | undefined) {
  return !!startTime && !!endTime && startTime !== endTime;
}

/** O fim cruza a meia-noite em relação ao início? */
export function crossesMidnight(startTime: string, endTime: string | undefined): boolean {
  if (!endTime) return timeToMinutes(startTime) + DEFAULT_EVENT_MINUTES > DAY_MIN;
  const start = timeToMinutes(startTime);
  const raw = timeToMinutes(endTime);
  return raw !== 0 && raw <= start;
}

/** Intervalo absoluto do compromisso, ou null quando não tem horário real. */
export function eventInterval(item: TimedLike, fallback = DEFAULT_EVENT_MINUTES): Interval | null {
  if (item.allDay || !item.startTime) return null;
  const start = timeToMinutes(item.startTime);
  const base = dayIndex(item.date) * DAY_MIN;
  return {
    start: base + start,
    end: base + start + durationMinutes(item.startTime, item.endTime, fallback),
  };
}

/** Une intervalos que se tocam ou se sobrepõem. */
export function mergeIntervals(list: Interval[]): Interval[] {
  const sorted = list
    .filter((i) => i.end > i.start)
    .map((i) => ({ ...i }))
    .sort((a, b) => a.start - b.start || a.end - b.end);
  const out: Interval[] = [];
  for (const item of sorted) {
    const last = out[out.length - 1];
    if (last && item.start <= last.end) last.end = Math.max(last.end, item.end);
    else out.push(item);
  }
  return out;
}

export function intervalsOverlap(a: Interval, b: Interval): boolean {
  return a.start < b.end && b.start < a.end;
}

/** Parte do intervalo que cai dentro do dia, em minutos 0..1440. */
export function sliceForDate(
  interval: Interval,
  date: string,
): { start: number; end: number } | null {
  const dayStart = dayIndex(date) * DAY_MIN;
  const start = Math.max(interval.start, dayStart);
  const end = Math.min(interval.end, dayStart + DAY_MIN);
  return end > start ? { start: start - dayStart, end: end - dayStart } : null;
}

export type DayLoad = {
  /** Minutos reais ocupados no dia (sem contar o mesmo minuto duas vezes). */
  busy: number;
  free: number;
  /** Compromissos com hora que tocam o dia, contando a continuação de ontem. */
  timedCount: number;
  /** Sem horário (ou dia inteiro): contam à parte, não ocupam relógio. */
  untimedCount: number;
  /** Trechos ocupados já unidos, em minutos do dia. */
  blocks: { start: number; end: number }[];
};

/** Tempo ocupado e livre de UM dia.
 *
 * Recebe os compromissos de TODOS os dias vizinhos: o de ontem que termina às
 * 01:00 entra com sua parte de hoje, e o de hoje que termina depois da
 * meia-noite entra só até 24:00. */
export function dayLoad(items: TimedLike[], date: string): DayLoad {
  const slices: Interval[] = [];
  let timedCount = 0;
  let untimedCount = 0;
  for (const item of items) {
    if (!occupiesTime(item)) continue;
    if (item.date === date && (item.allDay || !item.startTime)) {
      untimedCount += 1;
      continue;
    }
    const interval = eventInterval(item);
    if (!interval) continue;
    const slice = sliceForDate(interval, date);
    if (!slice) continue;
    timedCount += 1;
    slices.push(slice);
  }
  const blocks = mergeIntervals(slices);
  const busy = blocks.reduce((sum, b) => sum + (b.end - b.start), 0);
  return { busy, free: Math.max(0, DAY_MIN - busy), timedCount, untimedCount, blocks };
}

// ---------------------------------------------------------------------------
// Conflitos
// ---------------------------------------------------------------------------

export type Conflictable = TimedLike & { id: string; title: string; rigid?: boolean };

/** Compromissos que se sobrepõem ao candidato. Cancelados e o próprio
 * candidato (`ignoreId`) ficam de fora. */
export function findConflicts<T extends Conflictable>(
  candidate: TimedLike,
  existing: T[],
  ignoreId?: string,
): T[] {
  const mine = eventInterval(candidate);
  if (!mine) return [];
  return existing.filter((other) => {
    if (other.id === ignoreId || !occupiesTime(other)) return false;
    const theirs = eventInterval(other);
    return !!theirs && intervalsOverlap(mine, theirs);
  });
}

/** Ids que estão em conflito com algum outro compromisso. */
export function conflictingIds(items: Conflictable[]): Set<string> {
  const timed = items
    .filter((i) => occupiesTime(i))
    .map((i) => ({ id: i.id, interval: eventInterval(i) }))
    .filter((i): i is { id: string; interval: Interval } => i.interval !== null)
    .sort((a, b) => a.interval.start - b.interval.start);
  const out = new Set<string>();
  let reach: { id: string; end: number } | null = null;
  // Varredura: guarda o compromisso que chega mais longe; quem começa antes
  // dele terminar conflita com ele.
  for (const current of timed) {
    if (reach && current.interval.start < reach.end) {
      out.add(current.id);
      out.add(reach.id);
    }
    if (!reach || current.interval.end > reach.end)
      reach = { id: current.id, end: current.interval.end };
  }
  return out;
}

// ---------------------------------------------------------------------------
// Layout de sobreposição (colunas lado a lado)
// ---------------------------------------------------------------------------

export type LayoutInput = { id: string; start: number; end: number };
export type LayoutResult = { id: string; column: number; columns: number };

/** Altura mínima de um bloco, em minutos, para que dois compromissos curtos e
 * seguidos não se pisem só porque o bloco tem altura mínima de toque. */
export const MIN_VISUAL_MINUTES = 40;

/** Reparte compromissos sobrepostos em colunas: cada grupo de blocos que se
 * encadeiam por sobreposição divide a largura igualmente. */
export function layoutColumns(
  blocks: LayoutInput[],
  minVisualMinutes = MIN_VISUAL_MINUTES,
): LayoutResult[] {
  const sorted = blocks
    .map((b) => ({ ...b, visualEnd: Math.max(b.end, b.start + minVisualMinutes) }))
    .sort((a, b) => a.start - b.start || b.visualEnd - a.visualEnd);
  const result: LayoutResult[] = [];
  let cluster: typeof sorted = [];
  let clusterEnd = -Infinity;

  const flush = () => {
    if (cluster.length === 0) return;
    const columnEnds: number[] = [];
    const placed: { id: string; column: number }[] = [];
    for (const block of cluster) {
      let column = columnEnds.findIndex((end) => end <= block.start);
      if (column === -1) {
        column = columnEnds.length;
        columnEnds.push(block.visualEnd);
      } else {
        columnEnds[column] = block.visualEnd;
      }
      placed.push({ id: block.id, column });
    }
    for (const p of placed) result.push({ id: p.id, column: p.column, columns: columnEnds.length });
    cluster = [];
    clusterEnd = -Infinity;
  };

  for (const block of sorted) {
    if (block.start >= clusterEnd) flush();
    cluster.push(block);
    clusterEnd = Math.max(clusterEnd, block.visualEnd);
  }
  flush();
  return result;
}

// ---------------------------------------------------------------------------
// Horários livres
// ---------------------------------------------------------------------------

export type FreeSlot = { date: string; start: string; end: string };

const STEP = 15;
const ceilTo = (value: number, step: number) => Math.ceil(value / step) * step;

export type SlotQuery = {
  date: string;
  /** Duração necessária, em minutos. */
  duration: number;
  items: TimedLike[];
  /** Janela habitual do dia, em "HH:MM". Sugestões ficam dentro dela. */
  windowStart?: string;
  windowEnd?: string;
  /** Não sugerir antes deste minuto do dia em `date` (ex.: agora). */
  notBeforeMinute?: number;
  /** Último dia aceitável (prazo do plano). */
  lastDate?: string;
  daysToSearch?: number;
  limit?: number;
};

/** Horários realmente livres, em passos de 15 minutos, dentro da janela
 * habitual. Determinístico: o agente só apresenta o que esta função devolve. */
export function suggestFreeSlots(query: SlotQuery): FreeSlot[] {
  const windowStart = timeToMinutes(query.windowStart ?? "07:00");
  const windowEnd = Math.min(DAY_MIN, endMinutesFor(0, query.windowEnd ?? "22:00", DAY_MIN));
  const limit = query.limit ?? 3;
  const days = query.daysToSearch ?? 7;
  const out: FreeSlot[] = [];
  if (query.duration <= 0 || windowEnd - windowStart < query.duration) return out;

  for (let offset = 0; offset < days && out.length < limit; offset++) {
    const date = addDaysISO(query.date, offset);
    if (query.lastDate && date > query.lastDate) break;
    const { blocks } = dayLoad(query.items, date);
    let cursor = windowStart;
    if (offset === 0 && query.notBeforeMinute !== undefined)
      cursor = Math.max(cursor, ceilTo(query.notBeforeMinute, STEP));
    const gaps: { start: number; end: number }[] = [];
    for (const block of blocks) {
      if (block.end <= cursor) continue;
      if (block.start > cursor) gaps.push({ start: cursor, end: Math.min(block.start, windowEnd) });
      cursor = Math.max(cursor, ceilTo(block.end, STEP));
    }
    if (cursor < windowEnd) gaps.push({ start: cursor, end: windowEnd });
    for (const gap of gaps) {
      const start = ceilTo(gap.start, STEP);
      if (gap.end - start >= query.duration && out.length < limit) {
        out.push({
          date,
          start: minutesToTime(start),
          end: minutesToTime((start + query.duration) % DAY_MIN),
        });
      }
    }
  }
  return out;
}

export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}min`;
  if (m === 0) return `${h}h`;
  return `${h}h${String(m).padStart(2, "0")}`;
}
