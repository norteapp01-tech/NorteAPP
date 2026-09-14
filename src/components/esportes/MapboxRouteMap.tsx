import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { LocateFixed, MapPinOff, Settings, Check } from "lucide-react";
import {
  loadMapStyle,
  saveMapStyle,
  mapRouteColor,
  mapStyleUrl,
  mapStyleLabel,
  mapStylePreviewUrl,
  type GeoPoint,
  type MapStyle,
} from "@/lib/sport-store";
import { detectDirectionChanges, type RoutePoint } from "@/lib/sport-route-geometry";

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN as string | undefined;
const ROUTE_SOURCE_ID = "norte-route";
const REFERENCE_SOURCE_ID = "norte-route-reference";
const CHANGES_SOURCE_ID = "norte-route-changes";
const REFERENCE_COLOR = "#60a5fa";
const PITCH_3D = 60;
const MAP_STYLE_OPTIONS: MapStyle[] = ["escuro", "claro", "padrao", "satelite", "hibrido"];

function addCustomLayers(map: mapboxgl.Map, routeColor: string) {
  map.addSource(ROUTE_SOURCE_ID, {
    type: "geojson",
    data: { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: [] } },
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
    data: { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: [] } },
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
}

/** Mapa ao vivo da gravação — discreto, estilo escolhido pelo usuário,
 * trajeto na cor de contraste daquele estilo. Sem token configurado, mostra
 * um estado "mapa indisponível" honesto em vez de travar ou fingir: a
 * gravação de distância/tempo continua funcionando normalmente, só a
 * camada visual do mapa depende disso.
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
  const pointsRef = useRef(points);
  const routePointsRef = useRef(routePoints);
  const [autoFollow, setAutoFollow] = useState(true);
  const [is3D, setIs3D] = useState(false);
  const [styleMenuOpen, setStyleMenuOpen] = useState(false);
  const [online, setOnline] = useState(typeof navigator === "undefined" ? true : navigator.onLine);
  const [mapStyle, setMapStyle] = useState(loadMapStyle);
  const routeColor = mapRouteColor[mapStyle];

  pointsRef.current = points;
  routePointsRef.current = routePoints;

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

  /** `color` explícito (não lido do closure) — depois de trocar de estilo,
   * o marcador precisa ser recriado com a cor NOVA, e uma função definida
   * de novo a cada render capturaria a cor antiga se lesse `routeColor`
   * direto em vez de receber como parâmetro. */
  const drawLiveTrack = (map: mapboxgl.Map, color: string) => {
    const pts = pointsRef.current;
    if (pts.length === 0) return;
    const coordinates = pts.map((p) => [p.lng, p.lat] as [number, number]);
    const last = coordinates[coordinates.length - 1];
    const source = map.getSource(ROUTE_SOURCE_ID) as mapboxgl.GeoJSONSource | undefined;
    source?.setData({
      type: "Feature",
      properties: {},
      geometry: { type: "LineString", coordinates },
    });

    if (!markerRef.current) {
      const el = document.createElement("div");
      el.style.cssText = `width:14px;height:14px;border-radius:50%;background:${color};border:2px solid #0a0d0b;box-shadow:0 0 0 4px ${color}40;`;
      markerRef.current = new mapboxgl.Marker({ element: el }).setLngLat(last).addTo(map);
    } else {
      markerRef.current.setLngLat(last);
    }
  };

  const drawReferenceRoute = (map: mapboxgl.Map) => {
    const routePts = routePointsRef.current;
    if (!routePts || routePts.length < 2) return;
    const lineSource = map.getSource(REFERENCE_SOURCE_ID) as mapboxgl.GeoJSONSource | undefined;
    lineSource?.setData({
      type: "Feature",
      properties: {},
      geometry: {
        type: "LineString",
        coordinates: routePts.map((p) => [p.lng, p.lat] as [number, number]),
      },
    });
    const changesSource = map.getSource(CHANGES_SOURCE_ID) as mapboxgl.GeoJSONSource | undefined;
    const changes = detectDirectionChanges(routePts);
    changesSource?.setData({
      type: "FeatureCollection",
      features: changes.map((c) => ({
        type: "Feature",
        properties: {},
        geometry: { type: "Point", coordinates: [c.point.lng, c.point.lat] },
      })),
    });
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
      const initialColor = mapRouteColor[loadMapStyle()];
      addCustomLayers(map, initialColor);
      drawLiveTrack(map, initialColor);
      drawReferenceRoute(map);
    });
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- cria o mapa uma vez só; mudanças de estilo depois passam por changeMapStyle
  }, []);

  const changeMapStyle = (next: MapStyle) => {
    setMapStyle(next);
    saveMapStyle(next);
    setStyleMenuOpen(false);
    const map = mapRef.current;
    if (!map) return;
    map.setStyle(mapStyleUrl[next]);
    map.once("style.load", () => {
      const nextColor = mapRouteColor[next];
      addCustomLayers(map, nextColor);
      // o marcador de posição atual não é limpo pelo setStyle — recriado
      // aqui pra pegar a cor nova em vez de ficar com a do estilo anterior.
      markerRef.current?.remove();
      markerRef.current = null;
      drawLiveTrack(map, nextColor);
      drawReferenceRoute(map);
    });
  };

  useEffect(() => {
    const map = mapRef.current;
    if (!map || points.length === 0) return;
    const last = points[points.length - 1];
    const update = () => {
      drawLiveTrack(map, routeColor);
      if (autoFollow) map.easeTo({ center: [last.lng, last.lat], duration: 400 });
    };
    if (map.loaded()) update();
    else map.once("load", update);
  }, [points, autoFollow, routeColor]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !routePoints || routePoints.length < 2) return;
    if (map.loaded()) drawReferenceRoute(map);
    else map.once("load", () => drawReferenceRoute(map));
  }, [routePoints]);

  const centerForPreview = points.at(-1) ?? { lat: -23.55, lng: -46.63 };

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
          onClick={() => setStyleMenuOpen((v) => !v)}
          aria-label="Estilo do mapa"
          aria-pressed={styleMenuOpen}
          className={`flex h-10 w-10 items-center justify-center rounded-full shadow-lg backdrop-blur ${
            styleMenuOpen
              ? "bg-primary text-primary-foreground"
              : "bg-background/90 text-foreground"
          }`}
        >
          <Settings className="h-5 w-5" />
        </button>
        <button
          onClick={() => {
            const next = !is3D;
            setIs3D(next);
            mapRef.current?.easeTo({ pitch: next ? PITCH_3D : 0, duration: 400 });
          }}
          aria-label="Alternar visão 3D"
          aria-pressed={is3D}
          className={`flex h-10 w-10 items-center justify-center rounded-full text-[11px] font-bold shadow-lg backdrop-blur ${
            is3D ? "bg-primary text-primary-foreground" : "bg-background/90 text-foreground"
          }`}
        >
          {is3D ? "2D" : "3D"}
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

      {styleMenuOpen && (
        <div className="absolute bottom-16 right-3 grid w-52 grid-cols-2 gap-2 rounded-2xl bg-background/95 p-3 shadow-xl backdrop-blur">
          {MAP_STYLE_OPTIONS.map((style) => {
            const previewUrl = mapStylePreviewUrl(style, centerForPreview);
            return (
              <button
                key={style}
                onClick={() => changeMapStyle(style)}
                className={`relative overflow-hidden rounded-lg border ${
                  mapStyle === style ? "border-primary" : "border-border"
                }`}
              >
                {previewUrl ? (
                  <img
                    src={previewUrl}
                    alt={mapStyleLabel[style]}
                    className="h-14 w-full object-cover"
                  />
                ) : (
                  <div className="h-14 w-full bg-surface-2" />
                )}
                <span className="flex items-center justify-center gap-1 bg-black/60 py-1 text-[10px] font-semibold text-white">
                  {mapStyleLabel[style]}
                  {mapStyle === style && <Check className="h-3 w-3 text-primary" />}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
