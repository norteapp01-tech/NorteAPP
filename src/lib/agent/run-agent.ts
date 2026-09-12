import { agentStep } from "./chat.functions";
import { runAgentTurnWith, type ChatTurn } from "./orchestrator";
import { executeTool } from "./tools";
import { getAccessToken } from "@/lib/supabase/client";

export type { ChatTurn } from "./orchestrator";

/** Liga o orquestrador testável ao modelo e às stores reais do aplicativo. O
 * token de acesso vai junto em cada chamada pra o servidor poder registrar o
 * consumo real de IA em nome de quem está conversando (ver usage-ledger.server.ts). */
export async function runAgentTurn(history: ChatTurn[], userMessage: string): Promise<ChatTurn> {
  const accessToken = await getAccessToken();
  return runAgentTurnWith(history, userMessage, {
    step: (input) => agentStep({ data: { ...input.data, accessToken } }),
    execute: executeTool,
  });
}
