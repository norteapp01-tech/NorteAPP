import { useRef, useState, type ReactNode } from "react";
import { SkipForward } from "lucide-react";

const THRESHOLD = 88;

/** Arrastar da direita para a esquerda pula a série: ela fica zerada ("não fiz,
 * não quero fazer"). Só um gesto horizontal conta — rolar a lista para cima e
 * para baixo, ou tocar nos campos, não pula nada. */
export function SwipeToSkip({
  onSkip,
  disabled,
  children,
}: {
  onSkip: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  const [dx, setDx] = useState(0);
  const drag = useRef<{ id: number; x: number; y: number; active: boolean } | null>(null);

  const reset = () => {
    drag.current = null;
    setDx(0);
  };

  return (
    <div className="relative overflow-hidden">
      <div
        aria-hidden="true"
        className="absolute inset-y-0 right-0 flex w-full items-center justify-end gap-1.5 bg-surface-2 pr-5 text-xs font-semibold text-muted-foreground"
      >
        <SkipForward className="h-4 w-4" /> Pular
      </div>
      <div
        className="relative bg-surface-quiet"
        style={{
          transform: dx ? `translateX(${dx}px)` : undefined,
          transition: drag.current?.active ? "none" : "transform 160ms ease-out",
          touchAction: "pan-y",
        }}
        onPointerDown={(e) => {
          if (disabled || drag.current) return;
          drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, active: false };
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d || e.pointerId !== d.id) return;
          const moveX = e.clientX - d.x;
          const moveY = e.clientY - d.y;
          if (!d.active) {
            // Só vira arrasto quando o movimento é claramente horizontal.
            if (Math.abs(moveX) < 10 || Math.abs(moveX) < Math.abs(moveY) * 1.5) return;
            d.active = true;
            (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
          }
          setDx(Math.min(0, Math.max(-160, moveX)));
        }}
        onPointerUp={(e) => {
          const d = drag.current;
          if (!d || e.pointerId !== d.id) return;
          const passed = d.active && dx <= -THRESHOLD;
          reset();
          if (passed) onSkip();
        }}
        onPointerCancel={reset}
      >
        {children}
      </div>
    </div>
  );
}
