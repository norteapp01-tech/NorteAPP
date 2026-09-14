import { useState } from "react";
import { modalityLabel, setWeeklyGoal, useSportStore, type SportModality } from "@/lib/sport-store";

/** Frequência e distância — cada campo opcional, nunca preenchidos
 * automaticamente. Deixar os dois em branco remove a meta da modalidade. */
export function WeeklyGoalsPanel() {
  const goals = useSportStore((s) => s.weeklyGoals);

  return (
    <div className="space-y-4">
      {(Object.keys(modalityLabel) as SportModality[]).map((m) => (
        <GoalRow key={m} modality={m} current={goals.find((g) => g.modality === m)} />
      ))}
    </div>
  );
}

function GoalRow({
  modality,
  current,
}: {
  modality: SportModality;
  current: { targetSessions?: number; targetDistanceM?: number } | undefined;
}) {
  const [sessions, setSessions] = useState(current?.targetSessions?.toString() ?? "");
  const [distanceKm, setDistanceKm] = useState(
    current?.targetDistanceM ? (current.targetDistanceM / 1000).toString() : "",
  );
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      const parsedSessions = sessions.trim() ? Math.max(1, parseInt(sessions, 10) || 0) : undefined;
      const parsedDistanceM = distanceKm.trim()
        ? Math.max(1, Math.round((parseFloat(distanceKm) || 0) * 1000))
        : undefined;
      await setWeeklyGoal(modality, {
        targetSessions: parsedSessions,
        targetDistanceM: parsedDistanceM,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-xl border border-border bg-surface-2 p-3">
      <p className="text-sm font-semibold">{modalityLabel[modality]}</p>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <label className="block">
          <span className="mb-0.5 block text-[9px] uppercase text-muted-foreground">
            atividades/semana
          </span>
          <input
            type="number"
            min={1}
            value={sessions}
            onChange={(e) => setSessions(e.target.value)}
            placeholder="opcional"
            className="w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm outline-none focus:border-primary"
          />
        </label>
        <label className="block">
          <span className="mb-0.5 block text-[9px] uppercase text-muted-foreground">km/semana</span>
          <input
            type="number"
            min={1}
            step="0.1"
            value={distanceKm}
            onChange={(e) => setDistanceKm(e.target.value)}
            placeholder="opcional"
            className="w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm outline-none focus:border-primary"
          />
        </label>
      </div>
      <button
        disabled={saving}
        onClick={save}
        className="mt-2 w-full rounded-lg bg-primary py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-60"
      >
        {saving ? "Salvando…" : "Salvar meta"}
      </button>
    </div>
  );
}
