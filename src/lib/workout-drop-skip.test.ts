import { beforeEach, describe, expect, it, vi } from "vitest";
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

import {
  completeExerciseLog,
  exerciseCompletionState,
  fetchState,
  logSet,
  nextPendingExerciseId,
  removeLastSet,
  seriesPosition,
  skipExercise,
  skipSet,
  updateSet,
  type ExerciseLog,
  type PlannedExercise,
} from "./workout-store";

const fake = (globalThis as unknown as { __fake: Fake }).__fake;
const SESSION = "11111111-1111-1111-1111-111111111111";
const EX = "ex-1";

beforeEach(() => {
  fake.reset();
  fake.setUser("user-a");
  fake.seed("workout_sessions", {
    id: SESSION,
    user_id: "user-a",
    date: "2026-10-14",
    status: "em_andamento",
    started_at: "2026-10-14T10:00:00Z",
    paused_seconds: 0,
    rest_overrides: {},
  });
});

const log = async (): Promise<ExerciseLog> => {
  const state = await fetchState();
  return state.sessions[0].exerciseLogs.find((l) => l.exerciseId === EX)!;
};

const planned = (sets = 4): PlannedExercise =>
  ({
    exerciseId: EX,
    setsTarget: sets,
    setTargets: [],
    name: "Supino",
  }) as unknown as PlannedExercise;

describe("drop anexado à série", () => {
  it("um registro só: a série carrega o drop, sem uma segunda série", async () => {
    await logSet(SESSION, EX, 60, 10, { drop: { weight: 45, reps: 6 } });
    const l = await log();
    expect(l.sets).toHaveLength(1);
    expect(l.sets[0]).toMatchObject({ weight: 60, reps: 10, drop: { weight: 45, reps: 6 } });
    expect(l.sets[0].isDrop).toBe(false);
    expect(seriesPosition(l)).toBe(1);
  });

  it("série sem drop não ganha drop", async () => {
    await logSet(SESSION, EX, 60, 10);
    expect((await log()).sets[0].drop).toBeUndefined();
  });

  it("dá para editar e remover o drop de uma série já feita", async () => {
    await logSet(SESSION, EX, 60, 10, { drop: { weight: 45, reps: 6 } });
    await updateSet(SESSION, EX, 0, { drop: { weight: 40, reps: 8 } });
    expect((await log()).sets[0].drop).toEqual({ weight: 40, reps: 8 });
    await updateSet(SESSION, EX, 0, { drop: null });
    expect((await log()).sets[0].drop).toBeUndefined();
  });

  it("o drop entra no volume do treino, mas não vira série extra", async () => {
    await logSet(SESSION, EX, 60, 10, { drop: { weight: 40, reps: 5 } });
    const l = await log();
    expect(l.sets).toHaveLength(1);
    const volume = l.sets.reduce(
      (sum, s) => sum + s.weight * s.reps + (s.drop ? s.drop.weight * s.drop.reps : 0),
      0,
    );
    expect(volume).toBe(800);
  });
});

describe("pular série", () => {
  it("pular a 2 leva direto à 3 e a série pulada fica zerada, fora das séries feitas", async () => {
    await logSet(SESSION, EX, 50, 10);
    await skipSet(SESSION, EX);
    const afterSkip = await log();
    expect(afterSkip.sets).toHaveLength(1); // só a 1 foi feita
    expect(afterSkip.skippedSets).toEqual([1]);
    expect(seriesPosition(afterSkip)).toBe(2); // a próxima é a série 3
    await logSet(SESSION, EX, 50, 10);
    const l = await log();
    expect(l.sets.map((s) => s.setIndex)).toEqual([0, 2]);
    expect(seriesPosition(l)).toBe(3);
  });

  it("série pulada não conta como feita, mas fecha a sequência", async () => {
    await logSet(SESSION, EX, 50, 10);
    await skipSet(SESSION, EX);
    await logSet(SESSION, EX, 50, 10);
    await skipSet(SESSION, EX);
    const l = await log();
    expect(l.sets).toHaveLength(2);
    expect(exerciseCompletionState(l, planned(4))).toBe("concluido");
    expect(exerciseCompletionState(l, planned(5))).toBe("parcial");
  });

  it("pular todas as séries não vira 'concluído'", async () => {
    await skipSet(SESSION, EX);
    await skipSet(SESSION, EX);
    const l = await log();
    expect(l.sets).toHaveLength(0);
    expect(exerciseCompletionState(l, planned(2))).toBe("nao_realizado");
  });

  it("desfazer o pulo libera a posição de volta", async () => {
    await logSet(SESSION, EX, 50, 10);
    await skipSet(SESSION, EX);
    await removeLastSet(SESSION, EX);
    const l = await log();
    expect(l.skippedSets).toEqual([]);
    expect(seriesPosition(l)).toBe(1);
  });

  it("índices nunca se repetem, mesmo depois de desfazer no meio", async () => {
    await logSet(SESSION, EX, 50, 10);
    await skipSet(SESSION, EX);
    await logSet(SESSION, EX, 55, 8);
    await removeLastSet(SESSION, EX);
    await logSet(SESSION, EX, 60, 6);
    const all = fake.rows("workout_set_logs").map((r) => r.set_index as number);
    expect(new Set(all).size).toBe(all.length);
  });
});

describe("pular exercício a qualquer momento", () => {
  it("pula mesmo com séries já feitas, e o que foi feito fica", async () => {
    await logSet(SESSION, EX, 50, 10);
    await skipExercise(SESSION, EX, true);
    const l = await log();
    expect(l.skipped).toBe(true);
    expect(l.sets).toHaveLength(1);
    // pulado de propósito: não volta a ser sugerido como pendente
    expect(nextPendingExerciseId([planned(3)], [l], EX)).toBeNull();
  });

  it("registrar uma série depois desfaz o 'pulado'", async () => {
    await skipExercise(SESSION, EX, true);
    await logSet(SESSION, EX, 50, 10);
    expect((await log()).skipped).toBe(false);
  });

  it("concluir depois de séries puladas e feitas marca concluído", async () => {
    await logSet(SESSION, EX, 50, 10);
    await completeExerciseLog(SESSION, EX);
    expect(exerciseCompletionState(await log(), planned(4))).toBe("concluido");
  });
});

describe("isolamento", () => {
  it("outra pessoa não vê nem altera as séries (com drop ou puladas)", async () => {
    await logSet(SESSION, EX, 50, 10, { drop: { weight: 30, reps: 5 } });
    await skipSet(SESSION, EX);
    fake.setUser("user-b");
    const state = await fetchState();
    expect(state.sessions).toHaveLength(0);
    await expect(updateSet(SESSION, EX, 0, { drop: null })).rejects.toThrow();
    fake.setUser("user-a");
    expect((await log()).sets[0].drop).toEqual({ weight: 30, reps: 5 });
  });
});
