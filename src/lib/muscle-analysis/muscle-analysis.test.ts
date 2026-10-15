// @vitest-environment node
import { describe, expect, it } from "vitest";
import type {
  Exercise,
  ExerciseLog,
  MuscleGroup,
  PlannedExercise,
  WorkoutPlan,
  WorkoutSession,
} from "../workout-store";
import { computeCompletion, evaluateExercise, type ScheduleInput } from "./completion";
import { computeEvolution, epley, weightedMedian } from "./evolution";
import { completionScore, completionStatus, evolutionScore } from "./scale";

// ---------------------------------------------------------------- fixtures
const plan = (id: string, letter: string): WorkoutPlan =>
  ({
    id,
    letter,
    name: letter,
    muscleGroups: "",
    order: 0,
    lineageId: `lin-${id}`,
  }) as unknown as WorkoutPlan;

let n = 0;
const ex = (
  planId: string,
  name: string,
  muscle: MuscleGroup,
  sets = 3,
  reps = 10,
  load = 20,
  secondary: MuscleGroup[] = [],
  equipment = "barra",
): Exercise =>
  ({
    id: `ex-${++n}`,
    planId,
    lineageId: `lin-ex-${n}`,
    name,
    setsTarget: sets,
    repsTarget: reps,
    loadTarget: load,
    restSeconds: 60,
    setTargets: Array.from({ length: sets }, () => ({ reps, weight: load, restSeconds: 60 })),
    muscleGroup: muscle,
    secondaryMuscles: secondary,
    equipment,
    order: n,
  }) as Exercise;

const snap = (e: Exercise): PlannedExercise => ({
  exerciseId: e.id,
  lineageId: e.lineageId,
  name: e.name,
  muscleGroup: e.muscleGroup,
  secondaryMuscles: e.secondaryMuscles,
  equipment: e.equipment,
  order: e.order,
  setsTarget: e.setsTarget,
  repsTarget: e.repsTarget,
  loadTarget: e.loadTarget,
  restSeconds: e.restSeconds,
  setTargets: e.setTargets!,
});

/** log: para cada exercício, lista de [peso, reps] feitas. */
const session = (
  p: WorkoutPlan,
  date: string,
  exs: Exercise[],
  done: Record<string, [number, number][]>,
  extra: Partial<WorkoutSession> = {},
): WorkoutSession =>
  ({
    id: `s-${date}-${p.id}`,
    planId: p.id,
    date,
    startedAt: date,
    status: "concluido",
    pausedSeconds: 0,
    restPausedSeconds: 0,
    restOverrides: {},
    planLineageId: p.lineageId,
    planLabel: p.letter,
    plannedSnapshot: exs.map(snap),
    exerciseLogs: exs.map((e): ExerciseLog => ({
      exerciseId: e.id,
      done: true,
      sets: (done[e.name] ?? []).map(([weight, reps], i) => ({ setIndex: i, weight, reps })),
    })),
    ...extra,
  }) as WorkoutSession;

const base = (
  sessions: WorkoutSession[],
  exercises: Exercise[],
  plans: WorkoutPlan[],
  weekly: Record<number, string | null> = {},
): ScheduleInput => ({
  sessions,
  exercises,
  plans,
  blocks: [],
  blockDays: [],
  weeklyAssignment: { 0: null, 1: null, 2: null, 3: null, 4: null, 5: null, 6: null, ...weekly },
  range: { from: "2026-10-05", to: "2026-10-18" }, // 2 semanas (seg 05 → dom 18)
  today: "2026-10-20",
});
const full = (sets: number, w = 20, r = 10): [number, number][] =>
  Array.from({ length: sets }, () => [w, r]);
const of = (rows: ReturnType<typeof computeCompletion>, m: MuscleGroup) =>
  rows.find((r) => r.muscleId === m)!;

// ---------------------------------------------------------------- escala
describe("escala de cumprimento", () => {
  it("0% = 0, 50% = 5, 90% = 9, 100% = 10, e nunca passa de 10", () => {
    expect(completionScore(0)).toBe(0);
    expect(completionScore(0.5)).toBe(5);
    expect(completionScore(0.9)).toBe(9);
    expect(completionScore(1)).toBe(10);
    expect(completionScore(1.4)).toBe(10);
    expect(completionScore(0.999)).toBe(9.9); // só é 10 quem cumpriu tudo
  });
  it("faixas de status", () => {
    expect(completionStatus(3.9, false)).toBe("atencao");
    expect(completionStatus(4, false)).toBe("abaixo");
    expect(completionStatus(7, false)).toBe("proximo");
    expect(completionStatus(9.5, false)).toBe("quase");
    expect(completionStatus(10, false)).toBe("meta");
    expect(completionStatus(10, true)).toBe("progredir");
  });
});

describe("cumprimento por série e exercício", () => {
  const e = ex("p", "Rosca", "biceps", 4, 10);
  it("série não feita vale zero; repetições a menos valem a proporção", () => {
    const ev = evaluateExercise(snap(e), {
      exerciseId: e.id,
      done: false,
      sets: [
        { setIndex: 0, weight: 20, reps: 10 },
        { setIndex: 1, weight: 20, reps: 5 },
      ],
    });
    expect(ev.completion).toBeCloseTo((1 + 0.5 + 0 + 0) / 4);
  });
  it("repetições e séries extras não passam de 100%", () => {
    const ev = evaluateExercise(snap(e), {
      exerciseId: e.id,
      done: true,
      sets: Array.from({ length: 6 }, (_, i) => ({ setIndex: i, weight: 20, reps: 15 })),
    });
    expect(ev.completion).toBe(1);
  });
  it("drop set não conta como série planejada", () => {
    const ev = evaluateExercise(snap(e), {
      exerciseId: e.id,
      done: false,
      sets: [{ setIndex: 0, weight: 20, reps: 10, isDrop: true }],
    });
    expect(ev.completion).toBe(0);
  });
});

// ---------------------------------------------------------------- cenários
describe("cumprimento por músculo", () => {
  const B = plan("b", "B");
  const costas = ex("b", "Puxada", "costas", 4);
  const rosca = ex("b", "Rosca direta", "biceps", 3);
  const martelo = ex("b", "Rosca martelo", "biceps", 3);
  const exercises = [costas, rosca, martelo];

  it("cumprir todo o planejado = 10", () => {
    const s = [
      session(B, "2026-10-06", exercises, {
        Puxada: full(4),
        "Rosca direta": full(3),
        "Rosca martelo": full(3),
      }),
    ];
    const rows = computeCompletion(base(s, exercises, [B]));
    expect(of(rows, "costas").score).toBe(10);
    expect(of(rows, "biceps").score).toBe(10);
  });

  it("metade do planejado ≈ 5", () => {
    const s = [
      session(B, "2026-10-06", exercises, {
        Puxada: full(2),
        "Rosca direta": full(3),
        "Rosca martelo": [],
      }),
    ];
    const rows = computeCompletion(base(s, exercises, [B]));
    expect(of(rows, "costas").score).toBe(5);
    expect(of(rows, "biceps").score).toBe(5);
  });

  it("cenário do bíceps: treino B 2x/semana, fez só 1 exercício num dia e faltou ao outro", () => {
    // Programação: B toda terça e sexta. Semana 1: terça só rosca direta; sexta faltou. Semana 2: tudo certo.
    const s = [
      session(B, "2026-10-06", exercises, {
        Puxada: full(4),
        "Rosca direta": full(3),
        "Rosca martelo": [],
      }),
      session(B, "2026-10-13", exercises, {
        Puxada: full(4),
        "Rosca direta": full(3),
        "Rosca martelo": full(3),
      }),
      session(B, "2026-10-16", exercises, {
        Puxada: full(4),
        "Rosca direta": full(3),
        "Rosca martelo": full(3),
      }),
    ];
    const rows = computeCompletion(base(s, exercises, [B], { 2: "b", 5: "b" }));
    const biceps = of(rows, "biceps");
    // 4 ocorrências × 6 séries = 24 planejadas; feitas 3 + 0 (falta) + 6 + 6 = 15 → 62,5%
    expect(biceps.plannedVolume.sets).toBe(24);
    expect(biceps.completedVolume.sets).toBe(15);
    expect(biceps.score).toBe(6.2);
    expect(biceps.status).toBe("abaixo");
    expect(biceps.plannedVolume.sessions).toBe(4);
    expect(biceps.completedVolume.sessions).toBe(3);
    expect(biceps.incomplete.map((i) => i.kind)).toEqual(
      expect.arrayContaining(["nao_realizado", "pulado"]),
    );
  });

  it("trocar o dia do treino dentro da semana não conta como falta", () => {
    const s = [
      session(B, "2026-10-08", exercises, {
        Puxada: full(4),
        "Rosca direta": full(3),
        "Rosca martelo": full(3),
      }),
    ];
    const input = {
      ...base(s, exercises, [B], { 2: "b" }),
      range: { from: "2026-10-05", to: "2026-10-11" },
    };
    expect(of(computeCompletion(input), "biceps").score).toBe(10);
  });

  it("músculo secundário recebe meio peso; músculo sem plano não aparece", () => {
    const P = plan("p", "A");
    const supino = ex("p", "Supino", "peito", 4, 10, 40, ["triceps"]);
    const s = [session(P, "2026-10-06", [supino], { Supino: full(2, 40) })];
    const rows = computeCompletion(base(s, [supino], [P]));
    expect(of(rows, "peito").score).toBe(5);
    expect(of(rows, "triceps").score).toBe(5);
    expect(rows.find((r) => r.muscleId === "gluteos")).toBeUndefined();
  });

  it("treino alterado no meio do período: cada sessão é comparada com a prescrição DELA", () => {
    const old = {
      ...rosca,
      setsTarget: 2,
      setTargets: full(2).map(([w, r]) => ({ reps: r, weight: w, restSeconds: 60 })),
    };
    const s1 = session(B, "2026-10-06", [old], { "Rosca direta": full(2) }); // antes: 2 séries, fez 2
    const s2 = session(B, "2026-10-13", [rosca], { "Rosca direta": full(3) }); // depois: 3 séries, fez 3
    expect(of(computeCompletion(base([s1, s2], [rosca], [B])), "biceps").score).toBe(10);
  });

  it("estado dourado: 10 + topo da meta em 2 sessões seguidas; nunca por uma sessão só", () => {
    const one = [session(B, "2026-10-06", [rosca], { "Rosca direta": full(3, 20, 10) })];
    expect(of(computeCompletion(base(one, [rosca], [B])), "biceps").eligibleForProgression).toBe(
      false,
    );
    const two = [...one, session(B, "2026-10-13", [rosca], { "Rosca direta": full(3, 20, 11) })];
    const r = of(computeCompletion(base(two, [rosca], [B])), "biceps");
    expect(r.score).toBe(10);
    expect(r.eligibleForProgression).toBe(true);
    expect(r.status).toBe("progredir");
    expect(r.progression[0].suggestedLoad).toBe(22.5);
  });

  it("sessão marcada como pesada bloqueia a sugestão de progressão", () => {
    const two = [
      session(B, "2026-10-06", [rosca], { "Rosca direta": full(3) }),
      session(B, "2026-10-13", [rosca], { "Rosca direta": full(3) }, { perceivedEffort: "pesado" }),
    ];
    expect(of(computeCompletion(base(two, [rosca], [B])), "biceps").eligibleForProgression).toBe(
      false,
    );
  });

  it("aviso de plano leve não mexe na nota", () => {
    const P = plan("p", "A");
    const exs = [
      ex("p", "Remada", "costas", 5),
      ex("p", "Puxada 2", "costas", 5),
      ex("p", "Supino 2", "peito", 5),
      ex("p", "Agacho", "quadriceps", 5),
      ex("p", "Rosca 2", "biceps", 1),
    ];
    const s = [
      session(
        P,
        "2026-10-06",
        exs,
        Object.fromEntries(exs.map((e) => [e.name, full(e.setsTarget)])),
      ),
    ];
    const b = of(computeCompletion(base(s, exs, [P])), "biceps");
    expect(b.score).toBe(10);
    expect(b.planShareNote).toBeTruthy();
  });

  it("sem histórico: lista vazia, sem divisão por zero", () => {
    expect(computeCompletion(base([], [], []))).toEqual([]);
  });
});

// ---------------------------------------------------------------- evolução
describe("evolução de desempenho", () => {
  const A = plan("a", "A");
  const supino = ex("a", "Supino", "peito", 3, 10, 40);
  const prev = { from: "2026-09-21", to: "2026-10-04" };
  const cur = { from: "2026-10-05", to: "2026-10-18" };

  it("usa força estimada: subir carga e cair repetições não é automaticamente evolução", () => {
    expect(epley(40, 10)).toBeCloseTo(53.33, 1);
    expect(epley(45, 4)).toBeCloseTo(51, 0); // mais carga, menos força estimada
  });

  it("compara períodos equivalentes e mostra a porcentagem real", () => {
    const s = [
      session(A, "2026-09-22", [supino], { Supino: full(3, 40, 10) }),
      session(A, "2026-10-06", [supino], { Supino: full(3, 44, 10) }),
    ];
    const r = computeEvolution(s, [supino], cur, prev).find((x) => x.muscleId === "peito")!;
    expect(r.evolutionPercentage).toBe(10);
    expect(r.score).toBe(9);
    expect(r.insufficientData).toBe(false);
  });

  it("sem dado no período anterior = dados insuficientes (nunca zero)", () => {
    const s = [session(A, "2026-10-06", [supino], { Supino: full(3, 44, 10) })];
    const r = computeEvolution(s, [supino], cur, prev).find((x) => x.muscleId === "peito")!;
    expect(r.insufficientData).toBe(true);
    expect(r.score).toBeNull();
  });

  it("escala: queda relevante, estável, excelente", () => {
    expect(evolutionScore(-20)).toBe(0);
    expect(evolutionScore(0)).toBeGreaterThanOrEqual(4);
    expect(evolutionScore(0)).toBeLessThanOrEqual(5);
    expect(evolutionScore(30)).toBe(10);
  });

  it("mediana ponderada: um exercício fora da curva não decide o músculo", () => {
    expect(
      weightedMedian([
        { value: 2, weight: 1 },
        { value: 3, weight: 1 },
        { value: 80, weight: 1 },
      ]),
    ).toBe(3);
  });

  it("peso corporal compara repetições", () => {
    const flexao = ex("a", "Flexão", "peito", 3, 15, 0, [], "peso_corporal");
    const s = [
      session(A, "2026-09-22", [flexao], { Flexão: full(3, 0, 10) }),
      session(A, "2026-10-06", [flexao], { Flexão: full(3, 0, 12) }),
    ];
    const r = computeEvolution(s, [flexao], cur, prev).find((x) => x.muscleId === "peito")!;
    expect(r.exercises[0].metric).toBe("repeticoes");
    expect(r.evolutionPercentage).toBe(20);
  });
});

describe("data da falta", () => {
  it("a falta cai no dia programado sem treino, não no dia em que treinou", () => {
    const B = plan("b2", "B");
    const r = ex("b2", "Rosca X", "biceps", 2);
    // B programado terça (07) e sexta (10); treinou só na sexta.
    const s = [session(B, "2026-10-09", [r], { "Rosca X": full(2) })];
    const input = {
      ...base(s, [r], [B], { 2: "b2", 5: "b2" }),
      range: { from: "2026-10-05", to: "2026-10-11" },
    };
    const res = of(computeCompletion(input), "biceps");
    const missed = res.incomplete.filter((i) => i.kind === "nao_realizado").map((i) => i.date);
    expect(missed).toEqual(["2026-10-06"]);
  });
});
