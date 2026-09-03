import { useQuery } from "@tanstack/react-query";
import { supabase, useSupabaseUserId, ensureSession } from "./supabase/client";
import { queryClient } from "./query-client";
import { toISODate, todayISO } from "./goals-store";

// ---------------------------------------------------------------------------
// Hidratação — registros reais por dia/horário, meta lida do perfil
// (profiles.water_goal_ml). "Desfazer" apaga literalmente o último registro
// do dia, preservando o histórico real dos demais.
// ---------------------------------------------------------------------------

export type HydrationLog = { id: string; date: string; amountMl: number; loggedAt: string };

type Row = Record<string, unknown>;
function mapLog(r: Row): HydrationLog {
  return {
    id: r.id as string,
    date: r.date as string,
    amountMl: r.amount_ml as number,
    loggedAt: r.logged_at as string,
  };
}

async function fetchTodayLogs(): Promise<HydrationLog[]> {
  const userId = await ensureSession();
  const { data, error } = await supabase
    .from("hydration_logs")
    .select("*")
    .eq("user_id", userId)
    .eq("date", todayISO())
    .order("logged_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data as Row[]).map(mapLog);
}

const QUERY_KEY = ["hydration-today", toISODate(new Date())] as const;

export function useTodayHydration(): HydrationLog[] {
  const userId = useSupabaseUserId();
  const { data } = useQuery({ queryKey: QUERY_KEY, queryFn: fetchTodayLogs, enabled: !!userId });
  return data ?? [];
}

export function todayIntake(logs: HydrationLog[]): number {
  return logs.reduce((sum, l) => sum + l.amountMl, 0);
}

export async function addWater(amountMl: number) {
  const userId = await ensureSession();
  const { error } = await supabase
    .from("hydration_logs")
    .insert({ user_id: userId, date: todayISO(), amount_ml: amountMl });
  if (error) throw new Error(error.message);
  await queryClient.invalidateQueries({ queryKey: QUERY_KEY });
}

/** Apaga o último registro de hoje — corrige toque acidental sem mexer no resto do histórico. */
export async function undoLastLog(logs: HydrationLog[]) {
  const last = logs[logs.length - 1];
  if (!last) return;
  const { error } = await supabase.from("hydration_logs").delete().eq("id", last.id);
  if (error) throw new Error(error.message);
  await queryClient.invalidateQueries({ queryKey: QUERY_KEY });
}
