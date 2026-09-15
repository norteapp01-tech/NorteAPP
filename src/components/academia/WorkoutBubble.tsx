import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Dumbbell } from "lucide-react";
import { useGymSession } from "@/lib/gym-session-context";
import { sessionElapsedSeconds, restRemainingSeconds } from "@/lib/workout-store";
import { formatDurationClock } from "@/lib/sport-store";
import { QuickSetPanel } from "./QuickSetPanel";
import { FullscreenTimer } from "./FullscreenTimer";

// ---------------------------------------------------------------------------
// Haltere flutuante — atalho pro treino em andamento, em qualquer tela do app.
//
// Escopo real: é um elemento DENTRO do Norte. Não sobrepõe outros aplicativos
// nem aparece na tela bloqueada — isso exigiria bolha nativa do Android ou
// Live Activity do iOS, que não existem aqui (ver docs/academia-treino.md).
// ---------------------------------------------------------------------------

const SIZE = 56;
const BAND_MAX = 428; // mesma faixa da .norte-bottom-nav
const BAND_GUTTER = 20;
const EDGE = 8;
const DRAG_THRESHOLD_PX = 6;
const POSITION_KEY = "norte:academia:bubblePosition";

type Point = { x: number; y: number };

type Bounds = { minX: number; maxX: number; minY: number; maxY: number };

function boundsFor(rect: DOMRect): Bounds {
  const band = Math.min(rect.width - BAND_GUTTER, BAND_MAX);
  const bandLeft = (rect.width - band) / 2;
  return {
    minX: bandLeft,
    maxX: Math.max(bandLeft, bandLeft + band - SIZE),
    minY: EDGE,
    maxY: Math.max(EDGE, rect.height - SIZE - EDGE),
  };
}

function clampTo(point: Point, b: Bounds): Point {
  return {
    x: Math.min(b.maxX, Math.max(b.minX, point.x)),
    y: Math.min(b.maxY, Math.max(b.minY, point.y)),
  };
}

/** Canto inferior direito da faixa, logo acima da navegação. */
function defaultPosition(b: Bounds): Point {
  return { x: b.maxX, y: Math.max(b.minY, b.maxY - 96) };
}

/** Cabe em 56px: "12:34" enquanto é curto, "2h05" quando passa da hora —
 * "2:05:41" estoura o círculo e ninguém lê os segundos de um treino de horas. */
function bubbleLabel(seconds: number): string {
  if (seconds < 3600) return formatDurationClock(seconds);
  const h = Math.floor(seconds / 3600);
  return `${h}h${String(Math.floor((seconds % 3600) / 60)).padStart(2, "0")}`;
}

function readStoredPosition(): Point | null {
  try {
    const raw = window.localStorage.getItem(POSITION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Point>;
    if (typeof parsed.x !== "number" || typeof parsed.y !== "number") return null;
    return { x: parsed.x, y: parsed.y };
  } catch {
    return null;
  }
}

export function WorkoutBubble() {
  const gym = useGymSession();
  const { session, panelOpen, setPanelOpen, fullscreen } = gym;
  const containerRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<Point | null>(null);
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    origin: Point;
    committed: boolean;
  } | null>(null);

  // Posiciona depois da medida real do container (que já desconta as áreas
  // seguras), não a partir de suposições sobre o tamanho da tela.
  useLayoutEffect(() => {
    if (!session || !containerRef.current) return;
    const b = boundsFor(containerRef.current.getBoundingClientRect());
    setPosition((current) => clampTo(current ?? readStoredPosition() ?? defaultPosition(b), b));
  }, [session]);

  // Girar o aparelho ou abrir o teclado muda a área útil — a bolha volta pra
  // dentro em vez de ficar num pedaço da tela que já não existe.
  useEffect(() => {
    if (!session) return;
    const reclamp = () => {
      if (!containerRef.current) return;
      const b = boundsFor(containerRef.current.getBoundingClientRect());
      setPosition((current) => (current ? clampTo(current, b) : current));
    };
    window.addEventListener("resize", reclamp);
    window.addEventListener("orientationchange", reclamp);
    return () => {
      window.removeEventListener("resize", reclamp);
      window.removeEventListener("orientationchange", reclamp);
    };
  }, [session]);

  const persist = useCallback((point: Point) => {
    try {
      window.localStorage.setItem(POSITION_KEY, JSON.stringify(point));
    } catch {
      /* Sem storage: a bolha só não lembra a posição no próximo acesso. */
    }
  }, []);

  const onPointerDown = (e: React.PointerEvent) => {
    if (dragRef.current || !position) return; // já tem um dedo nesta bolha
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      origin: position,
      committed: false,
    };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag || e.pointerId !== drag.pointerId || !containerRef.current) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    // Abaixo do limiar ainda pode virar toque; acima, vira arrasto e deixa de
    // ser toque. É o que separa "abrir o painel" de "mover a bolha".
    if (!drag.committed) {
      if (Math.abs(dx) <= DRAG_THRESHOLD_PX && Math.abs(dy) <= DRAG_THRESHOLD_PX) return;
      drag.committed = true;
      setDragging(true);
    }
    e.preventDefault();
    const b = boundsFor(containerRef.current.getBoundingClientRect());
    setPosition(clampTo({ x: drag.origin.x + dx, y: drag.origin.y + dy }, b));
  };

  const finishDrag = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag || e.pointerId !== drag.pointerId) return;
    dragRef.current = null;
    (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
    if (!drag.committed) {
      setPanelOpen(!panelOpen);
      return;
    }
    setDragging(false);
    // Fica exatamente onde foi solto — sem encaixar numa borda.
    setPosition((current) => {
      if (current) persist(current);
      return current;
    });
  };

  if (!session) return null;

  const elapsed = sessionElapsedSeconds(session);
  const rest = restRemainingSeconds(session);
  const restOver = rest !== null && rest <= 0;

  return (
    <>
      {/* Fixo, com as áreas seguras já descontadas — o que estiver dentro dele
          nunca cai atrás do notch nem da barra de gestos. */}
      <div
        ref={containerRef}
        className="pointer-events-none fixed z-40"
        style={{
          left: 0,
          right: 0,
          top: "env(safe-area-inset-top, 0px)",
          bottom: "env(safe-area-inset-bottom, 0px)",
        }}
      >
        {position && (
          <>
            <button
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={finishDrag}
              onPointerCancel={finishDrag}
              aria-label={
                panelOpen ? "Fechar controle do treino" : "Abrir controle do treino em andamento"
              }
              aria-expanded={panelOpen}
              className={`pointer-events-auto absolute flex touch-none flex-col items-center justify-center rounded-full border text-primary shadow-lg ${
                restOver
                  ? "border-success bg-success/20"
                  : "border-primary/50 bg-background/95 backdrop-blur-xl"
              } ${dragging ? "" : "interactive-press"}`}
              style={{
                left: position.x,
                top: position.y,
                width: SIZE,
                height: SIZE,
                cursor: dragging ? "grabbing" : "grab",
              }}
            >
              <Dumbbell className="h-5 w-5" strokeWidth={2} />
              <span className="mt-0.5 font-mono text-[9px] font-bold tabular-nums">
                {rest !== null ? formatDurationClock(rest) : bubbleLabel(elapsed)}
              </span>
            </button>

            {panelOpen && (
              <QuickSetPanel
                anchor={position}
                bubbleSize={SIZE}
                containerRef={containerRef}
                onClose={() => setPanelOpen(false)}
              />
            )}
          </>
        )}
      </div>

      {fullscreen && <FullscreenTimer />}
    </>
  );
}
