import { Modal } from "@/components/ui/modal";
import { DateField } from "@/components/ui/date-wheel-picker";
import { EMPTY_FILTERS, type AgendaFilters, type StatusFilter } from "@/lib/agenda-search";
import type { AgendaLabel } from "@/lib/agenda-labels-store";
import "./agenda-ui.css";

const STATUS_OPTIONS: { id: StatusFilter; label: string }[] = [
  { id: "planejada", label: "Planejados" },
  { id: "concluida", label: "Concluídos" },
  { id: "perdida", label: "Perdidos" },
  { id: "cancelada", label: "Cancelados" },
];

function Segment<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { id: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div>
      <p className="mb-1.5 text-[11px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <div className="agenda-chips" role="radiogroup" aria-label={label}>
        {options.map((o) => (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={value === o.id}
            aria-pressed={value === o.id}
            className="agenda-chip"
            onClick={() => onChange(o.id)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Todos os filtros da Agenda: rótulos, estado, rigidez, plano, conflito,
 * alerta e intervalo de datas. */
export function FilterSheet({
  filters,
  labels,
  onChange,
  onClose,
}: {
  filters: AgendaFilters;
  labels: AgendaLabel[];
  onChange: (next: AgendaFilters) => void;
  onClose: () => void;
}) {
  const set = (patch: Partial<AgendaFilters>) => onChange({ ...filters, ...patch });
  const toggleLabel = (id: string) =>
    set({
      labelIds: filters.labelIds.includes(id)
        ? filters.labelIds.filter((x) => x !== id)
        : [...filters.labelIds, id],
    });
  const toggleStatus = (id: StatusFilter) =>
    set({
      statuses: filters.statuses.includes(id)
        ? filters.statuses.filter((x) => x !== id)
        : [...filters.statuses, id],
    });

  return (
    <Modal onClose={onClose} title="Filtros">
      <div className="space-y-5">
        <div>
          <p className="mb-1.5 text-[11px] uppercase tracking-wider text-muted-foreground">
            Rótulos
          </p>
          <div className="agenda-chips" role="group" aria-label="Rótulos">
            {labels.map((label) => (
              <button
                key={label.id}
                type="button"
                aria-pressed={filters.labelIds.includes(label.id)}
                className="agenda-chip"
                style={{ ["--chip" as string]: label.color }}
                onClick={() => toggleLabel(label.id)}
              >
                <i className="agenda-dot" style={{ ["--dot" as string]: label.color }} />
                {label.name}
              </button>
            ))}
            <button
              type="button"
              aria-pressed={filters.includeUnlabeled}
              className="agenda-chip"
              onClick={() => set({ includeUnlabeled: !filters.includeUnlabeled })}
            >
              Sem rótulo
            </button>
          </div>
        </div>

        <div>
          <p className="mb-1.5 text-[11px] uppercase tracking-wider text-muted-foreground">
            Estado
          </p>
          <div className="agenda-chips" role="group" aria-label="Estado">
            {STATUS_OPTIONS.map((o) => (
              <button
                key={o.id}
                type="button"
                aria-pressed={filters.statuses.includes(o.id)}
                className="agenda-chip"
                onClick={() => toggleStatus(o.id)}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>

        <Segment
          label="Rigidez"
          value={filters.rigid}
          options={[
            { id: "todos", label: "Todos" },
            { id: "rigidos", label: "Rígidos" },
            { id: "flexiveis", label: "Flexíveis" },
          ]}
          onChange={(rigid) => set({ rigid })}
        />
        <Segment
          label="Plano"
          value={filters.plan}
          options={[
            { id: "todos", label: "Todos" },
            { id: "com", label: "Com plano" },
            { id: "sem", label: "Sem plano" },
          ]}
          onChange={(plan) => set({ plan })}
        />

        <div className="agenda-chips" role="group" aria-label="Outros">
          <button
            type="button"
            aria-pressed={filters.conflict}
            className="agenda-chip"
            onClick={() => set({ conflict: !filters.conflict })}
          >
            Com conflito
          </button>
          <button
            type="button"
            aria-pressed={filters.noAlert}
            className="agenda-chip"
            onClick={() => set({ noAlert: !filters.noAlert })}
          >
            Sem alerta
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <DateField
              label="De"
              value={filters.from ?? ""}
              placeholder="Qualquer data"
              onChange={(from) => set({ from })}
            />
            {filters.from && (
              <button
                type="button"
                className="mt-1 text-[11px] text-muted-foreground underline"
                onClick={() => set({ from: undefined })}
              >
                limpar
              </button>
            )}
          </div>
          <div>
            <DateField
              label="Até"
              value={filters.to ?? ""}
              placeholder="Qualquer data"
              onChange={(to) => set({ to })}
            />
            {filters.to && (
              <button
                type="button"
                className="mt-1 text-[11px] text-muted-foreground underline"
                onClick={() => set({ to: undefined })}
              >
                limpar
              </button>
            )}
          </div>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => onChange({ ...EMPTY_FILTERS })}
            className="interactive-press min-h-12 flex-1 rounded-xl border border-border text-sm font-semibold"
          >
            Limpar tudo
          </button>
          <button
            type="button"
            onClick={onClose}
            className="interactive-press min-h-12 flex-1 rounded-xl bg-primary text-sm font-semibold text-primary-foreground"
          >
            Pronto
          </button>
        </div>
      </div>
    </Modal>
  );
}
