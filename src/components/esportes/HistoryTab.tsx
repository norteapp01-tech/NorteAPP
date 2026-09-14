import { useState } from "react";
import { Plus, ChevronRight } from "lucide-react";
import { Card } from "@/components/sub-agenda-shared";
import { formatDateBR, todayISO } from "@/lib/goals-store";
import {
  useSportStore,
  activitiesForModality,
  mondayOfWeek,
  formatDistanceKm,
  formatDurationClock,
  formatPace,
  formatSpeedKmh,
  type SportActivity,
  type SportModality,
} from "@/lib/sport-store";
import { ActivityDetailModal } from "./ActivityDetailModal";
import { ManualEntryModal } from "./ManualEntryModal";

type Period = "semana" | "30d" | "90d" | "tudo";

export function HistoryTab({
  modality,
  initialPeriod,
}: {
  modality: SportModality;
  initialPeriod?: Period;
}) {
  const activities = useSportStore((s) => s.activities);
  const [period, setPeriod] = useState<Period>(initialPeriod ?? "30d");
  const [selected, setSelected] = useState<SportActivity | null>(null);
  const [manualOpen, setManualOpen] = useState(false);

  const cutoff =
    period === "tudo"
      ? null
      : period === "semana"
        ? `${mondayOfWeek(todayISO())}T00:00:00.000Z`
        : new Date(Date.now() - (period === "30d" ? 30 : 90) * 86_400_000).toISOString();

  const list = activitiesForModality(activities, modality).filter(
    (a) => !cutoff || a.startedAt >= cutoff,
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex gap-1.5">
          {(
            [
              ["semana", "Esta semana"],
              ["30d", "30 dias"],
              ["90d", "90 dias"],
              ["tudo", "Tudo"],
            ] as [Period, string][]
          ).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setPeriod(key)}
              className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${period === key ? "bg-primary text-primary-foreground" : "border border-border bg-surface text-muted-foreground"}`}
            >
              {label}
            </button>
          ))}
        </div>
        <button
          onClick={() => setManualOpen(true)}
          className="flex items-center gap-1 text-xs font-semibold text-primary"
        >
          <Plus className="h-3.5 w-3.5" /> Registro manual
        </button>
      </div>

      <Card title={`${list.length} atividade(s)`}>
        {list.length === 0 && (
          <p className="text-sm text-muted-foreground">Nenhuma atividade neste período.</p>
        )}
        <ul className="space-y-2">
          {list.map((a) => (
            <li key={a.id}>
              <button
                onClick={() => setSelected(a)}
                className="flex w-full items-center justify-between gap-2 rounded-lg border border-border bg-surface-2 p-3 text-left hover:border-primary/40"
              >
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 truncate text-sm font-semibold">
                    {a.title}
                    {a.source === "manual" && (
                      <span className="shrink-0 rounded-full bg-surface px-1.5 py-0.5 text-[9px] uppercase text-muted-foreground">
                        Manual
                      </span>
                    )}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {formatDateBR(a.startedAt.slice(0, 10))} · {formatDistanceKm(a.distanceM)} ·{" "}
                    {formatDurationClock(a.activeDurationS)} ·{" "}
                    {modality === "ciclismo"
                      ? formatSpeedKmh(a.avgSpeedKmh ?? null)
                      : formatPace(a.avgPaceSPerKm ?? null)}
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              </button>
            </li>
          ))}
        </ul>
      </Card>

      {selected && <ActivityDetailModal activity={selected} onClose={() => setSelected(null)} />}
      {manualOpen && (
        <ManualEntryModal defaultModality={modality} onClose={() => setManualOpen(false)} />
      )}
    </div>
  );
}
