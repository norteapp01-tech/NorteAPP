import { X, Droplet, Undo2 } from "lucide-react";
import { useTodayHydration, todayIntake, addWater, undoLastLog } from "@/lib/hydration-store";
import { useProfile } from "@/lib/profile-store";

const OPTIONS = [
  { ml: 250, label: "+250 ml" },
  { ml: 500, label: "+500 ml" },
  { ml: 1000, label: "+1 L" },
];

export function AddWaterSheet({ onClose }: { onClose: () => void }) {
  const logs = useTodayHydration();
  const profile = useProfile();
  const current = todayIntake(logs);
  const goal = profile.waterGoalMl;

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
          <h3 className="flex items-center gap-1.5 text-lg font-bold">
            <Droplet className="h-4 w-4 text-primary" /> Adicionar água
          </h3>
          <button onClick={onClose}>
            <X className="h-5 w-5 text-muted-foreground" />
          </button>
        </div>

        <p className="mt-1 text-xs text-muted-foreground">
          {(current / 1000).toFixed(1)} / {(goal / 1000).toFixed(1)} L
        </p>

        <div className="mt-4 grid grid-cols-3 gap-2.5">
          {OPTIONS.map((o) => (
            <button
              key={o.ml}
              onClick={async () => {
                await addWater(o.ml);
                onClose();
              }}
              className="flex flex-col items-center gap-1.5 rounded-2xl bg-surface-2 py-5 text-sm font-semibold hover:border-primary/40"
            >
              <Droplet className="h-5 w-5 text-primary" />
              {o.label}
            </button>
          ))}
        </div>

        {logs.length > 0 && (
          <button
            onClick={async () => {
              await undoLastLog(logs);
            }}
            className="mt-4 flex items-center gap-1.5 text-xs text-muted-foreground"
          >
            <Undo2 className="h-3.5 w-3.5" /> desfazer último registro
          </button>
        )}
      </div>
    </div>
  );
}
