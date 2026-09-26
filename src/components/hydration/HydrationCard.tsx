import { useState, type CSSProperties } from "react";
import { Droplet } from "lucide-react";
import { useTodayHydration, todayIntake } from "@/lib/hydration-store";
import { useProfile } from "@/lib/profile-store";
import { AddWaterSheet } from "./AddWaterSheet";
import { ProgressBar } from "@/components/ui/progress-bar";

export function HydrationCard({
  className = "",
  inline = false,
}: {
  className?: string;
  inline?: boolean;
}) {
  const logs = useTodayHydration();
  const profile = useProfile();
  const [open, setOpen] = useState(false);

  const current = todayIntake(logs);
  const goal = profile.waterGoalMl;
  const pct = goal > 0 ? Math.min(100, Math.round((current / goal) * 100)) : 0;
  const currentL = (current / 1000).toFixed(current % 1000 === 0 ? 0 : 1);
  const goalL = (goal / 1000).toFixed(goal % 1000 === 0 ? 0 : 1);

  if (inline) {
    return (
      <>
        <button
          onClick={() => setOpen(true)}
          aria-label={`Registrar água. ${currentL} de ${goalL} litros`}
          className={`today-status-action interactive-press ${className}`}
        >
          <span
            className="today-status-progress"
            style={{ "--progress": `${pct * 3.6}deg` } as CSSProperties}
          >
            <Droplet className="h-[18px] w-[18px]" strokeWidth={1.7} />
          </span>
          <span>
            {currentL}/{goalL} água
          </span>
        </button>
        {open && <AddWaterSheet onClose={() => setOpen(false)} />}
      </>
    );
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Registrar água"
        className={`card-surface-quiet flex min-h-24 min-w-0 items-center gap-2 p-3.5 text-left ${className}`}
      >
        <Droplet className="h-6 w-6 shrink-0 text-muted-foreground" strokeWidth={1.75} />
        <div className="min-w-0 flex-1">
          <p className="whitespace-nowrap text-[11px] font-medium text-muted-foreground">
            Hidratação
          </p>
          <p className="mt-1 text-lg font-bold leading-tight">
            {currentL}
            <span className="text-xs font-normal text-muted-foreground"> / {goalL} L</span>
          </p>
          <ProgressBar value={pct} className="mt-2" label="Progresso de hidratação do dia" />
        </div>
      </button>
      {open && <AddWaterSheet onClose={() => setOpen(false)} />}
    </>
  );
}
