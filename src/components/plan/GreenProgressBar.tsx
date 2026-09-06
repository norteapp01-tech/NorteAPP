/** Barra de progresso do planejamento — preenchimento SEMPRE verde (marca),
 * nunca amarelo/vermelho. Ritmo (adiantado/no ritmo/atrasado) é comunicado só
 * por texto/ícone em outro lugar da tela, nunca pela cor desta barra. */
export function GreenProgressBar({
  pct,
  className = "h-1.5",
}: {
  pct: number;
  className?: string;
}) {
  return (
    <div className={`overflow-hidden rounded-full bg-surface-2 ${className}`}>
      <div
        className="h-full rounded-full bg-primary transition-[width] duration-200"
        style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
      />
    </div>
  );
}
