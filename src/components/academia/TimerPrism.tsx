import { useEffect, useRef, useState, type ReactNode } from "react";

// ---------------------------------------------------------------------------
// Bloco de cronômetro com duas faces — descanso e duração do treino — no mesmo
// espaço, alternadas por um giro no eixo horizontal.
//
// São DUAS informações, não quatro cronômetros: o componente só apresenta. O
// tempo vive inteiro no store, derivado de horários, e girar a face não toca em
// nada dele.
//
// A altura é fixa e as duas faces são absolutas dentro dela: trocar de face não
// pode empurrar, encolher ou deslocar o resto do painel.
// ---------------------------------------------------------------------------

export type TimerFace = "descanso" | "treino";

const DRAG_THRESHOLD_PX = 14;

/** Um gesto sobre um botão ou campo é daquele controle, não do prisma. */
function isInteractive(target: EventTarget | null): boolean {
  return Boolean(
    target instanceof Element &&
    target.closest("button, input, select, textarea, a, [role='button']"),
  );
}

export function TimerPrism({
  face,
  onFlip,
  height,
  descanso,
  treino,
}: {
  face: TimerFace;
  onFlip: (next: TimerFace) => void;
  height: number;
  descanso: ReactNode;
  treino: ReactNode;
}) {
  // `turns` guarda o sentido acumulado do giro, não só qual face está à mostra:
  // arrastar duas vezes para cima gira duas vezes para cima, em vez de
  // desfazer o giro anterior.
  const [turns, setTurns] = useState(face === "treino" ? 1 : 0);
  const drag = useRef<{ pointerId: number; startY: number; startX: number; done: boolean } | null>(
    null,
  );

  const faceOfTurns: TimerFace = turns % 2 === 0 ? "descanso" : "treino";

  // Quando a face muda por fora (o seletor ao lado do título, por exemplo), o
  // giro acompanha em vez de a apresentação divergir do estado.
  useEffect(() => {
    if (faceOfTurns !== face) setTurns((t) => t + 1);
  }, [face, faceOfTurns]);

  const flip = (direction: 1 | -1) => {
    setTurns((t) => t + direction);
    onFlip(face === "descanso" ? "treino" : "descanso");
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (drag.current || isInteractive(e.target)) return;
    drag.current = { pointerId: e.pointerId, startY: e.clientY, startX: e.clientX, done: false };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || e.pointerId !== d.pointerId || d.done) return;
    const dy = e.clientY - d.startY;
    const dx = e.clientX - d.startX;
    if (Math.abs(dy) < DRAG_THRESHOLD_PX || Math.abs(dy) <= Math.abs(dx)) return;
    // Uma troca por gesto: marcado como concluído, o resto do arrasto é ignorado
    // até soltar o dedo.
    d.done = true;
    flip(dy < 0 ? 1 : -1);
  };

  const endDrag = (e: React.PointerEvent) => {
    if (drag.current?.pointerId !== e.pointerId) return;
    (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
    drag.current = null;
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
    if (isInteractive(e.target)) return;
    e.preventDefault();
    flip(e.key === "ArrowUp" ? 1 : -1);
  };

  return (
    <div
      className="timer-prism"
      style={{ height }}
      // `touch-action: none` fica SÓ aqui: o gesto vertical do cronômetro não
      // pode bloquear a rolagem do resto do painel.
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onKeyDown={onKeyDown}
    >
      <div
        className="timer-prism-inner"
        style={{ transform: `rotateX(${turns * -180}deg)`, touchAction: "none" }}
      >
        <Face visible={face === "descanso"} rotation={0}>
          {descanso}
        </Face>
        <Face visible={face === "treino"} rotation={180}>
          {treino}
        </Face>
      </div>
    </div>
  );
}

/** Só a face à mostra recebe foco e toque — `inert` tira a de trás da ordem de
 * tabulação e do alcance do ponteiro mesmo durante o giro. */
function Face({
  visible,
  rotation,
  children,
}: {
  visible: boolean;
  rotation: number;
  children: ReactNode;
}) {
  return (
    <div
      className="timer-prism-face"
      style={{ transform: `rotateX(${rotation}deg)` }}
      inert={!visible}
      aria-hidden={!visible}
    >
      {children}
    </div>
  );
}
