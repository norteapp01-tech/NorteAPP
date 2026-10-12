import {
  addDaysISO,
  crossesMidnight,
  dayLoad,
  occupiesTime,
  type TimedLike,
} from "./agenda-intervals";
import { expandRule, type RecurrenceRule } from "./agenda-recurrence";
import type { Execution, ExecutionStatus, TaskWeight } from "./goals-store";

// ---------------------------------------------------------------------------
// Ocorrências da Agenda.
//
// Duas fontes viram a MESMA coisa para a tela:
//   * compromissos reais (`executions`), com suas sessões de agenda;
//   * ocorrências CALCULADAS de uma série recorrente, enquanto ninguém mexeu
//     nelas (ou seja, enquanto não existe linha em `executions` para elas).
//
// Uma ocorrência da série que ganhou linha própria (concluída, movida,
// cancelada, editada) aparece pela linha — a regra não a gera de novo.
// ---------------------------------------------------------------------------

export type SeriesRecord = {
  id: string;
  title: string;
  category: string;
  labelId?: string;
  location?: string;
  notes?: string;
  link?: string;
  rigid: boolean;
  weight: TaskWeight;
  goalId?: string;
  stepId?: string;
  startDate: string;
  startTime?: string;
  endTime?: string;
  allDay: boolean;
  rule: RecurrenceRule;
  /** Minutos antes do início. */
  alerts: number[];
  source: "norte" | "external";
  archivedAt?: string;
  createdAt: string;
};

export type SeriesException = { seriesId: string; occurrenceDate: string; kind: "removed" };

export type AgendaOccurrence = {
  /** Estável entre renderizações — serve de chave do React e de seleção. */
  key: string;
  kind: "execution" | "virtual";
  executionId?: string;
  sessionId?: string;
  seriesId?: string;
  /** Data ORIGINAL pela regra (a ocorrência pode ter sido movida). */
  occurrenceDate?: string;
  routineId?: string;
  title: string;
  date: string;
  startTime?: string;
  endTime?: string;
  allDay: boolean;
  category: string;
  labelId?: string;
  location?: string;
  notes?: string;
  link?: string;
  rigid: boolean;
  weight: TaskWeight;
  /** Status já resolvido para a tela (planejada vencida vira perdida). */
  status: ExecutionStatus;
  goalId?: string;
  stepId?: string;
  recurring: boolean;
  source: "norte" | "external";
  /** Alertas em minutos — só conhecidos de antemão nas ocorrências virtuais;
   * nas reais vêm dos lembretes ligados ao compromisso. */
  alerts?: number[];
};

export type Clock = { date: string; hm: string };

export function resolveStatus(
  status: ExecutionStatus,
  date: string,
  startTime: string | undefined,
  allDay: boolean,
  now: Clock,
): ExecutionStatus {
  if (status !== "planejada") return status;
  if (allDay || !startTime) return date < now.date ? "perdida" : status;
  return date < now.date || (date === now.date && startTime <= now.hm) ? "perdida" : status;
}

type SessionLike = { id: string; date: string; startTime: string; endTime?: string };

function sessionsOf(e: Execution): SessionLike[] {
  if (e.agendaSessions?.length) return e.agendaSessions;
  if (e.agendaDate)
    return [
      {
        id: `legacy-${e.id}`,
        date: e.agendaDate,
        startTime: e.startTime ?? "",
        endTime: e.endTime,
      },
    ];
  return [];
}

/** Ocorrências de compromissos reais nas datas [from, to]. */
export function executionOccurrences(
  executions: Execution[],
  from: string,
  to: string,
  now: Clock,
): AgendaOccurrence[] {
  const out: AgendaOccurrence[] = [];
  for (const e of executions) {
    // "reagendada": substituída pela execução nova que a sucedeu.
    if (e.status === "reagendada") continue;
    for (const session of sessionsOf(e)) {
      if (session.date < from || session.date > to) continue;
      const allDay = Boolean(e.allDay) || !session.startTime;
      out.push({
        key: `${e.id}|${session.id}`,
        kind: "execution",
        executionId: e.id,
        sessionId: session.id,
        seriesId: e.seriesId,
        occurrenceDate: e.seriesOccurrenceDate,
        routineId: e.routineId,
        title: e.title,
        date: session.date,
        startTime: allDay ? undefined : session.startTime,
        endTime: allDay ? undefined : session.endTime,
        allDay,
        category: e.category,
        labelId: e.labelId,
        location: e.location,
        notes: e.notes,
        link: e.link,
        rigid: e.rigid,
        weight: e.weight,
        status: resolveStatus(e.status, session.date, session.startTime, allDay, now),
        goalId: e.goalId,
        stepId: e.stepId,
        recurring: Boolean(e.seriesId || e.routineId),
        source: e.source ?? "norte",
      });
    }
  }
  return out;
}

/** Ocorrências calculadas das séries nas datas [from, to] que ainda não têm
 * linha própria nem foram removidas. */
export function virtualOccurrences(
  series: SeriesRecord[],
  executions: Execution[],
  exceptions: SeriesException[],
  from: string,
  to: string,
  now: Clock,
): AgendaOccurrence[] {
  const touched = new Set(
    executions
      .filter((e) => e.seriesId && e.seriesOccurrenceDate)
      .map((e) => `${e.seriesId}|${e.seriesOccurrenceDate}`),
  );
  const removed = new Set(exceptions.map((x) => `${x.seriesId}|${x.occurrenceDate}`));
  const out: AgendaOccurrence[] = [];
  for (const s of series) {
    if (s.archivedAt) continue;
    for (const date of expandRule(s.rule, s.startDate, from, to)) {
      const id = `${s.id}|${date}`;
      if (touched.has(id) || removed.has(id)) continue;
      out.push({
        key: `series:${id}`,
        kind: "virtual",
        seriesId: s.id,
        occurrenceDate: date,
        title: s.title,
        date,
        startTime: s.allDay ? undefined : s.startTime,
        endTime: s.allDay ? undefined : s.endTime,
        allDay: s.allDay || !s.startTime,
        category: s.category,
        labelId: s.labelId,
        location: s.location,
        notes: s.notes,
        link: s.link,
        rigid: s.rigid,
        weight: s.weight,
        status: resolveStatus("planejada", date, s.startTime, s.allDay, now),
        goalId: s.goalId,
        stepId: s.stepId,
        recurring: true,
        source: s.source,
        alerts: s.alerts,
      });
    }
  }
  return out;
}

export function buildOccurrences(input: {
  executions: Execution[];
  series: SeriesRecord[];
  exceptions: SeriesException[];
  from: string;
  to: string;
  now: Clock;
}): AgendaOccurrence[] {
  const { executions, series, exceptions, from, to, now } = input;
  const all = [
    ...executionOccurrences(executions, from, to, now),
    ...virtualOccurrences(series, executions, exceptions, from, to, now),
  ];
  return sortOccurrences(all);
}

export function sortOccurrences<T extends { date: string; startTime?: string; allDay?: boolean }>(
  list: T[],
): T[] {
  return [...list].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    // Dia inteiro / sem hora primeiro.
    const aHas = a.startTime && !a.allDay ? 1 : 0;
    const bHas = b.startTime && !b.allDay ? 1 : 0;
    if (aHas !== bHas) return aHas - bHas;
    return (a.startTime ?? "").localeCompare(b.startTime ?? "");
  });
}

export function groupByDate<T extends { date: string }>(list: T[]): Record<string, T[]> {
  const map: Record<string, T[]> = {};
  for (const item of list) (map[item.date] ??= []).push(item);
  return map;
}

/** O que a linha do tempo de um dia precisa: os compromissos do dia e a
 * continuação dos que vieram de ontem pela meia-noite. */
export function occurrencesForDay(all: AgendaOccurrence[], date: string) {
  const previous = addDaysISO(date, -1);
  const today = all.filter((o) => o.date === date);
  const overnight = all.filter(
    (o) =>
      o.date === previous &&
      !!o.startTime &&
      !o.allDay &&
      o.status !== "cancelada" &&
      crossesMidnight(o.startTime, o.endTime),
  );
  return { today, overnight };
}

/** Carga do dia: tempo ocupado/livre sem contar minuto duas vezes. */
export function loadForDate(all: AgendaOccurrence[], date: string) {
  const near = all.filter((o) => o.date >= addDaysISO(date, -1) && o.date <= date);
  return dayLoad(near as TimedLike[], date);
}

export { occupiesTime };
