import { describe, expect, it, vi } from "vitest";
import { runAgentTurnWith, type ChatTurn } from "./orchestrator";

type ToolCall = { name: string; args: Record<string, unknown> };

function stepReturning(calls: ToolCall[], content: string | null = null) {
  let called = false;
  return vi.fn(async () => {
    if (called) return { content: "Pronto.", tool_calls: undefined };
    called = true;
    return {
      content,
      tool_calls: calls.map((call, index) => ({
        id: `call-${index}`,
        type: "function" as const,
        function: { name: call.name, arguments: JSON.stringify(call.args) },
      })),
    };
  });
}

describe("Agente Norte — três personas e cenários adversariais", () => {
  it("persona informal resolve várias ações claras em uma fala só", async () => {
    const execute = vi.fn(async (name: string) => `${name} ok`);
    const reply = await runAgentTurnWith([], "bebi mei litro e gastei vintao no busao", {
      step: stepReturning([
        { name: "registrar_agua", args: { amountMl: 500 } },
        {
          name: "registrar_transacao",
          args: { type: "expense", amount: 20, description: "ônibus", category: "Transporte" },
        },
      ]) as never,
      execute: execute as never,
    });
    expect(execute).toHaveBeenCalledTimes(2);
    expect(reply.toolTrace).toHaveLength(2);
  });

  it("persona perdida não tem sua agenda alterada antes de confirmar", async () => {
    const execute = vi.fn(async () => "criado");
    const proposed = await runAgentTurnWith([], "joga esse negócio pra amanhã sei lá", {
      step: stepReturning([
        {
          name: "criar_execucao",
          args: { title: "Continuar tarefa", dueDate: "2026-09-10" },
        },
      ]) as never,
      execute: execute as never,
    });
    expect(execute).not.toHaveBeenCalled();
    expect(proposed.pendingActions).toHaveLength(1);

    const cancelled = await runAgentTurnWith([proposed], "não", {
      step: vi.fn() as never,
      execute: execute as never,
    });
    expect(cancelled.text).toContain("não alterei");
    expect(execute).not.toHaveBeenCalled();
  });

  it("persona detalhista confirma um plano já preparado", async () => {
    const execute = vi.fn(async () => "Plano criado com sucesso.");
    const proposed = await runAgentTurnWith([], "Crie o plano detalhado que descrevi", {
      step: stepReturning([
        {
          name: "criar_plano",
          args: {
            title: "Lançar produto",
            why: "Validar a nova fonte de receita",
            lifeArea: "Carreira",
            deadlineISO: "2026-12-08",
            deadlineLabel: "em 90 dias",
          },
        },
      ]) as never,
      execute: execute as never,
    });
    expect(execute).not.toHaveBeenCalled();
    const confirmed = await runAgentTurnWith([proposed], "confirmo", {
      step: vi.fn() as never,
      execute: execute as never,
    });
    expect(execute).toHaveBeenCalledTimes(1);
    expect(confirmed.text).toContain("Plano criado");
  });

  it("bloqueia dados perigosos mesmo quando o modelo tenta chamar a ferramenta", async () => {
    const execute = vi.fn();
    const reply = await runAgentTurnWith([], "bebi menos 500 ml", {
      step: stepReturning([{ name: "registrar_agua", args: { amountMl: -500 } }]) as never,
      execute: execute as never,
    });
    expect(execute).not.toHaveBeenCalled();
    expect(reply.toolTrace?.[0].result).toContain("Não executei");
  });

  it("ignora uma chamada idêntica duplicada pelo modelo no mesmo turno", async () => {
    const execute = vi.fn(async () => "ok");
    const transaction = {
      name: "registrar_transacao",
      args: { type: "expense", amount: 32, description: "estacionamento", category: "Transporte" },
    };
    const reply = await runAgentTurnWith([], "gastei 32 no estacionamento", {
      step: stepReturning([transaction, transaction]) as never,
      execute: execute as never,
    });
    expect(execute).toHaveBeenCalledTimes(1);
    expect(reply.toolTrace?.some((trace) => trace.result.includes("duplicada"))).toBe(true);
  });

  it("recusa ferramenta inexistente solicitada pelo modelo", async () => {
    const execute = vi.fn();
    const reply = await runAgentTurnWith([], "faz uma transferência", {
      step: stepReturning([{ name: "transferir_dinheiro", args: { amount: 1000 } }]) as never,
      execute: execute as never,
    });
    expect(execute).not.toHaveBeenCalled();
    expect(reply.toolTrace?.[0].result).toContain("não permitida");
  });

  it("não interpreta uma resposta diferente como confirmação", async () => {
    const execute = vi.fn();
    const history: ChatTurn[] = [
      {
        role: "assistant",
        text: "Confirmar?",
        pendingActions: [
          { name: "criar_execucao", args: { title: "Tarefa", dueDate: "2026-09-10" } },
        ],
      },
    ];
    await runAgentTurnWith(history, "qual é minha agenda?", {
      step: stepReturning([]) as never,
      execute: execute as never,
    });
    expect(execute).not.toHaveBeenCalled();
  });

  it("não permite confirmar uma proposta antiga depois de ela ter sido cancelada", async () => {
    const execute = vi.fn();
    const proposal: ChatTurn = {
      role: "assistant",
      text: "Confirmar?",
      pendingActions: [
        { name: "criar_execucao", args: { title: "Tarefa", dueDate: "2026-09-10" } },
      ],
    };
    const cancellation: ChatTurn = { role: "assistant", text: "Certo, não alterei nada." };
    await runAgentTurnWith([proposal, cancellation], "sim", {
      step: stepReturning([]) as never,
      execute: execute as never,
    });
    expect(execute).not.toHaveBeenCalled();
  });

  it("relata falha após confirmação sem afirmar que a alteração foi concluída", async () => {
    const proposal: ChatTurn = {
      role: "assistant",
      text: "Confirmar?",
      pendingActions: [
        { name: "criar_execucao", args: { title: "Tarefa", dueDate: "2026-09-10" } },
      ],
    };
    const reply = await runAgentTurnWith([proposal], "confirmo", {
      step: vi.fn() as never,
      execute: vi.fn(async () => {
        throw new Error("rede indisponível");
      }) as never,
    });
    expect(reply.text).toContain("Erro ao executar");
    expect(reply.text).toContain("rede indisponível");
  });
});
