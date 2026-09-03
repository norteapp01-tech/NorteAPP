import { useQuery } from "@tanstack/react-query";
import { supabase, useSupabaseUserId, ensureSession } from "./supabase/client";
import { queryClient } from "./query-client";

// ---------------------------------------------------------------------------
// Perfil — uma linha por usuário (Perfil + Preferências + Notificações, tudo
// 1:1, sem motivo pra fragmentar). Mesmo padrão de goals-store.ts.
// ---------------------------------------------------------------------------

export type TimeFormat = "24h" | "12h";
export type WeekStart = "monday" | "sunday";

export type Profile = {
  displayName: string | null;
  birthDate: string | null;
  avatarPath: string | null;
  waterGoalMl: number;
  timeFormat: TimeFormat;
  weekStart: WeekStart;
  notifyAgenda: boolean;
  notifyPlans: boolean;
  notifyRoutines: boolean;
  notifyReminders: boolean;
};

const DEFAULT_PROFILE: Profile = {
  displayName: null,
  birthDate: null,
  avatarPath: null,
  waterGoalMl: 2000,
  timeFormat: "24h",
  weekStart: "monday",
  notifyAgenda: true,
  notifyPlans: true,
  notifyRoutines: true,
  notifyReminders: true,
};

type Row = Record<string, unknown>;

function mapProfile(r: Row): Profile {
  return {
    displayName: (r.display_name as string) ?? null,
    birthDate: (r.birth_date as string) ?? null,
    avatarPath: (r.avatar_path as string) ?? null,
    waterGoalMl: (r.water_goal_ml as number) ?? 2000,
    timeFormat: (r.time_format as TimeFormat) ?? "24h",
    weekStart: (r.week_start as WeekStart) ?? "monday",
    notifyAgenda: (r.notify_agenda as boolean) ?? true,
    notifyPlans: (r.notify_plans as boolean) ?? true,
    notifyRoutines: (r.notify_routines as boolean) ?? true,
    notifyReminders: (r.notify_reminders as boolean) ?? true,
  };
}

async function fetchProfile(): Promise<Profile> {
  const userId = await ensureSession();
  // upsert com só o user_id não sobrescreve colunas existentes (DO UPDATE SET
  // user_id=user_id, um no-op) — cria a linha com os defaults só no primeiro
  // acesso, sem duas chamadas nem corrida entre elas.
  const { data, error } = await supabase
    .from("profiles")
    .upsert({ user_id: userId }, { onConflict: "user_id" })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return mapProfile(data);
}

const QUERY_KEY = ["profile"] as const;

export function useProfile(): Profile {
  const userId = useSupabaseUserId();
  const { data } = useQuery({ queryKey: QUERY_KEY, queryFn: fetchProfile, enabled: !!userId });
  return data ?? DEFAULT_PROFILE;
}

export function useProfileLoading(): boolean {
  const userId = useSupabaseUserId();
  const { isLoading } = useQuery({ queryKey: QUERY_KEY, queryFn: fetchProfile, enabled: !!userId });
  return !userId || isLoading;
}

export async function updateProfile(patch: {
  displayName?: string | null;
  birthDate?: string | null;
  avatarPath?: string | null;
  waterGoalMl?: number;
  timeFormat?: TimeFormat;
  weekStart?: WeekStart;
  notifyAgenda?: boolean;
  notifyPlans?: boolean;
  notifyRoutines?: boolean;
  notifyReminders?: boolean;
}) {
  const userId = await ensureSession();
  const dbPatch: Row = {};
  if (patch.displayName !== undefined) dbPatch.display_name = patch.displayName;
  if (patch.birthDate !== undefined) dbPatch.birth_date = patch.birthDate;
  if (patch.avatarPath !== undefined) dbPatch.avatar_path = patch.avatarPath;
  if (patch.waterGoalMl !== undefined) dbPatch.water_goal_ml = patch.waterGoalMl;
  if (patch.timeFormat !== undefined) dbPatch.time_format = patch.timeFormat;
  if (patch.weekStart !== undefined) dbPatch.week_start = patch.weekStart;
  if (patch.notifyAgenda !== undefined) dbPatch.notify_agenda = patch.notifyAgenda;
  if (patch.notifyPlans !== undefined) dbPatch.notify_plans = patch.notifyPlans;
  if (patch.notifyRoutines !== undefined) dbPatch.notify_routines = patch.notifyRoutines;
  if (patch.notifyReminders !== undefined) dbPatch.notify_reminders = patch.notifyReminders;

  const { error } = await supabase
    .from("profiles")
    .upsert({ user_id: userId, ...dbPatch }, { onConflict: "user_id" });
  if (error) throw new Error(error.message);
  await queryClient.invalidateQueries({ queryKey: QUERY_KEY });
}

/** Idade sempre derivada — nunca um campo próprio. */
export function ageFromBirthDate(birthDate: string | null): number | null {
  if (!birthDate) return null;
  const birth = new Date(birthDate + "T00:00:00");
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const hadBirthdayThisYear =
    now.getMonth() > birth.getMonth() ||
    (now.getMonth() === birth.getMonth() && now.getDate() >= birth.getDate());
  if (!hadBirthdayThisYear) age -= 1;
  return age;
}

export function greeting(date = new Date()): string {
  const hour = date.getHours();
  if (hour < 12) return "Bom dia";
  if (hour < 18) return "Boa tarde";
  return "Boa noite";
}
