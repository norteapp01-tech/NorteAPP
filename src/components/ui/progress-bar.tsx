import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";

/** Barra de progresso única do app.
 *
 * Antes existiam ~20 barras montadas à mão: 15 sem transição nenhuma (o
 * valor saltava) e as outras com três durações diferentes pra mesma coisa.
 * A transição vem do utilitário `.progress-fill` (token `--dur-progress`),
 * que já é neutralizado pela regra global de redução de movimento.
 *
 * Anima do valor anterior pro novo porque o elemento continua montado — não
 * há estado interno começando em zero, então abrir a tela, trocar de aba ou
 * receber o mesmo dado de novo mostra o valor real direto, sem falsa
 * progressão. */
export function ProgressBar({
  value,
  max = 100,
  className,
  fillClassName,
  fillStyle,
  label,
}: {
  value: number;
  max?: number;
  /** Trilho — altura/raio/cor de fundo. */
  className?: string;
  /** Preenchimento — só pra quem precisa de cor própria (ex.: ritmo). */
  fillClassName?: string;
  fillStyle?: CSSProperties;
  label?: string;
}) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
      className={cn("h-1.5 w-full overflow-hidden rounded-full bg-surface-2", className)}
    >
      <div
        className={cn("progress-fill h-full rounded-full bg-primary", fillClassName)}
        style={{ width: `${pct}%`, ...fillStyle }}
      />
    </div>
  );
}
