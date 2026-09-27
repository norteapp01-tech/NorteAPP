import { useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  CalendarRange,
  ChevronDown,
  ChevronRight,
  CirclePlus,
  FileText,
  Layers3,
  Plus,
  Route as RouteIcon,
} from "lucide-react";
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
          <h2 className="mt-4 text-lg font-bold">Seu programa de treino</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Um ciclo divide um período em etapas com datas — cada etapa com seus próprios treinos,
            séries e metas. Mudar uma etapa futura não mexe no que já foi feito.
          </p>
          <button
            onClick={() => setCreating(true)}
            className="interactive-press mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-bold text-primary-foreground"
          >
            <Plus className="h-4 w-4" /> Montar programa
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
  const currentIndex = current ? stages.findIndex((item) => item.id === current.id) : -1;

  return (
    <div className="academy-program-page">
      {active && progress && (
        <>
          <section className="academy-program-hero">
            <p className="academy-program-eyebrow">Programa ativo</p>
            <h2>{active.name}</h2>
            <p className="academy-program-dates">
              {formatDateShortBR(active.startDate)} — {formatDateShortBR(active.endDate)} ·{" "}
              {stages.length} etapas
            </p>
            <div className="academy-program-main">
              <div>
                <span>Dias corridos do programa</span>
                <strong>
                  {progress.elapsedDays} de {progress.totalDays} dias
                </strong>
                <b>
                  <i
                    style={{
                      width: `${Math.min(100, (progress.elapsedDays / Math.max(1, progress.totalDays)) * 100)}%`,
                    }}
                  />
                </b>
              </div>
              <div className="academy-stage-line" aria-label="Etapas do programa">
                {stages.map((item, index) => (
                  <div
                    key={item.id}
                    className={
                      index < currentIndex
                        ? "is-complete"
                        : index === currentIndex
                          ? "is-current"
                          : ""
                    }
                  >
                    <span>{index < currentIndex ? "✓" : index + 1}</span>
                    <small>{index + 1}</small>
                    <em>{index <= currentIndex ? item.name : "—"}</em>
                  </div>
                ))}
              </div>
            </div>
            <Link to="/ciclo/$id" params={{ id: active.id }} className="academy-program-open">
              Abrir programa <span>→</span>
            </Link>
          </section>

          <details className="academy-program-details">
            <summary>
              <Layers3 />
              <span>
                <strong>Mais detalhes</strong>
                <small>Etapa atual, treinos e metas</small>
              </span>
              <ChevronDown />
            </summary>
            <div className="academy-program-details-content">
              {current ? (
                <div>
                  <small>Etapa atual</small>
                  <strong>{current.name}</strong>
                  <p>
                    {formatDateShortBR(current.startDate)} — {formatDateShortBR(current.endDate)}
                    {current.focus ? ` · foco: ${current.focus}` : ""}
                  </p>
                </div>
              ) : (
                <p>Hoje está fora das etapas programadas deste ciclo.</p>
              )}
              {upcoming && (
                <p>
                  Próxima mudança: <strong>{upcoming.name}</strong> em{" "}
                  {formatDateShortBR(upcoming.startDate)}
                  {stageState(upcoming, blockPlans, today) === "rascunho" && " — ainda sem treinos"}
                </p>
              )}
              <div className="academy-program-indicators">
                <Indicator
                  label="Treinos feitos"
                  value={`${progress.doneSessions}/${progress.plannedSessions}`}
                  hint="previstos até hoje"
                />
                <Indicator
                  label="Metas da etapa"
                  value={
                    progress.goalsTotal > 0
                      ? `${progress.goalsReached}/${progress.goalsTotal}`
                      : "—"
                  }
                  hint={progress.goalsTotal > 0 ? "atingidas" : "sem metas definidas"}
                />
              </div>
            </div>
          </details>
        </>
      )}

      {drafts.length > 0 && (
        <details className="academy-program-row">
          <summary>
            <FileText />
            <span>
              <strong>Rascunhos</strong>
              <small>
                {drafts.length}{" "}
                {drafts.length === 1 ? "programa não iniciado" : "programas não iniciados"}
              </small>
            </span>
            <ChevronDown />
          </summary>
          <ul className="academy-program-row-content">
            {drafts.map((cycle) => (
              <li key={cycle.id}>
                <CycleRow cycle={cycle} stageCount={blocksForCycle(blocks, cycle.id).length} />
              </li>
            ))}
          </ul>
        </details>
      )}

      {!active && drafts.length === 0 && (
        <Card title="Nenhum programa ativo">
          <p className="text-sm text-muted-foreground">
            Sem programa ativo, o treino de hoje segue o "Plano da semana".
          </p>
        </Card>
      )}

      <button
        onClick={() => setCreating(true)}
        className="academy-program-row academy-program-create interactive-press"
      >
        <CirclePlus />
        <span>
          <strong>Montar novo programa</strong>
          <small>Crie outro ciclo de treino</small>
        </span>
        <ChevronRight />
      </button>

      {past.length > 0 && (
        <div className="academy-program-row">
          <button
            onClick={() => setShowPast((v) => !v)}
            aria-expanded={showPast}
            className="academy-program-row-trigger"
          >
            <CalendarRange />
            <span>
              <strong>Programas anteriores</strong>
              <small>
                {past.length} {past.length === 1 ? "programa encerrado" : "programas encerrados"}
              </small>
            </span>
            <ChevronDown
              className={`h-4 w-4 text-muted-foreground transition-transform ${showPast ? "rotate-180" : ""}`}
            />
          </button>
          {showPast && (
            <ul className="academy-program-row-content">
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
    <div>
      <p>{label}</p>
      <strong>{value}</strong>
      <small>{hint}</small>
    </div>
  );
}
