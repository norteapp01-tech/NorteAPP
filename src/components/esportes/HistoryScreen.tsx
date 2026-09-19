import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Plus, Footprints, PersonStanding, Bike } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { FullScreenSheet } from "@/components/ui/modal";
import { WeekdaySelector } from "@/components/ui/app-design-system";
import { formatDateBR, todayISO } from "@/lib/goals-store";
import {
  useSportStore,
  fetchActivityPoints,
  formatDistanceKm,
  formatDurationClock,
  formatPace,
  formatSpeedKmh,
  mondayOfWeek,
  modalityLabel,
  type SportActivity,
  type SportModality,
} from "@/lib/sport-store";
import {
  activitiesInWeek,
  activitiesOnWeekday,
  addDaysIso,
  weekEndOf,
  weekdaysWithActivity,
} from "@/lib/sport-analytics";
import { RoutePreview } from "./RoutePreview";
import { ActivityDetailModal } from "./ActivityDetailModal";
import { ManualEntryModal } from "./ManualEntryModal";

// ---------------------------------------------------------------------------
// Histórico — tela cheia, aberta por "Ver todas".
//
// Deixou de ser a terceira aba do topo: histórico é consulta, não uma das duas
// visões principais. Em compensação ganhou o que faltava — navegação por
// semana e filtro por dia, no mesmo seletor Seg–Dom usado no resto do Norte.
//
// O estado padrão é a SEMANA inteira. Tocar num dia filtra; tocar de novo no
// mesmo dia (ou em "Ver a semana inteira") volta ao padrão. Sem isso, escolher
// um dia viraria um beco sem saída.
// ---------------------------------------------------------------------------

const modalityIcon = { corrida: Footprints, caminhada: PersonStanding, ciclismo: Bike } as const;
/** Ordem oficial do Norte: a semana começa na segunda e domingo fecha. */
const WEEK_ITEMS = [
  { day: 1, label: "Seg" },
  { day: 2, label: "Ter" },
  { day: 3, label: "Qua" },
  { day: 4, label: "Qui" },
  { day: 5, label: "Sex" },
  { day: 6, label: "Sáb" },
  { day: 0, label: "Dom" },
] as const;

export function HistoryScreen({
  modality,
  onClose,
}: {
  modality: SportModality;
  onClose: () => void;
}) {
  const activities = useSportStore((s) => s.activities);
  const today = todayISO();
  const [weekStart, setWeekStart] = useState(() => mondayOfWeek(today));
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [detail, setDetail] = useState<SportActivity | null>(null);
  const [manualOpen, setManualOpen] = useState(false);

  const weekActivities = useMemo(
    () => activitiesInWeek(activities, modality, weekStart),
    [activities, modality, weekStart],
  );
  const daysWithActivity = useMemo(
    () => weekdaysWithActivity(weekActivities, weekStart),
    [weekActivities, weekStart],
  );
  const visible =
    selectedDay === null
      ? weekActivities
      : activitiesOnWeekday(weekActivities, weekStart, selectedDay);

  const weekEnd = weekEndOf(weekStart);
  const isCurrentWeek = weekStart === mondayOfWeek(today);

  const shiftWeek = (delta: number) => {
    setWeekStart((w) => addDaysIso(w, delta * 7));
    setSelectedDay(null);
  };

  /** Data real de cada coluna do seletor — o usuário precisa ver o dia, não
   * só a inicial. */
  const dateOfDay = (day: number) => addDaysIso(weekStart, day === 0 ? 6 : day - 1);

  return (
    <FullScreenSheet
      onClose={onClose}
      title="Histórico"
      action={
        <button
          onClick={() => setManualOpen(true)}
          aria-label="Registrar atividade manualmente"
          className="interactive-press -m-2 rounded-full p-2 text-primary"
        >
          <Plus className="h-6 w-6" />
        </button>
      }
    >
      {/* Navegação entre semanas */}
      <div className="flex items-center justify-between gap-2 py-1">
        <button
          onClick={() => shiftWeek(-1)}
          aria-label="Semana anterior"
          className="interactive-press rounded-full p-2 text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <p className="text-sm font-semibold">
          {formatDateBR(weekStart)} — {formatDateBR(weekEnd)}
          {isCurrentWeek && (
            <span className="ml-1.5 text-[11px] font-normal text-muted-foreground">
              (esta semana)
            </span>
          )}
        </p>
        <button
          onClick={() => shiftWeek(1)}
          disabled={isCurrentWeek}
          aria-label="Próxima semana"
          className="interactive-press rounded-full p-2 text-muted-foreground hover:text-foreground disabled:opacity-30"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      <div className="mt-2">
        <WeekdaySelector
          items={WEEK_ITEMS}
          selectedDay={selectedDay ?? undefined}
          currentDay={isCurrentWeek ? new Date(today + "T12:00:00").getDay() : -1}
          onSelect={(day) => setSelectedDay((v) => (v === day ? null : day))}
          primary={(day) => Number(dateOfDay(day).slice(8, 10))}
          secondary={(day) => (
            <span
              aria-hidden
              className={`mx-auto block h-1 w-1 rounded-full ${
                daysWithActivity.has(day) ? "bg-primary" : "bg-transparent"
              }`}
            />
          )}
        />
      </div>

      {selectedDay !== null && (
        <button
          onClick={() => setSelectedDay(null)}
          className="interactive-press mt-2 text-[11px] font-semibold text-primary"
        >
          Ver a semana inteira
        </button>
      )}

      {/* Lista */}
      <div className="mt-4 space-y-2">
        {visible.length === 0 ? (
          <p className="py-6 text-center text-sm leading-relaxed text-muted-foreground">
            {selectedDay === null
              ? `Nenhuma ${modalityLabel[modality].toLowerCase()} registrada nesta semana.`
              : `Nenhuma ${modalityLabel[modality].toLowerCase()} em ${formatDateBR(dateOfDay(selectedDay))}.`}
          </p>
        ) : (
          visible.map((activity) => (
            <ActivityRow
              key={activity.id}
              activity={activity}
              modality={modality}
              onOpen={() => setDetail(activity)}
            />
          ))
        )}
      </div>

      {detail && <ActivityDetailModal activity={detail} onClose={() => setDetail(null)} />}
      {manualOpen && (
        <ManualEntryModal defaultModality={modality} onClose={() => setManualOpen(false)} />
      )}
    </FullScreenSheet>
  );
}

function ActivityRow({
  activity,
  modality,
  onOpen,
}: {
  activity: SportActivity;
  modality: SportModality;
  onOpen: () => void;
}) {
  const Icon = modalityIcon[activity.modality];
  const { data: points } = useQuery({
    queryKey: ["sport-activity-points", activity.id],
    queryFn: () => fetchActivityPoints(activity.id),
    enabled: activity.source === "gravado",
  });

  return (
    <button
      onClick={onOpen}
      className="card-surface interactive-press flex w-full items-center gap-3 p-3 text-left"
    >
      {activity.source === "manual" ? (
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-surface-2">
          <Icon className="h-5 w-5 text-primary" strokeWidth={1.8} />
        </div>
      ) : (
        <RoutePreview
          points={points ?? []}
          hideRoute={activity.privacyHideRoute}
          hideStartEnd={activity.privacyHideStartEnd}
          className="h-14 w-14 shrink-0"
        />
      )}
      <div className="min-w-0 flex-1">
        <p className="text-base font-bold text-primary">{formatDistanceKm(activity.distanceM)}</p>
        <p className="truncate text-[11px] text-muted-foreground">
          {modalityLabel[activity.modality]} · {formatDateBR(activity.startedAt.slice(0, 10))} ·{" "}
          {formatDurationClock(activity.activeDurationS)}
        </p>
      </div>
      <span className="shrink-0 text-xs font-medium">
        {modality === "ciclismo"
          ? formatSpeedKmh(activity.avgSpeedKmh ?? null)
          : formatPace(activity.avgPaceSPerKm ?? null)}
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
    </button>
  );
}
