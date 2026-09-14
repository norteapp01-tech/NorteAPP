// ---------------------------------------------------------------------------
// Geometria de rota desenhada — funções puras, sem I/O. Uma rota é um
// desenho no mapa (só lat/lng, sem tempo real), diferente de GeoPoint (que
// vem de GPS real e tem timestamp/precisão). Por isso um tipo próprio aqui,
// em vez de forçar o desenho a caber no formato de um ponto gravado.
//
// Nunca calcula esquerda/direita: um desenho não é uma rua real, e um erro
// de sinal/ordem lat-lng numa instrução de "vire" seria pior que não avisar
// nada. Só distância até onde o traço muda de direção, e um marcador visual
// no próprio mapa — isso já responde "onde vai virar" sem afirmar uma
// direção que pode estar errada.
// ---------------------------------------------------------------------------

export type RoutePoint = { lat: number; lng: number };

export type DirectionChange = {
  pointIndex: number;
  point: RoutePoint;
  cumulativeDistanceM: number;
};

export type RouteGuidance = {
  /** Pontos após fundir segmentos muito curtos — usados pra progresso e viradas. */
  points: RoutePoint[];
  cumulativeDistances: number[];
  directionChanges: DirectionChange[];
  totalDistanceM: number;
};

export type RouteProgress = { progressM: number; offRouteM: number };

export type RouteGuidanceState = {
  progressM: number;
  offRouteM: number;
  nextChange: DirectionChange | null;
  distanceToNextChangeM: number | null;
};

const EARTH_RADIUS_M = 6371000;
const MIN_SEGMENT_M = 6;
const TURN_THRESHOLD_DEG = 30;
const TURN_MERGE_RADIUS_M = 18;
const DEFAULT_PROGRESS_WINDOW_M = 150;

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}
function toDeg(rad: number): number {
  return (rad * 180) / Math.PI;
}

function haversineM(a: RoutePoint, b: RoutePoint): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

function bearingDeg(a: RoutePoint, b: RoutePoint): number {
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const dLng = toRad(b.lng - a.lng);
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/** Menor diferença absoluta entre dois ângulos (0-180°). */
function angleDiffDeg(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

export function computeRouteDistanceM(points: RoutePoint[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += haversineM(points[i - 1], points[i]);
  return total;
}

export function cumulativeDistances(points: RoutePoint[]): number[] {
  const cum = [0];
  for (let i = 1; i < points.length; i++)
    cum.push(cum[i - 1] + haversineM(points[i - 1], points[i]));
  return cum;
}

/** Funde vértices muito próximos do anterior mantido — evita ângulos
 * ruidosos vindos de toques colados de mais ao desenhar. Sempre mantém o
 * primeiro e o último ponto. */
export function simplifyShortSegments(
  points: RoutePoint[],
  minSegmentM = MIN_SEGMENT_M,
): RoutePoint[] {
  if (points.length < 3) return points;
  const result: RoutePoint[] = [points[0]];
  for (let i = 1; i < points.length - 1; i++) {
    const prev = result[result.length - 1];
    if (haversineM(prev, points[i]) >= minSegmentM) result.push(points[i]);
  }
  result.push(points[points.length - 1]);
  return result;
}

/** Vértices onde o desenho muda de direção acima do limiar — fundidos entre
 * si quando estão muito próximos (evita avisar a cada poucos metros num
 * zigue-zague). */
export function detectDirectionChanges(
  rawPoints: RoutePoint[],
  opts: { turnThresholdDeg?: number; mergeRadiusM?: number; minSegmentM?: number } = {},
): DirectionChange[] {
  const turnThresholdDeg = opts.turnThresholdDeg ?? TURN_THRESHOLD_DEG;
  const mergeRadiusM = opts.mergeRadiusM ?? TURN_MERGE_RADIUS_M;
  const points = simplifyShortSegments(rawPoints, opts.minSegmentM ?? MIN_SEGMENT_M);
  if (points.length < 3) return [];

  const cum = cumulativeDistances(points);
  const raw: DirectionChange[] = [];
  for (let i = 1; i < points.length - 1; i++) {
    const bearingIn = bearingDeg(points[i - 1], points[i]);
    const bearingOut = bearingDeg(points[i], points[i + 1]);
    if (angleDiffDeg(bearingIn, bearingOut) >= turnThresholdDeg) {
      raw.push({ pointIndex: i, point: points[i], cumulativeDistanceM: cum[i] });
    }
  }

  // Compara cada virada bruta com a ANTERIOR (não com a última mantida) —
  // assim uma sequência de viradas próximas encadeadas (zigue-zague) funde
  // tudo num só aviso, mesmo que a distância do início ao fim da sequência
  // passe do raio de fusão.
  const merged: DirectionChange[] = [];
  let lastRawCumulativeM: number | null = null;
  for (const change of raw) {
    if (
      lastRawCumulativeM === null ||
      change.cumulativeDistanceM - lastRawCumulativeM > mergeRadiusM
    ) {
      merged.push(change);
    }
    lastRawCumulativeM = change.cumulativeDistanceM;
  }
  return merged;
}

export function deriveRouteGuidance(rawPoints: RoutePoint[]): RouteGuidance {
  const points = simplifyShortSegments(rawPoints);
  const dists = cumulativeDistances(points);
  return {
    points,
    cumulativeDistances: dists,
    directionChanges: detectDirectionChanges(rawPoints),
    totalDistanceM: dists[dists.length - 1] ?? 0,
  };
}

/** Projeção local equiretangular em volta do segmento — aproximação boa o
 * suficiente na escala de uma corrida/pedalada (segmentos de dezenas a
 * poucas centenas de metros); o erro é desprezível perto da própria
 * precisão do GPS (5-50m). */
function projectOntoSegment(
  a: RoutePoint,
  b: RoutePoint,
  p: RoutePoint,
): { alongM: number; offRouteM: number } {
  const latRef = (a.lat + b.lat) / 2;
  const mPerDegLat = 111320;
  const mPerDegLng = 111320 * Math.cos(toRad(latRef));
  const bx = (b.lng - a.lng) * mPerDegLng;
  const by = (b.lat - a.lat) * mPerDegLat;
  const px = (p.lng - a.lng) * mPerDegLng;
  const py = (p.lat - a.lat) * mPerDegLat;
  const segLenSq = bx * bx + by * by;
  let t = segLenSq === 0 ? 0 : (px * bx + py * by) / segLenSq;
  t = Math.max(0, Math.min(1, t));
  const projX = t * bx;
  const projY = t * by;
  return {
    alongM: t * Math.sqrt(segLenSq),
    offRouteM: Math.sqrt((px - projX) ** 2 + (py - projY) ** 2),
  };
}

/** Progresso ao longo da rota buscado numa JANELA em volta do último
 * progresso conhecido — nunca uma busca global pelo ponto mais próximo.
 * É isso que desambigua corretamente uma rota ida-e-volta: a perna de volta
 * fica a poucos metros da de ida, e uma busca global "mais próximo" acabaria
 * grudando na perna errada assim que a pessoa vira pra voltar. */
export function projectProgress(
  points: RoutePoint[],
  cumDistances: number[],
  current: RoutePoint,
  lastProgressM: number | null,
  windowAheadM = DEFAULT_PROGRESS_WINDOW_M,
): RouteProgress {
  const totalM = cumDistances[cumDistances.length - 1] ?? 0;
  if (points.length < 2 || totalM === 0) return { progressM: 0, offRouteM: Infinity };

  const behindM = windowAheadM * 0.3;
  const lo = lastProgressM === null ? 0 : Math.max(0, lastProgressM - behindM);
  const hi = lastProgressM === null ? totalM : Math.min(totalM, lastProgressM + windowAheadM);

  let best: RouteProgress = { progressM: lastProgressM ?? 0, offRouteM: Infinity };
  for (let i = 0; i < points.length - 1; i++) {
    const segStart = cumDistances[i];
    const segEnd = cumDistances[i + 1];
    if (segEnd < lo || segStart > hi) continue;
    const proj = projectOntoSegment(points[i], points[i + 1], current);
    if (proj.offRouteM < best.offRouteM) {
      best = { progressM: segStart + proj.alongM, offRouteM: proj.offRouteM };
    }
  }
  return best;
}

export function nextChangeAhead(
  guidance: RouteGuidance,
  progressM: number,
): DirectionChange | null {
  return guidance.directionChanges.find((c) => c.cumulativeDistanceM >= progressM) ?? null;
}

/** Chamado a cada ponto de GPS aceito durante uma gravação guiada. */
export function computeRouteGuidanceState(
  guidance: RouteGuidance,
  currentPos: RoutePoint,
  lastProgressM: number | null,
): RouteGuidanceState {
  const { progressM, offRouteM } = projectProgress(
    guidance.points,
    guidance.cumulativeDistances,
    currentPos,
    lastProgressM,
  );
  const nextChange = nextChangeAhead(guidance, progressM);
  return {
    progressM,
    offRouteM,
    nextChange,
    distanceToNextChangeM: nextChange
      ? Math.max(0, nextChange.cumulativeDistanceM - progressM)
      : null,
  };
}

export function formatChangeDistanceM(m: number): string {
  if (m < 1000) return `${Math.round(m)} m`;
  return `${(m / 1000).toFixed(1)} km`;
}
