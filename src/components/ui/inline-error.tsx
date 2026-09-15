import { AlertCircle, RotateCcw } from "lucide-react";

/** Falha de salvamento perto do próprio controle, com a opção de tentar de
 * novo — nunca só cor: tem ícone e texto, pra continuar legível sem
 * distinguir verde de vermelho. */
export function InlineError({
  message,
  onRetry,
  className,
}: {
  message: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <p
      role="alert"
      className={`flex items-center gap-1.5 text-[11px] text-danger ${className ?? ""}`}
    >
      <AlertCircle className="h-3.5 w-3.5 shrink-0" />
      <span className="min-w-0 flex-1">{message}</span>
      {onRetry && (
        <button
          onClick={onRetry}
          className="interactive-press flex shrink-0 items-center gap-1 font-semibold underline"
        >
          <RotateCcw className="h-3 w-3" />
          Tentar de novo
        </button>
      )}
    </p>
  );
}
