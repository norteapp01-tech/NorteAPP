import { useEffect, useMemo, useState } from "react";
import { Ban, Check, ChevronRight, Clock3, Play } from "lucide-react";
import { ProgressRing } from "@/components/ui/progress-ring";
import {
  daysBetweenISO,
  estimatedCompletionDate,
  executionsForGoal,
  formatDateShortBR,
  goalProgress,
  isExecutionBlocked,
  stepFlowStatus,
  stepsForGoal,
  todayISO,
  type Execution,
  type Goal,
  type Step,
  type StepFlowStatus,
} from "@/lib/goals-store";

type Filter = "completed" | "active" | "delayed" | "blocked";

const filterMeta: Record<
  Filter,
  { label: string; icon: typeof Check; tone: string; selected: string }
> = {
  completed: {
    label: "Concluídas",
    icon: Check,
    tone: "text-primary",
    selected: "border-primary/45 bg-primary/8",
  },
  active: {
    label: "Em andamento",
    icon: Play,
    tone: "text-foreground",
    selected: "border-foreground/25 bg-surface-2",
  },
  delayed: {
    label: "Atrasadas",
    icon: Clock3,
    tone: "text-danger",
    selected: "border-danger/35 bg-danger/8",
  },
  blocked: {
    label: "Bloqueadas",
    icon: Ban,
    tone: "text-danger",
    selected: "border-danger/35 bg-danger/8",
  },
};

function filterFor(status: StepFlowStatus): Filter {
  if (status === "completed") return "completed";
  if (status === "delayed") return "delayed";
  if (status === "blocked") return "blocked";
  return "active";
}

export function EvolutionTab({
  goal,
  allSteps,
  allExecutions,
  onNavigate,
}: {
  goal: Goal;
  allSteps: Step[];
  allExecutions: Execution[];
  onNavigate: (target: { stepId?: string; executionId?: string }) => void;
}) {
  const steps = useMemo(() => stepsForGoal(allSteps, goal.id), [allSteps, goal.id]);
  const executions = useMemo(
    () => executionsForGoal(allExecutions, goal.id),
    [allExecutions, goal.id],
  );
  const statuses = useMemo(
    () => new Map(steps.map((step) => [step.id, stepFlowStatus(step, executions)])),
    [steps, executions],
  );
  const counts = useMemo(
    () =>
      steps.reduce<Record<Filter, number>>(
        (result, step) => {
          result[filterFor(statuses.get(step.id) ?? "next")] += 1;
          return result;
        },
        { completed: 0, active: 0, delayed: 0, blocked: 0 },
      ),
    [steps, statuses],
  );
  const initialFilter =
    (Object.keys(counts) as Filter[]).find((key) => counts[key] > 0) ?? "active";
  const [filter, setFilter] = useState<Filter>(initialFilter);

  useEffect(() => {
    if (counts[filter] > 0 || steps.length === 0) return;
    const next = (Object.keys(counts) as Filter[]).find((key) => counts[key] > 0);
    if (next) setFilter(next);
  }, [counts, filter, steps.length]);

  const progress = goalProgress(goal, allSteps, allExecutions);
  const completed = counts.completed;
  const remainingDays = goal.deadlineISO ? daysBetweenISO(todayISO(), goal.deadlineISO) : null;
  const forecastISO = estimatedCompletionDate(goal, allSteps, allExecutions);
  const forecastDifference =
    forecastISO && goal.deadlineISO ? daysBetweenISO(goal.deadlineISO, forecastISO) : null;
  const expectedProgress = useMemo(() => {
    if (!goal.deadlineISO) return null;
    const total = Math.max(1, daysBetweenISO(goal.createdAt.slice(0, 10), goal.deadlineISO));
    const elapsed = Math.max(0, daysBetweenISO(goal.createdAt.slice(0, 10), todayISO()));
    return Math.min(100, Math.round((elapsed / total) * 100));
  }, [goal.createdAt, goal.deadlineISO]);

  const selectedSteps = steps.filter(
    (step) => filterFor(statuses.get(step.id) ?? "next") === filter,
  );
  const blockedExecutions = executions.filter(
    (execution) =>
      execution.status !== "concluida" &&
      execution.status !== "cancelada" &&
      execution.status !== "reagendada" &&
      isExecutionBlocked(execution, executions),
  );
  const bottleneck = blockedExecutions
    .map((execution) => ({
      execution,
      affected: executions.filter(
        (candidate) =>
          candidate.dependsOnExecutionId === execution.id && candidate.status !== "concluida",
      ).length,
    }))
    .sort((a, b) => b.affected - a.affected)[0];

  return (
    <div className="plan-evolution">
      <section className="plan-evolution-card is-summary card-surface">
        <div className="flex items-center gap-5">
          <ProgressRing value={progress} label={`${progress}% do plano concluído`} size={94}>
            <span className="text-xl font-bold">{progress}%</span>
          </ProgressRing>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              Visão geral
            </p>
            <p className="mt-1 text-xl font-bold">
              {completed} de {steps.length} etapas
            </p>
            <p
              className={`mt-1 text-sm font-semibold ${remainingDays !== null && remainingDays < 0 ? "text-danger" : "text-primary"}`}
            >
              {remainingDays === null
                ? "Sem prazo definido"
                : remainingDays < 0
                  ? `${Math.abs(remainingDays)} ${Math.abs(remainingDays) === 1 ? "dia" : "dias"} além do prazo`
                  : remainingDays === 0
                    ? "Prazo termina hoje"
                    : `${remainingDays} ${remainingDays === 1 ? "dia restante" : "dias restantes"}`}
            </p>
          </div>
        </div>
      </section>

      <section className="plan-evolution-card card-surface">
        <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
          Etapas · {steps.length} no total
        </p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {(Object.keys(filterMeta) as Filter[]).map((key) => {
            const item = filterMeta[key];
            const Icon = item.icon;
            const selected = filter === key;
            return (
              <button
                key={key}
                onClick={() => setFilter(key)}
                className={`min-h-[72px] rounded-2xl border p-3 text-left transition-colors ${selected ? item.selected : "border-border-quiet bg-surface-2/45"}`}
                aria-pressed={selected}
              >
                <div className="flex items-center justify-between">
                  <Icon className={`h-4 w-4 ${item.tone}`} />
                  <span className={`text-xl font-bold ${item.tone}`}>{counts[key]}</span>
                </div>
                <span className="mt-2 block text-[11px] font-semibold text-muted-foreground">
                  {item.label}
                </span>
              </button>
            );
          })}
        </div>

        <div className="mt-3 divide-y divide-border-quiet rounded-2xl border border-border-quiet bg-surface-2/35 px-3">
          {selectedSteps.length === 0 && (
            <p className="py-4 text-center text-xs text-muted-foreground">
              Nenhuma etapa nesta situação.
            </p>
          )}
          {selectedSteps.map((step) => {
            const status = statuses.get(step.id) ?? "next";
            const lateDays =
              status === "delayed" && step.targetDate
                ? Math.max(1, daysBetweenISO(step.targetDate, todayISO()))
                : null;
            return (
              <button
                key={step.id}
                onClick={() => onNavigate({ stepId: step.id })}
                className="flex min-h-12 w-full items-center gap-3 py-2.5 text-left"
              >
                <span
                  className={`h-2 w-2 shrink-0 rounded-full ${status === "completed" ? "bg-primary" : status === "delayed" || status === "blocked" ? "bg-danger" : "bg-muted-foreground"}`}
                />
                <span className="min-w-0 flex-1 truncate text-sm font-semibold">{step.title}</span>
                {lateDays && (
                  <span className="text-[11px] font-semibold text-danger">{lateDays}d</span>
                )}
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              </button>
            );
          })}
        </div>
      </section>

      <section className="plan-evolution-card card-surface">
        <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
          Previsão
        </p>
        <div className="mt-3 flex items-end justify-between gap-4">
          <div>
            <p className="text-[11px] text-muted-foreground">Mantendo o ritmo atual</p>
            <p className="mt-1 text-lg font-bold">
              {forecastISO ? formatDateShortBR(forecastISO) : "Ainda sem dados"}
            </p>
          </div>
          {forecastDifference !== null && (
            <span
              className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${forecastDifference > 0 ? "bg-danger/10 text-danger" : "bg-primary/10 text-primary"}`}
            >
              {forecastDifference > 0
                ? `${forecastDifference}d depois`
                : forecastDifference < 0
                  ? `${Math.abs(forecastDifference)}d antes`
                  : "no prazo"}
            </span>
          )}
        </div>
        {expectedProgress !== null && (
          <div className="mt-5 space-y-3">
            <div>
              <div className="mb-1.5 flex justify-between text-[10px] text-muted-foreground">
                <span>Realizado</span>
                <span>{progress}%</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-border-quiet">
                <div className="h-full rounded-full bg-primary" style={{ width: `${progress}%` }} />
              </div>
            </div>
            <div>
              <div className="mb-1.5 flex justify-between text-[10px] text-muted-foreground">
                <span>Esperado hoje</span>
                <span>{expectedProgress}%</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-border-quiet">
                <div
                  className="h-full rounded-full bg-muted-foreground/65"
                  style={{ width: `${expectedProgress}%` }}
                />
              </div>
            </div>
          </div>
        )}
      </section>

      <section className="plan-evolution-card card-surface">
        <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
          Gargalo atual
        </p>
        {bottleneck ? (
          <button
            onClick={() =>
              onNavigate({
                stepId: bottleneck.execution.stepId,
                executionId: bottleneck.execution.id,
              })
            }
            className="mt-3 flex w-full items-center gap-3 rounded-2xl border border-danger/20 bg-danger/6 p-3 text-left"
          >
            <Ban className="h-5 w-5 shrink-0 text-danger" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">
                {bottleneck.execution.title}
              </span>
              <span className="mt-0.5 block text-[11px] text-muted-foreground">
                {bottleneck.affected > 0
                  ? `segura ${bottleneck.affected} ${bottleneck.affected === 1 ? "próxima ação" : "próximas ações"}`
                  : bottleneck.execution.blockedReason || "precisa ser destravada"}
              </span>
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          </button>
        ) : (
          <div className="mt-3 flex items-center gap-2 rounded-2xl border border-border-quiet bg-surface-2/35 p-3 text-sm text-muted-foreground">
            <Check className="h-4 w-4 text-primary" /> Nenhum bloqueio no caminho.
          </div>
        )}
      </section>
    </div>
  );
}
