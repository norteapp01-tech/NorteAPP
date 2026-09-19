import { useQuery } from "@tanstack/react-query";
import { supabase, ensureSession, useSupabaseUserId } from "./supabase/client";
import { queryClient } from "./query-client";
import { type SportModality } from "./goals-store";
import { computeRouteDistanceM, type RoutePoint } from "./sport-route-geometry";

// ---------------------------------------------------------------------------
// Rotas desenhadas pelo usuário — persistência. Um desenho no mapa, salvo
// pra poder reusar em corridas/pedaladas futuras; nunca uma gravação real
// (sem pontos de GPS, sem tempo — ver sport-route-geometry.ts pro tipo).
// ---------------------------------------------------------------------------

export type SportRoute = {
  id: string;
  modality: SportModality;
  title: string;
  points: RoutePoint[];
  distanceM: number;
  createdAt: string;
  updatedAt?: string;
  /** Nulo = rota desenhada no mapa. Preenchido = salva de uma gravação real. */
  sourceActivityId?: string;
  startLat?: number;
  startLng?: number;
  endLat?: number;
  endLng?: number;
};

/** Uma atividade que conta como execução desta rota. `linkSource` registra de
 * onde veio o vínculo — nunca se perde a diferença entre "a pessoa confirmou"
 * e "a gravação partiu da rota". */
export type SportRouteAttempt = {
  id: string;
  routeId: string;
  activityId: string;
  linkSource: "iniciada" | "confirmada" | "sugerida";
  linkedAt: string;
};

type Row = Record<string, unknown>;

function unwrap<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

function mapRoute(r: Row): SportRoute {
  return {
    id: r.id as string,
    modality: r.modality as SportModality,
    title: r.title as string,
    points: r.points as RoutePoint[],
    distanceM: Number(r.distance_m),
    createdAt: r.created_at as string,
    updatedAt: (r.updated_at as string) ?? undefined,
    sourceActivityId: (r.source_activity_id as string) ?? undefined,
    startLat: r.start_lat !== null ? Number(r.start_lat) : undefined,
    startLng: r.start_lng !== null ? Number(r.start_lng) : undefined,
    endLat: r.end_lat !== null ? Number(r.end_lat) : undefined,
    endLng: r.end_lng !== null ? Number(r.end_lng) : undefined,
  };
}

function mapAttempt(r: Row): SportRouteAttempt {
  return {
    id: r.id as string,
    routeId: r.route_id as string,
    activityId: r.activity_id as string,
    linkSource: r.link_source as SportRouteAttempt["linkSource"],
    linkedAt: r.linked_at as string,
  };
}

export async function fetchRoutes(): Promise<SportRoute[]> {
  const userId = await ensureSession();
  const rows = unwrap(
    await supabase
      .from("sport_routes")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false }),
  );
  return (rows as Row[]).map(mapRoute);
}

export async function createRoute(input: {
  modality: SportModality;
  title: string;
  points: RoutePoint[];
}): Promise<SportRoute> {
  const userId = await ensureSession();
  const row = unwrap<Row>(
    await supabase
      .from("sport_routes")
      .insert({
        user_id: userId,
        modality: input.modality,
        title: input.title,
        points: input.points,
        distance_m: computeRouteDistanceM(input.points),
      })
      .select()
      .single(),
  );
  await invalidate();
  return mapRoute(row);
}

/**
 * Salva o percurso de uma corrida já gravada como rota reutilizável, e
 * registra a própria corrida como a primeira tentativa.
 *
 * As duas escritas acontecem em sequência; se a tentativa falhar, a rota
 * continua existindo sem tentativa nenhuma — o que a interface mostra como
 * "0 execuções" em vez de fingir um número.
 */
export async function saveRouteFromActivity(input: {
  modality: SportModality;
  title: string;
  points: RoutePoint[];
  sourceActivityId: string;
  /** Distância real medida na gravação — mais confiável que remedir o traço. */
  distanceM?: number;
}): Promise<SportRoute> {
  const userId = await ensureSession();
  const first = input.points[0];
  const last = input.points.at(-1);
  const row = unwrap<Row>(
    await supabase
      .from("sport_routes")
      .insert({
        user_id: userId,
        modality: input.modality,
        title: input.title,
        points: input.points,
        distance_m: input.distanceM ?? computeRouteDistanceM(input.points),
        source_activity_id: input.sourceActivityId,
        start_lat: first?.lat ?? null,
        start_lng: first?.lng ?? null,
        end_lat: last?.lat ?? null,
        end_lng: last?.lng ?? null,
      })
      .select()
      .single(),
  );
  const route = mapRoute(row);
  await linkRouteAttempt(route.id, input.sourceActivityId, "confirmada");
  await invalidate();
  return route;
}

/** Vincula uma atividade a uma rota. Idempotente: repetir não duplica, porque
 * o banco tem `unique (activity_id)` e aqui a colisão é tratada como sucesso. */
export async function linkRouteAttempt(
  routeId: string,
  activityId: string,
  linkSource: SportRouteAttempt["linkSource"],
): Promise<void> {
  const userId = await ensureSession();
  const res = await supabase
    .from("sport_route_attempts")
    .upsert(
      { user_id: userId, route_id: routeId, activity_id: activityId, link_source: linkSource },
      { onConflict: "activity_id" },
    )
    .select()
    .single();
  if (res.error) throw new Error(res.error.message);
  await invalidate();
}

export async function unlinkRouteAttempt(activityId: string): Promise<void> {
  const res = await supabase.from("sport_route_attempts").delete().eq("activity_id", activityId);
  if (res.error) throw new Error(res.error.message);
  await invalidate();
}

export async function fetchRouteAttempts(): Promise<SportRouteAttempt[]> {
  const userId = await ensureSession();
  const rows = unwrap(
    await supabase
      .from("sport_route_attempts")
      .select("*")
      .eq("user_id", userId)
      .order("linked_at", { ascending: false }),
  );
  return (rows as Row[]).map(mapAttempt);
}

export async function renameRoute(id: string, title: string): Promise<void> {
  unwrap<Row>(await supabase.from("sport_routes").update({ title }).eq("id", id).select().single());
  await invalidate();
}

export async function deleteRoute(id: string): Promise<void> {
  const res = await supabase.from("sport_routes").delete().eq("id", id);
  if (res.error) throw new Error(res.error.message);
  await invalidate();
}

const QUERY_KEY = ["sport-routes"] as const;

function invalidate() {
  return queryClient.invalidateQueries({ queryKey: QUERY_KEY, refetchType: "all" });
}

type RoutesState = { routes: SportRoute[]; attempts: SportRouteAttempt[] };
const EMPTY_ROUTES_STATE: RoutesState = { routes: [], attempts: [] };

async function fetchRoutesState(): Promise<RoutesState> {
  const [routes, attempts] = await Promise.all([fetchRoutes(), fetchRouteAttempts()]);
  return { routes, attempts };
}

function useRoutesState(): RoutesState {
  const userId = useSupabaseUserId();
  const { data } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: fetchRoutesState,
    enabled: !!userId,
  });
  return data ?? EMPTY_ROUTES_STATE;
}

export function useSportRoutes(modality?: SportModality): SportRoute[] {
  const { routes } = useRoutesState();
  return modality ? routes.filter((r) => r.modality === modality) : routes;
}

export function useSportRouteAttempts(): SportRouteAttempt[] {
  return useRoutesState().attempts;
}
