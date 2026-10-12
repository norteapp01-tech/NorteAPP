import { Modal } from "@/components/ui/modal";
import { updateProfile, useProfile } from "@/lib/profile-store";
import {
  ALERT_OPTIONS,
  DURATION_OPTIONS,
  type AgendaSettings,
  type AgendaView,
} from "@/lib/agenda-settings";
import { formatDuration } from "@/lib/agenda-intervals";
import { useAgendaLabels } from "@/lib/agenda-labels-store";
import { useState } from "react";
import { InlineError } from "@/components/ui/inline-error";
import "./agenda-ui.css";

const VIEW_OPTIONS: { id: AgendaView; label: string }[] = [
  { id: "dia", label: "Dia" },
  { id: "semana", label: "Semana" },
  { id: "mes", label: "Mês" },
  { id: "proximos", label: "Próximos" },
];

/** Configurações próprias da Agenda. Formato de hora e primeiro dia da semana
 * continuam nas Preferências gerais. */
export function AgendaSettingsSheet({
  onClose,
  onManageLabels,
}: {
  onClose: () => void;
  onManageLabels: () => void;
}) {
  const { agendaSettings: settings } = useProfile();
  const labels = useAgendaLabels();
  const [error, setError] = useState<string | null>(null);

  const save = async (patch: Partial<AgendaSettings>) => {
    setError(null);
    try {
      await updateProfile({ agendaSettings: patch });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível salvar.");
    }
  };

  return (
    <Modal onClose={onClose} title="Configurações da Agenda">
      <div className="space-y-6">
        <Field label="Duração padrão de um compromisso novo">
          <div className="agenda-chips" role="radiogroup" aria-label="Duração padrão">
            {DURATION_OPTIONS.map((m) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={settings.defaultDurationMin === m}
                aria-pressed={settings.defaultDurationMin === m}
                className="agenda-chip"
                onClick={() => void save({ defaultDurationMin: m })}
              >
                {formatDuration(m)}
              </button>
            ))}
          </div>
        </Field>

        <Field label="Seu dia habitual">
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1 block text-[11px] text-muted-foreground">Começa</span>
              <input
                type="time"
                value={settings.dayStart}
                onChange={(e) => e.target.value && void save({ dayStart: e.target.value })}
                className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-sm outline-none focus:border-primary"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] text-muted-foreground">Termina</span>
              <input
                type="time"
                value={settings.dayEnd}
                onChange={(e) => e.target.value && void save({ dayEnd: e.target.value })}
                className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-sm outline-none focus:border-primary"
              />
            </label>
          </div>
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            Serve para abrir a tela no lugar certo, sugerir horários e destacar a janela. A linha do
            tempo continua mostrando as 24 horas, e você pode marcar fora desse intervalo.
          </p>
        </Field>

        <label className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface px-4 py-3">
          <span className="text-sm font-medium">Mostrar fins de semana</span>
          <input
            type="checkbox"
            checked={settings.showWeekends}
            onChange={(e) => void save({ showWeekends: e.target.checked })}
            className="h-5 w-5 accent-primary"
          />
        </label>

        <Field label="Alerta padrão">
          <div className="agenda-chips" role="radiogroup" aria-label="Alerta padrão">
            <button
              type="button"
              role="radio"
              aria-checked={settings.defaultAlertMin === null}
              aria-pressed={settings.defaultAlertMin === null}
              className="agenda-chip"
              onClick={() => void save({ defaultAlertMin: null })}
            >
              Nenhum
            </button>
            {ALERT_OPTIONS.map((o) => (
              <button
                key={o.minutes}
                type="button"
                role="radio"
                aria-checked={settings.defaultAlertMin === o.minutes}
                aria-pressed={settings.defaultAlertMin === o.minutes}
                className="agenda-chip"
                onClick={() => void save({ defaultAlertMin: o.minutes })}
              >
                {o.label}
              </button>
            ))}
          </div>
        </Field>

        <Field label="Visualização ao abrir">
          <div className="agenda-chips" role="radiogroup" aria-label="Visualização padrão">
            {VIEW_OPTIONS.map((o) => (
              <button
                key={o.id}
                type="button"
                role="radio"
                aria-checked={settings.defaultView === o.id}
                aria-pressed={settings.defaultView === o.id}
                className="agenda-chip"
                onClick={() => void save({ defaultView: o.id })}
              >
                {o.label}
              </button>
            ))}
          </div>
        </Field>

        <Field label="Rótulo padrão (opcional)">
          <div className="agenda-chips" role="radiogroup" aria-label="Rótulo padrão">
            <button
              type="button"
              role="radio"
              aria-checked={settings.defaultLabelId === null}
              aria-pressed={settings.defaultLabelId === null}
              className="agenda-chip"
              onClick={() => void save({ defaultLabelId: null })}
            >
              Nenhum
            </button>
            {labels.active.map((label) => (
              <button
                key={label.id}
                type="button"
                role="radio"
                aria-checked={settings.defaultLabelId === label.id}
                aria-pressed={settings.defaultLabelId === label.id}
                className="agenda-chip"
                style={{ ["--chip" as string]: label.color }}
                onClick={() => void save({ defaultLabelId: label.id })}
              >
                <i className="agenda-dot" style={{ ["--dot" as string]: label.color }} />
                {label.name}
              </button>
            ))}
          </div>
        </Field>

        <button
          type="button"
          onClick={onManageLabels}
          className="interactive-press min-h-12 w-full rounded-xl border border-border text-sm font-semibold"
        >
          Gerenciar rótulos
        </button>
        {error && <InlineError message={error} />}
      </div>
    </Modal>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-2 text-[11px] uppercase tracking-wider text-muted-foreground">{label}</p>
      {children}
    </div>
  );
}
