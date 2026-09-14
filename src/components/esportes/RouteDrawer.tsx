import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { X, Undo2 } from "lucide-react";
import { loadMapStyle, mapRouteColor, mapStyleUrl, type SportModality } from "@/lib/sport-store";
import {
  computeRouteDistanceM,
  formatChangeDistanceM,
  type RoutePoint,
} from "@/lib/sport-route-geometry";
import { createRoute, type SportRoute } from "@/lib/sport-routes-data";

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN as string | undefined;
const LINE_SOURCE_ID = "norte-drawn-route";

/** Tela de desenho de rota — toque no mapa adiciona um ponto (marcador
 * arrastável pra ajustar depois), sem biblioteca de desenho de terceiros:
 * só o mapa direto, no mesmo padrão imperativo que a gravação já usa. */
export function RouteDrawer({
  modality,
  onSaved,
  onCancel,
}: {
  modality: SportModality;
  onSaved: (route: SportRoute) => void;
  onCancel: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<mapboxgl.Marker[]>([]);
  const pointsRef = useRef<RoutePoint[]>([]);
  const [points, setPoints] = useState<RoutePoint[]>([]);
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mapStyle] = useState(loadMapStyle);
  const routeColor = mapRouteColor[mapStyle];

  const redrawLine = () => {
    const map = mapRef.current;
    const source = map?.getSource(LINE_SOURCE_ID) as mapboxgl.GeoJSONSource | undefined;
    source?.setData({
      type: "Feature",
      properties: {},
      geometry: {
        type: "LineString",
        coordinates: pointsRef.current.map((p) => [p.lng, p.lat] as [number, number]),
      },
    });
  };

  const addPoint = (point: RoutePoint) => {
    const map = mapRef.current;
    if (!map) return;
    const index = pointsRef.current.length;
    pointsRef.current = [...pointsRef.current, point];
    setPoints(pointsRef.current);

    const el = document.createElement("div");
    el.style.cssText = `width:18px;height:18px;border-radius:50%;background:${routeColor};border:2px solid #0a0d0b;box-shadow:0 0 0 3px ${routeColor}40;cursor:grab;`;
    const marker = new mapboxgl.Marker({ element: el, draggable: true })
      .setLngLat([point.lng, point.lat])
      .addTo(map);
    marker.on("drag", () => {
      const { lng, lat } = marker.getLngLat();
      pointsRef.current = pointsRef.current.map((p, i) => (i === index ? { lat, lng } : p));
      setPoints(pointsRef.current);
      redrawLine();
    });
    markersRef.current = [...markersRef.current, marker];
    redrawLine();
  };

  const undoLast = () => {
    if (pointsRef.current.length === 0) return;
    pointsRef.current = pointsRef.current.slice(0, -1);
    setPoints(pointsRef.current);
    const marker = markersRef.current.pop();
    marker?.remove();
    redrawLine();
  };

  useEffect(() => {
    if (!MAPBOX_TOKEN || !containerRef.current || mapRef.current) return;
    mapboxgl.accessToken = MAPBOX_TOKEN;
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: mapStyleUrl[mapStyle],
      center: [-46.63, -23.55],
      zoom: 15,
      attributionControl: false,
    });
    map.on("load", () => {
      map.addSource(LINE_SOURCE_ID, {
        type: "geojson",
        data: {
          type: "Feature",
          properties: {},
          geometry: { type: "LineString", coordinates: [] },
        },
      });
      map.addLayer({
        id: LINE_SOURCE_ID,
        type: "line",
        source: LINE_SOURCE_ID,
        layout: { "line-join": "round", "line-cap": "round" },
        paint: { "line-color": routeColor, "line-width": 4 },
      });
    });
    map.on("click", (e) => {
      addPoint({ lat: e.lngLat.lat, lng: e.lngLat.lng });
    });
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mesmo padrão do mapa de gravação: cria o mapa uma vez só
  }, []);

  const distanceM = computeRouteDistanceM(points);

  const save = async () => {
    if (points.length < 2 || !title.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const route = await createRoute({ modality, title: title.trim(), points });
      onSaved(route);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível salvar a rota.");
    } finally {
      setSaving(false);
    }
  };

  if (!MAPBOX_TOKEN) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-6 text-center">
        <p className="text-sm text-muted-foreground">
          Desenhar rota precisa do mapa — token do Mapbox não configurado nesta versão.
        </p>
        <button
          onClick={onCancel}
          className="rounded-xl border border-border px-4 py-2 text-sm font-semibold"
        >
          Voltar
        </button>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <div className="relative flex-1">
        <div ref={containerRef} style={{ position: "absolute", inset: 0 }} />
        <button
          onClick={onCancel}
          aria-label="Cancelar"
          className="absolute left-4 top-12 flex h-10 w-10 items-center justify-center rounded-full bg-background/90 text-foreground shadow-lg backdrop-blur"
        >
          <X className="h-5 w-5" />
        </button>
        <button
          onClick={undoLast}
          disabled={points.length === 0}
          aria-label="Desfazer último ponto"
          className="absolute right-4 top-12 flex h-10 w-10 items-center justify-center rounded-full bg-background/90 text-foreground shadow-lg backdrop-blur disabled:opacity-40"
        >
          <Undo2 className="h-5 w-5" />
        </button>
        <div className="absolute bottom-3 left-3 rounded-full bg-background/90 px-3 py-1.5 text-xs font-semibold backdrop-blur">
          {points.length === 0
            ? "Toque no mapa pra começar a desenhar"
            : `${points.length} ponto${points.length > 1 ? "s" : ""} · ${formatChangeDistanceM(distanceM)} (aprox.)`}
        </div>
      </div>

      <div className="border-t border-border bg-surface px-5 pb-[calc(env(safe-area-inset-bottom)+16px)] pt-4">
        <p className="mb-2 text-[11px] text-muted-foreground">
          Trajeto desenhado — distância aproximada (linha reta entre os pontos, não uma rota real de
          rua).
        </p>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Nome da rota"
          className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-primary"
        />
        {error && <p className="mt-2 text-xs text-danger">{error}</p>}
        <button
          disabled={points.length < 2 || !title.trim() || saving}
          onClick={save}
          className="mt-3 w-full rounded-2xl bg-primary py-3.5 text-sm font-bold text-primary-foreground disabled:opacity-40"
        >
          {saving ? "Salvando…" : "Salvar rota"}
        </button>
      </div>
    </div>
  );
}
