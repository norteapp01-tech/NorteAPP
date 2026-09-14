import { useQuery } from "@tanstack/react-query";
import { supabase, ensureSession, useSupabaseUserId } from "./supabase/client";
import { queryClient } from "./query-client";
import { type SportModality } from "./goals-store";

// ---------------------------------------------------------------------------
// Esportes — registro real de atividades (Corrida, Caminhada, Ciclismo).
// Planejamento continua em goals-store.ts (executions/routines, sem motor
// novo); aqui só vive o que de fato aconteceu — percurso, distância, tempo —
// e as funções puras de cálculo, isoladas pra serem testáveis sem GPS real.
// ---------------------------------------------------------------------------

export type { SportModality };

export const modalityLabel: Record<SportModality, string> = {
  corrida: "Corrida",
  caminhada: "Caminhada",
  ciclismo: "Ciclismo",
};

export const modalityActionLabel: Record<SportModality, string> = {
  corrida: "Iniciar corrida",
  caminhada: "Iniciar caminhada",
  ciclismo: "Iniciar pedalada",
};

// ---------------------------------------------------------------------------
// Estilo do mapa — preferência leve por dispositivo (mesmo padrão da última
// modalidade escolhida), sem precisar de coluna nova no perfil.
// ---------------------------------------------------------------------------

export type MapStyle = "escuro" | "claro" | "padrao" | "satelite" | "hibrido";
const MAP_STYLE_STORAGE_KEY = "norte:esportes:mapStyle";
const MAP_STYLE_VALUES: MapStyle[] = ["escuro", "claro", "padrao", "satelite", "hibrido"];

export const mapStyleLabel: Record<MapStyle, string> = {
  escuro: "Escuro",
  claro: "Claro",
  padrao: "Padrão",
  satelite: "Satélite",
  hibrido: "Híbrido",
};

export const mapStyleUrl: Record<MapStyle, string> = {
  escuro: "mapbox://styles/mapbox/dark-v11",
  claro: "mapbox://styles/mapbox/light-v11",
  padrao: "mapbox://styles/mapbox/streets-v12",
  satelite: "mapbox://styles/mapbox/satellite-v9",
  hibrido: "mapbox://styles/mapbox/satellite-streets-v12",
};

/** Verde mais saturado nos fundos claros (perde contraste no tom padrão);
 * amarelo nos fundos de satélite, onde o verde se mistura com vegetação
 * real na imagem. */
export const mapRouteColor: Record<MapStyle, string> = {
  escuro: "#7ee08a",
  claro: "#1f9d55",
  padrao: "#1f9d55",
  satelite: "#ffdd00",
  hibrido: "#ffdd00",
};

export function loadMapStyle(): MapStyle {
  if (typeof window === "undefined") return "escuro";
  const saved = window.localStorage.getItem(MAP_STYLE_STORAGE_KEY);
  return (MAP_STYLE_VALUES as string[]).includes(saved ?? "") ? (saved as MapStyle) : "escuro";
}

export function saveMapStyle(style: MapStyle) {
  window.localStorage.setItem(MAP_STYLE_STORAGE_KEY, style);
}

const mapStyleId: Record<MapStyle, string> = {
  escuro: "dark-v11",
  claro: "light-v11",
  padrao: "streets-v12",
  satelite: "satellite-v9",
  hibrido: "satellite-streets-v12",
};

/** Prévia real do estilo (Mapbox Static Images API) — a mesma renderização
 * que o mapa ao vivo usaria naquele local, nunca uma imagem de estoque ou
 * ilustração fingindo ser o estilo. */
export function mapStylePreviewUrl(
  style: MapStyle,
  center: { lat: number; lng: number },
  opts: { widthPx?: number; heightPx?: number; zoom?: number } = {},
): string | null {
  const token = import.meta.env.VITE_MAPBOX_TOKEN as string | undefined;
  if (!token) return null;
  const { widthPx = 160, heightPx = 100, zoom = 13 } = opts;
  return `https://api.mapbox.com/styles/v1/mapbox/${mapStyleId[style]}/static/${center.lng},${center.lat},${zoom},0,0/${widthPx}x${heightPx}@2x?access_token=${token}`;
}

// ---------------------------------------------------------------------------
// Geometria e tempo — puro, sem I/O. É a parte que precisa estar certa: nunca
// soma um salto de GPS como se fosse percurso real, nunca inventa distância.
// ---------------------------------------------------------------------------

export type GeoPoint = {
  lat: number;
  lng: number;
  recordedAt: string; // ISO
  accuracyM?: number;
  elevationM?: number;
};

const EARTH_RADIUS_M = 6371000;

export function haversineMeters(a: GeoPoint, b: GeoPoint): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

const MAX_ACCEPTABLE_ACCURACY_M = 50;
/** Generoso o bastante pra nunca descartar ciclismo rápido de verdade — só
 * existe pra rejeitar salto de GPS (teletransporte de sinal), não pra
 * validar performance esportiva. */
const MAX_PLAUSIBLE_SPEED_KMH = 60;

/** Descarta pontos com precisão ruim ou que implicam velocidade impossível
 * em relação ao último ponto aceito. Nunca soma um salto de sinal como
 * distância percorrida; durante perda de sinal, o trecho some do cálculo em
 * vez de ser inventado. */
export function filterValidPoints(points: GeoPoint[]): GeoPoint[] {
  const valid: GeoPoint[] = [];
  for (const p of points) {
    if (p.accuracyM !== undefined && p.accuracyM > MAX_ACCEPTABLE_ACCURACY_M) continue;
    const prev = valid[valid.length - 1];
    if (prev) {
      const distM = haversineMeters(prev, p);
      const dtS = (new Date(p.recordedAt).getTime() - new Date(prev.recordedAt).getTime()) / 1000;
      if (dtS > 0 && (distM / dtS) * 3.6 > MAX_PLAUSIBLE_SPEED_KMH) continue;
    }
    valid.push(p);
  }
  return valid;
}

export function computeDistanceM(points: GeoPoint[]): number {
  const valid = filterValidPoints(points);
  let total = 0;
  for (let i = 1; i < valid.length; i++) total += haversineMeters(valid[i - 1], valid[i]);
  return total;
}

export type PauseInterval = { pausedAt: string; resumedAt?: string };

/** Tempo total decorrido menos os intervalos pausados. Sem detecção
 * automática de movimento nesta versão — pausa é sempre manual; por isso
 * "tempo ativo" nunca é chamado de "tempo em movimento" na UI. */
export function computeDurations(
  startedAt: string,
  endedAt: string | null,
  pauses: PauseInterval[],
  nowIso: string = new Date().toISOString(),
): { totalDurationS: number; activeDurationS: number } {
  const start = new Date(startedAt).getTime();
  const end = new Date(endedAt ?? nowIso).getTime();
  const totalDurationS = Math.max(0, Math.round((end - start) / 1000));
  let pausedS = 0;
  for (const p of pauses) {
    const pausedAt = new Date(p.pausedAt).getTime();
    const resumedAt = p.resumedAt ? new Date(p.resumedAt).getTime() : end;
    pausedS += Math.max(0, (Math.min(resumedAt, end) - pausedAt) / 1000);
  }
  const activeDurationS = Math.max(0, totalDurationS - Math.round(pausedS));
  return { totalDurationS, activeDurationS };
}

export function computePaceSPerKm(distanceM: number, activeDurationS: number): number | null {
  if (distanceM <= 0) return null;
  return activeDurationS / (distanceM / 1000);
}

export function computeSpeedKmh(distanceM: number, activeDurationS: number): number | null {
  if (activeDurationS <= 0) return null;
  return distanceM / 1000 / (activeDurationS / 3600);
}

export function formatDistanceKm(distanceM: number): string {
  return `${(distanceM / 1000).toFixed(2)} km`;
}

export function formatPace(sPerKm: number | null): string {
  if (sPerKm === null || !Number.isFinite(sPerKm)) return "—";
  const totalSeconds = Math.round(sPerKm);
  const min = Math.floor(totalSeconds / 60);
  const sec = totalSeconds % 60;
  return `${min}'${String(sec).padStart(2, "0")}"/km`;
}

export function formatSpeedKmh(kmh: number | null): string {
  if (kmh === null || !Number.isFinite(kmh)) return "—";
  return `${kmh.toFixed(1)} km/h`;
}

export function formatDurationClock(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.floor(totalSeconds % 60);
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

// ---------------------------------------------------------------------------
// Persistência
// ---------------------------------------------------------------------------

type Row = Record<string, unknown>;

function unwrap<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

export type ActivityType = "prova" | "longa" | "treino";
export type EffortLevel = "leve" | "moderado" | "maximo";

export const activityTypeLabel: Record<ActivityType, string> = {
  prova: "Prova",
  longa: "Longa",
  treino: "Treino",
};

export const effortLevelLabel: Record<EffortLevel, string> = {
  leve: "Confortável",
  moderado: "Moderado",
  maximo: "Esforço máximo",
};

export type SportActivity = {
  id: string;
  modality: SportModality;
  source: "gravado" | "manual";
  title: string;
  note?: string;
  startedAt: string;
  endedAt?: string;
  activeDurationS: number;
  totalDurationS: number;
  distanceM: number;
  avgPaceSPerKm?: number;
  avgSpeedKmh?: number;
  executionId?: string;
  routeId?: string;
  activityType?: ActivityType;
  effortLevel?: EffortLevel;
  photoUrl?: string;
  privacyHideRoute: boolean;
  privacyHideStartEnd: boolean;
  isPrivate: boolean;
  createdAt: string;
  updatedAt: string;
};

function mapActivity(r: Row): SportActivity {
  return {
    id: r.id as string,
    modality: r.modality as SportModality,
    source: r.source as SportActivity["source"],
    title: r.title as string,
    note: (r.note as string) ?? undefined,
    startedAt: r.started_at as string,
    endedAt: (r.ended_at as string) ?? undefined,
    activeDurationS: r.active_duration_s as number,
    totalDurationS: r.total_duration_s as number,
    distanceM: Number(r.distance_m),
    avgPaceSPerKm: r.avg_pace_s_per_km !== null ? Number(r.avg_pace_s_per_km) : undefined,
    avgSpeedKmh: r.avg_speed_kmh !== null ? Number(r.avg_speed_kmh) : undefined,
    executionId: (r.execution_id as string) ?? undefined,
    routeId: (r.route_id as string) ?? undefined,
    activityType: (r.activity_type as ActivityType) ?? undefined,
    effortLevel: (r.effort_level as EffortLevel) ?? undefined,
    photoUrl: (r.photo_url as string) ?? undefined,
    privacyHideRoute: r.privacy_hide_route as boolean,
    privacyHideStartEnd: r.privacy_hide_start_end as boolean,
    isPrivate: r.is_private as boolean,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}

export async function fetchActivities(): Promise<SportActivity[]> {
  const userId = await ensureSession();
  const rows = unwrap(
    await supabase
      .from("sport_activities")
      .select("*")
      .eq("user_id", userId)
      .order("started_at", { ascending: false }),
  );
  return (rows as Row[]).map(mapActivity);
}

export async function fetchActivityPoints(activityId: string): Promise<GeoPoint[]> {
  const rows = unwrap(
    await supabase
      .from("sport_activity_points")
      .select("*")
      .eq("activity_id", activityId)
      .order("sequence"),
  );
  return (rows as Row[]).map((r) => ({
    lat: r.lat as number,
    lng: r.lng as number,
    recordedAt: r.recorded_at as string,
    accuracyM: r.accuracy_m !== null ? Number(r.accuracy_m) : undefined,
    elevationM: r.elevation_m !== null ? Number(r.elevation_m) : undefined,
  }));
}

export async function fetchActivityPauses(activityId: string): Promise<PauseInterval[]> {
  const rows = unwrap(
    await supabase
      .from("sport_activity_pauses")
      .select("*")
      .eq("activity_id", activityId)
      .order("paused_at"),
  );
  return (rows as Row[]).map((r) => ({
    pausedAt: r.paused_at as string,
    resumedAt: (r.resumed_at as string) ?? undefined,
  }));
}

export async function createManualActivity(input: {
  modality: SportModality;
  title: string;
  note?: string;
  startedAt: string;
  distanceM: number;
  totalDurationS: number;
  executionId?: string;
}): Promise<string> {
  const userId = await ensureSession();
  const avgPaceSPerKm =
    input.modality !== "ciclismo" ? computePaceSPerKm(input.distanceM, input.totalDurationS) : null;
  const avgSpeedKmh =
    input.modality === "ciclismo" ? computeSpeedKmh(input.distanceM, input.totalDurationS) : null;
  const row = unwrap<{ id: string }>(
    await supabase
      .from("sport_activities")
      .insert({
        user_id: userId,
        modality: input.modality,
        source: "manual",
        title: input.title,
        note: input.note,
        started_at: input.startedAt,
        ended_at: new Date(
          new Date(input.startedAt).getTime() + input.totalDurationS * 1000,
        ).toISOString(),
        active_duration_s: input.totalDurationS,
        total_duration_s: input.totalDurationS,
        distance_m: input.distanceM,
        avg_pace_s_per_km: avgPaceSPerKm,
        avg_speed_kmh: avgSpeedKmh,
        execution_id: input.executionId,
      })
      .select()
      .single(),
  );
  await invalidate();
  return row.id as string;
}

/** Persiste uma atividade gravada por GPS de uma vez só (linha + pontos +
 * pausas): chamado ao finalizar. O buffer local (IndexedDB) durante a
 * gravação é quem garante que nada se perde antes disso — ver
 * `sport-recording.ts`. */
export async function saveRecordedActivity(input: {
  modality: SportModality;
  title: string;
  note?: string;
  startedAt: string;
  endedAt: string;
  points: GeoPoint[];
  pauses: PauseInterval[];
  executionId?: string;
  routeId?: string;
  activityType?: ActivityType;
  effortLevel?: EffortLevel;
}): Promise<string> {
  const userId = await ensureSession();
  const { totalDurationS, activeDurationS } = computeDurations(
    input.startedAt,
    input.endedAt,
    input.pauses,
  );
  const distanceM = computeDistanceM(input.points);
  const avgPaceSPerKm =
    input.modality !== "ciclismo" ? computePaceSPerKm(distanceM, activeDurationS) : null;
  const avgSpeedKmh =
    input.modality === "ciclismo" ? computeSpeedKmh(distanceM, activeDurationS) : null;

  const row = unwrap<{ id: string }>(
    await supabase
      .from("sport_activities")
      .insert({
        user_id: userId,
        modality: input.modality,
        source: "gravado",
        title: input.title,
        note: input.note,
        started_at: input.startedAt,
        ended_at: input.endedAt,
        active_duration_s: activeDurationS,
        total_duration_s: totalDurationS,
        distance_m: distanceM,
        avg_pace_s_per_km: avgPaceSPerKm,
        avg_speed_kmh: avgSpeedKmh,
        execution_id: input.executionId,
        route_id: input.routeId,
        activity_type: input.activityType,
        effort_level: input.effortLevel,
      })
      .select()
      .single(),
  );
  const activityId = row.id as string;

  if (input.points.length > 0) {
    unwrap(
      await supabase.from("sport_activity_points").insert(
        input.points.map((p, i) => ({
          activity_id: activityId,
          sequence: i,
          lat: p.lat,
          lng: p.lng,
          recorded_at: p.recordedAt,
          accuracy_m: p.accuracyM,
          elevation_m: p.elevationM,
        })),
      ),
    );
  }
  if (input.pauses.length > 0) {
    unwrap(
      await supabase.from("sport_activity_pauses").insert(
        input.pauses.map((p) => ({
          activity_id: activityId,
          paused_at: p.pausedAt,
          resumed_at: p.resumedAt,
        })),
      ),
    );
  }
  await invalidate();
  return activityId;
}

export async function updateActivity(
  id: string,
  patch: Partial<{
    title: string;
    note: string;
    photoUrl: string;
    privacyHideRoute: boolean;
    privacyHideStartEnd: boolean;
    isPrivate: boolean;
  }>,
): Promise<void> {
  const dbPatch: Row = {};
  if (patch.title !== undefined) dbPatch.title = patch.title;
  if (patch.note !== undefined) dbPatch.note = patch.note;
  if (patch.photoUrl !== undefined) dbPatch.photo_url = patch.photoUrl;
  if (patch.privacyHideRoute !== undefined) dbPatch.privacy_hide_route = patch.privacyHideRoute;
  if (patch.privacyHideStartEnd !== undefined)
    dbPatch.privacy_hide_start_end = patch.privacyHideStartEnd;
  if (patch.isPrivate !== undefined) dbPatch.is_private = patch.isPrivate;
  unwrap(await supabase.from("sport_activities").update(dbPatch).eq("id", id).select().single());
  await invalidate();
}

export async function deleteActivity(id: string): Promise<void> {
  unwrap(await supabase.from("sport_activities").delete().eq("id", id).select());
  await invalidate();
}

export async function linkActivityToExecution(
  activityId: string,
  executionId: string,
): Promise<void> {
  unwrap(
    await supabase
      .from("sport_activities")
      .update({ execution_id: executionId })
      .eq("id", activityId)
      .select()
      .single(),
  );
  await invalidate();
}

// ---------------------------------------------------------------------------
// Metas semanais — cada campo opcional, nunca preenchidas automaticamente.
// ---------------------------------------------------------------------------

export type SportWeeklyGoal = {
  id: string;
  modality: SportModality;
  targetSessions?: number;
  targetDistanceM?: number;
};

function mapWeeklyGoal(r: Row): SportWeeklyGoal {
  return {
    id: r.id as string,
    modality: r.modality as SportModality,
    targetSessions: r.target_sessions !== null ? Number(r.target_sessions) : undefined,
    targetDistanceM: r.target_distance_m !== null ? Number(r.target_distance_m) : undefined,
  };
}

export async function fetchWeeklyGoals(): Promise<SportWeeklyGoal[]> {
  const userId = await ensureSession();
  const rows = unwrap(
    await supabase.from("sport_weekly_goals").select("*").eq("user_id", userId).eq("active", true),
  );
  return (rows as Row[]).map(mapWeeklyGoal);
}

/** Substitui a meta ativa da modalidade. Passar os dois campos undefined
 * remove a meta (volta a mostrar só o realizado). */
export async function setWeeklyGoal(
  modality: SportModality,
  input: { targetSessions?: number; targetDistanceM?: number },
): Promise<void> {
  const userId = await ensureSession();
  await supabase
    .from("sport_weekly_goals")
    .update({ active: false })
    .eq("user_id", userId)
    .eq("modality", modality)
    .eq("active", true);
  if (input.targetSessions === undefined && input.targetDistanceM === undefined) {
    await invalidate();
    return;
  }
  unwrap(
    await supabase
      .from("sport_weekly_goals")
      .insert({
        user_id: userId,
        modality,
        target_sessions: input.targetSessions,
        target_distance_m: input.targetDistanceM,
        active: true,
      })
      .select()
      .single(),
  );
  await invalidate();
}

// ---------------------------------------------------------------------------
// Seletores puros — Visão geral consome daqui, nunca recalcula na tela.
// ---------------------------------------------------------------------------

export function activitiesForModality(
  activities: SportActivity[],
  modality: SportModality,
): SportActivity[] {
  return activities.filter((a) => a.modality === modality);
}

function mondayOfWeek(dateIso: string): string {
  const d = new Date(dateIso + "T00:00:00");
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function weekSummary(
  activities: SportActivity[],
  modality: SportModality,
  todayIso: string,
): { sessions: number; distanceM: number } {
  const weekStart = mondayOfWeek(todayIso);
  const inWeek = activitiesForModality(activities, modality).filter(
    (a) => a.startedAt.slice(0, 10) >= weekStart,
  );
  return { sessions: inWeek.length, distanceM: inWeek.reduce((s, a) => s + a.distanceM, 0) };
}

/** Distância por semana (km, 1 casa), das mais antigas pras mais recentes —
 * pronto pro Sparkline existente. */
export function weeklyDistanceSeries(
  activities: SportActivity[],
  modality: SportModality,
  weeks: number,
  todayIso: string,
): number[] {
  const list = activitiesForModality(activities, modality);
  const pad = (n: number) => String(n).padStart(2, "0");
  const series: number[] = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const ref = new Date(todayIso + "T00:00:00");
    ref.setDate(ref.getDate() - i * 7);
    const refIso = `${ref.getFullYear()}-${pad(ref.getMonth() + 1)}-${pad(ref.getDate())}`;
    const weekStart = mondayOfWeek(refIso);
    const weekEndDate = new Date(weekStart + "T00:00:00");
    weekEndDate.setDate(weekEndDate.getDate() + 7);
    const weekEnd = `${weekEndDate.getFullYear()}-${pad(weekEndDate.getMonth() + 1)}-${pad(weekEndDate.getDate())}`;
    const total = list
      .filter((a) => a.startedAt.slice(0, 10) >= weekStart && a.startedAt.slice(0, 10) < weekEnd)
      .reduce((s, a) => s + a.distanceM, 0);
    series.push(Math.round((total / 1000) * 10) / 10);
  }
  return series;
}

export function lastActivities(
  activities: SportActivity[],
  modality: SportModality,
  n: number,
): SportActivity[] {
  return activitiesForModality(activities, modality).slice(0, n);
}

// ---------------------------------------------------------------------------
// Store (React Query) — mesmo padrão de workout-store.ts
// ---------------------------------------------------------------------------

type State = { activities: SportActivity[]; weeklyGoals: SportWeeklyGoal[] };
const EMPTY_STATE: State = { activities: [], weeklyGoals: [] };

async function fetchState(): Promise<State> {
  const [activities, weeklyGoals] = await Promise.all([fetchActivities(), fetchWeeklyGoals()]);
  return { activities, weeklyGoals };
}

const QUERY_KEY = ["sport-domain"] as const;
function invalidate() {
  return queryClient.invalidateQueries({ queryKey: QUERY_KEY, refetchType: "all" });
}

export function useSportStore<T>(selector: (s: State) => T): T {
  const userId = useSupabaseUserId();
  const { data } = useQuery({ queryKey: QUERY_KEY, queryFn: fetchState, enabled: !!userId });
  return selector(data ?? EMPTY_STATE);
}
