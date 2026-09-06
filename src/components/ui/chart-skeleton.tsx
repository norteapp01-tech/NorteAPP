/** Espaço reservado curto enquanto o chunk do gráfico (recharts, carregado sob
 * demanda) termina de baixar — estático, sem spinner/shimmer artificial. */
export function ChartSkeleton({ height = 140 }: { height?: number }) {
  return (
    <div className="rounded-xl border border-border bg-surface-2" style={{ height }} aria-hidden />
  );
}
