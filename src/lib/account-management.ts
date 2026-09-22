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

export async function resetAccountContent(userId: string) {
  await invokeAccountAction("reset-account");
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
