import type { GeoPoint } from "./sport-store";
import {
  formatDistanceKm,
  formatDurationClock,
  formatPace,
  formatSpeedKmh,
  modalityLabel,
} from "./sport-store";
import type { SportActivity } from "./sport-store";

export type ShareBackground = "liso" | "foto" | "mapa";
export type ShareOptions = {
  background: ShareBackground;
  hideRoute: boolean;
  hideStartEnd: boolean;
  photoImage?: HTMLImageElement;
  mapTileImage?: HTMLImageElement;
};

const CANVAS_SIZE = 1080;

/** Desenho 100% determinístico (mesma entrada -> mesmo resultado) — sem IA,
 * sem aleatoriedade. Ocultar início/fim ou o percurso significa nunca
 * desenhar esses elementos, nunca escondê-los depois com CSS/recorte: o
 * arquivo exportado nunca carrega o dado que devia ficar oculto. */
export function drawShareCanvas(
  ctx: CanvasRenderingContext2D,
  activity: SportActivity,
  points: GeoPoint[],
  options: ShareOptions,
): void {
  const size = CANVAS_SIZE;
  ctx.clearRect(0, 0, size, size);

  // Fundo
  if (options.background === "foto" && options.photoImage) {
    drawCover(ctx, options.photoImage, size, size);
    ctx.fillStyle = "rgba(8, 10, 9, 0.45)";
    ctx.fillRect(0, 0, size, size);
  } else if (options.background === "mapa" && options.mapTileImage) {
    drawCover(ctx, options.mapTileImage, size, size);
    ctx.fillStyle = "rgba(8, 10, 9, 0.35)";
    ctx.fillRect(0, 0, size, size);
  } else {
    const gradient = ctx.createLinearGradient(0, 0, 0, size);
    gradient.addColorStop(0, "#0f1210");
    gradient.addColorStop(1, "#080a09");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
  }

  // Percurso
  if (!options.hideRoute && points.length >= 2) {
    drawRoute(ctx, points, size, options.hideStartEnd);
  }

  // Marca Norte
  ctx.fillStyle = "#ffffff";
  ctx.font = "600 28px Inter, sans-serif";
  ctx.textBaseline = "top";
  ctx.fillText("NORTE", 64, 64);

  // Título
  ctx.font = "700 44px Inter, sans-serif";
  ctx.fillText(activity.title, 64, size - 320, size - 128);

  // Estatísticas
  const stats: [string, string][] = [
    ["Distância", formatDistanceKm(activity.distanceM)],
    ["Tempo ativo", formatDurationClock(activity.activeDurationS)],
    [
      activity.modality === "ciclismo" ? "Velocidade média" : "Ritmo médio",
      activity.modality === "ciclismo"
        ? formatSpeedKmh(activity.avgSpeedKmh ?? null)
        : formatPace(activity.avgPaceSPerKm ?? null),
    ],
  ];
  const colW = (size - 128) / stats.length;
  stats.forEach(([label, value], i) => {
    const x = 64 + i * colW;
    ctx.font = "500 20px Inter, sans-serif";
    ctx.fillStyle = "rgba(255,255,255,0.65)";
    ctx.fillText(label.toUpperCase(), x, size - 220);
    ctx.font = "700 40px Inter, sans-serif";
    ctx.fillStyle = "#ffffff";
    ctx.fillText(value, x, size - 190);
  });

  ctx.font = "500 20px Inter, sans-serif";
  ctx.fillStyle = "rgba(255,255,255,0.55)";
  ctx.fillText(modalityLabel[activity.modality], 64, size - 90);
}

function drawCover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, w: number, h: number) {
  const scale = Math.max(w / img.width, h / img.height);
  const dw = img.width * scale;
  const dh = img.height * scale;
  ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
}

function drawRoute(
  ctx: CanvasRenderingContext2D,
  points: GeoPoint[],
  canvasSize: number,
  hideStartEnd: boolean,
) {
  const lats = points.map((p) => p.lat);
  const lngs = points.map((p) => p.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const spanLat = maxLat - minLat || 0.0001;
  const spanLng = maxLng - minLng || 0.0001;
  const top = 140;
  const bottom = canvasSize - 400;
  const pad = 96;
  const drawableW = canvasSize - pad * 2;
  const drawableH = bottom - top;
  const scale = Math.min(drawableW / spanLng, drawableH / spanLat);
  const offsetX = pad + (drawableW - spanLng * scale) / 2;
  const offsetY = top + (drawableH - spanLat * scale) / 2;

  const toXY = (p: GeoPoint) => {
    const x = offsetX + (p.lng - minLng) * scale;
    const y = offsetY + (1 - (p.lat - minLat) / spanLat) * drawableH;
    return [x, y] as const;
  };

  ctx.beginPath();
  points.forEach((p, i) => {
    const [x, y] = toXY(p);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.strokeStyle = "#7ee08a";
  ctx.lineWidth = 8;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.stroke();

  if (!hideStartEnd) {
    const [sx, sy] = toXY(points[0]);
    const [ex, ey] = toXY(points[points.length - 1]);
    ctx.beginPath();
    ctx.arc(sx, sy, 12, 0, Math.PI * 2);
    ctx.fillStyle = "#7ee08a";
    ctx.fill();
    ctx.beginPath();
    ctx.arc(ex, ey, 12, 0, Math.PI * 2);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#7ee08a";
    ctx.stroke();
  }
}
