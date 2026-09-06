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
        className={`rounded-xl border border-border bg-surface p-3.5 text-left ${className}`}
      >
        <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          <Droplet className="h-3.5 w-3.5 text-primary" /> Hidratação
        </p>
        <p className="mt-2 text-lg font-bold leading-tight">
          {currentL}
          <span className="text-xs font-normal text-muted-foreground"> / {goalL} L</span>
        </p>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2">
          <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
        </div>
      </button>
      {open && <AddWaterSheet onClose={() => setOpen(false)} />}
    </>
  );
}
