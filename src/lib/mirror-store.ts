import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase, useSupabaseUserId } from "./supabase/client";
import { useAgendaData } from "@/components/agenda/use-agenda-data";
import { addDaysISO } from "./agenda-intervals";
import type { AgendaOccurrence } from "./agenda-occurrences";
import { timeToMinutes } from "./agenda-time";
import { toISODate, useGoalsError, useGoalsLoading } from "./goals-store";
import {
  analyzeAgenda,
  compare,
  previousPeriod,
  isRoutineLike,
  type AgendaAnalysis,
  type Comparison,
  type MirrorChange,
  type Period,
} from "./mirror-analytics";
import { buildInsights, type Insight } from "./mirror-insights";

// ---------------------------------------------------------------------------
// Dados do Espelho. Tudo vem do que o app JÁ guarda — compromissos, séries,
// rótulos e o histórico de `agenda_changes` (reagendamentos, cancelamentos).
// Não há tabela nova de métricas: o Espelho calcula na hora, com as regras de
// `mirror-analytics.ts`, e a RLS das tabelas de origem isola cada pessoa.
// ---------------------------------------------------------------------------

export const MIRROR_CHANGES_KEY = ["mirror-changes"] as const;

export async function fetchMirrorChanges(from: string, to: string): Promise<MirrorChange[]> {
  // Folga de um dia nas pontas: o instante é UTC, o período é local.
  const { data, error } = await supabase
    .from("agenda_changes")
    .select("at, kind, execution_id, series_id, subject_title, from_date, to_date")
    .gte("at", `${addDaysISO(from, -1)}T00:00:00Z`)
    .lte("at", `${addDaysISO(to, 1)}T23:59:59Z`)
    .eq("kind", "moved")
    .order("at");
  if (error) throw new Error(error.message);
  return (data as Record<string, unknown>[]).map((r) => ({
    at: r.at as string,
    kind: r.kind as string,
    executionId: (r.execution_id as string | null) ?? undefined,
    seriesId: (r.series_id as string | null) ?? undefined,
    subjectTitle: (r.subject_title as string | null) ?? undefined,
    fromDate: (r.from_date as string | null) ?? undefined,
    toDate: (r.to_date as string | null) ?? undefined,
  }));
}

const localDate = (iso: string) => toISODate(new Date(iso));

export type MirrorState =
  | { status: "loading" }
  | { status: "error"; retry: () => void }
  | {
      status: "ready";
      period: Period;
      current: AgendaAnalysis;
      previous: AgendaAnalysis;
      comparison: Comparison;
      insights: Insight[];
      /** O histórico de mudanças não carregou: reagendamentos ficam de fora. */
      historyMissing: boolean;
      /** Só as rotinas dos módulos (Academia, Leitura, Fé…): período e anterior. */
      routines: { current: AgendaAnalysis; previous: AgendaAnalysis };
      /** Concluídos recentes sem resposta de "Como foi?". */
      recentUnanswered: AgendaOccurrence[];
      labels: { id: string; name: string; color: string; archived: boolean }[];
    };

/** Análise do período e do período anterior, pronta para as três visões. */
export function useMirror(period: Period, scope: string): MirrorState {
  const prev = previousPeriod(period);
  const data = useAgendaData({ from: addDaysISO(prev.from, -1), to: period.to });
  const loadingGoals = useGoalsLoading();
  const goalsError = useGoalsError();
  const userId = useSupabaseUserId();
  const changesQuery = useQuery({
    queryKey: [...MIRROR_CHANGES_KEY, userId, prev.from, period.to],
    queryFn: () => fetchMirrorChanges(prev.from, period.to),
    enabled: !!userId,
  });

  const labels = useMemo(
    () =>
      data.labels.all.map((l) => ({
        id: l.id,
        name: l.name,
        color: l.color,
        archived: l.archived,
      })),
    [data.labels.all],
  );
  const lookup = useMemo(
    () =>
      data.executions.map((e) => ({
        id: e.id,
        title: e.title,
        seriesId: e.seriesId,
        labelId: e.labelId,
        category: e.category,
      })),
    [data.executions],
  );

  const settings = data.settings;
  const nowMinute = data.nowMinute;
  const today = data.clock.date;
  const changes = changesQuery.data;

  return useMemo<MirrorState>(() => {
    if (goalsError.error) return { status: "error", retry: goalsError.retry };
    if (loadingGoals && data.executions.length === 0) return { status: "loading" };
    if (changesQuery.isLoading) return { status: "loading" };
    const base = {
      occurrences: data.occurrences,
      changes: changes ?? [],
      executions: lookup,
      labels,
      now: { date: today, minute: nowMinute },
      window: { start: timeToMinutes(settings.dayStart), end: timeToMinutes(settings.dayEnd) },
      localDate,
    };
    const routineBase = { ...base, occurrences: data.occurrences.filter(isRoutineLike) };
    const current = analyzeAgenda(base, period);
    const previous = analyzeAgenda(base, prev);
    const comparison = compare(current, previous);
    return {
      status: "ready",
      period,
      current,
      previous,
      comparison,
      insights: buildInsights(current, comparison, { labels, scope }),
      historyMissing: changesQuery.isError,
      routines: {
        current: analyzeAgenda(routineBase, period),
        previous: analyzeAgenda(routineBase, prev),
      },
      recentUnanswered: data.occurrences
        .filter(
          (o) =>
            o.status === "concluida" &&
            o.executionId &&
            !o.feeling &&
            o.source !== "external" &&
            o.date >= addDaysISO(today, -7) &&
            o.date <= today,
        )
        .slice(-3)
        .reverse(),
      labels,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    data.occurrences,
    changes,
    changesQuery.isLoading,
    changesQuery.isError,
    lookup,
    labels,
    today,
    nowMinute,
    settings.dayStart,
    settings.dayEnd,
    period.from,
    period.to,
    scope,
    loadingGoals,
    goalsError.error,
  ]);
}

export { isRoutineLike };
