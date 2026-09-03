import { useState } from "react";
import { Droplet } from "lucide-react";
import { useTodayHydration, todayIntake } from "@/lib/hydration-store";
import { useProfile } from "@/lib/profile-store";
import { AddWaterSheet } from "./AddWaterSheet";

const WATER_FILL = "oklch(0.75 0.12 200 / 0.55)";

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
        className={`card-surface relative aspect-square overflow-hidden p-3 text-left ${className}`}
      >
        <div
          className="absolute inset-x-0 bottom-0 transition-[height] duration-500 ease-out"
          style={{ height: `${pct}%`, backgroundColor: WATER_FILL }}
        />
        <div className="relative z-10 flex h-full flex-col justify-between">
          <Droplet className="h-4 w-4 text-primary drop-shadow-[0_1px_2px_rgba(0,0,0,0.6)]" />
          <div className="drop-shadow-[0_1px_2px_rgba(0,0,0,0.6)]">
            <p className="text-sm font-bold leading-tight">
              {currentL}
              <span className="text-[10px] font-normal text-muted-foreground"> / {goalL} L</span>
            </p>
            <p className="text-[10px] text-muted-foreground">{pct}%</p>
          </div>
        </div>
      </button>
      {open && <AddWaterSheet onClose={() => setOpen(false)} />}
    </>
  );
}
