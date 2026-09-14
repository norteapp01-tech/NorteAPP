import type { GeoPoint } from "@/lib/sport-store";

/** Traçado simples em SVG, sem depender de nenhum provedor de mapa — usado
 * no detalhe/histórico, onde só precisamos mostrar a forma do percurso, não
 * um mapa navegável de verdade (isso fica só na gravação ao vivo). Nunca
 * desenha nada quando não há pontos reais — sem percurso, sem SVG. */
export function RoutePreview({
  points,
  hideRoute,
  hideStartEnd,
  className,
}: {
  points: GeoPoint[];
  hideRoute?: boolean;
  hideStartEnd?: boolean;
  className?: string;
}) {
  if (points.length < 2 || hideRoute) {
    return (
      <div
        className={`flex items-center justify-center rounded-xl bg-surface-2 ${className ?? "h-40"}`}
      >
        <span className="text-xs text-muted-foreground">
          {points.length < 2 ? "Sem percurso registrado" : "Percurso oculto"}
        </span>
      </div>
    );
  }

  const lats = points.map((p) => p.lat);
  const lngs = points.map((p) => p.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const spanLat = maxLat - minLat || 0.0001;
  const spanLng = maxLng - minLng || 0.0001;
  const pad = 8;
  const size = 100;

  const toXY = (p: GeoPoint) => {
    const x = pad + ((p.lng - minLng) / spanLng) * (size - pad * 2);
    // Latitude cresce pra cima; SVG cresce pra baixo — inverte o eixo Y.
    const y = pad + (1 - (p.lat - minLat) / spanLat) * (size - pad * 2);
    return [x, y] as const;
  };

  const path = points.map((p) => toXY(p).join(",")).join(" ");
  const [startX, startY] = toXY(points[0]);
  const [endX, endY] = toXY(points[points.length - 1]);

  return (
    <div className={`overflow-hidden rounded-xl bg-surface-2 ${className ?? "h-40"}`}>
      <svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet" className="h-full w-full">
        <polyline
          points={path}
          fill="none"
          stroke="oklch(0.82 0.18 145)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
        {!hideStartEnd && (
          <>
            <circle cx={startX} cy={startY} r="2.2" fill="oklch(0.82 0.18 145)" />
            <circle
              cx={endX}
              cy={endY}
              r="2.2"
              fill="oklch(0.98 0 0)"
              stroke="oklch(0.82 0.18 145)"
              strokeWidth="1"
            />
          </>
        )}
      </svg>
    </div>
  );
}
