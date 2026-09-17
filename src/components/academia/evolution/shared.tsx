import type { ReactNode } from "react";

/** Peças comuns dos módulos da Evolução — mesma moldura dos cards do app. */

export function ModuleCard({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="card-surface p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-[13px] font-bold">{title}</h2>
        {action}
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

/** Ausência de dado é resposta, não espaço em branco: diz o que falta. */
export function EmptyNote({ children }: { children: ReactNode }) {
  return <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{children}</p>;
}

/** Barra horizontal tocável usada na distribuição. */
export function Bar({
  label,
  value,
  max,
  selected,
  onClick,
  suffix,
}: {
  label: string;
  value: number;
  max: number;
  selected: boolean;
  onClick: () => void;
  suffix: string;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={selected}
      className={`interactive-press w-full rounded-lg px-1.5 py-1.5 text-left ${selected ? "bg-primary/10" : ""}`}
    >
      <div className="flex items-baseline justify-between gap-2 text-[11px]">
        <span className="min-w-0 truncate font-medium">{label}</span>
        <span className="shrink-0 font-mono tabular-nums text-muted-foreground">
          {value} {suffix}
        </span>
      </div>
      <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-surface-2">
        <div
          className={`progress-fill h-full rounded-full ${selected ? "bg-primary" : "bg-primary/60"}`}
          style={{ width: `${max > 0 ? Math.round((value / max) * 100) : 0}%` }}
        />
      </div>
    </button>
  );
}

/** Placeholder de carregamento — mesma moldura dos cards, sem pulso agressivo. */
export function SkeletonBlock({ height }: { height: number }) {
  return (
    <div
      className="card-surface animate-pulse"
      style={{ height }}
      role="status"
      aria-label="Carregando"
    />
  );
}
