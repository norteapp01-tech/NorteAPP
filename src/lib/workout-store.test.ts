import { describe, it, expect, vi } from "vitest";

// Este teste só usa seletores puros, mas o módulo importa o client do Supabase
// no topo — sem mock, ele lançaria por falta de env vars (mesmo padrão já usado
// em goals-store.test.ts/reminders-store.test.ts).
vi.mock("./supabase/client", () => ({
  supabase: {
    from: () => ({ select: () => ({ order: () => Promise.resolve({ data: [], error: null }) }) }),
  },
  ensureSession: async () => "test-user",
  useSupabaseUserId: () => "test-user",
}));

import {
  sessionSummary,
  allTimeMaxWeight,
  workoutInsights,
  type WorkoutSession,
  type Exercise,
} from "./workout-store";

function makeExercise(overrides: Partial<Exercise> = {}): Exercise {
  return {
    id: "ex-1",
    planId: "plan-a",
    name: "Supino reto",
    setsTarget: 3,
    repsTarget: 10,
    loadTarget: 40,
    restSeconds: 90,
    order: 0,
    ...overrides,
  };
}

function makeSession(overrides: Partial<WorkoutSession> = {}): WorkoutSession {
  return {
    id: "s-1",
    planId: "plan-a",
    date: "2026-09-04",
    startedAt: "2026-09-04T10:00:00.000Z",
    finishedAt: "2026-09-04T11:00:00.000Z",
    exerciseLogs: [],
    status: "concluido",
    ...overrides,
  };
}

describe("sessionSummary — sem histórico não inventa percentual/delta", () => {
  it("primeira sessão de um exercício: deltaWeightVsPrevious e previousVolume ficam undefined, isPersonalRecord false", () => {
    const exercises = [makeExercise()];
    const session = makeSession({
      exerciseLogs: [
        { exerciseId: "ex-1", done: true, sets: [{ setIndex: 0, weight: 40, reps: 10 }] },
      ],
    });
    const summary = sessionSummary(session, undefined, exercises, [session]);
    expect(summary.exercises).toHaveLength(1);
    const row = summary.exercises[0];
    expect(row.deltaWeightVsPrevious).toBeUndefined();
    expect(row.previousVolume).toBeUndefined();
    expect(summary.previousTotalVolume).toBeUndefined();
    // sem sessão anterior nenhuma, allTimeMaxWeight (excluindo a atual) é 0 —
    // não é "recorde pessoal", é a única marca que existe.
    expect(row.isPersonalRecord).toBe(false);
  });

  it("calcula volume (peso×reps somado) corretamente", () => {
    const exercises = [makeExercise()];
    const session = makeSession({
      exerciseLogs: [
        {
          exerciseId: "ex-1",
          done: true,
          sets: [
            { setIndex: 0, weight: 40, reps: 10 },
            { setIndex: 1, weight: 42, reps: 8 },
          ],
        },
      ],
    });
    const summary = sessionSummary(session, undefined, exercises, [session]);
    expect(summary.exercises[0].volume).toBe(40 * 10 + 42 * 8);
    expect(summary.totalVolume).toBe(40 * 10 + 42 * 8);
  });

  it("duration vem de finishedAt - startedAt; sem finishedAt fica undefined", () => {
    const exercises = [makeExercise()];
    const finished = makeSession();
    const ongoing = makeSession({ finishedAt: undefined });
    expect(sessionSummary(finished, undefined, exercises).durationMinutes).toBe(60);
    expect(sessionSummary(ongoing, undefined, exercises).durationMinutes).toBeUndefined();
  });
});

describe("sessionSummary — comparação com sessão anterior", () => {
  const exercises = [makeExercise()];
  const previous = makeSession({
    id: "s-prev",
    date: "2026-08-28",
    exerciseLogs: [
      { exerciseId: "ex-1", done: true, sets: [{ setIndex: 0, weight: 35, reps: 10 }] },
    ],
  });
  const current = makeSession({
    exerciseLogs: [
      { exerciseId: "ex-1", done: true, sets: [{ setIndex: 0, weight: 40, reps: 10 }] },
    ],
  });

  it("delta de carga e volume vs. anterior calculados corretamente", () => {
    const summary = sessionSummary(current, previous, exercises, [previous, current]);
    const row = summary.exercises[0];
    expect(row.deltaWeightVsPrevious).toBe(5); // 40 - 35
    expect(row.previousVolume).toBe(350); // 35*10
    expect(summary.previousTotalVolume).toBe(350);
  });

  it("carga igual ou maior que todo o histórico é reconhecida como recorde pessoal", () => {
    const summary = sessionSummary(current, previous, exercises, [previous, current]);
    expect(summary.exercises[0].isPersonalRecord).toBe(true); // 40 > 35 (único registro anterior)
  });

  it("carga menor que o recorde histórico NÃO é marcada como recorde", () => {
    const biggerPast = makeSession({
      id: "s-big",
      date: "2026-08-01",
      exerciseLogs: [
        { exerciseId: "ex-1", done: true, sets: [{ setIndex: 0, weight: 50, reps: 10 }] },
      ],
    });
    const summary = sessionSummary(current, previous, exercises, [biggerPast, previous, current]);
    expect(summary.exercises[0].isPersonalRecord).toBe(false); // 40 < 50 histórico
  });
});

describe("allTimeMaxWeight", () => {
  it("ignora sessões de outro plano e a sessão excluída", () => {
    const sessions: WorkoutSession[] = [
      makeSession({
        id: "a",
        planId: "plan-a",
        exerciseLogs: [
          { exerciseId: "ex-1", done: true, sets: [{ setIndex: 0, weight: 60, reps: 5 }] },
        ],
      }),
      makeSession({
        id: "b",
        planId: "plan-b", // outro plano — não deve contar, mesmo com carga maior
        exerciseLogs: [
          { exerciseId: "ex-1", done: true, sets: [{ setIndex: 0, weight: 100, reps: 5 }] },
        ],
      }),
      makeSession({
        id: "c",
        planId: "plan-a",
        exerciseLogs: [
          { exerciseId: "ex-1", done: true, sets: [{ setIndex: 0, weight: 90, reps: 5 }] },
        ],
      }),
    ];
    expect(allTimeMaxWeight(sessions, "plan-a", "ex-1")).toBe(90);
    expect(allTimeMaxWeight(sessions, "plan-a", "ex-1", "c")).toBe(60);
  });
});

describe("workoutInsights — no máximo 2, honesto, sem causalidade indevida", () => {
  const exercises = [makeExercise()];

  it("sem sessão anterior, diz claramente que não há amostra suficiente", () => {
    const session = makeSession();
    const summary = sessionSummary(session, undefined, exercises, [session]);
    const insights = workoutInsights(session, undefined, [session], summary);
    expect(insights).toHaveLength(1);
    expect(insights[0]).toMatch(/não há treinos suficientes/i);
  });

  it("nunca mais que 2 insights", () => {
    const previous = makeSession({
      id: "prev",
      date: "2026-08-01",
      exerciseLogs: [
        { exerciseId: "ex-1", done: true, sets: [{ setIndex: 0, weight: 50, reps: 10 }] },
      ],
    });
    const current = makeSession({
      date: "2026-09-04",
      exerciseLogs: [
        { exerciseId: "ex-1", done: true, sets: [{ setIndex: 0, weight: 30, reps: 10 }] },
      ],
    });
    const summary = sessionSummary(current, previous, exercises, [previous, current]);
    const insights = workoutInsights(current, previous, [previous, current], summary);
    expect(insights.length).toBeLessThanOrEqual(2);
  });

  it("queda de carga após intervalo longo usa linguagem de correlação, nunca causa direta", () => {
    const previous = makeSession({
      id: "prev",
      date: "2026-08-01",
      exerciseLogs: [
        {
          exerciseId: "ex-1",
          done: true,
          sets: [
            { setIndex: 0, weight: 50, reps: 10 },
            { setIndex: 1, weight: 50, reps: 10 },
          ],
        },
      ],
    });
    const current = makeSession({
      date: "2026-08-25", // 24 dias depois
      exerciseLogs: [
        {
          exerciseId: "ex-1",
          done: true,
          sets: [
            { setIndex: 0, weight: 40, reps: 10 },
            { setIndex: 1, weight: 40, reps: 10 },
          ],
        },
      ],
    });
    const summary = sessionSummary(current, previous, exercises, [previous, current]);
    const insights = workoutInsights(current, previous, [previous, current], summary);
    const text = insights.join(" ");
    expect(text.toLowerCase()).not.toMatch(/porque/);
    expect(text).toMatch(/pode ter contribuído|contribuiu/i);
  });
});
