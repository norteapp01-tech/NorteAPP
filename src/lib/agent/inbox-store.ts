import { useQuery } from "@tanstack/react-query";
import { supabase, ensureSession, useSupabaseUserId } from "../supabase/client";
import { queryClient } from "../query-client";

// ---------------------------------------------------------------------------
// Caixa Norte — captura universal do Agente Norte. Qualquer frase que ainda não
// pertence claramente a um domínio (ideia, pendência, promessa, "lembrar disso
// depois") entra aqui sem forçar classificação na hora — revisão acontece depois,
// nunca na captura. Mesmo padrão de store por domínio já usado no app.
// ---------------------------------------------------------------------------

export type InboxItem = {
  id: string;
  content: string;
  source: "agente" | "app";
  resolved: boolean;
  createdAt: string;
};

type Row = Record<string, unknown>;

function unwrap<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

function mapItem(r: Row): InboxItem {
  return {
    id: r.id as string,
    content: r.content as string,
    source: r.source as "agente" | "app",
    resolved: r.resolved as boolean,
    createdAt: r.created_at as string,
  };
}

export async function fetchState(): Promise<InboxItem[]> {
  const userId = await ensureSession();
  const { data, error } = await supabase
    .from("agent_inbox_items")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data as Row[]).map(mapItem);
}

const QUERY_KEY = ["agent-inbox-domain"] as const;

function invalidate() {
  return queryClient.invalidateQueries({ queryKey: QUERY_KEY, refetchType: "all" });
}

export function useInboxStore<T>(selector: (items: InboxItem[]) => T): T {
  const userId = useSupabaseUserId();
  const { data } = useQuery({ queryKey: QUERY_KEY, queryFn: fetchState, enabled: !!userId });
  return selector(data ?? []);
}

export function pendingInboxItems(items: InboxItem[]): InboxItem[] {
  return items.filter((i) => !i.resolved);
}

export async function captureToInbox(
  content: string,
  source: "agente" | "app" = "agente",
): Promise<string> {
  const userId = await ensureSession();
  const row = unwrap<{ id: string }>(
    await supabase
      .from("agent_inbox_items")
      .insert({ user_id: userId, content: content.trim(), source })
      .select()
      .single(),
  );
  await invalidate();
  return row.id;
}

export async function resolveInboxItem(id: string): Promise<void> {
  unwrap(
    await supabase
      .from("agent_inbox_items")
      .update({ resolved: true })
      .eq("id", id)
      .select()
      .single(),
  );
  await invalidate();
}

export async function removeInboxItem(id: string): Promise<void> {
  await supabase.from("agent_inbox_items").delete().eq("id", id);
  await invalidate();
}
