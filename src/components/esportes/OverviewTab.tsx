import { useNavigate } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { Card, Sparkline } from "@/components/sub-agenda-shared";
import { useGoalsStore, todayISO, formatDateBR } from "@/lib/goals-store";
import { useProfile } from "@/lib/profile-store";
import { formatTime } from "@/lib/format-utils";
import {
  useSportStore,
  weekSummary,
  weeklyDistanceSeries,
  lastActivities,
  formatDistanceKm,
  formatDurationClock,
  formatPace,
  formatSpeedKmh,
  modalityActionLabel,
  type SportModality,
} from "@/lib/sport-store";

export function OverviewTab({ modality }: { modality: SportModality }) {
  const navigate = useNavigate();
  const profile = useProfile();
  const activities = useSportStore((s) => s.activities);
  const weeklyGoals = useSportStore((s) => s.weeklyGoals);
  const executions = useGoalsStore((s) => s.executions);

  const today = todayISO();
  const goal = weeklyGoals.find((g) => g.modality === modality);
  const week = weekSummary(activities, modality, today);
  const series = weeklyDistanceSeries(activities, modality, 4, today);
  const recent = lastActivities(activities, modality, 3);

  const nextPlanned = executions
    .filter(
      (e) =>
        e.category === "esportes" &&
        e.sportModality === modality &&
        e.status === "planejada" &&
        e.agendaDate &&
        e.agendaDate >= today,
    )
    .sort((a, b) =>
      (a.agendaDate! + (a.startTime ?? "")).localeCompare(b.agendaDate! + (b.startTime ?? "")),
    )[0];

  return (
    <div className="space-y-5">
      <button
        onClick={() => navigate({ to: "/esportes/gravar", search: { modalidade: modality } })}
        className="interactive-press flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-4 text-base font-bold text-primary-foreground"
      >
        {modalityActionLabel[modality]}
      </button>

      <Card title="Sua semana">
        {goal ? (
          <div className="grid grid-cols-2 gap-3">
            {goal.targetSessions !== undefined && (
              <div>
                <p className="font-mono text-2xl font-bold">
                  {week.sessions}
                  <span className="text-sm text-muted-foreground">/{goal.targetSessions}</span>
                </p>
                <p className="text-[10px] uppercase text-muted-foreground">atividades</p>
              </div>
            )}
            {goal.targetDistanceM !== undefined && (
              <div>
                <p className="font-mono text-2xl font-bold">
                  {(week.distanceM / 1000).toFixed(1)}
                  <span className="text-sm text-muted-foreground">
                    /{(goal.targetDistanceM / 1000).toFixed(0)}km
                  </span>
                </p>
                <p className="text-[10px] uppercase text-muted-foreground">distância</p>
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <div>
              <p className="font-mono text-2xl font-bold">{week.sessions}</p>
              <p className="text-[10px] uppercase text-muted-foreground">
                atividades · {(week.distanceM / 1000).toFixed(1)}km esta semana
              </p>
            </div>
            <span className="text-[11px] text-muted-foreground">Sem meta definida</span>
          </div>
        )}
      </Card>

      {nextPlanned && (
        <Card title="Próxima atividade">
          <p className="text-sm font-semibold">
            {formatDateBR(nextPlanned.agendaDate!)}
            {nextPlanned.startTime && ` · ${formatTime(nextPlanned.startTime, profile.timeFormat)}`}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {nextPlanned.sportTargetDistanceM
              ? `Objetivo: ${(nextPlanned.sportTargetDistanceM / 1000).toFixed(1)}km`
              : nextPlanned.sportTargetDurationS
                ? `Objetivo: ${formatDurationClock(nextPlanned.sportTargetDurationS)}`
                : "Sem objetivo definido"}
          </p>
          <button
            onClick={() =>
              navigate({
                to: "/esportes/gravar",
                search: { modalidade: modality, execucao: nextPlanned.id },
              })
            }
            className="mt-3 w-full rounded-lg bg-primary/15 py-2 text-xs font-semibold text-primary"
          >
            Iniciar esta atividade
          </button>
        </Card>
      )}

      {series.some((v) => v > 0) && (
        <Card title="Evolução — últimas 4 semanas">
          <Sparkline values={series} />
          <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
            <span>{series[0]}km</span>
            <span>{series[series.length - 1]}km esta semana</span>
          </div>
        </Card>
      )}

      <Card title="Últimas atividades">
        {recent.length === 0 && (
          <p className="text-sm text-muted-foreground">Nenhuma atividade registrada ainda.</p>
        )}
        <ul className="space-y-2">
          {recent.map((a) => (
            <li
              key={a.id}
              className="flex items-center justify-between gap-2 rounded-lg border border-border bg-surface-2 p-3"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{a.title}</p>
                <p className="text-[11px] text-muted-foreground">
                  {formatDateBR(a.startedAt.slice(0, 10))} · {formatDistanceKm(a.distanceM)} ·{" "}
                  {formatDurationClock(a.activeDurationS)} ·{" "}
                  {modality === "ciclismo"
                    ? formatSpeedKmh(a.avgSpeedKmh ?? null)
                    : formatPace(a.avgPaceSPerKm ?? null)}
                </p>
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
