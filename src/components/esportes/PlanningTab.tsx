import { useState } from "react";
import { ChevronLeft, ChevronRight, Plus, Trash2 } from "lucide-react";
import { WeekdaySelector } from "@/components/ui/app-design-system";
import { SavedRoutesSection } from "./SavedRoutes";
import { weekdayLabels } from "@/components/sub-agenda-shared";
import { Modal } from "@/components/ui/modal";
import { startOfWeekLocal } from "@/lib/format-utils";
import {
  useGoalsStore,
  createExecution,
  createRoutine,
  removeExecution,
  patchExecution,
  updateRoutineAndFutureExecutions,
  todayISO,
  type Execution,
} from "@/lib/goals-store";
import {
  modalityLabel,
  formatDistanceKm,
  formatDurationClock,
  type SportModality,
} from "@/lib/sport-store";

const monthAbbrev = [
  "jan",
  "fev",
  "mar",
  "abr",
  "mai",
  "jun",
  "jul",
  "ago",
  "set",
  "out",
  "nov",
  "dez",
];
const weekdaysLong = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

function pad(n: number) {
  return String(n).padStart(2, "0");
}
function toISODate(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function formatLongDate(iso: string) {
  const d = new Date(iso + "T00:00:00");
  return `${weekdaysLong[d.getDay()]}, ${d.getDate()} de ${monthAbbrev[d.getMonth()].replace(/^./, (c) => c.toUpperCase())}`;
}
function formatWeekRangeLabel(start: Date, end: Date) {
  if (start.getMonth() === end.getMonth()) {
    return `${start.getDate()}–${end.getDate()} ${monthAbbrev[start.getMonth()]}`;
  }
  return `${start.getDate()} ${monthAbbrev[start.getMonth()]} – ${end.getDate()} ${monthAbbrev[end.getMonth()]}`;
}

/** Semana real (segunda a domingo), sempre calculada a partir de um cursor —
 * substitui o antigo `dateForWeekday`, que na prática buscava "a próxima
 * ocorrência desse dia da semana a partir de hoje" e por isso misturava
 * datas de duas semanas diferentes dependendo de que dia da semana era hoje. */
function useWeekCursor(initial: string) {
  const [cursor, setCursor] = useState(() => new Date(initial + "T00:00:00"));
  const weekStart = startOfWeekLocal(cursor, "monday");
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);
  const datesByWeekday: Record<number, Date> = {};
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    datesByWeekday[d.getDay()] = d;
  }
  const shift = (weeks: number) => {
    const next = new Date(cursor);
    next.setDate(next.getDate() + weeks * 7);
    setCursor(next);
  };
  return { weekStart, weekEnd, datesByWeekday, shift };
}

export function PlanningTab({ modality }: { modality: SportModality }) {
  const executions = useGoalsStore((s) => s.executions);
  const today = todayISO();
  const { weekStart, weekEnd, datesByWeekday, shift } = useWeekCursor(today);
  const [selectedDate, setSelectedDate] = useState(today);
  const [addingOpen, setAddingOpen] = useState(false);
  const [editing, setEditing] = useState<Execution | null>(null);

  const plannedFor = (date: string) =>
    executions.filter(
      (e) =>
        e.category === "esportes" &&
        e.sportModality === modality &&
        e.status === "planejada" &&
        e.agendaDate === date,
    );

  const selectedInThisWeek = Object.values(datesByWeekday).some(
    (d) => toISODate(d) === selectedDate,
  );
  const todayInThisWeek = Object.values(datesByWeekday).some((d) => toISODate(d) === today);

  const dayItems = plannedFor(selectedDate);

  return (
    <div className="space-y-5">
      <div className="card-surface p-4">
        <div className="flex items-center justify-between">
          <button
            onClick={() => shift(-1)}
            aria-label="Semana anterior"
            className="interactive-press rounded-full p-1.5 text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <p className="text-sm font-semibold">{formatWeekRangeLabel(weekStart, weekEnd)}</p>
          <button
            onClick={() => shift(1)}
            aria-label="Próxima semana"
            className="interactive-press rounded-full p-1.5 text-muted-foreground hover:text-foreground"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-3">
          <WeekdaySelector
            selectedDay={
              selectedInThisWeek ? new Date(selectedDate + "T00:00:00").getDay() : undefined
            }
            currentDay={todayInThisWeek ? new Date(today + "T00:00:00").getDay() : -1}
            onSelect={(day) => setSelectedDate(toISODate(datesByWeekday[day]))}
            primary={(day) => datesByWeekday[day].getDate()}
            secondary={(day) => (plannedFor(toISODate(datesByWeekday[day])).length > 0 ? "●" : "—")}
          />
        </div>
      </div>

      <div>
        <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
          {formatLongDate(selectedDate)}
        </h3>
        <div className="space-y-2">
          {dayItems.map((e) => (
            <button
              key={e.id}
              onClick={() => setEditing(e)}
              className="flex w-full items-center gap-2 rounded-lg border border-border bg-surface-2 p-3 text-left hover:border-primary/40"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">
                  {modalityLabel[e.sportModality ?? modality]}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {e.startTime ? `${e.startTime} · ` : ""}
                  {e.sportTargetDistanceM
                    ? formatDistanceKm(e.sportTargetDistanceM)
                    : e.sportTargetDurationS
                      ? formatDurationClock(e.sportTargetDurationS)
                      : "Sem objetivo"}
                  {e.how ? ` · ${e.how}` : ""}
                </p>
              </div>
            </button>
          ))}
          {dayItems.length === 0 && (
            <p className="text-sm text-muted-foreground">Nada planejado neste dia.</p>
          )}
          <button
            onClick={() => setAddingOpen(true)}
            className="flex w-full items-center justify-center gap-1 rounded-xl border border-dashed border-border py-2.5 text-xs text-muted-foreground hover:border-primary/40 hover:text-primary"
          >
            <Plus className="h-3 w-3" /> Adicionar atividade
          </button>
        </div>
      </div>

      <SavedRoutesSection modality={modality} />

      {addingOpen && (
        <ActivityFormModal
          modality={modality}
          initialDate={selectedDate}
          datesByWeekday={datesByWeekday}
          onClose={() => setAddingOpen(false)}
        />
      )}
      {editing && (
        <ActivityFormModal
          modality={modality}
          initialDate={editing.agendaDate ?? selectedDate}
          datesByWeekday={datesByWeekday}
          existing={editing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

type Objective = "nenhum" | "distancia" | "duracao";
type CopyMode = "copiar" | "repetir";

function ActivityFormModal({
  modality,
  initialDate,
  datesByWeekday,
  existing,
  onClose,
}: {
  modality: SportModality;
  initialDate: string;
  datesByWeekday: Record<number, Date>;
  existing?: Execution;
  onClose: () => void;
}) {
  const isEditing = !!existing;
  const [activityModality, setActivityModality] = useState<SportModality>(
    existing?.sportModality ?? modality,
  );
  const [date, setDate] = useState(initialDate);
  const [time, setTime] = useState(existing?.startTime ?? "");
  const [objective, setObjective] = useState<Objective>(
    existing?.sportTargetDistanceM
      ? "distancia"
      : existing?.sportTargetDurationS
        ? "duracao"
        : "nenhum",
  );
  const [distanceKm, setDistanceKm] = useState(
    existing?.sportTargetDistanceM ? String(existing.sportTargetDistanceM / 1000) : "",
  );
  const [durationMin, setDurationMin] = useState(
    existing?.sportTargetDurationS ? String(existing.sportTargetDurationS / 60) : "",
  );
  const [note, setNote] = useState(existing?.how ?? "");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [copyMode, setCopyMode] = useState<CopyMode>("copiar");
  const [selectedDays, setSelectedDays] = useState<Set<number>>(
    () => new Set([new Date(initialDate + "T00:00:00").getDay()]),
  );
  const [editScope, setEditScope] = useState<"esta" | "futuras">("esta");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const toggleDay = (d: number) => {
    setSelectedDays((prev) => {
      const next = new Set(prev);
      if (next.has(d)) next.delete(d);
      else next.add(d);
      return next;
    });
  };

  const repeatNeedsTime = !isEditing && advancedOpen && copyMode === "repetir" && !time.trim();

  const save = async () => {
    if (repeatNeedsTime || saving) {
      if (repeatNeedsTime)
        setError("Repetição semanal precisa de um horário — preencha antes de repetir.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const sportTargetDistanceM =
        objective === "distancia" && distanceKm.trim()
          ? Math.round((parseFloat(distanceKm) || 0) * 1000)
          : undefined;
      const sportTargetDurationS =
        objective === "duracao" && durationMin.trim()
          ? Math.round((parseFloat(durationMin) || 0) * 60)
          : undefined;

      if (isEditing && existing) {
        if (existing.routineId && editScope === "futuras") {
          await updateRoutineAndFutureExecutions(
            existing.routineId,
            {
              time: time.trim() || undefined,
              how: note || undefined,
              sportTargetDistanceM,
              sportTargetDurationS,
            },
            existing.agendaDate ?? date,
          );
        } else {
          await patchExecution(existing.id, {
            agendaDate: date,
            startTime: time.trim() || undefined,
            sportTargetDistanceM,
            sportTargetDurationS,
            how: note || undefined,
          });
        }
      } else if (advancedOpen && copyMode === "repetir" && selectedDays.size > 0) {
        for (const d of selectedDays) {
          await createRoutine({
            category: "esportes",
            title: `${modalityLabel[activityModality]} planejada`,
            weekday: d,
            time,
            how: note || undefined,
            sportModality: activityModality,
            sportTargetDistanceM,
            sportTargetDurationS,
          });
        }
      } else {
        const targetDays =
          advancedOpen && selectedDays.size > 0
            ? selectedDays
            : new Set([new Date(date + "T00:00:00").getDay()]);
        for (const d of targetDays) {
          const targetDate = datesByWeekday[d] ? toISODate(datesByWeekday[d]) : date;
          await createExecution({
            title: `${modalityLabel[activityModality]} planejada`,
            dueDate: targetDate,
            agendaDate: targetDate,
            startTime: time.trim() || undefined,
            category: "esportes",
            sportModality: activityModality,
            sportTargetDistanceM,
            sportTargetDurationS,
            how: note || undefined,
          });
        }
      }
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!existing) return;
    await removeExecution(existing.id);
    onClose();
  };

  return (
    <Modal title={isEditing ? "Editar atividade" : "Adicionar atividade"} onClose={onClose}>
      <div className="space-y-2.5">
        <div className="flex flex-wrap gap-1.5">
          {(Object.keys(modalityLabel) as SportModality[]).map((m) => (
            <button
              key={m}
              onClick={() => setActivityModality(m)}
              className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${activityModality === m ? "bg-primary text-primary-foreground" : "border border-border bg-surface text-muted-foreground"}`}
            >
              {modalityLabel[m]}
            </button>
          ))}
        </div>

        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
        />
        <input
          type="time"
          value={time}
          onChange={(e) => setTime(e.target.value)}
          placeholder="Horário (opcional)"
          className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
        />
        <div className="flex gap-1.5">
          {(
            [
              ["nenhum", "Sem objetivo"],
              ["distancia", "Distância"],
              ["duracao", "Duração"],
            ] as [Objective, string][]
          ).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setObjective(key)}
              className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${objective === key ? "bg-primary text-primary-foreground" : "border border-border bg-surface text-muted-foreground"}`}
            >
              {label}
            </button>
          ))}
        </div>
        {objective === "distancia" && (
          <input
            type="number"
            step="0.1"
            value={distanceKm}
            onChange={(e) => setDistanceKm(e.target.value)}
            placeholder="km"
            className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
          />
        )}
        {objective === "duracao" && (
          <input
            type="number"
            value={durationMin}
            onChange={(e) => setDurationMin(e.target.value)}
            placeholder="minutos"
            className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
          />
        )}
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Observação (opcional)"
          className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
        />

        {isEditing && existing?.routineId && (
          <div className="rounded-lg border border-border bg-surface-2 p-2.5">
            <p className="mb-1.5 text-[11px] font-semibold text-muted-foreground">
              Esta atividade faz parte de uma repetição semanal
            </p>
            <div className="flex gap-1.5">
              {(
                [
                  ["esta", "Só esta atividade"],
                  ["futuras", "Esta e as futuras"],
                ] as [typeof editScope, string][]
              ).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setEditScope(key)}
                  className={`flex-1 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold ${editScope === key ? "bg-primary text-primary-foreground" : "border border-border text-muted-foreground"}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}

        {!isEditing && (
          <div className="rounded-lg border border-border p-2.5">
            <button
              onClick={() => setAdvancedOpen((v) => !v)}
              className="text-[11px] font-semibold text-muted-foreground"
            >
              {advancedOpen ? "▾" : "▸"} Copiar ou repetir em mais dias
            </button>
            {advancedOpen && (
              <div className="mt-2 space-y-2">
                <div className="flex gap-1.5">
                  {(
                    [
                      ["copiar", "Copiar para esses dias"],
                      ["repetir", "Repetir toda semana"],
                    ] as [CopyMode, string][]
                  ).map(([key, label]) => (
                    <button
                      key={key}
                      onClick={() => setCopyMode(key)}
                      className={`flex-1 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold ${copyMode === key ? "bg-primary text-primary-foreground" : "border border-border text-muted-foreground"}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {weekdayLabels.map((l, i) => (
                    <button
                      key={l}
                      onClick={() => toggleDay(i)}
                      className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${selectedDays.has(i) ? "bg-primary text-primary-foreground" : "border border-border bg-surface text-muted-foreground"}`}
                    >
                      {l}
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => setSelectedDays(new Set([0, 1, 2, 3, 4, 5, 6]))}
                  className="text-[11px] text-primary"
                >
                  Selecionar todos
                </button>
                {copyMode === "copiar" && (
                  <p className="text-[10px] text-muted-foreground">
                    Cria uma atividade avulsa em cada dia selecionado, só nesta semana.
                  </p>
                )}
                {copyMode === "repetir" && (
                  <p className="text-[10px] text-muted-foreground">
                    Cria uma repetição semanal nos dias selecionados, toda semana a partir de agora.
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {error && <p className="text-xs text-danger">{error}</p>}

        <button
          disabled={saving}
          onClick={save}
          className="w-full rounded-lg bg-primary py-2 text-xs font-semibold text-primary-foreground disabled:opacity-60"
        >
          {saving ? "Salvando…" : "Salvar"}
        </button>

        {isEditing && (
          <>
            {confirmDelete ? (
              <div className="rounded-lg border border-danger/30 bg-danger/10 p-2.5">
                <p className="text-xs">Excluir esta atividade planejada?</p>
                <div className="mt-2 flex gap-2">
                  <button
                    onClick={remove}
                    className="flex-1 rounded-lg bg-danger py-1.5 text-xs font-semibold text-white"
                  >
                    Excluir
                  </button>
                  <button
                    onClick={() => setConfirmDelete(false)}
                    className="flex-1 rounded-lg border border-border py-1.5 text-xs font-semibold"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setConfirmDelete(true)}
                className="flex w-full items-center justify-center gap-1.5 text-xs font-semibold text-danger"
              >
                <Trash2 className="h-3.5 w-3.5" /> Excluir
              </button>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
