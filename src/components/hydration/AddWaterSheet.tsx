import { useState } from "react";
import { Droplet, Undo2, Pencil, Check } from "lucide-react";
import { useTodayHydration, todayIntake, addWater, undoLastLog } from "@/lib/hydration-store";
import { useProfile, updateProfile } from "@/lib/profile-store";
import { Modal } from "@/components/ui/modal";

const OPTIONS = [
  { ml: 250, label: "+250 ml" },
  { ml: 500, label: "+500 ml" },
  { ml: 1000, label: "+1 L" },
];

/** Aceita "3", "3.5", "3,5" (litros) ou valores grandes tipo "3000" (ml). */
function parseGoalInput(raw: string): number | null {
  const value = parseFloat(raw.replace(",", "."));
  if (!value || value <= 0) return null;
  const ml = value > 100 ? value : value * 1000;
  return Math.round(ml);
}

export function AddWaterSheet({ onClose }: { onClose: () => void }) {
  const logs = useTodayHydration();
  const profile = useProfile();
  const current = todayIntake(logs);
  const goal = profile.waterGoalMl;

  const [editingGoal, setEditingGoal] = useState(false);
  const [goalDraft, setGoalDraft] = useState(() => (goal / 1000).toString().replace(".", ","));
  const [savingGoal, setSavingGoal] = useState(false);
  const [goalError, setGoalError] = useState("");
  const [adding, setAdding] = useState<number | null>(null);
  const [undoing, setUndoing] = useState(false);

  const saveGoal = async () => {
    const ml = parseGoalInput(goalDraft);
    if (!ml) {
      setGoalError("Informe uma meta maior que zero.");
      return;
    }
    setSavingGoal(true);
    setGoalError("");
    try {
      await updateProfile({ waterGoalMl: ml });
      setEditingGoal(false);
    } catch (err) {
      setGoalError(err instanceof Error ? err.message : "Não foi possível salvar a meta.");
    } finally {
      setSavingGoal(false);
    }
  };

  return (
    <Modal onClose={onClose} title="Adicionar água" maxWidthClassName="max-w-sm">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {(current / 1000).toFixed(1)} / {(goal / 1000).toFixed(1)} L
        </p>
        {!editingGoal && (
          <button
            onClick={() => {
              setGoalDraft((goal / 1000).toString().replace(".", ","));
              setGoalError("");
              setEditingGoal(true);
            }}
            className="flex items-center gap-1 text-[11px] font-semibold text-primary"
          >
            <Pencil className="h-3 w-3" /> meta diária
          </button>
        )}
      </div>

      {editingGoal && (
        <div className="mt-2 rounded-xl border border-dashed border-primary/40 bg-primary/5 p-3">
          <label className="block">
            <span className="mb-1 block text-[10px] uppercase text-muted-foreground">
              Meta diária (litros ou ml)
            </span>
            <div className="flex items-center gap-2">
              <input
                autoFocus
                inputMode="decimal"
                value={goalDraft}
                onChange={(e) => {
                  setGoalDraft(e.target.value);
                  setGoalError("");
                }}
                placeholder="3,0"
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
              />
              <button
                onClick={saveGoal}
                disabled={savingGoal}
                aria-label="Salvar meta"
                className="shrink-0 rounded-lg bg-primary p-2.5 text-primary-foreground disabled:opacity-40"
              >
                <Check className="h-4 w-4" />
              </button>
            </div>
          </label>
          {goalError && <p className="mt-1.5 text-[11px] text-danger">{goalError}</p>}
        </div>
      )}

      <div className="mt-4 grid grid-cols-3 gap-2.5">
        {OPTIONS.map((o) => (
          <button
            key={o.ml}
            disabled={adding !== null}
            onClick={async () => {
              setAdding(o.ml);
              try {
                await addWater(o.ml);
                onClose();
              } finally {
                setAdding(null);
              }
            }}
            className="flex flex-col items-center gap-1.5 rounded-2xl bg-surface-2 py-5 text-sm font-semibold hover:border-primary/40 disabled:opacity-40"
          >
            <Droplet className="h-5 w-5 text-primary" />
            {adding === o.ml ? "salvando…" : o.label}
          </button>
        ))}
      </div>

      {logs.length > 0 && (
        <button
          disabled={undoing}
          onClick={async () => {
            setUndoing(true);
            try {
              await undoLastLog(logs);
            } finally {
              setUndoing(false);
            }
          }}
          className="mt-4 flex items-center gap-1.5 text-xs text-muted-foreground disabled:opacity-40"
        >
          <Undo2 className="h-3.5 w-3.5" /> {undoing ? "desfazendo…" : "desfazer último registro"}
        </button>
      )}
    </Modal>
  );
}
