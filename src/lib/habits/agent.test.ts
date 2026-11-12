import { describe, expect, it, vi } from "vitest";

vi.mock("../supabase/client", () => ({
  supabase: {},
  ensureSession: async () => "u",
  useSupabaseUserId: () => "u",
}));

import { HABIT_CONFIRMATION_TOOLS, HABIT_TOOLS, habitSchemas, resolveHabit } from "./agent";
import { parseAndValidateToolCall, requiresConfirmation } from "../agent/policy";
import type { Habit } from "./types";

const habit = (id: string, name: string, over: Partial<Habit> = {}): Habit => ({
  id,
  name,
  intent: "build",
  measure: "binary",
  startDate: "2026-11-01",
  position: 0,
  createdAt: "2026-11-01T00:00:00Z",
  versions: [],
  ...over,
});

describe("achar a rotina pelo nome", () => {
  const list = [
    habit("1", "Leitura"),
    habit("2", "Beber água"),
    habit("3", "Treino A"),
    habit("4", "Treino B"),
    habit("5", "Café", { archivedAt: "2026-11-02T00:00:00Z" }),
  ];
  it("nome exato, parcial e sem acento", () => {
    expect(resolveHabit(list, "leitura")).toMatchObject({ habit: { id: "1" } });
    expect(resolveHabit(list, "agua")).toMatchObject({ habit: { id: "2" } });
  });
  it("ambíguo não adivinha", () => {
    const r = resolveHabit(list, "treino");
    expect("ambiguous" in r && r.ambiguous.map((h) => h.id)).toEqual(["3", "4"]);
  });
  it("não existe → none; arquivada só aparece se não houver outra", () => {
    expect(resolveHabit(list, "meditação")).toEqual({ none: true });
    expect(resolveHabit(list, "café")).toMatchObject(
      { habit: { id: "5" } }.habit ? { none: true } : {},
    );
    expect(
      resolveHabit([habit("9", "Café", { archivedAt: "2026-11-02T00:00:00Z" })], "café"),
    ).toMatchObject({ habit: { id: "9" } });
  });
  it("id exato", () => {
    expect(resolveHabit(list, "3")).toMatchObject({ habit: { id: "3" } });
  });
});

describe("validação das ferramentas de rotina", () => {
  const call = (name: string, args: unknown) =>
    parseAndValidateToolCall({
      id: "c",
      type: "function",
      function: { name, arguments: JSON.stringify(args) },
    });

  it("toda ferramenta anunciada tem esquema e vice-versa", () => {
    const names = HABIT_TOOLS.map((t) => t.function.name).sort();
    expect(names).toEqual(Object.keys(habitSchemas).sort());
  });
  it("aceita pedidos reais e recusa valores impossíveis", () => {
    expect(
      call("registrar_rotina", { habit: "Leitura", value: 12, date: "2026-11-10" }).args,
    ).toMatchObject({ value: 12 });
    expect(() => call("registrar_rotina", { habit: "Leitura", value: -3 })).toThrow();
    expect(() => call("registrar_rotina", { habit: "Leitura", date: "ontem" })).toThrow();
    expect(() => call("criar_rotina", { name: "", goalValue: 3 })).toThrow();
    expect(() => call("criar_rotina", { name: "Ler", goalValue: 3, weekdays: [9] })).toThrow();
    expect(() => call("pausar_rotinas", { scope: "habit" })).toThrow();
    expect(() => call("pausar_rotinas", { scope: "area" })).toThrow();
    expect(
      call("pausar_rotinas", { scope: "global", startDate: "2026-11-10", endDate: "2026-11-20" })
        .name,
    ).toBe("pausar_rotinas");
  });
  it("mudanças amplas pedem confirmação; registrar não", () => {
    for (const n of HABIT_CONFIRMATION_TOOLS) expect(requiresConfirmation(n)).toBe(true);
    expect(requiresConfirmation("registrar_rotina")).toBe(false);
    expect(requiresConfirmation("desfazer_registro_rotina")).toBe(false);
    expect(HABIT_CONFIRMATION_TOOLS.sort()).toEqual([
      "arquivar_rotina",
      "criar_rotina",
      "pausar_rotinas",
    ]);
  });
});
