import { describe, expect, it } from "vitest";
import type { AgendaOccurrence } from "./agenda-occurrences";
import {
  allocateTime,
  analyzeAgenda,
  compare,
  hasEnded,
  outcomeOf,
  previousPeriod,
  resolvePeriod,
  timeOfDay,
  weekBuckets,
  weekdayIndex,
  type AnalysisInput,
} from "./mirror-analytics";
import { buildInsights, nextWeekAction } from "./mirror-insights";

// 2026-10-14 é uma quarta-feira.
const TODAY = "2026-10-14";
const now = { date: TODAY, minute: 12 * 60 };
let seq = 0;

function occ(p: Partial<AgendaOccurrence> & { date: string }): AgendaOccurrence {
  seq += 1;
  return {
    key: `k${seq}`,
    kind: "execution",
    executionId: `e${seq}`,
    title: `Item ${seq}`,
    startTime: "09:00",
    endTime: "10:00",
    allDay: false,
    category: "generico",
    rigid: false,
    weight: "medio",
    status: "concluida",
    recurring: false,
    source: "norte",
    ...p,
  } as AgendaOccurrence;
}

function input(over: Partial<AnalysisInput> = {}): AnalysisInput {
  return {
    occurrences: [],
    changes: [],
    executions: [],
    labels: [],
    now,
    window: { start: 7 * 60, end: 22 * 60 },
    ...over,
  };
}

const week = resolvePeriod("7d", TODAY); // 2026-10-08 .. 2026-10-14

describe("períodos", () => {
  it("7 dias, 30 dias e 3 meses terminam hoje", () => {
    expect(week).toEqual({ from: "2026-10-08", to: TODAY });
    expect(resolvePeriod("30d", TODAY).from).toBe("2026-09-15");
    expect(resolvePeriod("3m", TODAY).from).toBe("2026-07-17");
  });
  it("personalizado: futuro é cortado, ordem é corrigida e o tamanho limitado", () => {
    expect(resolvePeriod("custom", TODAY, { from: "2026-10-01", to: "2026-12-31" }).to).toBe(TODAY);
    expect(resolvePeriod("custom", TODAY, { from: "2026-10-20", to: "2026-10-10" })).toEqual({
      from: "2026-10-10",
      to: "2026-10-10",
    });
    const long = resolvePeriod("custom", TODAY, { from: "2020-01-01", to: TODAY });
    expect(long.from).toBe("2025-10-14");
  });
  it("o período anterior tem o mesmo tamanho e termina na véspera", () => {
    expect(previousPeriod(week)).toEqual({ from: "2026-10-01", to: "2026-10-07" });
  });
  it("buckets: até 14 dias por dia, depois por semana", () => {
    expect(weekBuckets(week)).toHaveLength(7);
    const ninety = weekBuckets(resolvePeriod("3m", TODAY));
    expect(ninety[0].end).toBe("2026-07-23");
    expect(ninety[ninety.length - 1].end).toBe(TODAY);
  });
  it("dia da semana e turno", () => {
    expect(weekdayIndex("2026-10-14")).toBe(3);
    expect(weekdayIndex("2026-10-11")).toBe(0);
    expect(timeOfDay("04:59")).toBe("madrugada");
    expect(timeOfDay("05:00")).toBe("manha");
    expect(timeOfDay("12:00")).toBe("tarde");
    expect(timeOfDay("18:00")).toBe("noite");
  });
});

describe("o que conta: concluído, não realizado, cancelado, futuro", () => {
  it("futuro e em andamento ficam fora; passado não concluído é não realizado", () => {
    const future = occ({
      date: "2026-10-14",
      startTime: "15:00",
      endTime: "16:00",
      status: "planejada",
    });
    const running = occ({ date: TODAY, startTime: "11:30", endTime: "13:00", status: "perdida" });
    const over = occ({ date: TODAY, startTime: "09:00", endTime: "10:00", status: "perdida" });
    expect(outcomeOf(future, now)).toBe("pending");
    expect(outcomeOf(running, now)).toBe("pending");
    expect(hasEnded(over, now)).toBe(true);
    expect(outcomeOf(over, now)).toBe("missed");
    const a = analyzeAgenda(input({ occurrences: [future, running, over] }), week);
    expect(a.total).toBe(1);
    expect(a.missed).toBe(1);
  });

  it("cancelado fica fora da taxa e do tempo", () => {
    const list = [
      occ({ date: "2026-10-12", status: "concluida" }),
      occ({ date: "2026-10-12", startTime: "11:00", endTime: "12:00", status: "perdida" }),
      occ({ date: "2026-10-13", status: "cancelada" }),
    ];
    const a = analyzeAgenda(input({ occurrences: list }), week);
    expect(a.cancelled).toBe(1);
    expect(a.rate).toBe(0.5);
    expect(a.time.unionMinutes).toBe(120);
  });

  it("dia inteiro conta em quantidade, não em horas", () => {
    const a = analyzeAgenda(
      input({
        occurrences: [
          occ({ date: "2026-10-12", allDay: true, startTime: undefined, endTime: undefined }),
        ],
      }),
      week,
    );
    expect(a.untimedCount).toBe(1);
    expect(a.done).toBe(1);
    expect(a.time.unionMinutes).toBe(0);
  });

  it("evento do Google entra no tempo e na carga, mas não na taxa", () => {
    const list = [
      occ({ date: "2026-10-12", source: "external", status: "perdida" }),
      occ({
        date: "2026-10-12",
        startTime: "13:00",
        endTime: "14:00",
        readOnly: true,
        status: "planejada",
      }),
      occ({ date: "2026-10-13", startTime: "08:00", endTime: "09:00" }),
    ];
    const a = analyzeAgenda(input({ occurrences: list }), week);
    expect(a.externalCount).toBe(2);
    expect(a.missed).toBe(0);
    expect(a.rate).toBe(1);
    expect(a.time.unionMinutes).toBe(180);
  });

  it("compromissos e rotinas ficam separados", () => {
    const list = [
      occ({ date: "2026-10-12" }),
      occ({ date: "2026-10-12", routineId: "r1", startTime: "07:00", endTime: "08:00" }),
      occ({ date: "2026-10-13", routineId: "r1", status: "perdida" }),
    ];
    const a = analyzeAgenda(input({ occurrences: list }), week);
    expect(a.split.commitments).toEqual({ done: 1, missed: 0 });
    expect(a.split.routines).toEqual({ done: 1, missed: 1 });
  });

  it("recorrência: ocorrência passada que ninguém tocou conta como não realizada", () => {
    const virtual = occ({
      date: "2026-10-12",
      kind: "virtual",
      executionId: undefined,
      seriesId: "s1",
      status: "perdida",
      recurring: true,
    });
    const a = analyzeAgenda(input({ occurrences: [virtual] }), week);
    expect(a.missed).toBe(1);
  });
});

describe("tempo sem contar duas vezes", () => {
  it("compromissos sobrepostos somam a união, não a soma", () => {
    const list = [
      occ({ date: "2026-10-12", startTime: "09:00", endTime: "11:00", category: "trabalho" }),
      occ({ date: "2026-10-12", startTime: "10:00", endTime: "12:00", category: "fe" }),
    ];
    const a = analyzeAgenda(input({ occurrences: list }), week);
    expect(a.time.rawMinutes).toBe(240);
    expect(a.time.unionMinutes).toBe(180);
    expect(a.time.overlapMinutes).toBe(60);
    const byCat = Object.fromEntries(a.byCategory.map((g) => [g.key, g.minutes]));
    expect(byCat.trabalho + byCat.fe).toBe(180);
    expect(byCat.trabalho).toBe(120); // começou antes
    expect(a.conflictPairs).toBe(1);
  });

  it("rígido ganha o empate de início", () => {
    const a = allocateTime(
      [
        {
          occ: occ({ date: "2026-10-12", key: "a" }),
          interval: { start: 0, end: 60 },
          done: false,
        },
        {
          occ: occ({ date: "2026-10-12", key: "b", rigid: true }),
          interval: { start: 0, end: 60 },
          done: false,
        },
      ],
      { start: 0, end: 1000 },
    );
    expect(a.perItem.get("b")?.minutes).toBe(60);
    expect(a.perItem.get("a")).toBeUndefined();
  });

  it("meia-noite: o evento que atravessa o dia é um intervalo só", () => {
    const night = occ({ date: "2026-10-12", startTime: "23:00", endTime: "01:00" });
    const a = analyzeAgenda(input({ occurrences: [night] }), week);
    expect(a.time.unionMinutes).toBe(120);
  });

  it("meia-noite: o que invade o primeiro dia entra; o que passa do último é cortado", () => {
    const before = occ({ date: "2026-10-07", startTime: "23:00", endTime: "01:00" });
    const after = occ({ date: TODAY, startTime: "08:00", endTime: "09:00" });
    const a = analyzeAgenda(input({ occurrences: [before, after] }), week);
    expect(a.time.unionMinutes).toBe(60 + 60); // 00:00–01:00 do dia 08 + 08:00–09:00
    const clippedEnd = allocateTime(
      [{ occ: occ({ date: TODAY }), interval: { start: 100, end: 400 }, done: true }],
      { start: 0, end: 200 },
    );
    expect(clippedEnd.unionMinutes).toBe(100);
    expect(clippedEnd.doneUnionMinutes).toBe(100);
  });

  it("tempo concluído é medido como duração planejada dos concluídos", () => {
    const list = [
      occ({ date: "2026-10-12", startTime: "09:00", endTime: "10:00" }),
      occ({ date: "2026-10-12", startTime: "11:00", endTime: "13:00", status: "perdida" }),
    ];
    const a = analyzeAgenda(input({ occurrences: list }), week);
    expect(a.time.doneUnionMinutes).toBe(60);
    expect(a.time.doneShare).toBeCloseTo(1 / 3);
  });
});

describe("rótulos e categorias", () => {
  it("distribui o tempo por rótulo e junta o que não tem rótulo", () => {
    const labels = [{ id: "l1", name: "Trabalho", color: "#7cb8ff" }];
    const list = [
      occ({ date: "2026-10-12", labelId: "l1" }),
      occ({ date: "2026-10-12", startTime: "11:00", endTime: "12:00" }),
    ];
    const a = analyzeAgenda(input({ occurrences: list, labels }), week);
    const names = a.byLabel.map((g) => g.name).sort();
    expect(names).toEqual(["Sem rótulo", "Trabalho"]);
    expect(a.byLabel[0].share).toBeCloseTo(0.5);
  });
});

describe("reagendamentos e histórico", () => {
  const ex = [{ id: "e1", title: "Jantar", seriesId: "s1", labelId: "fam", category: "generico" }];
  const move = (at: string, executionId = "e1") => ({
    at,
    kind: "moved",
    executionId,
    subjectTitle: "Jantar",
  });

  it("só conta mudanças feitas dentro do período, na data local", () => {
    const a = analyzeAgenda(
      input({
        changes: [
          move("2026-10-09T12:00:00Z"),
          move("2026-10-02T12:00:00Z"),
          move("2026-10-10T12:00:00Z"),
        ],
        executions: ex,
      }),
      week,
    );
    expect(a.reschedules).toBe(2);
    expect(a.rescheduledCommitments).toBe(1);
    expect(a.movedCommitments[0]).toMatchObject({ moves: 2, seriesId: "s1" });
  });

  it("histórico sobrevive à exclusão do compromisso (usa o título guardado)", () => {
    const a = analyzeAgenda(
      input({ changes: [{ at: "2026-10-10T12:00:00Z", kind: "moved", subjectTitle: "Dentista" }] }),
      week,
    );
    expect(a.movedCommitments[0].title).toBe("Dentista");
  });

  it("mudanças que não são de horário não contam", () => {
    const a = analyzeAgenda(
      input({ changes: [{ at: "2026-10-10T12:00:00Z", kind: "label_changed" }] }),
      week,
    );
    expect(a.reschedules).toBe(0);
  });
});

describe("padrões de comportamento", () => {
  const morningGood = (): AgendaOccurrence[] => {
    const out: AgendaOccurrence[] = [];
    for (const d of ["2026-10-08", "2026-10-09", "2026-10-10", "2026-10-11"]) {
      out.push(occ({ date: d, startTime: "07:00", endTime: "08:00", category: "academia" }));
      out.push(
        occ({
          date: d,
          startTime: "20:00",
          endTime: "21:00",
          category: "academia",
          status: "perdida",
        }),
      );
    }
    return out;
  };

  it("turno com melhor taxa vira insight com evidência", () => {
    const a = analyzeAgenda(input({ occurrences: morningGood() }), week);
    const insights = buildInsights(a, compare(a, analyzeAgenda(input(), previousPeriod(week))), {
      labels: [],
      scope: "nos últimos 7 dias",
    });
    const ins = insights.find((i) => i.id === "turno");
    expect(ins?.text).toBe("Você costuma cumprir melhor seus compromissos pela manhã.");
    expect(ins?.evidence).toContain("4 de 4");
    expect(insights.find((i) => i.id === "turno-academia")?.text).toContain("seus treinos");
  });

  it("amostra pequena não gera padrão", () => {
    const list = [
      occ({ date: "2026-10-12", startTime: "07:00", endTime: "08:00" }),
      occ({ date: "2026-10-12", startTime: "20:00", endTime: "21:00", status: "perdida" }),
    ];
    const a = analyzeAgenda(input({ occurrences: list }), week);
    const ins = buildInsights(a, compare(a, a), { labels: [], scope: "x" });
    expect(ins.map((i) => i.id)).toEqual(["poucos-dados"]);
  });

  it("blocos curtos x longos", () => {
    const list: AgendaOccurrence[] = [];
    for (let i = 0; i < 5; i++) {
      list.push(occ({ date: "2026-10-09", startTime: "09:00", endTime: "09:30" }));
      list.push(
        occ({ date: "2026-10-10", startTime: "13:00", endTime: "15:00", status: "perdida" }),
      );
    }
    const a = analyzeAgenda(input({ occurrences: list }), week);
    expect(a.duration.short.rate).toBe(1);
    expect(a.duration.long.rate).toBe(0);
    const ins = buildInsights(a, compare(a, a), { labels: [], scope: "x" });
    expect(ins.some((i) => i.id === "duracao")).toBe(true);
  });

  it("dia da semana que transborda", () => {
    const list: AgendaOccurrence[] = [];
    for (const d of ["2026-10-08", "2026-10-14"]) {
      // quintas e quartas? 08 = quinta, 14 = quarta -> usa duas quartas em 30 dias
    }
    const month = resolvePeriod("30d", TODAY);
    for (const d of ["2026-10-07", "2026-10-14"]) {
      for (let h = 7; h < 19; h++)
        list.push(
          occ({
            date: d,
            startTime: `${String(h).padStart(2, "0")}:00`,
            endTime: `${String(h + 1).padStart(2, "0")}:00`,
          }),
        );
    }
    const a = analyzeAgenda(input({ occurrences: list }), month);
    expect(a.overloadedDays).toBe(2);
    const ins = buildInsights(a, compare(a, a), { labels: [], scope: "x" });
    expect(ins.find((i) => i.id === "dia-cheio")?.text).toContain("quartas");
  });

  it("planejou mais do que cumpre pede reorganização e aponta uma ação", () => {
    const list: AgendaOccurrence[] = [];
    for (const d of ["2026-10-12", "2026-10-13"])
      for (let h = 8; h < 18; h++)
        list.push(
          occ({
            date: d,
            startTime: `${String(h).padStart(2, "0")}:00`,
            endTime: `${String(h + 1).padStart(2, "0")}:00`,
            status: h < 10 ? "concluida" : "perdida",
          }),
        );
    const a = analyzeAgenda(input({ occurrences: list }), week);
    const ins = buildInsights(a, compare(a, a), { labels: [], scope: "x" });
    expect(ins[0].id).toBe("excesso");
    expect(nextWeekAction(ins)?.action.kind).toBe("norte");
  });

  it("evolução semanal calcula a taxa de cada semana", () => {
    const month = resolvePeriod("30d", TODAY);
    const list = [
      occ({ date: "2026-09-16" }),
      occ({ date: "2026-09-17", status: "perdida" }),
      occ({ date: "2026-10-13" }),
    ];
    const a = analyzeAgenda(input({ occurrences: list }), month);
    expect(a.weeks[0].rate).toBe(0.5);
    expect(a.weeks[a.weeks.length - 1].rate).toBe(1);
  });
});

describe("comparação com o período anterior", () => {
  it("só compara quando o período anterior tem base", () => {
    const empty = analyzeAgenda(input(), previousPeriod(week));
    const cur = analyzeAgenda(input({ occurrences: [occ({ date: "2026-10-12" })] }), week);
    expect(compare(cur, empty).comparable).toBe(false);
    expect(compare(cur, empty).rateDelta).toBeNull();
  });
  it("calcula a diferença em pontos percentuais", () => {
    const prev = analyzeAgenda(
      input({
        occurrences: [
          occ({ date: "2026-10-02" }),
          occ({ date: "2026-10-03", status: "perdida" }),
          occ({ date: "2026-10-04", status: "perdida" }),
          occ({ date: "2026-10-05", status: "perdida" }),
        ],
      }),
      previousPeriod(week),
    );
    const cur = analyzeAgenda(
      input({ occurrences: [occ({ date: "2026-10-12" }), occ({ date: "2026-10-13" })] }),
      week,
    );
    expect(compare(cur, prev).rateDelta).toBe(75);
  });
});

describe("estados vazio e dados insuficientes", () => {
  it("sem nada: sufficiency none e nenhum insight", () => {
    const a = analyzeAgenda(input(), week);
    expect(a.sufficiency).toBe("none");
    expect(a.rate).toBeNull();
    expect(buildInsights(a, compare(a, a), { labels: [], scope: "x" })).toEqual([]);
    expect(a.daysStat).toHaveLength(7);
    expect(a.averageLoad).toBeNull();
  });
  it("poucos dados: low", () => {
    const a = analyzeAgenda(input({ occurrences: [occ({ date: "2026-10-12" })] }), week);
    expect(a.sufficiency).toBe("low");
  });
});

describe("check-in 'Como foi?'", () => {
  it("só resposta de quem respondeu entra; sem resposta não vira 'leve'", () => {
    const list = [
      occ({ date: "2026-10-12", feeling: "pesado", labelId: "w" }),
      occ({
        date: "2026-10-12",
        startTime: "11:00",
        endTime: "12:00",
        feeling: "pesado",
        labelId: "w",
      }),
      occ({ date: "2026-10-13", feeling: "pesado", labelId: "w" }),
      occ({ date: "2026-10-13", startTime: "14:00", endTime: "15:00" }),
      occ({ date: "2026-10-13", startTime: "16:00", endTime: "17:00" }),
    ];
    const a = analyzeAgenda(
      input({ occurrences: list, labels: [{ id: "w", name: "Trabalho", color: "#fff" }] }),
      week,
    );
    expect(a.feeling).toEqual({ answered: 3, counts: { leve: 0, neutro: 0, pesado: 3 } });
    const ins = buildInsights(a, compare(a, a), {
      labels: [{ id: "w", name: "Trabalho", color: "#fff" }],
      scope: "x",
    });
    expect(ins.find((i) => i.id === "pesado-w")?.evidence).toContain("3 de 3");
  });
  it("com menos de 3 respostas não há conclusão", () => {
    const list = [
      occ({ date: "2026-10-12", feeling: "pesado" }),
      occ({ date: "2026-10-13", feeling: "pesado" }),
    ];
    const a = analyzeAgenda(input({ occurrences: list }), week);
    const ins = buildInsights(a, compare(a, a), { labels: [], scope: "x" });
    expect(ins.some((i) => i.id.startsWith("pesado"))).toBe(false);
  });
});
