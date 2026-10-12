import type { CSSProperties } from "react";
import type { AgendaLabel } from "@/lib/agenda-labels-store";
import { LabelGlyph } from "./LabelIcon";
import "./agenda-ui.css";

/** Escolha rápida de UM rótulo (criação e edição de compromisso). */
export function LabelPicker({
  labels,
  value,
  onChange,
  onManage,
}: {
  labels: AgendaLabel[];
  value: string | null | undefined;
  onChange: (id: string | null) => void;
  onManage?: () => void;
}) {
  return (
    <div className="agenda-chips" role="radiogroup" aria-label="Rótulo">
      <button
        type="button"
        role="radio"
        aria-checked={!value}
        aria-pressed={!value}
        className="agenda-chip"
        onClick={() => onChange(null)}
      >
        Sem rótulo
      </button>
      {labels.map((label) => (
        <button
          key={label.id}
          type="button"
          role="radio"
          aria-checked={value === label.id}
          aria-pressed={value === label.id}
          className="agenda-chip"
          style={{ ["--chip" as string]: label.color } as CSSProperties}
          onClick={() => onChange(label.id)}
        >
          <i className="agenda-dot" style={{ ["--dot" as string]: label.color }} />
          <LabelGlyph icon={label.icon} className="h-3 w-3" />
          {label.name}
        </button>
      ))}
      {onManage && (
        <button type="button" className="agenda-chip" onClick={onManage}>
          {labels.length === 0 ? "+ Criar rótulos" : "Gerenciar"}
        </button>
      )}
    </div>
  );
}

/** Filtro por VÁRIOS rótulos (barra da Agenda). */
export function LabelFilterChips({
  labels,
  selected,
  onToggle,
}: {
  labels: AgendaLabel[];
  selected: string[];
  onToggle: (id: string) => void;
}) {
  if (labels.length === 0) return null;
  return (
    <div className="agenda-chips" role="group" aria-label="Filtrar por rótulo">
      {labels.map((label) => (
        <button
          key={label.id}
          type="button"
          aria-pressed={selected.includes(label.id)}
          className="agenda-chip"
          style={{ ["--chip" as string]: label.color } as CSSProperties}
          onClick={() => onToggle(label.id)}
        >
          <i className="agenda-dot" style={{ ["--dot" as string]: label.color }} />
          {label.name}
        </button>
      ))}
    </div>
  );
}
