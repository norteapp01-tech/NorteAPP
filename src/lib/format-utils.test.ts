import { describe, it, expect } from "vitest";
import { formatTime, weekStartsOnFor, startOfWeekLocal, weekdayLabelsFor } from "./format-utils";

describe("formatTime", () => {
  it("24h: devolve a string como está", () => {
    expect(formatTime("14:00", "24h")).toBe("14:00");
    expect(formatTime("09:05", "24h")).toBe("09:05");
  });

  it("12h: converte corretamente, incluindo meia-noite e meio-dia", () => {
    expect(formatTime("00:00", "12h")).toBe("12:00 AM");
    expect(formatTime("09:05", "12h")).toBe("9:05 AM");
    expect(formatTime("12:00", "12h")).toBe("12:00 PM");
    expect(formatTime("14:00", "12h")).toBe("2:00 PM");
    expect(formatTime("23:59", "12h")).toBe("11:59 PM");
  });

  it("undefined/vazio não quebra — devolve string vazia", () => {
    expect(formatTime(undefined, "24h")).toBe("");
    expect(formatTime(undefined, "12h")).toBe("");
    expect(formatTime("", "12h")).toBe("");
  });
});

describe("weekStartsOnFor / startOfWeekLocal", () => {
  it("segunda: 0 = segunda-feira (date-fns convention)", () => {
    expect(weekStartsOnFor("monday")).toBe(1);
    expect(weekStartsOnFor("sunday")).toBe(0);
  });

  it("startOfWeekLocal acha a segunda ou o domingo corretos pra uma quarta-feira", () => {
    // 2026-09-09 é uma quarta-feira.
    const wed = new Date(2026, 8, 9);
    const mondayStart = startOfWeekLocal(wed, "monday");
    expect(mondayStart.getDate()).toBe(7);
    expect(mondayStart.getDay()).toBe(1);

    const sundayStart = startOfWeekLocal(wed, "sunday");
    expect(sundayStart.getDate()).toBe(6);
    expect(sundayStart.getDay()).toBe(0);
  });

  it("startOfWeekLocal no próprio dia de início devolve o mesmo dia", () => {
    const monday = new Date(2026, 8, 7); // já é segunda
    expect(startOfWeekLocal(monday, "monday").getDate()).toBe(7);
  });
});

describe("weekdayLabelsFor", () => {
  const labels = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

  it("domingo: ordem original (já começa em domingo)", () => {
    expect(weekdayLabelsFor("sunday", labels)).toEqual(labels);
  });

  it("segunda: rotaciona pra começar em Seg e terminar em Dom", () => {
    expect(weekdayLabelsFor("monday", labels)).toEqual([
      "Seg",
      "Ter",
      "Qua",
      "Qui",
      "Sex",
      "Sáb",
      "Dom",
    ]);
  });
});
