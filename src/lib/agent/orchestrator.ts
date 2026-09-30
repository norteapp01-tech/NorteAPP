import {
  actionKey,
  isExplicitConfirmation,
  isExplicitRejection,
  parseAndValidateToolCall,
  requiresConfirmation,
  type AgentToolCall,
  type PendingAgentAction,
} from "./policy";

type AgentMessageContentPart =
  { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } };

type AgentMessage =
  | { role: "system" | "assistant"; content: string }
  | { role: "user"; content: string | AgentMessageContentPart[] }
  | { role: "assistant"; content: string | null; tool_calls: AgentToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

export type ChatTurn = {
  role: "user" | "assistant";
  text: string;
  toolTrace?: { name: string; args: Record<string, unknown>; result: string }[];
  pendingActions?: PendingAgentAction[];
};

type AgentStepResult = { content: string | null; tool_calls?: AgentToolCall[] };
export type AgentRunnerDeps = {
  step: (input: { data: { messages: AgentMessage[] } }) => Promise<AgentStepResult>;
  execute: (name: string, args: Record<string, unknown>) => Promise<string>;
};

const MAX_TOOL_ROUNDS = 5;

export async function runAgentTurnWith(
  history: ChatTurn[],
  userMessage: string,
  deps: AgentRunnerDeps,
  /** Data URL já comprimida (ver src/lib/image-compress.ts) — só o turno
   * ATUAL vira multimodal. O histórico salvo (ChatTurn.text, persistido no
   * localStorage) nunca guarda o base64, senão 100 mensagens salvas com
   * fotos incham o armazenamento do navegador rápido. */
  imageDataUrl?: string,
): Promise<ChatTurn> {
  const previousTurn = history.at(-1);
  // Só a proposta imediatamente anterior pode ser confirmada. Isso impede que
  // um "sim" tardio execute uma ação antiga já cancelada ou abandonada.
  const pending = previousTurn?.pendingActions;
  const confirmsPreviousProposal =
    isExplicitConfirmation(userMessage) &&
    previousTurn?.role === "assistant" &&
    /confirm/i.test(previousTurn.text);
  if (pending?.length) {
    if (isExplicitRejection(userMessage))
      return { role: "assistant", text: "Certo, não alterei nada." };
    if (isExplicitConfirmation(userMessage)) {
      const toolTrace = [];
      for (const action of pending) {
        let result: string;
        try {
          result = await deps.execute(action.name, action.args);
        } catch (error) {
          result = `Erro ao executar: ${error instanceof Error ? error.message : String(error)}`;
        }
        toolTrace.push({ name: action.name, args: action.args, result });
      }
      return {
        role: "assistant",
        text: toolTrace
          .map((item) => {
            try {
              return JSON.parse(item.result).summary || item.result;
            } catch {
              return item.result;
            }
          })
          .join("\n"),
        toolTrace,
      };
    }
  }

  // Histórico é sempre texto puro (nunca carrega tool_calls nem imagem — só o
  // turno atual, abaixo, pode virar multimodal), então cada item bate certinho
  // com a variante "content: string" da união; o TS só não enxerga isso porque
  // `turn.role` chega como "user" | "assistant" solto, não literal por item.
  const messages: AgentMessage[] = history.map(
    (turn) =>
      ({
        role: turn.role,
        content:
          turn.text +
          (turn.toolTrace?.length
            ? `\nResultados reais anteriores: ${JSON.stringify(turn.toolTrace)}`
            : ""),
      }) as AgentMessage,
  );
  messages.push({
    role: "user",
    content: imageDataUrl
      ? [
          { type: "text", text: userMessage || "Foto de refeição anexada." },
          { type: "image_url", image_url: { url: imageDataUrl } },
        ]
      : userMessage,
  });
  const toolTrace: { name: string; args: Record<string, unknown>; result: string }[] = [];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const step = await deps.step({ data: { messages } });
    if (
      !step.tool_calls?.length &&
      /\b(marquei|agendei|reagendei|registrei|salvei|criei|alterei|atualizei|concluí)\b/i.test(
        step.content || "",
      ) &&
      !toolTrace.some((t) => !t.name.startsWith("consultar") && !/^Erro|^Não /i.test(t.result))
    ) {
      messages.push({
        role: "system",
        content:
          "Você afirmou uma alteração, mas nenhuma ferramenta de escrita foi executada neste turno. Execute agora a ferramenta apropriada com os dados do pedido; se faltarem dados essenciais, pergunte. Nunca anuncie sucesso sem execução.",
      });
      continue;
    }
    if (!step.tool_calls?.length)
      return {
        role: "assistant",
        text: step.content ?? "(sem resposta)",
        toolTrace: toolTrace.length ? toolTrace : undefined,
      };

    messages.push({ role: "assistant", content: step.content, tool_calls: step.tool_calls });
    const proposed: PendingAgentAction[] = [];
    const seenThisRound = new Set<string>();
    for (const call of step.tool_calls) {
      let action: PendingAgentAction;
      try {
        action = parseAndValidateToolCall(call);
      } catch (error) {
        const result = error instanceof Error ? error.message : String(error);
        toolTrace.push({ name: call.function.name, args: {}, result });
        messages.push({ role: "tool", tool_call_id: call.id, content: result });
        continue;
      }
      const key = actionKey(action);
      if (seenThisRound.has(key)) {
        const result = "Ação duplicada ignorada neste turno.";
        toolTrace.push({ name: action.name, args: action.args, result });
        messages.push({ role: "tool", tool_call_id: call.id, content: result });
        continue;
      }
      seenThisRound.add(key);
      if (requiresConfirmation(action.name) && !confirmsPreviousProposal) {
        proposed.push(action);
        messages.push({
          role: "tool",
          tool_call_id: call.id,
          content: "Ação preparada, mas não executada: aguarde confirmação explícita da pessoa.",
        });
        continue;
      }
      let result: string;
      try {
        result = await deps.execute(action.name, action.args);
      } catch (error) {
        result = `Erro ao executar: ${error instanceof Error ? error.message : String(error)}`;
      }
      toolTrace.push({ name: action.name, args: action.args, result });
      messages.push({ role: "tool", tool_call_id: call.id, content: result });
    }
    if (proposed.length) {
      return {
        role: "assistant",
        // Não reutilize a fala do modelo aqui: ele pode ter dito "criado" antes
        // da confirmação. O estado real é sempre comunicado pelo orquestrador.
        text:
          proposed.length === 1
            ? `${toolTrace.length ? "Registrei os itens seguros. " : ""}Preparei uma alteração, mas ainda não salvei. Confirmar?`
            : `${toolTrace.length ? "Registrei os itens seguros. " : ""}Preparei ${proposed.length} alterações, mas ainda não salvei. Confirmar?`,
        toolTrace: toolTrace.length ? toolTrace : undefined,
        pendingActions: proposed,
      };
    }
  }
  return {
    role: "assistant",
    text: "Não consegui concluir com segurança. Nada pendente foi executado.",
    toolTrace,
  };
}
