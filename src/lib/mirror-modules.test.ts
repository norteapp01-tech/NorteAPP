import { describe, expect, it } from "vitest";
import { hasModuleActivity, moduleActivity } from "./mirror-modules";

const period = { from: "2026-10-12", to: "2026-10-18" };
const base = {
  workouts: [],
  activities: [],
  readingSessions: [],
  localDate: (iso: string) => iso.slice(0, 10),
};

describe("o que foi registrado nos módulos", () => {
  it("sem nada: tudo zero e nenhuma atividade", () => {
    const r = moduleActivity(base, period);
    expect(hasModuleActivity(r)).toBe(false);
    expect(r.workouts.count).toBe(0);
  });

  it("treino concluído dentro do período conta; em andamento e fora do período não", () => {
    const r = moduleActivity(
      {
        ...base,
        workouts: [
          { date: "2026-10-18", status: "concluido" },
          { date: "2026-10-18", status: "concluido" },
          { date: "2026-10-17", status: "em_andamento" },
          { date: "2026-10-01", status: "concluido" },
        ],
      },
      period,
    );
    expect(r.workouts).toEqual({ count: 2, days: 1 });
  });

  it("atividades esportivas somam distância e tempo ativo reais", () => {
    const r = moduleActivity(
      {
        ...base,
        activities: [
          { startedAt: "2026-10-13T08:00:00", distanceM: 5000, activeDurationS: 1500 },
          { startedAt: "2026-10-16T08:00:00", distanceM: 3000, activeDurationS: 900 },
          { startedAt: "2026-09-30T08:00:00", distanceM: 9000, activeDurationS: 3000 },
        ],
      },
      period,
    );
    expect(r.sport).toEqual({ count: 2, distanceM: 8000, activeSeconds: 2400 });
  });

  it("leitura: só sessão concluída; páginas ausentes valem zero", () => {
    const r = moduleActivity(
      {
        ...base,
        readingSessions: [
          {
            startedAt: "2026-10-14T20:00:00",
            status: "completed",
            durationSeconds: 1200,
            pagesRead: 15,
          },
          { startedAt: "2026-10-15T20:00:00", status: "completed", durationSeconds: 600 },
          { startedAt: "2026-10-15T21:00:00", status: "active", durationSeconds: 999 },
        ],
      },
      period,
    );
    expect(r.reading).toEqual({ sessions: 2, seconds: 1800, pages: 15 });
    expect(hasModuleActivity(r)).toBe(true);
  });

  it("a data local decide o dia (atividade de madrugada)", () => {
    const r = moduleActivity(
      {
        ...base,
        activities: [{ startedAt: "2026-10-19T01:30:00Z", distanceM: 1000, activeDurationS: 300 }],
        localDate: () => "2026-10-18", // 22:30 em São Paulo ainda é dia 18
      },
      period,
    );
    expect(r.sport.count).toBe(1);
  });
});
