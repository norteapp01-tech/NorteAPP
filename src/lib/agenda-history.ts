import { supabase } from "./supabase/client";

// ---------------------------------------------------------------------------
// Histórico essencial de um compromisso, lido de `agenda_changes`.
//
// Só o que foi PLANEJADO e decidido fica aqui. Duração real não existe: o app
// não sabe quanto tempo a pessoa de fato gastou, e não inventa.
// ---------------------------------------------------------------------------

export type AgendaChangeRow = {
  at: string;
  kind: string;
  fromDate?: string;
  fromStart?: string;
  toDate?: string;
  toStart?: string;
  toEnd?: string;
};

export async function fetchExecutionChanges(executionId: string): Promise<AgendaChangeRow[]> {
  const { data, error } = await supabase
    .from("agenda_changes")
    .select("*")
    .eq("execution_id", executionId)
    .order("at");
  if (error) throw new Error(error.message);
  return (data as Record<string, unknown>[]).map((r) => ({
    at: r.at as string,
    kind: r.kind as string,
    fromDate: (r.from_date as string | null) ?? undefined,
    fromStart: (r.from_start as string | null) ?? undefined,
    toDate: (r.to_date as string | null) ?? undefined,
    toStart: (r.to_start as string | null) ?? undefined,
    toEnd: (r.to_end as string | null) ?? undefined,
  }));
}

export type HistorySummary = {
  rescheduleCount: number;
  /** Primeiro horário combinado, antes de qualquer mudança. */
  original?: { date: string; start: string };
  completedAt?: string;
  cancelledAt?: string;
};

export function summarizeHistory(changes: AgendaChangeRow[]): HistorySummary {
  const first = changes.find((c) => c.kind === "scheduled" || c.kind === "moved");
  const original = first
    ? first.kind === "scheduled"
      ? first.toDate && first.toStart
        ? { date: first.toDate, start: first.toStart }
        : undefined
      : first.fromDate && first.fromStart
        ? { date: first.fromDate, start: first.fromStart }
        : undefined
    : undefined;
  const last = (kind: string) => [...changes].reverse().find((c) => c.kind === kind)?.at;
  return {
    rescheduleCount: changes.filter((c) => c.kind === "moved").length,
    original,
    completedAt: last("completed"),
    cancelledAt: last("cancelled"),
  };
}
