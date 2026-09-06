import { createFileRoute, Link, useNavigate, notFound } from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { CategoryIcon } from "@/components/plan/CategoryIcon";
import { PlanHeader } from "@/components/plan/PlanHeader";
import { PlanTabs, type PlanTab } from "@/components/plan/PlanTabs";
import { GuidanceEntry } from "@/components/plan/GuidanceEntry";
import { NextActionCard } from "@/components/plan/NextActionCard";
import { PlanPath } from "@/components/plan/PlanPath";
import { ActionRow } from "@/components/plan/ActionRow";
import { CreateStageSheet } from "@/components/plan/CreateStageSheet";
import { CreateActionSheet } from "@/components/plan/CreateActionSheet";
import { GanttChart } from "@/components/plan/gantt/GanttChart";
import { useProfile } from "@/lib/profile-store";
import { formatTime } from "@/lib/format-utils";
import { Modal } from "@/components/ui/modal";
import { ChartSkeleton } from "@/components/ui/chart-skeleton";

// recharts só entra no bundle quando a aba Evolução é aberta de fato — na aba
// Planejamento (a inicial) essa tela nem chega a baixar o gráfico.
const EvolutionTab = lazy(() =>
  import("@/components/plan/EvolutionTab").then((m) => ({ default: m.EvolutionTab })),
);
import {
  useGoalsStore,
  useGoalsLoading,
  isScheduled,
  isPlanStalled,
  stepsForGoal,
  executionsForGoal,
  linkExecutionToGoal,
  nextPlanAction,
  formatDateBR,
  type Goal,
} from "@/lib/goals-store";

export const Route = createFileRoute("/objetivo/$id")({
  head: ({ params }) => ({
    meta: [
      { title: `Objetivo — Norte` },
      { name: "description", content: `Acompanhamento do planejamento ${params.id}` },
    ],
  }),
  // Deep-link usado por "Criar ação"/"Criar primeira etapa": abre já com a
  // etapa certa aberta e, opcionalmente, o modal de nova ação dela aberto.
  validateSearch: (search: Record<string, unknown>): { openStep?: string; create?: boolean } => ({
    openStep: search.openStep as string | undefined,
    create: search.create as boolean | undefined,
  }),
  component: GoalDetail,
  notFoundComponent: () => (
    <div className="px-5 pt-12">
      <p className="text-sm text-muted-foreground">Planejamento não encontrado.</p>
      <Link to="/planejamento" className="mt-4 inline-block text-sm text-primary">
        ← voltar ao plano
      </Link>
    </div>
  ),
});

export function GoalDetail() {
  const { id } = Route.useParams();
  const search = Route.useSearch();
  const nav = useNavigate();
  const goal = useGoalsStore((s) => s.goals.find((g) => g.id === id));
  const allSteps = useGoalsStore((s) => s.steps);
  const allExecutions = useGoalsStore((s) => s.executions);
  const loading = useGoalsLoading();

  const [tab, setTab] = useState<PlanTab>("planejamento");
  const [openStepId, setOpenStepId] = useState<string | null>(null);
  const [flashId, setFlashId] = useState<string | null>(null);
  const [showCreateStage, setShowCreateStage] = useState(false);
  const [createActionStepId, setCreateActionStepId] = useState<string | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const stepRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const execRefs = useRef<Record<string, HTMLElement | null>>({});
  const autoOpenedRef = useRef(false);

  // Hooks sempre chamados na mesma ordem — a checagem de goal ausente/carregando
  // vem depois, nunca pulando useMemo em algum render (regra dos hooks).
  const steps = useMemo(() => (goal ? stepsForGoal(allSteps, goal.id) : []), [allSteps, goal]);
  const executions = useMemo(
    () => (goal ? executionsForGoal(allExecutions, goal.id) : []),
    [allExecutions, goal],
  );

  // Deep-link tem prioridade — trava a auto-abertura estrutural mesmo antes
  // dos dados chegarem, senão a etapa "atual" sobrescreveria a etapa pedida
  // assim que o fetch terminasse.
  useEffect(() => {
    if (!search.openStep) return;
    const stepId = search.openStep;
    autoOpenedRef.current = true;
    setOpenStepId(stepId);
    setTab("planejamento");
    setFlashId(stepId);
    if (search.create) setCreateActionStepId(stepId);
    requestAnimationFrame(() => {
      setTimeout(() => {
        stepRefs.current[stepId]?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 50);
    });
    setTimeout(() => setFlashId(null), 2000);
  }, [search.openStep, search.create]);

  // Sem deep-link: abre a etapa atual (primeira não concluída) assim que os
  // dados reais chegarem — só uma vez, pra não reabrir sozinho depois que o
  // usuário já tiver fechado/trocado manualmente.
  useEffect(() => {
    if (autoOpenedRef.current) return;
    if (steps.length === 0) return;
    autoOpenedRef.current = true;
    const firstOpen = steps.find((s) => !s.done);
    if (firstOpen) setOpenStepId(firstOpen.id);
  }, [steps]);

  if (!goal) {
    if (loading) return null;
    throw notFound();
  }

  const stalled = isPlanStalled(goal, allSteps, allExecutions);
  const orphanExecutions = executions.filter((e) => !e.stepId);
  const hasDetails = !!(goal.finalOutcome || goal.how || goal.why);
  const planNext = nextPlanAction(goal, steps, executions);
  const nextActionId = planNext.kind === "action" ? planNext.execution.id : null;

  const goToStep = (stepId: string) => {
    setTab("planejamento");
    setOpenStepId(stepId);
    setFlashId(stepId);
    requestAnimationFrame(() => {
      setTimeout(() => {
        stepRefs.current[stepId]?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 50);
    });
    setTimeout(() => setFlashId(null), 2000);
  };

  const handleCreateAction = (stepId: string) => {
    setOpenStepId(stepId);
    setCreateActionStepId(stepId);
  };

  const handleDefineNext = () => {
    if (steps.length === 0) {
      setTab("planejamento");
      setShowCreateStage(true);
      return;
    }
    const open = steps.find((s) => !s.done) ?? steps[0];
    goToStep(open.id);
    setCreateActionStepId(open.id);
  };

  return (
    <div className="px-5 pt-12 pb-10">
      <PlanHeader
        goal={goal}
        allSteps={allSteps}
        allExecutions={allExecutions}
        hasDetails={hasDetails}
        onBack={() => nav({ to: "/planejamento" })}
        onShowDetails={() => setShowDetails(true)}
        onLinkAction={() => setShowPicker(true)}
      />

      <div className="mt-5">
        <PlanTabs tab={tab} onChange={setTab} />
      </div>

      {tab === "planejamento" && (
        <div className="mt-5 space-y-6">
          <GuidanceEntry />

          {stalled && <StalledPlanAlert onDefineNext={handleDefineNext} />}

          <NextActionCard
            goal={goal}
            steps={steps}
            executions={executions}
            onCreateAction={handleCreateAction}
            onCreateStage={() => setShowCreateStage(true)}
          />

          <PlanPath
            goal={goal}
            steps={steps}
            executions={executions}
            openStepId={openStepId}
            onToggleStep={(stepId) => setOpenStepId((cur) => (cur === stepId ? null : stepId))}
            flashId={flashId}
            stepRefs={stepRefs}
            execRefs={execRefs}
            nextActionId={nextActionId}
            onCreateAction={handleCreateAction}
            onCreateStage={() => setShowCreateStage(true)}
          />

          {orphanExecutions.length > 0 && (
            <div>
              <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
                Ações sem etapa
              </h2>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Contam como avanço do plano, mas ainda não pertencem a nenhuma etapa.
              </p>
              <div className="mt-3 space-y-2.5">
                {orphanExecutions.map((e) => (
                  <div
                    key={e.id}
                    ref={(el) => {
                      execRefs.current[e.id] = el;
                    }}
                  >
                    <ActionRow
                      e={e}
                      allExecutions={allExecutions}
                      highlighted={flashId === e.id}
                      onUnlink={() => linkExecutionToGoal(e.id, null)}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {tab === "cronograma" && <GanttChart goal={goal} steps={steps} executions={executions} />}

      {tab === "evolucao" && (
        <div className="mt-5">
          <Suspense fallback={<ChartSkeleton height={220} />}>
            <EvolutionTab
              goal={goal}
              allSteps={allSteps}
              allExecutions={allExecutions}
              onNavigate={(target) => {
                if (target.stepId) goToStep(target.stepId);
              }}
            />
          </Suspense>
        </div>
      )}

      {showPicker && <ExecutionPicker goalId={goal.id} onClose={() => setShowPicker(false)} />}
      {showCreateStage && (
        <CreateStageSheet goal={goal} onClose={() => setShowCreateStage(false)} />
      )}
      {createActionStepId && (
        <CreateActionSheet
          step={steps.find((s) => s.id === createActionStepId)!}
          goal={goal}
          onClose={() => setCreateActionStepId(null)}
        />
      )}
      {showDetails && <PlanDetailsModal goal={goal} onClose={() => setShowDetails(false)} />}
    </div>
  );
}

function PlanDetailsModal({ goal, onClose }: { goal: Goal; onClose: () => void }) {
  return (
    <Modal onClose={onClose} title="Detalhes do plano">
      <div className="space-y-3">
        {goal.why && (
          <Card label="Por quê">
            <p className="text-sm italic text-balance-tight">"{goal.why}"</p>
          </Card>
        )}
        {goal.finalOutcome && (
          <Card label="Objetivo final">
            <p className="text-sm text-balance-tight">{goal.finalOutcome}</p>
          </Card>
        )}
        {goal.how && (
          <Card label="Como executar">
            <p className="text-sm text-balance-tight">{goal.how}</p>
          </Card>
        )}
        {!goal.why && !goal.finalOutcome && !goal.how && (
          <p className="text-sm text-muted-foreground">Sem detalhes adicionais registrados.</p>
        )}
      </div>
    </Modal>
  );
}

function Card({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="card-surface p-4">
      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <div className="mt-2.5">{children}</div>
    </div>
  );
}

function StalledPlanAlert({ onDefineNext }: { onDefineNext: () => void }) {
  return (
    <div className="rounded-2xl border border-warning/40 bg-warning/10 p-4">
      <div className="flex items-start gap-2.5">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">
            Este plano está sem uma próxima ação.
          </p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Sem ação pendente, sem etapa atual definida e sem avanço nos últimos 14 dias.
          </p>
          <button
            onClick={onDefineNext}
            className="mt-2 rounded-lg bg-warning px-3 py-1.5 text-xs font-semibold text-background"
          >
            Criar ação
          </button>
        </div>
      </div>
    </div>
  );
}

function ExecutionPicker({ goalId, onClose }: { goalId: string; onClose: () => void }) {
  const executions = useGoalsStore((s) => s.executions);
  const profile = useProfile();
  const available = executions.filter((e) => e.goalId !== goalId && e.status === "planejada");
  return (
    <Modal onClose={onClose} title="Vincular ação">
      <p className="text-xs text-muted-foreground">
        Toque para vincular. Ela passa a contar como avanço deste planejamento (sem etapa — aparece
        em "Ações sem etapa").
      </p>
      <div className="mt-4 space-y-2">
        {available.length === 0 && (
          <p className="p-4 text-center text-sm text-muted-foreground">Nenhuma ação disponível.</p>
        )}
        {available.map((e) => {
          return (
            <button
              key={e.id}
              onClick={async () => {
                await linkExecutionToGoal(e.id, goalId);
                onClose();
              }}
              className="card-surface flex w-full items-center gap-3 p-3 text-left hover:border-primary/40"
            >
              <CategoryIcon
                category={e.category}
                className="h-4 w-4 shrink-0 text-muted-foreground"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{e.title}</p>
                <p className="text-[11px] text-muted-foreground">
                  Prazo {formatDateBR(e.dueDate)}
                  {isScheduled(e)
                    ? ` · agendada ${formatDateBR(e.agendaDate!)} ${formatTime(e.startTime, profile.timeFormat)}`
                    : " · sem agenda"}
                  {e.goalId ? " · já vinculada a outro planejamento" : ""}
                </p>
              </div>
            </button>
          );
        })}
      </div>
    </Modal>
  );
}
