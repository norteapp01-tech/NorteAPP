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

export function useSportRoutes(modality?: SportModality): SportRoute[] {
  const userId = useSupabaseUserId();
  const { data } = useQuery({ queryKey: QUERY_KEY, queryFn: fetchRoutes, enabled: !!userId });
  const routes = data ?? [];
  return modality ? routes.filter((r) => r.modality === modality) : routes;
}
