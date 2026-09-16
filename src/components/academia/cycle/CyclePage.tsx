import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, ChevronLeft, Play, Plus, Square } from "lucide-react";
import { UnderlineTabs } from "@/components/ui/app-design-system";
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
import { CycleEvolution } from "./CycleEvolution";
import { CycleGoalsCard } from "./CycleGoalsCard";

// ---------------------------------------------------------------------------
// Página completa do ciclo, usada IGUAL pela Academia e por Planos — é a mesma
// linha no banco, então abrir por um lado ou pelo outro não pode oferecer
// funcionalidades diferentes.
// ---------------------------------------------------------------------------

type Tab = "planejamento" | "cronograma" | "evolucao" | "metas";

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
      <div className="px-5 pt-12">
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
      sessions,
      exercises,
      bodyWeights,
      measurements,
    }),
  );
  const progress = cycleProgress(cycle, stages, blockDays, sessions, evaluations, today);
  const incomplete = stages.filter((b) => stageState(b, blockPlans, today) === "rascunho");

  return (
    <div className="px-5 pb-10 pt-12">
      <Link to={backTo} className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        <ChevronLeft className="h-4 w-4" /> {backLabel}
      </Link>

      <header className="mt-3">
        <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
          Ciclo de treino
        </p>
        <h1 className="mt-1 text-2xl font-bold leading-tight">{cycle.name}</h1>
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
                  ? "bg-warning/15 text-warning"
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
              <Play className="h-3.5 w-3.5" /> Ativar ciclo
            </button>
          )}
          {cycle.status === "ativo" && (
            <button
              onClick={() => setConfirmEnd(true)}
              className="interactive-press inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-[11px] font-semibold"
            >
              <Square className="h-3.5 w-3.5" /> Encerrar ciclo
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
          <p className="text-sm font-bold">Encerrar o ciclo?</p>
          <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
            O histórico de treinos fica intacto. O "Plano da semana" volta a ser o que estava
            valendo antes do ciclo, se você quiser.
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
              { key: "evolucao", label: "Evolução" },
              { key: "metas", label: "Metas" },
            ] as const
          }
          value={tab}
          onChange={setTab}
        />
      </div>

      <div className="mt-5 state-fade" key={tab}>
        {tab === "planejamento" && (
          <div className="space-y-3">
            {stages.map((block, index) => (
              <StageCard
                key={block.id}
                cycle={cycle}
                block={block}
                index={index}
                isOpen={openStageId === block.id}
                onToggle={() => setOpenStageId(openStageId === block.id ? null : block.id)}
              />
            ))}
            {stages.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Este ciclo ainda não tem etapas. Adicione a primeira para montar os treinos.
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
              className="interactive-press flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border py-3 text-xs font-semibold text-muted-foreground hover:border-primary/40 hover:text-primary disabled:opacity-40"
            >
              <Plus className="h-4 w-4" /> Adicionar etapa
            </button>
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

        {tab === "evolucao" && (
          <CycleEvolution cycle={cycle} blocks={stages} evaluations={evaluations} />
        )}

        {tab === "metas" && (
          <CycleGoalsCard cycle={cycle} blocks={stages} evaluations={evaluations} />
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
          Hoje está fora das etapas deste ciclo — nada muda no "Treino de hoje" até a primeira etapa
          começar
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
