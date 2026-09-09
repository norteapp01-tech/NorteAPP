import { agentStep } from "./chat.functions";
import { runAgentTurnWith, type ChatTurn } from "./orchestrator";
import { executeTool } from "./tools";

export type { ChatTurn } from "./orchestrator";

/** Liga o orquestrador testável ao modelo e às stores reais do aplicativo. */
export function runAgentTurn(history: ChatTurn[], userMessage: string): Promise<ChatTurn> {
  return runAgentTurnWith(history, userMessage, { step: agentStep, execute: executeTool });
}
