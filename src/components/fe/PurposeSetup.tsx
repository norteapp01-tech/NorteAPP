import { useState } from "react";
import { X } from "lucide-react";
import { createPurpose, linkPurposeToActivity } from "@/lib/fe-store";
import { SpiritualActivitySetup } from "./SpiritualActivitySetup";

export function PurposeSetup({ onClose }: { onClose: () => void }) {
  const [title, setTitle] = useState("");
  const [intention, setIntention] = useState("");
  const [why, setWhy] = useState("");
  const [definePeriod, setDefinePeriod] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [wantsRoutine, setWantsRoutine] = useState(false);
  const [createdPurposeId, setCreatedPurposeId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const canSave = title.trim().length > 0 && intention.trim().length > 0;

  const save = async () => {
    if (!canSave || saving) return;
    setSaving(true);
    setError("");
    try {
      const id = await createPurpose({
        title,
        intention,
        why: why || undefined,
        startDate: definePeriod ? startDate || undefined : undefined,
        endDate: definePeriod ? endDate || undefined : undefined,
      });
      if (wantsRoutine) {
        setCreatedPurposeId(id);
      } else {
        onClose();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível salvar. Tente de novo.");
    } finally {
      setSaving(false);
    }
  };

  if (createdPurposeId) {
    return (
      <SpiritualActivitySetup
        kind="proposito"
        initialTitle={title}
        onClose={onClose}
        onSaved={async (activityId) => {
          await linkPurposeToActivity(createdPurposeId, activityId);
        }}
      />
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end bg-background/85 backdrop-blur-sm sm:items-center sm:justify-center"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="card-surface w-full max-w-md rounded-b-none rounded-t-3xl border-x-0 border-b-0 p-5 sm:rounded-3xl sm:border"
      >
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold">Novo propósito</h3>
          <button onClick={onClose}>
            <X className="h-5 w-5 text-muted-foreground" />
          </button>
        </div>

        <div className="mt-4 space-y-3">
          <label className="block">
            <span className="mb-0.5 block text-[10px] uppercase text-muted-foreground">
              Qual é seu propósito?
            </span>
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="ex: Constância com Deus"
              className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-primary"
            />
          </label>

          <label className="block">
            <span className="mb-0.5 block text-[10px] uppercase text-muted-foreground">
              Minha intenção
            </span>
            <textarea
              value={intention}
              onChange={(e) => setIntention(e.target.value)}
              placeholder="ex: Quero criar espaço mesmo nos dias corridos."
              className="min-h-16 w-full resize-none rounded-lg border border-border bg-surface-2 p-3 text-sm outline-none focus:border-primary"
            />
          </label>

          <label className="block">
            <span className="mb-0.5 block text-[10px] uppercase text-muted-foreground">
              Por que isso é importante para você? (opcional)
            </span>
            <textarea
              value={why}
              onChange={(e) => setWhy(e.target.value)}
              className="min-h-14 w-full resize-none rounded-lg border border-border bg-surface-2 p-3 text-sm outline-none focus:border-primary"
            />
          </label>

          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={definePeriod}
              onChange={(e) => setDefinePeriod(e.target.checked)}
            />
            Quer definir um período?
          </label>
          {definePeriod && (
            <div className="grid grid-cols-2 gap-2">
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-primary"
              />
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-primary"
              />
            </div>
          )}

          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={wantsRoutine}
              onChange={(e) => setWantsRoutine(e.target.checked)}
            />
            Quer reservar algum momento na rotina?
          </label>
        </div>

        {error && <p className="mt-2 text-[11px] text-danger">{error}</p>}
        <button
          onClick={save}
          disabled={!canSave || saving}
          className="mt-5 w-full rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground disabled:opacity-40"
        >
          {saving ? "Salvando…" : wantsRoutine ? "Continuar" : "Criar propósito"}
        </button>
      </div>
    </div>
  );
}
