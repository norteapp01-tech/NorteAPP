import { useState } from "react";
import { Modal } from "@/components/ui/modal";
import { todayISO } from "@/lib/goals-store";
import { createManualActivity, modalityLabel, type SportModality } from "@/lib/sport-store";

/** Esteira, bicicleta indoor ou atividade esquecida — claramente marcado como
 * manual, nunca com percurso inventado (sem pontos de GPS, sem mapa). */
export function ManualEntryModal({
  defaultModality,
  onClose,
}: {
  defaultModality: SportModality;
  onClose: () => void;
}) {
  const [modality, setModality] = useState(defaultModality);
  const [date, setDate] = useState(todayISO());
  const [distanceKm, setDistanceKm] = useState("");
  const [durationMin, setDurationMin] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    const distanceM = Math.round((parseFloat(distanceKm) || 0) * 1000);
    const totalDurationS = Math.round((parseFloat(durationMin) || 0) * 60);
    if (distanceM <= 0 || totalDurationS <= 0) {
      setError("Informe distância e duração.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await createManualActivity({
        modality,
        title: `${modalityLabel[modality]} (registro manual)`,
        note: note || undefined,
        startedAt: `${date}T12:00:00.000Z`,
        distanceM,
        totalDurationS,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível salvar.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title="Registro manual" onClose={onClose}>
      <p className="text-xs text-muted-foreground">
        Pra esteira, bicicleta indoor ou uma atividade que você esqueceu de gravar. Sem percurso —
        nunca inventamos o caminho.
      </p>
      <div className="mt-3 space-y-2">
        <div className="flex flex-wrap gap-1.5">
          {(Object.keys(modalityLabel) as SportModality[]).map((m) => (
            <button
              key={m}
              onClick={() => setModality(m)}
              className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${modality === m ? "bg-primary text-primary-foreground" : "border border-border bg-surface text-muted-foreground"}`}
            >
              {modalityLabel[m]}
            </button>
          ))}
        </div>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-primary"
        />
        <div className="grid grid-cols-2 gap-2">
          <input
            type="number"
            step="0.1"
            value={distanceKm}
            onChange={(e) => setDistanceKm(e.target.value)}
            placeholder="Distância (km)"
            className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-primary"
          />
          <input
            type="number"
            value={durationMin}
            onChange={(e) => setDurationMin(e.target.value)}
            placeholder="Duração (min)"
            className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-primary"
          />
        </div>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Observação (opcional)"
          className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-primary"
        />
        {error && <p className="text-xs text-danger">{error}</p>}
        <button
          disabled={saving}
          onClick={save}
          className="w-full rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
        >
          {saving ? "Salvando…" : "Salvar registro"}
        </button>
      </div>
    </Modal>
  );
}
