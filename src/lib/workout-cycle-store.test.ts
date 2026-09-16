import { describe, it, expect, vi } from "vitest";

// Só seletores puros, mas o módulo importa o client do Supabase no topo —
// mesmo mock dos outros testes de store.
vi.mock("./supabase/client", () => ({
  supabase: {
    from: () => ({ select: () => ({ order: () => Promise.resolve({ data: [], error: null }) }) }),
  },
  ensureSession: async () => "test-user",
  useSupabaseUserId: () => "test-user",
}));

import {
  blockRangesFrom,
  blockOn,
  blockDurationDays,
  nextBlockAfter,
  todayProgramming,
  plannedSessionsInRange,
  cycleProgress,
  evaluateCycleGoal,
  type BlockDay,
  type CycleBlock,
  type CycleGoal,
  type WorkoutCycle,
} from "./workout-cycle-store";
import {
  exerciseSeriesByLineage,
  maxWeightAtReps,
  volumeForLineage,
  type Exercise,
  type WorkoutSession,
} from "./workout-store";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeCycle(o: Partial<WorkoutCycle> = {}): WorkoutCycle {
  return {
    id: "cyc-1",
    name: "Ciclo de 45 dias",
    startDate: "2026-09-01",
    endDate: "2026-10-15",
    status: "ativo",
    createdAt: "2026-09-01T00:00:00.000Z",
    ...o,
  };
}

function makeBlock(o: Partial<CycleBlock> = {}): CycleBlock {
  return {
    id: "blk-1",
    cycleId: "cyc-1",
    name: "Bloco 1",
    startDate: "2026-09-01",
    endDate: "2026-09-10",
    order: 0,
    ...o,
  };
}

function makeSession(o: Partial<WorkoutSession> = {}): WorkoutSession {
  return {
    id: "s-1",
    planId: "plan-1",
    date: "2026-09-02",
    startedAt: "2026-09-02T10:00:00.000Z",
    finishedAt: "2026-09-02T11:00:00.000Z",
    exerciseLogs: [],
    status: "concluido",
    pausedSeconds: 0,
    restPausedSeconds: 0,
    ...o,
  };
}

function makeExercise(o: Partial<Exercise> = {}): Exercise {
  return {
    id: "ex-1",
    planId: "plan-1",
    lineageId: "lin-supino",
    name: "Supino",
    setsTarget: 3,
    repsTarget: 10,
    loadTarget: 40,
    restSeconds: 90,
    order: 0,
    ...o,
  };
}

function makeGoal(o: Partial<CycleGoal> = {}): CycleGoal {
  return {
    id: "g-1",
    cycleId: "cyc-1",
    kind: "carga",
    exerciseLineageId: "lin-supino",
    startValue: 40,
    targetValue: 60,
    unit: "kg",
    createdAt: "2026-09-01T00:00:00.000Z",
    ...o,
  };
}

// ---------------------------------------------------------------------------

describe("blockRangesFrom — blocos consecutivos, sem sobreposição nem buraco", () => {
  it("o ciclo de 45 dias em 10 / 15 / 20", () => {
    const ranges = blockRangesFrom("2026-09-01", [10, 15, 20]);
    expect(ranges).toEqual([
      { startDate: "2026-09-01", endDate: "2026-09-10" },
      { startDate: "2026-09-11", endDate: "2026-09-25" },
      { startDate: "2026-09-26", endDate: "2026-10-15" },
    ]);
  });

  it("cada bloco começa exatamente no dia seguinte ao fim do anterior", () => {
    const ranges = blockRangesFrom("2026-01-28", [5, 5, 5]);
    for (let i = 1; i < ranges.length; i += 1) {
      const prevEnd = new Date(ranges[i - 1].endDate + "T00:00:00");
      const start = new Date(ranges[i].startDate + "T00:00:00");
      expect((start.getTime() - prevEnd.getTime()) / 86400000).toBe(1);
    }
  });

  it("duração inválida vira 1 dia em vez de um intervalo invertido", () => {
    expect(blockRangesFrom("2026-09-01", [0, -3])).toEqual([
      { startDate: "2026-09-01", endDate: "2026-09-01" },
      { startDate: "2026-09-02", endDate: "2026-09-02" },
    ]);
  });

  it("atravessa a virada do mês e do ano sem perder um dia", () => {
    const [range] = blockRangesFrom("2026-12-28", [10]);
    expect(range.endDate).toBe("2027-01-06");
    expect(blockDurationDays(range)).toBe(10);
  });
});

describe("blockOn / nextBlockAfter", () => {
  const blocks = blockRangesFrom("2026-09-01", [10, 15, 20]).map((r, i) =>
    makeBlock({ id: `blk-${i}`, name: `Bloco ${i + 1}`, order: i, ...r }),
  );

  it("encontra o bloco que contém a data, incluindo as bordas", () => {
    expect(blockOn(blocks, "2026-09-01")?.id).toBe("blk-0");
    expect(blockOn(blocks, "2026-09-10")?.id).toBe("blk-0");
    expect(blockOn(blocks, "2026-09-11")?.id).toBe("blk-1");
    expect(blockOn(blocks, "2026-10-15")?.id).toBe("blk-2");
  });

  it("fora do ciclo não inventa bloco", () => {
    expect(blockOn(blocks, "2026-08-31")).toBeUndefined();
    expect(blockOn(blocks, "2026-10-16")).toBeUndefined();
  });

  it("aponta a próxima mudança", () => {
    expect(nextBlockAfter(blocks, "2026-09-05")?.id).toBe("blk-1");
    expect(nextBlockAfter(blocks, "2026-10-01")).toBeUndefined();
  });
});

describe("todayProgramming — nunca combina duas programações em silêncio", () => {
  const cycle = makeCycle();
  const block = makeBlock({ startDate: "2026-09-01", endDate: "2026-09-30" });
  // Terça (weekday 2) tem treino; quarta é descanso explícito.
  const days: BlockDay[] = [
    { id: "d1", blockId: "blk-1", weekday: 2, planId: "plan-ciclo" },
    { id: "d2", blockId: "blk-1", weekday: 3, planId: null },
  ];
  const weekly = {
    0: null,
    1: null,
    2: "plan-semana",
    3: "plan-semana",
    4: null,
    5: null,
    6: null,
  };

  it("com ciclo ativo, o ciclo manda — e diz que é o ciclo", () => {
    const r = todayProgramming(
      { cycles: [cycle], blocks: [block], blockDays: days },
      weekly,
      "2026-09-08",
      2,
    );
    expect(r.source).toBe("ciclo");
    expect(r.planId).toBe("plan-ciclo");
    expect(r.cycle?.id).toBe("cyc-1");
  });

  it("descanso do ciclo é escolha explícita, não ausência de treino", () => {
    const r = todayProgramming(
      { cycles: [cycle], blocks: [block], blockDays: days },
      weekly,
      "2026-09-09",
      3,
    );
    expect(r.source).toBe("descanso");
    expect(r.planId).toBeNull();
  });

  it("dia sem linha no bloco não cai no plano da semana por baixo dos panos", () => {
    const r = todayProgramming(
      { cycles: [cycle], blocks: [block], blockDays: days },
      weekly,
      "2026-09-07",
      1,
    );
    expect(r.source).toBe("nenhum");
    expect(r.planId).toBeNull();
  });

  it("fora dos blocos, avisa em vez de escolher sozinho", () => {
    const r = todayProgramming(
      { cycles: [cycle], blocks: [block], blockDays: days },
      weekly,
      "2026-10-05",
      2,
    );
    expect(r.outsideBlocks).toBe(true);
    expect(r.planId).toBeNull();
  });

  it("sem ciclo ativo, vale o plano da semana", () => {
    const rascunho = makeCycle({ status: "rascunho" });
    const r = todayProgramming(
      { cycles: [rascunho], blocks: [block], blockDays: days },
      weekly,
      "2026-09-08",
      2,
    );
    expect(r.source).toBe("semana");
    expect(r.planId).toBe("plan-semana");
  });
});

describe("plannedSessionsInRange — conta treinos programados, não dias corridos", () => {
  const block = makeBlock({ startDate: "2026-09-01", endDate: "2026-09-14" }); // 2 semanas
  const days: BlockDay[] = [
    { id: "d1", blockId: "blk-1", weekday: 1, planId: "p" },
    { id: "d2", blockId: "blk-1", weekday: 3, planId: "p" },
    { id: "d3", blockId: "blk-1", weekday: 5, planId: null }, // descanso não conta
  ];

  it("três treinos por semana viram 4 em duas semanas com 2 dias marcados", () => {
    expect(plannedSessionsInRange([block], days, "2026-09-01", "2026-09-14")).toBe(4);
  });

  it("recorta pelo intervalo pedido, não pelo bloco inteiro", () => {
    expect(plannedSessionsInRange([block], days, "2026-09-01", "2026-09-07")).toBe(2);
  });

  it("bloco sem dia marcado programa zero, não o número de dias", () => {
    expect(plannedSessionsInRange([block], [], "2026-09-01", "2026-09-14")).toBe(0);
  });
});

describe("cycleProgress — tempo, treinos e metas são três números separados", () => {
  const cycle = makeCycle({ startDate: "2026-09-01", endDate: "2026-09-14" });
  const block = makeBlock({ startDate: "2026-09-01", endDate: "2026-09-14" });
  const days: BlockDay[] = [
    { id: "d1", blockId: "blk-1", weekday: 1, planId: "p" },
    { id: "d2", blockId: "blk-1", weekday: 3, planId: "p" },
  ];

  it("metade do prazo com nenhum treino feito não vira 50% de progresso", () => {
    const p = cycleProgress(cycle, [block], days, [], [], "2026-09-07");
    expect(p.elapsedDays).toBe(7);
    expect(p.totalDays).toBe(14);
    expect(p.doneSessions).toBe(0);
    expect(p.plannedSessions).toBe(2);
    // Os dois números convivem: 50% do tempo, 0% do planejamento.
    expect(p.doneSessions / p.plannedSessions).toBe(0);
  });

  it("conta só sessões concluídas dentro do ciclo", () => {
    const sessions = [
      makeSession({ id: "a", date: "2026-09-02" }),
      makeSession({ id: "b", date: "2026-08-25" }), // antes do ciclo
      makeSession({ id: "c", date: "2026-09-03", status: "em_andamento" }),
    ];
    const p = cycleProgress(cycle, [block], days, sessions, [], "2026-09-07");
    expect(p.doneSessions).toBe(1);
  });

  it("depois do fim, o tempo transcorrido para no total em vez de estourar", () => {
    const p = cycleProgress(cycle, [block], days, [], [], "2026-12-01");
    expect(p.elapsedDays).toBe(14);
    expect(p.totalDays).toBe(14);
  });

  it("antes do início, nada transcorreu", () => {
    const p = cycleProgress(cycle, [block], days, [], [], "2026-08-20");
    expect(p.elapsedDays).toBe(0);
  });

  it("metas atingidas vêm da avaliação real, não de contagem de blocos", () => {
    const p = cycleProgress(
      cycle,
      [block],
      days,
      [],
      [{ reached: true }, { reached: false }],
      "2026-09-07",
    );
    expect(p.goalsReached).toBe(1);
    expect(p.goalsTotal).toBe(2);
  });
});

describe("maxWeightAtReps — carga sem ignorar as repetições", () => {
  const exercises = [makeExercise()];
  const sessions = [
    makeSession({
      id: "s1",
      date: "2026-09-02",
      exerciseLogs: [
        {
          exerciseId: "ex-1",
          done: true,
          sets: [
            { setIndex: 0, weight: 80, reps: 3 },
            { setIndex: 1, weight: 60, reps: 10 },
          ],
        },
      ],
    }),
  ];

  it("80kg×3 não conta para uma meta de 8 repetições", () => {
    expect(maxWeightAtReps(sessions, exercises, "lin-supino", 8)).toBe(60);
  });

  it("com referência baixa, o pico pesado passa a valer", () => {
    expect(maxWeightAtReps(sessions, exercises, "lin-supino", 3)).toBe(80);
  });

  it("linhagem diferente não é contada", () => {
    expect(maxWeightAtReps(sessions, exercises, "lin-outra", 1)).toBe(0);
  });
});

describe("linhagem — a evolução atravessa as cópias entre blocos", () => {
  // O mesmo exercício copiado do bloco 1 pro bloco 2: ids diferentes, linhagem
  // igual. É o caso que o ciclo cria toda vez que um bloco copia o anterior.
  const exercises = [
    makeExercise({ id: "ex-b1", planId: "plan-b1", lineageId: "lin-supino" }),
    makeExercise({ id: "ex-b2", planId: "plan-b2", lineageId: "lin-supino" }),
  ];
  const sessions = [
    makeSession({
      id: "s1",
      date: "2026-09-02",
      planId: "plan-b1",
      exerciseLogs: [
        { exerciseId: "ex-b1", done: true, sets: [{ setIndex: 0, weight: 40, reps: 10 }] },
      ],
    }),
    makeSession({
      id: "s2",
      date: "2026-09-20",
      planId: "plan-b2",
      exerciseLogs: [
        { exerciseId: "ex-b2", done: true, sets: [{ setIndex: 0, weight: 50, reps: 10 }] },
      ],
    }),
  ];

  it("a curva é uma só, não recomeça no bloco novo", () => {
    expect(exerciseSeriesByLineage(sessions, exercises, "lin-supino")).toEqual([
      { date: "2026-09-02", maxWeight: 40 },
      { date: "2026-09-20", maxWeight: 50 },
    ]);
  });

  it("volume soma os dois blocos", () => {
    expect(volumeForLineage(sessions, exercises, "lin-supino")).toEqual({ sets: 2, reps: 20 });
  });

  it("uma sessão de um exercício excluído continua na curva pelo retrato", () => {
    const orphan = makeSession({
      id: "s3",
      date: "2026-10-01",
      plannedSnapshot: [
        {
          exerciseId: "ex-apagado",
          lineageId: "lin-supino",
          name: "Supino",
          order: 0,
          setsTarget: 3,
          repsTarget: 10,
          loadTarget: 55,
          restSeconds: 90,
          setTargets: [],
        },
      ],
      exerciseLogs: [
        { exerciseId: "ex-apagado", done: true, sets: [{ setIndex: 0, weight: 55, reps: 10 }] },
      ],
    });
    const series = exerciseSeriesByLineage([...sessions, orphan], exercises, "lin-supino");
    expect(series.at(-1)).toEqual({ date: "2026-10-01", maxWeight: 55 });
  });
});

describe("evaluateCycleGoal", () => {
  const cycle = makeCycle({ startDate: "2026-09-01", endDate: "2026-10-15" });
  const blocks = [makeBlock()];
  const base = { cycle, blocks, blockDays: [] as BlockDay[], bodyWeights: [] };

  it("sem registro nenhum, não finge medição", () => {
    const ev = evaluateCycleGoal(
      makeGoal(),
      { ...base, sessions: [], exercises: [] },
      "2026-09-10",
    );
    expect(ev.hasData).toBe(false);
    expect(ev.reached).toBe(false);
    expect(ev.current).toBe(40); // permanece no ponto de partida declarado
  });

  it("carga: só séries com as repetições de referência movem a meta", () => {
    const exercises = [makeExercise()];
    const sessions = [
      makeSession({
        date: "2026-09-05",
        exerciseLogs: [
          {
            exerciseId: "ex-1",
            done: true,
            sets: [
              { setIndex: 0, weight: 70, reps: 4 },
              { setIndex: 1, weight: 50, reps: 8 },
            ],
          },
        ],
      }),
    ];
    const ev = evaluateCycleGoal(
      makeGoal({ referenceReps: 8 }),
      { ...base, sessions, exercises },
      "2026-09-10",
    );
    expect(ev.current).toBe(50);
    expect(ev.progress).toBeCloseTo(0.5); // 40 -> 60, está em 50
    expect(ev.reached).toBe(false);
  });

  it("peso corporal caindo: a meta é atingida ao chegar ABAIXO do alvo", () => {
    const goal = makeGoal({ kind: "peso_corporal", startValue: 90, targetValue: 84, unit: "kg" });
    const ev = evaluateCycleGoal(
      goal,
      {
        ...base,
        sessions: [],
        exercises: [],
        bodyWeights: [{ id: "w1", date: "2026-09-20", weight: 83.5 }],
      },
      "2026-09-21",
    );
    expect(ev.reached).toBe(true);
    expect(ev.progress).toBe(1);
  });

  it("frequência conta treinos concluídos no período da meta", () => {
    const goal = makeGoal({
      kind: "frequencia",
      exerciseLineageId: undefined,
      startValue: 0,
      targetValue: 3,
      unit: "treinos",
    });
    const sessions = [
      makeSession({ id: "a", date: "2026-09-02" }),
      makeSession({ id: "b", date: "2026-09-04" }),
      makeSession({ id: "c", date: "2026-11-01" }), // fora do ciclo
    ];
    const ev = evaluateCycleGoal(goal, { ...base, sessions, exercises: [] }, "2026-09-10");
    expect(ev.current).toBe(2);
    expect(ev.reached).toBe(false);
  });

  it("meta de bloco mede só dentro do bloco, não do ciclo inteiro", () => {
    const goal = makeGoal({
      kind: "frequencia",
      exerciseLineageId: undefined,
      blockId: "blk-1",
      startValue: 0,
      targetValue: 5,
      unit: "treinos",
    });
    const sessions = [
      makeSession({ id: "a", date: "2026-09-05" }), // dentro do bloco (01–10)
      makeSession({ id: "b", date: "2026-09-20" }), // fora
    ];
    const ev = evaluateCycleGoal(goal, { ...base, sessions, exercises: [] }, "2026-09-30");
    expect(ev.current).toBe(1);
  });

  it("progresso nunca passa de 100% nem fica negativo", () => {
    const exercises = [makeExercise()];
    const sessions = [
      makeSession({
        date: "2026-09-05",
        exerciseLogs: [
          { exerciseId: "ex-1", done: true, sets: [{ setIndex: 0, weight: 200, reps: 10 }] },
        ],
      }),
    ];
    const ev = evaluateCycleGoal(
      makeGoal({ referenceReps: 8 }),
      { ...base, sessions, exercises },
      "2026-09-10",
    );
    expect(ev.progress).toBe(1);
    expect(ev.reached).toBe(true);
  });
});
