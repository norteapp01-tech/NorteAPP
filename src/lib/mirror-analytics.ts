import {
  DAY_MIN,
  addDaysISO,
  dayIndex,
  dayLoad,
  durationMinutes,
  eventInterval,
  intervalsOverlap,
  type Interval,
  type TimedLike,
} from "./agenda-intervals";
import type { AgendaOccurrence } from "./agenda-occurrences";
import type { Feeling } from "./goals-store";
import { timeToMinutes } from "./agenda-time";

// ---------------------------------------------------------------------------
// Espelho da Agenda — cálculos puros.
//
// Nada aqui lê estado, banco nem relógio: tudo entra por parâmetro, o que
// torna cada regra testável. As regras de dados estão no topo de cada função
// e resumidas em `docs/espelho.md`.
//
// PRINCÍPIOS
//  * Só o que foi PLANEJADO é medido. O app não sabe quanto tempo a pessoa de
//    fato gastou; "tempo realizado" aqui é a duração planejada dos compromissos
//    que ela marcou como concluídos — e a interface diz isso.
//  * Futuro fica fora. Um compromisso só entra depois de acabar.
//  * Cancelar é uma decisão, não uma falha: fica fora da taxa de realização.
//  * Evento que veio do Google não tem "concluir" confiável: entra no TEMPO e na
//    CARGA da agenda, mas não na taxa de realização.
//  * Tempo sobreposto nunca é somado duas vezes.
// ---------------------------------------------------------------------------

export type Period = { from: string; to: string };
export type PeriodKey = "7d" | "30d" | "3m" | "custom";

export const PERIOD_LABELS: Record<PeriodKey, string> = {
  "7d": "7 dias",
  "30d": "30 dias",
  "3m": "3 meses",
  custom: "Personalizado",
};

/** Menos que isso e o Espelho não conclui nada — só mostra o que existe. */
export const MIN_RESOLVED = 5;
/** Mínimo de compromissos em uma fatia (dia da semana, turno…) para compará-la. */
export const MIN_BUCKET = 3;
/** Menor diferença de taxa (pontos percentuais) que vale ser contada como padrão. */
export const MIN_GAP = 20;
export const MAX_CUSTOM_DAYS = 366;

export function periodDays(p: Period): number {
  return dayIndex(p.to) - dayIndex(p.from) + 1;
}

/** Período terminando em `today` (inclusive). Personalizado é validado e limitado. */
export function resolvePeriod(key: PeriodKey, today: string, custom?: Partial<Period>): Period {
  if (key === "custom") {
    let from = custom?.from ?? addDaysISO(today, -29);
    let to = custom?.to ?? today;
    if (to > today) to = today; // futuro não entra
    if (from > to) from = to;
    if (periodDays({ from, to }) > MAX_CUSTOM_DAYS) from = addDaysISO(to, -(MAX_CUSTOM_DAYS - 1));
    return { from, to };
  }
  const days = key === "7d" ? 7 : key === "30d" ? 30 : 90;
  return { from: addDaysISO(today, -(days - 1)), to: today };
}

/** Janela imediatamente anterior, do mesmo tamanho. */
export function previousPeriod(p: Period): Period {
  const days = periodDays(p);
  return { from: addDaysISO(p.from, -days), to: addDaysISO(p.from, -1) };
}

export function inPeriod(date: string, p: Period): boolean {
  return date >= p.from && date <= p.to;
}

// ---------------------------------------------------------------------------
// Entradas
// ---------------------------------------------------------------------------

export type MirrorChange = {
  at: string;
  kind: string;
  executionId?: string;
  seriesId?: string;
  subjectTitle?: string;
  fromDate?: string;
  toDate?: string;
};

export type ExecutionLookup = {
  id: string;
  title: string;
  seriesId?: string;
  labelId?: string;
  category: string;
};

export type LabelLookup = { id: string; name: string; color: string; archived?: boolean };

export type AnalysisInput = {
  /** Ocorrências já resolvidas (planejada vencida = perdida), incluindo o dia
   * ANTERIOR ao início do período, para pegar o que atravessou a meia-noite. */
  occurrences: AgendaOccurrence[];
  changes: MirrorChange[];
  executions: ExecutionLookup[];
  labels: LabelLookup[];
  /** Data e minutos do dia de agora. */
  now: { date: string; minute: number };
  /** Janela habitual do dia (minutos desde 00:00), usada para medir a folga. */
  window: { start: number; end: number };
  /** Converte o instante de uma mudança na data local. */
  localDate?: (iso: string) => string;
};

export type GroupBy = "categoria" | "rotulo";

// ---------------------------------------------------------------------------
// Classificação de uma ocorrência
// ---------------------------------------------------------------------------

/** Categorias dos módulos (Academia, Leitura, Fé…): suas ocorrências são rotinas. */
export const MODULE_CATEGORIES = new Set([
  "academia",
  "esportes",
  "leitura",
  "alimentacao",
  "fe",
  "financas",
]);
export const isRoutineLike = (o: Pick<AgendaOccurrence, "routineId" | "category">) =>
  Boolean(o.routineId) || MODULE_CATEGORIES.has(o.category);

export type Outcome = "done" | "missed" | "cancelled" | "pending";

/** O compromisso já acabou? Hoje, um item que começou mas não terminou está em
 * andamento — não é "não realizado". */
export function hasEnded(occ: AgendaOccurrence, now: { date: string; minute: number }): boolean {
  if (occ.date < now.date) return true;
  if (occ.date > now.date) return false;
  if (occ.allDay || !occ.startTime) return false; // dia inteiro de hoje: o dia ainda corre
  const interval = eventInterval(occ);
  if (!interval) return false;
  return interval.end <= dayIndex(now.date) * DAY_MIN + now.minute;
}

export function outcomeOf(occ: AgendaOccurrence, now: { date: string; minute: number }): Outcome {
  if (occ.status === "concluida") return "done";
  if (occ.status === "cancelada") return "cancelled";
  if (occ.status === "reagendada") return "pending"; // substituída; nunca deveria chegar aqui
  // planejada ou perdida: só vale como "não realizado" depois que acabou.
  return hasEnded(occ, now) ? "missed" : "pending";
}

/** Entra na taxa de realização? Só o que a pessoa controla no Norte. */
export function isTrackable(occ: AgendaOccurrence): boolean {
  return occ.source !== "external" && !occ.readOnly;
}

export type TimeOfDay = "madrugada" | "manha" | "tarde" | "noite";
export const TIME_OF_DAY_LABELS: Record<TimeOfDay, string> = {
  madrugada: "de madrugada",
  manha: "pela manhã",
  tarde: "à tarde",
  noite: "à noite",
};

export function timeOfDay(startTime: string): TimeOfDay {
  const h = Math.floor(timeToMinutes(startTime) / 60);
  if (h < 5) return "madrugada";
  if (h < 12) return "manha";
  if (h < 18) return "tarde";
  return "noite";
}

export function weekdayIndex(iso: string): number {
  // 1970-01-01 foi quinta (4).
  return (((dayIndex(iso) + 4) % 7) + 7) % 7;
}
export const WEEKDAY_PLURAL = [
  "domingos",
  "segundas",
  "terças",
  "quartas",
  "quintas",
  "sextas",
  "sábados",
];

const normalizeTitle = (t: string) => t.trim().toLocaleLowerCase("pt-BR");

// ---------------------------------------------------------------------------
// Tempo planejado sem contar minuto duas vezes
// ---------------------------------------------------------------------------

type Timed = { occ: AgendaOccurrence; interval: Interval; done: boolean };

export type Allocation = {
  /** Minutos atribuídos a cada item, sem sobreposição. */
  perItem: Map<string, { minutes: number; done: boolean }>;
  /** União do tempo ocupado. */
  unionMinutes: number;
  /** Soma das durações brutas (com sobreposição). */
  rawMinutes: number;
  /** Minutos que estavam em duas coisas ao mesmo tempo. */
  overlapMinutes: number;
  /** Tempo da união coberto por compromissos concluídos. */
  doneUnionMinutes: number;
};

/** Atribui cada minuto a UM compromisso (o que começou antes; rígido desempata).
 * Os intervalos são cortados na janela do período: um evento 23:00–01:00 no
 * último dia só conta o que cai dentro dele. */
export function allocateTime(timed: Timed[], window: Interval): Allocation {
  const clipped = timed
    .map((t) => ({
      ...t,
      interval: {
        start: Math.max(t.interval.start, window.start),
        end: Math.min(t.interval.end, window.end),
      },
    }))
    .filter((t) => t.interval.end > t.interval.start)
    .sort(
      (a, b) =>
        a.interval.start - b.interval.start ||
        Number(b.occ.rigid) - Number(a.occ.rigid) ||
        b.interval.end - a.interval.end,
    );
  const perItem = new Map<string, { minutes: number; done: boolean }>();
  let cursor = -Infinity;
  let union = 0;
  let doneUnion = 0;
  let raw = 0;
  for (const t of clipped) {
    raw += t.interval.end - t.interval.start;
    const start = Math.max(t.interval.start, cursor);
    const own = Math.max(0, t.interval.end - start);
    if (own > 0) {
      union += own;
      if (t.done) doneUnion += own;
      const cur = perItem.get(t.occ.key) ?? { minutes: 0, done: t.done };
      cur.minutes += own;
      perItem.set(t.occ.key, cur);
      cursor = Math.max(cursor, t.interval.end);
    }
  }
  return {
    perItem,
    unionMinutes: union,
    rawMinutes: raw,
    overlapMinutes: raw - union,
    doneUnionMinutes: doneUnion,
  };
}

// ---------------------------------------------------------------------------
// Resultado
// ---------------------------------------------------------------------------

export type Sufficiency = "none" | "low" | "ok";

export type GroupStat = {
  key: string;
  name: string;
  color?: string;
  /** Minutos planejados (sem sobreposição) atribuídos ao grupo. */
  minutes: number;
  /** Parte dos minutos planejados que já foi concluída. */
  doneMinutes: number;
  share: number; // 0..1 do tempo total planejado
  done: number;
  missed: number;
  cancelled: number;
  /** done / (done + missed), ou null se nada entrou na taxa. */
  rate: number | null;
  feeling: FeelingCounts;
};

export type FeelingCounts = { leve: number; neutro: number; pesado: number };

export type TitleStat = {
  key: string;
  title: string;
  done: number;
  missed: number;
  cancelled: number;
  moves: number;
};

export type Bucket = {
  key: string;
  label: string;
  done: number;
  missed: number;
  rate: number | null;
};

export type WeekPoint = {
  start: string;
  end: string;
  done: number;
  missed: number;
  rate: number | null;
};

export type DayStat = {
  date: string;
  busy: number;
  free: number;
  conflicts: number;
  overloaded: boolean;
};

export type MovedCommitment = {
  key: string;
  title: string;
  labelId?: string;
  moves: number;
  seriesId?: string;
};

export type AgendaAnalysis = {
  period: Period;
  days: number;
  sufficiency: Sufficiency;
  /** Compromissos já encerrados no período (não conta futuro nem andamento). */
  total: number;
  done: number;
  missed: number;
  cancelled: number;
  /** Fora da taxa porque o Google é quem manda no horário. */
  externalCount: number;
  /** Compromissos de dia inteiro: contam em quantidade, não em horas. */
  untimedCount: number;
  rate: number | null;
  /** Mudanças de horário (kind "moved") ocorridas no período. */
  reschedules: number;
  /** Compromissos distintos que mudaram de horário. */
  rescheduledCommitments: number;
  time: Allocation & { doneShare: number | null };
  byCategory: GroupStat[];
  byLabel: GroupStat[];
  /** Compromissos (com título) × rotinas dos módulos. */
  split: {
    commitments: { done: number; missed: number };
    routines: { done: number; missed: number };
  };
  weekday: Bucket[];
  timeOfDay: Bucket[];
  duration: { short: Bucket; long: Bucket };
  daysStat: DayStat[];
  overloadedDays: number;
  conflictPairs: number;
  weeks: WeekPoint[];
  topDone: TitleStat[];
  topTroubled: TitleStat[];
  movedCommitments: MovedCommitment[];
  /** Turno em que cada categoria (com 6+ compromissos decididos) rende mais. */
  categoryTime: { category: string; best: Bucket; worst: Bucket }[];
  feeling: { answered: number; counts: FeelingCounts };
  /** Média de ocupação do dia habitual (0..1), só dias com horário marcado. */
  averageLoad: number | null;
  freeShare: number | null;
};

const emptyFeeling = (): FeelingCounts => ({ leve: 0, neutro: 0, pesado: 0 });
const ratio = (done: number, missed: number) =>
  done + missed > 0 ? Math.round((done / (done + missed)) * 100) / 100 : null;

/** Dias do mesmo mês/semana agrupados: até 14 dias é por dia; depois por semana. */
export function weekBuckets(p: Period): { start: string; end: string }[] {
  const days = periodDays(p);
  const step = days <= 14 ? 1 : 7;
  const out: { start: string; end: string }[] = [];
  for (let d = p.from; d <= p.to; d = addDaysISO(d, step)) {
    const end = addDaysISO(d, step - 1);
    out.push({ start: d, end: end > p.to ? p.to : end });
  }
  return out;
}

export function analyzeAgenda(input: AnalysisInput, period: Period): AgendaAnalysis {
  const { now, window: habit } = input;
  const localDate = input.localDate ?? ((iso: string) => iso.slice(0, 10));
  const lookup = new Map(input.executions.map((e) => [e.id, e]));
  const labelById = new Map(input.labels.map((l) => [l.id, l]));
  const days = periodDays(period);
  const windowInterval: Interval = {
    start: dayIndex(period.from) * DAY_MIN,
    end: (dayIndex(period.to) + 1) * DAY_MIN,
  };

  // Ocorrências do período: pela data de INÍCIO. As do dia anterior só servem de
  // contexto de meia-noite (o pedaço que invade o primeiro dia entra no tempo).
  const own = input.occurrences.filter((o) => inPeriod(o.date, period));
  const prevDay = addDaysISO(period.from, -1);
  const carry = input.occurrences.filter(
    (o) => o.date === prevDay && !o.allDay && o.startTime && o.status !== "cancelada",
  );

  const ended = own.filter((o) => outcomeOf(o, now) !== "pending");
  const outcomeByKey = new Map(ended.map((o) => [o.key, outcomeOf(o, now)]));

  let done = 0;
  let missed = 0;
  let cancelled = 0;
  let externalCount = 0;
  let untimedCount = 0;
  const split = {
    commitments: { done: 0, missed: 0 },
    routines: { done: 0, missed: 0 },
  };
  for (const o of ended) {
    const out = outcomeByKey.get(o.key)!;
    if (o.allDay || !o.startTime) untimedCount += 1;
    if (out === "cancelled") {
      cancelled += 1;
      continue;
    }
    if (!isTrackable(o)) {
      externalCount += 1;
      continue;
    }
    const bucket = isRoutineLike(o) ? split.routines : split.commitments;
    if (out === "done") {
      done += 1;
      bucket.done += 1;
    } else {
      missed += 1;
      bucket.missed += 1;
    }
  }

  // ---- tempo planejado ----------------------------------------------------
  const timedSource = [...ended, ...carry.filter((o) => outcomeOf(o, now) !== "pending")];
  const timed: Timed[] = [];
  for (const o of timedSource) {
    if (outcomeOf(o, now) === "cancelled") continue;
    const interval = eventInterval(o);
    if (!interval) continue;
    timed.push({ occ: o, interval, done: o.status === "concluida" });
  }
  const time = allocateTime(timed, windowInterval);

  // ---- grupos -------------------------------------------------------------
  const groupOf = (o: AgendaOccurrence, by: GroupBy) => {
    if (by === "categoria") return { key: o.category, name: o.category, color: undefined };
    const label = o.labelId ? labelById.get(o.labelId) : undefined;
    return label
      ? { key: label.id, name: label.name, color: label.color }
      : { key: "__none", name: "Sem rótulo", color: o.externalColor };
  };
  const buildGroups = (by: GroupBy): GroupStat[] => {
    const map = new Map<string, GroupStat>();
    const ensure = (o: AgendaOccurrence) => {
      const g = groupOf(o, by);
      let stat = map.get(g.key);
      if (!stat) {
        stat = {
          key: g.key,
          name: g.name,
          color: g.color,
          minutes: 0,
          doneMinutes: 0,
          share: 0,
          done: 0,
          missed: 0,
          cancelled: 0,
          rate: null,
          feeling: emptyFeeling(),
        };
        map.set(g.key, stat);
      }
      return stat;
    };
    for (const o of ended) {
      const stat = ensure(o);
      const out = outcomeByKey.get(o.key)!;
      if (out === "cancelled") stat.cancelled += 1;
      else if (isTrackable(o)) {
        if (out === "done") stat.done += 1;
        else stat.missed += 1;
      }
      if (o.feeling) stat.feeling[o.feeling] += 1;
    }
    for (const t of timed) {
      const alloc = time.perItem.get(t.occ.key);
      if (!alloc) continue;
      const stat = ensure(t.occ);
      stat.minutes += alloc.minutes;
      if (alloc.done) stat.doneMinutes += alloc.minutes;
    }
    const total = time.unionMinutes;
    return [...map.values()]
      .map((g) => ({
        ...g,
        share: total > 0 ? g.minutes / total : 0,
        rate: ratio(g.done, g.missed),
      }))
      .sort((a, b) => b.minutes - a.minutes || b.done + b.missed - (a.done + a.missed));
  };

  // ---- padrões de comportamento ---------------------------------------------
  const decided = ended.filter((o) => isTrackable(o) && outcomeByKey.get(o.key) !== "cancelled");
  const bucketize = <K extends string>(
    keyOf: (o: AgendaOccurrence) => K | null,
    labelOf: (k: K) => string,
    order: K[],
  ): Bucket[] =>
    order.map((k) => {
      const items = decided.filter((o) => keyOf(o) === k);
      const d = items.filter((o) => o.status === "concluida").length;
      return {
        key: k,
        label: labelOf(k),
        done: d,
        missed: items.length - d,
        rate: ratio(d, items.length - d),
      };
    });

  const weekday = bucketize(
    (o) => String(weekdayIndex(o.date)),
    (k) => WEEKDAY_PLURAL[Number(k)],
    ["0", "1", "2", "3", "4", "5", "6"],
  );
  const tod = bucketize<TimeOfDay>(
    (o) => (o.startTime && !o.allDay ? timeOfDay(o.startTime) : null),
    (k) => TIME_OF_DAY_LABELS[k],
    ["madrugada", "manha", "tarde", "noite"],
  );
  const shortLimit = 45;
  const durOf = (o: AgendaOccurrence) =>
    o.startTime && !o.allDay ? durationMinutes(o.startTime, o.endTime) : null;
  const durBucket = (key: string, label: string, test: (m: number) => boolean): Bucket => {
    const items = decided.filter((o) => {
      const m = durOf(o);
      return m !== null && test(m);
    });
    const d = items.filter((o) => o.status === "concluida").length;
    return { key, label, done: d, missed: items.length - d, rate: ratio(d, items.length - d) };
  };

  // ---- carga por dia ----------------------------------------------------------
  const habitSpan = Math.max(60, habit.end - habit.start);
  const loadItems = [...carry, ...ended].filter((o) => outcomeOf(o, now) !== "cancelled");
  const daysStat: DayStat[] = [];
  let conflictPairs = 0;
  for (let d = period.from; d <= period.to; d = addDaysISO(d, 1)) {
    const near = loadItems.filter((o) => o.date >= addDaysISO(d, -1) && o.date <= d);
    const load = dayLoad(near as TimedLike[], d);
    const dayIntervals = near
      .map((o) => eventInterval(o))
      .filter((i): i is Interval => !!i)
      .filter((i) => i.end > dayIndex(d) * DAY_MIN && i.start < (dayIndex(d) + 1) * DAY_MIN);
    let pairs = 0;
    for (let i = 0; i < dayIntervals.length; i++)
      for (let j = i + 1; j < dayIntervals.length; j++)
        if (intervalsOverlap(dayIntervals[i], dayIntervals[j])) pairs += 1;
    conflictPairs += pairs;
    daysStat.push({
      date: d,
      busy: load.busy,
      free: load.free,
      conflicts: pairs,
      overloaded: load.busy >= habitSpan * 0.7 || pairs >= 2,
    });
  }
  const withTime = daysStat.filter((d) => d.busy > 0);
  const averageLoad = withTime.length
    ? withTime.reduce((s, d) => s + Math.min(1, d.busy / habitSpan), 0) / withTime.length
    : null;

  // ---- semanas / dias ------------------------------------------------------------
  const weeks: WeekPoint[] = weekBuckets(period).map((w) => {
    const items = decided.filter((o) => o.date >= w.start && o.date <= w.end);
    const d = items.filter((o) => o.status === "concluida").length;
    return { ...w, done: d, missed: items.length - d, rate: ratio(d, items.length - d) };
  });

  // ---- títulos e reagendamentos ------------------------------------------------------
  const titles = new Map<string, TitleStat>();
  const titleStat = (o: AgendaOccurrence) => {
    const key = o.seriesId ? `s:${o.seriesId}` : `t:${normalizeTitle(o.title)}`;
    let s = titles.get(key);
    if (!s) {
      s = { key, title: o.title, done: 0, missed: 0, cancelled: 0, moves: 0 };
      titles.set(key, s);
    }
    return s;
  };
  for (const o of ended) {
    if (!isTrackable(o)) continue;
    const s = titleStat(o);
    const out = outcomeByKey.get(o.key)!;
    if (out === "done") s.done += 1;
    else if (out === "missed") s.missed += 1;
    else if (out === "cancelled") s.cancelled += 1;
  }

  const movesPerExecution = new Map<string, number>();
  const movedKeys = new Map<string, MovedCommitment>();
  let reschedules = 0;
  for (const c of input.changes) {
    if (c.kind !== "moved") continue;
    if (!inPeriod(localDate(c.at), period)) continue;
    reschedules += 1;
    const ex = c.executionId ? lookup.get(c.executionId) : undefined;
    const seriesId = ex?.seriesId ?? c.seriesId;
    const title = ex?.title ?? c.subjectTitle ?? "Compromisso";
    const key = seriesId
      ? `s:${seriesId}`
      : c.executionId
        ? `e:${c.executionId}`
        : `t:${normalizeTitle(title)}`;
    if (c.executionId)
      movesPerExecution.set(c.executionId, (movesPerExecution.get(c.executionId) ?? 0) + 1);
    const cur = movedKeys.get(key) ?? { key, title, labelId: ex?.labelId, moves: 0, seriesId };
    cur.moves += 1;
    movedKeys.set(key, cur);
    const t = titles.get(seriesId ? `s:${seriesId}` : `t:${normalizeTitle(title)}`);
    if (t) t.moves += 1;
  }
  // "mais de uma vez": o mesmo compromisso real mudou de horário 2+ vezes
  const repeatedExecutions = [...movesPerExecution.entries()].filter(([, n]) => n >= 2);
  const movedCommitments: MovedCommitment[] = [...movedKeys.values()].sort(
    (a, b) => b.moves - a.moves,
  );
  // guarda quem mudou 2+ vezes numa mesma execução, mesmo sem série
  for (const [id, n] of repeatedExecutions) {
    const ex = lookup.get(id);
    const hit = movedCommitments.find(
      (m) => m.key === `e:${id}` || (ex?.seriesId && m.seriesId === ex.seriesId),
    );
    if (hit && hit.moves < n) hit.moves = n;
  }

  const categoryTime: AgendaAnalysis["categoryTime"] = [];
  for (const category of new Set(decided.map((o) => o.category))) {
    const items = decided.filter((o) => o.category === category && o.startTime && !o.allDay);
    if (items.length < 6) continue;
    const buckets = (["madrugada", "manha", "tarde", "noite"] as TimeOfDay[])
      .map((k): Bucket => {
        const sub = items.filter((o) => timeOfDay(o.startTime!) === k);
        const d = sub.filter((o) => o.status === "concluida").length;
        return {
          key: k,
          label: TIME_OF_DAY_LABELS[k],
          done: d,
          missed: sub.length - d,
          rate: ratio(d, sub.length - d),
        };
      })
      .filter((b) => b.done + b.missed >= MIN_BUCKET && b.rate !== null);
    if (buckets.length < 2) continue;
    const sorted = [...buckets].sort((a, b) => b.rate! - a.rate!);
    categoryTime.push({ category, best: sorted[0], worst: sorted[sorted.length - 1] });
  }

  const feelingCounts = emptyFeeling();
  let answered = 0;
  for (const o of ended) {
    if (o.feeling) {
      feelingCounts[o.feeling] += 1;
      answered += 1;
    }
  }

  const resolvedTracked = done + missed;
  const sufficiency: Sufficiency =
    resolvedTracked === 0 && time.unionMinutes === 0 && cancelled === 0
      ? "none"
      : resolvedTracked < MIN_RESOLVED
        ? "low"
        : "ok";

  const titleList = [...titles.values()];
  return {
    period,
    days,
    sufficiency,
    total: ended.length,
    done,
    missed,
    cancelled,
    externalCount,
    untimedCount,
    rate: ratio(done, missed),
    reschedules,
    rescheduledCommitments: movedKeys.size,
    time: {
      ...time,
      doneShare: time.unionMinutes > 0 ? time.doneUnionMinutes / time.unionMinutes : null,
    },
    byCategory: buildGroups("categoria"),
    byLabel: buildGroups("rotulo"),
    split,
    weekday,
    timeOfDay: tod,
    duration: {
      short: durBucket("curto", `até ${shortLimit} min`, (m) => m <= shortLimit),
      long: durBucket("longo", `mais de ${shortLimit} min`, (m) => m > shortLimit),
    },
    daysStat,
    overloadedDays: daysStat.filter((d) => d.overloaded).length,
    conflictPairs,
    weeks,
    topDone: titleList
      .filter((t) => t.done >= 2)
      .sort((a, b) => b.done - a.done || a.title.localeCompare(b.title))
      .slice(0, 5),
    topTroubled: titleList
      .filter((t) => t.missed + t.cancelled + t.moves >= 2)
      .sort(
        (a, b) =>
          b.missed + b.cancelled + b.moves - (a.missed + a.cancelled + a.moves) ||
          a.title.localeCompare(b.title),
      )
      .slice(0, 5),
    movedCommitments,
    categoryTime,
    feeling: { answered, counts: feelingCounts },
    averageLoad,
    freeShare: averageLoad === null ? null : 1 - averageLoad,
  };
}

// ---------------------------------------------------------------------------
// Comparação com o período anterior
// ---------------------------------------------------------------------------

export type Comparison = {
  /** Pontos percentuais; null se algum lado não tem dados. */
  rateDelta: number | null;
  minutesDelta: number;
  doneDelta: number;
  reschedulesDelta: number;
  cancelledDelta: number;
  missedDelta: number;
  /** Só compara quando o período anterior tem base mínima. */
  comparable: boolean;
};

export function compare(current: AgendaAnalysis, previous: AgendaAnalysis): Comparison {
  const comparable = previous.done + previous.missed >= MIN_BUCKET;
  return {
    rateDelta:
      comparable && current.rate !== null && previous.rate !== null
        ? Math.round((current.rate - previous.rate) * 100)
        : null,
    minutesDelta: current.time.unionMinutes - previous.time.unionMinutes,
    doneDelta: current.done - previous.done,
    reschedulesDelta: current.reschedules - previous.reschedules,
    cancelledDelta: current.cancelled - previous.cancelled,
    missedDelta: current.missed - previous.missed,
    comparable,
  };
}

/** Rótulos do Norte que não tiveram nenhum compromisso no período. */
export function untouchedLabels(analysis: AgendaAnalysis, labels: LabelLookup[]): LabelLookup[] {
  const present = new Set(
    analysis.byLabel.filter((g) => g.minutes > 0 || g.done + g.missed > 0).map((g) => g.key),
  );
  return labels.filter((l) => !l.archived && !present.has(l.id));
}

export function formatMinutes(minutes: number): string {
  const m = Math.round(minutes);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h} h ${r} min` : `${h} h`;
}

export type { Feeling };
