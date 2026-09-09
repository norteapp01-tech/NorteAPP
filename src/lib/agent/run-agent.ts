import { agentStep, type AgentMessage } from "./chat.functions";
import { executeTool } from "./tools";

export type ChatTurn = {
  role: "user" | "assistant";
  text: string;
  /** Ferramentas chamadas nesse turno — só pra depurar o fluxo na tela de teste. */
  toolTrace?: { name: string; args: Record<string, unknown>; result: string }[];
};

const MAX_TOOL_ROUNDS = 5;

/** Roda o loop completo: manda a conversa, executa as ferramentas que o modelo
 * pedir (contra os stores reais, já autenticados no navegador), manda de volta
 * o resultado, até o modelo devolver uma resposta final em texto. */
export async function runAgentTurn(history: ChatTurn[], userMessage: string): Promise<ChatTurn> {
  const messages: AgentMessage[] = history.map((t) => ({ role: t.role, content: t.text }));
  messages.push({ role: "user", content: userMessage });

  const toolTrace: { name: string; args: Record<string, unknown>; result: string }[] = [];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const step = await agentStep({ data: { messages } });

    if (!step.tool_calls || step.tool_calls.length === 0) {
      return {
        role: "assistant",
        text: step.content ?? "(sem resposta)",
        toolTrace: toolTrace.length ? toolTrace : undefined,
      };
    }

    messages.push({
      role: "assistant",
      content: step.content,
      tool_calls: step.tool_calls,
    });

    for (const call of step.tool_calls) {
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(call.function.arguments || "{}");
      } catch {
        // argumento malformado — segue com objeto vazio, a ferramenta reage ao que faltar
      }
      let result: string;
      try {
        result = await executeTool(call.function.name, args);
      } catch (err) {
        result = `Erro ao executar: ${err instanceof Error ? err.message : String(err)}`;
      }
      toolTrace.push({ name: call.function.name, args, result });
      messages.push({ role: "tool", tool_call_id: call.id, content: result });
    }
  }

  return {
    role: "assistant",
    text: "Fiz várias coisas em sequência e me perdi no meio — pode confirmar se ficou certo?",
    toolTrace,
  };
}
