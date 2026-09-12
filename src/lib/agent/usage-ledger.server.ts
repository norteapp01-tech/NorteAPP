/**
 * Registro real de consumo de IA — resolve a lacuna apontada no documento de
 * arquitetura do Norte Admin: agentStep lia a resposta da OpenAI e descartava
 * usage/custo. Roda só no servidor.
 *
 * Sem service_role em lugar nenhum: o servidor verifica o token da própria
 * pessoa contra a Supabase Auth, e grava a tentativa EM NOME dela — a mesma
 * política de RLS (`auth.uid() = user_id`) que protege o resto do app também
 * protege este ledger. Falha ao registrar nunca derruba a resposta ao usuário:
 * é sempre "melhor esforço", best-effort.
 */

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;

/** Verifica um access token contra a Supabase Auth e devolve o user id real,
 * ou null se o token for ausente/inválido. Nunca lança — chamador decide o que
 * fazer com null (aqui, sempre "não registra custo", nunca "bloqueia a resposta"). */
export async function verifyAccessToken(accessToken: string | undefined): Promise<string | null> {
  if (!accessToken || !SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${accessToken}`, apikey: SUPABASE_ANON_KEY },
    });
    if (!res.ok) return null;
    const json = await res.json();
    return typeof json?.id === "string" ? json.id : null;
  } catch {
    return null;
  }
}

export type UsageComponent = { unit: string; quantity: number };

export async function recordAiAttempt(params: {
  accessToken: string;
  userId: string;
  requestId: string;
  feature: "agent_chat" | "transcription";
  model: string;
  status: "succeeded" | "failed";
  startedAt: string;
  finishedAt: string;
  latencyMs: number;
  errorMessage?: string;
  components: UsageComponent[];
}): Promise<void> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return;
  try {
    const headers = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${params.accessToken}`,
      apikey: SUPABASE_ANON_KEY,
      Prefer: "return=representation",
    };
    const attemptRes = await fetch(`${SUPABASE_URL}/rest/v1/ai_attempts`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        request_id: params.requestId,
        user_id: params.userId,
        feature: params.feature,
        model: params.model,
        status: params.status,
        started_at: params.startedAt,
        finished_at: params.finishedAt,
        latency_ms: params.latencyMs,
        error_message: params.errorMessage,
      }),
    });
    if (!attemptRes.ok) return;
    const [attempt] = (await attemptRes.json()) as { id: string }[];
    if (!attempt?.id || !params.components.length) return;

    await fetch(`${SUPABASE_URL}/rest/v1/ai_usage_components`, {
      method: "POST",
      headers,
      body: JSON.stringify(
        params.components.map((c) => ({
          attempt_id: attempt.id,
          unit: c.unit,
          quantity: c.quantity,
        })),
      ),
    });
  } catch {
    // Best-effort: um problema aqui nunca deve derrubar a resposta ao usuário.
  }
}
