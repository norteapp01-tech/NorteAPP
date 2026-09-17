import { useState } from "react";
import { CalendarClock } from "lucide-react";
import { WeekdaySelector } from "@/components/ui/app-design-system";
import { Modal } from "@/components/ui/modal";
import { InlineError } from "@/components/ui/inline-error";
import { useAsyncAction } from "@/hooks/use-async-action";
import { weekVisualOrder, weekVisualLabels } from "@/components/sub-agenda-shared";
import { setBlockDay, type BlockDay } from "@/lib/workout-cycle-store";
import type { WorkoutPlan } from "@/lib/workout-store";

export function StageWeek({
  blockId,
  days,
  plans,
}: {
  blockId: string;
  days: BlockDay[];
  plans: WorkoutPlan[];
}) {
  const [selected, setSelected] = useState<number | null>(null);
  return (
    <>
      <div className="mt-3 mb-3 flex justify-end">
        <button
          onClick={() => setSelected(weekVisualOrder[0])}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary"
        >
          <CalendarClock className="h-4 w-4" /> Horários
        </button>
      </div>
      <div className="overflow-x-auto pb-1">
        <div className="min-w-[364px]">
          <WeekdaySelector
            selectedDay={selected ?? undefined}
            onSelect={setSelected}
            primary={(weekday) =>
              plans.find((p) => p.id === days.find((d) => d.weekday === weekday)?.planId)?.letter ??
              "—"
            }
            secondary={(weekday) => days.find((d) => d.weekday === weekday)?.startTime ?? "—"}
          />
        </div>
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">
        Toque no dia para escolher o treino. Deslize para ver a semana.
      </p>
      {plans.length === 0 && (
        <p className="mt-2 text-xs text-muted-foreground">
          Adicione um treino à etapa para distribuir sua semana.
        </p>
      )}
      {selected !== null && (
        <DayPicker
          key={selected}
          weekday={selected}
          blockId={blockId}
          plans={plans}
          day={days.find((d) => d.weekday === selected)}
          onSelectDay={setSelected}
          onClose={() => setSelected(null)}
        />
      )}
    </>
  );
}

function DayPicker({
  weekday,
  blockId,
  plans,
  day,
  onClose,
  onSelectDay,
}: {
  weekday: number;
  blockId: string;
  plans: WorkoutPlan[];
  day?: BlockDay;
  onClose: () => void;
  onSelectDay: (day: number) => void;
}) {
  const [planId, setPlanId] = useState(day?.planId ?? "");
  const [time, setTime] = useState(day?.startTime ?? "");
  const action = useAsyncAction();
  return (
    <Modal
      title={`Treino de ${weekVisualLabels[weekVisualOrder.indexOf(weekday)]}`}
      onClose={onClose}
      footer={
        <button
          disabled={action.pending}
          className="w-full rounded-xl bg-primary py-3 font-semibold text-primary-foreground disabled:opacity-50"
          onClick={() =>
            action.run(async () => {
              await setBlockDay(blockId, weekday, planId || null, planId ? time || null : null);
              onClose();
            })
          }
        >
          Salvar dia
        </button>
      }
    >
      <label className="mb-4 block text-sm">
        Dia da semana
        <select
          aria-label="Dia da semana"
          value={weekday}
          onChange={(e) => onSelectDay(Number(e.target.value))}
          className="mt-2 w-full rounded-xl border border-border bg-surface p-3"
        >
          {weekVisualOrder.map((day, i) => (
            <option key={day} value={day}>
              {weekVisualLabels[i]}
            </option>
          ))}
        </select>
      </label>
      <div role="radiogroup" aria-label="Treino do dia" className="space-y-2">
        {[{ id: "", letter: "—", name: "Descanso" }, ...plans].map((plan) => (
          <label
            key={plan.id}
            className={`flex min-h-12 w-full cursor-pointer items-center gap-3 rounded-xl border p-3 text-left focus-within:ring-2 focus-within:ring-primary ${planId === plan.id ? "border-primary bg-primary/5" : "border-border"}`}
          >
            <input
              className="sr-only"
              type="radio"
              name="stage-workout"
              value={plan.id}
              checked={planId === plan.id}
              onChange={() => setPlanId(plan.id)}
            />
            <span className="text-primary font-bold">{plan.letter}</span>
            {plan.name}
          </label>
        ))}
      </div>
      {planId && (
        <label className="mt-4 block text-sm">
          Horário (opcional)
          <input
            aria-label="Horário do treino"
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            className="mt-2 w-full rounded-xl border border-border bg-surface p-3"
          />
        </label>
      )}
      {action.error && <InlineError message={action.error} onRetry={action.clearError} />}
    </Modal>
  );
}
