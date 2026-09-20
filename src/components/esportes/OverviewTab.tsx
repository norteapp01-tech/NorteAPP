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
      {/* 1. início da atividade — solto no fundo preto, sem card ------------ */}
      <section className="sp-start flex items-center justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] tracking-wide">
            <span className="font-bold" style={{ color: "var(--sp-title)" }}>
              ATIVIDADE
            </span>{" "}
            <span style={{ color: "var(--sp-muted)" }}>DE HOJE</span>
          </p>
          <h2 className="sp-start-title mt-1.5 break-words">
            {todayPlanned ? todayPlanned.execution.title : freeLabel[modality]}
          </h2>
          <p className="mt-1.5 text-[14px] leading-snug" style={{ color: "var(--sp-muted)" }}>
            {todayPlanned
              ? [
                  todayPlanned.startTime && formatTime(todayPlanned.startTime, profile.timeFormat),
                  plannedTargetLabel(todayPlanned.execution),
                ]
                  .filter(Boolean)
                  .join(" · ") || "Quando estiver pronto, comece."
              : "Quando estiver pronto, comece."}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-center gap-2">
          <button
            onClick={todayPlanned ? startPlanned : startFree}
            className="sp-play interactive-press"
            aria-label={modalityActionLabel[modality]}
          >
            <svg viewBox="0 0 24 24" aria-hidden>
              <path d="M8 5v14l11-7z" />
            </svg>
          </button>
          <span className="text-[13px] font-semibold" style={{ color: "var(--sp-accent)" }}>
            {modalityActionLabel[modality]}
          </span>
        </div>
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
        <div className="mt-2.5 grid grid-cols-2 gap-3">
          <ConsistencyCard
            done={consistency.done}
            target={consistency.target}
            onSetGoal={() => setGoalEditOpen(true)}
          />
          <NextActivityCard
            modality={modality}
            next={next}
            timeFormat={profile.timeFormat}
            onOpenPlanning={onOpenPlanning}
          />
        </div>
      </section>

      {/* 3. evolução ------------------------------------------------------ */}
      <section>
        <h3 className="sp-section-title">Evolução</h3>
        <div className="mt-1.5">
          <MetricCarousel series={series} modality={modality} weeks={ANALYSIS_WEEKS} />
        </div>
      </section>

      {/* 4. atividade recente --------------------------------------------- */}
      <section>
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="sp-section-title">Atividade recente</h3>
          <button
            onClick={() => setHistoryOpen(true)}
            className="interactive-press flex items-center gap-1 text-[13px] font-medium"
            style={{ color: "var(--sp-muted)" }}
          >
            Ver todas <ArrowRight size={14} />
          </button>
        </div>

        {mostRecent ? (
          <button
            onClick={() => setDetailActivity(mostRecent)}
            className="sp-recent-row interactive-press mt-2 flex w-full items-center gap-3 text-left"
          >
            {mostRecent.source === "manual" ? (
              <div
                className="flex h-[70px] w-[104px] shrink-0 items-center justify-center rounded-xl"
                style={{ background: "var(--sp-card)" }}
              >
                <Icon className="h-6 w-6" style={{ color: "var(--sp-accent)" }} strokeWidth={1.8} />
              </div>
            ) : (
              <RoutePreview
                points={recentPoints ?? []}
                hideRoute={mostRecent.privacyHideRoute}
                hideStartEnd={mostRecent.privacyHideStartEnd}
                className="h-[70px] w-[104px] shrink-0"
              />
            )}
            <div className="min-w-0 flex-1">
              <p className="text-[21px] font-bold" style={{ color: "var(--sp-accent)" }}>
                {formatDistanceKm(mostRecent.distanceM)}
              </p>
              <p className="truncate text-[13px]" style={{ color: "var(--sp-muted)" }}>
                {formatDateBR(mostRecent.startedAt.slice(0, 10))} ·{" "}
                {formatDurationClock(mostRecent.activeDurationS)}
              </p>
            </div>
            <span className="shrink-0 text-[13px] font-medium" style={{ color: "var(--sp-title)" }}>
              {modality === "ciclismo"
                ? formatSpeedKmh(mostRecent.avgSpeedKmh ?? null)
                : formatPace(mostRecent.avgPaceSPerKm ?? null)}
            </span>
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
        className="interactive-press flex w-full items-center justify-end gap-1.5 text-[14px] font-medium"
        style={{ color: "var(--sp-title)" }}
      >
        Planejar próxima atividade <ArrowRight size={16} />
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

// ---------------------------------------------------------------------------
// Card 1 — consistência
// ---------------------------------------------------------------------------

function ConsistencyCard({
  done,
  target,
  onSetGoal,
}: {
  done: number;
  target?: number;
  onSetGoal: () => void;
}) {
  // Sem meta não existe denominador: o card mostra o realizado e oferece
  // definir a meta, em vez de inventar um "de 3".
  const pct = target && target > 0 ? Math.min(1, done / target) : 0;

  return (
    <div className="sp-card sp-week-card flex flex-col items-center justify-center gap-1.5 px-3 py-3">
      <ProgressRing
        value={target && target > 0 ? pct * 100 : null}
        label="Meta semanal de atividades"
        size={88}
      >
        <strong>{target !== undefined ? `${done}/${target}` : done}</strong>
        <small>atividades</small>
      </ProgressRing>
      {target !== undefined ? (
        <p className="text-[11px]" style={{ color: "var(--sp-muted)" }}>
          meta semanal
        </p>
      ) : (
        <button
          onClick={onSetGoal}
          className="interactive-press text-[11px] font-semibold"
          style={{ color: "var(--sp-accent)" }}
        >
          Definir meta semanal
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Card 2 — próxima atividade
// ---------------------------------------------------------------------------

function NextActivityCard({
  modality,
  next,
  timeFormat,
  onOpenPlanning,
}: {
  modality: SportModality;
  next: ReturnType<typeof nextPlannedSportActivity>;
  timeFormat: "12h" | "24h";
  onOpenPlanning: () => void;
}) {
  const Icon = modalityIcon[modality];

  if (!next) {
    return (
      <div className="sp-card sp-week-card flex flex-col justify-between gap-2 p-3.5">
        <p className="text-[10px] font-semibold tracking-wide" style={{ color: "var(--sp-muted)" }}>
          {nextLabel[modality]}
        </p>
        <p className="text-[15px] font-bold leading-snug" style={{ color: "var(--sp-title)" }}>
          Nenhuma {modality === "ciclismo" ? "pedalada" : modality} planejada
        </p>
        <button
          onClick={onOpenPlanning}
          className="interactive-press flex items-center gap-1 text-[13px] font-semibold"
          style={{ color: "var(--sp-accent)" }}
        >
          Planejar {modality === "ciclismo" ? "pedalada" : modality} <ArrowRight size={14} />
        </button>
      </div>
    );
  }

  const date = new Date(next.dateIso + "T12:00:00");
  // Dentro da própria semana o dia já identifica sozinho ("Sáb"); repetir a
  // data aí só fazia a linha quebrar em duas e empurrar o resto do card.
  const daysAhead = Math.round(
    (date.getTime() - new Date(todayISO() + "T12:00:00").getTime()) / 86_400_000,
  );
  const when = next.isToday
    ? "Hoje"
    : daysAhead <= 6
      ? WEEKDAY_SHORT[date.getDay()]
      : `${WEEKDAY_SHORT[date.getDay()]}, ${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}`;
  const time = next.startTime ? formatTime(next.startTime, timeFormat) : null;
  const target = plannedTargetLabel(next.execution);

  return (
    <div className="sp-card sp-week-card flex flex-col justify-between gap-1.5 p-3.5">
      <p className="text-[10px] font-semibold tracking-wide" style={{ color: "var(--sp-muted)" }}>
        {nextLabel[modality]}
      </p>
      <div className="flex items-start gap-2">
        <span className="relative mt-0.5 shrink-0" aria-hidden>
          <CalendarDays size={26} strokeWidth={1.6} style={{ color: "var(--sp-muted)" }} />
          <Icon
            size={12}
            strokeWidth={2}
            className="absolute left-1/2 top-[13px] -translate-x-1/2"
            style={{ color: "var(--sp-title)" }}
          />
        </span>
        <div className="min-w-0">
          <p className="text-[17px] font-bold leading-tight" style={{ color: "var(--sp-title)" }}>
            {[when, time].filter(Boolean).join(", ")}
          </p>
          {/* Duas linhas em vez de cortar: "Corrida leve · 5 ..." escondia
              justamente o objetivo do treino. */}
          <p className="line-clamp-2 text-[12px] leading-snug" style={{ color: "var(--sp-muted)" }}>
            {[next.execution.title, target].filter(Boolean).join(" · ")}
          </p>
        </div>
      </div>
      <button
        onClick={onOpenPlanning}
        className="interactive-press flex items-center gap-1 text-[13px] font-semibold"
        style={{ color: "var(--sp-accent)" }}
      >
        Ver planejamento <ArrowRight size={14} />
      </button>
    </div>
  );
}
