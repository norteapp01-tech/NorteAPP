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
  sessionElapsedSeconds,
  restRemainingSeconds,
  exerciseCompletionState,
  nextPendingExerciseId,
  openSession,
  sessionPlanned,
  restBaseSeconds,
  restState,
  DEFAULT_REST_SECONDS,
  type WorkoutSession,
  type Exercise,
  type PlannedExercise,
} from "./workout-store";

function makeExercise(overrides: Partial<Exercise> = {}): Exercise {
  return {
    id: "ex-1",
    planId: "plan-a",
    lineageId: "lin-ex-1",
    name: "Supino reto",
    setsTarget: 3,
    repsTarget: 10,
    loadTarget: 40,
    restSeconds: 90,
    order: 0,
    secondaryMuscles: [],
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
    pausedSeconds: 0,
    restPausedSeconds: 0,
    restOverrides: {},
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

// ---------------------------------------------------------------------------
// Controle do treino em andamento — os dois relógios, o avanço com volta ao
// início e os três estados de conclusão.
// ---------------------------------------------------------------------------

function makePlanned(overrides: Partial<PlannedExercise> = {}): PlannedExercise {
  return {
    exerciseId: "ex-1",
    name: "Supino reto",
    order: 0,
    setsTarget: 3,
    repsTarget: 10,
    loadTarget: 40,
    restSeconds: 90,
    setTargets: [
      { reps: 10, weight: 40, restSeconds: 90 },
      { reps: 10, weight: 40, restSeconds: 90 },
      { reps: 8, weight: 45, restSeconds: 120 },
    ],
    ...overrides,
  };
}

const T0 = Date.parse("2026-09-15T10:00:00.000Z");

describe("sessionElapsedSeconds — tempo por relógio, não por contagem de ticks", () => {
  it("sessão aberta: mede a diferença até agora, sem depender de a aba ter ficado visível", () => {
    const s = makeSession({ status: "em_andamento", startedAt: "2026-09-15T10:00:00.000Z" });
    delete (s as { finishedAt?: string }).finishedAt;
    // Vinte minutos de relógio — o mesmo valor que apareceria depois de
    // recarregar a página, que é justamente o que o contador antigo perdia.
    expect(sessionElapsedSeconds(s, T0 + 20 * 60_000)).toBe(20 * 60);
  });

  it("pausa em aberto desconta o tempo parado e congela o mostrador", () => {
    const s = makeSession({
      status: "em_andamento",
      startedAt: "2026-09-15T10:00:00.000Z",
      pausedAt: "2026-09-15T10:10:00.000Z",
    });
    delete (s as { finishedAt?: string }).finishedAt;
    expect(sessionElapsedSeconds(s, T0 + 10 * 60_000)).toBe(10 * 60);
    // Mais cinco minutos pausado: continua marcando dez.
    expect(sessionElapsedSeconds(s, T0 + 15 * 60_000)).toBe(10 * 60);
  });

  it("pausas já encerradas ficam descontadas para sempre", () => {
    const s = makeSession({
      status: "em_andamento",
      startedAt: "2026-09-15T10:00:00.000Z",
      pausedSeconds: 300,
    });
    delete (s as { finishedAt?: string }).finishedAt;
    expect(sessionElapsedSeconds(s, T0 + 20 * 60_000)).toBe(15 * 60);
  });

  it("sessão finalizada para de crescer — o resumo mostra o mesmo valor toda vez que abre", () => {
    const s = makeSession({
      startedAt: "2026-09-15T10:00:00.000Z",
      finishedAt: "2026-09-15T11:00:00.000Z",
    });
    expect(sessionElapsedSeconds(s, T0 + 2 * 3600_000)).toBe(3600);
    expect(sessionElapsedSeconds(s, T0 + 9 * 3600_000)).toBe(3600);
  });
});

describe("restRemainingSeconds — descanso independente da pausa do treino", () => {
  const base = () =>
    makeSession({
      status: "em_andamento",
      restStartedAt: "2026-09-15T10:00:00.000Z",
      restTotalSeconds: 90,
    });

  it("conta para baixo e para no zero, sem virar negativo", () => {
    expect(restRemainingSeconds(base(), T0 + 30_000)).toBe(60);
    expect(restRemainingSeconds(base(), T0 + 200_000)).toBe(0);
  });

  it("sem descanso em andamento retorna null, não zero", () => {
    // Zero significa "acabou agora"; null significa "não tem descanso". A
    // interface mostra coisas diferentes nos dois casos.
    expect(restRemainingSeconds(makeSession({ status: "em_andamento" }))).toBeNull();
  });

  it("descanso pausado congela, e retomar não perde o que já correu", () => {
    const paused = { ...base(), restPausedAt: "2026-09-15T10:00:30.000Z" };
    expect(restRemainingSeconds(paused, T0 + 30_000)).toBe(60);
    expect(restRemainingSeconds(paused, T0 + 120_000)).toBe(60);
    const resumed = { ...base(), restPausedSeconds: 90 };
    expect(restRemainingSeconds(resumed, T0 + 120_000)).toBe(60);
  });

  it("pausar o TREINO não pausa o descanso", () => {
    const s = { ...base(), pausedAt: "2026-09-15T10:00:00.000Z" };
    expect(restRemainingSeconds(s, T0 + 30_000)).toBe(60);
  });
});

describe("exerciseCompletionState — parcial não é o mesmo que não realizado", () => {
  const planned = makePlanned();

  it("sem série nenhuma: não realizado", () => {
    expect(exerciseCompletionState(undefined, planned)).toBe("nao_realizado");
    expect(exerciseCompletionState({ exerciseId: "ex-1", done: false, sets: [] }, planned)).toBe(
      "nao_realizado",
    );
  });

  it("menos séries que a meta: parcial", () => {
    const log = {
      exerciseId: "ex-1",
      done: false,
      sets: [{ setIndex: 0, weight: 40, reps: 10 }],
    };
    expect(exerciseCompletionState(log, planned)).toBe("parcial");
  });

  it("meta atingida ou marcado como feito: concluído", () => {
    const full = {
      exerciseId: "ex-1",
      done: false,
      sets: [
        { setIndex: 0, weight: 40, reps: 10 },
        { setIndex: 1, weight: 40, reps: 10 },
        { setIndex: 2, weight: 45, reps: 8 },
      ],
    };
    expect(exerciseCompletionState(full, planned)).toBe("concluido");
    expect(exerciseCompletionState({ exerciseId: "ex-1", done: true, sets: [] }, planned)).toBe(
      "concluido",
    );
  });
});

describe("nextPendingExerciseId — pula a máquina ocupada e volta para ela depois", () => {
  const planned = [
    makePlanned({ exerciseId: "remada", name: "Remada", order: 0 }),
    makePlanned({ exerciseId: "remada-alta", name: "Remada alta", order: 1 }),
    makePlanned({ exerciseId: "remada-baixa", name: "Remada baixa", order: 2 }),
  ];
  const done = (id: string) => ({ exerciseId: id, done: true, sets: [] });
  const empty = (id: string) => ({ exerciseId: id, done: false, sets: [] });

  it("avança para o próximo pendente na ordem", () => {
    const logs = [done("remada"), empty("remada-alta"), empty("remada-baixa")];
    expect(nextPendingExerciseId(planned, logs, "remada")).toBe("remada-alta");
  });

  it("dá a volta: terminando o último, volta para o que ficou pra trás", () => {
    // O caso real: a máquina da Remada alta estava ocupada, o usuário pulou
    // para a Remada baixa e terminou. O painel tem que voltar, não parar.
    const logs = [done("remada"), empty("remada-alta"), done("remada-baixa")];
    expect(nextPendingExerciseId(planned, logs, "remada-baixa")).toBe("remada-alta");
  });

  it("sem nenhum pendente retorna null — nunca escolhe um concluído", () => {
    const logs = [done("remada"), done("remada-alta"), done("remada-baixa")];
    expect(nextPendingExerciseId(planned, logs, "remada")).toBeNull();
  });

  it("um exercício parcial ainda conta como pendente", () => {
    const logs = [
      done("remada"),
      { exerciseId: "remada-alta", done: false, sets: [{ setIndex: 0, weight: 30, reps: 10 }] },
      done("remada-baixa"),
    ];
    expect(nextPendingExerciseId(planned, logs, "remada-baixa")).toBe("remada-alta");
  });
});

describe("openSession — treino aberto em outro dia não vira dado morto", () => {
  it("encontra a sessão em andamento mesmo sendo de ontem", () => {
    const yesterday = makeSession({ id: "s-ontem", date: "2026-09-14", status: "em_andamento" });
    const old = makeSession({ id: "s-velha", date: "2026-09-01" });
    expect(openSession([old, yesterday])?.id).toBe("s-ontem");
  });

  it("ignora sessões já concluídas", () => {
    expect(openSession([makeSession({ id: "s-1" })])).toBeUndefined();
  });
});

describe("sessionPlanned — editar a meta hoje não reescreve o treino de ontem", () => {
  it("usa o retrato gravado no início, não o exercício vivo", () => {
    const session = makeSession({
      plannedSnapshot: [makePlanned({ loadTarget: 40, name: "Supino reto" })],
    });
    // O exercício foi editado depois: 60kg e outro nome.
    const live = [makeExercise({ loadTarget: 60, name: "Supino reto (barra)" })];
    const planned = sessionPlanned(session, live);
    expect(planned[0].loadTarget).toBe(40);
    expect(planned[0].name).toBe("Supino reto");
  });

  it("um exercício excluído do treino continua aparecendo no histórico", () => {
    const session = makeSession({ plannedSnapshot: [makePlanned()] });
    expect(sessionPlanned(session, []).map((p) => p.exerciseId)).toEqual(["ex-1"]);
  });

  it("sessão antiga sem retrato cai no treino vivo, sem quebrar", () => {
    const session = makeSession();
    expect(sessionPlanned(session, [makeExercise()])[0].loadTarget).toBe(40);
  });
});

describe("sessionSummary — histórico sobrevive à exclusão do exercício", () => {
  it("o nome vem do retrato mesmo com o exercício apagado do treino", () => {
    const session = makeSession({
      plannedSnapshot: [makePlanned({ name: "Remada curvada", loadTarget: 50 })],
      exerciseLogs: [
        { exerciseId: "ex-1", done: true, sets: [{ setIndex: 0, weight: 50, reps: 10 }] },
      ],
    });
    // `exercises` vazio = exercício excluído do treino depois da sessão.
    const summary = sessionSummary(session, undefined, [], [session]);
    expect(summary.exercises).toHaveLength(1);
    expect(summary.exercises[0].name).toBe("Remada curvada");
    expect(summary.exercises[0].targetWeight).toBe(50);
  });
});

// ---------------------------------------------------------------------------
// Descanso — duração-base, tempo restante e estado de execução são TRÊS coisas
// distintas. Tratá-las como uma só era o que fazia o cronômetro sumir.
// ---------------------------------------------------------------------------

const REST_T0 = Date.parse("2026-09-16T10:00:00.000Z");

function restSession(o: Partial<WorkoutSession> = {}): WorkoutSession {
  const s = makeSession({ status: "em_andamento", ...o });
  delete (s as { finishedAt?: string }).finishedAt;
  return s;
}

describe("restBaseSeconds — de onde vem os 03:00", () => {
  it("usa o descanso cadastrado para a série", () => {
    expect(restBaseSeconds(restSession(), "ex-1", 90)).toBe(90);
  });

  it("a escolha temporária da sessão tem precedência sobre a ficha", () => {
    const s = restSession({ restOverrides: { "ex-1": 180 } });
    expect(restBaseSeconds(s, "ex-1", 90)).toBe(180);
  });

  it("a escolha vale só para o exercício dela — outro usa a própria ficha", () => {
    const s = restSession({ restOverrides: { "ex-1": 180 } });
    expect(restBaseSeconds(s, "ex-2", 45)).toBe(45);
  });

  it("sem configuração cai no padrão, nunca em zero", () => {
    expect(restBaseSeconds(restSession(), "ex-1", undefined)).toBe(DEFAULT_REST_SECONDS);
    expect(restBaseSeconds(restSession(), "ex-1", 0)).toBe(DEFAULT_REST_SECONDS);
  });
});

describe("restState — o descanso nunca desaparece", () => {
  it("sem nada iniciado: pronto, mostrando a duração-base", () => {
    const r = restState(restSession(), 180, REST_T0);
    expect(r.status).toBe("pronto");
    expect(r.remaining).toBe(180);
  });

  it("rodando: conta para baixo", () => {
    const s = restSession({ restStartedAt: "2026-09-16T10:00:00.000Z", restTotalSeconds: 180 });
    expect(restState(s, 180, REST_T0 + 80_000)).toMatchObject({
      status: "correndo",
      remaining: 100,
    });
  });

  it("pausado em 01:40 continua em 01:40, por mais que o relógio ande", () => {
    const s = restSession({
      restStartedAt: "2026-09-16T10:00:00.000Z",
      restTotalSeconds: 180,
      restPausedAt: "2026-09-16T10:01:20.000Z",
    });
    expect(restState(s, 180, REST_T0 + 80_000).remaining).toBe(100);
    expect(restState(s, 180, REST_T0 + 600_000).remaining).toBe(100);
    expect(restState(s, 180, REST_T0 + 600_000).status).toBe("pausado");
  });

  it("no fim fica em 00:00 e nunca fica negativo", () => {
    const s = restSession({ restStartedAt: "2026-09-16T10:00:00.000Z", restTotalSeconds: 180 });
    expect(restState(s, 180, REST_T0 + 180_000)).toMatchObject({ status: "fim", remaining: 0 });
    expect(restState(s, 180, REST_T0 + 999_000).remaining).toBe(0);
  });

  it("a base fica disponível em qualquer estado — é o que o Play recarrega", () => {
    const s = restSession({ restStartedAt: "2026-09-16T10:00:00.000Z", restTotalSeconds: 180 });
    expect(restState(s, 300, REST_T0 + 999_000).base).toBe(300);
  });

  it("pausar o TREINO não congela o descanso", () => {
    const s = restSession({
      restStartedAt: "2026-09-16T10:00:00.000Z",
      restTotalSeconds: 180,
      pausedAt: "2026-09-16T10:00:00.000Z",
    });
    expect(restState(s, 180, REST_T0 + 60_000).remaining).toBe(120);
  });
});

describe("reiniciar o descanso — volta ao cheio e fica PARADO", () => {
  it("marcar início e pausa no mesmo instante congela na duração-base", () => {
    // É exatamente o que `resetRest` grava; aqui verifico que o cálculo lê isso
    // como "cheio e parado", sem um estado paralelo só para "reiniciado".
    const s = restSession({
      restStartedAt: "2026-09-16T10:00:00.000Z",
      restPausedAt: "2026-09-16T10:00:00.000Z",
      restTotalSeconds: 180,
    });
    expect(restState(s, 180, REST_T0 + 500_000)).toMatchObject({
      status: "pausado",
      remaining: 180,
    });
  });
});
