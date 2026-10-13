import { beforeEach, describe, expect, it } from "vitest";
import { vi } from "vitest";
import type { createFakeSupabase } from "../test/fake-supabase";

type Fake = ReturnType<typeof createFakeSupabase>;

vi.mock("./supabase/client", async () => {
  const { createFakeSupabase } = await import("../test/fake-supabase");
  const fake = createFakeSupabase("user-a");
  (globalThis as unknown as { __fake: Fake }).__fake = fake;
  return {
    supabase: fake.client,
    ensureSession: async () => fake.userId,
    useSupabaseUserId: () => fake.userId,
  };
});

import { fetchMirrorChanges, isRoutineLike } from "./mirror-store";
import { setExecutionFeeling } from "./goals-store";
import type { AgendaOccurrence } from "./agenda-occurrences";

const fake = (globalThis as unknown as { __fake: Fake }).__fake;

beforeEach(() => {
  fake.reset();
  fake.setUser("user-a");
});

const change = (user: string, extra: Record<string, unknown>) =>
  fake.seed("agenda_changes", {
    user_id: user,
    kind: "moved",
    at: "2026-10-10T12:00:00Z",
    ...extra,
  });

describe("histórico de mudanças do Espelho", () => {
  it("devolve só as mudanças de horário, dentro da janela, em ordem", async () => {
    change("user-a", { subject_title: "B", at: "2026-10-11T12:00:00Z" });
    change("user-a", { subject_title: "A", at: "2026-10-09T12:00:00Z" });
    change("user-a", { subject_title: "Fora", at: "2026-08-01T12:00:00Z" });
    change("user-a", { subject_title: "Concluído", kind: "completed" });
    const list = await fetchMirrorChanges("2026-10-08", "2026-10-14");
    expect(list.map((c) => c.subjectTitle)).toEqual(["A", "B"]);
  });

  it("nunca enxerga o histórico de outra pessoa", async () => {
    change("user-a", { subject_title: "Meu" });
    change("user-b", { subject_title: "Do outro" });
    const list = await fetchMirrorChanges("2026-10-08", "2026-10-14");
    expect(list.map((c) => c.subjectTitle)).toEqual(["Meu"]);
    fake.setUser("user-b");
    const other = await fetchMirrorChanges("2026-10-08", "2026-10-14");
    expect(other.map((c) => c.subjectTitle)).toEqual(["Do outro"]);
  });

  it("o histórico sobrevive ao compromisso removido (execution_id nulo)", async () => {
    change("user-a", { subject_title: "Dentista", execution_id: null });
    const [c] = await fetchMirrorChanges("2026-10-08", "2026-10-14");
    expect(c.executionId).toBeUndefined();
    expect(c.subjectTitle).toBe("Dentista");
  });
});

describe("check-in 'Como foi?'", () => {
  const seedExecution = (user = "user-a") =>
    fake.seed("executions", {
      user_id: user,
      title: "Treino",
      due_date: "2026-10-12",
      category: "academia",
      status: "concluida",
    });

  it("grava e apaga a resposta", async () => {
    const e = seedExecution();
    await setExecutionFeeling(e.id as string, "leve");
    expect(fake.rows("executions")[0]).toMatchObject({ feeling: "leve" });
    expect(fake.rows("executions")[0].feeling_at).toBeTruthy();
    await setExecutionFeeling(e.id as string, null);
    expect(fake.rows("executions")[0]).toMatchObject({ feeling: null, feeling_at: null });
  });

  it("não altera o compromisso de outra pessoa", async () => {
    const other = seedExecution("user-b");
    await expect(setExecutionFeeling(other.id as string, "pesado")).rejects.toThrow();
    expect(fake.rows("executions")[0].feeling ?? null).toBeNull();
  });
});

describe("rotinas dos módulos", () => {
  it("reconhece rotina por id ou por categoria de módulo", () => {
    const o = (p: Partial<AgendaOccurrence>) =>
      ({ category: "generico", ...p }) as AgendaOccurrence;
    expect(isRoutineLike(o({ routineId: "r" }))).toBe(true);
    expect(isRoutineLike(o({ category: "academia" }))).toBe(true);
    expect(isRoutineLike(o({ category: "generico" }))).toBe(false);
  });
});
