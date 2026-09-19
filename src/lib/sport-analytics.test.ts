import { describe, it, expect, vi } from "vitest";

vi.mock("./supabase/client", () => ({
  supabase: { from: () => ({ select: () => Promise.resolve({ data: [], error: null }) }) },
  ensureSession: async () => "test-user",
  useSupabaseUserId: () => "test-user",
}));

import type { Execution } from "./goals-store";
import type { SportActivity, SportWeeklyGoal } from "./sport-store";
import {
  METRIC_FACES,
  activitiesInWeek,
  activitiesOnWeekday,
  faceDataState,
  formatPaceDelta,
  metricFaceLabel,
  nextPlannedSportActivity,
  paceDelta,
  plannedTargetLabel,
  rotateFace,
  routeStats,
  weekConsistency,
  weekdaysWithActivity,
  weeklyMetricsSeries,
} from "./sport-analytics";
import { bestRouteMatch, findRouteMatches, type RouteCandidate } from "./sport-route-match";
import { computeRouteDistanceM } from "./sport-route-geometry";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const TODAY = "2026-09-18"; // sexta-feira

let seq = 0;
function activity(o: Partial<SportActivity> = {}): SportActivity {
  seq += 1;
  return {
    id: `a${seq}`,
    modality: "corrida",
    source: "gravado",
    title: "Corrida",
    startedAt: `${TODAY}T07:00:00-03:00`,
    activeDurationS: 1800,
    totalDurationS: 1800,
    distanceM: 5000,
    privacyHideRoute: false,
    privacyHideStartEnd: false,
    isPrivate: true,
    createdAt: `${TODAY}T08:00:00-03:00`,
    updatedAt: `${TODAY}T08:00:00-03:00`,
    ...o,
  };
}

function execution(o: Partial<Execution> = {}): Execution {
  return {
    id: "e1",
    title: "Corrida leve",
    dueDate: TODAY,
    category: "esportes",
    rigid: false,
    weight: "medio",
    status: "planejada",
    sportModality: "corrida",
    agendaSessions: [],
    ...o,
  } as Execution;
}

// ---------------------------------------------------------------------------

describe("weeklyMetricsSeries", () => {
  it("mantém a semana vazia na série em vez de escondê-la", () => {
    const series = weeklyMetricsSeries([], "corrida", 4, TODAY);
    expect(series).toHaveLength(4);
    expect(series.every((w) => w.sessions === 0 && w.paceSPerKm === null)).toBe(true);
    expect(series.at(-1)!.isCurrent).toBe(true);
  });

  it("pondera o ritmo pela distância, não pela média das médias", () => {
    // 1 km em 6 min (360 s/km) + 9 km em 45 min (300 s/km).
    // Média simples daria 330 s/km; a ponderada correta é (360+2700)/10 = 306.
    const series = weeklyMetricsSeries(
      [
        activity({ distanceM: 1000, activeDurationS: 360, startedAt: `${TODAY}T07:00:00-03:00` }),
        activity({ distanceM: 9000, activeDurationS: 2700, startedAt: `${TODAY}T09:00:00-03:00` }),
      ],
      "corrida",
      1,
      TODAY,
    );
    expect(series[0].paceSPerKm).toBeCloseTo(306, 0);
    expect(series[0].distanceM).toBe(10000);
    expect(series[0].sessions).toBe(2);
  });

  it("ignora atividade sem distância no ritmo, mas conta na frequência", () => {
    const series = weeklyMetricsSeries(
      [
        activity({ distanceM: 5000, activeDurationS: 1500 }),
        activity({ distanceM: 0, activeDurationS: 1800 }),
      ],
      "corrida",
      1,
      TODAY,
    );
    expect(series[0].sessions).toBe(2);
    expect(series[0].paceSPerKm).toBeCloseTo(300, 0);
  });

  it("separa modalidades", () => {
    const series = weeklyMetricsSeries(
      [activity({ modality: "ciclismo", distanceM: 20000 })],
      "corrida",
      1,
      TODAY,
    );
    expect(series[0].sessions).toBe(0);
  });

  it("calcula velocidade para ciclismo", () => {
    const series = weeklyMetricsSeries(
      [activity({ modality: "ciclismo", distanceM: 20000, activeDurationS: 3600 })],
      "ciclismo",
      1,
      TODAY,
    );
    expect(series[0].speedKmh).toBeCloseTo(20, 1);
  });
});

describe("weekConsistency", () => {
  const goal: SportWeeklyGoal = { id: "g", modality: "corrida", targetSessions: 3 };

  it("conta apenas atividades realizadas", () => {
    const result = weekConsistency([activity(), activity()], goal, "corrida", TODAY);
    expect(result).toEqual({ done: 2, target: 3, distanceM: 10000 });
  });

  it("sem meta, não inventa denominador", () => {
    const result = weekConsistency([activity()], undefined, "corrida", TODAY);
    expect(result.target).toBeUndefined();
    expect(result.done).toBe(1);
  });

  it("ignora atividade de outra semana", () => {
    const result = weekConsistency(
      [activity({ startedAt: "2026-09-05T07:00:00-03:00" })],
      goal,
      "corrida",
      TODAY,
    );
    expect(result.done).toBe(0);
  });
});

describe("nextPlannedSportActivity", () => {
  it("devolve a mais próxima a partir de hoje", () => {
    const next = nextPlannedSportActivity(
      [
        execution({ id: "depois", agendaDate: "2026-09-20", startTime: "07:00" }),
        execution({ id: "hoje", agendaDate: TODAY, startTime: "18:00" }),
      ],
      "corrida",
      TODAY,
    );
    expect(next?.execution.id).toBe("hoje");
    expect(next?.isToday).toBe(true);
  });

  it("ignora passado, concluída, reagendada e outra modalidade", () => {
    const next = nextPlannedSportActivity(
      [
        execution({ id: "passado", agendaDate: "2026-09-01" }),
        execution({ id: "feita", agendaDate: "2026-09-19", status: "concluida" }),
        execution({ id: "movida", agendaDate: "2026-09-19", status: "reagendada" }),
        execution({ id: "bike", agendaDate: "2026-09-19", sportModality: "ciclismo" }),
      ],
      "corrida",
      TODAY,
    );
    expect(next).toBeNull();
  });

  it("desempata por horário no mesmo dia", () => {
    const next = nextPlannedSportActivity(
      [
        execution({ id: "tarde", agendaDate: "2026-09-20", startTime: "18:00" }),
        execution({ id: "cedo", agendaDate: "2026-09-20", startTime: "07:00" }),
      ],
      "corrida",
      TODAY,
    );
    expect(next?.execution.id).toBe("cedo");
  });

  it("descreve o objetivo, ou nada quando não existe", () => {
    expect(plannedTargetLabel(execution({ sportTargetDistanceM: 5000 }))).toBe("5 km");
    expect(plannedTargetLabel(execution({ sportTargetDurationS: 1800 }))).toBe("30 min");
    expect(plannedTargetLabel(execution())).toBeNull();
  });
});

describe("faces do carrossel", () => {
  it("gira nos dois sentidos com volta ao início", () => {
    expect(rotateFace("ritmo", 1)).toBe("frequencia");
    expect(rotateFace("volume", 1)).toBe("ritmo");
    expect(rotateFace("ritmo", -1)).toBe("volume");
    expect(METRIC_FACES).toHaveLength(3);
  });

  it("chama a face de velocidade no ciclismo", () => {
    expect(metricFaceLabel("ritmo", "corrida")).toBe("Ritmo médio");
    expect(metricFaceLabel("ritmo", "ciclismo")).toBe("Velocidade média");
    expect(metricFaceLabel("volume", "ciclismo")).toBe("Volume");
  });

  it("distingue sem atividades de dados insuficientes", () => {
    const empty = weeklyMetricsSeries([], "corrida", 4, TODAY);
    expect(faceDataState(empty, "ritmo")).toBe("sem_atividades");

    const one = weeklyMetricsSeries([activity()], "corrida", 4, TODAY);
    expect(faceDataState(one, "ritmo")).toBe("dados_insuficientes");
    expect(faceDataState(one, "frequencia")).toBe("dados_insuficientes");

    const two = weeklyMetricsSeries(
      [activity(), activity({ startedAt: "2026-09-08T07:00:00-03:00" })],
      "corrida",
      4,
      TODAY,
    );
    expect(faceDataState(two, "volume")).toBe("ok");
  });

  it("diz o sentido da variação de ritmo", () => {
    const series = weeklyMetricsSeries(
      [
        activity({
          startedAt: "2026-09-08T07:00:00-03:00",
          distanceM: 5000,
          activeDurationS: 1800,
        }),
        activity({ startedAt: `${TODAY}T07:00:00-03:00`, distanceM: 5000, activeDurationS: 1740 }),
      ],
      "corrida",
      4,
      TODAY,
    );
    expect(paceDelta(series)).toBeCloseTo(-12, 0);
    expect(formatPaceDelta(paceDelta(series))).toBe("12s mais rápido");
    expect(formatPaceDelta(15)).toBe("15s mais lento");
    expect(formatPaceDelta(0)).toBe("mesmo ritmo");
    expect(formatPaceDelta(null)).toBeNull();
  });
});

describe("histórico por semana e dia", () => {
  const week = "2026-09-14"; // segunda
  const list = [
    activity({ id: "seg", startedAt: "2026-09-14T07:00:00-03:00" }),
    activity({ id: "qua", startedAt: "2026-09-16T07:00:00-03:00" }),
    activity({ id: "dom", startedAt: "2026-09-20T07:00:00-03:00" }),
    activity({ id: "fora", startedAt: "2026-09-07T07:00:00-03:00" }),
  ];

  it("traz só a semana pedida, mais recente primeiro", () => {
    const inWeek = activitiesInWeek(list, "corrida", week);
    expect(inWeek.map((a) => a.id)).toEqual(["dom", "qua", "seg"]);
  });

  it("filtra por dia usando o padrão 0 = domingo do Norte", () => {
    const inWeek = activitiesInWeek(list, "corrida", week);
    expect(activitiesOnWeekday(inWeek, week, 1).map((a) => a.id)).toEqual(["seg"]);
    expect(activitiesOnWeekday(inWeek, week, 3).map((a) => a.id)).toEqual(["qua"]);
    expect(activitiesOnWeekday(inWeek, week, 0).map((a) => a.id)).toEqual(["dom"]);
    expect(activitiesOnWeekday(inWeek, week, 5)).toEqual([]);
  });

  it("marca quais dias têm atividade", () => {
    const inWeek = activitiesInWeek(list, "corrida", week);
    expect([...weekdaysWithActivity(inWeek, week)].sort()).toEqual([0, 1, 3]);
  });
});

describe("routeStats", () => {
  const runs = [
    activity({ id: "r1", startedAt: "2026-09-01T07:00:00-03:00", activeDurationS: 2000 }),
    activity({ id: "r2", startedAt: "2026-09-08T07:00:00-03:00", activeDurationS: 1800 }),
    activity({ id: "r3", startedAt: "2026-09-15T07:00:00-03:00", activeDurationS: 1900 }),
  ];
  const attempts = runs.map((a) => ({ routeId: "rota", activityId: a.id }));

  it("conta tentativas, último e melhor tempo", () => {
    const stats = routeStats("rota", attempts, runs);
    expect(stats.count).toBe(3);
    expect(stats.last?.activityId).toBe("r3");
    expect(stats.best?.activityId).toBe("r2");
    expect(stats.bestPaceSPerKm).toBeCloseTo(360, 0);
  });

  it("ignora tentativa cuja atividade não existe mais", () => {
    const stats = routeStats("rota", [...attempts, { routeId: "rota", activityId: "sumiu" }], runs);
    expect(stats.count).toBe(3);
  });

  it("uma tentativa não vira tendência inventada", () => {
    const stats = routeStats("rota", [attempts[0]], runs);
    expect(stats.count).toBe(1);
    expect(stats.best?.activityId).toBe("r1");
    expect(stats.last?.activityId).toBe("r1");
  });

  it("rota sem tentativas devolve zeros", () => {
    const stats = routeStats("outra", attempts, runs);
    expect(stats).toMatchObject({ count: 0, last: null, best: null, bestPaceSPerKm: null });
  });
});

describe("correspondência de rota", () => {
  // Quadra de ~400 m de lado em volta de um ponto em São Paulo.
  const base = { lat: -23.5465, lng: -46.728 };
  const loop = (scale = 1, shiftLat = 0) => [
    { lat: base.lat + shiftLat, lng: base.lng },
    { lat: base.lat + 0.004 * scale + shiftLat, lng: base.lng },
    { lat: base.lat + 0.004 * scale + shiftLat, lng: base.lng + 0.004 * scale },
    { lat: base.lat + shiftLat, lng: base.lng + 0.004 * scale },
    { lat: base.lat + shiftLat, lng: base.lng },
  ];

  const route = (o: Partial<RouteCandidate> = {}): RouteCandidate => {
    const points = o.points ?? loop();
    return {
      id: "rota",
      modality: "corrida",
      title: "Volta do parque",
      points,
      // Medida do próprio traço: um número fixo aqui tornaria a rota "exata"
      // menos exata que a aproximada.
      distanceM: computeRouteDistanceM(points),
      startLat: points[0].lat,
      startLng: points[0].lng,
      endLat: points.at(-1)!.lat,
      endLng: points.at(-1)!.lng,
      ...o,
    };
  };

  it("reconhece o mesmo percurso", () => {
    const match = bestRouteMatch(loop(), "corrida", [route()]);
    expect(match).not.toBeNull();
    expect(match!.route.id).toBe("rota");
    expect(match!.highConfidence).toBe(true);
  });

  it("não sugere rota de outra modalidade", () => {
    expect(findRouteMatches(loop(), "corrida", [route({ modality: "ciclismo" })])).toEqual([]);
  });

  it("não sugere quando o início fica longe", () => {
    expect(findRouteMatches(loop(1, 0.02), "corrida", [route()])).toEqual([]);
  });

  it("não sugere quando a distância é muito diferente", () => {
    // Percurso com o dobro do tamanho, mesmo começando no mesmo ponto.
    expect(findRouteMatches(loop(2), "corrida", [route()])).toEqual([]);
  });

  it("não sugere nada com percurso vazio ou de um ponto só", () => {
    expect(findRouteMatches([], "corrida", [route()])).toEqual([]);
    expect(findRouteMatches([base], "corrida", [route()])).toEqual([]);
  });

  it("ordena da maior para a menor confiança", () => {
    const matches = findRouteMatches(loop(), "corrida", [
      route({ id: "quase", points: loop(1.05) }),
      route({ id: "exata" }),
    ]);
    expect(matches[0].route.id).toBe("exata");
    expect(matches[0].score).toBeGreaterThanOrEqual(matches.at(-1)!.score);
  });
});
