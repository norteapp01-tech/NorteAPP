import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { CalendarRange, ChevronDown, ChevronRight, Plus, Route as RouteIcon } from "lucide-react";
import { Card } from "@/components/sub-agenda-shared";
import { formatDateShortBR, todayISO } from "@/lib/goals-store";
import { useWorkoutStore } from "@/lib/workout-store";
import {
  blockOn,
  blocksForCycle,
  cycleProgress,
  draftCycles,
  evaluateCycleGoal,
  nextBlockAfter,
  pastCycles,
  setCycleStatus,
  stageState,
  useCycleStore,
  activeCycle as selectActiveCycle,
  type WorkoutCycle,
} from "@/lib/workout-cycle-store";
import { CycleCreatorModal } from "./CycleCreatorModal";

// ---------------------------------------------------------------------------
// Entrada da Academia para os ciclos: o que está valendo, o que está em
// rascunho e o histórico. A montagem acontece na página do ciclo — aqui é só a
// porta de entrada.
// ---------------------------------------------------------------------------

export function CycleTab() {
  const cycles = useCycleStore((s) => s.cycles);
  const blocks = useCycleStore((s) => s.blocks);
  const blockDays = useCycleStore((s) => s.blockDays);
  const blockPlans = useCycleStore((s) => s.blockPlans);
  const cycleGoals = useCycleStore((s) => s.cycleGoals);
  const measurements = useCycleStore((s) => s.measurements);
  const exercises = useWorkoutStore((s) => s.exercises);
  const sessions = useWorkoutStore((s) => s.sessions);
  const bodyWeights = useWorkoutStore((s) => s.bodyWeights);

  const [creating, setCreating] = useState(false);
  const [showPast, setShowPast] = useState(false);

  const active = selectActiveCycle(cycles);
  const drafts = draftCycles(cycles);
  const past = pastCycles(cycles);
  const today = todayISO();

  if (!active && drafts.length === 0 && past.length === 0) {
    return (
      <>
        <section className="card-surface p-5">
          <RouteIcon className="h-7 w-7 text-primary" strokeWidth={1.8} />
          <h2 className="mt-4 text-lg font-bold">Seu ciclo de treino</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Um ciclo divide um período em etapas com datas — cada etapa com seus próprios treinos,
            séries e metas. Mudar uma etapa futura não mexe no que já foi feito.
          </p>
          <button
            onClick={() => setCreating(true)}
            className="interactive-press mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-bold text-primary-foreground"
          >
            <Plus className="h-4 w-4" /> Criar ciclo
          </button>
        </section>
        {creating && <CycleCreatorModal onClose={() => setCreating(false)} />}
      </>
    );
  }

  const stages = active ? blocksForCycle(blocks, active.id) : [];
  const current = active ? blockOn(stages, today) : undefined;
  const upcoming = active ? nextBlockAfter(stages, today) : undefined;
  const evaluations = active
    ? cycleGoals
        .filter((g) => g.cycleId === active.id)
        .map((g) =>
          evaluateCycleGoal(g, {
            cycle: active,
            blocks: stages,
            blockDays,
            sessions,
            exercises,
            bodyWeights,
            measurements,
          }),
        )
    : [];
  const progress = active
    ? cycleProgress(active, stages, blockDays, sessions, evaluations, today)
    : null;

  return (
    <div className="space-y-5">
      {active && progress && (
        <Card title="Ciclo ativo">
          <Link
            to="/ciclo/$id"
            params={{ id: active.id }}
            className="interactive-press block rounded-lg"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-base font-bold">{active.name}</p>
                <p className="text-[11px] text-muted-foreground">
                  {formatDateShortBR(active.startDate)} — {formatDateShortBR(active.endDate)} ·{" "}
                  {stages.length} etapas
                </p>
              </div>
              <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
            </div>
          </Link>

          <div className="mt-3 rounded-xl border border-primary/30 bg-primary/5 p-3">
            {current ? (
              <>
                <p className="text-[10px] font-bold uppercase tracking-wider text-primary">
                  Etapa vigente
                </p>
                <p className="mt-0.5 text-sm font-semibold">{current.name}</p>
                <p className="text-[11px] text-muted-foreground">
                  {formatDateShortBR(current.startDate)} — {formatDateShortBR(current.endDate)}
                  {current.focus ? ` · foco: ${current.focus}` : ""}
                </p>
              </>
            ) : (
              <p className="text-xs text-muted-foreground">
                Hoje está fora das etapas deste ciclo — nenhuma programação do ciclo está valendo.
              </p>
            )}
            {upcoming && (
              <p className="mt-2 border-t border-border pt-2 text-[11px] text-muted-foreground">
                Próxima mudança: <span className="font-semibold">{upcoming.name}</span> em{" "}
                {formatDateShortBR(upcoming.startDate)}
                {stageState(upcoming, blockPlans, today) === "rascunho" && (
                  <span className="text-warning"> — ainda sem treinos</span>
                )}
              </p>
            )}
          </div>

          <div className="mt-3 grid grid-cols-3 gap-2">
            <Indicator
              label="Tempo"
              value={`${progress.elapsedDays}/${progress.totalDays}`}
              hint="dias corridos"
            />
            <Indicator
              label="Treinos"
              value={`${progress.doneSessions}/${progress.plannedSessions}`}
              hint={
                progress.plannedSessions > 0
                  ? `${Math.round((progress.doneSessions / progress.plannedSessions) * 100)}% do programado`
                  : "nada programado ainda"
              }
            />
            <Indicator
              label="Metas"
              value={
                progress.goalsTotal > 0 ? `${progress.goalsReached}/${progress.goalsTotal}` : "—"
              }
              hint={progress.goalsTotal > 0 ? "atingidas" : "sem metas"}
            />
          </div>

          <Link
            to="/ciclo/$id"
            params={{ id: active.id }}
            className="interactive-press mt-3 block w-full rounded-xl bg-primary py-2.5 text-center text-xs font-bold text-primary-foreground"
          >
            Abrir ciclo
          </Link>
        </Card>
      )}

      {drafts.length > 0 && (
        <Card title="Rascunhos">
          <ul className="space-y-2">
            {drafts.map((cycle) => (
              <li key={cycle.id}>
                <CycleRow cycle={cycle} stageCount={blocksForCycle(blocks, cycle.id).length} />
              </li>
            ))}
          </ul>
        </Card>
      )}

      {!active && drafts.length === 0 && (
        <Card title="Nenhum ciclo ativo">
          <p className="text-sm text-muted-foreground">
            Sem ciclo ativo, o treino de hoje segue o "Plano da semana".
          </p>
        </Card>
      )}

      <button
        onClick={() => setCreating(true)}
        className="interactive-press flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border py-3 text-xs font-semibold text-muted-foreground hover:border-primary/40 hover:text-primary"
      >
        <Plus className="h-4 w-4" /> Novo ciclo
      </button>

      {past.length > 0 && (
        <div className="border-t border-border pt-3">
          <button
            onClick={() => setShowPast((v) => !v)}
            aria-expanded={showPast}
            className="flex w-full items-center gap-3 text-left"
          >
            <CalendarRange className="h-5 w-5 text-muted-foreground" />
            <div className="flex-1">
              <p className="text-sm font-semibold">Ciclos anteriores</p>
              <p className="text-xs text-muted-foreground">{past.length} encerrados</p>
            </div>
            <ChevronDown
              className={`h-4 w-4 text-muted-foreground transition-transform ${showPast ? "rotate-180" : ""}`}
            />
          </button>
          {showPast && (
            <ul className="mt-3 space-y-2">
              {past.map((cycle) => (
                <li key={cycle.id} className="flex items-center gap-2">
                  <CycleRow
                    cycle={cycle}
                    stageCount={blocksForCycle(blocks, cycle.id).length}
                    trailing={
                      cycle.status === "concluido" ? (
                        <button
                          onClick={(e) => {
                            e.preventDefault();
                            void setCycleStatus(cycle.id, "arquivado");
                          }}
                          className="interactive-press shrink-0 text-[11px] text-muted-foreground underline"
                        >
                          arquivar
                        </button>
                      ) : undefined
                    }
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {creating && <CycleCreatorModal onClose={() => setCreating(false)} />}
    </div>
  );
}

function CycleRow({
  cycle,
  stageCount,
  trailing,
}: {
  cycle: WorkoutCycle;
  stageCount: number;
  trailing?: React.ReactNode;
}) {
  return (
    <div className="flex w-full items-center gap-2">
      <Link
        to="/ciclo/$id"
        params={{ id: cycle.id }}
        className="interactive-press flex min-w-0 flex-1 items-center justify-between gap-2 rounded-lg border border-border bg-surface-2 p-3"
      >
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{cycle.name}</p>
          <p className="text-[11px] text-muted-foreground">
            {formatDateShortBR(cycle.startDate)} — {formatDateShortBR(cycle.endDate)} · {stageCount}{" "}
            etapas
          </p>
        </div>
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
      </Link>
      {trailing}
    </div>
  );
}

function Indicator({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface-2 p-2.5 text-center">
      <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-0.5 font-mono text-base font-bold tabular-nums">{value}</p>
      <p className="text-[9px] leading-tight text-muted-foreground">{hint}</p>
    </div>
  );
}
