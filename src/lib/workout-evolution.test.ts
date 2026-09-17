import { describe, it, expect, vi } from "vitest";

vi.mock("./supabase/client", () => ({
  supabase: {
    from: () => ({ select: () => ({ order: () => Promise.resolve({ data: [], error: null }) }) }),
  },
  ensureSession: async () => "test-user",
  useSupabaseUserId: () => "test-user",
}));

import {
  applyFilters,
  availableReferences,
  clampToScope,
  exerciseChartSeries,
  exercisesInData,
  indicators,
  loadProgressions,
  muscleDistribution,
  personalRecords,
  previousRange,
  rangeOfLastDays,
  resolveSets,
  workoutDistribution,
  UNCLASSIFIED,
} from "./workout-evolution";
import type { Exercise, SetLog, WorkoutPlan, WorkoutSession } from "./workout-store";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function ex(o: Partial<Exercise> = {}): Exercise {
  return {
    id: "ex-1",
    planId: "plan-1",
    lineageId: "lin-remada",
    name: "Remada",
    setsTarget: 3,
    repsTarget: 10,
    loadTarget: 20,
    restSeconds: 60,
    order: 0,
    muscleGroup: "costas",
    equipment: "barra",
    ...o,
  };
}

function plan(o: Partial<WorkoutPlan> = {}): WorkoutPlan {
  return {
    id: "plan-1",
    letter: "A",
    name: "Costas",
    muscleGroups: "",
    order: 0,
    lineageId: "lin-plan-a",
    ...o,
  };
}

/** Sessão concluída com uma lista de séries de um exercício. */
function session(
  id: string,
  date: string,
  sets: { weight: number; reps: number }[],
  o: Partial<WorkoutSession> = {},
): WorkoutSession {
  const setLogs: SetLog[] = sets.map((s, i) => ({ setIndex: i, ...s }));
  return {
    id,
    planId: "plan-1",
    planLineageId: "lin-plan-a",
    planLabel: "A · Costas",
    date,
    startedAt: `${date}T10:00:00.000Z`,
    finishedAt: `${date}T11:00:00.000Z`,
    status: "concluido",
    pausedSeconds: 0,
    restPausedSeconds: 0,
    restOverrides: {},
    exerciseLogs: [{ exerciseId: "ex-1", done: true, sets: setLogs }],
    ...o,
  };
}

const EXERCISES = [ex()];
const PLANS = [plan()];
const setsOf = (sessions: WorkoutSession[]) => resolveSets(sessions, EXERCISES, PLANS);

// ---------------------------------------------------------------------------

describe("período e comparação", () => {
  it("o intervalo anterior tem a mesma duração e termina na véspera", () => {
    const range = rangeOfLastDays(30, "2026-09-30");
    expect(range).toEqual({ from: "2026-09-01", to: "2026-09-30" });
    expect(previousRange(range)).toEqual({ from: "2026-08-02", to: "2026-08-31" });
  });

  it("o escopo da etapa recorta o período, nunca o amplia", () => {
    const scope = { from: "2026-09-10", to: "2026-09-20" };
    expect(clampToScope({ from: "2026-09-01", to: "2026-09-30" }, scope)).toEqual(scope);
    expect(clampToScope({ from: "2026-09-12", to: "2026-09-15" }, scope)).toEqual({
      from: "2026-09-12",
      to: "2026-09-15",
    });
  });
});

describe("indicadores", () => {
  const sessions = [
    session("s1", "2026-09-10", [{ weight: 20, reps: 10 }]),
    // Duas sessões no MESMO dia: dois treinos, um dia treinado.
    session("s2", "2026-09-12", [{ weight: 20, reps: 10 }]),
    session("s3", "2026-09-12", [
      { weight: 25, reps: 10 },
      { weight: 25, reps: 8 },
    ]),
  ];
  const data = applyFilters(sessions, EXERCISES, PLANS, {
    range: { from: "2026-09-01", to: "2026-09-30" },
  });

  it("treinos, dias e séries são três contagens diferentes", () => {
    const [treinos, dias, series] = indicators(data, null);
    expect(treinos.value).toBe(3);
    expect(dias.value).toBe(2);
    expect(series.value).toBe(4);
  });

  it("sessão em andamento não conta como treino realizado", () => {
    const withOpen = [
      ...sessions,
      session("s4", "2026-09-15", [{ weight: 30, reps: 10 }], {
        status: "em_andamento",
      }),
    ];
    const d = applyFilters(withOpen, EXERCISES, PLANS, {
      range: { from: "2026-09-01", to: "2026-09-30" },
    });
    expect(indicators(d, null)[0].value).toBe(3);
  });

  it("a variação é em quantidade — sair de 0 para 3 não vira +300%", () => {
    const empty = applyFilters([], EXERCISES, PLANS, {
      range: { from: "2026-08-02", to: "2026-08-31" },
    });
    const [treinos] = indicators(data, empty);
    expect(treinos.delta).toBe(3);
    expect(Object.keys(treinos)).not.toContain("deltaPct");
  });

  it("sem intervalo comparável, diz que não há comparação", () => {
    const [treinos] = indicators(data, null);
    expect(treinos.delta).toBeUndefined();
    expect(treinos.comparisonUnavailableReason).toMatch(/sem compara/i);
  });
});

describe("loadProgressions — critério estreito de propósito", () => {
  const range = { from: "2026-09-01", to: "2026-09-30" };
  const filtered = (sessions: WorkoutSession[]) =>
    applyFilters(sessions, EXERCISES, PLANS, { range }).sets;

  it("três sessões com a mesma referência entram no ranking", () => {
    const sets = filtered([
      session("s1", "2026-09-01", [{ weight: 20, reps: 10 }]),
      session("s2", "2026-09-08", [{ weight: 22, reps: 10 }]),
      session("s3", "2026-09-15", [{ weight: 25, reps: 10 }]),
    ]);
    const [p] = loadProgressions(sets);
    expect(p.name).toBe("Remada");
    expect(p.reps).toBe(10);
    expect(p.firstWeight).toBe(20);
    expect(p.lastWeight).toBe(25);
    expect(p.deltaKg).toBe(5);
    expect(p.deltaPct).toBe(25);
    expect(p.sessionCount).toBe(3);
  });

  it("duas sessões não bastam", () => {
    const sets = filtered([
      session("s1", "2026-09-01", [{ weight: 20, reps: 10 }]),
      session("s2", "2026-09-08", [{ weight: 30, reps: 10 }]),
    ]);
    expect(loadProgressions(sets)).toEqual([]);
  });

  it("repetições diferentes não se comparam: 30kg×5 não sucede 30kg×12", () => {
    const sets = filtered([
      session("s1", "2026-09-01", [{ weight: 20, reps: 12 }]),
      session("s2", "2026-09-08", [{ weight: 25, reps: 8 }]),
      session("s3", "2026-09-15", [{ weight: 30, reps: 5 }]),
    ]);
    expect(loadProgressions(sets)).toEqual([]);
  });

  it("trocar de equipamento não vira degrau na mesma curva", () => {
    const exercises = [ex(), ex({ id: "ex-2", lineageId: "lin-remada", equipment: "maquina" })];
    const sessions = [
      session("s1", "2026-09-01", [{ weight: 20, reps: 10 }]),
      session("s2", "2026-09-08", [{ weight: 22, reps: 10 }]),
      session("s3", "2026-09-15", [{ weight: 60, reps: 10 }], {
        exerciseLogs: [
          { exerciseId: "ex-2", done: true, sets: [{ setIndex: 0, weight: 60, reps: 10 }] },
        ],
      }),
    ];
    const sets = resolveSets(sessions, exercises, PLANS);
    // Só 2 sessões na barra e 1 na máquina — nenhum grupo atinge o mínimo.
    expect(loadProgressions(sets)).toEqual([]);
  });

  it("exercício assistido ou sem carga externa fica fora do ranking de kg", () => {
    const exercises = [ex({ equipment: "assistido" })];
    const sessions = [
      session("s1", "2026-09-01", [{ weight: 30, reps: 10 }]),
      session("s2", "2026-09-08", [{ weight: 20, reps: 10 }]),
      session("s3", "2026-09-15", [{ weight: 10, reps: 10 }]),
    ];
    expect(loadProgressions(resolveSets(sessions, exercises, PLANS))).toEqual([]);
  });

  it("carga que não subiu não é progressão", () => {
    const sets = filtered([
      session("s1", "2026-09-01", [{ weight: 25, reps: 10 }]),
      session("s2", "2026-09-08", [{ weight: 25, reps: 10 }]),
      session("s3", "2026-09-15", [{ weight: 25, reps: 10 }]),
    ]);
    expect(loadProgressions(sets)).toEqual([]);
  });

  it("usa a MELHOR carga de cada sessão na referência", () => {
    const sets = filtered([
      session("s1", "2026-09-01", [
        { weight: 20, reps: 10 },
        { weight: 22, reps: 10 },
      ]),
      session("s2", "2026-09-08", [{ weight: 24, reps: 10 }]),
      session("s3", "2026-09-15", [
        { weight: 26, reps: 10 },
        { weight: 20, reps: 10 },
      ]),
    ]);
    const [p] = loadProgressions(sets);
    expect(p.firstWeight).toBe(22);
    expect(p.lastWeight).toBe(26);
  });
});

describe("gráfico", () => {
  const sessions = [
    session("s1", "2026-09-01", [
      { weight: 20, reps: 10 },
      { weight: 25, reps: 6 },
    ]),
    session("s2", "2026-09-05", [{ weight: 22, reps: 10 }]),
    // Mesmo dia, outra sessão: dois pontos distintos.
    session("s3", "2026-09-05", [{ weight: 24, reps: 10 }]),
  ];
  const sets = setsOf(sessions);

  it("modo carga: um ponto por sessão com aquelas repetições", () => {
    const points = exerciseChartSeries(sets, "lin-remada", "carga", 10);
    expect(points.map((p) => p.value)).toEqual([20, 22, 24]);
    expect(points).toHaveLength(3);
  });

  it("duas sessões no mesmo dia continuam sendo dois pontos", () => {
    const points = exerciseChartSeries(sets, "lin-remada", "carga", 10);
    expect(points.filter((p) => p.date === "2026-09-05")).toHaveLength(2);
  });

  it("modo repetições: só a carga exata escolhida", () => {
    const points = exerciseChartSeries(sets, "lin-remada", "repeticoes", 20);
    expect(points.map((p) => p.value)).toEqual([10]);
  });

  it("referência sem registro não desenha nada, em vez de interpolar", () => {
    expect(exerciseChartSeries(sets, "lin-remada", "carga", 7)).toEqual([]);
  });

  it("as referências oferecidas são as que existem no histórico", () => {
    expect(availableReferences(sets, "lin-remada", "carga").map((r) => r.value)).toEqual([10, 6]);
    expect(availableReferences(sets, "lin-remada", "repeticoes").map((r) => r.value)).toContain(20);
  });

  it("a lista de exercícios traz a última data e a contagem de sessões", () => {
    const [first] = exercisesInData(sets);
    expect(first.name).toBe("Remada");
    expect(first.sessions).toBe(3);
    expect(first.lastDate).toBe("2026-09-05");
  });
});

describe("distribuição", () => {
  it("cada série entra em um grupo só — a soma bate com o total de séries", () => {
    const exercises = [ex(), ex({ id: "ex-2", lineageId: "lin-supino", muscleGroup: "peito" })];
    const sessions = [
      session("s1", "2026-09-01", [{ weight: 20, reps: 10 }], {
        exerciseLogs: [
          { exerciseId: "ex-1", done: true, sets: [{ setIndex: 0, weight: 20, reps: 10 }] },
          {
            exerciseId: "ex-2",
            done: true,
            sets: [
              { setIndex: 0, weight: 40, reps: 10 },
              { setIndex: 1, weight: 40, reps: 8 },
            ],
          },
        ],
      }),
    ];
    const sets = resolveSets(sessions, exercises, PLANS);
    const bars = muscleDistribution(sets);
    expect(bars.reduce((sum, b) => sum + b.value, 0)).toBe(sets.length);
    expect(bars.find((b) => b.key === "peito")?.value).toBe(2);
    expect(bars.find((b) => b.key === "costas")?.value).toBe(1);
  });

  it("exercício sem classificação vira 'Não classificado', não um palpite", () => {
    const exercises = [ex({ muscleGroup: undefined })];
    const sets = resolveSets(
      [session("s1", "2026-09-01", [{ weight: 20, reps: 10 }])],
      exercises,
      PLANS,
    );
    const [bar] = muscleDistribution(sets);
    expect(bar.key).toBe(UNCLASSIFIED);
    expect(bar.label).toBe("Não classificado");
  });

  it("treinos são contados pela identidade estável, não pela letra", () => {
    const sessions = [
      session("s1", "2026-09-01", [{ weight: 20, reps: 10 }], {
        planLineageId: "lin-a1",
        planLabel: "A · Costas",
      }),
      // Outra ficha "A", de outra etapa: treino diferente.
      session("s2", "2026-09-03", [{ weight: 20, reps: 10 }], {
        planLineageId: "lin-a2",
        planLabel: "A · Costas e bíceps",
      }),
      session("s3", "2026-09-05", [{ weight: 20, reps: 10 }], {
        planLineageId: "lin-a1",
        planLabel: "A · Costas",
      }),
    ];
    const bars = workoutDistribution(sessions);
    expect(bars).toHaveLength(2);
    expect(bars[0]).toMatchObject({ key: "lin-a1", value: 2 });
  });
});

describe("recordes pessoais", () => {
  const range = { from: "2026-09-01", to: "2026-09-30" };

  it("o primeiro registro não é anunciado como recorde superado", () => {
    const sets = setsOf([session("s1", "2026-09-05", [{ weight: 20, reps: 10 }])]);
    expect(personalRecords(sets, range)).toEqual([]);
  });

  it("mais carga com as mesmas repetições é recorde", () => {
    const sets = setsOf([
      session("s1", "2026-09-01", [{ weight: 20, reps: 10 }]),
      session("s2", "2026-09-08", [{ weight: 25, reps: 10 }]),
    ]);
    const [r] = personalRecords(sets, range);
    expect(r).toMatchObject({ kind: "carga", weight: 25, reps: 10, previousWeight: 20 });
  });

  it("mais repetições com a mesma carga é recorde", () => {
    const sets = setsOf([
      session("s1", "2026-09-01", [{ weight: 20, reps: 10 }]),
      session("s2", "2026-09-08", [{ weight: 20, reps: 12 }]),
    ]);
    const [r] = personalRecords(sets, range);
    expect(r).toMatchObject({ kind: "repeticoes", reps: 12, previousReps: 10 });
  });

  it("empate não é recorde novo", () => {
    const sets = setsOf([
      session("s1", "2026-09-01", [{ weight: 20, reps: 10 }]),
      session("s2", "2026-09-08", [{ weight: 20, reps: 10 }]),
    ]);
    expect(personalRecords(sets, range)).toEqual([]);
  });

  it("séries equivalentes da mesma sessão rendem um recorde só", () => {
    const sets = setsOf([
      session("s1", "2026-09-01", [{ weight: 20, reps: 10 }]),
      session("s2", "2026-09-08", [
        { weight: 25, reps: 10 },
        { weight: 26, reps: 10 },
        { weight: 27, reps: 10 },
      ]),
    ]);
    expect(personalRecords(sets, range)).toHaveLength(1);
  });

  it("compara com o histórico anterior mesmo fora do período visível", () => {
    const sets = setsOf([
      session("s0", "2026-05-01", [{ weight: 40, reps: 10 }]),
      session("s1", "2026-09-08", [{ weight: 30, reps: 10 }]),
    ]);
    // 30kg é menos que os 40kg de maio: encurtar a janela não fabrica recorde.
    expect(personalRecords(sets, range)).toEqual([]);
  });
});

describe("filtros", () => {
  const sessions = [
    session("s1", "2026-09-05", [{ weight: 20, reps: 10 }], {
      planLineageId: "lin-a",
      planLabel: "A",
    }),
    session("s2", "2026-09-06", [{ weight: 50, reps: 10 }], {
      planLineageId: "lin-b",
      planLabel: "B",
    }),
  ];

  it("filtrar por treino remove as sessões dos outros", () => {
    const d = applyFilters(sessions, EXERCISES, PLANS, {
      range: { from: "2026-09-01", to: "2026-09-30" },
      planLineageIds: ["lin-a"],
    });
    expect(d.sessions).toHaveLength(1);
    expect(d.sets).toHaveLength(1);
  });

  it("o escopo da etapa manda sobre o período escolhido", () => {
    const d = applyFilters(sessions, EXERCISES, PLANS, {
      range: { from: "2026-09-01", to: "2026-09-30" },
      scope: { from: "2026-09-06", to: "2026-09-10" },
    });
    expect(d.effectiveRange).toEqual({ from: "2026-09-06", to: "2026-09-10" });
    expect(d.sessions.map((s) => s.id)).toEqual(["s2"]);
  });

  it("indicadores e séries partem do mesmo conjunto filtrado", () => {
    const d = applyFilters(sessions, EXERCISES, PLANS, {
      range: { from: "2026-09-01", to: "2026-09-30" },
      planLineageIds: ["lin-b"],
    });
    const [treinos, , series] = indicators(d, null);
    expect(treinos.value).toBe(d.sessions.length);
    expect(series.value).toBe(d.sets.length);
  });
});
