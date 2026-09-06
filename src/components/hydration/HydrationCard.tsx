import { useState } from "react";
import { Droplet } from "lucide-react";
import { useTodayHydration, todayIntake } from "@/lib/hydration-store";
import { useProfile } from "@/lib/profile-store";
import { AddWaterSheet } from "./AddWaterSheet";

export function HydrationCard({ className = "" }: { className?: string }) {
  const logs = useTodayHydration();
  const profile = useProfile();
  const [open, setOpen] = useState(false);

  const current = todayIntake(logs);
  const goal = profile.waterGoalMl;
  const pct = goal > 0 ? Math.min(100, Math.round((current / goal) * 100)) : 0;
  const currentL = (current / 1000).toFixed(current % 1000 === 0 ? 0 : 1);
  const goalL = (goal / 1000).toFixed(goal % 1000 === 0 ? 0 : 1);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Registrar água"
        className={`flex min-h-24 items-center gap-3 rounded-xl border border-border bg-surface p-3.5 text-left ${className}`}
      >
        <Droplet className="h-7 w-7 shrink-0 text-primary" strokeWidth={1.75} />
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-primary">
            Hidratação
          </p>
          <p className="mt-1 text-lg font-bold leading-tight">
            {currentL}
            <span className="text-xs font-normal text-muted-foreground"> / {goalL} L</span>
          </p>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2">
            <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
          </div>
        </div>
      </button>
      {open && <AddWaterSheet onClose={() => setOpen(false)} />}
    </>
  );
}
