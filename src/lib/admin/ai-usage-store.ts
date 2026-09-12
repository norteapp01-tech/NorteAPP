import { supabase } from "@/lib/supabase/client";

// ---------------------------------------------------------------------------
// Economia da IA — leitura real do ledger (ai_attempts/ai_usage_components).
// Protegido por RLS (só admin lê). Sem tarifa cadastrada em model_price_versions,
// custo aparece explicitamente como "não precificado" — nunca zero, nunca
// inventado. Ver 0028_admin_foundation.sql.
// ---------------------------------------------------------------------------

export type AiUsageComponent = { unit: string; quantity: number; costUsd: number | null };
export type AiAttempt = {
  id: string;
  requestId: string;
  userId: string;
  feature: "agent_chat" | "transcription";
  provider: string;
  model: string;
  status: "succeeded" | "failed" | "pending";
  startedAt: string;
  finishedAt: string | null;
  latencyMs: number | null;
  errorMessage: string | null;
  createdAt: string;
  components: AiUsageComponent[];
};

type Row = Record<string, unknown>;

function mapAttempt(r: Row): AiAttempt {
  const components = ((r.ai_usage_components as Row[]) ?? []).map((c) => ({
    unit: c.unit as string,
    quantity: Number(c.quantity),
    costUsd: c.cost_usd === null || c.cost_usd === undefined ? null : Number(c.cost_usd),
  }));
  return {
    id: r.id as string,
    requestId: r.request_id as string,
    userId: r.user_id as string,
    feature: r.feature as "agent_chat" | "transcription",
    provider: r.provider as string,
    model: r.model as string,
    status: r.status as "succeeded" | "failed" | "pending",
    startedAt: r.started_at as string,
    finishedAt: (r.finished_at as string) ?? null,
    latencyMs: (r.latency_ms as number) ?? null,
    errorMessage: (r.error_message as string) ?? null,
    createdAt: r.created_at as string,
    components,
  };
}

/** Últimas N tentativas, mais recentes primeiro — usado pela tela /admin/ia. */
export async function fetchRecentAiAttempts(limit = 200): Promise<AiAttempt[]> {
  const { data, error } = await supabase
    .from("ai_attempts")
    .select("*, ai_usage_components(unit, quantity, cost_usd)")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data as Row[]).map(mapAttempt);
}

export type AiUsageSummary = {
  totalAttempts: number;
  succeeded: number;
  failed: number;
  byUnit: Record<string, number>;
  pricedCostUsd: number;
  unpricedComponentCount: number;
  uniqueUsers: number;
};

/** Soma pura — sem inventar preço. Componentes sem cost_usd entram em
 * "unpricedComponentCount", nunca somados como zero. */
export function summarizeAiUsage(attempts: AiAttempt[]): AiUsageSummary {
  const byUnit: Record<string, number> = {};
  let pricedCostUsd = 0;
  let unpricedComponentCount = 0;
  const users = new Set<string>();
  for (const attempt of attempts) {
    users.add(attempt.userId);
    for (const c of attempt.components) {
      byUnit[c.unit] = (byUnit[c.unit] ?? 0) + c.quantity;
      if (c.costUsd === null) unpricedComponentCount += 1;
      else pricedCostUsd += c.costUsd;
    }
  }
  return {
    totalAttempts: attempts.length,
    succeeded: attempts.filter((a) => a.status === "succeeded").length,
    failed: attempts.filter((a) => a.status === "failed").length,
    byUnit,
    pricedCostUsd,
    unpricedComponentCount,
    uniqueUsers: users.size,
  };
}
