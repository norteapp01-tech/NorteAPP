import { describe, expect, it } from "vitest";
import {
  chainEventKey,
  firesTrigger,
  inQuietHours,
  reminderOccurrences,
  scheduleAt,
  targetNeedsReminder,
  transitionOf,
} from "./effects";
import type { EvalContext } from "./engine";
import type { Habit, HabitLog, HabitReminder, HabitVersion } from "./types";

const version = (o: Partial<HabitVersion> = {}): HabitVersion =>
  ({
    id: "v",
    habitId: "h",
    effectiveFrom: "2026-01-01",
    goalValue: 2000,
    goalPeriod: "day",
    flexible: false,
    schedule: { type: "daily" },
    ...o,
  }) as HabitVersion;
const habit = (o: Partial<Habit> = {}, v: Partial<HabitVersion> = {}): Habit =>
  ({
    id: "h",
    name: "Água",
    intent: "build",
    measure: "quantity",
    unit: "ml",
    startDate: "2026-01-01",
    versions: [version(v)],
    ...o,
  }) as Habit;
const ctx = (o: Partial<EvalContext> = {}): EvalContext => ({
  today: "2026-11-11",
  weekStart: 1,
  pauses: [],
  ...o,
});
const log = (id: string, value: number, o: Partial<HabitLog> = {}): HabitLog =>
  ({
    id,
    habitId: "h",
    localDate: "2026-11-11",
    occurredAt: "",
    status: "recorded",
    value,
    note: "",
    checks: [],
    source: "manual",
    ...o,
  }) as HabitLog;

describe("transição de meta", () => {
  it("100 ml de 2 L não conclui", () => {
    const l = log("a", 100);
    const t = transitionOf(ctx(), habit(), [l], l);
    expect(firesTrigger("done", l, t)).toBe(false);
  });
  it("o registro que atinge a meta conclui uma vez só", () => {
    const first = log("a", 1500);
    const second = log("b", 600);
    const t = transitionOf(ctx(), habit(), [first, second], second);
    expect(firesTrigger("done", second, t)).toBe(true);
    const third = log("c", 300);
    const t3 = transitionOf(ctx(), habit(), [first, second, third], third);
    expect(firesTrigger("done", third, t3)).toBe(false);
  });
  it("redução: consumo registrado não conclui; fechar o dia conclui", () => {
    const h = habit({ intent: "limit" }, { goalValue: 2 });
    const c = log("a", 1);
    expect(firesTrigger("done", c, transitionOf(ctx(), h, [c], c))).toBe(false);
    const close = log("b", 0, { status: "confirmed" });
    expect(firesTrigger("done", close, transitionOf(ctx(), h, [c, close], close))).toBe(true);
  });
  it("pular e não realizar disparam só na transição", () => {
    const s = log("a", 0, { status: "skipped" });
    expect(firesTrigger("skipped", s, transitionOf(ctx(), habit(), [s], s))).toBe(true);
    expect(firesTrigger("missed", s, transitionOf(ctx(), habit(), [s], s))).toBe(false);
  });
  it("meta semanal só conclui ao fechar a semana toda", () => {
    const h = habit({}, { goalValue: 3, goalPeriod: "week" });
    const a = log("a", 1);
    expect(firesTrigger("done", a, transitionOf(ctx(), h, [a], a))).toBe(false);
    const b = log("b", 2);
    expect(firesTrigger("done", b, transitionOf(ctx(), h, [a, b], b))).toBe(true);
  });
  it("registro removido reverte a transição", () => {
    const l = log("a", 2500);
    const t = transitionOf(ctx(), habit(), [l], l, "removed");
    expect(t.before).toBe("completed");
    expect(t.after).not.toBe("completed");
  });
});

describe("alvo da cadeia", () => {
  it("recusa arquivada, pausada, não programada e já resolvida", () => {
    expect(targetNeedsReminder(ctx(), habit({ archivedAt: "x" }), [], "2026-11-11").ok).toBe(false);
    const pause = {
      id: "p",
      scope: "global",
      startDate: "2026-11-10",
      endDate: "2026-11-12",
    } as never;
    expect(targetNeedsReminder(ctx({ pauses: [pause] }), habit(), [], "2026-11-11").ok).toBe(false);
    const wk = habit({}, { schedule: { type: "weekdays", weekdays: [0] } as never });
    expect(targetNeedsReminder(ctx(), wk, [], "2026-11-11").ok).toBe(false); // quarta
    expect(targetNeedsReminder(ctx(), habit(), [log("a", 2000)], "2026-11-11").ok).toBe(false);
    expect(targetNeedsReminder(ctx(), habit(), [log("a", 100)], "2026-11-11").ok).toBe(true);
  });
  it("chave de evento identifica origem, encadeamento e data", () => {
    expect(chainEventKey("c", "l", "2026-11-11")).toBe("c:l:2026-11-11");
  });
});

describe("horário silencioso", () => {
  const quiet = { start: "22:00", end: "07:00" };
  it("janela que atravessa a meia-noite", () => {
    expect(inQuietHours("23:30", quiet)).toBe(true);
    expect(inQuietHours("06:59", quiet)).toBe(true);
    expect(inQuietHours("07:00", quiet)).toBe(false);
    expect(inQuietHours("12:00", quiet)).toBe(false);
    expect(inQuietHours("23:30", null)).toBe(false);
  });
  it("aviso encadeado no silêncio não vale mais para hoje se vai para amanhã", () => {
    const now = new Date("2026-11-12T01:30:00Z"); // 22:30 em São Paulo (UTC-3), dia 11
    expect(scheduleAt(now, 10, "America/Sao_Paulo", quiet, "2026-11-11")).toBeNull();
    expect(scheduleAt(now, 10, "America/Sao_Paulo", null, "2026-11-11")?.date).toBe("2026-11-11");
  });
  it("atravessar a meia-noite sem silêncio também descarta", () => {
    const now = new Date("2026-11-12T02:50:00Z"); // 23:50
    expect(scheduleAt(now, 30, "America/Sao_Paulo", null, "2026-11-11")).toBeNull();
  });
});

describe("ocorrências de lembrete", () => {
  const r: HabitReminder = {
    id: "r",
    habitId: "h",
    time: "08:00",
    weekdays: [0, 1, 2, 3, 4, 5, 6],
    enabled: true,
  };
  const now = new Date("2026-11-11T10:00:00Z"); // 07:00 em São Paulo
  const opts = { now, days: 3, zone: "America/Sao_Paulo", quiet: null };
  it("gera um por dia programado, no instante certo do fuso", () => {
    const o = reminderOccurrences(ctx(), habit(), [r], opts);
    expect(o.map((x) => x.date)).toEqual(["2026-11-11", "2026-11-12", "2026-11-13"]);
    expect(o[0].at).toBe("2026-11-11T11:00:00.000Z");
  });
  it("pula horário que já passou, pausa, arquivo e lembrete desligado", () => {
    const late = new Date("2026-11-11T12:00:00Z");
    expect(reminderOccurrences(ctx(), habit(), [r], { ...opts, now: late })[0].date).toBe(
      "2026-11-12",
    );
    const pause = {
      id: "p",
      scope: "habit",
      habitId: "h",
      startDate: "2026-11-12",
      endDate: "2026-11-12",
    } as never;
    expect(
      reminderOccurrences(ctx({ pauses: [pause] }), habit(), [r], opts).map((x) => x.date),
    ).toEqual(["2026-11-11", "2026-11-13"]);
    expect(reminderOccurrences(ctx(), habit({ archivedAt: "x" }), [r], opts)).toEqual([]);
    expect(reminderOccurrences(ctx(), habit(), [{ ...r, enabled: false }], opts)).toEqual([]);
  });
  it("respeita os dias da semana e adia o que cai no silêncio", () => {
    const wed = reminderOccurrences(ctx(), habit(), [{ ...r, weekdays: [3] }], opts);
    expect(wed.map((x) => x.date)).toEqual(["2026-11-11"]);
    const night = reminderOccurrences(ctx(), habit(), [{ ...r, time: "23:00" }], {
      ...opts,
      quiet: { start: "22:00", end: "07:00" },
    });
    expect(night[0].time).toBe("07:00");
    expect(night[0].date).toBe("2026-11-11"); // a ocorrência continua sendo a de 11/11
    expect(night[0].at).toBe("2026-11-12T10:00:00.000Z"); // mas o aviso sai no fim do silêncio
  });
});
