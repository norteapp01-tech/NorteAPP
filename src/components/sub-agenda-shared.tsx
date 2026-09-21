import type { ReactNode } from "react";

/** UI compartilhada entre os módulos de sub-agenda (Academia, Leitura, etc.). */

export const weekdayLabels = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
export const weekVisualLabels = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
export const weekVisualOrder = [1, 2, 3, 4, 5, 6, 0];

export function Card({
  title,
  children,
  quiet = false,
  featured = false,
}: {
  title: string;
  children: ReactNode;
  /** Grafite discreto para conteúdo de apoio. */
  quiet?: boolean;
  /** Leve tom verde reservado ao card principal, no máximo um por visão. */
  featured?: boolean;
}) {
  return (
    <section
      className={`${featured ? "card-surface-featured" : quiet ? "card-surface-quiet" : "card-surface"} p-4`}
    >
      <h3 className="norte-section-title">{title}</h3>
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
    <svg
      data-norte-chart="line"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      className="h-20 w-full"
    >
      <polyline
        data-series="true"
        points={pts}
        fill="none"
        stroke="var(--primary)"
        strokeWidth="2"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
