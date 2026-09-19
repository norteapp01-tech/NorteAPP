import { computeRouteDistanceM, type RoutePoint } from "./sport-route-geometry";
import type { SportModality } from "./sport-store";

// ---------------------------------------------------------------------------
// "Esta corrida parece corresponder à rota X" — comparação pura, sem I/O e sem
// extensão geoespacial (o projeto inteiro trabalha com lat/lng em jsonb; puxar
// PostGIS só para isso seria uma dependência de infraestrutura por uma
// heurística).
//
// A regra que manda em tudo aqui: na dúvida, NÃO vincula. Uma sugestão errada
// contamina recordes e média de uma rota inteira, e a pessoa não tem como
// perceber que aconteceu. Toda correspondência abaixo de alta confiança volta
// como sugestão que precisa de confirmação.
// ---------------------------------------------------------------------------

/** Quanto as pontas podem estar distantes e ainda ser "a mesma rota". 120 m
 * cobre dar a volta no quarteirão e a imprecisão de GPS no primeiro fix, sem
 * chegar perto de confundir duas praças vizinhas. */
const MAX_ENDPOINT_DISTANCE_M = 120;
/** Diferença proporcional de distância tolerada. */
const MAX_DISTANCE_RATIO = 0.12;
/** Abaixo disto a proposta nem aparece. */
const MIN_SCORE_TO_SUGGEST = 0.55;
/** Acima disto a proposta aparece como "alta confiança" — e MESMO ASSIM
 * continua precisando de confirmação. */
export const HIGH_CONFIDENCE_SCORE = 0.85;

const EARTH_RADIUS_M = 6371000;
const toRad = (d: number) => (d * Math.PI) / 180;

export function distanceBetween(a: RoutePoint, b: RoutePoint): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

export type RouteCandidate = {
  id: string;
  modality: SportModality;
  title: string;
  points: RoutePoint[];
  distanceM: number;
  startLat?: number | null;
  startLng?: number | null;
  endLat?: number | null;
  endLng?: number | null;
};

export type RouteMatch = {
  route: RouteCandidate;
  score: number;
  highConfidence: boolean;
  reasons: string[];
};

function endpointsOf(route: RouteCandidate): { start: RoutePoint; end: RoutePoint } | null {
  if (
    route.startLat != null &&
    route.startLng != null &&
    route.endLat != null &&
    route.endLng != null
  ) {
    return {
      start: { lat: route.startLat, lng: route.startLng },
      end: { lat: route.endLat, lng: route.endLng },
    };
  }
  const first = route.points[0];
  const last = route.points.at(-1);
  if (!first || !last) return null;
  return { start: first, end: last };
}

/** Amostra N pontos igualmente espaçados pelo ÍNDICE — barato e suficiente
 * para comparar formato; não é simplificação geométrica. */
function sample(points: RoutePoint[], n: number): RoutePoint[] {
  if (points.length <= n) return points;
  const out: RoutePoint[] = [];
  for (let i = 0; i < n; i++) {
    out.push(points[Math.round((i * (points.length - 1)) / (n - 1))]);
  }
  return out;
}

/** Distância média entre pontos correspondentes de duas amostras do mesmo
 * tamanho. Compara a rota no sentido percorrido — ida e volta invertidas são
 * percursos diferentes para quem corre. */
function averageShapeDistanceM(a: RoutePoint[], b: RoutePoint[]): number | null {
  const n = 12;
  const sa = sample(a, n);
  const sb = sample(b, n);
  if (sa.length < 2 || sb.length < 2 || sa.length !== sb.length) return null;
  let total = 0;
  for (let i = 0; i < sa.length; i++) total += distanceBetween(sa[i], sb[i]);
  return total / sa.length;
}

/**
 * Compara um percurso gravado com as rotas salvas da MESMA modalidade.
 *
 * Critérios, todos obrigatórios para sequer pontuar: modalidade igual, pontas
 * próximas e distância dentro da tolerância proporcional. O formato do traço
 * só refina a pontuação — sozinho ele não vincula nada.
 */
export function findRouteMatches(
  recordedPoints: RoutePoint[],
  modality: SportModality,
  routes: RouteCandidate[],
): RouteMatch[] {
  const start = recordedPoints[0];
  const end = recordedPoints.at(-1);
  if (!start || !end || recordedPoints.length < 2) return [];
  const recordedDistanceM = computeRouteDistanceM(recordedPoints);
  if (recordedDistanceM <= 0) return [];

  const matches: RouteMatch[] = [];
  for (const route of routes) {
    if (route.modality !== modality) continue;
    if (route.distanceM <= 0) continue;
    const ends = endpointsOf(route);
    if (!ends) continue;

    const startGap = distanceBetween(start, ends.start);
    const endGap = distanceBetween(end, ends.end);
    if (startGap > MAX_ENDPOINT_DISTANCE_M || endGap > MAX_ENDPOINT_DISTANCE_M) continue;

    const ratio = Math.abs(recordedDistanceM - route.distanceM) / route.distanceM;
    if (ratio > MAX_DISTANCE_RATIO) continue;

    const reasons: string[] = [];
    // Cada critério vira uma fração de 0 a 1; a pontuação é a média ponderada.
    const endpointScore = 1 - (startGap + endGap) / (2 * MAX_ENDPOINT_DISTANCE_M);
    const distanceScore = 1 - ratio / MAX_DISTANCE_RATIO;
    reasons.push(`início e fim a menos de ${Math.round(Math.max(startGap, endGap))} m`);
    reasons.push(`distância ${(ratio * 100).toFixed(0)}% diferente`);

    const shapeGap = averageShapeDistanceM(recordedPoints, route.points);
    let shapeScore = 0.5; // neutro quando não dá para comparar o traço
    if (shapeGap !== null) {
      shapeScore = Math.max(0, 1 - shapeGap / 150);
      reasons.push(`traço a ${Math.round(shapeGap)} m em média`);
    }

    const score = endpointScore * 0.35 + distanceScore * 0.3 + shapeScore * 0.35;
    if (score < MIN_SCORE_TO_SUGGEST) continue;
    matches.push({
      route,
      score: Math.round(score * 100) / 100,
      highConfidence: score >= HIGH_CONFIDENCE_SCORE,
      reasons,
    });
  }

  return matches.sort((a, b) => b.score - a.score);
}

/** A melhor proposta, ou null. Nunca vincula sozinha — quem chama sempre pede
 * confirmação. */
export function bestRouteMatch(
  recordedPoints: RoutePoint[],
  modality: SportModality,
  routes: RouteCandidate[],
): RouteMatch | null {
  return findRouteMatches(recordedPoints, modality, routes)[0] ?? null;
}
