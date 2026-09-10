import { expect, it, vi } from "vitest";
import { runAgentTurnWith } from "./orchestrator";
import { parseAndValidateToolCall, requiresConfirmation } from "./policy";

it("não anuncia sucesso total quando uma confirmação falha parcialmente", async () => {
  const reply = await runAgentTurnWith(
    [
      {
        role: "assistant",
        text: "Confirma?",
        pendingActions: [
          { name: "criar_plano", args: {} },
          { name: "criar_execucao", args: {} },
        ],
      },
    ],
    "Confirmo",
    {
      step: vi.fn(),
      execute: vi
        .fn()
        .mockResolvedValueOnce("Plano criado.")
        .mockRejectedValueOnce(new Error("Sem conexão")),
    },
  );
  expect(reply.text).toContain("Plano criado");
  expect(reply.text).toContain("Erro ao executar");
  expect(reply.pendingActions).toBeUndefined();
});
it("reagendamento e refeição exigem confirmação explícita", () => {
  expect(requiresConfirmation("reagendar_execucao")).toBe(true);
  expect(requiresConfirmation("registrar_refeicao")).toBe(true);
  expect(() =>
    parseAndValidateToolCall({
      id: "1",
      type: "function",
      function: {
        name: "reagendar_execucao",
        arguments: JSON.stringify({
          executionId: "inventado",
          date: "2026-09-12",
          startTime: "99:00",
          endTime: "10:00",
        }),
      },
    }),
  ).toThrow();
});
it("cancelar uma proposta não chama nenhuma ferramenta", async () => {
  const execute = vi.fn();
  await runAgentTurnWith(
    [
      {
        role: "assistant",
        text: "Confirma?",
        pendingActions: [{ name: "registrar_refeicao", args: {} }],
      },
    ],
    "Cancelar",
    { execute, step: vi.fn() },
  );
  expect(execute).not.toHaveBeenCalled();
});
