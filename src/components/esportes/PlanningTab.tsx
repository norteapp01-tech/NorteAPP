import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { WeekdaySelector } from "@/components/ui/app-design-system";
import { Card, weekdayLabels } from "@/components/sub-agenda-shared";
import { Modal } from "@/components/ui/modal";
import {
  useGoalsStore,
  createExecution,
  createRoutine,
  removeExecution,
  todayISO,
  type Execution,
} from "@/lib/goals-store";
import {
  modalityLabel,
  formatDistanceKm,
  formatDurationClock,
  type SportModality,
} from "@/lib/sport-store";

function dateForWeekday(weekday: number): string {
  const today = new Date(todayISO() + "T00:00:00");
  const todayWeekday = today.getDay();
  const diff = weekday - todayWeekday;
  const target = new Date(today);
  target.setDate(target.getDate() + diff + (diff < 0 ? 7 : 0));
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${target.getFullYear()}-${pad(target.getMonth() + 1)}-${pad(target.getDate())}`;
}

export function PlanningTab({ modality }: { modality: SportModality }) {
  const executions = useGoalsStore((s) => s.executions);
  const [pickerDay, setPickerDay] = useState<number | null>(null);

  const plannedFor = (weekday: number) => {
    const date = dateForWeekday(weekday);
    return executions.filter(
      (e) =>
        e.category === "esportes" &&
        e.sportModality === modality &&
        e.status === "planejada" &&
        e.agendaDate === date,
    );
  };

  return (
    <div className="space-y-5">
      <Card title="Semana">
        <WeekdaySelector
          onSelect={setPickerDay}
          primary={(weekday) => {
            const items = plannedFor(weekday);
            return items.length > 0 ? String(items.length) : "—";
          }}
        />
      </Card>

      {pickerDay !== null && (
        <DayModal
          weekday={pickerDay}
          modality={modality}
          items={plannedFor(pickerDay)}
          onClose={() => setPickerDay(null)}
        />
      )}
    </div>
  );
}

function DayModal({
  weekday,
  modality,
  items,
  onClose,
}: {
  weekday: number;
  modality: SportModality;
  items: Execution[];
  onClose: () => void;
}) {
  const [adding, setAdding] = useState(false);

  return (
    <Modal title={weekdayLabels[weekday]} onClose={onClose}>
      <div className="space-y-2">
        {items.map((e) => (
          <div
            key={e.id}
            className="flex items-center gap-2 rounded-lg border border-border bg-surface-2 p-3"
          >
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">{modalityLabel[e.sportModality ?? modality]}</p>
              <p className="text-[11px] text-muted-foreground">
                {e.startTime ? `${e.startTime} · ` : ""}
                {e.sportTargetDistanceM
                  ? formatDistanceKm(e.sportTargetDistanceM)
                  : e.sportTargetDurationS
                    ? formatDurationClock(e.sportTargetDurationS)
                    : "Sem objetivo"}
              </p>
            </div>
            <button
              onClick={() => removeExecution(e.id)}
              aria-label="Remover atividade planejada"
              className="shrink-0 text-muted-foreground hover:text-danger"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
        {items.length === 0 && !adding && (
          <p className="text-sm text-muted-foreground">Nada planejado neste dia.</p>
        )}
        {!adding ? (
          <button
            onClick={() => setAdding(true)}
            className="flex w-full items-center justify-center gap-1 rounded-xl border border-dashed border-border py-2.5 text-xs text-muted-foreground hover:border-primary/40 hover:text-primary"
          >
            <Plus className="h-3 w-3" /> Adicionar atividade
          </button>
        ) : (
          <AddActivityForm
            weekday={weekday}
            defaultModality={modality}
            onDone={() => setAdding(false)}
          />
        )}
      </div>
    </Modal>
  );
}

type Objective = "nenhum" | "distancia" | "duracao";

function AddActivityForm({
  weekday,
  defaultModality,
  onDone,
}: {
  weekday: number;
  defaultModality: SportModality;
  onDone: () => void;
}) {
  const [modality, setModality] = useState<SportModality>(defaultModality);
  const [time, setTime] = useState("");
  const [objective, setObjective] = useState<Objective>("nenhum");
  const [distanceKm, setDistanceKm] = useState("");
  const [durationMin, setDurationMin] = useState("");
  const [note, setNote] = useState("");
  const [repeat, setRepeat] = useState(false);
  const [selectedDays, setSelectedDays] = useState<Set<number>>(new Set([weekday]));
  const [saving, setSaving] = useState(false);

  const toggleDay = (d: number) => {
    setSelectedDays((prev) => {
      const next = new Set(prev);
      if (next.has(d)) next.delete(d);
      else next.add(d);
      return next;
    });
  };

  const save = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const sportTargetDistanceM =
        objective === "distancia" && distanceKm.trim()
          ? Math.round((parseFloat(distanceKm) || 0) * 1000)
          : undefined;
      const sportTargetDurationS =
        objective === "duracao" && durationMin.trim()
          ? Math.round((parseFloat(durationMin) || 0) * 60)
          : undefined;

      if (repeat && selectedDays.size > 0) {
        for (const d of selectedDays) {
          await createRoutine({
            category: "esportes",
            title: `${modalityLabel[modality]} planejada`,
            weekday: d,
            time: time || "07:00",
            sportModality: modality,
            sportTargetDistanceM,
            sportTargetDurationS,
          });
        }
      } else {
        const date = dateForWeekday(weekday);
        await createExecution({
          title: `${modalityLabel[modality]} planejada`,
          dueDate: date,
          agendaDate: date,
          startTime: time || undefined,
          category: "esportes",
          sportModality: modality,
          sportTargetDistanceM,
          sportTargetDurationS,
          how: note || undefined,
        });
      }
      onDone();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-2 rounded-xl border border-border bg-surface-2 p-3">
      <div className="flex flex-wrap gap-1.5">
        {(Object.keys(modalityLabel) as SportModality[]).map((m) => (
          <button
            key={m}
            onClick={() => setModality(m)}
            className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${modality === m ? "bg-primary text-primary-foreground" : "border border-border bg-surface text-muted-foreground"}`}
          >
            {modalityLabel[m]}
          </button>
        ))}
      </div>
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

      <label className="flex items-center gap-2 text-xs text-muted-foreground">
        <input type="checkbox" checked={repeat} onChange={(e) => setRepeat(e.target.checked)} />
        Repetir em mais dias
      </label>
      {repeat && (
        <div className="space-y-1.5">
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
        </div>
      )}

      <button
        disabled={saving}
        onClick={save}
        className="w-full rounded-lg bg-primary py-2 text-xs font-semibold text-primary-foreground disabled:opacity-60"
      >
        {saving ? "Salvando…" : "Salvar"}
      </button>
    </div>
  );
}
