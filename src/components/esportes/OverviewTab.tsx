import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, Footprints, PersonStanding, Bike } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { useGoalsStore, todayISO, formatDateBR } from "@/lib/goals-store";
import { useProfile } from "@/lib/profile-store";
import { formatTime } from "@/lib/format-utils";
import {
  useSportStore,
  weekSummary,
  weeklyDistanceSeries,
  lastActivities,
  fetchActivityPoints,
  formatDistanceKm,
  formatDurationClock,
  formatPace,
  formatSpeedKmh,
  modalityActionLabel,
  type SportActivity,
  type SportModality,
} from "@/lib/sport-store";
import { RoutePreview } from "./RoutePreview";
import { ActivityDetailModal } from "./ActivityDetailModal";
import { WeeklyGoalsPanel } from "./WeeklyGoalsPanel";

const modalityIcon = { corrida: Footprints, caminhada: PersonStanding, ciclismo: Bike } as const;

function ProgressBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
      <div
        className="h-full rounded-full bg-primary transition-all duration-300 motion-reduce:transition-none"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export function OverviewTab({
  modality,
  onOpenHistory,
}: {
  modality: SportModality;
  onOpenHistory: (period?: "semana") => void;
}) {
  const navigate = useNavigate();
  const profile = useProfile();
  const activities = useSportStore((s) => s.activities);
  const weeklyGoals = useSportStore((s) => s.weeklyGoals);
  const executions = useGoalsStore((s) => s.executions);
  const [goalEditOpen, setGoalEditOpen] = useState(false);
  const [detailActivity, setDetailActivity] = useState<SportActivity | null>(null);
  const [expandedWeek, setExpandedWeek] = useState<number | null>(null);

  const today = todayISO();
  const goal = weeklyGoals.find((g) => g.modality === modality);
  const week = weekSummary(activities, modality, today);
  const series = weeklyDistanceSeries(activities, modality, 4, today);
  const [mostRecent] = lastActivities(activities, modality, 1);
  const maxSeriesM = Math.max(1, ...series.map((w) => w.distanceM));

  const { data: recentPoints } = useQuery({
    queryKey: ["sport-activity-points", mostRecent?.id],
    queryFn: () => fetchActivityPoints(mostRecent!.id),
    enabled: !!mostRecent && mostRecent.source === "gravado",
  });

  const todayPlanned = executions.find(
    (e) =>
      e.category === "esportes" &&
      e.sportModality === modality &&
      e.status === "planejada" &&
      e.agendaDate === today,
  );

  const Icon = modalityIcon[modality];

  return (
    <div className="space-y-5">
      {/* Ação principal */}
      {todayPlanned ? (
        <div className="card-surface p-4">
          <p className="text-base font-bold">{todayPlanned.title}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {todayPlanned.startTime &&
              `${formatTime(todayPlanned.startTime, profile.timeFormat)} · `}
            {todayPlanned.sportTargetDistanceM
              ? `Objetivo: ${(todayPlanned.sportTargetDistanceM / 1000).toFixed(1)}km`
              : todayPlanned.sportTargetDurationS
                ? `Objetivo: ${formatDurationClock(todayPlanned.sportTargetDurationS)}`
                : "Sem objetivo definido"}
          </p>
          <button
            onClick={() =>
              navigate({
                to: "/esportes/gravar",
                search: { modalidade: modality, execucao: todayPlanned.id },
              })
            }
            className="interactive-press mt-3 w-full rounded-2xl bg-primary py-3.5 text-sm font-bold text-primary-foreground"
          >
            Iniciar treino
          </button>
          <button
            onClick={() => navigate({ to: "/esportes/gravar", search: { modalidade: modality } })}
            className="mt-2 w-full text-center text-xs font-semibold text-muted-foreground hover:text-primary"
          >
            Atividade livre
          </button>
        </div>
      ) : (
        <button
          onClick={() => navigate({ to: "/esportes/gravar", search: { modalidade: modality } })}
          className="interactive-press flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-4 text-base font-bold text-primary-foreground"
        >
          {modalityActionLabel[modality]}
        </button>
      )}

      {/* Sua semana */}
      <div className="card-surface p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            Sua semana
          </h3>
          <button
            onClick={() => setGoalEditOpen(true)}
            className="text-[11px] font-semibold text-primary"
          >
            {goal ? "Editar meta" : "Definir meta"}
          </button>
        </div>
        <div className="mt-3">
          {goal ? (
            <button
              onClick={() => onOpenHistory("semana")}
              className="block w-full space-y-3 text-left"
            >
              {goal.targetSessions !== undefined && (
                <div>
                  <div className="flex items-baseline justify-between">
                    <p className="text-xs font-semibold">Atividades</p>
                    <p className="font-mono text-sm">
                      {week.sessions}
                      <span className="text-muted-foreground">/{goal.targetSessions}</span>
                    </p>
                  </div>
                  <ProgressBar value={week.sessions} max={goal.targetSessions} />
                </div>
              )}
              {goal.targetDistanceM !== undefined && (
                <div>
                  <div className="flex items-baseline justify-between">
                    <p className="text-xs font-semibold">Distância</p>
                    <p className="font-mono text-sm">
                      {(week.distanceM / 1000).toFixed(1)}
                      <span className="text-muted-foreground">
                        /{(goal.targetDistanceM / 1000).toFixed(0)}km
                      </span>
                    </p>
                  </div>
                  <ProgressBar value={week.distanceM} max={goal.targetDistanceM} />
                </div>
              )}
            </button>
          ) : (
            <button
              onClick={() => onOpenHistory("semana")}
              className="flex w-full items-center justify-between text-left"
            >
              <div>
                <p className="font-mono text-2xl font-bold">{week.sessions}</p>
                <p className="text-[10px] uppercase text-muted-foreground">
                  atividades · {(week.distanceM / 1000).toFixed(1)}km esta semana
                </p>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </button>
          )}
        </div>
      </div>

      {/* Última atividade */}
      <div>
        <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
          Última atividade
        </h3>
        {mostRecent ? (
          <button
            onClick={() => setDetailActivity(mostRecent)}
            className="card-surface interactive-press flex w-full items-center gap-3 p-4 text-left"
          >
            {mostRecent.source === "manual" ? (
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-surface-2">
                <Icon className="h-6 w-6 text-primary" strokeWidth={1.8} />
              </div>
            ) : (
              <RoutePreview
                points={recentPoints ?? []}
                hideRoute={mostRecent.privacyHideRoute}
                hideStartEnd={mostRecent.privacyHideStartEnd}
                className="h-16 w-16 shrink-0"
              />
            )}
            <div className="min-w-0 flex-1">
              <p className="text-lg font-bold text-primary">
                {formatDistanceKm(mostRecent.distanceM)}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {formatDateBR(mostRecent.startedAt.slice(0, 10))} ·{" "}
                {formatDurationClock(mostRecent.activeDurationS)} ·{" "}
                {modality === "ciclismo"
                  ? formatSpeedKmh(mostRecent.avgSpeedKmh ?? null)
                  : formatPace(mostRecent.avgPaceSPerKm ?? null)}
              </p>
            </div>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          </button>
        ) : (
          <p className="text-sm text-muted-foreground">Nenhuma atividade registrada ainda.</p>
        )}
      </div>

      {/* Evolução */}
      {series.some((w) => w.distanceM > 0) && (
        <div>
          <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            Evolução — últimas 4 semanas
          </h3>
          <div className="card-surface p-4">
            <div className="flex items-end justify-between gap-3" style={{ height: 72 }}>
              {series.map((w, i) => {
                const heightPct = Math.max(4, (w.distanceM / maxSeriesM) * 100);
                return (
                  <button
                    key={w.weekStartIso}
                    onClick={() => setExpandedWeek((v) => (v === i ? null : i))}
                    aria-label={`Semana de ${formatDateBR(w.weekStartIso)}`}
                    className="flex h-full flex-1 flex-col items-center justify-end"
                  >
                    <div
                      className={`w-full rounded-t-md transition-all duration-300 motion-reduce:transition-none ${
                        expandedWeek === i
                          ? "bg-primary"
                          : w.isCurrent
                            ? "bg-primary/40"
                            : "bg-primary/70"
                      }`}
                      style={{ height: `${heightPct}%` }}
                    />
                  </button>
                );
              })}
            </div>
            {expandedWeek !== null && (
              <div className="mt-3 rounded-lg bg-surface-2 p-2.5 text-center text-xs">
                <p className="font-semibold">
                  {formatDateBR(series[expandedWeek].weekStartIso)} –{" "}
                  {formatDateBR(series[expandedWeek].weekEndIso)}
                  {series[expandedWeek].isCurrent && (
                    <span className="ml-1 font-normal text-muted-foreground">(em andamento)</span>
                  )}
                </p>
                <p className="mt-0.5 text-muted-foreground">
                  {(series[expandedWeek].distanceM / 1000).toFixed(1)}km ·{" "}
                  {series[expandedWeek].sessions} atividade
                  {series[expandedWeek].sessions === 1 ? "" : "s"}
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      <button
        onClick={() => onOpenHistory()}
        className="block w-full text-center text-xs font-semibold text-muted-foreground hover:text-primary"
      >
        Ver histórico completo
      </button>

      {goalEditOpen && (
        <Modal title="Metas semanais" onClose={() => setGoalEditOpen(false)}>
          <WeeklyGoalsPanel />
        </Modal>
      )}
      {detailActivity && (
        <ActivityDetailModal activity={detailActivity} onClose={() => setDetailActivity(null)} />
      )}
    </div>
  );
}
