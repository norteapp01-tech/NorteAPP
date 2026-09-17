import { Modal } from "@/components/ui/modal";
import { formatDateShortBR } from "@/lib/goals-store";
import type { WorkoutPlan } from "@/lib/workout-store";
import type { FilteredData } from "@/lib/workout-evolution";

// ---------------------------------------------------------------------------
// Cada indicador abre os registros que o compõem — é o que permite conferir a
// origem de qualquer número em um toque.
// ---------------------------------------------------------------------------

export function SessionListDrawer({
  data,
  plans,
  onClose,
}: {
  data: FilteredData;
  plans: WorkoutPlan[];
  onClose: () => void;
}) {
  const sessions = [...data.sessions].sort((a, b) => b.date.localeCompare(a.date));
  return (
    <Modal onClose={onClose} title="Treinos realizados">
      <p className="text-xs text-muted-foreground">
        {sessions.length} sessões concluídas entre {formatDateShortBR(data.effectiveRange.from)} e{" "}
        {formatDateShortBR(data.effectiveRange.to)}.
      </p>
      {sessions.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">
          Nenhuma sessão concluída neste período com os filtros atuais.
        </p>
      ) : (
        <ul className="mt-3 space-y-1">
          {sessions.map((s) => {
            const plan = plans.find((p) => p.id === s.planId);
            const sets = data.sets.filter((set) => set.sessionId === s.id);
            return (
              <li
                key={s.id}
                className="flex items-center justify-between gap-2 rounded-lg border border-border bg-surface-2 px-2.5 py-2 text-xs"
              >
                <div className="min-w-0">
                  <p className="truncate font-semibold">
                    {s.planLabel ?? (plan ? `${plan.letter} · ${plan.name}` : "Treino")}
                  </p>
                  <p className="text-[11px] text-muted-foreground">{formatDateShortBR(s.date)}</p>
                </div>
                <span className="shrink-0 font-mono tabular-nums text-muted-foreground">
                  {sets.length} séries
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </Modal>
  );
}

/** Calendário compacto dos dias com registro — uma bolinha por dia do período. */
export function DaysCalendarDrawer({ data, onClose }: { data: FilteredData; onClose: () => void }) {
  const trained = new Set(data.sessions.map((s) => s.date));
  const days: string[] = [];
  const cursor = new Date(data.effectiveRange.from + "T00:00:00");
  const end = new Date(data.effectiveRange.to + "T00:00:00");
  while (cursor <= end && days.length < 400) {
    days.push(cursor.toISOString().slice(0, 10));
    cursor.setDate(cursor.getDate() + 1);
  }

  return (
    <Modal onClose={onClose} title="Dias treinados">
      <p className="text-xs text-muted-foreground">
        {trained.size} de {days.length} dias com treino concluído.
      </p>
      <div className="mt-3 grid grid-cols-7 gap-1">
        {days.map((day) => {
          const on = trained.has(day);
          return (
            <div
              key={day}
              title={formatDateShortBR(day)}
              className={`flex aspect-square items-center justify-center rounded-md text-[9px] tabular-nums ${
                on
                  ? "bg-primary/20 font-bold text-primary"
                  : "bg-surface-2 text-muted-foreground/50"
              }`}
            >
              {Number(day.slice(8, 10))}
            </div>
          );
        })}
      </div>
      <ul className="mt-3 space-y-0.5">
        {[...trained]
          .sort((a, b) => b.localeCompare(a))
          .map((day) => (
            <li key={day} className="text-[11px] text-muted-foreground">
              {formatDateShortBR(day)} · {data.sessions.filter((s) => s.date === day).length}{" "}
              sessão(ões)
            </li>
          ))}
      </ul>
    </Modal>
  );
}

export function SetsByExerciseDrawer({
  data,
  onClose,
}: {
  data: FilteredData;
  onClose: () => void;
}) {
  const byExercise = new Map<string, { name: string; sets: number }>();
  for (const set of data.sets) {
    const found = byExercise.get(set.lineageId);
    if (found) found.sets += 1;
    else byExercise.set(set.lineageId, { name: set.name, sets: 1 });
  }
  const rows = [...byExercise.values()].sort((a, b) => b.sets - a.sets);

  return (
    <Modal onClose={onClose} title="Séries registradas">
      <p className="text-xs text-muted-foreground">
        {data.sets.length} séries efetivamente registradas nas sessões concluídas. Metas de séries
        da ficha não entram nesta conta.
      </p>
      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">Nenhuma série registrada no período.</p>
      ) : (
        <ul className="mt-3 space-y-1">
          {rows.map((row) => (
            <li
              key={row.name}
              className="flex items-center justify-between gap-2 rounded-lg border border-border bg-surface-2 px-2.5 py-2 text-xs"
            >
              <span className="min-w-0 truncate">{row.name}</span>
              <span className="shrink-0 font-mono tabular-nums text-muted-foreground">
                {row.sets}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
