import type { ReactNode } from "react";

// Gráficos do Espelho: poucos, simples e legíveis em tela pequena. Verde é o
// destaque; o resto fica em tons neutros ou nas cores que a própria pessoa
// escolheu para os rótulos.

export const NEUTRALS = ["#a3b1bf", "#7cb8ff", "#b9a1db", "#f0b867", "#e59ad0", "#8fd694"];

export const pct = (n: number) => `${Math.round(n * 100)}%`;

/** Barra única dividida em partes (para equilíbrio entre áreas). */
export function ShareBar({
  parts,
  label,
}: {
  parts: { key: string; share: number; color: string; name: string }[];
  label: string;
}) {
  return (
    <div
      className="flex h-3 w-full overflow-hidden rounded-full bg-surface-2"
      role="img"
      aria-label={`${label}: ${parts.map((p) => `${p.name} ${pct(p.share)}`).join(", ")}`}
    >
      {parts.map((p) => (
        <div
          key={p.key}
          style={{ width: `${Math.max(1, p.share * 100)}%`, background: p.color }}
          className="h-full first:rounded-l-full last:rounded-r-full"
        />
      ))}
    </div>
  );
}

/** Linha com rótulo, barra proporcional e valor. */
export function BarRow({
  name,
  value,
  fraction,
  color = "var(--chart-primary)",
  detail,
}: {
  name: ReactNode;
  value: ReactNode;
  fraction: number;
  color?: string;
  detail?: ReactNode;
}) {
  return (
    <div className="py-2.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="min-w-0 truncate text-sm font-medium">{name}</span>
        <span className="shrink-0 text-sm font-semibold tabular-nums">{value}</span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-2">
        <div
          className="h-full rounded-full"
          style={{ width: `${Math.min(100, Math.max(0, fraction * 100))}%`, background: color }}
        />
      </div>
      {detail && <p className="mt-1 text-[11px] text-muted-foreground">{detail}</p>}
    </div>
  );
}

/** Colunas pequenas; `value` null = sem dados (vazio, não zero). */
export function MiniColumns({
  items,
  label,
  highlight,
}: {
  items: { key: string; label: string; value: number | null; sub?: string }[];
  label: string;
  highlight?: string;
}) {
  return (
    <div
      className="flex items-end gap-1.5"
      role="img"
      aria-label={`${label}: ${items.map((i) => `${i.label} ${i.value === null ? "sem dados" : pct(i.value)}`).join(", ")}`}
    >
      {items.map((i) => (
        <div key={i.key} className="flex min-w-0 flex-1 flex-col items-center gap-1">
          <div className="flex h-16 w-full items-end overflow-hidden rounded-md bg-surface-2/60">
            {i.value !== null && (
              <div
                className="w-full rounded-md"
                style={{
                  height: `${Math.max(6, i.value * 100)}%`,
                  background:
                    highlight === i.key
                      ? "var(--chart-primary)"
                      : "color-mix(in oklab, var(--chart-primary) 45%, transparent)",
                }}
              />
            )}
          </div>
          <span className="text-[10px] text-muted-foreground">{i.label}</span>
          {i.sub && <span className="text-[9px] text-muted-foreground/70">{i.sub}</span>}
        </div>
      ))}
    </div>
  );
}

/** Seção que abre ao toque — mantém a primeira tela leve. */
export function Disclosure({
  title,
  subtitle,
  defaultOpen,
  children,
}: {
  title: string;
  subtitle?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  return (
    <details className="group py-3" open={defaultOpen}>
      <summary className="flex cursor-pointer list-none items-center gap-3 [&::-webkit-details-marker]:hidden">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{title}</p>
          {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
        </div>
        <span
          aria-hidden="true"
          className="text-muted-foreground transition-transform group-open:rotate-180"
        >
          ▾
        </span>
      </summary>
      <div className="mt-3">{children}</div>
    </details>
  );
}

export function EmptyNote({ children }: { children: ReactNode }) {
  return <p className="py-3 text-sm text-muted-foreground">{children}</p>;
}
