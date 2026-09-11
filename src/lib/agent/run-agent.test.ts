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

  it("pedido claro de dentista é registrado sem confirmação redundante", async () => {
    const execute = vi.fn(async () => "criado");
    const proposed = await runAgentTurnWith([], "marque dentista hoje às 19h", {
      step: stepReturning([
        {
          name: "criar_execucao",
          args: {
            title: "Dentista",
            dueDate: "2026-09-11",
            agendaDate: "2026-09-11",
            startTime: "19:00",
          },
        },
      ]) as never,
      execute: execute as never,
    });
    expect(execute).toHaveBeenCalledTimes(1);
    expect(proposed.pendingActions).toBeUndefined();
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

  it("não pede uma segunda confirmação quando o modelo já havia solicitado a primeira", async () => {
    const execute = vi.fn(async () => "Plano criado com sucesso.");
    const history: ChatTurn[] = [
      { role: "user", text: "Crie um plano de 90 dias" },
      { role: "assistant", text: "Preparei o plano. Confirma para eu registrar?" },
    ];
    const reply = await runAgentTurnWith(history, "confirmo", {
      step: stepReturning([
        {
          name: "criar_plano",
          args: {
            title: "Plano de 90 dias",
            why: "Objetivo informado",
            lifeArea: "Carreira",
            deadlineLabel: "em 90 dias",
          },
        },
      ]) as never,
      execute: execute as never,
    });
    expect(execute).toHaveBeenCalledTimes(1);
    expect(reply.pendingActions).toBeUndefined();
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
