import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { LocateFixed, MapPinOff } from "lucide-react";
import type { GeoPoint } from "@/lib/sport-store";

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN as string | undefined;
const ROUTE_SOURCE_ID = "norte-route";

/** Mapa ao vivo da gravação — discreto, estilo escuro, trajeto verde. Sem
 * token configurado, mostra um estado "mapa indisponível" honesto em vez de
 * travar ou fingir: a gravação de distância/tempo continua funcionando
 * normalmente, só a camada visual do mapa depende disso. */
export function MapboxRouteMap({ points, className }: { points: GeoPoint[]; className?: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markerRef = useRef<mapboxgl.Marker | null>(null);
  const [autoFollow, setAutoFollow] = useState(true);
  const [online, setOnline] = useState(typeof navigator === "undefined" ? true : navigator.onLine);

  useEffect(() => {
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  useEffect(() => {
    if (!MAPBOX_TOKEN || !containerRef.current || mapRef.current) return;
    mapboxgl.accessToken = MAPBOX_TOKEN;
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: "mapbox://styles/mapbox/dark-v11",
      center: [-46.63, -23.55],
      zoom: 15,
      attributionControl: false,
    });
    map.on("load", () => {
      map.addSource(ROUTE_SOURCE_ID, {
        type: "geojson",
        data: {
          type: "Feature",
          properties: {},
          geometry: { type: "LineString", coordinates: [] },
        },
      });
      map.addLayer({
        id: ROUTE_SOURCE_ID,
        type: "line",
        source: ROUTE_SOURCE_ID,
        layout: { "line-join": "round", "line-cap": "round" },
        paint: { "line-color": "#7ee08a", "line-width": 4 },
      });
    });
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || points.length === 0) return;
    const coordinates = points.map((p) => [p.lng, p.lat] as [number, number]);
    const last = coordinates[coordinates.length - 1];

    const update = () => {
      const source = map.getSource(ROUTE_SOURCE_ID) as mapboxgl.GeoJSONSource | undefined;
      source?.setData({
        type: "Feature",
        properties: {},
        geometry: { type: "LineString", coordinates },
      });

      if (!markerRef.current) {
        const el = document.createElement("div");
        el.style.cssText =
          "width:14px;height:14px;border-radius:50%;background:#7ee08a;border:2px solid #0a0d0b;box-shadow:0 0 0 4px rgba(126,224,138,0.25);";
        markerRef.current = new mapboxgl.Marker({ element: el }).setLngLat(last).addTo(map);
      } else {
        markerRef.current.setLngLat(last);
      }
      if (autoFollow) map.easeTo({ center: last, duration: 400 });
    };

    if (map.loaded()) update();
    else map.once("load", update);
  }, [points, autoFollow]);

  if (!MAPBOX_TOKEN) {
    return (
      <div
        className={`flex flex-col items-center justify-center gap-2 bg-surface-2 text-center ${className ?? "h-full"}`}
      >
        <MapPinOff className="h-6 w-6 text-muted-foreground" strokeWidth={1.8} />
        <p className="px-6 text-xs text-muted-foreground">
          Mapa indisponível — token do Mapbox não configurado. A gravação continua normalmente.
        </p>
      </div>
    );
  }

  return (
    <div className={`relative ${className ?? "h-full"}`}>
      <div ref={containerRef} className="h-full w-full" />
      {!online && (
        <div className="absolute left-3 top-3 rounded-full bg-background/90 px-3 py-1 text-[10px] font-semibold text-warning backdrop-blur">
          Sem conexão — mapa pode não carregar, gravação continua
        </div>
      )}
      <button
        onClick={() => {
          setAutoFollow(true);
          const last = points[points.length - 1];
          if (last && mapRef.current)
            mapRef.current.easeTo({ center: [last.lng, last.lat], duration: 400 });
        }}
        aria-label="Recentralizar"
        className="absolute bottom-3 right-3 flex h-10 w-10 items-center justify-center rounded-full bg-background/90 text-foreground shadow-lg backdrop-blur"
      >
        <LocateFixed className="h-5 w-5" />
      </button>
    </div>
  );
}
