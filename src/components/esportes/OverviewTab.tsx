import { ProgressRing } from "@/components/ui/progress-ring";
import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  CalendarDays,
  ChevronRight,
  Footprints,
  PersonStanding,
  Bike,
  MapPin,
  Pencil,
  Plus,
} from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { useGoalsStore, todayISO, formatDateBR } from "@/lib/goals-store";
import { useProfile } from "@/lib/profile-store";
import { formatTime } from "@/lib/format-utils";
import {
  useSportStore,
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
import {
  nextPlannedSportActivity,
  plannedTargetLabel,
  weekConsistency,
  weeklyMetricsSeries,
} from "@/lib/sport-analytics";
import { RoutePreview } from "./RoutePreview";
import { ActivityDetailModal } from "./ActivityDetailModal";
import { WeeklyGoalsPanel } from "./WeeklyGoalsPanel";
import { MetricCarousel } from "./MetricCarousel";
import { HistoryScreen } from "./HistoryScreen";
import "./esportes.css";

// ---------------------------------------------------------------------------
// Visão geral — um painel leve que responde cinco perguntas, nesta ordem:
// começo agora? estou mantendo a constância? qual é a próxima? como está
// evoluindo? o que fiz por último?
//
// O histórico não é mais uma aba: ele abre em tela cheia a partir de "Ver
// todas", porque é consulta, não uma das duas visões principais.
// ---------------------------------------------------------------------------

const modalityIcon = { corrida: Footprints, caminhada: PersonStanding, ciclismo: Bike } as const;
const ANALYSIS_WEEKS = 4;

const nextLabel: Record<SportModality, string> = {
  corrida: "PRÓXIMA CORRIDA",
  caminhada: "PRÓXIMA CAMINHADA",
  ciclismo: "PRÓXIMA PEDALADA",
};

const freeLabel: Record<SportModality, string> = {
  corrida: "Corrida livre",
  caminhada: "Caminhada livre",
  ciclismo: "Pedalada livre",
};

const WEEKDAY_SHORT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

export function OverviewTab({
  modality,
  onOpenPlanning,
}: {
  modality: SportModality;
  /** Leva à aba Planejamento — o histórico deixou de ser aba. */
  onOpenPlanning: () => void;
}) {
  const navigate = useNavigate();
  const profile = useProfile();
  const activities = useSportStore((s) => s.activities);
  const weeklyGoals = useSportStore((s) => s.weeklyGoals);
  const executions = useGoalsStore((s) => s.executions);
  const [goalEditOpen, setGoalEditOpen] = useState(false);
  const [detailActivity, setDetailActivity] = useState<SportActivity | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);

  const today = todayISO();
  const goal = weeklyGoals.find((g) => g.modality === modality);
  const consistency = useMemo(
    () => weekConsistency(activities, goal, modality, today),
    [activities, goal, modality, today],
  );
  const series = useMemo(
    () => weeklyMetricsSeries(activities, modality, ANALYSIS_WEEKS, today),
    [activities, modality, today],
  );
  const next = useMemo(
    () => nextPlannedSportActivity(executions, modality, today),
    [executions, modality, today],
  );
  const [mostRecent] = lastActivities(activities, modality, 1);

  const { data: recentPoints } = useQuery({
    queryKey: ["sport-activity-points", mostRecent?.id],
    queryFn: () => fetchActivityPoints(mostRecent!.id),
    enabled: !!mostRecent && mostRecent.source === "gravado",
  });

  const todayPlanned = next?.isToday ? next : null;
  const Icon = modalityIcon[modality];

  const startFree = () => navigate({ to: "/esportes/gravar", search: { modalidade: modality } });
  const startPlanned = () =>
    navigate({
      to: "/esportes/gravar",
      search: { modalidade: modality, execucao: todayPlanned!.execution.id },
    });

  return (
    <div className="esportes-overview space-y-5">
      <section className="sp-start-card">
        <div className="sp-start-copy">
          <p className="sp-eyebrow">Atividade de hoje</p>
          <h2 className="sp-start-title">
            {todayPlanned ? todayPlanned.execution.title : freeLabel[modality]}
          </h2>
          <p className="sp-start-subtitle">
            {todayPlanned
              ? [
                  todayPlanned.startTime && formatTime(todayPlanned.startTime, profile.timeFormat),
                  plannedTargetLabel(todayPlanned.execution),
                ]
                  .filter(Boolean)
                  .join(" · ") || "Quando estiver pronto, comece."
              : "Quando estiver pronto, comece."}
          </p>
          <p className="sp-start-gps">
            <MapPin aria-hidden /> GPS ao iniciar
          </p>
        </div>
        <button
          onClick={todayPlanned ? startPlanned : startFree}
          className="sp-start-action interactive-press"
          aria-label={modalityActionLabel[modality]}
        >
          Iniciar <ChevronRight aria-hidden />
        </button>
      </section>

      {/* Atividade livre continua a um toque quando hoje tem treino marcado. */}
      {todayPlanned && (
        <button
          onClick={startFree}
          className="-mt-3 block w-full text-left text-[12px] font-semibold"
          style={{ color: "var(--sp-muted)" }}
        >
          Ou começar uma atividade livre
        </button>
      )}

      <div className="sp-rule" />

      {/* 2. sua semana ---------------------------------------------------- */}
      <section>
        <h3 className="sp-section-title">Sua semana</h3>
        <WeeklySummary
          done={consistency.done}
          target={consistency.target}
          modality={modality}
          next={next}
          timeFormat={profile.timeFormat}
          onSetGoal={() => setGoalEditOpen(true)}
          onOpenPlanning={onOpenPlanning}
        />
      </section>

      {/* 3. evolução ------------------------------------------------------ */}
      <MetricCarousel series={series} modality={modality} weeks={ANALYSIS_WEEKS} />

      {/* 4. atividade recente --------------------------------------------- */}
      <section>
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="sp-section-title">
            Última {modality === "ciclismo" ? "pedalada" : modality}
          </h3>
          <button
            onClick={() => setHistoryOpen(true)}
            className="interactive-press flex items-center gap-1 text-[13px] font-medium"
            style={{ color: "var(--sp-muted)" }}
          >
            <span className="sp-history-plus">
              <Plus size={17} />
            </span>
            ver histórico
          </button>
        </div>

        {mostRecent ? (
          <button
            onClick={() => setDetailActivity(mostRecent)}
            className="sp-recent-row interactive-press mt-2 flex w-full items-center gap-3 text-left"
          >
            {mostRecent.source === "manual" ? (
              <div className="sp-recent-map sp-recent-map--manual">
                <Icon className="h-6 w-6" style={{ color: "var(--sp-muted)" }} strokeWidth={1.8} />
              </div>
            ) : (
              <RoutePreview
                points={recentPoints ?? []}
                hideRoute={mostRecent.privacyHideRoute}
                hideStartEnd={mostRecent.privacyHideStartEnd}
                className="sp-recent-map"
              />
            )}
            <div className="sp-recent-copy">
              <p>{formatDistanceKm(mostRecent.distanceM)}</p>
              <span>
                {formatDateBR(mostRecent.startedAt.slice(0, 10))} ·{" "}
                {formatDurationClock(mostRecent.activeDurationS)}
              </span>
              <strong>
                {modality === "ciclismo"
                  ? formatSpeedKmh(mostRecent.avgSpeedKmh ?? null)
                  : formatPace(mostRecent.avgPaceSPerKm ?? null)}
              </strong>
            </div>
            <ChevronRight className="h-4 w-4 shrink-0" style={{ color: "var(--sp-muted)" }} />
          </button>
        ) : (
          <p
            className="sp-recent-row mt-2 text-[13px] leading-relaxed"
            style={{ color: "var(--sp-muted)" }}
          >
            Nenhuma atividade registrada ainda. A primeira aparece aqui assim que você concluir uma.
          </p>
        )}
      </section>

      <div className="sp-rule" />

      <button
        onClick={onOpenPlanning}
        className="sp-plan-next interactive-press"
        style={{ color: "var(--sp-title)" }}
      >
        <CalendarDays size={18} /> Planejar próxima atividade <ArrowRight size={16} />
      </button>

      {goalEditOpen && (
        <Modal title="Metas semanais" onClose={() => setGoalEditOpen(false)}>
          <WeeklyGoalsPanel />
        </Modal>
      )}
      {detailActivity && (
        <ActivityDetailModal activity={detailActivity} onClose={() => setDetailActivity(null)} />
      )}
      {historyOpen && <HistoryScreen modality={modality} onClose={() => setHistoryOpen(false)} />}
    </div>
  );
}

function WeeklySummary({
  done,
  target,
  modality,
  next,
  timeFormat,
  onSetGoal,
  onOpenPlanning,
}: {
  done: number;
  target?: number;
  modality: SportModality;
  next: ReturnType<typeof nextPlannedSportActivity>;
  timeFormat: "12h" | "24h";
  onSetGoal: () => void;
  onOpenPlanning: () => void;
}) {
  const pct = target && target > 0 ? Math.min(1, done / target) : 0;
  const date = next ? new Date(next.dateIso + "T12:00:00") : null;
  const daysAhead = date
    ? Math.round((date.getTime() - new Date(todayISO() + "T12:00:00").getTime()) / 86_400_000)
    : null;
  const when = next
    ? next.isToday
      ? "Hoje"
      : daysAhead !== null && daysAhead <= 6
        ? WEEKDAY_SHORT[date!.getDay()]
        : `${WEEKDAY_SHORT[date!.getDay()]}, ${String(date!.getDate()).padStart(2, "0")}/${String(date!.getMonth() + 1).padStart(2, "0")}`
    : null;
  const time = next?.startTime ? formatTime(next.startTime, timeFormat) : null;

  return (
    <div className="sp-week-summary">
      <div className="sp-week-ring">
        <ProgressRing
          value={target && target > 0 ? pct * 100 : null}
          label="Meta semanal de atividades"
          size={108}
        >
          <strong>
            {done} <small>{target !== undefined ? `de ${target}` : ""}</small>
          </strong>
          <span>{modality === "ciclismo" ? "pedaladas" : `${modality}s`}</span>
        </ProgressRing>
      </div>
      <div className="sp-week-next">
        <div className="sp-week-next-copy">
          <p>
            <CalendarDays aria-hidden />{" "}
            {next ? nextLabel[modality].toLowerCase() : "próxima atividade"}
          </p>
          <strong>{next ? [when, time].filter(Boolean).join(" · ") : "Nada planejado"}</strong>
          <span>
            {next
              ? [next.execution.title, plannedTargetLabel(next.execution)]
                  .filter(Boolean)
                  .join(" · ")
              : "Planeje quando quiser"}
          </span>
        </div>
        <ChevronRight className="sp-week-chevron" aria-hidden />
        <div className="sp-week-actions">
          <button onClick={onSetGoal} className="interactive-press">
            <Pencil /> {target === undefined ? "definir meta" : "editar meta"} <ChevronRight />
          </button>
          <button onClick={onOpenPlanning} className="interactive-press">
            <CalendarDays /> ver planejamento <ChevronRight />
          </button>
        </div>
      </div>
    </div>
  );
}
