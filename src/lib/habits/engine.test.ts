import { describe, expect, it } from "vitest";
import {
  endOfPeriod,
  endState,
  evaluateDay,
  evaluatePeriod,
  heatmap,
  indexLogs,
  isScheduledOn,
  motivesOfSkips,
  pauseOn,
  startOfPeriod,
  streaks,
  summarize,
  todayItem,
  versionAt,
  type EvalContext,
} from "./engine";
import { canSum, convertUnit, formatAmount } from "./units";
import type { Habit, HabitLog, HabitVersion, Pause } from "./types";

let seq = 0;
const version = (over: Partial<HabitVersion> = {}): HabitVersion => ({
  id: `v${++seq}`,
  habitId: "h1",
  effectiveFrom: "2026-01-01",
  goalValue: 1,
  goalPeriod: "day",
  schedule: { type: "daily" },
  flexible: false,
  timesOfDay: [],
  checklist: [],
  ...over,
});
const habit = (over: Partial<Habit> = {}, versions: HabitVersion[] = [version()]): Habit => ({
  id: "h1",
  name: "Teste",
  intent: "build",
  measure: "binary",
  startDate: "2026-01-01",
  position: 0,
  createdAt: "2026-01-01T00:00:00Z",
  versions,
  ...over,
});
const log = (date: string, over: Partial<HabitLog> = {}): HabitLog => ({
  id: `l${++seq}`,
  habitId: "h1",
  localDate: date,
  occurredAt: `${date}T12:00:00Z`,
  status: "recorded",
  value: 1,
  note: "",
  checks: [],
  source: "manual",
  ...over,
});
const ctx = (today: string, pauses: Pause[] = [], weekStart: 0 | 1 = 1): EvalContext => ({
  today,
  weekStart,
  pauses,
});
const day = (h: Habit, logs: HabitLog[], today: string, date: string, pauses: Pause[] = []) =>
  evaluateDay(ctx(today, pauses), h, indexLogs(logs), date);

describe("períodos", () => {
  it("semana começa na segunda ou no domingo", () => {
    // 2026-11-11 é quarta
    expect(startOfPeriod("2026-11-11", "week", 1)).toBe("2026-11-09");
    expect(endOfPeriod("2026-11-11", "week", 1)).toBe("2026-11-15");
    expect(startOfPeriod("2026-11-11", "week", 0)).toBe("2026-11-08");
    expect(endOfPeriod("2026-11-08", "week", 0)).toBe("2026-11-14");
  });
  it("mês curto e ano bissexto", () => {
    expect(endOfPeriod("2026-02-10", "month", 1)).toBe("2026-02-28");
    expect(endOfPeriod("2028-02-10", "month", 1)).toBe("2028-02-29");
    expect(endOfPeriod("2026-11-30", "month", 1)).toBe("2026-11-30");
    expect(endOfPeriod("2026-06-15", "year", 1)).toBe("2026-12-31");
  });
  it("semana que atravessa mês e ano", () => {
    expect(startOfPeriod("2027-01-01", "week", 1)).toBe("2026-12-28");
    expect(endOfPeriod("2027-01-01", "week", 1)).toBe("2027-01-03");
  });
});

describe("programação", () => {
  it("dias da semana, dias do mês (inclusive 31 em mês curto) e intervalo", () => {
    const wk = habit({}, [version({ schedule: { type: "weekdays", weekdays: [1, 3] } })]);
    expect(isScheduledOn(wk, "2026-11-09")).toBe(true); // segunda
    expect(isScheduledOn(wk, "2026-11-10")).toBe(false);
    const md = habit({}, [version({ schedule: { type: "monthdays", days: [31] } })]);
    expect(isScheduledOn(md, "2026-11-30")).toBe(true); // novembro tem 30 → último dia
    expect(isScheduledOn(md, "2026-11-29")).toBe(false);
    expect(isScheduledOn(md, "2026-12-31")).toBe(true);
    const iv = habit({ startDate: "2026-11-01" }, [
      version({ effectiveFrom: "2026-11-01", schedule: { type: "interval", every: 3 } }),
    ]);
    expect([1, 2, 3, 4, 5, 6, 7].map((d) => isScheduledOn(iv, `2026-11-0${d}`))).toEqual([
      true,
      false,
      false,
      true,
      false,
      false,
      true,
    ]);
  });
  it("antes do início não existe; meta flexível aparece todo dia", () => {
    const h = habit({ startDate: "2026-11-10" });
    expect(isScheduledOn(h, "2026-11-09")).toBe(false);
    const fx = habit({}, [version({ flexible: true, goalPeriod: "week", goalValue: 3 })]);
    expect(isScheduledOn(fx, "2026-11-12")).toBe(true);
  });
});

describe("versões de meta", () => {
  it("mudar a meta hoje não reescreve o passado", () => {
    const h = habit({ measure: "quantity" }, [
      version({ effectiveFrom: "2026-01-01", goalValue: 2000 }),
      version({ effectiveFrom: "2026-11-10", goalValue: 3000 }),
    ]);
    expect(versionAt(h, "2026-11-09")?.goalValue).toBe(2000);
    expect(versionAt(h, "2026-11-10")?.goalValue).toBe(3000);
    const logs = [log("2026-11-09", { value: 2100 }), log("2026-11-10", { value: 2100 })];
    expect(day(h, logs, "2026-11-12", "2026-11-09").outcome).toBe("completed");
    expect(day(h, logs, "2026-11-12", "2026-11-10").outcome).toBe("partial");
  });
});

describe("dia: construir", () => {
  const h = habit({ measure: "quantity", unit: "ml" }, [version({ goalValue: 2000 })]);
  it("cumprido, parcial, sem registro e hoje em andamento", () => {
    const logs = [
      log("2026-11-10", { value: 1500 }),
      log("2026-11-10", { value: 600 }),
      log("2026-11-09", { value: 800 }),
    ];
    expect(day(h, logs, "2026-11-12", "2026-11-10")).toMatchObject({
      outcome: "completed",
      value: 2100,
    });
    expect(day(h, logs, "2026-11-12", "2026-11-09").outcome).toBe("partial");
    expect(day(h, logs, "2026-11-12", "2026-11-08").outcome).toBe("none"); // ausência de info ≠ falha
    expect(day(h, [], "2026-11-12", "2026-11-12").outcome).toBe("open");
    expect(day(h, [], "2026-11-12", "2026-11-13").outcome).toBe("future");
  });
  it("pular e não realizar são estados próprios", () => {
    expect(
      day(h, [log("2026-11-10", { status: "skipped", value: 0 })], "2026-11-12", "2026-11-10")
        .outcome,
    ).toBe("skipped");
    expect(
      day(h, [log("2026-11-10", { status: "missed", value: 0 })], "2026-11-12", "2026-11-10")
        .outcome,
    ).toBe("missed");
  });
  it("registro apagado (desfazer) não conta", () => {
    const logs = [log("2026-11-10", { value: 2500, deletedAt: "2026-11-10T13:00:00Z" })];
    expect(day(h, logs, "2026-11-12", "2026-11-10").outcome).toBe("none");
  });
  it("hábito binário: qualquer registro cumpre", () => {
    const b = habit();
    expect(day(b, [log("2026-11-10")], "2026-11-12", "2026-11-10").outcome).toBe("completed");
  });
  it("dia não programado não é falha", () => {
    const wk = habit({}, [version({ schedule: { type: "weekdays", weekdays: [1] } })]);
    expect(day(wk, [], "2026-11-12", "2026-11-10").outcome).toBe("not_scheduled"); // terça
  });
});

describe("dia: reduzir e abandonar", () => {
  const limit = habit({ intent: "limit", measure: "count", unit: "vezes" }, [
    version({ goalValue: 2 }),
  ]);
  const quit = habit({ intent: "quit", measure: "count" }, [version({ goalValue: 0 })]);

  it("registrar zero de manhã NÃO prova um dia inteiro: hoje é 'dentro do limite até agora'", () => {
    expect(day(limit, [], "2026-11-12", "2026-11-12").outcome).toBe("within");
    expect(day(limit, [log("2026-11-12", { value: 1 })], "2026-11-12", "2026-11-12").outcome).toBe(
      "within",
    );
  });
  it("dia passado dentro do limite, mas nunca fechado, fica 'não confirmado'", () => {
    expect(day(limit, [log("2026-11-10", { value: 1 })], "2026-11-12", "2026-11-10").outcome).toBe(
      "unconfirmed",
    );
    expect(day(limit, [], "2026-11-12", "2026-11-10").outcome).toBe("unconfirmed");
  });
  it("só confirmar o dia dá 'cumprido'", () => {
    const logs = [
      log("2026-11-10", { value: 1 }),
      log("2026-11-10", { status: "confirmed", value: 0 }),
    ];
    expect(day(limit, logs, "2026-11-12", "2026-11-10").outcome).toBe("completed");
  });
  it("passou do limite é imediato; abandonar tem limite zero", () => {
    expect(day(limit, [log("2026-11-12", { value: 3 })], "2026-11-12", "2026-11-12").outcome).toBe(
      "exceeded",
    );
    expect(day(quit, [log("2026-11-12", { value: 1 })], "2026-11-12", "2026-11-12").outcome).toBe(
      "exceeded",
    );
    expect(day(quit, [], "2026-11-12", "2026-11-12").outcome).toBe("within");
  });
});

describe("pausa", () => {
  const h = habit({ area: "Saúde" });
  const pauses: Pause[] = [
    { id: "p1", scope: "global", startDate: "2026-11-10", endDate: "2026-11-12" },
    { id: "p2", scope: "area", area: "Saúde", startDate: "2026-11-20" },
    { id: "p3", scope: "habit", habitId: "outro", startDate: "2026-11-01" },
  ];
  it("global, por área (em aberto) e individual só valem para o que cobrem", () => {
    expect(pauseOn(h, "2026-11-11", pauses)?.id).toBe("p1");
    expect(pauseOn(h, "2026-11-13", pauses)).toBeUndefined();
    expect(pauseOn(h, "2026-12-30", pauses)?.id).toBe("p2");
    expect(pauseOn(habit({ area: "Estudo" }), "2026-12-30", pauses)).toBeUndefined();
  });
  it("dia pausado não é falha nem sucesso; se houve registro, o registro vale", () => {
    expect(day(h, [], "2026-11-15", "2026-11-11", pauses).outcome).toBe("paused");
    expect(day(h, [log("2026-11-11")], "2026-11-15", "2026-11-11", pauses).outcome).toBe(
      "completed",
    );
  });
});

describe("períodos com meta semanal/mensal", () => {
  const weekly = habit({ measure: "quantity", unit: "páginas" }, [
    version({ goalValue: 50, goalPeriod: "week" }),
  ]);
  it("soma o período; aberto = em andamento com quanto falta por dia", () => {
    const logs = [log("2026-11-09", { value: 20 }), log("2026-11-10", { value: 10 })];
    const p = evaluatePeriod(ctx("2026-11-11"), weekly, indexLogs(logs), "2026-11-11");
    expect(p).toMatchObject({ value: 30, goal: 50, outcome: "open", closed: false });
    expect(p.remainingPerDay).toBeCloseTo(20 / 5); // quarta..domingo = 5 dias
  });
  it("fechado: cumprido, parcial ou sem registro (nunca 'falha')", () => {
    const c = ctx("2026-11-20");
    expect(
      evaluatePeriod(c, weekly, indexLogs([log("2026-11-09", { value: 60 })]), "2026-11-11")
        .outcome,
    ).toBe("completed");
    expect(
      evaluatePeriod(c, weekly, indexLogs([log("2026-11-09", { value: 5 })]), "2026-11-11").outcome,
    ).toBe("partial");
    expect(evaluatePeriod(c, weekly, indexLogs([]), "2026-11-11").outcome).toBe("none");
  });
  it("hábito binário com meta semanal conta DIAS, não toques", () => {
    const b = habit({}, [version({ goalValue: 3, goalPeriod: "week", flexible: true })]);
    const logs = [log("2026-11-09"), log("2026-11-09"), log("2026-11-10"), log("2026-11-11")];
    expect(evaluatePeriod(ctx("2026-11-12"), b, indexLogs(logs), "2026-11-12")).toMatchObject({
      value: 3,
      outcome: "completed",
    });
  });
  it("pausa reduz a meta do período proporcionalmente", () => {
    const pauses: Pause[] = [
      { id: "p", scope: "global", startDate: "2026-11-09", endDate: "2026-11-11" },
    ];
    const p = evaluatePeriod(
      ctx("2026-11-20", pauses),
      weekly,
      indexLogs([log("2026-11-13", { value: 30 })]),
      "2026-11-12",
    );
    expect(p.pausedDays).toBe(3);
    expect(p.goal).toBe(28.57); // 50 * 4/7
    expect(p.outcome).toBe("completed");
  });
  it("semana inteira pausada fica 'em pausa'", () => {
    const pauses: Pause[] = [
      { id: "p", scope: "global", startDate: "2026-11-01", endDate: "2026-11-30" },
    ];
    expect(
      evaluatePeriod(ctx("2026-11-20", pauses), weekly, indexLogs([]), "2026-11-12").outcome,
    ).toBe("paused");
  });
  it("meta de limite semanal: dentro → só fechando a semana vira cumprida", () => {
    const l = habit({ intent: "limit", measure: "count" }, [
      version({ goalValue: 10, goalPeriod: "week" }),
    ]);
    const some = [log("2026-11-09", { value: 4 })];
    expect(evaluatePeriod(ctx("2026-11-11"), l, indexLogs(some), "2026-11-11").outcome).toBe(
      "within",
    );
    expect(evaluatePeriod(ctx("2026-11-20"), l, indexLogs(some), "2026-11-11").outcome).toBe(
      "unconfirmed",
    );
    const closed = [...some, log("2026-11-15", { status: "confirmed", value: 0 })];
    expect(evaluatePeriod(ctx("2026-11-20"), l, indexLogs(closed), "2026-11-11").outcome).toBe(
      "completed",
    );
    expect(
      evaluatePeriod(
        ctx("2026-11-11"),
        l,
        indexLogs([log("2026-11-09", { value: 11 })]),
        "2026-11-11",
      ).outcome,
    ).toBe("exceeded");
  });
  it("mês curto e ano bissexto entram na conta do período", () => {
    const m = habit({ measure: "count" }, [version({ goalValue: 20, goalPeriod: "month" })]);
    const p = evaluatePeriod(
      ctx("2028-03-05"),
      m,
      indexLogs([log("2028-02-29", { value: 20 })]),
      "2028-02-10",
    );
    expect(p).toMatchObject({ start: "2028-02-01", end: "2028-02-29", outcome: "completed" });
  });
});

describe("hoje", () => {
  it("lista o que é de hoje e marca o que já está resolvido", () => {
    const h = habit();
    const idx = indexLogs([log("2026-11-12")]);
    const t = todayItem(ctx("2026-11-12"), h, idx);
    expect(t).toMatchObject({ due: true, settled: true });
    const wk = habit({}, [version({ schedule: { type: "weekdays", weekdays: [1] } })]); // quinta não é segunda
    expect(todayItem(ctx("2026-11-12"), wk, indexLogs([])).due).toBe(false);
    const fx = habit({}, [version({ flexible: true, goalPeriod: "week", goalValue: 3 })]);
    expect(todayItem(ctx("2026-11-12"), fx, indexLogs([])).due).toBe(true);
  });
  it("arquivada não aparece", () => {
    expect(
      todayItem(ctx("2026-11-12"), habit({ archivedAt: "2026-11-01T00:00:00Z" }), indexLogs([]))
        .due,
    ).toBe(false);
  });
});

describe("encerramento", () => {
  it("por data, por total acumulado e por conclusões", () => {
    const byDate = habit({ endCondition: { type: "date", date: "2026-11-10" } });
    expect(endState(ctx("2026-11-10"), byDate, [])?.ended).toBe(false);
    expect(endState(ctx("2026-11-11"), byDate, [])?.ended).toBe(true);
    const byTotal = habit({ measure: "quantity", endCondition: { type: "total", amount: 100 } });
    expect(
      endState(ctx("2026-11-12"), byTotal, [
        log("2026-11-10", { value: 60 }),
        log("2026-11-11", { value: 50 }),
      ]),
    ).toMatchObject({ ended: true });
    const byCount = habit({
      endCondition: { type: "completions", count: 2 },
      startDate: "2026-11-01",
    });
    expect(endState(ctx("2026-11-12"), byCount, [log("2026-11-10")])).toMatchObject({
      ended: false,
      progress: 0.5,
    });
    expect(
      endState(ctx("2026-11-12"), byCount, [log("2026-11-10"), log("2026-11-11")])?.ended,
    ).toBe(true);
    expect(endState(ctx("2026-11-12"), habit(), [])).toBeNull();
  });
});

describe("resumo, sequência e gráficos", () => {
  const h = habit({ startDate: "2026-11-01" }, [version({ effectiveFrom: "2026-11-01" })]);
  it("consistência separa sem registro, pulado e pausa", () => {
    const logs = [
      log("2026-11-01"),
      log("2026-11-02"),
      log("2026-11-03", { status: "skipped", value: 0, reason: "viagem" }),
      // 04 e 05 sem registro
    ];
    const pauses: Pause[] = [
      { id: "p", scope: "habit", habitId: "h1", startDate: "2026-11-06", endDate: "2026-11-06" },
    ];
    const s = summarize(ctx("2026-11-06", pauses), h, logs, "2026-11-01", "2026-11-06");
    expect(s.totals.completed).toBe(2);
    expect(s.totals.skipped).toBe(1);
    expect(s.totals.none).toBe(2);
    expect(s.totals.paused).toBe(1);
    expect(s.consistency).toBeCloseTo(2 / 4); // pulado e pausa ficam fora
    expect(motivesOfSkips(logs)).toEqual([{ reason: "viagem", count: 1 }]);
  });
  it("sequência: pular não quebra, ficar sem registro quebra; hoje aberto não quebra", () => {
    const logs = [
      log("2026-11-01"),
      log("2026-11-02"),
      log("2026-11-03", { status: "skipped", value: 0 }),
      log("2026-11-04"),
    ];
    expect(streaks(ctx("2026-11-05"), h, logs)).toEqual({ current: 3, best: 3 });
    expect(streaks(ctx("2026-11-06"), h, logs)).toEqual({ current: 0, best: 3 }); // dia 05 passou sem registro
  });
  it("mapa de calor cobre cada dia pedido", () => {
    const cells = heatmap(ctx("2026-11-06"), h, [log("2026-11-02")], "2026-11-01", "2026-11-07");
    expect(cells).toHaveLength(7);
    expect(cells[1].outcome).toBe("completed");
    expect(cells[6].outcome).toBe("future");
  });
});

describe("unidades", () => {
  it("converte só dentro da família e nunca soma incompatíveis", () => {
    expect(convertUnit(1.5, "L", "ml")).toBe(1500);
    expect(convertUnit(90, "min", "h")).toBe(1.5);
    expect(convertUnit(1, "km", "ml")).toBeNull();
    expect(convertUnit(3, "copos", "páginas")).toBeNull();
    expect(convertUnit(3, "copos", "copos")).toBe(3);
    expect(canSum("ml", "L")).toBe(true);
    expect(canSum("km", "min")).toBe(false);
    expect(canSum("copos", "copos")).toBe(true);
    expect(canSum("copos", "xícaras")).toBe(false);
  });
  it("formata com vírgula decimal", () => {
    expect(formatAmount(2.5, "L")).toBe("2,5 L");
    expect(formatAmount(1500, "ml")).toBe("1.500 ml");
  });
});
