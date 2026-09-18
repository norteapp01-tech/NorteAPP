import { useId, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

/** Peças comuns dos módulos da Evolução — mesma moldura dos cards do app. */

export function ModuleCard({
  title,
  action,
  children,
}: {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="evo-card card-surface p-4">
      {(title || action) && (
        <div className="flex items-baseline justify-between gap-2">
          {title && <h2 className="evo-title text-[13px] font-bold">{title}</h2>}
          {action}
        </div>
      )}
      <div className={title || action ? "mt-3" : undefined}>{children}</div>
    </section>
  );
}

/** Ausência de dado é resposta, não espaço em branco: diz o que falta. */
export function EmptyNote({ children }: { children: ReactNode }) {
  return <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{children}</p>;
}

/**
 * Gaveta recolhível.
 *
 * Conteúdo fechado sai da árvore de acessibilidade (`inert`), senão o leitor de
 * tela leria uma análise que ninguém abriu. Sem card dentro de card: a gaveta
 * é um divisor com título, não uma moldura nova.
 */
export function Disclosure({
  title,
  hint,
  badge,
  defaultOpen = false,
  open: controlledOpen,
  onOpenChange,
  children,
}: {
  title: string;
  hint?: string;
  badge?: ReactNode;
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: ReactNode;
}) {
  const [uncontrolled, setUncontrolled] = useState(defaultOpen);
  const open = controlledOpen ?? uncontrolled;
  const id = useId();
  const toggle = () => {
    const next = !open;
    setUncontrolled(next);
    onOpenChange?.(next);
  };

  return (
    <div className="evo-disclosure">
      <button
        onClick={toggle}
        aria-expanded={open}
        aria-controls={id}
        className="evo-disclosure-head"
      >
        <ChevronDown size={15} data-open={open || undefined} />
        <span className="min-w-0 flex-1 text-left">{title}</span>
        {badge}
        {hint && <span className="text-[10px] text-muted-foreground">{hint}</span>}
      </button>
      <div className="drawer-collapse" data-open={open} id={id}>
        <div inert={!open} aria-hidden={!open}>
          <div className="pb-1 pt-2">{children}</div>
        </div>
      </div>
    </div>
  );
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
