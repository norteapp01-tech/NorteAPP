import { useQuery } from "@tanstack/react-query";
import { supabase, ensureSession, useSupabaseUserId } from "./supabase/client";
import { queryClient } from "./query-client";
import { nowDate } from "./test-clock";
import {
  adoptSeriesAlerts,
  fetchAgendaAlerts,
  removeExecutionAlerts,
  setExecutionAlerts,
  syncSeriesAlerts,
} from "./agenda-alerts";
import { addDaysISO } from "./agenda-intervals";
import {
  expandRule,
  normalizeRule,
  splitSeries,
  type EditScope,
  type RecurrenceRule,
} from "./agenda-recurrence";
import type { AgendaOccurrence, SeriesException, SeriesRecord } from "./agenda-occurrences";
import {
  createExecution,
  logAgendaChange,
  removeAgendaSession,
  scheduleExecution,
  setExecutionStatus,
  toISODate,
  updateAgendaSession,
  updateExecutionDetails,
  QUERY_KEY as GOALS_QUERY_KEY,
  type TaskWeight,
} from "./goals-store";

// ---------------------------------------------------------------------------
// Séries recorrentes: criação, leitura e as operações por ocorrência.
//
// Modelo (ver migração 0053): a série guarda regra + modelo; ocorrências são
// calculadas. Só vira linha em `executions` a ocorrência que a pessoa tocou
// (ou a que entra na janela curta de hoje/amanhã). `series_id +
// series_occurrence_date` identificam a ocorrência ORIGINAL pela regra — mesmo
// depois de movida — e um índice único impede duplicá-la.
//
// Toda operação devolve uma função `undo` para o "Desfazer" da interface.
// ---------------------------------------------------------------------------

type Row = Record<string, unknown>;
export type Undo = () => Promise<void>;
export type Result = { undo: Undo };

function unwrap<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

export const SERIES_QUERY_KEY = ["agenda-series"] as const;

function invalidate() {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: SERIES_QUERY_KEY, refetchType: "all" }),
    queryClient.invalidateQueries({ queryKey: GOALS_QUERY_KEY, refetchType: "all" }),
  ]);
}

function mapSeries(r: Row): SeriesRecord {
  return {
    id: r.id as string,
    title: r.title as string,
    category: (r.category as string) ?? "generico",
    labelId: (r.label_id as string | null) ?? undefined,
    location: (r.location as string | null) ?? undefined,
    notes: (r.notes as string | null) ?? undefined,
    link: (r.link as string | null) ?? undefined,
    rigid: Boolean(r.rigid),
    weight: ((r.weight as TaskWeight) ?? "leve") as TaskWeight,
    goalId: (r.goal_id as string | null) ?? undefined,
    stepId: (r.step_id as string | null) ?? undefined,
    startDate: r.start_date as string,
    startTime: (r.start_time as string | null) ?? undefined,
    endTime: (r.end_time as string | null) ?? undefined,
    allDay: Boolean(r.all_day),
    rule: normalizeRule(r.rule as RecurrenceRule),
    alerts: Array.isArray(r.alerts) ? (r.alerts as number[]) : [],
    source: ((r.source as string) ?? "norte") as "norte" | "external",
    archivedAt: (r.archived_at as string | null) ?? undefined,
    createdAt: r.created_at as string,
  };
}

export async function fetchSeriesState(): Promise<{
  series: SeriesRecord[];
  exceptions: SeriesException[];
}> {
  const [seriesRes, exceptionRes] = await Promise.all([
    supabase.from("agenda_series").select("*").order("created_at"),
    supabase.from("agenda_series_exceptions").select("*"),
  ]);
  return {
    series: (unwrap(seriesRes) as Row[]).map(mapSeries),
    exceptions: (unwrap(exceptionRes) as Row[]).map((r) => ({
      seriesId: r.series_id as string,
      occurrenceDate: r.occurrence_date as string,
      kind: "removed" as const,
    })),
  };
}

export function useAgendaSeries(): {
  series: SeriesRecord[];
  exceptions: SeriesException[];
  loading: boolean;
} {
  const userId = useSupabaseUserId();
  const { data, isLoading } = useQuery({
    queryKey: SERIES_QUERY_KEY,
    queryFn: fetchSeriesState,
    enabled: !!userId,
  });
  return {
    series: data?.series ?? [],
    exceptions: data?.exceptions ?? [],
    loading: !userId || isLoading,
  };
}

// ---------------------------------------------------------------------------
// Criação
// ---------------------------------------------------------------------------

export type SeriesDraft = {
  title: string;
  category?: string;
  labelId?: string;
  location?: string;
  notes?: string;
  link?: string;
  rigid?: boolean;
  weight?: TaskWeight;
  goalId?: string;
  stepId?: string;
  startDate: string;
  startTime?: string;
  endTime?: string;
  allDay?: boolean;
  rule: RecurrenceRule;
  alerts?: number[];
};

function seriesToRow(s: Partial<SeriesRecord>): Row {
  const row: Row = {};
  if (s.title !== undefined) row.title = s.title;
  if (s.category !== undefined) row.category = s.category;
  if (s.labelId !== undefined) row.label_id = s.labelId ?? null;
  if (s.location !== undefined) row.location = s.location ?? null;
  if (s.notes !== undefined) row.notes = s.notes ?? null;
  if (s.link !== undefined) row.link = s.link ?? null;
  if (s.rigid !== undefined) row.rigid = s.rigid;
  if (s.weight !== undefined) row.weight = s.weight;
  if (s.goalId !== undefined) row.goal_id = s.goalId ?? null;
  if (s.stepId !== undefined) row.step_id = s.stepId ?? null;
  if (s.startDate !== undefined) row.start_date = s.startDate;
  if (s.startTime !== undefined) row.start_time = s.startTime ?? null;
  if (s.endTime !== undefined) row.end_time = s.endTime ?? null;
  if (s.allDay !== undefined) row.all_day = s.allDay;
  if (s.rule !== undefined) row.rule = normalizeRule(s.rule);
  if (s.alerts !== undefined) row.alerts = s.alerts;
  if (s.archivedAt !== undefined) row.archived_at = s.archivedAt ?? null;
  return row;
}

/** Quantos dias à frente os alertas de série são preparados. */
const ALERT_HORIZON_DAYS = 30;
/** Quantos dias à frente as ocorrências viram compromissos reais, para que a
 * tela Hoje, os lembretes e o Agente Norte as enxerguem. */
const MATERIALIZE_AHEAD_DAYS = 1;

async function fetchSeriesRow(id: string): Promise<SeriesRecord> {
  return mapSeries(unwrap(await supabase.from("agenda_series").select("*").eq("id", id).single()));
}

async function touchedDates(seriesId: string): Promise<Set<string>> {
  const { data } = await supabase
    .from("executions")
    .select("series_occurrence_date")
    .eq("series_id", seriesId);
  return new Set(
    ((data ?? []) as Row[]).map((r) => r.series_occurrence_date as string).filter(Boolean),
  );
}

async function removedDates(seriesId: string): Promise<Set<string>> {
  const { data } = await supabase
    .from("agenda_series_exceptions")
    .select("occurrence_date")
    .eq("series_id", seriesId);
  return new Set(((data ?? []) as Row[]).map((r) => r.occurrence_date as string));
}

/** Prepara os alertas das próximas ocorrências que ainda são só regra. */
export async function refreshSeriesAlerts(seriesId: string): Promise<void> {
  const series = await fetchSeriesRow(seriesId);
  const today = toISODate(nowDate());
  if (series.archivedAt || series.alerts.length === 0) {
    await syncSeriesAlerts({
      seriesId,
      title: series.title,
      startTime: series.startTime,
      alerts: [],
      dates: [],
    });
    return;
  }
  const [touched, removed] = await Promise.all([touchedDates(seriesId), removedDates(seriesId)]);
  const dates = expandRule(
    series.rule,
    series.startDate,
    today,
    addDaysISO(today, ALERT_HORIZON_DAYS),
  ).filter((d) => !touched.has(d) && !removed.has(d));
  await syncSeriesAlerts({
    seriesId,
    title: series.title,
    startTime: series.allDay ? undefined : series.startTime,
    alerts: series.alerts,
    dates,
  });
}

export async function createSeries(draft: SeriesDraft): Promise<string> {
  const userId = await ensureSession();
  const row = unwrap<{ id: string }>(
    await supabase
      .from("agenda_series")
      .insert({
        user_id: userId,
        category: "generico",
        ...seriesToRow({
          title: draft.title,
          category: draft.category,
          labelId: draft.labelId,
          location: draft.location,
          notes: draft.notes,
          link: draft.link,
          rigid: draft.rigid ?? false,
          weight: draft.weight ?? "leve",
          goalId: draft.goalId,
          stepId: draft.stepId,
          startDate: draft.startDate,
          startTime: draft.startTime,
          endTime: draft.endTime,
          allDay: draft.allDay ?? false,
          rule: draft.rule,
          alerts: draft.alerts ?? [],
        }),
      })
      .select()
      .single(),
  );
  await refreshSeriesAlerts(row.id);
  await materializeUpcoming();
  await invalidate();
  return row.id;
}

/** Tira a série da Agenda sem apagar o histórico dela (usado pelo "desfazer" de
 * uma criação recorrente). */
export async function archiveSeries(id: string, archived = true): Promise<void> {
  unwrap(
    await supabase
      .from("agenda_series")
      .update({ archived_at: archived ? new Date().toISOString() : null })
      .eq("id", id)
      .select()
      .single(),
  );
  await refreshSeriesAlerts(id);
  await invalidate();
}

/** Apaga uma série que acabou de ser criada e todas as ocorrências reais que
 * nasceram com ela. É deliberadamente diferente de arquivar: no Desfazer de
 * uma criação nada daquela criação pode continuar aparecendo em Hoje. */
export async function discardSeries(id: string): Promise<void> {
  const { data } = await supabase.from("executions").select("id").eq("series_id", id);
  const executionIds = ((data ?? []) as Row[]).map((row) => row.id as string);
  for (const executionId of executionIds) await removeExecutionAlerts(executionId);
  if (executionIds.length > 0) await supabase.from("executions").delete().eq("series_id", id);
  await supabase.from("agenda_series").delete().eq("id", id);
  await invalidate();
}

// ---------------------------------------------------------------------------
// Materialização
// ---------------------------------------------------------------------------

function isDuplicateError(message: string) {
  return /duplicate key|23505|unique/i.test(message);
}

/** Cria o compromisso real de UMA ocorrência. */
export async function materializeOccurrence(
  series: SeriesRecord,
  occurrenceDate: string,
  o: {
    status?: "planejada" | "concluida" | "cancelada";
    date?: string;
    startTime?: string;
    endTime?: string;
    overridden?: boolean;
    silent?: boolean;
  } = {},
): Promise<string> {
  const allDay = series.allDay || !series.startTime;
  const id = await createExecution({
    title: series.title,
    dueDate: occurrenceDate,
    agendaDate: o.date ?? occurrenceDate,
    startTime: allDay ? "" : (o.startTime ?? series.startTime),
    endTime: allDay ? undefined : (o.endTime ?? series.endTime),
    category: series.category,
    rigid: series.rigid,
    weight: series.weight,
    goalId: series.goalId,
    stepId: series.stepId,
    labelId: series.labelId,
    location: series.location,
    notes: series.notes,
    link: series.link,
    allDay,
    status: o.status ?? "planejada",
    seriesId: series.id,
    seriesOccurrenceDate: occurrenceDate,
    seriesOverridden: o.overridden ?? false,
    silent: o.silent ?? true,
  });
  await adoptSeriesAlerts(series.id, occurrenceDate, id);
  return id;
}

/** Transforma em compromissos reais as ocorrências de hoje (e do próximo dia),
 * para que Hoje, lembretes e o Agente Norte as enxerguem. Idempotente. */
export async function materializeUpcoming(daysAhead = MATERIALIZE_AHEAD_DAYS): Promise<number> {
  const { data } = await supabase.from("agenda_series").select("*").is("archived_at", null);
  const seriesList = ((data ?? []) as Row[]).map(mapSeries);
  if (seriesList.length === 0) return 0;
  const today = toISODate(nowDate());
  const to = addDaysISO(today, daysAhead);
  let created = 0;
  for (const series of seriesList) {
    const dates = expandRule(series.rule, series.startDate, today, to);
    if (dates.length === 0) continue;
    const [touched, removed] = await Promise.all([
      touchedDates(series.id),
      removedDates(series.id),
    ]);
    for (const date of dates) {
      if (touched.has(date) || removed.has(date)) continue;
      try {
        await materializeOccurrence(series, date);
        created += 1;
      } catch (error) {
        // Outro aparelho já criou a mesma ocorrência: tudo certo.
        if (!(error instanceof Error) || !isDuplicateError(error.message)) throw error;
      }
    }
  }
  if (created > 0) await invalidate();
  return created;
}

// ---------------------------------------------------------------------------
// Operações por ocorrência
// ---------------------------------------------------------------------------

export type OccurrenceRef = Pick<
  AgendaOccurrence,
  | "kind"
  | "executionId"
  | "sessionId"
  | "seriesId"
  | "occurrenceDate"
  | "date"
  | "startTime"
  | "endTime"
  | "status"
  | "title"
  | "goalId"
  | "routineId"
>;

export type OccurrenceChanges = Partial<{
  title: string;
  category: string;
  labelId: string | null;
  location: string | null;
  notes: string | null;
  link: string | null;
  rigid: boolean;
  allDay: boolean;
  startTime: string;
  endTime: string;
  /** Só faz sentido para "somente esta ocorrência". */
  date: string;
  alerts: number[];
  rule: RecurrenceRule;
}>;

const noopUndo: Undo = async () => {};

/** Concluir uma ocorrência (virtual ou real). */
export async function completeOccurrence(occ: OccurrenceRef): Promise<Result> {
  if (occ.kind === "virtual" && occ.seriesId && occ.occurrenceDate) {
    const series = await fetchSeriesRow(occ.seriesId);
    const id = await materializeOccurrence(series, occ.occurrenceDate, {
      status: "concluida",
      date: occ.date,
      startTime: occ.startTime,
      endTime: occ.endTime,
      overridden: true,
      silent: false,
    });
    await logAgendaChange({
      executionId: id,
      seriesId: series.id,
      kind: "completed",
      to: { date: occ.date, start: occ.startTime, end: occ.endTime },
    });
    await invalidate();
    return { undo: async () => void (await setExecutionStatus(id, "planejada", "desfeito")) };
  }
  if (!occ.executionId) return { undo: noopUndo };
  await setExecutionStatus(occ.executionId, "concluida");
  const id = occ.executionId;
  return { undo: async () => void (await setExecutionStatus(id, "planejada", "desfeito")) };
}

/** Mover UMA ocorrência (outro dia e/ou horário). */
export async function moveOccurrence(
  occ: OccurrenceRef,
  date: string,
  startTime: string,
  endTime?: string,
): Promise<Result> {
  const before = { date: occ.date, start: occ.startTime ?? "", end: occ.endTime };
  if (occ.kind === "virtual" && occ.seriesId && occ.occurrenceDate) {
    const series = await fetchSeriesRow(occ.seriesId);
    const id = await materializeOccurrence(series, occ.occurrenceDate, {
      date,
      startTime,
      endTime,
      overridden: true,
    });
    await logAgendaChange({
      executionId: id,
      seriesId: series.id,
      kind: "moved",
      from: before,
      to: { date, start: startTime, end: endTime },
    });
    await invalidate();
    return {
      undo: async () => {
        await updateAgendaSession(id, undefined, before.date, before.start, before.end);
      },
    };
  }
  if (!occ.executionId) return { undo: noopUndo };
  await updateAgendaSession(occ.executionId, occ.sessionId, date, startTime, endTime);
  const { executionId, sessionId } = occ;
  return {
    undo: async () => {
      await updateAgendaSession(executionId!, sessionId, before.date, before.start, before.end);
    },
  };
}

/** Cancelar mantém o registro (aparece esmaecido, não ocupa horário). */
export async function cancelOccurrence(occ: OccurrenceRef, scope: EditScope): Promise<Result> {
  if (!occ.seriesId || scope === "this") {
    if (occ.kind === "virtual" && occ.seriesId && occ.occurrenceDate) {
      const series = await fetchSeriesRow(occ.seriesId);
      const id = await materializeOccurrence(series, occ.occurrenceDate, {
        status: "cancelada",
        date: occ.date,
        startTime: occ.startTime,
        endTime: occ.endTime,
        overridden: true,
        silent: false,
      });
      await logAgendaChange({ executionId: id, seriesId: series.id, kind: "cancelled" });
      await invalidate();
      return { undo: async () => void (await setExecutionStatus(id, "planejada", "desfeito")) };
    }
    if (!occ.executionId) return { undo: noopUndo };
    const previous = occ.status === "cancelada" ? "planejada" : occ.status;
    await setExecutionStatus(occ.executionId, "cancelada");
    const id = occ.executionId;
    return {
      undo: async () =>
        void (await setExecutionStatus(
          id,
          previous === "perdida" ? "planejada" : previous,
          "desfeito",
        )),
    };
  }
  // Série inteira ou "daqui para a frente": a série termina e as ocorrências
  // futuras já materializadas ficam canceladas.
  return endSeries(occ, scope, "cancel");
}

/** Tira da Agenda. Ação de plano só perde o HORÁRIO (a ação continua no plano e
 * pode ser agendada de novo); compromisso avulso é apagado; ocorrência de rotina
 * é cancelada — apagá-la faria a rotina recriá-la. */
export async function removeFromAgenda(occ: OccurrenceRef, scope: EditScope): Promise<Result> {
  if (occ.executionId && occ.routineId) return cancelOccurrence(occ, "this");
  if (occ.executionId && occ.goalId && !occ.seriesId) {
    const before = { date: occ.date, start: occ.startTime ?? "", end: occ.endTime };
    const id = occ.executionId;
    await removeAgendaSession(id, occ.sessionId);
    await invalidate();
    return {
      undo: async () => {
        await scheduleExecution(id, before.date, before.start, before.end);
      },
    };
  }
  return removeOccurrence(occ, scope);
}

/** Remover apaga: some da Agenda (diferente de cancelar). */
export async function removeOccurrence(occ: OccurrenceRef, scope: EditScope): Promise<Result> {
  if (!occ.seriesId || scope === "this") {
    if (occ.seriesId && occ.occurrenceDate) {
      const userId = await ensureSession();
      await logAgendaChange({
        executionId: occ.executionId,
        seriesId: occ.seriesId,
        subjectTitle: occ.title,
        kind: "removed",
        from: { date: occ.date, start: occ.startTime, end: occ.endTime },
      });
      // A ocorrência vira exceção da regra: ela não reaparece.
      const exception = await supabase
        .from("agenda_series_exceptions")
        .upsert(
          {
            user_id: userId,
            series_id: occ.seriesId,
            occurrence_date: occ.occurrenceDate,
            kind: "removed",
          },
          { onConflict: "series_id,occurrence_date" },
        )
        .select()
        .single();
      unwrap(exception);
      let snapshot: Row | null = null;
      let snapshotAlerts: number[] = [];
      if (occ.executionId) {
        snapshot = unwrap<Row>(
          await supabase.from("executions").select("*").eq("id", occ.executionId).single(),
        );
        snapshotAlerts = (await fetchAgendaAlerts())
          .filter((alert) => alert.executionId === occ.executionId)
          .map((alert) => alert.offsetMinutes);
        await removeExecutionAlerts(occ.executionId);
        await supabase.from("executions").delete().eq("id", occ.executionId);
      }
      await refreshSeriesAlerts(occ.seriesId);
      await invalidate();
      const { seriesId, occurrenceDate } = occ;
      return {
        undo: async () => {
          await supabase
            .from("agenda_series_exceptions")
            .delete()
            .eq("series_id", seriesId)
            .eq("occurrence_date", occurrenceDate!);
          if (snapshot) {
            const { id: _id, created_at: _created, ...rest } = snapshot;
            void _id;
            void _created;
            await supabase.from("executions").insert({ ...rest, id: snapshot.id });
            await setExecutionAlerts(
              {
                id: snapshot.id as string,
                title: snapshot.title as string,
                date: snapshot.agenda_date as string,
                startTime: snapshot.all_day
                  ? undefined
                  : ((snapshot.start_time as string | null) ?? undefined),
                seriesId,
              },
              snapshotAlerts,
            );
          }
          await refreshSeriesAlerts(seriesId);
          await invalidate();
        },
      };
    }
    if (!occ.executionId) return { undo: noopUndo };
    const snapshot = unwrap<Row>(
      await supabase.from("executions").select("*").eq("id", occ.executionId).single(),
    );
    const snapshotAlerts = (await fetchAgendaAlerts())
      .filter((alert) => alert.executionId === occ.executionId)
      .map((alert) => alert.offsetMinutes);
    await logAgendaChange({
      executionId: occ.executionId,
      subjectTitle: occ.title,
      kind: "removed",
      from: { date: occ.date, start: occ.startTime, end: occ.endTime },
    });
    await removeExecutionAlerts(occ.executionId);
    await supabase.from("executions").delete().eq("id", occ.executionId);
    await invalidate();
    return {
      undo: async () => {
        await supabase.from("executions").insert(snapshot);
        await setExecutionAlerts(
          {
            id: snapshot.id as string,
            title: snapshot.title as string,
            date: snapshot.agenda_date as string,
            startTime: snapshot.all_day
              ? undefined
              : ((snapshot.start_time as string | null) ?? undefined),
          },
          snapshotAlerts,
        );
        await invalidate();
      },
    };
  }
  return endSeries(occ, scope, "remove");
}

/** Encerra a série (toda ou daqui para a frente). `cancel` mantém o histórico
 * já vivido; `remove` também apaga o que ainda não aconteceu. */
async function endSeries(
  occ: OccurrenceRef,
  scope: "following" | "all",
  mode: "cancel" | "remove",
): Promise<Result> {
  const seriesId = occ.seriesId!;
  const series = await fetchSeriesRow(seriesId);
  const today = toISODate(nowDate());
  const from = scope === "all" ? series.startDate : (occ.occurrenceDate ?? occ.date);
  const previousRule = series.rule;
  const previousArchived = series.archivedAt;

  await logAgendaChange({
    executionId: occ.executionId,
    seriesId,
    subjectTitle: occ.title,
    kind: mode === "cancel" ? "cancelled" : "removed",
    from: { date: occ.date, start: occ.startTime, end: occ.endTime },
    note: scope === "all" ? "toda a série" : "esta e as próximas",
  });

  if (from <= series.startDate) {
    // Nada sobra antes dela: a série inteira sai de cena.
    await supabase
      .from("agenda_series")
      .update({ archived_at: new Date().toISOString() })
      .eq("id", seriesId);
  } else {
    const { oldRule } = splitSeries({ startDate: series.startDate, rule: series.rule }, from);
    await supabase.from("agenda_series").update({ rule: oldRule }).eq("id", seriesId);
  }

  // Compromissos já materializados daqui para a frente que ainda estão em aberto.
  const { data } = await supabase
    .from("executions")
    .select("id, status, series_occurrence_date")
    .eq("series_id", seriesId)
    .gte("series_occurrence_date", from);
  const open = ((data ?? []) as Row[]).filter(
    (r) =>
      r.status === "planejada" &&
      (r.series_occurrence_date as string) >= (scope === "all" ? today : from),
  );
  const snapshots: Row[] = [];
  const snapshotAlerts = new Map<string, number[]>();
  const allAlerts = mode === "remove" ? await fetchAgendaAlerts() : [];
  for (const r of open) {
    const id = r.id as string;
    if (mode === "remove") {
      snapshots.push(
        unwrap<Row>(await supabase.from("executions").select("*").eq("id", id).single()),
      );
      snapshotAlerts.set(
        id,
        allAlerts.filter((alert) => alert.executionId === id).map((alert) => alert.offsetMinutes),
      );
      await removeExecutionAlerts(id);
      await supabase.from("executions").delete().eq("id", id);
    } else {
      await setExecutionStatus(id, "cancelada");
    }
  }
  await refreshSeriesAlerts(seriesId);
  await invalidate();

  return {
    undo: async () => {
      await supabase
        .from("agenda_series")
        .update({ rule: previousRule, archived_at: previousArchived ?? null })
        .eq("id", seriesId);
      if (mode === "remove") {
        for (const snapshot of snapshots) {
          await supabase.from("executions").insert(snapshot);
          await setExecutionAlerts(
            {
              id: snapshot.id as string,
              title: snapshot.title as string,
              date: snapshot.agenda_date as string,
              startTime: snapshot.all_day
                ? undefined
                : ((snapshot.start_time as string | null) ?? undefined),
              seriesId,
            },
            snapshotAlerts.get(snapshot.id as string) ?? [],
          );
        }
      } else {
        for (const r of open) await setExecutionStatus(r.id as string, "planejada", "desfeito");
      }
      await refreshSeriesAlerts(seriesId);
      await invalidate();
    },
  };
}

/** Editar uma ocorrência com escopo: só esta, esta e as próximas, ou toda a série. */
export async function editOccurrence(
  occ: OccurrenceRef,
  scope: EditScope,
  changes: OccurrenceChanges,
): Promise<Result> {
  // Compromisso sem série: edição direta.
  if (!occ.seriesId || !occ.occurrenceDate) {
    return editStandalone(occ, changes);
  }
  if (scope === "this") return editThis(occ, changes);
  return editSeries(occ, scope, changes);
}

async function editStandalone(occ: OccurrenceRef, changes: OccurrenceChanges): Promise<Result> {
  if (!occ.executionId) return { undo: noopUndo };
  const id = occ.executionId;
  const row = unwrap<Row>(await supabase.from("executions").select("*").eq("id", id).single());
  const previousAlerts =
    changes.alerts === undefined
      ? null
      : (await fetchAgendaAlerts())
          .filter((alert) => alert.executionId === id)
          .map((alert) => alert.offsetMinutes);
  await applyExecutionChanges(id, occ, changes);
  return {
    undo: async () => {
      await updateExecutionDetails(id, {
        title: row.title as string,
        location: (row.location as string | null) ?? null,
        notes: (row.notes as string | null) ?? null,
        link: (row.link as string | null) ?? null,
        labelId: (row.label_id as string | null) ?? null,
        rigid: row.rigid as boolean,
        allDay: row.all_day as boolean,
        category: row.category as string,
      });
      if (occ.startTime !== undefined)
        await updateAgendaSession(id, occ.sessionId, occ.date, occ.startTime, occ.endTime);
      if (previousAlerts)
        await setExecutionAlerts(
          {
            id,
            title: row.title as string,
            date: occ.date,
            startTime: row.all_day ? undefined : occ.startTime,
            seriesId: (row.series_id as string | null) ?? undefined,
          },
          previousAlerts,
        );
    },
  };
}

async function applyExecutionChanges(
  executionId: string,
  current: Pick<OccurrenceRef, "sessionId" | "date" | "startTime" | "endTime" | "title">,
  changes: OccurrenceChanges,
) {
  const details: Parameters<typeof updateExecutionDetails>[1] = {};
  if (changes.title !== undefined) details.title = changes.title;
  if (changes.category !== undefined) details.category = changes.category;
  if (changes.labelId !== undefined) details.labelId = changes.labelId;
  if (changes.location !== undefined) details.location = changes.location;
  if (changes.notes !== undefined) details.notes = changes.notes;
  if (changes.link !== undefined) details.link = changes.link;
  if (changes.rigid !== undefined) details.rigid = changes.rigid;
  if (changes.allDay !== undefined) details.allDay = changes.allDay;
  await updateExecutionDetails(executionId, details);
  const nextDate = changes.date ?? current.date;
  const nextStart = changes.startTime ?? current.startTime ?? "";
  const nextEnd = changes.endTime ?? current.endTime;
  if (
    changes.date !== undefined ||
    changes.startTime !== undefined ||
    changes.endTime !== undefined
  ) {
    await updateAgendaSession(executionId, current.sessionId, nextDate, nextStart, nextEnd);
  }
  if (changes.alerts !== undefined) {
    await setExecutionAlerts(
      {
        id: executionId,
        title: changes.title ?? current.title,
        date: nextDate,
        startTime: changes.allDay ? undefined : nextStart,
      },
      changes.alerts,
    );
  }
}

async function editThis(occ: OccurrenceRef, changes: OccurrenceChanges): Promise<Result> {
  const seriesId = occ.seriesId!;
  if (occ.kind === "virtual") {
    const series = await fetchSeriesRow(seriesId);
    const id = await materializeOccurrence(series, occ.occurrenceDate!, {
      date: changes.date ?? occ.date,
      startTime: changes.startTime ?? occ.startTime,
      endTime: changes.endTime ?? occ.endTime,
      overridden: true,
    });
    const rest = { ...changes };
    delete rest.date;
    delete rest.startTime;
    delete rest.endTime;
    await applyExecutionChanges(id, { ...occ, sessionId: `legacy-${id}` }, rest);
    if (changes.date !== undefined || changes.startTime !== undefined) {
      await logAgendaChange({
        executionId: id,
        seriesId,
        kind: "moved",
        from: { date: occ.date, start: occ.startTime, end: occ.endTime },
        to: {
          date: changes.date ?? occ.date,
          start: changes.startTime ?? occ.startTime,
          end: changes.endTime ?? occ.endTime,
        },
      });
    }
    await invalidate();
    return {
      undo: async () => {
        await removeExecutionAlerts(id);
        await supabase.from("executions").delete().eq("id", id);
        await refreshSeriesAlerts(seriesId);
        await invalidate();
      },
    };
  }
  return editStandalone(occ, changes);
}

async function editSeries(
  occ: OccurrenceRef,
  scope: "following" | "all",
  changes: OccurrenceChanges,
): Promise<Result> {
  const seriesId = occ.seriesId!;
  const series = await fetchSeriesRow(seriesId);
  const occurrenceDate = occ.occurrenceDate!;
  const splitHere = scope === "following" && occurrenceDate > series.startDate;
  const today = toISODate(nowDate());
  const fromDate = scope === "all" ? today : occurrenceDate;
  const { data: executionsBeforeData } = await supabase
    .from("executions")
    .select("*")
    .eq("series_id", seriesId);
  const executionsBefore = (executionsBeforeData ?? []) as Row[];
  const executionIdsBefore = new Set(executionsBefore.map((row) => row.id as string));
  const pristineBefore = executionsBefore.filter(
    (row) =>
      row.series_overridden === false &&
      row.status === "planejada" &&
      (row.series_occurrence_date as string) >= fromDate,
  );
  const previousAlerts =
    changes.alerts === undefined
      ? new Map<string, number[]>()
      : (await fetchAgendaAlerts()).reduce((map, alert) => {
          if (!alert.executionId || !pristineBefore.some((row) => row.id === alert.executionId))
            return map;
          const list = map.get(alert.executionId) ?? [];
          list.push(alert.offsetMinutes);
          map.set(alert.executionId, list);
          return map;
        }, new Map<string, number[]>());
  const template: Partial<SeriesRecord> = {};
  if (changes.title !== undefined) template.title = changes.title;
  if (changes.category !== undefined) template.category = changes.category;
  if (changes.labelId !== undefined) template.labelId = changes.labelId ?? undefined;
  if (changes.location !== undefined) template.location = changes.location ?? undefined;
  if (changes.notes !== undefined) template.notes = changes.notes ?? undefined;
  if (changes.link !== undefined) template.link = changes.link ?? undefined;
  if (changes.rigid !== undefined) template.rigid = changes.rigid;
  if (changes.allDay !== undefined) template.allDay = changes.allDay;
  if (changes.startTime !== undefined) template.startTime = changes.startTime;
  if (changes.endTime !== undefined) template.endTime = changes.endTime;
  if (changes.alerts !== undefined) template.alerts = changes.alerts;
  if (changes.rule !== undefined) template.rule = changes.rule;

  const previous = { ...series };
  let targetId = seriesId;
  let createdSeriesId: string | null = null;
  let movedExecutionIds: string[] = [];
  let movedExceptionDates: string[] = [];

  if (splitHere) {
    // A série antiga termina na véspera; a nova nasce aqui já com as mudanças.
    const { oldRule, newRule } = splitSeries(
      { startDate: series.startDate, rule: series.rule },
      occurrenceDate,
    );
    await supabase.from("agenda_series").update({ rule: oldRule }).eq("id", seriesId);
    const userId = await ensureSession();
    const merged: SeriesRecord = {
      ...series,
      ...template,
      startDate: occurrenceDate,
      rule: normalizeRule(template.rule ?? newRule),
    };
    const created = unwrap<{ id: string }>(
      await supabase
        .from("agenda_series")
        .insert({
          user_id: userId,
          ...seriesToRow({
            title: merged.title,
            category: merged.category,
            labelId: merged.labelId,
            location: merged.location,
            notes: merged.notes,
            link: merged.link,
            rigid: merged.rigid,
            weight: merged.weight,
            goalId: merged.goalId,
            stepId: merged.stepId,
            startDate: merged.startDate,
            startTime: merged.startTime,
            endTime: merged.endTime,
            allDay: merged.allDay,
            rule: merged.rule,
            alerts: merged.alerts,
          }),
        })
        .select()
        .single(),
    );
    targetId = created.id;
    createdSeriesId = created.id;
    // Ocorrências já materializadas e exceções daqui para a frente passam a
    // pertencer à série nova.
    const { data: moved } = await supabase
      .from("executions")
      .select("id")
      .eq("series_id", seriesId)
      .gte("series_occurrence_date", occurrenceDate);
    movedExecutionIds = ((moved ?? []) as Row[]).map((r) => r.id as string);
    for (const id of movedExecutionIds)
      await supabase.from("executions").update({ series_id: targetId }).eq("id", id);
    const { data: ex } = await supabase
      .from("agenda_series_exceptions")
      .select("occurrence_date")
      .eq("series_id", seriesId)
      .gte("occurrence_date", occurrenceDate);
    movedExceptionDates = ((ex ?? []) as Row[]).map((r) => r.occurrence_date as string);
    for (const d of movedExceptionDates)
      await supabase
        .from("agenda_series_exceptions")
        .update({ series_id: targetId })
        .eq("series_id", seriesId)
        .eq("occurrence_date", d);
  } else {
    const row = seriesToRow(template);
    if (Object.keys(row).length > 0)
      await supabase.from("agenda_series").update(row).eq("id", seriesId);
  }

  // As ocorrências já materializadas que a pessoa NÃO tocou acompanham a série.
  const execPatch: Row = {};
  if (changes.title !== undefined) execPatch.title = changes.title;
  if (changes.category !== undefined) execPatch.category = changes.category;
  if (changes.labelId !== undefined) execPatch.label_id = changes.labelId;
  if (changes.location !== undefined) execPatch.location = changes.location;
  if (changes.notes !== undefined) execPatch.notes = changes.notes;
  if (changes.link !== undefined) execPatch.link = changes.link;
  if (changes.rigid !== undefined) execPatch.rigid = changes.rigid;
  if (changes.allDay !== undefined) execPatch.all_day = changes.allDay;
  if (changes.startTime !== undefined) execPatch.start_time = changes.startTime;
  if (changes.endTime !== undefined) execPatch.end_time = changes.endTime;
  if (Object.keys(execPatch).length > 0) {
    const { data: pristine } = await supabase
      .from("executions")
      .select("id, agenda_date, agenda_sessions")
      .eq("series_id", targetId)
      .eq("series_overridden", false)
      .eq("status", "planejada")
      .gte("series_occurrence_date", fromDate);
    for (const r of (pristine ?? []) as Row[]) {
      const patch: Row = { ...execPatch };
      // O horário também vive nas sessões; a ocorrência intocada tem uma só.
      if (Array.isArray(r.agenda_sessions) && r.agenda_sessions.length > 0)
        patch.agenda_sessions = (r.agenda_sessions as Row[]).map((session) => ({
          ...session,
          ...(changes.startTime !== undefined ? { startTime: changes.startTime } : {}),
          ...(changes.endTime !== undefined ? { endTime: changes.endTime } : {}),
        }));
      await supabase
        .from("executions")
        .update(patch)
        .eq("id", r.id as string);
    }
  }

  if (changes.alerts !== undefined) {
    // As ocorrências já materializadas e intocadas passam a ter os mesmos alertas.
    const { data: pristineNow } = await supabase
      .from("executions")
      .select("id, title, agenda_date, start_time, all_day")
      .eq("series_id", targetId)
      .eq("series_overridden", false)
      .eq("status", "planejada")
      .gte("series_occurrence_date", fromDate);
    for (const r of (pristineNow ?? []) as Row[])
      await setExecutionAlerts(
        {
          id: r.id as string,
          title: r.title as string,
          date: r.agenda_date as string,
          startTime: r.all_day ? undefined : ((r.start_time as string | null) ?? undefined),
          seriesId: targetId,
        },
        changes.alerts,
      );
  }

  await refreshSeriesAlerts(targetId);
  if (createdSeriesId) await refreshSeriesAlerts(seriesId);
  await materializeUpcoming();
  await invalidate();

  return {
    undo: async () => {
      await supabase.from("agenda_series").update(seriesToRow(previous)).eq("id", seriesId);
      if (createdSeriesId) {
        for (const id of movedExecutionIds)
          await supabase.from("executions").update({ series_id: seriesId }).eq("id", id);
        for (const d of movedExceptionDates)
          await supabase
            .from("agenda_series_exceptions")
            .update({ series_id: seriesId })
            .eq("series_id", createdSeriesId)
            .eq("occurrence_date", d);
        await discardSeries(createdSeriesId);
      }
      for (const snapshot of pristineBefore) {
        const { id, user_id: _userId, created_at: _createdAt, ...rest } = snapshot;
        void _userId;
        void _createdAt;
        await supabase
          .from("executions")
          .update(rest)
          .eq("id", id as string);
        if (changes.alerts !== undefined)
          await setExecutionAlerts(
            {
              id: id as string,
              title: snapshot.title as string,
              date: snapshot.agenda_date as string,
              startTime: snapshot.all_day
                ? undefined
                : ((snapshot.start_time as string | null) ?? undefined),
              seriesId,
            },
            previousAlerts.get(id as string) ?? [],
          );
      }
      // A nova regra pode ter materializado hoje/amanhã durante a edição. Se
      // essas linhas não existiam antes, o Desfazer também precisa removê-las.
      const { data: currentRows } = await supabase
        .from("executions")
        .select("id, series_overridden")
        .eq("series_id", seriesId);
      for (const row of (currentRows ?? []) as Row[]) {
        const id = row.id as string;
        if (!executionIdsBefore.has(id) && row.series_overridden === false) {
          await removeExecutionAlerts(id);
          await supabase.from("executions").delete().eq("id", id);
        }
      }
      await refreshSeriesAlerts(seriesId);
      await invalidate();
    },
  };
}
