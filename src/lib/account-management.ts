import { supabase } from "./supabase/client";
import { queryClient } from "./query-client";
import { clearRecordingState } from "./sport-recording-db";
import { setAppTimeZone } from "./app-time-zone";

async function invokeAccountAction(name: "reset-account" | "delete-account") {
  const { data, error } = await supabase.functions.invoke(name);
  if (error || data?.ok !== true) {
    throw new Error(data?.error || "Não foi possível concluir. Nenhuma conclusão foi confirmada.");
  }
}

async function clearLocalContent(userId: string) {
  try {
    await clearRecordingState();
  } catch {
    /* Server-side deletion has already succeeded. */
  }
  try {
    await queryClient.cancelQueries();
  } catch {
    /* Clear cached data below. */
  }
  queryClient.clear();
  setAppTimeZone(null);
  try {
    for (const storage of [localStorage, sessionStorage]) {
      storage.removeItem(`norte-chat:${userId}`);
      storage.removeItem(`norte-demo-replies:${userId}`);
    }
  } catch {
    // Local storage is unavailable; the server-side content was still erased.
  }
}

const USER_BUCKETS = ["avatars", "sport-photos", "book-covers", "financial-goal-images"];

/** Apaga os arquivos da própria pessoa pelo cliente. Melhor esforço: o que não
 * puder ser listado ou removido não impede o reset do conteúdo. */
async function removeOwnFiles(userId: string) {
  for (const bucket of USER_BUCKETS) {
    const { data } = await supabase.storage.from(bucket).list(userId, { limit: 100 });
    const files = (data ?? []).filter((item) => item.id).map((item) => `${userId}/${item.name}`);
    if (files.length) await supabase.storage.from(bucket).remove(files);
  }
}

/** Reset direto pelo banco, sem a função de servidor. A função SQL só apaga as
 * linhas da PRÓPRIA pessoa (usa o auth.uid() da sessão). Usado quando a função
 * `reset-account` não está publicada ou não responde. */
async function resetViaDatabase(userId: string) {
  try {
    await removeOwnFiles(userId);
  } catch {
    /* Arquivos são melhor esforço; o conteúdo é o que importa. */
  }
  const { error } = await supabase.rpc("reset_my_account_content");
  if (error) throw error;
}

export async function resetAccountContent(userId: string) {
  try {
    await invokeAccountAction("reset-account");
  } catch (cause) {
    try {
      await resetViaDatabase(userId);
    } catch {
      throw cause;
    }
  }
  await clearLocalContent(userId);
}

export async function deleteAccountPermanently(userId: string) {
  await invokeAccountAction("delete-account");
  await clearLocalContent(userId);
  try {
    await supabase.auth.signOut({ scope: "local" });
  } catch {
    // The server has already deleted the identity.
  }
  try {
    localStorage.removeItem("norte_has_account");
    sessionStorage.removeItem("norte-welcome-entered");
    sessionStorage.removeItem("norte-onboarding-stage");
  } catch {
    // The server identity is already gone.
  }
}
