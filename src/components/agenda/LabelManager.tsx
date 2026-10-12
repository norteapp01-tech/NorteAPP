import { useState } from "react";
import { Archive, ArrowDown, ArrowUp, Check, Plus, RotateCcw } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { InlineError } from "@/components/ui/inline-error";
import {
  LABEL_COLORS,
  LABEL_ICONS,
  archiveLabel,
  createDefaultLabels,
  createLabel,
  reorderLabels,
  restoreLabel,
  updateLabel,
  useAgendaLabels,
  type AgendaLabel,
} from "@/lib/agenda-labels-store";
import { LabelGlyph } from "./LabelIcon";
import "./agenda-ui.css";

function ColorRow({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Cor do rótulo">
      {LABEL_COLORS.map((color) => (
        <button
          key={color}
          type="button"
          role="radio"
          aria-checked={value === color}
          aria-label={`Cor ${color}`}
          onClick={() => onChange(color)}
          className="flex h-9 w-9 items-center justify-center rounded-full border border-border"
          style={{ background: color }}
        >
          {value === color && <Check className="h-4 w-4 text-black" strokeWidth={3} />}
        </button>
      ))}
    </div>
  );
}

function IconRow({
  value,
  onChange,
}: {
  value?: string;
  onChange: (icon: string | undefined) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Ícone do rótulo">
      <button
        type="button"
        role="radio"
        aria-checked={!value}
        onClick={() => onChange(undefined)}
        className={`flex h-9 min-w-9 items-center justify-center rounded-full border px-3 text-xs ${!value ? "border-primary text-primary" : "border-border text-muted-foreground"}`}
      >
        Sem ícone
      </button>
      {LABEL_ICONS.map((icon) => (
        <button
          key={icon}
          type="button"
          role="radio"
          aria-checked={value === icon}
          aria-label={`Ícone ${icon}`}
          onClick={() => onChange(icon)}
          className={`flex h-9 w-9 items-center justify-center rounded-full border ${value === icon ? "border-primary text-primary" : "border-border text-muted-foreground"}`}
        >
          <LabelGlyph icon={icon} className="h-4 w-4" />
        </button>
      ))}
    </div>
  );
}

function LabelForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial: { name: string; color: string; icon?: string };
  submitLabel: string;
  onSubmit: (value: { name: string; color: string; icon?: string }) => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial.name);
  const [color, setColor] = useState(initial.color);
  const [icon, setIcon] = useState<string | undefined>(initial.icon);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="card-surface-quiet space-y-3 p-3">
      <input
        autoFocus
        value={name}
        maxLength={40}
        onChange={(e) => setName(e.target.value)}
        placeholder="Nome do rótulo (ex.: Empresa A)"
        aria-label="Nome do rótulo"
        className="w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-sm outline-none focus:border-primary"
      />
      <ColorRow value={color} onChange={setColor} />
      <IconRow value={icon} onChange={setIcon} />
      {error && <InlineError message={error} />}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="interactive-press min-h-11 flex-1 rounded-xl border border-border text-sm font-semibold"
        >
          Cancelar
        </button>
        <button
          type="button"
          disabled={busy || !name.trim()}
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              await onSubmit({ name, color, icon });
            } catch (e) {
              setError(e instanceof Error ? e.message : "Não foi possível salvar.");
            } finally {
              setBusy(false);
            }
          }}
          className="interactive-press min-h-11 flex-1 rounded-xl bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-40"
        >
          {submitLabel}
        </button>
      </div>
    </div>
  );
}

/** Criar, renomear, trocar cor/ícone, reordenar, arquivar e reativar rótulos. */
export function LabelManager({ onClose }: { onClose: () => void }) {
  const { all, active } = useAgendaLabels();
  const archived = all.filter((l) => l.archived);
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [busy, setBusy] = useState(false);

  const move = async (label: AgendaLabel, delta: -1 | 1) => {
    const ids = active.map((l) => l.id);
    const from = ids.indexOf(label.id);
    const to = from + delta;
    if (to < 0 || to >= ids.length) return;
    [ids[from], ids[to]] = [ids[to], ids[from]];
    await reorderLabels(ids);
  };

  return (
    <Modal onClose={onClose} title="Rótulos da Agenda">
      <p className="text-xs text-muted-foreground">
        Rótulos organizam e colorem a sua Agenda. Um rótulo em uso é arquivado, nunca apagado — os
        compromissos antigos continuam com ele.
      </p>

      {all.length === 0 && (
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await createDefaultLabels();
            } finally {
              setBusy(false);
            }
          }}
          className="academia-add-set interactive-press mt-4 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl text-sm font-semibold"
        >
          <Plus className="h-4 w-4" /> Usar Trabalho, Família, Saúde e Pessoal
        </button>
      )}

      <ul className="mt-4 space-y-2">
        {active.map((label, index) =>
          editing === label.id ? (
            <li key={label.id}>
              <LabelForm
                initial={{ name: label.name, color: label.color, icon: label.icon }}
                submitLabel="Salvar"
                onCancel={() => setEditing(null)}
                onSubmit={async (value) => {
                  await updateLabel(label.id, {
                    name: value.name,
                    color: value.color,
                    icon: value.icon ?? null,
                  });
                  setEditing(null);
                }}
              />
            </li>
          ) : (
            <li
              key={label.id}
              className="card-surface-quiet flex min-h-14 items-center gap-3 px-3 py-2"
            >
              <span
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
                style={{ background: `${label.color}26`, color: label.color }}
              >
                <LabelGlyph icon={label.icon} className="h-4 w-4" />
                {!label.icon && (
                  <i className="agenda-dot" style={{ ["--dot" as string]: label.color }} />
                )}
              </span>
              <button
                type="button"
                onClick={() => setEditing(label.id)}
                className="min-w-0 flex-1 truncate text-left text-sm font-semibold"
                aria-label={`Editar ${label.name}`}
              >
                {label.name}
              </button>
              <button
                type="button"
                disabled={index === 0}
                onClick={() => void move(label, -1)}
                aria-label={`Subir ${label.name}`}
                className="flex h-9 w-9 items-center justify-center text-muted-foreground disabled:opacity-30"
              >
                <ArrowUp className="h-4 w-4" />
              </button>
              <button
                type="button"
                disabled={index === active.length - 1}
                onClick={() => void move(label, 1)}
                aria-label={`Descer ${label.name}`}
                className="flex h-9 w-9 items-center justify-center text-muted-foreground disabled:opacity-30"
              >
                <ArrowDown className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => void archiveLabel(label.id)}
                aria-label={`Arquivar ${label.name}`}
                title="Arquivar"
                className="flex h-9 w-9 items-center justify-center text-muted-foreground hover:text-danger"
              >
                <Archive className="h-4 w-4" />
              </button>
            </li>
          ),
        )}
      </ul>

      {editing === "new" ? (
        <div className="mt-3">
          <LabelForm
            initial={{ name: "", color: LABEL_COLORS[active.length % LABEL_COLORS.length] }}
            submitLabel="Criar rótulo"
            onCancel={() => setEditing(null)}
            onSubmit={async (value) => {
              await createLabel(value);
              setEditing(null);
            }}
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setEditing("new")}
          className="interactive-press mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border text-sm font-semibold text-muted-foreground hover:text-primary"
        >
          <Plus className="h-4 w-4" /> Novo rótulo
        </button>
      )}

      {archived.length > 0 && (
        <div className="mt-6">
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Arquivados
          </h3>
          <ul className="mt-2 space-y-2">
            {archived.map((label) => (
              <li
                key={label.id}
                className="flex min-h-12 items-center gap-3 rounded-xl border border-border px-3 opacity-70"
              >
                <i className="agenda-dot" style={{ ["--dot" as string]: label.color }} />
                <span className="min-w-0 flex-1 truncate text-sm">{label.name}</span>
                <button
                  type="button"
                  onClick={() => void restoreLabel(label.id)}
                  className="flex min-h-9 items-center gap-1 px-2 text-xs font-semibold text-primary"
                >
                  <RotateCcw className="h-3.5 w-3.5" /> Reativar
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Modal>
  );
}
