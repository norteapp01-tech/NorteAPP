import { describe, expect, it, vi } from "vitest";
import { looksLikeTextPlan, runAgentTurnWith } from "./orchestrator";

const call = (name: string, args: Record<string, unknown>, id = "c1") => ({
  id, type: "function" as const, function: { name, arguments: JSON.stringify(args) },
});

describe("padrão dos cards do agente", () => {
  it("escrita que volta como card responde na hora, sem segunda chamada ao modelo", async () => {
    const step = vi.fn().mockResolvedValueOnce({
      content: null,
      tool_calls: [call("registrar_transacao", { type: "expense", amount: 32, description: "Uber", category: "Transporte" })],
    });
    const execute = vi.fn().mockResolvedValue(JSON.stringify({ card: "finance", summary: "Movimentação registrada." }));
    const turn = await runAgentTurnWith([], "Gastei 32 reais de Uber", { step, execute });
    expect(step).toHaveBeenCalledTimes(1);
    expect(turn.text).toBe("Movimentação registrada.");
    expect(turn.toolTrace?.[0].name).toBe("registrar_transacao");
  });

  it("consulta não encerra o turno: o modelo segue para a ação", async () => {
    const step = vi
      .fn()
      .mockResolvedValueOnce({ content: null, tool_calls: [call("consultar_dia", {})] })
      .mockResolvedValueOnce({ content: "Hoje você tem 3 compromissos." });
    const execute = vi.fn().mockResolvedValue(JSON.stringify({ card: "agenda", summary: "Estes são seus compromissos de hoje." }));
    await runAgentTurnWith([], "Como está meu dia?", { step, execute });
    expect(step).toHaveBeenCalledTimes(2);
  });

  it("plano escrito em texto é recusado e vira card de proposta", async () => {
    const plano = { title: "Abrir loja", why: "Independência", lifeArea: "Carreira", deadlineLabel: "sem prazo", steps: [{ title: "Pesquisa" }, { title: "Estrutura" }, { title: "Inauguração" }] };
    const step = vi
      .fn()
      .mockResolvedValueOnce({ content: "Vamos criar um plano:\n1. Pesquisa\n2. Estrutura\n3. Inauguração\nPosso seguir?" })
      .mockResolvedValueOnce({ content: null, tool_calls: [call("criar_plano", plano)] });
    const turn = await runAgentTurnWith([], "Quero abrir minha loja", { step, execute: vi.fn() });
    expect(step).toHaveBeenCalledTimes(2);
    expect(turn.pendingActions?.[0].name).toBe("criar_plano");
  });

  it("reconhece plano em texto, mas não qualquer lista", () => {
    expect(looksLikeTextPlan("Plano:\n1. A\n2. B\n3. C")).toBe(true);
    expect(looksLikeTextPlan("Seu dia:\n- Reunião\n- Treino")).toBe(false);
  });
});

import { claimsWrite } from "./orchestrator";
describe("afirmação de escrita sem ferramenta", () => {
  it("reconhece anúncios de resultado", () => {
    for (const t of ["Água registrada.", "Movimentação registrada como entrada.", "Lembrete criado para amanhã.", "Marquei sua consulta.", "Preparei um plano para você."])
      expect(claimsWrite(t), t).toBe(true);
  });
  it("não confunde com descrição do que já existe", () => {
    for (const t of ["Hoje você tem 3 compromissos marcados.", "Seus gastos registrados somam R$ 300.", "Não há nada agendado hoje."])
      expect(claimsWrite(t), t).toBe(false);
  });
  it("texto que afirma gravação sem ferramenta é refeito com a ferramenta", async () => {
    const step = vi
      .fn()
      .mockResolvedValueOnce({ content: "Movimentação registrada como entrada." })
      .mockResolvedValueOnce({ content: null, tool_calls: [call("registrar_transacao", { type: "income", amount: 1200, description: "Freela", category: "Trabalho/Receita" })] });
    const execute = vi.fn().mockResolvedValue(JSON.stringify({ card: "finance", summary: "Movimentação registrada." }));
    const turn = await runAgentTurnWith([], "Recebi 1200 de um freela", { step, execute });
    expect(execute).toHaveBeenCalledTimes(1);
    expect(turn.text).toBe("Movimentação registrada.");
  });
});
