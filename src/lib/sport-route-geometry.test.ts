import { describe, it, expect } from "vitest";
import {
  computeRouteDistanceM,
  simplifyShortSegments,
  detectDirectionChanges,
  deriveRouteGuidance,
  projectProgress,
  computeRouteGuidanceState,
  formatChangeDistanceM,
  type RoutePoint,
} from "./sport-route-geometry";

const BASE_LAT = -23.55;
const BASE_LNG = -46.63;
const M_PER_DEG_LAT = 111320;

/** Ponto a `northM`/`eastM` metros de um ponto base — só pra montar rotas
 * sintéticas com distâncias conhecidas nos testes, não usado no código real. */
function offset(northM: number, eastM: number, lat = BASE_LAT, lng = BASE_LNG): RoutePoint {
  const mPerDegLng = M_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180);
  return { lat: lat + northM / M_PER_DEG_LAT, lng: lng + eastM / mPerDegLng };
}

describe("computeRouteDistanceM", () => {
  it("soma a distância real de um traço reto", () => {
    const d = computeRouteDistanceM([offset(0, 0), offset(50, 0), offset(100, 0)]);
    expect(d).toBeGreaterThan(95);
    expect(d).toBeLessThan(105);
  });

  it("é zero pra um único ponto ou lista vazia", () => {
    expect(computeRouteDistanceM([offset(0, 0)])).toBe(0);
    expect(computeRouteDistanceM([])).toBe(0);
  });
});

describe("simplifyShortSegments", () => {
  it("mantém pontos bem espaçados", () => {
    const points = [offset(0, 0), offset(20, 0), offset(40, 0)];
    expect(simplifyShortSegments(points)).toHaveLength(3);
  });

  it("funde um ponto muito próximo do anterior mantido", () => {
    const points = [offset(0, 0), offset(2, 0), offset(40, 0)];
    const out = simplifyShortSegments(points, 6);
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual(points[0]);
    expect(out[1]).toEqual(points[2]);
  });

  it("sempre mantém o primeiro e o último ponto", () => {
    const points = [offset(0, 0), offset(1, 0), offset(2, 0)];
    const out = simplifyShortSegments(points, 50);
    expect(out[0]).toEqual(points[0]);
    expect(out[out.length - 1]).toEqual(points[points.length - 1]);
  });
});

describe("detectDirectionChanges", () => {
  it("não acusa virada numa linha reta", () => {
    const points = [offset(0, 0), offset(50, 0), offset(100, 0)];
    expect(detectDirectionChanges(points)).toHaveLength(0);
  });

  it("acusa uma virada num L simples", () => {
    const points = [offset(0, 0), offset(100, 0), offset(100, 100)];
    const changes = detectDirectionChanges(points);
    expect(changes).toHaveLength(1);
    expect(changes[0].pointIndex).toBe(1);
    expect(changes[0].cumulativeDistanceM).toBeGreaterThan(95);
    expect(changes[0].cumulativeDistanceM).toBeLessThan(105);
  });

  it("funde viradas próximas de um zigue-zague num único aviso", () => {
    const points = [
      offset(0, 0), // p0
      offset(20, 0), // p1 — vira 90° aqui (cum ~20)
      offset(20, 10), // p2 — vira de novo aqui (cum ~30, a 10m da anterior)
      offset(30, 10), // p3 — e de novo (cum ~40, a 10m da anterior)
      offset(30, 30), // p4
    ];
    const changes = detectDirectionChanges(points, { mergeRadiusM: 18 });
    expect(changes).toHaveLength(1);
    expect(changes[0].pointIndex).toBe(1);
  });

  it("não acusa nada com menos de 3 pontos", () => {
    expect(detectDirectionChanges([offset(0, 0), offset(10, 0)])).toHaveLength(0);
  });
});

describe("projectProgress — desambiguação de rota ida-e-volta", () => {
  // Rota que vai 100m ao norte e volta pelo mesmo traço até o início —
  // exatamente o caso que uma busca GLOBAL por "ponto mais próximo" erraria:
  // a 47m do início, TANTO a perna de ida (progresso ~47m) QUANTO a perna de
  // volta (progresso ~153m) passam pelo mesmo lugar. Sem uma janela em volta
  // do progresso já conhecido, a busca prenderia de volta na perna de ida.
  const points = [offset(0, 0), offset(100, 0), offset(0, 0)];
  const cum = [0, 100, 200];

  it("com progresso conhecido na perna de volta, fica na perna de volta", () => {
    const current = offset(47, 0); // sobre a mesma linha das duas pernas
    const result = projectProgress(points, cum, current, 160, 150);
    expect(result.progressM).toBeGreaterThan(140); // não voltou pra perna de ida (~47)
    expect(result.offRouteM).toBeLessThan(1);
  });

  it("sem progresso anterior (primeiro ponto), busca a rota toda", () => {
    const current = offset(50, 0);
    const result = projectProgress(points, cum, current, null);
    expect(result.offRouteM).toBeLessThan(1);
  });

  it("acusa distância real quando a posição está longe da rota", () => {
    const current = offset(50, 200); // 200m a leste da linha
    const result = projectProgress(points, cum, current, 50, 150);
    expect(result.offRouteM).toBeGreaterThan(150);
  });
});

describe("computeRouteGuidanceState", () => {
  it("calcula distância até a próxima mudança de direção", () => {
    const guidance = deriveRouteGuidance([offset(0, 0), offset(100, 0), offset(100, 100)]);
    const current = offset(70, 0); // 30m antes da virada em n=100
    const state = computeRouteGuidanceState(guidance, current, 70);
    expect(state.nextChange).not.toBeNull();
    expect(state.distanceToNextChangeM).toBeGreaterThan(25);
    expect(state.distanceToNextChangeM).toBeLessThan(35);
  });

  it("não tem próxima virada depois da última mudança de direção", () => {
    const guidance = deriveRouteGuidance([offset(0, 0), offset(100, 0), offset(100, 100)]);
    const current = offset(100, 90); // já passou da virada
    const state = computeRouteGuidanceState(guidance, current, 190);
    expect(state.nextChange).toBeNull();
    expect(state.distanceToNextChangeM).toBeNull();
  });
});

describe("formatChangeDistanceM", () => {
  it("formata metros abaixo de 1km", () => {
    expect(formatChangeDistanceM(42)).toBe("42 m");
    expect(formatChangeDistanceM(999)).toBe("999 m");
  });

  it("formata quilômetros a partir de 1km", () => {
    expect(formatChangeDistanceM(1500)).toBe("1.5 km");
  });
});
