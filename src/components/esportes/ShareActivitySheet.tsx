import { useEffect, useRef, useState, useCallback } from "react";
import { Modal } from "@/components/ui/modal";
import { supabase } from "@/lib/supabase/client";
import { drawShareCanvas, type ShareBackground } from "@/lib/sport-share";
import type { GeoPoint, SportActivity } from "@/lib/sport-store";

export function ShareActivitySheet({
  activity,
  points,
  onClose,
}: {
  activity: SportActivity;
  points: GeoPoint[];
  onClose: () => void;
}) {
  // Ref via estado (não `useRef` puro): o Modal monta o conteúdo dentro de um
  // portal do Radix Dialog, e o <canvas> às vezes só é anexado ao DOM depois
  // do primeiro ciclo de efeitos — com `useRef` isso deixava o desenho preso
  // em branco até o usuário mexer em algum controle. Um ref-callback garante
  // um novo render (e o efeito de desenho reexecuta) assim que o nó existir.
  const [canvasEl, setCanvasEl] = useState<HTMLCanvasElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const setCanvasRef = useCallback((node: HTMLCanvasElement | null) => {
    canvasRef.current = node;
    setCanvasEl(node);
  }, []);
  const [background, setBackground] = useState<ShareBackground>(
    activity.photoUrl ? "foto" : "liso",
  );
  const [hideRoute, setHideRoute] = useState(activity.privacyHideRoute);
  const [hideStartEnd, setHideStartEnd] = useState(activity.privacyHideStartEnd);
  const [photoImage, setPhotoImage] = useState<HTMLImageElement | undefined>(undefined);

  useEffect(() => {
    if (!activity.photoUrl) return;
    const url = supabase.storage.from("sport-photos").getPublicUrl(activity.photoUrl)
      .data.publicUrl;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => setPhotoImage(img);
    img.src = url;
  }, [activity.photoUrl]);

  useEffect(() => {
    if (!canvasEl) return;
    const ctx = canvasEl.getContext("2d");
    if (!ctx) return;
    drawShareCanvas(ctx, activity, points, {
      background: background === "foto" && !photoImage ? "liso" : background,
      hideRoute,
      hideStartEnd,
      photoImage,
    });
  }, [canvasEl, activity, points, background, hideRoute, hideStartEnd, photoImage]);

  const download = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `norte-${activity.title.toLowerCase().replace(/\s+/g, "-")}.png`;
      a.click();
      URL.revokeObjectURL(url);
    }, "image/png");
  };

  return (
    <Modal title="Compartilhar atividade" onClose={onClose} maxWidthClassName="max-w-lg">
      <div className="space-y-4">
        <div className="overflow-hidden rounded-xl border border-border">
          <canvas ref={setCanvasRef} width={1080} height={1080} className="w-full" />
        </div>

        <div>
          <p className="mb-1.5 text-[11px] uppercase text-muted-foreground">Fundo</p>
          <div className="flex gap-1.5">
            {(
              [
                ["liso", "Liso"],
                ["foto", "Foto"],
                ["mapa", "Mapa"],
              ] as [ShareBackground, string][]
            ).map(([key, label]) => (
              <button
                key={key}
                disabled={key === "foto" && !activity.photoUrl}
                onClick={() => setBackground(key)}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold disabled:opacity-40 ${background === key ? "bg-primary text-primary-foreground" : "border border-border text-muted-foreground"}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <label className="flex items-center justify-between text-sm">
            <span>Ocultar início/fim do trajeto</span>
            <input
              type="checkbox"
              checked={hideStartEnd}
              onChange={(e) => setHideStartEnd(e.target.checked)}
            />
          </label>
          <label className="flex items-center justify-between text-sm">
            <span>Ocultar o mapa inteiro</span>
            <input
              type="checkbox"
              checked={hideRoute}
              onChange={(e) => setHideRoute(e.target.checked)}
            />
          </label>
        </div>

        <button
          onClick={download}
          className="w-full rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground"
        >
          Baixar imagem
        </button>
      </div>
    </Modal>
  );
}
