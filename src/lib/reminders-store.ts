import { useQuery } from "@tanstack/react-query";
import { supabase, ensureSession, useSupabaseUserId } from "./supabase/client";
import { queryClient } from "./query-client";
import { todayISO, toISODate, addDays } from "./goals-store";
import { nowDate } from "./test-clock";

// ---------------------------------------------------------------------------
// Lembretes — avisos pontuais, independentes de Plano/Etapa/Execução. Mesmo
// padrão de store por domínio já usado no app (uma tabela, um QUERY_KEY,
// invalidate() com refetchType:"all" pra funcionar mesmo sem observador ativo
// no momento da mutação — ver o comentário equivalente em goals-store.ts).
// ---------------------------------------------------------------------------

export type Reminder = {
  id: string;
  text: string;
  date: string; // YYYY-MM-DD
  done: boolean;
  createdAt: string;
  updatedAt: string;
};

type Row = Record<string, unknown>;

function unwrap<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

function mapReminder(r: Row): Reminder {
  return {
    id: r.id as string,
    text: r.text as string,
    date: r.date as string,
    done: r.done as boolean,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}

/** Exportado só pra teste poder registrar a mesma queryFn real via prefetchQuery
 * — sem isso, um refetch pós-invalidate não teria queryFn associada. */
export async function fetchState(): Promise<Reminder[]> {
  const userId = await ensureSession();
  const { data, error } = await supabase
    .from("reminders")
    .select("*")
    .eq("user_id", userId)
    .order("date", { ascending: true });
  if (error) throw new Error(error.message);
  return (data as Row[]).map(mapReminder);
}

const QUERY_KEY = ["reminders-domain"] as const;

function invalidate() {
  return queryClient.invalidateQueries({ queryKey: QUERY_KEY, refetchType: "all" });
}

export function useRemindersStore<T>(selector: (reminders: Reminder[]) => T): T {
  const userId = useSupabaseUserId();
  const { data } = useQuery({ queryKey: QUERY_KEY, queryFn: fetchState, enabled: !!userId });
  return selector(data ?? []);
}

export function useRemindersLoading(): boolean {
  const userId = useSupabaseUserId();
  const { isLoading, isFetching } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: fetchState,
    enabled: !!userId,
  });
  return !userId || isLoading || isFetching;
}

// ---------------------------------------------------------------------------
// Seletores puros
// ---------------------------------------------------------------------------

export type ReminderStatus = "atrasado" | "hoje" | "proximo" | "concluido";

export function reminderStatus(r: Reminder, todayIso = todayISO()): ReminderStatus {
  if (r.done) return "concluido";
  if (r.date < todayIso) return "atrasado";
  if (r.date === todayIso) return "hoje";
  return "proximo";
}

export function overdueReminders(reminders: Reminder[], todayIso = todayISO()): Reminder[] {
  return reminders
    .filter((r) => reminderStatus(r, todayIso) === "atrasado")
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function todayReminders(reminders: Reminder[], todayIso = todayISO()): Reminder[] {
  return reminders.filter((r) => reminderStatus(r, todayIso) === "hoje");
}

export function upcomingReminders(reminders: Reminder[], todayIso = todayISO()): Reminder[] {
  return reminders
    .filter((r) => reminderStatus(r, todayIso) === "proximo")
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** Concluídos recentemente — mais recentes primeiro, por updatedAt (quando foram marcados). */
export function recentlyCompletedReminders(reminders: Reminder[], limit = 10): Reminder[] {
  return reminders
    .filter((r) => r.done)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, limit);
}

/** Conjunto em destaque no card compacto: atrasados primeiro, depois hoje — nunca datas
 * futuras (essas só aparecem na lista expandida, "Próximos"). */
export function highlightedReminders(reminders: Reminder[], todayIso = todayISO()): Reminder[] {
  return [...overdueReminders(reminders, todayIso), ...todayReminders(reminders, todayIso)];
}

const WEEKDAY_NAMES = [
  "Domingo",
  "Segunda-feira",
  "Terça-feira",
  "Quarta-feira",
  "Quinta-feira",
  "Sexta-feira",
  "Sábado",
];

/** "YYYY-MM-DD" -> "Hoje"/"Amanhã"/"<Dia da semana>"/"DD/MM" — split de string e
 * aritmética de data local, nunca `new Date(iso)` direto (evita erro de fuso). */
export function formatRelativeDate(iso: string, todayIso = todayISO()): string {
  if (iso === todayIso) return "Hoje";
  const tomorrow = toISODate(addDays(nowDate(), 1));
  if (iso === tomorrow) return "Amanhã";
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  const [ty, tm, td] = todayIso.split("-").map(Number);
  const today = new Date(ty, tm - 1, td);
  const diffDays = Math.round((date.getTime() - today.getTime()) / 86400000);
  if (diffDays > 1 && diffDays <= 6) return WEEKDAY_NAMES[date.getDay()];
  const [, mm, dd] = iso.split("-");
  return `${dd}/${mm}`;
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export async function createReminder(input: { text: string; date: string }): Promise<string> {
  const userId = await ensureSession();
  const row = unwrap<{ id: string }>(
    await supabase
      .from("reminders")
      .insert({ user_id: userId, text: input.text, date: input.date })
      .select()
      .single(),
  );
  await invalidate();
  return row.id as string;
}

/** Atualização otimista: marca o cache antes do round-trip (feedback imediato no
 * card de todo dia), com rollback se o Supabase falhar. */
export async function toggleReminder(id: string, currentlyDone: boolean) {
  const nowDone = !currentlyDone;
  const previous = queryClient.getQueryData<Reminder[]>(QUERY_KEY);
  if (previous) {
    queryClient.setQueryData<Reminder[]>(
      QUERY_KEY,
      previous.map((r) => (r.id === id ? { ...r, done: nowDone } : r)),
    );
  }
  try {
    unwrap(
      await supabase.from("reminders").update({ done: nowDone }).eq("id", id).select().single(),
    );
    await invalidate();
  } catch (err) {
    if (previous) queryClient.setQueryData(QUERY_KEY, previous);
    throw err;
  }
}

export async function updateReminder(
  id: string,
  patch: { text?: string; date?: string },
): Promise<void> {
  const dbPatch: Row = {};
  if (patch.text !== undefined) dbPatch.text = patch.text;
  if (patch.date !== undefined) dbPatch.date = patch.date;
  unwrap(await supabase.from("reminders").update(dbPatch).eq("id", id).select().single());
  await invalidate();
}

export async function removeReminder(id: string): Promise<void> {
  await supabase.from("reminders").delete().eq("id", id);
  await invalidate();
}
