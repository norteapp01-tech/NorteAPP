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
it("agenda é direta; proposta de refeição exige confirmação", () => {
  expect(requiresConfirmation("reagendar_execucao")).toBe(false);
  expect(requiresConfirmation("criar_execucao")).toBe(false);
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

it("uma afirmação de agendamento sem ferramenta é corrigida antes de responder", async () => {
  const step = vi
    .fn()
    .mockResolvedValueOnce({ content: "Marquei seu dentista." })
    .mockResolvedValueOnce({
      content: null,
      tool_calls: [
        {
          id: "dentista",
          type: "function",
          function: {
            name: "criar_execucao",
            arguments: JSON.stringify({
              title: "Dentista",
              dueDate: "2026-09-11",
              agendaDate: "2026-09-11",
              startTime: "19:00",
            }),
          },
        },
      ],
    })
    .mockResolvedValueOnce({ content: "Compromisso marcado." });
  const execute = vi
    .fn()
    .mockResolvedValue(JSON.stringify({ card: "appointment", summary: "Compromisso marcado." }));
  const reply = await runAgentTurnWith([], "Marca dentista hoje 19h", { step, execute });
  expect(execute).toHaveBeenCalledTimes(1);
  expect(reply.toolTrace).toHaveLength(1);
  expect(reply.pendingActions).toBeUndefined();
});
