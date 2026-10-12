import { useQuery } from "@tanstack/react-query";
import { supabase, ensureSession, useSupabaseUserId } from "./supabase/client";
import { queryClient } from "./query-client";

// ---------------------------------------------------------------------------
// Rótulos da Agenda (Trabalho, Família, Saúde…). São a forma da PESSOA
// organizar e enxergar o tempo; não substituem a categoria (o significado
// para o sistema) nem o plano. Rótulo usado nunca é apagado: é arquivado, para
// que compromissos antigos continuem com a sua identidade.
// ---------------------------------------------------------------------------

export type AgendaLabel = {
  id: string;
  name: string;
  color: string;
  icon?: string;
  order: number;
  archived: boolean;
  createdAt: string;
};

type Row = Record<string, unknown>;

/** Paleta contida: cores com contraste em fundo escuro, sem virar mosaico. */
export const LABEL_COLORS = [
  "#91f5da", // menta (cor do Norte)
  "#7cb8ff", // azul
  "#b9a1db", // lavanda
  "#f0b867", // âmbar
  "#f08a8a", // coral
  "#8fd694", // verde
  "#e59ad0", // rosa
  "#a3b1bf", // cinza azulado
];

export const LABEL_ICONS = [
  "briefcase",
  "home",
  "heart",
  "user",
  "book",
  "dumbbell",
  "cake",
  "star",
  "plane",
  "users",
] as const;
export type LabelIcon = (typeof LABEL_ICONS)[number];

export const DEFAULT_LABELS: { name: string; color: string; icon: LabelIcon }[] = [
  { name: "Trabalho", color: "#7cb8ff", icon: "briefcase" },
  { name: "Família", color: "#e59ad0", icon: "home" },
  { name: "Saúde", color: "#8fd694", icon: "heart" },
  { name: "Pessoal", color: "#91f5da", icon: "user" },
];

function unwrap<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

function mapLabel(r: Row): AgendaLabel {
  return {
    id: r.id as string,
    name: r.name as string,
    color: r.color as string,
    icon: (r.icon as string | null) ?? undefined,
    order: (r.order_index as number) ?? 0,
    archived: Boolean(r.archived_at),
    createdAt: r.created_at as string,
  };
}

export async function fetchLabels(): Promise<AgendaLabel[]> {
  const { data, error } = await supabase
    .from("agenda_labels")
    .select("*")
    .order("order_index")
    .order("created_at");
  if (error) throw new Error(error.message);
  return (data as Row[]).map(mapLabel);
}

export const LABELS_QUERY_KEY = ["agenda-labels"] as const;

function invalidate() {
  return queryClient.invalidateQueries({ queryKey: LABELS_QUERY_KEY, refetchType: "all" });
}

export function useAgendaLabels(): {
  all: AgendaLabel[];
  active: AgendaLabel[];
  byId: Map<string, AgendaLabel>;
  loading: boolean;
} {
  const userId = useSupabaseUserId();
  const { data, isLoading } = useQuery({
    queryKey: LABELS_QUERY_KEY,
    queryFn: fetchLabels,
    enabled: !!userId,
  });
  const all = data ?? [];
  return {
    all,
    active: all.filter((l) => !l.archived),
    byId: new Map(all.map((l) => [l.id, l])),
    loading: !userId || isLoading,
  };
}

export async function createLabel(input: {
  name: string;
  color: string;
  icon?: string;
}): Promise<string> {
  const userId = await ensureSession();
  const name = input.name.trim();
  if (!name) throw new Error("Dê um nome ao rótulo.");
  const existing = queryClient.getQueryData<AgendaLabel[]>(LABELS_QUERY_KEY) ?? [];
  const row = unwrap<{ id: string }>(
    await supabase
      .from("agenda_labels")
      .insert({
        user_id: userId,
        name,
        color: input.color,
        icon: input.icon ?? null,
        order_index: existing.length,
      })
      .select()
      .single(),
  );
  await invalidate();
  return row.id;
}

/** Oferece o conjunto pequeno e editável — só quando ainda não existe nada. */
export async function createDefaultLabels(): Promise<void> {
  const userId = await ensureSession();
  const existing = await fetchLabels();
  if (existing.length > 0) return;
  unwrap(
    await supabase.from("agenda_labels").insert(
      DEFAULT_LABELS.map((l, index) => ({
        user_id: userId,
        name: l.name,
        color: l.color,
        icon: l.icon,
        order_index: index,
      })),
    ),
  );
  await invalidate();
}

export async function updateLabel(
  id: string,
  patch: { name?: string; color?: string; icon?: string | null },
): Promise<void> {
  const dbPatch: Row = {};
  if (patch.name !== undefined) {
    if (!patch.name.trim()) throw new Error("Dê um nome ao rótulo.");
    dbPatch.name = patch.name.trim();
  }
  if (patch.color !== undefined) dbPatch.color = patch.color;
  if (patch.icon !== undefined) dbPatch.icon = patch.icon;
  if (Object.keys(dbPatch).length === 0) return;
  unwrap(await supabase.from("agenda_labels").update(dbPatch).eq("id", id).select().single());
  await invalidate();
}

export async function archiveLabel(id: string): Promise<void> {
  unwrap(
    await supabase
      .from("agenda_labels")
      .update({ archived_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single(),
  );
  await invalidate();
}

export async function restoreLabel(id: string): Promise<void> {
  unwrap(
    await supabase
      .from("agenda_labels")
      .update({ archived_at: null })
      .eq("id", id)
      .select()
      .single(),
  );
  await invalidate();
}

/** Grava a nova ordem: o primeiro id da lista vira a posição 0. */
export async function reorderLabels(orderedIds: string[]): Promise<void> {
  await Promise.all(
    orderedIds.map((id, index) =>
      supabase.from("agenda_labels").update({ order_index: index }).eq("id", id),
    ),
  );
  await invalidate();
}

/** Cor do rótulo com transparência — fundo discreto, nunca saturado. */
export function labelTint(color: string, alpha: number): string {
  const hex = color.replace("#", "");
  const n = parseInt(hex, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
