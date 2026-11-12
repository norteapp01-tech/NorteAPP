import { supabase, ensureSession } from "../supabase/client";
import { reconcileHabitReminders } from "./store";
export type HabitPreferences = {
  quiet_start: string | null;
  quiet_end: string | null;
  briefing_time: string | null;
  closing_time: string | null;
};
export const DEFAULT_PREFERENCES: HabitPreferences = {
  quiet_start: null,
  quiet_end: null,
  briefing_time: null,
  closing_time: null,
};
export async function loadHabitPreferences(): Promise<HabitPreferences> {
  const user = await ensureSession();
  const { data, error } = await supabase
    .from("habit_settings")
    .select("quiet_start,quiet_end,briefing_time,closing_time")
    .eq("user_id", user)
    .maybeSingle();
  if (error) throw error;
  return data ?? DEFAULT_PREFERENCES;
}
export async function saveHabitPreferences(settings: HabitPreferences) {
  const time = /^([01]\d|2[0-3]):[0-5]\d$/;
  if (Object.values(settings).some((v) => v !== null && !time.test(v)))
    throw new Error("Confira os horários.");
  if (Boolean(settings.quiet_start) !== Boolean(settings.quiet_end))
    throw new Error("Informe o início e o fim do silêncio.");
  const user = await ensureSession();
  const { error } = await supabase
    .from("habit_settings")
    .upsert({ ...settings, user_id: user }, { onConflict: "user_id" });
  if (error) throw error;
  await reconcileHabitReminders();
}
const EXPORT_TABLES = [
  "habits",
  "habit_versions",
  "habit_logs",
  "habit_pauses",
  "habit_chains",
  "habit_reminders",
  "habit_reflections",
  "habit_settings",
] as const;
export async function exportHabitData() {
  const user = await ensureSession();
  const result: Record<string, unknown[]> = {};
  for (const table of EXPORT_TABLES) {
    const rows: unknown[] = [];
    for (let offset = 0; ; offset += 500) {
      const { data, error } = await supabase
        .from(table)
        .select("*")
        .eq("user_id", user)
        .order(table === "habit_settings" ? "user_id" : "id")
        .range(offset, offset + 499);
      if (error) throw error;
      rows.push(...data);
      if (data.length < 500) break;
    }
    result[table] = rows;
  }
  return { format: "norte-habits", version: 1, exportedAt: new Date().toISOString(), data: result };
}
