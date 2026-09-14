import { describe, it, expect } from "vitest";
import {
  haversineMeters,
  filterValidPoints,
  computeDistanceM,
  computeDurations,
  computePaceSPerKm,
  computeSpeedKmh,
  formatPace,
  formatSpeedKmh,
  formatDistanceKm,
  formatDurationClock,
  weekSummary,
  weeklyDistanceSeries,
  lastActivities,
  type GeoPoint,
  type SportActivity,
} from "./sport-store";

// Dois pontos ~111m ao norte um do outro (1 milésimo de grau de latitude),
// referência conhecida pra conferir a fórmula de haversine sem depender de
// nenhuma biblioteca externa.
const P1: GeoPoint = { lat: -23.55, lng: -46.63, recordedAt: "2026-01-01T10:00:00Z" };
const P2: GeoPoint = { lat: -23.549, lng: -46.63, recordedAt: "2026-01-01T10:00:30Z" };

describe("haversineMeters", () => {
  it("mede ~111m pra 0.001° de latitude", () => {
    const d = haversineMeters(P1, P2);
    expect(d).toBeGreaterThan(105);
    expect(d).toBeLessThan(115);
  });

  it("é zero pro mesmo ponto", () => {
    expect(haversineMeters(P1, P1)).toBe(0);
  });
});

describe("filterValidPoints", () => {
  it("mantém pontos normais em sequência", () => {
    const out = filterValidPoints([P1, P2]);
    expect(out).toHaveLength(2);
  });

  it("descarta ponto com precisão ruim (accuracy > 50m)", () => {
    const bad: GeoPoint = { ...P2, accuracyM: 80 };
    const out = filterValidPoints([P1, bad]);
    expect(out).toHaveLength(1);
    expect(out[0]).toBe(P1);
  });

  it("descarta salto de GPS implausível (>60km/h) sem somar a distância", () => {
    // 5km em 1 segundo = 18.000 km/h — impossível pra corrida/caminhada/ciclismo.
    const teleport: GeoPoint = { lat: -23.6, lng: -46.63, recordedAt: "2026-01-01T10:00:31Z" };
    const out = filterValidPoints([P1, P2, teleport]);
    expect(out).toHaveLength(2);
    expect(out).not.toContain(teleport);
  });

  it("aceita velocidade real de ciclismo (~35km/h) sem descartar", () => {
    // ~292m em 30s ≈ 35km/h — real e plausível, não deve ser filtrado.
    const fast: GeoPoint = { lat: -23.5474, lng: -46.63, recordedAt: "2026-01-01T10:01:00Z" };
    const out = filterValidPoints([P1, P2, fast]);
    expect(out).toHaveLength(3);
  });
});

describe("computeDistanceM", () => {
  it("soma segmentos válidos e ignora o salto de sinal", () => {
    const teleport: GeoPoint = { lat: -23.6, lng: -46.63, recordedAt: "2026-01-01T10:00:31Z" };
    const backToNormal: GeoPoint = {
      lat: -23.548,
      lng: -46.63,
      recordedAt: "2026-01-01T10:01:00Z",
    };
    const withoutJump = computeDistanceM([P1, P2, backToNormal]);
    const withJump = computeDistanceM([P1, P2, teleport, backToNormal]);
    // A distância final não pode disparar só porque um ponto de teletransporte
    // apareceu no meio — o ponto ruim é descartado, não vira quilômetros extras.
    expect(withJump).toBeCloseTo(withoutJump, 0);
  });

  it("é zero com um único ponto", () => {
    expect(computeDistanceM([P1])).toBe(0);
  });
});

describe("computeDurations", () => {
  it("tempo ativo = total quando não há pausa", () => {
    const r = computeDurations("2026-01-01T10:00:00Z", "2026-01-01T10:30:00Z", []);
    expect(r.totalDurationS).toBe(1800);
    expect(r.activeDurationS).toBe(1800);
  });

  it("desconta o intervalo pausado do tempo ativo, mantendo o total", () => {
    const r = computeDurations("2026-01-01T10:00:00Z", "2026-01-01T10:30:00Z", [
      { pausedAt: "2026-01-01T10:10:00Z", resumedAt: "2026-01-01T10:15:00Z" },
    ]);
    expect(r.totalDurationS).toBe(1800);
    expect(r.activeDurationS).toBe(1800 - 300);
  });

  it("uma pausa ainda aberta conta até o fim da atividade", () => {
    const r = computeDurations("2026-01-01T10:00:00Z", "2026-01-01T10:30:00Z", [
      { pausedAt: "2026-01-01T10:20:00Z" },
    ]);
    expect(r.activeDurationS).toBe(1200); // só os primeiros 20min contam como ativo
  });
});

describe("pace/velocidade e formatação", () => {
  it("5km em 25min = 5min/km", () => {
    const pace = computePaceSPerKm(5000, 25 * 60);
    expect(pace).toBe(300);
    expect(formatPace(pace)).toBe("5'00\"/km");
  });

  it("20km em 1h = 20km/h", () => {
    const speed = computeSpeedKmh(20000, 3600);
    expect(speed).toBe(20);
    expect(formatSpeedKmh(speed)).toBe("20.0 km/h");
  });

  it("pace/velocidade nulos viram travessão, nunca NaN/Infinity", () => {
    expect(computePaceSPerKm(0, 100)).toBeNull();
    expect(computeSpeedKmh(100, 0)).toBeNull();
    expect(formatPace(null)).toBe("—");
    expect(formatSpeedKmh(null)).toBe("—");
  });

  it("formata distância e duração", () => {
    expect(formatDistanceKm(8234)).toBe("8.23 km");
    expect(formatDurationClock(65)).toBe("01:05");
    expect(formatDurationClock(3725)).toBe("1:02:05");
  });
});

function activity(overrides: Partial<SportActivity>): SportActivity {
  return {
    id: crypto.randomUUID(),
    modality: "corrida",
    source: "gravado",
    title: "Corrida",
    startedAt: "2026-01-05T10:00:00Z",
    activeDurationS: 1800,
    totalDurationS: 1800,
    distanceM: 5000,
    privacyHideRoute: false,
    privacyHideStartEnd: false,
    isPrivate: true,
    createdAt: "2026-01-05T10:00:00Z",
    updatedAt: "2026-01-05T10:00:00Z",
    ...overrides,
  };
}

describe("seletores de Visão geral", () => {
  // 2026-01-05 é segunda-feira — âncora estável pra todos os testes de semana.
  const monday = "2026-01-05";

  it("resume sessões e distância da semana atual, ignorando semana anterior", () => {
    const acts = [
      activity({ startedAt: "2026-01-05T08:00:00Z", distanceM: 5000 }),
      activity({ startedAt: "2026-01-07T08:00:00Z", distanceM: 3000 }),
      activity({ startedAt: "2025-12-29T08:00:00Z", distanceM: 10000 }), // semana anterior
    ];
    const s = weekSummary(acts, "corrida", monday);
    expect(s.sessions).toBe(2);
    expect(s.distanceM).toBe(8000);
  });

  it("nunca mistura modalidades diferentes na mesma meta", () => {
    const acts = [
      activity({ startedAt: "2026-01-05T08:00:00Z", distanceM: 5000, modality: "corrida" }),
      activity({ startedAt: "2026-01-05T08:00:00Z", distanceM: 20000, modality: "ciclismo" }),
    ];
    const s = weekSummary(acts, "corrida", monday);
    expect(s.distanceM).toBe(5000);
  });

  it("série semanal tem o tamanho pedido e a última posição é a semana atual", () => {
    const acts = [activity({ startedAt: "2026-01-05T08:00:00Z", distanceM: 5000 })];
    const series = weeklyDistanceSeries(acts, "corrida", 4, monday);
    expect(series).toHaveLength(4);
    expect(series[3]).toBe(5);
  });

  it("últimas N atividades respeita o limite e a ordenação recebida", () => {
    const acts = [
      activity({ startedAt: "2026-01-05T08:00:00Z" }),
      activity({ startedAt: "2026-01-04T08:00:00Z" }),
      activity({ startedAt: "2026-01-03T08:00:00Z" }),
    ];
    expect(lastActivities(acts, "corrida", 2)).toHaveLength(2);
  });
});
