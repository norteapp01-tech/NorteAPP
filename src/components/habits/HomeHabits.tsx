import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { ChevronRight, Plus } from "lucide-react";
import { evaluateDay, evaluatePeriod, todayItem } from "@/lib/habits/engine";
import { indexFor, useHabitData } from "@/lib/habits/store";
import { HabitRow, type LogDone } from "./HabitRow";
import "./habits.css";

/** Rotinas de hoje na Home: as mesmas rotinas, o mesmo registro. Poucas por vez. */
export function HomeHabits() {
  const data = useHabitData();
  const navigate = useNavigate();
  const [toast, setToast] = useState<{
    message: string;
    undo?: () => Promise<void>;
    error?: boolean;
  } | null>(null);

  if (data.loading && data.habits.length === 0) return null;
  if (data.error) return null; // a Home não vira tela de erro por causa das rotinas

  if (data.habits.filter((h) => !h.archivedAt).length === 0) {
    return (
      <section className="mt-8" aria-label="Rotinas">
        <Link to="/rotinas" className="habit-home-empty interactive-press">
          <span className="grid h-10 w-10 place-items-center rounded-full border border-primary/50 text-primary">
            <Plus className="h-5 w-5" />
          </span>
          <span className="min-w-0 flex-1 text-left">
            <strong className="block text-sm">Criar uma rotina</strong>
            <span className="text-xs text-muted-foreground">
              Água, leitura, treino — conte em uma frase.
            </span>
          </span>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </Link>
      </section>
    );
  }

  const items = data.habits
    .filter((h) => !h.archivedAt)
    .map((habit) => {
      const idx = indexFor(data, habit.id);
      const item = todayItem(data.ctx, habit, idx);
      return {
        ...item,
        day: evaluateDay(data.ctx, habit, idx, data.ctx.today),
        period: evaluatePeriod(data.ctx, habit, idx, data.ctx.today),
        logs: (idx.get(data.ctx.today) ?? []).filter((l) => !l.deletedAt),
      };
    })
    .filter((i) => i.due);
  if (items.length === 0) return null;

  const pending = items.filter((i) => !i.settled);
  const settled = items.length - pending.length;
  const shown = pending.slice(0, 3);

  const onDone: LogDone = (message, undo) => {
    setToast({ message, undo });
    window.setTimeout(() => setToast((t) => (t?.message === message ? null : t)), 6000);
  };
  const go = () => void navigate({ to: "/rotinas" });

  return (
    <section className="mt-8" aria-label="Rotinas de hoje">
      <div className="flex items-end justify-between gap-4">
        <h2 className="norte-view-title">Rotinas</h2>
        <Link to="/rotinas" className="norte-hit pb-1 text-xs text-muted-foreground">
          {settled} de {items.length} · ver todas →
        </Link>
      </div>
      {shown.length === 0 ? (
        <p className="card-surface mt-3 px-4 py-4 text-sm text-muted-foreground">
          Tudo resolvido por hoje.
        </p>
      ) : (
        <ul className="card-surface mt-3 divide-y divide-border">
          {shown.map((i) => (
            <HabitRow
              key={i.habit.id}
              habit={i.habit}
              day={i.day}
              period={i.period}
              date={data.ctx.today}
              todayLogs={i.logs}
              onOpen={go}
              onQuick={go}
              onTimer={go}
              onDone={onDone}
              onError={(message) => setToast({ message, error: true })}
            />
          ))}
        </ul>
      )}
      {pending.length > shown.length && (
        <p className="mt-2 text-xs text-muted-foreground">
          +{pending.length - shown.length} em Rotinas
        </p>
      )}
      {toast && (
        <div
          role={toast.error ? "alert" : "status"}
          className={`habit-toast ${toast.error ? "is-error" : ""}`}
        >
          <span className="min-w-0 flex-1">{toast.message}</span>
          {toast.undo && (
            <button
              onClick={async () => {
                const undo = toast.undo;
                setToast(null);
                try {
                  await undo?.();
                } catch (e) {
                  setToast({
                    message: e instanceof Error ? e.message : "Não foi possível desfazer.",
                    error: true,
                  });
                }
              }}
              className="min-h-11 px-2 font-semibold text-primary"
            >
              Desfazer
            </button>
          )}
        </div>
      )}
    </section>
  );
}
