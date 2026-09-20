import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, ChevronLeft, Play, Plus, Square } from "lucide-react";
import { UnderlineTabs } from "@/components/ui/app-design-system";
import { PlanPathNode } from "@/components/plan/PlanPath";
import { InlineError } from "@/components/ui/inline-error";
import { useAsyncAction } from "@/hooks/use-async-action";
import { weekVisualLabels, weekVisualOrder } from "@/components/sub-agenda-shared";
import { formatDateShortBR, todayISO } from "@/lib/goals-store";
import { useWorkoutStore } from "@/lib/workout-store";
import {
  activateCycle,
  addBlock,
  blockOn,
  blocksForCycle,
  cycleProgress,
  daysOfBlock,
  endCycle,
  evaluateCycleGoal,
  nextBlockAfter,
  plansOfBlock,
  stageState,
  useCycleStore,
} from "@/lib/workout-cycle-store";
import { StageCard } from "./StageCard";
import { CycleTimeline } from "./CycleTimeline";
import { CycleGoalsCard } from "./CycleGoalsCard";

// ---------------------------------------------------------------------------
// Página completa do ciclo, usada IGUAL pela Academia e por Planos — é a mesma
// linha no banco, então abrir por um lado ou pelo outro não pode oferecer
// funcionalidades diferentes.
// ---------------------------------------------------------------------------

type Tab = "planejamento" | "cronograma";

export function CyclePage({
  cycleId,
  backTo,
  backLabel,
}: {
  cycleId: string;
  backTo: string;
  backLabel: string;
}) {
  const cycles = useCycleStore((s) => s.cycles);
  const blocks = useCycleStore((s) => s.blocks);
  const blockDays = useCycleStore((s) => s.blockDays);
  const blockPlans = useCycleStore((s) => s.blockPlans);
  const cycleGoals = useCycleStore((s) => s.cycleGoals);
  const measurements = useCycleStore((s) => s.measurements);
  const plans = useWorkoutStore((s) => s.plans);
  const exercises = useWorkoutStore((s) => s.exercises);
  const sessions = useWorkoutStore((s) => s.sessions);
  const bodyWeights = useWorkoutStore((s) => s.bodyWeights);

  const [tab, setTab] = useState<Tab>("planejamento");
  const [openStageId, setOpenStageId] = useState<string | null>(null);
  const [confirmActivate, setConfirmActivate] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const action = useAsyncAction();

  const cycle = cycles.find((c) => c.id === cycleId);
  if (!cycle) {
    return (
      <div className="norte-page">
        <Link to={backTo} className="inline-flex items-center gap-1 text-xs text-muted-foreground">
          <ChevronLeft className="h-4 w-4" /> {backLabel}
        </Link>
        <p className="mt-6 text-sm text-muted-foreground">Ciclo não encontrado.</p>
      </div>
    );
  }

  const today = todayISO();
  const stages = blocksForCycle(blocks, cycle.id);
  const current = blockOn(stages, today);
  const upcoming = nextBlockAfter(stages, today);
  const goals = cycleGoals.filter((g) => g.cycleId === cycle.id);
  const evaluations = goals.map((g) =>
    evaluateCycleGoal(g, {
      cycle,
      blocks: stages,
      blockDays,
      blockPlans,
      sessions,
      exercises,
      bodyWeights,
      measurements,
    }),
  );
  const progress = cycleProgress(cycle, stages, blockDays, sessions, evaluations, today);
  const incomplete = stages.filter((b) => stageState(b, blockPlans, today) === "rascunho");
  const setup = (cycle.status === "concluido" || cycle.status === "arquivado" ? [] : stages)
    .filter((block) => block.endDate >= today)
    .map((block) => {
      const workouts = plansOfBlock(blockPlans, plans, block.id);
      const empty = workouts.find(
        (plan) => !exercises.some((exercise) => exercise.planId === plan.id),
      );
      const message =
        workouts.length === 0
          ? "Adicione os treinos desta etapa"
          : empty
            ? `Monte os exercícios do treino ${empty.letter}`
            : !blockDays.some((day) => day.blockId === block.id && day.planId)
              ? "Distribua os treinos na semana"
              : null;
      return { block, message };
    })
    .find((item) => item.message);

  return (
    <div className="px-5 pb-10 pt-12">
      <Link to={backTo} className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        <ChevronLeft className="h-4 w-4" /> {backLabel}
      </Link>

      <header className="mt-3">
        <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
          Programa de treino
        </p>
        <h1 className="norte-page-title mt-3">{cycle.name}</h1>
        <p className="mt-1 text-xs text-muted-foreground">
          {formatDateShortBR(cycle.startDate)} — {formatDateShortBR(cycle.endDate)} ·{" "}
          {progress.totalDays} dias · {stages.length} etapas
        </p>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
              cycle.status === "ativo"
                ? "bg-primary/15 text-primary"
                : cycle.status === "rascunho"
                  ? "bg-surface-2 text-muted-foreground"
                  : "bg-surface-2 text-muted-foreground"
            }`}
          >
            {cycle.status}
          </span>
          {cycle.status !== "ativo" && cycle.status !== "concluido" && (
            <button
              onClick={() => setConfirmActivate(true)}
              disabled={stages.every((b) => stageState(b, blockPlans, today) === "rascunho")}
              className="interactive-press inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-[11px] font-bold text-primary-foreground disabled:opacity-40"
            >
              <Play className="h-3.5 w-3.5" /> Ativar programa
            </button>
          )}
          {cycle.status === "ativo" && (
            <button
              onClick={() => setConfirmEnd(true)}
              className="interactive-press inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-[11px] font-semibold"
            >
              <Square className="h-3.5 w-3.5" /> Encerrar programa
            </button>
          )}
        </div>
      </header>

      {confirmActivate && (
        <ActivationPreview
          stages={stages}
          current={current}
          upcoming={upcoming}
          incomplete={incomplete.length}
          pending={action.pending}
          onCancel={() => setConfirmActivate(false)}
          onConfirm={() =>
            action.run(async () => {
              await activateCycle(cycle.id);
              setConfirmActivate(false);
            })
          }
        />
      )}

      {confirmEnd && (
        <div className="mt-4 rounded-xl border border-border bg-surface-2 p-3">
          <p className="text-sm font-bold">Encerrar o programa?</p>
          <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
            O histórico de treinos fica intacto. O "Plano da semana" volta a ser o que estava
            valendo antes do programa, se você quiser.
          </p>
          <div className="mt-2.5 flex flex-wrap gap-2">
            <button
              onClick={() => setConfirmEnd(false)}
              className="interactive-press flex-1 rounded-lg border border-border py-2 text-[11px] font-semibold"
            >
              Voltar
            </button>
            <button
              onClick={() =>
                action.run(async () => {
                  await endCycle(cycle, false);
                  setConfirmEnd(false);
                })
              }
              className="interactive-press flex-1 rounded-lg border border-border py-2 text-[11px] font-semibold"
            >
              Encerrar e manter
            </button>
            <button
              onClick={() =>
                action.run(async () => {
                  await endCycle(cycle, true);
                  setConfirmEnd(false);
                })
              }
              disabled={!cycle.previousWeekly}
              className="interactive-press flex-1 rounded-lg bg-primary py-2 text-[11px] font-bold text-primary-foreground disabled:opacity-40"
            >
              Encerrar e restaurar
            </button>
          </div>
        </div>
      )}

      {cycle.status === "ativo" &&
        upcoming &&
        stageState(upcoming, blockPlans, today) === "rascunho" && (
          <p className="mt-4 flex items-start gap-2 rounded-xl border border-warning/40 bg-warning/10 px-3 py-2.5 text-[11px] leading-relaxed text-warning">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />A próxima etapa (
            {upcoming.name}, a partir de {formatDateShortBR(upcoming.startDate)}) ainda não tem
            treinos. Se ela começar assim, não haverá programação — o Norte não vai inventar treino.
          </p>
        )}

      {action.error && (
        <InlineError message={action.error} onRetry={action.clearError} className="mt-3" />
      )}

      <div className="mt-5">
        <UnderlineTabs
          items={
            [
              { key: "planejamento", label: "Planejamento" },
              { key: "cronograma", label: "Cronograma" },
            ] as const
          }
          value={tab}
          onChange={setTab}
        />
      </div>

      <div className="mt-5 state-fade" key={tab}>
        {tab === "planejamento" && (
          <div>
            {setup && (
              <div className="card-surface mb-5 border-l-2 border-l-primary p-4">
                <p className="text-[11px] font-bold uppercase tracking-wider text-primary">
                  Próximo passo
                </p>
                <button
                  onClick={() => {
                    setOpenStageId(setup.block.id);
                    requestAnimationFrame(() =>
                      document
                        .getElementById(`cycle-stage-${setup.block.id}`)
                        ?.scrollIntoView({ behavior: "smooth", block: "start" }),
                    );
                  }}
                  className="mt-2 w-full text-left"
                >
                  <span className="block text-base font-semibold">{setup.message}</span>
                  <span className="mt-1 block text-sm text-muted-foreground">
                    {setup.block.name} · Continuar montagem →
                  </span>
                </button>
              </div>
            )}
            <div className="mb-3 flex items-center justify-between">
              <h2 className="norte-section-title">Caminho do programa</h2>
              <span className="text-[13px] text-muted-foreground">{stages.length} etapas</span>
            </div>
            {stages.map((block, index) => (
              <div key={block.id} id={`cycle-stage-${block.id}`} className="flex gap-3 scroll-mt-6">
                <div aria-hidden className="flex shrink-0 flex-col items-center">
                  <div
                    className={`w-[1.5px] flex-1 ${index === 0 ? "invisible" : current?.id === block.id ? "bg-primary" : "bg-border"}`}
                  />
                  <PlanPathNode state={current?.id === block.id ? "current" : "future"} />
                  <div
                    className={`w-[1.5px] flex-1 ${index === stages.length - 1 ? "invisible" : current?.id === block.id ? "bg-primary" : "bg-border"}`}
                  />
                </div>
                <div className="min-w-0 flex-1 pb-4">
                  <StageCard
                    key={block.id}
                    cycle={cycle}
                    block={block}
                    evaluations={evaluations}
                    index={index}
                    isOpen={openStageId === block.id}
                    onToggle={() => setOpenStageId(openStageId === block.id ? null : block.id)}
                  />
                </div>
              </div>
            ))}
            {stages.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Este programa ainda não tem etapas. Adicione a primeira para montar os treinos.
              </p>
            )}
            <button
              onClick={() =>
                action.run(async () => {
                  const id = await addBlock(cycle, {
                    name: `Etapa ${stages.length + 1}`,
                    durationDays: 15,
                  });
                  setOpenStageId(id);
                })
              }
              disabled={action.pending}
              className="interactive-press mt-2 flex h-12 w-fit items-center gap-1.5 rounded-2xl border border-primary/50 px-4 text-sm font-semibold text-primary hover:bg-primary/5 disabled:opacity-40"
            >
              <Plus className="h-4 w-4" /> Nova etapa
            </button>
            {evaluations.some((ev) => !ev.goal.blockId) && (
              <div className="mt-5">
                <CycleGoalsCard
                  cycle={cycle}
                  blocks={stages}
                  evaluations={evaluations.filter((ev) => !ev.goal.blockId)}
                />
              </div>
            )}
          </div>
        )}

        {tab === "cronograma" && (
          <CycleTimeline
            cycle={cycle}
            blocks={stages}
            goals={goals}
            onOpenStage={(id) => {
              setOpenStageId(id);
              setTab("planejamento");
            }}
          />
        )}
      </div>
    </div>
  );
}

/** Prévia do que passa a valer — ativar muda o "Treino de hoje" de quem já
 * tinha uma semana montada, e isso não pode acontecer às cegas. */
function ActivationPreview({
  stages,
  current,
  upcoming,
  incomplete,
  pending,
  onCancel,
  onConfirm,
}: {
  stages: ReturnType<typeof blocksForCycle>;
  current?: ReturnType<typeof blockOn>;
  upcoming?: ReturnType<typeof nextBlockAfter>;
  incomplete: number;
  pending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const blockDays = useCycleStore((s) => s.blockDays);
  const blockPlans = useCycleStore((s) => s.blockPlans);
  const plans = useWorkoutStore((s) => s.plans);
  const days = current ? daysOfBlock(blockDays, current.id) : [];

  return (
    <div className="mt-4 rounded-xl border border-primary/40 bg-primary/5 p-3">
      <p className="text-sm font-bold">O que passa a valer</p>
      {!current ? (
        <p className="mt-1 text-[11px] text-muted-foreground">
          Hoje está fora das etapas deste programa — nada muda no "Treino de hoje" até a primeira
          etapa começar
          {stages[0] ? `, em ${formatDateShortBR(stages[0].startDate)}` : ""}.
        </p>
      ) : (
        <>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Etapa vigente: <span className="font-semibold text-foreground">{current.name}</span> ·{" "}
            {plansOfBlock(blockPlans, plans, current.id).length} treinos
          </p>
          <ul className="mt-2 space-y-0.5">
            {weekVisualOrder.map((weekday, i) => {
              const day = days.find((d) => d.weekday === weekday);
              const plan = plans.find((p) => p.id === day?.planId);
              return (
                <li key={weekday} className="flex justify-between gap-2 text-[11px]">
                  <span className="text-muted-foreground">{weekVisualLabels[i]}</span>
                  <span className="min-w-0 truncate">
                    {plan ? `${plan.letter} · ${plan.name}` : "Descanso"}
                    {day?.startTime ? ` · ${day.startTime}` : ""}
                  </span>
                </li>
              );
            })}
          </ul>
        </>
      )}
      {incomplete > 0 && (
        <p className="mt-2 text-[11px] text-warning">
          {incomplete} etapa(s) ainda sem treinos — elas não vão programar nada.
        </p>
      )}
      {upcoming && (
        <p className="mt-2 text-[11px] text-muted-foreground">
          Próxima mudança: {upcoming.name} em {formatDateShortBR(upcoming.startDate)}.
        </p>
      )}
      <p className="mt-2 text-[11px] text-muted-foreground">
        Seu "Plano da semana" atual fica guardado e pode ser restaurado ao encerrar.
      </p>
      <div className="mt-2.5 flex gap-2">
        <button
          onClick={onCancel}
          className="interactive-press flex-1 rounded-lg border border-border py-2 text-[11px] font-semibold"
        >
          Cancelar
        </button>
        <button
          onClick={onConfirm}
          disabled={pending}
          className="interactive-press flex-1 rounded-lg bg-primary py-2 text-[11px] font-bold text-primary-foreground disabled:opacity-40"
        >
          {pending ? "Ativando…" : "Ativar"}
        </button>
      </div>
    </div>
  );
}
