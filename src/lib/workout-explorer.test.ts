import { describe, it, expect, vi } from "vitest";

vi.mock("./supabase/client", () => ({
  supabase: {
    from: () => ({ select: () => ({ order: () => Promise.resolve({ data: [], error: null }) }) }),
  },
  ensureSession: async () => "test-user",
  useSupabaseUserId: () => "test-user",
}));

import type { ExerciseEquipment, MuscleGroup } from "./workout-store";
import type { ResolvedSet } from "./workout-evolution";
import { muscleGroupLabel, rangeOfLastDays } from "./workout-evolution";
import {
  EVOLUTION_MARGIN_PCT,
  PROLONGED_STABILITY_SESSIONS,
  bucketingFor,
  classifyPct,
  consistencyView,
  exerciseEvolution,
  exerciseEvolutions,
  exerciseShares,
  median,
  muscleComparison,
  muscleEvolutions,
  muscleSummary,
  nextPlannedDateForMuscle,
  nextStepForMuscle,
  progressionIndicator,
  sessionPerformances,
  sessionsOfExercise,
  setsPerBucket,
} from "./workout-explorer";

// ---------------------------------------------------------------------------
// Fixtures — séries já resolvidas, que é o que o explorador consome.
// ---------------------------------------------------------------------------

let seq = 0;
function set(o: Partial<ResolvedSet> = {}): ResolvedSet {
  seq += 1;
  return {
    sessionId: "s1",
    date: "2026-09-01",
    planLabel: "A · Peito",
    exerciseId: "ex-1",
    lineageId: "lin-supino",
    name: "Supino reto",
    muscleGroup: "peito",
    secondaryMuscles: [],
    equipment: "barra",
    weight: 60,
    reps: 8,
    setIndex: seq % 4,
    ...o,
  };
}

/** Uma sessão com uma série por linha. */
function sessionSets(
  sessionId: string,
  date: string,
  rows: { weight: number; reps: number }[],
  o: Partial<ResolvedSet> = {},
): ResolvedSet[] {
  return rows.map((r, i) => set({ sessionId, date, setIndex: i, ...r, ...o }));
}

// ---------------------------------------------------------------------------

describe("classifyPct e margem mínima", () => {
  it("trata variação dentro da margem como estável", () => {
    expect(classifyPct(EVOLUTION_MARGIN_PCT)).toBe("estavel");
    expect(classifyPct(-EVOLUTION_MARGIN_PCT)).toBe("estavel");
    expect(classifyPct(0)).toBe("estavel");
  });

  it("só chama de progressão ou queda acima da margem", () => {
    expect(classifyPct(EVOLUTION_MARGIN_PCT + 0.1)).toBe("progressao");
    expect(classifyPct(-EVOLUTION_MARGIN_PCT - 0.1)).toBe("queda");
  });
});

describe("median", () => {
  it("devolve null sem valores", () => {
    expect(median([])).toBeNull();
  });
  it("usa a média dos dois centrais quando a quantidade é par", () => {
    expect(median([10, 20, 30, 40])).toBe(25);
  });
  it("não deixa um valor extremo dominar", () => {
    expect(median([1, 2, 3, 400])).toBe(2.5);
  });
});

describe("sessionPerformances", () => {
  it("escolhe a série de maior força estimada como representativa", () => {
    const sets = sessionSets("s1", "2026-09-01", [
      { weight: 60, reps: 10 }, // 80
      { weight: 70, reps: 8 }, // 88,7
      { weight: 75, reps: 3 }, // 82,5
    ]);
    const [perf] = sessionPerformances(sets);
    expect(perf.weight).toBe(70);
    expect(perf.reps).toBe(8);
    expect(perf.estimated).toBeCloseTo(88.7, 1);
  });

  it("sem série estimável, cai para a maior carga e marca estimativa como nula", () => {
    const sets = sessionSets(
      "s1",
      "2026-09-01",
      [
        { weight: 0, reps: 12 },
        { weight: 0, reps: 15 },
      ],
      { equipment: "peso_corporal" },
    );
    const [perf] = sessionPerformances(sets);
    expect(perf.estimated).toBeNull();
    expect(perf.reps).toBe(15);
  });

  it("ignora repetições fora da faixa da fórmula na escolha estimável", () => {
    const sets = sessionSets("s1", "2026-09-01", [
      { weight: 40, reps: 20 }, // fora da faixa
      { weight: 50, reps: 5 },
    ]);
    const [perf] = sessionPerformances(sets);
    expect(perf.weight).toBe(50);
    expect(perf.estimated).not.toBeNull();
  });
});

describe("exerciseEvolution", () => {
  it("sem duas sessões, diz sem comparação em vez de zero", () => {
    const e = exerciseEvolution(sessionSets("s1", "2026-09-01", [{ weight: 60, reps: 8 }]));
    expect(e.status).toBe("sem_comparacao");
    expect(e.pct).toBeNull();
    expect(e.basis).toBe("nenhuma");
  });

  it("reconhece aumento de carga como progressão", () => {
    const sets = [
      ...sessionSets("s1", "2026-09-01", [{ weight: 60, reps: 8 }]),
      ...sessionSets("s2", "2026-09-08", [{ weight: 70, reps: 8 }]),
    ];
    const e = exerciseEvolution(sets);
    expect(e.status).toBe("progressao");
    expect(e.pct).toBeGreaterThan(15);
    expect(e.basis).toBe("forca_estimada");
  });

  it("reconhece mais repetições com a mesma carga como progressão", () => {
    const sets = [
      ...sessionSets("s1", "2026-09-01", [{ weight: 60, reps: 6 }]),
      ...sessionSets("s2", "2026-09-08", [{ weight: 60, reps: 10 }]),
    ];
    const e = exerciseEvolution(sets);
    expect(e.status).toBe("progressao");
  });

  it("reconhece queda registrada", () => {
    const sets = [
      ...sessionSets("s1", "2026-09-01", [{ weight: 80, reps: 8 }]),
      ...sessionSets("s2", "2026-09-08", [{ weight: 60, reps: 8 }]),
    ];
    const e = exerciseEvolution(sets);
    expect(e.status).toBe("queda");
    expect(e.pct).toBeLessThan(-EVOLUTION_MARGIN_PCT);
  });

  it("conta a sequência estável e não a chama de platô", () => {
    const sets = [
      ...sessionSets("s1", "2026-09-01", [{ weight: 60, reps: 8 }]),
      ...sessionSets("s2", "2026-09-08", [{ weight: 60, reps: 8 }]),
      ...sessionSets("s3", "2026-09-15", [{ weight: 60, reps: 8 }]),
      ...sessionSets("s4", "2026-09-22", [{ weight: 60, reps: 8 }]),
    ];
    const e = exerciseEvolution(sets);
    expect(e.status).toBe("estavel");
    expect(e.stableStreak).toBe(PROLONGED_STABILITY_SESSIONS);
  });

  it("compara exercício assistido por repetições e avisa a base", () => {
    const sets = [
      ...sessionSets("s1", "2026-09-01", [{ weight: 0, reps: 6 }], { equipment: "peso_corporal" }),
      ...sessionSets("s2", "2026-09-08", [{ weight: 0, reps: 9 }], { equipment: "peso_corporal" }),
    ];
    const e = exerciseEvolution(sets);
    expect(e.basis).toBe("repeticoes");
    expect(e.status).toBe("progressao");
  });

  it("nunca mistura equipamentos diferentes na mesma curva", () => {
    const sets = [
      ...sessionSets("s1", "2026-09-01", [{ weight: 60, reps: 8 }], { equipment: "barra" }),
      ...sessionSets("s2", "2026-09-08", [{ weight: 30, reps: 8 }], { equipment: "halteres" }),
    ];
    const evolutions = exerciseEvolutions(sets);
    expect(evolutions).toHaveLength(2);
    expect(evolutions.every((e) => e.status === "sem_comparacao")).toBe(true);
  });
});

describe("muscleEvolutions", () => {
  it("usa a mediana, então o exercício com mais séries não decide sozinho", () => {
    // Supino: 8 séries subindo pouco. Crucifixo: 2 séries subindo muito.
    const sets = [
      ...sessionSets(
        "s1",
        "2026-09-01",
        Array.from({ length: 4 }, () => ({ weight: 60, reps: 8 })),
      ),
      ...sessionSets(
        "s2",
        "2026-09-08",
        Array.from({ length: 4 }, () => ({ weight: 62, reps: 8 })),
      ),
      ...sessionSets("s1", "2026-09-01", [{ weight: 20, reps: 8 }], {
        lineageId: "lin-crucifixo",
        name: "Crucifixo",
      }),
      ...sessionSets("s2", "2026-09-08", [{ weight: 40, reps: 8 }], {
        lineageId: "lin-crucifixo",
        name: "Crucifixo",
      }),
    ];
    const [peito] = muscleEvolutions(sets);
    expect(peito.comparable).toBe(2);
    // Mediana de ~3,3% e 100% = ~51,7% — bem longe de ser puxada só pelo supino.
    expect(peito.medianPct).toBeGreaterThan(40);
    expect(peito.status).toBe("progressao");
  });

  it("marca cobertura limitada com um único exercício comparável", () => {
    const sets = [
      ...sessionSets("s1", "2026-09-01", [{ weight: 60, reps: 8 }]),
      ...sessionSets("s2", "2026-09-08", [{ weight: 70, reps: 8 }]),
      ...sessionSets("s3", "2026-09-10", [{ weight: 20, reps: 8 }], {
        lineageId: "lin-cruc",
        name: "Crucifixo",
      }),
    ];
    const [peito] = muscleEvolutions(sets);
    expect(peito.limited).toBe(true);
    expect(peito.comparable).toBe(1);
    expect(peito.total).toBe(2);
  });

  it("músculo sem carga externa comparável fica sem dados, não em zero", () => {
    const sets = [
      ...sessionSets("s1", "2026-09-01", [{ weight: 0, reps: 10 }], {
        muscleGroup: "abdomen",
        equipment: "peso_corporal",
        lineageId: "lin-prancha",
      }),
      ...sessionSets("s2", "2026-09-08", [{ weight: 0, reps: 14 }], {
        muscleGroup: "abdomen",
        equipment: "peso_corporal",
        lineageId: "lin-prancha",
      }),
    ];
    const [abdomen] = muscleEvolutions(sets);
    expect(abdomen.status).toBe("sem_dados");
    expect(abdomen.medianPct).toBeNull();
  });

  it("ignora séries sem classificação muscular", () => {
    const sets = sessionSets("s1", "2026-09-01", [{ weight: 60, reps: 8 }], { muscleGroup: null });
    expect(muscleEvolutions(sets)).toHaveLength(0);
  });
});

describe("trapézio e lombar", () => {
  it("existem no catálogo de rótulos", () => {
    expect(muscleGroupLabel.trapezio).toBe("Trapézio");
    expect(muscleGroupLabel.lombar).toBe("Lombar");
  });

  it("recebem séries diretas e entram na evolução como qualquer outro grupo", () => {
    const sets = [
      ...sessionSets("s1", "2026-09-01", [{ weight: 40, reps: 8 }], {
        muscleGroup: "trapezio",
        lineageId: "lin-encolhimento",
        name: "Encolhimento",
      }),
      ...sessionSets("s2", "2026-09-08", [{ weight: 50, reps: 8 }], {
        muscleGroup: "trapezio",
        lineageId: "lin-encolhimento",
        name: "Encolhimento",
      }),
      ...sessionSets("s1", "2026-09-01", [{ weight: 30, reps: 10 }], {
        muscleGroup: "lombar",
        lineageId: "lin-extensao",
        name: "Extensão lombar",
      }),
    ];
    const groups = muscleEvolutions(sets).map((m) => m.group);
    expect(groups).toContain("trapezio");
    expect(groups).toContain("lombar");
    const trap = muscleEvolutions(sets).find((m) => m.group === "trapezio")!;
    expect(trap.status).toBe("progressao");
    const lombar = muscleEvolutions(sets).find((m) => m.group === "lombar")!;
    expect(lombar.status).toBe("sem_dados");
  });
});

describe("muscleSummary", () => {
  it("separa séries diretas de participação secundária", () => {
    const sets = [
      ...sessionSets("s1", "2026-09-10", [{ weight: 60, reps: 8 }], { muscleGroup: "peito" }),
      ...sessionSets("s1", "2026-09-10", [{ weight: 30, reps: 8 }], {
        muscleGroup: "triceps",
        secondaryMuscles: ["peito"] as MuscleGroup[],
        lineageId: "lin-tri",
      }),
    ];
    const summary = muscleSummary(sets, "peito", { from: "2026-09-01", to: "2026-09-30" });
    expect(summary.directSets).toBe(1);
    expect(summary.assistedSets).toBe(1);
    expect(summary.sessions).toBe(1);
  });

  it("em período curto usa frase concreta em vez de média semanal", () => {
    const sets = sessionSets("s1", "2026-09-10", [{ weight: 60, reps: 8 }]);
    const summary = muscleSummary(sets, "peito", { from: "2026-09-08", to: "2026-09-14" });
    expect(summary.perWeek).toBeNull();
    expect(summary.frequencyText).toBe("1 sessão em 7 dias");
  });

  it("em período longo calcula a média pela duração real", () => {
    const sets = [
      ...sessionSets("s1", "2026-09-01", [{ weight: 60, reps: 8 }]),
      ...sessionSets("s2", "2026-09-08", [{ weight: 60, reps: 8 }]),
      ...sessionSets("s3", "2026-09-15", [{ weight: 60, reps: 8 }]),
      ...sessionSets("s4", "2026-09-22", [{ weight: 60, reps: 8 }]),
    ];
    const summary = muscleSummary(sets, "peito", { from: "2026-09-01", to: "2026-09-28" });
    expect(summary.perWeek).toBe(1);
    expect(summary.frequencyText).toBe("1 vez por semana");
  });

  it("músculo sem dados devolve zeros, não erro", () => {
    const summary = muscleSummary([], "lombar", { from: "2026-09-01", to: "2026-09-30" });
    expect(summary.directSets).toBe(0);
    expect(summary.sessions).toBe(0);
    expect(summary.lastDate).toBeUndefined();
  });
});

describe("setsPerBucket", () => {
  it("agrupa por dia em 7 dias, por semana em 30 e por mês em 1 ano", () => {
    expect(bucketingFor(rangeOfLastDays(7, "2026-09-17"))).toBe("dia");
    expect(bucketingFor(rangeOfLastDays(30, "2026-09-17"))).toBe("semana");
    expect(bucketingFor(rangeOfLastDays(90, "2026-09-17"))).toBe("semana");
    expect(bucketingFor(rangeOfLastDays(365, "2026-09-17"))).toBe("mes");
  });

  it("mantém intervalos vazios para diferenciar consistência de concentração", () => {
    const sets = sessionSets("s1", "2026-09-01", [
      { weight: 60, reps: 8 },
      { weight: 60, reps: 8 },
    ]);
    // 01/09 é terça: o período de 01 a 28/09 cobre cinco semanas parciais.
    const buckets = setsPerBucket(sets, { from: "2026-09-01", to: "2026-09-28" }, "semana");
    expect(buckets).toHaveLength(5);
    expect(buckets[0].sets).toBe(2);
    expect(buckets[0].sessions).toBe(1);
    expect(buckets.slice(1).every((b) => b.sets === 0)).toBe(true);
    // Semana parcial não anuncia dias fora do período.
    expect(buckets[0].fullLabel).toBe("01/09 a 06/09");
  });

  it("conta sessões distintas dentro do mesmo intervalo", () => {
    const sets = [
      ...sessionSets("s1", "2026-09-01", [{ weight: 60, reps: 8 }]),
      ...sessionSets("s2", "2026-09-03", [{ weight: 60, reps: 8 }]),
    ];
    const buckets = setsPerBucket(sets, { from: "2026-09-01", to: "2026-09-07" }, "semana");
    expect(buckets[0].sets).toBe(2);
    expect(buckets[0].sessions).toBe(2);
  });
});

describe("exerciseShares", () => {
  it("distribui as séries diretas em porcentagem", () => {
    const sets = [
      ...sessionSets(
        "s1",
        "2026-09-01",
        Array.from({ length: 6 }, () => ({ weight: 60, reps: 8 })),
      ),
      ...sessionSets(
        "s1",
        "2026-09-01",
        Array.from({ length: 2 }, () => ({ weight: 20, reps: 8 })),
        {
          lineageId: "lin-cruc",
          name: "Crucifixo",
        },
      ),
    ];
    const shares = exerciseShares(sets);
    expect(shares[0].name).toBe("Supino reto");
    expect(shares[0].sets).toBe(6);
    expect(shares[0].pct).toBe(75);
    expect(shares[1].pct).toBe(25);
  });
});

describe("progressionIndicator", () => {
  it("conta apenas comparações válidas", () => {
    const sets = [
      ...sessionSets("s1", "2026-09-01", [{ weight: 60, reps: 8 }]),
      ...sessionSets("s2", "2026-09-08", [{ weight: 70, reps: 8 }]),
      ...sessionSets("s3", "2026-09-10", [{ weight: 20, reps: 8 }], {
        lineageId: "lin-cruc",
        name: "Crucifixo",
      }),
    ];
    const indicator = progressionIndicator(sets);
    expect(indicator.comparable).toBe(1);
    expect(indicator.improving).toBe(1);
  });

  it("aponta queda e estabilidade prolongada como atenção", () => {
    const stable = ["s1", "s2", "s3", "s4"].flatMap((id, i) =>
      sessionSets(id, `2026-09-0${i + 1}`, [{ weight: 60, reps: 8 }], {
        lineageId: "lin-elev",
        name: "Elevação lateral",
      }),
    );
    const falling = [
      ...sessionSets("s5", "2026-09-05", [{ weight: 80, reps: 8 }], { lineageId: "lin-desen" }),
      ...sessionSets("s6", "2026-09-12", [{ weight: 60, reps: 8 }], { lineageId: "lin-desen" }),
    ];
    const indicator = progressionIndicator([...stable, ...falling]);
    expect(indicator.attention).toHaveLength(2);
    expect(indicator.attention[0].status).toBe("queda");
  });
});

describe("consistencyView", () => {
  it("não fabrica porcentagem sem programação histórica", () => {
    const view = consistencyView({ done: 14, extra: 0, reason: "sem programação" });
    expect(view.headline).toBe("14 treinos");
    expect(view.hasPlan).toBe(false);
  });

  it("mostra realizado sobre planejado quando há programação", () => {
    const view = consistencyView({ done: 14, planned: 16, extra: 0, percent: 88 });
    expect(view.headline).toBe("88%");
    expect(view.detail).toBe("14 de 16 treinos");
  });
});

describe("muscleComparison", () => {
  it("mostra a origem da mudança, não só uma porcentagem", () => {
    const current = sessionSets("s1", "2026-09-10", [
      { weight: 60, reps: 8 },
      { weight: 60, reps: 8 },
    ]);
    const previous = [
      ...sessionSets("p1", "2026-08-10", [{ weight: 60, reps: 8 }]),
      ...sessionSets("p2", "2026-08-20", [{ weight: 60, reps: 8 }]),
    ];
    const comparison = muscleComparison(current, previous, "peito");
    expect(comparison.current).toEqual({ sets: 2, sessions: 1 });
    expect(comparison.previous).toEqual({ sets: 2, sessions: 2 });
  });

  it("aceita ausência de período anterior", () => {
    expect(muscleComparison([], null, "peito").previous).toBeNull();
  });
});

describe("nextStepForMuscle", () => {
  const summary = muscleSummary(
    sessionSets("s1", "2026-09-10", [{ weight: 60, reps: 8 }]),
    "peito",
    { from: "2026-09-01", to: "2026-09-30" },
  );

  it("descreve o registro sem atribuir causa", () => {
    const evolutions = exerciseEvolutions([
      ...sessionSets("s1", "2026-09-01", [{ weight: 60, reps: 8 }]),
      ...sessionSets("s2", "2026-09-08", [{ weight: 70, reps: 8 }]),
    ]);
    const [step] = nextStepForMuscle(evolutions, summary, null);
    expect(step.text).toContain("está progredindo");
    expect(step.text).not.toMatch(/fadiga|lesão|motiva|overtraining/i);
  });

  it("diz que faltam registros quando não há comparação", () => {
    const evolutions = exerciseEvolutions(
      sessionSets("s1", "2026-09-01", [{ weight: 60, reps: 8 }]),
    );
    const [step] = nextStepForMuscle(evolutions, summary, null);
    expect(step.text).toContain("faltam registros comparáveis");
  });

  it("anuncia o próximo treino programado quando existe", () => {
    const steps = nextStepForMuscle([], summary, "2026-09-17");
    expect(steps.at(-1)!.text).toContain("quinta-feira");
    expect(steps.at(-1)!.action).toEqual({ kind: "treino", label: "Abrir próximo treino" });
  });
});

describe("nextPlannedDateForMuscle", () => {
  const days = [
    { date: "2026-09-16", muscleGroups: ["peito"] as MuscleGroup[] },
    { date: "2026-09-17", muscleGroups: ["costas"] as MuscleGroup[] },
    { date: "2026-09-21", muscleGroups: ["peito"] as MuscleGroup[] },
  ];

  it("ignora datas passadas", () => {
    expect(nextPlannedDateForMuscle(days, "peito", "2026-09-17")).toBe("2026-09-21");
  });

  it("devolve null sem programação para o músculo", () => {
    expect(nextPlannedDateForMuscle(days, "lombar", "2026-09-17")).toBeNull();
  });
});

describe("sessionsOfExercise", () => {
  it("agrupa por sessão, ordena séries e mostra a mais recente primeiro", () => {
    const sets = [
      ...sessionSets("s1", "2026-09-01", [
        { weight: 60, reps: 8 },
        { weight: 60, reps: 7 },
      ]),
      ...sessionSets("s2", "2026-09-08", [{ weight: 65, reps: 8 }]),
    ];
    const grouped = sessionsOfExercise(sets);
    expect(grouped[0].date).toBe("2026-09-08");
    expect(grouped[1].sets.map((s) => s.setIndex)).toEqual([0, 1]);
  });
});

describe("usuário sem registros", () => {
  const empty: ResolvedSet[] = [];
  const range = { from: "2026-09-01", to: "2026-09-30" };

  it("não quebra em nenhum cálculo do explorador", () => {
    expect(muscleEvolutions(empty)).toEqual([]);
    expect(exerciseEvolutions(empty)).toEqual([]);
    expect(exerciseShares(empty)).toEqual([]);
    expect(progressionIndicator(empty)).toEqual({
      improving: 0,
      comparable: 0,
      improvingList: [],
      attention: [],
    });
    expect(muscleSummary(empty, "peito", range).directSets).toBe(0);
    expect(setsPerBucket(empty, range, "semana").every((b) => b.sets === 0)).toBe(true);
  });
});

describe("um único treino", () => {
  it("não produz evolução nem atenção a partir de uma sessão", () => {
    const sets = sessionSets("s1", "2026-09-10", [
      { weight: 60, reps: 8 },
      { weight: 60, reps: 8 },
    ]);
    const indicator = progressionIndicator(sets);
    expect(indicator.comparable).toBe(0);
    expect(indicator.attention).toEqual([]);
    expect(muscleEvolutions(sets)[0].status).toBe("sem_dados");
  });
});
