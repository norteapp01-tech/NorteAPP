import type { ReactNode } from "react";

/** UI compartilhada entre os módulos de sub-agenda (Academia, Leitura, etc.). */

export const weekdayLabels = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
export const weekVisualLabels = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
export const weekVisualOrder = [1, 2, 3, 4, 5, 6, 0];

export function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="card-surface p-4">
      <h3 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
        {title}
      </h3>
      <div className="mt-3">{children}</div>
    </section>
  );
}

export function Sparkline({ values }: { values: number[] }) {
  if (values.length === 0) return null;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || 1;
  const pts = values
    .map((v, i) => `${(i / (values.length - 1 || 1)) * 100},${100 - ((v - min) / range) * 80 - 10}`)
    .join(" ");
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-20 w-full">
      <defs>
        <linearGradient id="sl" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="oklch(0.82 0.18 145)" stopOpacity="0.4" />
          <stop offset="100%" stopColor="oklch(0.82 0.18 145)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <polyline points={`0,100 ${pts} 100,100`} fill="url(#sl)" stroke="none" />
      <polyline
        points={pts}
        fill="none"
        stroke="oklch(0.82 0.18 145)"
        strokeWidth="2"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
