import { createFileRoute, Link, useNavigate, notFound } from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  Check,
  Plus,
  Star,
  AlertTriangle,
  Trash2,
  MapPin,
  Link2,
  CalendarClock,
  RotateCcw,
  Pencil,
  MoreVertical,
  Info,
  SlidersHorizontal,
} from "lucide-react";
import { categoryMeta } from "@/lib/mock-data";
import { CategoryIcon } from "@/components/plan/CategoryIcon";
import { GreenProgressBar } from "@/components/plan/GreenProgressBar";
import {
  ScheduleFields,
  scheduleTimesValid,
  type ScheduleValue,
} from "@/components/plan/ScheduleFields";
import { nextActionLabel, nextActionDeadlineLabel } from "@/components/plan/nextActionLabel";
import { useProfile } from "@/lib/profile-store";
import { formatTime } from "@/lib/format-utils";
import { nowDate } from "@/lib/test-clock";
import { Modal } from "@/components/ui/modal";
import { DateField } from "@/components/ui/date-wheel-picker";
import { ChartSkeleton } from "@/components/ui/chart-skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// recharts só entra no bundle quando a aba Evolução é aberta de fato — na aba
// Planejamento (a inicial) essa tela nem chega a baixar o gráfico.
const EvolutionTab = lazy(() =>
  import("@/components/plan/EvolutionTab").then((m) => ({ default: m.EvolutionTab })),
);
import {
  useGoalsStore,
  useGoalsLoading,
  addStep,
  toggleStep,
  removeStep,
  setCurrentStep,
  toggleSubtask,
  removeSubtask,
  createExecution,
  scheduleExecution,
  scheduleStepAsExecution,
  isScheduled,
  toggleExecutionDone,
  cancelExecution,
  removeExecution,
  patchExecution,
  rescheduleExecution,
  redistributeExecution,
  linkExecutionToGoal,
  goalProgress,
  goalPace,
  isPlanStalled,
  stepsForGoal,
  executionsForGoal,
  effectiveStatus,
  nextActionForGoal,
  relevantDate,
  formatDateBR,
  toISODate,
  addDays,
  todayISO,
  type Goal,
  type Step,
  type Execution,
  type TrackingType,
  type TaskWeight,
} from "@/lib/goals-store";

const trackingTypeLabel: Record<TrackingType, string> = {
  etapas: "Por etapas",
  frequencia: "Por frequência",
  numero: "Por número",
};

const weightOptions: { value: TaskWeight; label: string }[] = [
  { value: "leve", label: "~30 min" },
  { value: "medio", label: "~1h30" },
  { value: "pesado", label: "~2h30" },
];

export const Route = createFileRoute("/objetivo/$id")({
  head: ({ params }) => ({
    meta: [
      { title: `Objetivo — Norte` },
      { name: "description", content: `Acompanhamento do planejamento ${params.id}` },
    ],
  }),
  // Deep-link usado por "Definir próxima ação" (lista de planejamento e o
  // próprio módulo de Próxima ação): abre já com a etapa certa expandida e,
  // opcionalmente, o modal de nova execução dela aberto.
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

  const [tab, setTab] = useState<"planejamento" | "evolucao">("planejamento");
  const [showNewStepModal, setShowNewStepModal] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [showMoreOptions, setShowMoreOptions] = useState(false);
  const stepRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const execRefs = useRef<Record<string, HTMLElement | null>>({});
  const [flashId, setFlashId] = useState<string | null>(null);
  // Deep-link "Definir próxima ação" (vindo da lista ou do módulo Próxima
  // ação): expande a etapa certa e, se pedido, já abre o modal de nova
  // execução dela. Consumido uma vez — não força reabertura em cada render.
  const [autoOpenStepId, setAutoOpenStepId] = useState<string | null>(null);
  const [autoCreateStepId, setAutoCreateStepId] = useState<string | null>(null);

  // Hooks sempre chamados na mesma ordem — a checagem de goal ausente/carregando
  // vem depois, nunca pulando useMemo em algum render (regra dos hooks).
  const steps = useMemo(() => (goal ? stepsForGoal(allSteps, goal.id) : []), [allSteps, goal]);
  const executions = useMemo(
    () => (goal ? executionsForGoal(allExecutions, goal.id) : []),
    [allExecutions, goal],
  );

  useEffect(() => {
    if (!search.openStep) return;
    const stepId = search.openStep;
    setAutoOpenStepId(stepId);
    if (search.create) setAutoCreateStepId(stepId);
    setTab("planejamento");
    setFlashId(stepId);
    requestAnimationFrame(() => {
      setTimeout(() => {
        stepRefs.current[stepId]?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 50);
    });
    setTimeout(() => setFlashId(null), 2000);
  }, [search.openStep, search.create]);

  if (!goal) {
    if (loading) return null;
    throw notFound();
  }

  const cat = categoryMeta[goal.category] ?? categoryMeta.generico;
  const progress = goalProgress(goal, allSteps, allExecutions);
  const pace = goalPace(goal, allSteps, allExecutions);
  const stalled = isPlanStalled(goal, allSteps, allExecutions);
  const orphanExecutions = executions.filter((e) => !e.stepId);
  const hasDetails = !!(goal.finalOutcome || goal.how || goal.why);

  const goToItem = (target: { stepId?: string; executionId?: string }) => {
    setTab("planejamento");
    const id = target.executionId ?? target.stepId;
    if (!id) return;
    setFlashId(id);
    requestAnimationFrame(() => {
      setTimeout(() => {
        const el = target.executionId
          ? execRefs.current[target.executionId]
          : stepRefs.current[target.stepId!];
        el?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 50);
    });
    setTimeout(() => setFlashId(null), 2000);
  };

  const handleDefineNext = () => {
    if (steps.length === 0) {
      setTab("planejamento");
      setShowNewStepModal(true);
      return;
    }
    const openStep = steps.find((s) => !s.done) ?? steps[0];
    setAutoOpenStepId(openStep.id);
    goToItem({ stepId: openStep.id });
  };

  return (
    <div className="px-5 pt-12 pb-10">
      <div className="flex items-center justify-between">
        <button
          onClick={() => nav({ to: "/planejamento" })}
          className="-ml-2 flex h-9 w-9 items-center justify-center rounded-full hover:bg-surface"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          <CategoryIcon category={goal.category} className="h-3.5 w-3.5" /> {cat.label}
        </p>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              aria-label="Mais opções do planejamento"
              className="-mr-2 flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground hover:bg-surface hover:text-foreground"
            >
              <MoreVertical className="h-5 w-5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              disabled={!hasDetails}
              onSelect={() => setShowDetails(true)}
              className="gap-2"
            >
              <Info className="h-4 w-4" /> Detalhes do plano
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <header className="mt-4">
        <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
          {trackingTypeLabel[goal.trackingType]} · {goal.lifeArea}
          {goal.deadlineLabel ? ` · Prazo ${goal.deadlineLabel}` : ""}
        </p>
        <div className="mt-1 flex items-start justify-between gap-3">
          <h1 className="text-2xl font-bold tracking-tight text-balance-tight">{goal.title}</h1>
          <span
            className={`mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${pace === "behind" ? "bg-danger/15 text-danger" : pace === "ahead" ? "bg-warning/15 text-warning" : "bg-primary/15 text-primary"}`}
          >
            {progress}%
          </span>
        </div>
        <GreenProgressBar pct={progress} className="mt-2.5 h-1.5" />
      </header>

      {/* Tabs */}
      <div className="mt-5 flex gap-2">
        {(["planejamento", "evolucao"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`min-h-11 flex-1 rounded-xl py-2 text-[13px] font-semibold capitalize transition-colors ${tab === t ? "border border-primary text-primary" : "border border-transparent text-muted-foreground"}`}
          >
            {t === "planejamento" ? "Planejamento" : "Evolução"}
          </button>
        ))}
      </div>

      {tab === "planejamento" && (
        <div className="mt-5 space-y-3">
          {stalled && <StalledPlanAlert onDefineNext={handleDefineNext} />}

          <NextActionModule
            goal={goal}
            steps={steps}
            executions={executions}
            onDefineNext={handleDefineNext}
          />

          <div className="flex items-center gap-2 pt-2">
            <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
              Etapas
            </h2>
            <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
              {steps.length}
            </span>
          </div>
          {steps.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Nenhuma etapa ainda. Divida o planejamento em passos concretos.
            </p>
          )}
          {steps.map((s) => (
            <div
              key={s.id}
              ref={(el) => {
                stepRefs.current[s.id] = el;
              }}
            >
              <StepCard
                step={s}
                goal={goal}
                executions={executions.filter((e) => e.stepId === s.id)}
                flashId={flashId}
                execRefs={execRefs}
                forceExpand={autoOpenStepId === s.id}
                autoOpenCreate={autoCreateStepId === s.id}
                onAutoOpenConsumed={() => {
                  if (autoOpenStepId === s.id) setAutoOpenStepId(null);
                  if (autoCreateStepId === s.id) setAutoCreateStepId(null);
                }}
              />
            </div>
          ))}
          <button
            onClick={() => setShowNewStepModal(true)}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-primary/50 py-3 text-sm font-semibold text-primary hover:bg-primary/5"
          >
            <Plus className="h-4 w-4" /> Nova etapa
          </button>

          {orphanExecutions.length > 0 && (
            <>
              <h2 className="pt-2 text-sm font-bold uppercase tracking-wider text-muted-foreground">
                Execuções sem etapa
              </h2>
              <p className="text-[11px] text-muted-foreground">
                Contam como avanço do plano, mas ainda não pertencem a nenhuma etapa.
              </p>
              {orphanExecutions.map((e) => (
                <div
                  key={e.id}
                  ref={(el) => {
                    execRefs.current[e.id] = el;
                  }}
                >
                  <ExecutionItem
                    e={e}
                    allExecutions={allExecutions}
                    highlighted={flashId === e.id}
                    onUnlink={() => linkExecutionToGoal(e.id, null)}
                  />
                </div>
              ))}
            </>
          )}

          <button
            onClick={() => setShowMoreOptions(true)}
            className="card-surface flex w-full items-center gap-3 p-4 text-left hover:border-primary/40"
          >
            <SlidersHorizontal className="h-4 w-4 shrink-0 text-primary" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">Mais opções</p>
              <p className="text-[11px] text-muted-foreground">Vincular execução e editar plano</p>
            </div>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          </button>
        </div>
      )}

      {tab === "evolucao" && (
        <Suspense fallback={<ChartSkeleton height={220} />}>
          <EvolutionTab
            goal={goal}
            allSteps={allSteps}
            allExecutions={allExecutions}
            onNavigate={goToItem}
          />
        </Suspense>
      )}

      {showPicker && <ExecutionPicker goalId={goal.id} onClose={() => setShowPicker(false)} />}
      {showNewStepModal && <NewStepModal goal={goal} onClose={() => setShowNewStepModal(false)} />}
      {showDetails && <PlanDetailsModal goal={goal} onClose={() => setShowDetails(false)} />}
      {showMoreOptions && (
        <Modal onClose={() => setShowMoreOptions(false)} title="Mais opções">
          <div className="space-y-2">
            <button
              onClick={() => {
                setShowMoreOptions(false);
                setShowPicker(true);
              }}
              className="card-surface flex w-full items-center gap-3 p-3.5 text-left hover:border-primary/40"
            >
              <Link2 className="h-4 w-4 shrink-0 text-primary" />
              <span className="text-sm font-medium">Vincular execução existente</span>
            </button>
            {hasDetails && (
              <button
                onClick={() => {
                  setShowMoreOptions(false);
                  setShowDetails(true);
                }}
                className="card-surface flex w-full items-center gap-3 p-3.5 text-left hover:border-primary/40"
              >
                <Info className="h-4 w-4 shrink-0 text-primary" />
                <span className="text-sm font-medium">Detalhes do plano</span>
              </button>
            )}
          </div>
        </Modal>
      )}
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

function NewStepModal({ goal, onClose }: { goal: Goal; onClose: () => void }) {
  const [title, setTitle] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!title.trim() || saving) return;
    if (goal.deadlineISO && targetDate && targetDate > goal.deadlineISO) {
      setError(
        `Essa etapa não pode ter prazo depois do prazo do plano (${formatDateBR(goal.deadlineISO)}).`,
      );
      return;
    }
    setError("");
    setSaving(true);
    try {
      await addStep(goal.id, title.trim(), targetDate || undefined);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível criar. Tente de novo.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal onClose={onClose} title="Nova etapa">
      <label className="block">
        <span className="mb-1 block text-[11px] uppercase tracking-wider text-muted-foreground">
          O que precisa acontecer?
        </span>
        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Ex: Terminar capítulo 3"
          className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-sm outline-none focus:border-primary"
        />
      </label>
      <label className="mt-3 block">
        <span className="mb-1 block text-[11px] uppercase tracking-wider text-muted-foreground">
          Realizar até:
        </span>
        <DateField
          value={targetDate}
          onChange={(v) => {
            setTargetDate(v);
            setError("");
          }}
          className="flex w-full items-center gap-2 rounded-xl border border-border bg-surface px-3 py-3 text-left text-sm outline-none focus:border-primary"
        />
      </label>
      {error && <p className="mt-2 text-[11px] text-danger">{error}</p>}
      <div className="mt-4 flex gap-2">
        <button
          onClick={onClose}
          className="flex-1 rounded-xl border border-border bg-surface py-2.5 text-sm font-semibold"
        >
          Cancelar
        </button>
        <button
          disabled={!title.trim() || saving}
          onClick={save}
          className="flex-1 rounded-xl bg-primary py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
        >
          {saving ? "Criando…" : "Criar etapa"}
        </button>
      </div>
    </Modal>
  );
}

/** Módulo "Próxima ação" — sempre referencia a MESMA execução/etapa real (via
 * `nextActionForGoal`), nunca uma cópia; qualquer ação aqui atualiza o
 * registro original e reflete dentro do card da etapa automaticamente. */
function NextActionModule({
  goal,
  steps,
  executions,
  onDefineNext,
}: {
  goal: Goal;
  steps: Step[];
  executions: Execution[];
  onDefineNext: () => void;
}) {
  const [completing, setCompleting] = useState(false);
  const [scheduling, setScheduling] = useState(false);
  const [schedule, setSchedule] = useState<ScheduleValue>({
    date: todayISO(),
    startTime: "",
    endTime: "",
  });
  const [error, setError] = useState("");
  const action = nextActionForGoal(goal, steps, executions);

  if (action.kind === "none") {
    return (
      <Card label="Próxima ação">
        <p className="text-sm text-muted-foreground">Sem etapas abertas — adicione uma abaixo.</p>
      </Card>
    );
  }

  if (action.kind === "step" || action.kind === "define") {
    return (
      <Card label="Próxima ação">
        <p className="text-sm font-semibold leading-snug">{action.step.title}</p>
        {nextActionDeadlineLabel(action) && (
          <p className="mt-1 text-[11px] text-muted-foreground">
            {nextActionDeadlineLabel(action)}
          </p>
        )}
        <button
          onClick={onDefineNext}
          className="mt-3 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground"
        >
          Definir próxima execução
        </button>
      </Card>
    );
  }

  const execution = action.execution;
  const scheduled = isScheduled(execution);
  const valid = scheduleTimesValid(schedule);

  const confirmSchedule = async () => {
    if (!valid) return;
    setError("");
    try {
      if (scheduled) {
        await rescheduleExecution(
          execution.id,
          schedule.date,
          schedule.startTime,
          schedule.endTime,
          "reagendado no plano",
        );
      } else {
        await scheduleExecution(execution.id, schedule.date, schedule.startTime, schedule.endTime);
      }
      setScheduling(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível agendar. Tente de novo.");
    }
  };

  return (
    <div className="card-surface p-4">
      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
        Próxima ação
      </p>
      <div className="mt-2 flex items-start gap-3">
        <button
          disabled={completing}
          onClick={async () => {
            setCompleting(true);
            try {
              await toggleExecutionDone(execution.id);
            } finally {
              setCompleting(false);
            }
          }}
          aria-label="Concluir próxima ação"
          className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border border-border bg-surface-2 disabled:opacity-60"
        >
          {completing && <Check className="h-3.5 w-3.5 opacity-40" strokeWidth={3} />}
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold leading-snug">{execution.title}</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Até {formatDateBR(execution.dueDate)} · {scheduled ? "Agendada" : "Não agendada"}
          </p>
        </div>
      </div>
      {!scheduling ? (
        <button
          onClick={() => setScheduling(true)}
          className="mt-3 rounded-lg border border-primary/50 px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/5"
        >
          {scheduled ? "Reagendar" : "Agendar"}
        </button>
      ) : (
        <div className="mt-3 rounded-lg border border-border bg-surface-2 p-2.5">
          <ScheduleFields value={schedule} onChange={setSchedule} />
          {error && <p className="mt-1.5 text-[11px] text-danger">{error}</p>}
          <div className="mt-1.5 flex gap-1.5">
            <button
              disabled={!valid}
              onClick={confirmSchedule}
              className="rounded-md bg-primary px-2 py-1 text-[10px] font-semibold text-primary-foreground disabled:opacity-50"
            >
              ok
            </button>
            <button
              onClick={() => setScheduling(false)}
              className="text-[10px] text-muted-foreground"
            >
              cancelar
            </button>
          </div>
        </div>
      )}
    </div>
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
            Sem execução pendente, sem etapa atual definida e sem avanço nos últimos 14 dias.
          </p>
          <button
            onClick={onDefineNext}
            className="mt-2 rounded-lg bg-warning px-3 py-1.5 text-xs font-semibold text-background"
          >
            Definir próxima execução
          </button>
        </div>
      </div>
    </div>
  );
}

function StepCard({
  step,
  goal,
  executions,
  flashId,
  execRefs,
  forceExpand,
  autoOpenCreate,
  onAutoOpenConsumed,
}: {
  step: Step;
  goal: Goal;
  executions: Execution[];
  flashId: string | null;
  execRefs: React.MutableRefObject<Record<string, HTMLElement | null>>;
  forceExpand?: boolean;
  autoOpenCreate?: boolean;
  onAutoOpenConsumed?: () => void;
}) {
  const [expanded, setExpanded] = useState(!step.done);
  const [showNewExecModal, setShowNewExecModal] = useState(false);
  const [showStepScheduleModal, setShowStepScheduleModal] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [markingCurrent, setMarkingCurrent] = useState(false);
  const [pendingConfirm, setPendingConfirm] = useState(false);
  const [suggestionDismissed, setSuggestionDismissed] = useState(false);
  const [confirmRemoveStep, setConfirmRemoveStep] = useState(false);
  const nav = useNavigate();
  const subtasks = step.subtasks ?? [];

  useEffect(() => {
    if (forceExpand) setExpanded(true);
  }, [forceExpand]);

  useEffect(() => {
    if (autoOpenCreate) {
      setExpanded(true);
      setShowNewExecModal(true);
      onAutoOpenConsumed?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoOpenCreate]);

  const pendingExecs = executions.filter(
    (e) => e.status !== "concluida" && e.status !== "cancelada",
  );
  const allExecsDone = executions.length > 0 && pendingExecs.length === 0;
  const nextExecId = [...pendingExecs].sort((a, b) =>
    relevantDate(a).localeCompare(relevantDate(b)),
  )[0]?.id;

  const doToggle = async () => {
    setToggling(true);
    try {
      await toggleStep(step.id, step.done);
      setPendingConfirm(false);
    } finally {
      setToggling(false);
    }
  };

  const onCheckboxClick = () => {
    if (step.done) {
      void doToggle(); // reabrir é sempre direto, sem fricção
      return;
    }
    if (pendingExecs.length > 0) {
      setPendingConfirm(true);
      return;
    }
    void doToggle();
  };

  return (
    <div className="card-surface p-3.5">
      <div className="flex items-start gap-3">
        <button
          disabled={toggling}
          onClick={onCheckboxClick}
          aria-label={step.done ? "Reabrir etapa" : "Concluir etapa"}
          className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border disabled:opacity-60 ${step.done ? "border-primary bg-primary text-primary-foreground" : "border-border bg-surface-2"}`}
        >
          {step.done && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
        </button>
        <button className="min-w-0 flex-1 text-left" onClick={() => setExpanded((v) => !v)}>
          <div className="flex items-center gap-1.5">
            <p className={`text-sm font-medium ${step.done ? "line-through opacity-60" : ""}`}>
              {step.title}
            </p>
            {step.isCurrent && (
              <span className="flex shrink-0 items-center gap-1 text-[10px] font-semibold text-primary">
                <Star className="h-3 w-3 fill-primary" /> Etapa atual
              </span>
            )}
          </div>
          {(step.dueLabel || step.targetDate) && (
            <p className="mt-0.5 text-[11px] font-medium text-muted-foreground">
              {step.targetDate ? `Realizar até: ${formatDateBR(step.targetDate)}` : step.dueLabel}
            </p>
          )}
          {executions.length > 0 && (
            <p className="mt-1 text-[11px] text-primary">
              {executions.filter((e) => e.status === "concluida").length}/{executions.length}{" "}
              execuções concluídas
            </p>
          )}
        </button>
        <div className="flex shrink-0 items-center gap-2">
          {!step.done && (
            <button
              disabled={markingCurrent}
              onClick={async () => {
                setMarkingCurrent(true);
                try {
                  await setCurrentStep(goal.id, step.isCurrent ? null : step.id);
                } finally {
                  setMarkingCurrent(false);
                }
              }}
              title={step.isCurrent ? "Remover como etapa atual" : "Marcar como etapa atual"}
              aria-label={step.isCurrent ? "Remover como etapa atual" : "Marcar como etapa atual"}
              className={`disabled:opacity-50 ${step.isCurrent ? "text-primary" : "text-muted-foreground hover:text-primary"}`}
            >
              <Star className={`h-3.5 w-3.5 ${step.isCurrent ? "fill-primary" : ""}`} />
            </button>
          )}
          {!confirmRemoveStep ? (
            <button
              onClick={() => setConfirmRemoveStep(true)}
              aria-label="Excluir etapa"
              className="text-muted-foreground hover:text-danger"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          ) : (
            <div className="flex items-center gap-1">
              <button
                onClick={async () => {
                  await removeStep(step.id);
                }}
                className="rounded-md bg-danger px-1.5 py-0.5 text-[10px] font-semibold text-white"
              >
                excluir
              </button>
              <button
                onClick={() => setConfirmRemoveStep(false)}
                className="text-[10px] text-muted-foreground"
              >
                cancelar
              </button>
            </div>
          )}
          <button
            onClick={() => setExpanded((v) => !v)}
            aria-label={expanded ? "Recolher etapa" : "Expandir etapa"}
            className="text-muted-foreground hover:text-foreground"
          >
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {pendingConfirm && (
        <div className="mt-2.5 rounded-lg border border-warning/30 bg-warning/10 p-2.5">
          <p className="text-[11px] text-foreground">
            Esta etapa ainda tem {pendingExecs.length} execuç
            {pendingExecs.length === 1 ? "ão" : "ões"} pendente
            {pendingExecs.length === 1 ? "" : "s"}. O que prefere?
          </p>
          <div className="mt-1.5 flex gap-1.5">
            <button
              onClick={() => setPendingConfirm(false)}
              className="rounded-lg border border-border bg-surface px-2.5 py-1.5 text-[11px] font-semibold"
            >
              Voltar e concluir as execuções
            </button>
            <button
              disabled={toggling}
              onClick={doToggle}
              className="rounded-lg bg-warning px-2.5 py-1.5 text-[11px] font-semibold text-background disabled:opacity-50"
            >
              Concluir mesmo assim
            </button>
          </div>
        </div>
      )}

      {allExecsDone && !step.done && !suggestionDismissed && !pendingConfirm && (
        <div className="mt-2.5 rounded-lg border border-primary/30 bg-primary/5 p-2.5">
          <p className="text-[11px] text-foreground">
            Todas as execuções foram concluídas. Concluir esta etapa?
          </p>
          <div className="mt-1.5 flex gap-1.5">
            <button
              disabled={toggling}
              onClick={doToggle}
              className="rounded-lg bg-primary px-2.5 py-1.5 text-[11px] font-semibold text-primary-foreground disabled:opacity-50"
            >
              Concluir etapa
            </button>
            <button
              onClick={() => setSuggestionDismissed(true)}
              className="rounded-lg border border-dashed border-border px-2.5 py-1.5 text-[11px] text-muted-foreground"
            >
              agora não
            </button>
          </div>
        </div>
      )}

      {expanded && (
        <div className="mt-2.5 space-y-2.5 border-t border-border pt-2.5">
          {executions.length === 0 && !step.done && (
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => setShowStepScheduleModal(true)}
                className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-[11px] font-semibold text-primary-foreground"
              >
                <CalendarClock className="h-3.5 w-3.5" /> Colocar etapa na agenda
              </button>
              <button
                onClick={() => nav({ to: "/criar", search: { modo: "agenda", stepId: step.id } })}
                className="text-[11px] font-semibold text-muted-foreground underline decoration-dotted"
              >
                abrir na Agenda completa
              </button>
            </div>
          )}

          {executions.length > 0 && (
            <div className="ml-2 space-y-2 border-l border-border pl-4">
              {executions.map((e) => (
                <div
                  key={e.id}
                  ref={(el) => {
                    execRefs.current[e.id] = el;
                  }}
                >
                  <ExecutionItem
                    e={e}
                    allExecutions={executions}
                    highlighted={flashId === e.id}
                    isNext={e.id === nextExecId}
                    compact
                  />
                </div>
              ))}
            </div>
          )}

          {!step.done && (
            <button
              onClick={() => setShowNewExecModal(true)}
              className="flex items-center gap-1 text-[11px] font-semibold text-primary"
            >
              <Plus className="h-3 w-3" /> Nova execução
            </button>
          )}

          {subtasks.length > 0 && (
            <ul className="space-y-1.5 border-t border-border pt-2.5">
              {subtasks.map((sub) => (
                <li key={sub.id} className="flex items-center gap-2">
                  <button
                    onClick={async () => {
                      await toggleSubtask(step.id, sub.id, sub.done);
                    }}
                    className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${sub.done ? "border-primary bg-primary text-primary-foreground" : "border-border bg-surface-2"}`}
                  >
                    {sub.done && <Check className="h-2.5 w-2.5" strokeWidth={3} />}
                  </button>
                  <span
                    className={`flex-1 text-xs ${sub.done ? "text-muted-foreground line-through" : ""}`}
                  >
                    {sub.title}
                  </span>
                  <button
                    onClick={async () => {
                      await removeSubtask(step.id, sub.id);
                    }}
                    className="shrink-0 text-muted-foreground hover:text-danger"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {showStepScheduleModal && (
        <StepScheduleModal
          step={step}
          goal={goal}
          onClose={() => setShowStepScheduleModal(false)}
        />
      )}
      {showNewExecModal && (
        <NewExecutionModal step={step} goal={goal} onClose={() => setShowNewExecModal(false)} />
      )}
    </div>
  );
}

/** "Colocar etapa na agenda" — só oferecido enquanto a etapa não tem nenhuma
 * execução própria; cria a execução derivada já agendada (scheduleStepAsExecution),
 * sem duplicar nada assim que a execução passa a existir. */
function StepScheduleModal({
  step,
  goal,
  onClose,
}: {
  step: Step;
  goal: Goal;
  onClose: () => void;
}) {
  const [value, setValue] = useState<ScheduleValue>({
    date: todayISO(),
    startTime: "",
    endTime: "",
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const valid = scheduleTimesValid(value);

  const confirm = async () => {
    if (!valid || busy) return;
    setError("");
    setBusy(true);
    try {
      await scheduleStepAsExecution(step, goal, value.date, value.startTime, value.endTime);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível agendar. Tente de novo.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal onClose={onClose} title="Colocar etapa na agenda">
      <p className="text-sm font-medium text-balance-tight">{step.title}</p>
      <div className="mt-3">
        <ScheduleFields value={value} onChange={setValue} disabled={busy} size="md" />
      </div>
      {error && <p className="mt-2 text-[11px] text-danger">{error}</p>}
      <button
        disabled={!valid || busy}
        onClick={confirm}
        className="mt-4 w-full rounded-xl bg-primary py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
      >
        {busy ? "Agendando…" : "Confirmar"}
      </button>
    </Modal>
  );
}

/** Nova execução dentro de uma etapa — cria já com `goalId`+`stepId` (nunca
 * uma etapa independente) e, na sequência, oferece agendar ou deixar para
 * depois sem sair do modal ("sem inputs permanentes na tela"). */
function NewExecutionModal({
  step,
  goal,
  onClose,
}: {
  step: Step;
  goal: Goal;
  onClose: () => void;
}) {
  const [form, setForm] = useState({
    title: "",
    dueDate: "",
    weight: undefined as TaskWeight | undefined,
  });
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [schedule, setSchedule] = useState<ScheduleValue>({
    date: todayISO(),
    startTime: "",
    endTime: "",
  });
  const [scheduleError, setScheduleError] = useState("");
  const [scheduling, setScheduling] = useState(false);

  const dueLimit = step.targetDate ?? goal.deadlineISO;
  const dueLimitLabel = step.targetDate
    ? `a etapa (${formatDateBR(step.targetDate)})`
    : goal.deadlineISO
      ? `o plano (${formatDateBR(goal.deadlineISO)})`
      : "";

  const save = async () => {
    if (!form.title || !form.dueDate || saving) return;
    if (dueLimit && form.dueDate > dueLimit) {
      setFormError(`O prazo da execução não pode ser depois do prazo d${dueLimitLabel}.`);
      return;
    }
    setFormError("");
    setSaving(true);
    try {
      const id = await createExecution({
        title: form.title,
        dueDate: form.dueDate,
        category: goal.category,
        weight: form.weight ?? "medio",
        goalId: goal.id,
        stepId: step.id,
      });
      setCreatedId(id);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Não foi possível criar. Tente de novo.");
    } finally {
      setSaving(false);
    }
  };

  const valid = scheduleTimesValid(schedule);
  const confirmSchedule = async () => {
    if (!createdId || !valid || scheduling) return;
    setScheduleError("");
    setScheduling(true);
    try {
      await scheduleExecution(createdId, schedule.date, schedule.startTime, schedule.endTime);
      onClose();
    } catch (err) {
      setScheduleError(
        err instanceof Error ? err.message : "Não foi possível agendar. Tente de novo.",
      );
    } finally {
      setScheduling(false);
    }
  };

  if (createdId) {
    return (
      <Modal onClose={onClose} title="Execução criada">
        <p className="text-sm text-balance-tight">
          "{form.title}" criada. Prazo: {formatDateBR(form.dueDate)}.
        </p>
        {!scheduleOpen ? (
          <div className="mt-4 flex gap-2">
            <button
              onClick={() => setScheduleOpen(true)}
              className="flex-1 rounded-xl bg-primary py-2.5 text-sm font-semibold text-primary-foreground"
            >
              Adicionar à agenda
            </button>
            <button
              onClick={onClose}
              className="flex-1 rounded-xl border border-border bg-surface py-2.5 text-sm font-semibold text-muted-foreground"
            >
              Deixar para depois
            </button>
          </div>
        ) : (
          <div className="mt-4">
            <ScheduleFields
              value={schedule}
              onChange={setSchedule}
              disabled={scheduling}
              size="md"
            />
            {scheduleError && <p className="mt-2 text-[11px] text-danger">{scheduleError}</p>}
            <button
              disabled={!valid || scheduling}
              onClick={confirmSchedule}
              className="mt-3 w-full rounded-xl bg-primary py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
            >
              {scheduling ? "Agendando…" : "Confirmar na agenda"}
            </button>
          </div>
        )}
      </Modal>
    );
  }

  return (
    <Modal onClose={onClose} title="Nova execução">
      <label className="block">
        <span className="mb-1 block text-[11px] uppercase tracking-wider text-muted-foreground">
          O que precisa ser feito?
        </span>
        <input
          autoFocus
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
          placeholder="Ex: Pesquisar três concorrentes"
          className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-sm outline-none focus:border-primary"
        />
      </label>
      <div className="mt-3">
        <DateField
          label="Realizar até quando?"
          value={form.dueDate}
          onChange={(v) => {
            setForm({ ...form, dueDate: v });
            setFormError("");
          }}
          className="flex w-full items-center gap-2 rounded-xl border border-border bg-surface px-3 py-3 text-left text-sm outline-none focus:border-primary"
        />
      </div>
      <div className="mt-3">
        <span className="mb-1 block text-[11px] uppercase tracking-wider text-muted-foreground">
          Duração estimada (opcional)
        </span>
        <div className="flex gap-1.5">
          {weightOptions.map((w) => (
            <button
              key={w.value}
              type="button"
              onClick={() =>
                setForm({ ...form, weight: form.weight === w.value ? undefined : w.value })
              }
              className={`flex-1 rounded-lg border px-2 py-1.5 text-[11px] font-semibold ${form.weight === w.value ? "border-primary/40 bg-primary/10 text-primary" : "border-border bg-surface text-muted-foreground"}`}
            >
              {w.label}
            </button>
          ))}
        </div>
      </div>
      {formError && <p className="mt-2 text-[11px] text-danger">{formError}</p>}
      <button
        disabled={!form.title || !form.dueDate || saving}
        onClick={save}
        className="mt-4 w-full rounded-xl bg-primary py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
      >
        {saving ? "Criando…" : "Criar execução"}
      </button>
    </Modal>
  );
}

function statusMeta(status: ReturnType<typeof effectiveStatus>) {
  if (status === "concluida") return { label: "concluída", tone: "bg-success/15 text-success" };
  if (status === "perdida") return { label: "atrasada", tone: "bg-danger/15 text-danger" };
  if (status === "cancelada")
    return { label: "descartada", tone: "bg-surface-2 text-muted-foreground" };
  return { label: "pendente", tone: "bg-primary/15 text-primary" };
}

/** Execução dentro de uma etapa (ou órfã) — checkbox pra concluir/reabrir, prazo, estado,
 * agenda/redistribuir, editar, e um menu secundário só com excluir + confirmação. */
function ExecutionItem({
  e,
  allExecutions,
  highlighted,
  compact,
  isNext,
  onUnlink,
}: {
  e: Execution;
  allExecutions: Execution[];
  highlighted?: boolean;
  compact?: boolean;
  isNext?: boolean;
  onUnlink?: () => void;
}) {
  const status = effectiveStatus(e);
  const meta = statusMeta(status);
  const scheduled = isScheduled(e);
  const profile = useProfile();
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);
  const [rescheduling, setRescheduling] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({ title: e.title, dueDate: e.dueDate });
  const [confirmAction, setConfirmAction] = useState<"discard" | "delete" | null>(null);
  const [schedule, setSchedule] = useState<ScheduleValue>({
    date: e.agendaDate ?? toISODate(addDays(nowDate(), 1)),
    startTime: e.startTime ?? "",
    endTime: e.endTime ?? "",
  });
  const timesValid = scheduleTimesValid(schedule);

  const run = async (fn: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };

  const confirmSchedule = () =>
    run(async () => {
      if (!schedule.date || !timesValid) return;
      if (scheduled) {
        await rescheduleExecution(
          e.id,
          schedule.date,
          schedule.startTime,
          schedule.endTime,
          "reagendado no plano",
        );
      } else {
        await scheduleExecution(e.id, schedule.date, schedule.startTime, schedule.endTime);
      }
      setRescheduling(false);
    });

  const saveEdit = () =>
    run(async () => {
      if (!editForm.title.trim() || !editForm.dueDate) return;
      await patchExecution(e.id, { title: editForm.title.trim(), dueDate: editForm.dueDate });
      setEditing(false);
    });

  return (
    <div
      className={`rounded-lg border p-2.5 transition-colors ${highlighted ? "border-primary bg-primary/5" : "border-border bg-surface-2"}`}
    >
      <div className="flex items-start gap-2.5">
        <button
          disabled={busy}
          onClick={() => run(() => toggleExecutionDone(e.id))}
          aria-label={status === "concluida" ? "Reabrir execução" : "Concluir execução"}
          className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border disabled:opacity-50 ${status === "concluida" ? "border-primary bg-primary text-primary-foreground" : "border-border bg-surface"}`}
        >
          {status === "concluida" && <Check className="h-2.5 w-2.5" strokeWidth={3} />}
        </button>
        <div className="min-w-0 flex-1">
          {!editing ? (
            <div className="flex flex-wrap items-center gap-1.5">
              <p
                className={`text-xs font-medium ${status === "concluida" ? "text-muted-foreground line-through" : ""} ${compact ? "" : "text-sm"}`}
              >
                {e.title}
              </p>
              {isNext && status === "planejada" && (
                <span className="rounded-full bg-primary/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-primary">
                  Próxima
                </span>
              )}
            </div>
          ) : (
            <div className="space-y-1">
              <input
                value={editForm.title}
                onChange={(ev) => setEditForm({ ...editForm, title: ev.target.value })}
                className="w-full rounded-md border border-border bg-surface px-2 py-1 text-xs outline-none focus:border-primary"
              />
              <DateField
                value={editForm.dueDate}
                onChange={(v) => setEditForm({ ...editForm, dueDate: v })}
                className="flex w-full items-center gap-2 rounded-md border border-border bg-surface px-2 py-1 text-left text-xs outline-none focus:border-primary"
              />
              <div className="flex gap-1.5">
                <button
                  disabled={busy}
                  onClick={saveEdit}
                  className="rounded-md bg-primary px-2 py-1 text-[10px] font-semibold text-primary-foreground disabled:opacity-50"
                >
                  salvar
                </button>
                <button
                  onClick={() => {
                    setEditing(false);
                    setEditForm({ title: e.title, dueDate: e.dueDate });
                  }}
                  className="text-[10px] text-muted-foreground"
                >
                  cancelar
                </button>
              </div>
            </div>
          )}
          {!editing && (
            <>
              <p className="mt-0.5 text-[10px] text-muted-foreground">
                Prazo: {formatDateBR(e.dueDate)}
                {scheduled
                  ? ` · agendada ${formatDateBR(e.agendaDate!)} ${formatTime(e.startTime, profile.timeFormat)}`
                  : " · Não agendada"}
              </p>
              {e.location && (
                <p className="mt-0.5 flex items-center gap-1 text-[10px] text-muted-foreground">
                  <MapPin className="h-2.5 w-2.5" />
                  {e.location}
                </p>
              )}
              <span
                className={`mt-1 inline-block rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${meta.tone}`}
              >
                {meta.label}
              </span>
            </>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {(status === "planejada" || status === "perdida") && !editing && !rescheduling && (
            <button
              onClick={() => setRescheduling(true)}
              className="flex items-center gap-1 rounded-lg border border-primary/40 px-2 py-1 text-[10px] font-semibold text-primary hover:bg-primary/5"
            >
              <CalendarClock className="h-3 w-3" />
              {scheduled ? "Reagendar" : "Agenda"}
            </button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                aria-label="Mais ações"
                className="text-muted-foreground hover:text-foreground"
              >
                <MoreVertical className="h-3.5 w-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onSelect={() =>
                  nav({ to: "/criar", search: { modo: "agenda", executionId: e.id } })
                }
                className="gap-2"
              >
                <CalendarClock className="h-3.5 w-3.5" /> Agenda completa
              </DropdownMenuItem>
              {(status === "planejada" || status === "perdida") && (
                <>
                  <DropdownMenuItem
                    onSelect={() => run(() => redistributeExecution(e.id, allExecutions))}
                    className="gap-2"
                  >
                    <RotateCcw className="h-3.5 w-3.5" /> Redistribuir
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setEditing(true)} className="gap-2">
                    <Pencil className="h-3.5 w-3.5" /> Editar
                  </DropdownMenuItem>
                </>
              )}
              {onUnlink && (
                <DropdownMenuItem onSelect={onUnlink} className="gap-2">
                  <Link2 className="h-3.5 w-3.5" /> Desvincular do plano
                </DropdownMenuItem>
              )}
              {(status === "planejada" || status === "perdida") && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onSelect={() => setConfirmAction("discard")}
                    className="gap-2 text-danger"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Descartar
                  </DropdownMenuItem>
                </>
              )}
              <DropdownMenuItem
                onSelect={() => setConfirmAction("delete")}
                className="gap-2 text-danger"
              >
                <Trash2 className="h-3.5 w-3.5" /> Excluir definitivamente
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {confirmAction && (
        <div className="mt-2 rounded-lg border border-danger/30 bg-danger/10 p-2.5">
          <p className="text-[11px] text-foreground">
            {confirmAction === "discard"
              ? "Descartar esta execução?"
              : "Excluir definitivamente? Não pode ser desfeito."}
          </p>
          <div className="mt-1.5 flex gap-1.5">
            <button
              disabled={busy}
              onClick={() =>
                run(async () => {
                  if (confirmAction === "discard")
                    await cancelExecution(e.id, "descartado no plano");
                  else await removeExecution(e.id);
                  setConfirmAction(null);
                })
              }
              className="rounded-lg bg-danger px-2.5 py-1.5 text-[11px] font-semibold text-white disabled:opacity-50"
            >
              Confirmar
            </button>
            <button
              onClick={() => setConfirmAction(null)}
              className="text-[11px] text-muted-foreground"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {rescheduling && !editing && (
        <div className="mt-2 rounded-lg border border-border bg-surface p-2.5">
          <ScheduleFields value={schedule} onChange={setSchedule} disabled={busy} />
          <div className="mt-1.5 flex gap-1.5">
            <button
              onClick={confirmSchedule}
              disabled={busy || !timesValid}
              className="rounded-md bg-primary px-2 py-1 text-[10px] font-semibold text-primary-foreground disabled:opacity-50"
            >
              ok
            </button>
            <button
              onClick={() => setRescheduling(false)}
              className="text-[10px] text-muted-foreground"
            >
              cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ExecutionPicker({ goalId, onClose }: { goalId: string; onClose: () => void }) {
  const executions = useGoalsStore((s) => s.executions);
  const profile = useProfile();
  const available = executions.filter((e) => e.goalId !== goalId && e.status === "planejada");
  return (
    <Modal onClose={onClose} title="Vincular execução">
      <p className="text-xs text-muted-foreground">
        Toque para vincular. Ela passa a contar como avanço deste planejamento (sem etapa — aparece
        em "Execuções sem etapa").
      </p>
      <div className="mt-4 space-y-2">
        {available.length === 0 && (
          <p className="p-4 text-center text-sm text-muted-foreground">
            Nenhuma execução disponível.
          </p>
        )}
        {available.map((e) => {
          const c = categoryMeta[e.category] ?? categoryMeta.generico;
          return (
            <button
              key={e.id}
              onClick={async () => {
                await linkExecutionToGoal(e.id, goalId);
                onClose();
              }}
              className="card-surface flex w-full items-center gap-3 p-3 text-left hover:border-primary/40"
            >
              <span className="text-base">{c.emoji}</span>
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
