import { useQuery } from "@tanstack/react-query";
import { supabase, ensureSession, useSupabaseUserId } from "./supabase/client";
import { queryClient } from "./query-client";
import { getAppTimeZone, zonedTimeToUtcISO } from "./app-time-zone";
import { nowMs } from "./test-clock";

// ---------------------------------------------------------------------------
// Alertas de compromisso.
//
// Não existe um segundo sistema de avisos: cada alerta é uma linha da MESMA
// tabela `reminders` (e portanto da mesma entrega por push), marcada com
// `origin = 'agenda_alert'` para não aparecer no cartão de lembretes.
//
// O alerta ACOMPANHA o compromisso: guardamos só "quantos minutos antes" e
// recalculamos o instante de disparo sempre que o horário muda.
// ---------------------------------------------------------------------------

type Row = Record<string, unknown>;

export type AgendaAlert = {
  id: string;
  executionId?: string;
  seriesId?: string;
  occurrenceDate?: string;
  offsetMinutes: number;
  remindAt?: string;
  notifiedAt?: string;
};

/** Alertas de dia inteiro contam a partir deste horário. */
const ALL_DAY_BASE = "09:00";

function zone(): string {
  return getAppTimeZone() ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/** Instante de disparo: início do compromisso no fuso do app, menos o antecedente. */
export function remindAtFor(
  date: string,
  startTime: string | undefined,
  offsetMinutes: number,
): string {
  const base = zonedTimeToUtcISO(date, startTime || ALL_DAY_BASE, zone());
  return new Date(new Date(base).getTime() - offsetMinutes * 60_000).toISOString();
}

function mapAlert(r: Row): AgendaAlert {
  return {
    id: r.id as string,
    executionId: (r.related_execution_id as string | null) ?? undefined,
    seriesId: (r.related_series_id as string | null) ?? undefined,
    occurrenceDate: (r.related_occurrence_date as string | null) ?? undefined,
    offsetMinutes: (r.offset_minutes as number) ?? 0,
    remindAt: (r.remind_at as string | null) ?? undefined,
    notifiedAt: (r.notified_at as string | null) ?? undefined,
  };
}

export async function fetchAgendaAlerts(): Promise<AgendaAlert[]> {
  const { data, error } = await supabase.from("reminders").select("*").eq("origin", "agenda_alert");
  if (error) throw new Error(error.message);
  return (data as Row[]).map(mapAlert);
}

export const ALERTS_QUERY_KEY = ["agenda-alerts"] as const;

function invalidate() {
  return queryClient.invalidateQueries({ queryKey: ALERTS_QUERY_KEY, refetchType: "all" });
}

export function useAgendaAlerts(): {
  alerts: AgendaAlert[];
  forExecution: (id: string | undefined) => number[];
} {
  const userId = useSupabaseUserId();
  const { data } = useQuery({
    queryKey: ALERTS_QUERY_KEY,
    queryFn: fetchAgendaAlerts,
    enabled: !!userId,
  });
  const alerts = data ?? [];
  return {
    alerts,
    forExecution: (id) =>
      id
        ? alerts
            .filter((a) => a.executionId === id)
            .map((a) => a.offsetMinutes)
            .sort((a, b) => a - b)
        : [],
  };
}

function uniqueSorted(offsets: number[]): number[] {
  return [...new Set(offsets.filter((n) => Number.isFinite(n) && n >= 0))].sort((a, b) => a - b);
}

/** Troca todos os alertas de um compromisso pelos informados. */
export async function setExecutionAlerts(
  execution: { id: string; title: string; date: string; startTime?: string; seriesId?: string },
  offsets: number[],
): Promise<void> {
  const userId = await ensureSession();
  await supabase
    .from("reminders")
    .delete()
    .eq("related_execution_id", execution.id)
    .eq("origin", "agenda_alert");
  const wanted = uniqueSorted(offsets);
  if (wanted.length > 0) {
    const rows = wanted.map((offset) => ({
      user_id: userId,
      text: execution.title,
      date: execution.date,
      remind_at: remindAtFor(execution.date, execution.startTime, offset),
      related_execution_id: execution.id,
      related_series_id: execution.seriesId ?? null,
      offset_minutes: offset,
      origin: "agenda_alert",
    }));
    const { error } = await supabase.from("reminders").insert(rows);
    if (error) throw new Error(error.message);
  }
  await invalidate();
}

/** O compromisso mudou de horário: os alertas seguem junto e voltam a valer. */
export async function shiftExecutionAlerts(
  executionId: string,
  title: string,
  date: string,
  startTime: string | undefined,
): Promise<void> {
  try {
    const { data } = await supabase
      .from("reminders")
      .select("id, offset_minutes")
      .eq("related_execution_id", executionId)
      .eq("origin", "agenda_alert");
    const rows = (data ?? []) as Row[];
    if (rows.length === 0) return;
    await Promise.all(
      rows.map((r) =>
        supabase
          .from("reminders")
          .update({
            text: title,
            date,
            remind_at: remindAtFor(date, startTime, (r.offset_minutes as number) ?? 0),
            // Mudou o horário: ainda não avisamos por este novo horário.
            notified_at: null,
          })
          .eq("id", r.id as string),
      ),
    );
    await invalidate();
  } catch {
    // Alerta é acessório: nunca impede mover o compromisso.
  }
}

export async function removeExecutionAlerts(executionId: string): Promise<void> {
  await supabase
    .from("reminders")
    .delete()
    .eq("related_execution_id", executionId)
    .eq("origin", "agenda_alert");
  await invalidate();
}

/** Liga os alertas já criados para uma ocorrência de série ao compromisso real
 * que acabou de nascer dela. */
export async function adoptSeriesAlerts(
  seriesId: string,
  occurrenceDate: string,
  executionId: string,
): Promise<void> {
  await supabase
    .from("reminders")
    .update({ related_execution_id: executionId })
    .eq("related_series_id", seriesId)
    .eq("related_occurrence_date", occurrenceDate)
    .eq("origin", "agenda_alert");
}

/** Recria os alertas das próximas ocorrências de uma série. Só olha para a
 * janela curta à frente — alerta de daqui a meses é ruído e se refaz sozinho. */
export async function syncSeriesAlerts(input: {
  seriesId: string;
  title: string;
  startTime?: string;
  alerts: number[];
  /** Datas (pela regra) já calculadas na janela, sem as removidas/tocadas. */
  dates: string[];
}): Promise<void> {
  const userId = await ensureSession();
  await supabase
    .from("reminders")
    .delete()
    .eq("related_series_id", input.seriesId)
    .eq("origin", "agenda_alert")
    .is("related_execution_id", null);
  const wanted = uniqueSorted(input.alerts);
  if (wanted.length === 0 || input.dates.length === 0) {
    await invalidate();
    return;
  }
  const now = nowMs();
  const rows = input.dates.flatMap((date) =>
    wanted
      .map((offset) => ({ offset, at: remindAtFor(date, input.startTime, offset) }))
      .filter(({ at }) => new Date(at).getTime() > now)
      .map(({ offset, at }) => ({
        user_id: userId,
        text: input.title,
        date,
        remind_at: at,
        related_series_id: input.seriesId,
        related_occurrence_date: date,
        offset_minutes: offset,
        origin: "agenda_alert",
      })),
  );
  if (rows.length > 0) {
    const { error } = await supabase.from("reminders").insert(rows);
    if (error) throw new Error(error.message);
  }
  await invalidate();
}
