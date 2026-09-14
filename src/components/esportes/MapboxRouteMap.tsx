import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { Box, LocateFixed, MapPinOff } from "lucide-react";
import { loadMapStyle, mapRouteColor, mapStyleUrl, type GeoPoint } from "@/lib/sport-store";
import { detectDirectionChanges, type RoutePoint } from "@/lib/sport-route-geometry";

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN as string | undefined;
const ROUTE_SOURCE_ID = "norte-route";
const REFERENCE_SOURCE_ID = "norte-route-reference";
const CHANGES_SOURCE_ID = "norte-route-changes";
const REFERENCE_COLOR = "#60a5fa";
const PITCH_3D = 60;

/** Mapa ao vivo da gravação — discreto, estilo escuro, trajeto verde. Sem
 * token configurado, mostra um estado "mapa indisponível" honesto em vez de
 * travar ou fingir: a gravação de distância/tempo continua funcionando
 * normalmente, só a camada visual do mapa depende disso.
 *
 * `routePoints`, se vier preenchido, desenha o desenho planejado como uma
 * linha de referência tracejada + pontos onde ele muda de direção — nunca
 * uma seta de "vire aqui", só onde o traço muda, visualmente. */
export function MapboxRouteMap({
  points,
  routePoints,
}: {
  points: GeoPoint[];
  routePoints?: RoutePoint[];
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markerRef = useRef<mapboxgl.Marker | null>(null);
  const [autoFollow, setAutoFollow] = useState(true);
  const [is3D, setIs3D] = useState(false);
  const [online, setOnline] = useState(typeof navigator === "undefined" ? true : navigator.onLine);
  // Lido uma vez ao montar — a preferência é ajustada nas Configurações do
  // módulo, numa tela separada da gravação, não precisa reagir ao vivo aqui.
  const [mapStyle] = useState(loadMapStyle);
  const routeColor = mapRouteColor[mapStyle];

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
      style: mapStyleUrl[mapStyle],
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
        paint: { "line-color": routeColor, "line-width": 4 },
      });

      map.addSource(REFERENCE_SOURCE_ID, {
        type: "geojson",
        data: {
          type: "Feature",
          properties: {},
          geometry: { type: "LineString", coordinates: [] },
        },
      });
      map.addLayer({
        id: REFERENCE_SOURCE_ID,
        type: "line",
        source: REFERENCE_SOURCE_ID,
        layout: { "line-join": "round", "line-cap": "round" },
        paint: {
          "line-color": REFERENCE_COLOR,
          "line-width": 3,
          "line-dasharray": [1.5, 1.5],
          "line-opacity": 0.85,
        },
      });

      map.addSource(CHANGES_SOURCE_ID, {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addLayer({
        id: CHANGES_SOURCE_ID,
        type: "circle",
        source: CHANGES_SOURCE_ID,
        paint: {
          "circle-radius": 6,
          "circle-color": REFERENCE_COLOR,
          "circle-stroke-width": 2,
          "circle-stroke-color": "#0a0d0b",
        },
      });
    });
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mapStyle/routeColor lidos só na criação, mapa não deve ser recriado por eles
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
        el.style.cssText = `width:14px;height:14px;border-radius:50%;background:${routeColor};border:2px solid #0a0d0b;box-shadow:0 0 0 4px ${routeColor}40;`;
        markerRef.current = new mapboxgl.Marker({ element: el }).setLngLat(last).addTo(map);
      } else {
        markerRef.current.setLngLat(last);
      }
      if (autoFollow) map.easeTo({ center: last, duration: 400 });
    };

    if (map.loaded()) update();
    else map.once("load", update);
  }, [points, autoFollow, routeColor]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !routePoints || routePoints.length < 2) return;

    const update = () => {
      const lineSource = map.getSource(REFERENCE_SOURCE_ID) as mapboxgl.GeoJSONSource | undefined;
      lineSource?.setData({
        type: "Feature",
        properties: {},
        geometry: {
          type: "LineString",
          coordinates: routePoints.map((p) => [p.lng, p.lat] as [number, number]),
        },
      });

      const changesSource = map.getSource(CHANGES_SOURCE_ID) as mapboxgl.GeoJSONSource | undefined;
      const changes = detectDirectionChanges(routePoints);
      changesSource?.setData({
        type: "FeatureCollection",
        features: changes.map((c) => ({
          type: "Feature",
          properties: {},
          geometry: { type: "Point", coordinates: [c.point.lng, c.point.lat] },
        })),
      });
    };

    if (map.loaded()) update();
    else map.once("load", update);
  }, [routePoints]);

  if (!MAPBOX_TOKEN) {
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-surface-2 text-center">
        <MapPinOff className="h-6 w-6 text-muted-foreground" strokeWidth={1.8} />
        <p className="px-6 text-xs text-muted-foreground">
          Mapa indisponível — token do Mapbox não configurado. A gravação continua normalmente.
        </p>
      </div>
    );
  }

  return (
    // `absolute inset-0` em vez de `h-full`: h-full (height:100%) não resolve
    // de forma confiável quando a altura do pai vem só de flex-grow (sem
    // `height` explícito) — o mapa ficava preso na altura mínima padrão do
    // <canvas> (300px) em vez de preencher a tela. inset-0 contra um pai
    // com position:relative sempre resolve pra altura real.
    <div className="absolute inset-0">
      {/* style inline (não className) — o próprio mapboxgl.css aplica
       * `position:relative` na div que vira o container do mapa, com
       * especificidade maior que a classe `absolute` do Tailwind. */}
      <div ref={containerRef} style={{ position: "absolute", inset: 0 }} />
      {!online && (
        <div className="absolute left-3 top-3 rounded-full bg-background/90 px-3 py-1 text-[10px] font-semibold text-warning backdrop-blur">
          Sem conexão — mapa pode não carregar, gravação continua
        </div>
      )}
      <div className="absolute bottom-3 right-3 flex flex-col gap-2">
        <button
          onClick={() => {
            const next = !is3D;
            setIs3D(next);
            mapRef.current?.easeTo({ pitch: next ? PITCH_3D : 0, duration: 400 });
          }}
          aria-label="Alternar visão 3D"
          aria-pressed={is3D}
          className={`flex h-10 w-10 items-center justify-center rounded-full shadow-lg backdrop-blur ${
            is3D ? "bg-primary text-primary-foreground" : "bg-background/90 text-foreground"
          }`}
        >
          <Box className="h-5 w-5" />
        </button>
        <button
          onClick={() => {
            setAutoFollow(true);
            const last = points[points.length - 1];
            if (last && mapRef.current)
              mapRef.current.easeTo({ center: [last.lng, last.lat], duration: 400 });
          }}
          aria-label="Recentralizar"
          className="flex h-10 w-10 items-center justify-center rounded-full bg-background/90 text-foreground shadow-lg backdrop-blur"
        >
          <LocateFixed className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}
