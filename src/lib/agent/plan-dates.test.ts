import { describe, expect, it, vi } from "vitest";
vi.mock("../supabase/client", () => ({ supabase: {}, ensureSession: vi.fn(), useSupabaseUserId: vi.fn() }));
import { planStepEnds } from "./tools";

describe("datas das etapas do plano criado pelo agente", () => {
  it("usa as datas propostas quando existem", () => {
    const ends = planStepEnds({ steps: [{ targetDate: "2026-10-30" }, { targetDate: "2026-11-20" }] }, 2, "2026-10-14");
    expect(ends).toEqual(["2026-10-30", "2026-11-20"]);
  });
  it("sem datas nem prazo, distribui de 21 em 21 dias a partir de hoje", () => {
    expect(planStepEnds({ steps: [{}, {}, {}] }, 3, "2026-10-14")).toEqual(["2026-11-04", "2026-11-25", "2026-12-16"]);
  });
  it("com prazo, distribui as etapas sem data até o prazo", () => {
    expect(planStepEnds({ deadlineISO: "2027-01-12", steps: [{}, {}, {}] }, 3, "2026-10-14")).toEqual(["2026-11-13", "2026-12-13", "2027-01-12"]);
  });
  it("nunca deixa uma etapa terminar antes da anterior", () => {
    const ends = planStepEnds({ steps: [{ targetDate: "2026-12-01" }, { targetDate: "2026-11-01" }] }, 2, "2026-10-14");
    expect(ends[1] >= ends[0]).toBe(true);
  });
});

import { parseAndValidateToolCall } from "./policy";
describe("proposta de plano com etapa além do prazo", () => {
  it("ajusta a etapa ao prazo em vez de recusar a proposta", () => {
    const action = parseAndValidateToolCall({
      id: "c1",
      type: "function",
      function: {
        name: "criar_plano",
        arguments: JSON.stringify({
          title: "Abrir loja", why: "Independência", lifeArea: "Carreira", deadlineLabel: "em 30 dias", deadlineISO: "2099-01-31",
          steps: [{ title: "Pesquisa", targetDate: "2099-01-20" }, { title: "Inauguração", targetDate: "2099-03-10" }],
        }),
      },
    });
    const steps = action.args.steps as { targetDate: string }[];
    expect(steps.map((s) => s.targetDate)).toEqual(["2099-01-20", "2099-01-31"]);
  });
});
