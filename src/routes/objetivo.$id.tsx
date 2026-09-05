import { createFileRoute, Link, useNavigate, notFound } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import {
  ChevronLeft,
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
} from "lucide-react";
import { categoryMeta } from "@/lib/mock-data";
import { useProfile } from "@/lib/profile-store";
import { formatTime } from "@/lib/format-utils";
import { nowDate } from "@/lib/test-clock";
import { Modal } from "@/components/ui/modal";
import { DateField } from "@/components/ui/date-wheel-picker";
import { EvolutionTab } from "@/components/plan/EvolutionTab";
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
  const nav = useNavigate();
  const goal = useGoalsStore((s) => s.goals.find((g) => g.id === id));
  const allSteps = useGoalsStore((s) => s.steps);
  const allExecutions = useGoalsStore((s) => s.executions);
  const loading = useGoalsLoading();

  const [tab, setTab] = useState<"planejamento" | "evolucao">("planejamento");
  const [newStep, setNewStep] = useState("");
  const [newStepDate, setNewStepDate] = useState("");
  const [stepDateError, setStepDateError] = useState("");
  const [showPicker, setShowPicker] = useState(false);
  const [addingStep, setAddingStep] = useState(false);
  const stepRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const execRefs = useRef<Record<string, HTMLElement | null>>({});
  const newStepFormRef = useRef<HTMLFormElement | null>(null);
  const newStepTitleInputRef = useRef<HTMLInputElement | null>(null);
  const [flashId, setFlashId] = useState<string | null>(null);

  // Hooks sempre chamados na mesma ordem — a checagem de goal ausente/carregando
  // vem depois, nunca pulando useMemo em algum render (regra dos hooks).
  const steps = useMemo(() => (goal ? stepsForGoal(allSteps, goal.id) : []), [allSteps, goal]);
  const executions = useMemo(
    () => (goal ? executionsForGoal(allExecutions, goal.id) : []),
    [allExecutions, goal],
  );

  if (!goal) {
    if (loading) return null;
    throw notFound();
  }

  const cat = categoryMeta[goal.category] ?? categoryMeta.generico;
  const progress = goalProgress(goal, allSteps, allExecutions);
  const pace = goalPace(goal, allSteps, allExecutions);
  const stalled = isPlanStalled(goal, allSteps, allExecutions);
  const orphanExecutions = executions.filter((e) => !e.stepId);

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
      requestAnimationFrame(() => {
        newStepFormRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
        newStepTitleInputRef.current?.focus();
      });
      return;
    }
    goToItem({ stepId: steps[0].id });
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
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {cat.emoji} {cat.label}
        </p>
        <span className="w-9" />
      </div>

      <header className="mt-4">
        <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
          {trackingTypeLabel[goal.trackingType]} · {goal.lifeArea}
        </p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-balance-tight">{goal.title}</h1>
        {goal.why && (
          <p className="mt-2 rounded-xl border border-primary/25 bg-primary/5 p-3 text-xs italic text-foreground">
            "{goal.why}"
          </p>
        )}
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${pace === "behind" ? "bg-danger/15 text-danger" : pace === "ahead" ? "bg-warning/15 text-warning" : "bg-primary/15 text-primary"}`}
          >
            {progress}% ·{" "}
            {pace === "behind" ? "atrasado" : pace === "ahead" ? "adiantado" : "no ritmo"}
          </span>
          {goal.deadlineLabel && (
            <span className="text-[11px] text-muted-foreground">prazo {goal.deadlineLabel}</span>
          )}
        </div>
      </header>

      {/* Tabs */}
      <div className="mt-5 flex gap-1 rounded-2xl border border-border bg-surface p-1">
        {(["planejamento", "evolucao"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 rounded-xl py-2 text-[11px] font-semibold capitalize transition-colors ${tab === t ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
          >
            {t === "planejamento" ? "Planejamento" : "Evolução"}
          </button>
        ))}
      </div>

      {tab === "planejamento" && (
        <div className="mt-5 space-y-3">
          {stalled && <StalledPlanAlert onDefineNext={handleDefineNext} />}

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

          <NextStepCard goal={goal} steps={steps} executions={executions} onFocus={goToItem} />

          <h2 className="pt-2 text-sm font-bold uppercase tracking-wider text-muted-foreground">
            Etapas
          </h2>
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
              />
            </div>
          ))}
          <form
            ref={newStepFormRef}
            onSubmit={async (e) => {
              e.preventDefault();
              if (!newStep.trim() || addingStep) return;
              if (goal.deadlineISO && newStepDate && newStepDate > goal.deadlineISO) {
                setStepDateError(
                  `Essa etapa não pode ter prazo depois do prazo do plano (${formatDateBR(goal.deadlineISO)}).`,
                );
                return;
              }
              setStepDateError("");
              setAddingStep(true);
              try {
                await addStep(goal.id, newStep.trim(), newStepDate || undefined);
                setNewStep("");
                setNewStepDate("");
              } catch (err) {
                setStepDateError(
                  err instanceof Error ? err.message : "Não foi possível criar. Tente de novo.",
                );
              } finally {
                setAddingStep(false);
              }
            }}
            className="card-surface space-y-2 p-3"
          >
            <input
              ref={newStepTitleInputRef}
              value={newStep}
              onChange={(e) => setNewStep(e.target.value)}
              placeholder="Ex: Terminar capítulo 3"
              className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-sm outline-none focus:border-primary"
            />
            <label className="block">
              <span className="mb-1 block text-[11px] uppercase tracking-wider text-muted-foreground">
                Realizar esta etapa até:
              </span>
              <div className="flex gap-2">
                <DateField
                  value={newStepDate}
                  onChange={(v) => {
                    setNewStepDate(v);
                    setStepDateError("");
                  }}
                  className="flex flex-1 items-center gap-2 rounded-xl border border-border bg-surface px-3 py-3 text-left text-xs outline-none focus:border-primary"
                />
                <button
                  disabled={addingStep || !newStep.trim()}
                  className="rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-60"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
            </label>
            {stepDateError && <p className="text-[11px] text-danger">{stepDateError}</p>}
          </form>

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
            onClick={() => setShowPicker(true)}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border py-3 text-sm text-muted-foreground hover:border-primary/40 hover:text-primary"
          >
            <Link2 className="h-4 w-4" /> Vincular execução existente
          </button>
        </div>
      )}

      {tab === "evolucao" && (
        <EvolutionTab
          goal={goal}
          allSteps={allSteps}
          allExecutions={allExecutions}
          onNavigate={goToItem}
        />
      )}

      {showPicker && <ExecutionPicker goalId={goal.id} onClose={() => setShowPicker(false)} />}
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

/** Etapa em destaque — a marcada como "atual", ou a primeira aberta na ordem. */
function NextStepCard({
  goal,
  steps,
  executions,
  onFocus,
}: {
  goal: Goal;
  steps: Step[];
  executions: Execution[];
  onFocus: (target: { stepId?: string; executionId?: string }) => void;
}) {
  const [completing, setCompleting] = useState(false);
  const next = steps.find((s) => s.isCurrent && !s.done) ?? steps.find((s) => !s.done);

  if (!next) {
    return (
      <Card label="Próxima etapa">
        <p className="text-sm text-muted-foreground">Sem etapas abertas — adicione uma abaixo.</p>
      </Card>
    );
  }

  const stepExecs = executions.filter((e) => e.stepId === next.id);
  const doneCount = stepExecs.filter((e) => e.status === "concluida").length;
  const nextExec = stepExecs
    .filter((e) => e.status !== "concluida" && e.status !== "cancelada")
    .sort((a, b) => (a.agendaDate ?? a.dueDate).localeCompare(b.agendaDate ?? b.dueDate))[0];

  return (
    <div className="rounded-2xl border border-primary bg-primary/[0.06] p-4 shadow-[0_0_0_1px_var(--primary),0_0_16px_-4px_var(--primary)]">
      <p className="text-[10px] font-bold uppercase tracking-wider text-primary">
        {next.isCurrent ? "Etapa atual" : "Próxima etapa"}
      </p>
      <p className="mt-1 text-base font-bold leading-snug">{next.title}</p>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
        {next.targetDate && <span>Prazo: {formatDateBR(next.targetDate)}</span>}
        {stepExecs.length > 0 && (
          <span>
            {doneCount}/{stepExecs.length} execuções concluídas
          </span>
        )}
      </div>
      {nextExec && (
        <p className="mt-1.5 truncate text-[11px] text-primary">
          Próxima execução: {nextExec.title}
        </p>
      )}
      <div className="mt-3 flex items-center gap-2">
        <button
          disabled={completing}
          onClick={async () => {
            setCompleting(true);
            try {
              await toggleStep(next.id, next.done);
            } finally {
              setCompleting(false);
            }
          }}
          className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-60"
        >
          <Check className="h-3.5 w-3.5" /> concluir etapa
        </button>
        <button
          onClick={() => onFocus({ stepId: next.id })}
          className="rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-xs"
        >
          ver detalhes
        </button>
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
}: {
  step: Step;
  goal: Goal;
  executions: Execution[];
  flashId: string | null;
  execRefs: React.MutableRefObject<Record<string, HTMLElement | null>>;
}) {
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({
    title: "",
    dueDate: "",
    weight: undefined as TaskWeight | undefined,
  });
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [markingCurrent, setMarkingCurrent] = useState(false);
  const [justCreatedId, setJustCreatedId] = useState<string | null>(null);
  const [showScheduleForm, setShowScheduleForm] = useState(false);
  const [schedule, setSchedule] = useState({ date: todayISO(), startTime: "", endTime: "" });
  const [scheduleError, setScheduleError] = useState("");
  const [scheduling, setScheduling] = useState(false);
  const [pendingConfirm, setPendingConfirm] = useState(false);
  const [suggestionDismissed, setSuggestionDismissed] = useState(false);
  const [confirmRemoveStep, setConfirmRemoveStep] = useState(false);
  const [showStepSchedule, setShowStepSchedule] = useState(false);
  const [stepSchedule, setStepSchedule] = useState({
    date: todayISO(),
    startTime: "",
    endTime: "",
  });
  const [stepScheduleError, setStepScheduleError] = useState("");
  const [stepScheduling, setStepScheduling] = useState(false);
  const nav = useNavigate();
  const profile = useProfile();
  const subtasks = step.subtasks ?? [];
  const justCreated = executions.find((e) => e.id === justCreatedId);
  const justCreatedScheduled = justCreated ? isScheduled(justCreated) : false;

  const dueLimit = step.targetDate ?? goal.deadlineISO;
  const dueLimitLabel = step.targetDate
    ? `a etapa (${formatDateBR(step.targetDate)})`
    : goal.deadlineISO
      ? `o plano (${formatDateBR(goal.deadlineISO)})`
      : "";

  const pendingExecs = executions.filter(
    (e) => e.status !== "concluida" && e.status !== "cancelada",
  );
  const allExecsDone = executions.length > 0 && pendingExecs.length === 0;

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
      setForm({ title: "", dueDate: "", weight: undefined });
      setAdding(false);
      setJustCreatedId(id);
      setShowScheduleForm(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Não foi possível criar. Tente de novo.");
    } finally {
      setSaving(false);
    }
  };

  const timesValid =
    !!schedule.startTime && !!schedule.endTime && schedule.endTime > schedule.startTime;

  const confirmSchedule = async () => {
    if (!justCreatedId || !timesValid || scheduling) return;
    setScheduleError("");
    setScheduling(true);
    try {
      await scheduleExecution(justCreatedId, schedule.date, schedule.startTime, schedule.endTime);
    } catch (err) {
      setScheduleError(
        err instanceof Error ? err.message : "Não foi possível agendar. Tente de novo.",
      );
    } finally {
      setScheduling(false);
    }
  };

  const stepTimesValid =
    !!stepSchedule.startTime &&
    !!stepSchedule.endTime &&
    stepSchedule.endTime > stepSchedule.startTime;

  // Cria automaticamente a execução "derivada" da etapa, já na agenda — só é oferecido
  // enquanto a etapa não tem nenhuma execução própria (guard abaixo + o botão some
  // sozinho assim que a execução existe, já que executions.length deixa de ser 0).
  const scheduleStepDirectly = async () => {
    if (stepScheduling || !stepTimesValid) return;
    setStepScheduleError("");
    setStepScheduling(true);
    try {
      await scheduleStepAsExecution(
        step,
        goal,
        stepSchedule.date,
        stepSchedule.startTime,
        stepSchedule.endTime,
      );
      setShowStepSchedule(false);
    } catch (err) {
      setStepScheduleError(
        err instanceof Error ? err.message : "Não foi possível agendar. Tente de novo.",
      );
    } finally {
      setStepScheduling(false);
    }
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
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className={`text-sm font-medium ${step.done ? "line-through opacity-60" : ""}`}>
              {step.title}
            </p>
            {step.isCurrent && <Star className="h-3.5 w-3.5 shrink-0 fill-primary text-primary" />}
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
        </div>
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

      {executions.length === 0 && !step.done && (
        <div className="mt-2.5 border-t border-border pt-2.5">
          {!showStepSchedule ? (
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => setShowStepSchedule(true)}
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
          ) : (
            <div className="rounded-lg border border-border bg-surface-2 p-2.5">
              <div className="flex flex-wrap items-end gap-1.5">
                <DateField
                  label="Dia"
                  value={stepSchedule.date}
                  onChange={(v) => setStepSchedule({ ...stepSchedule, date: v })}
                  className="flex items-center gap-1 rounded-md border border-border bg-surface px-1.5 py-1 text-left text-[10px] outline-none focus:border-primary"
                />
                <label className="block">
                  <span className="mb-0.5 block text-[9px] uppercase tracking-wider text-muted-foreground">
                    Início
                  </span>
                  <input
                    type="time"
                    value={stepSchedule.startTime}
                    onChange={(ev) =>
                      setStepSchedule({ ...stepSchedule, startTime: ev.target.value })
                    }
                    className="rounded-md border border-border bg-surface px-1.5 py-1 text-[10px] outline-none focus:border-primary"
                  />
                </label>
                <label className="block">
                  <span className="mb-0.5 block text-[9px] uppercase tracking-wider text-muted-foreground">
                    Término
                  </span>
                  <input
                    type="time"
                    value={stepSchedule.endTime}
                    onChange={(ev) =>
                      setStepSchedule({ ...stepSchedule, endTime: ev.target.value })
                    }
                    className="rounded-md border border-border bg-surface px-1.5 py-1 text-[10px] outline-none focus:border-primary"
                  />
                </label>
                <button
                  disabled={stepScheduling || !stepTimesValid}
                  onClick={scheduleStepDirectly}
                  className="rounded-md bg-primary px-2 py-1 text-[10px] font-semibold text-primary-foreground disabled:opacity-50"
                >
                  {stepScheduling ? "Agendando…" : "ok"}
                </button>
                <button
                  onClick={() => setShowStepSchedule(false)}
                  className="text-[10px] text-muted-foreground"
                >
                  cancelar
                </button>
              </div>
              {stepScheduleError && (
                <p className="mt-1.5 text-[11px] text-danger">{stepScheduleError}</p>
              )}
            </div>
          )}
        </div>
      )}

      {executions.length > 0 && (
        <ul className="mt-2.5 space-y-1.5 border-t border-border pt-2.5">
          {executions.map((e) => (
            <li
              key={e.id}
              ref={(el) => {
                execRefs.current[e.id] = el;
              }}
            >
              <ExecutionItem
                e={e}
                allExecutions={executions}
                highlighted={flashId === e.id}
                compact
              />
            </li>
          ))}
        </ul>
      )}

      {justCreated && (
        <div className="mt-2.5 rounded-lg border border-primary/25 bg-primary/5 p-2.5">
          {justCreatedScheduled ? (
            <>
              <p className="text-[11px] text-foreground">
                Execução "{justCreated.title}" agendada para {formatDateBR(justCreated.agendaDate!)}{" "}
                às {formatTime(justCreated.startTime, profile.timeFormat)} ✓
              </p>
              <button
                onClick={() => setJustCreatedId(null)}
                className="mt-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-[11px] font-semibold"
              >
                ok
              </button>
            </>
          ) : (
            <>
              <p className="text-[11px] text-foreground">
                Execução "{justCreated.title}" criada. Prazo: {formatDateBR(justCreated.dueDate)}.
              </p>
              {!showScheduleForm ? (
                <div className="mt-1.5 flex gap-1.5">
                  <button
                    onClick={() => setShowScheduleForm(true)}
                    className="flex-1 rounded-lg bg-primary py-1.5 text-[11px] font-semibold text-primary-foreground"
                  >
                    Colocar na agenda
                  </button>
                  <button
                    onClick={() => setJustCreatedId(null)}
                    className="rounded-lg border border-dashed border-border px-3 py-1.5 text-[11px] text-muted-foreground"
                  >
                    Agora não
                  </button>
                </div>
              ) : (
                <div className="mt-1.5 space-y-1.5">
                  <DateField
                    label="Dia na agenda"
                    value={schedule.date}
                    onChange={(v) => setSchedule({ ...schedule, date: v })}
                    className="flex w-full items-center gap-2 rounded-lg border border-border bg-surface px-2 py-1.5 text-left text-[11px] outline-none focus:border-primary"
                  />
                  <div className="grid grid-cols-2 gap-1.5">
                    <label className="block">
                      <span className="mb-0.5 block text-[10px] uppercase tracking-wider text-muted-foreground">
                        Início
                      </span>
                      <input
                        type="time"
                        value={schedule.startTime}
                        onChange={(e) => setSchedule({ ...schedule, startTime: e.target.value })}
                        className="w-full rounded-lg border border-border bg-surface px-2 py-1.5 text-[11px] outline-none focus:border-primary"
                      />
                    </label>
                    <label className="block">
                      <span className="mb-0.5 block text-[10px] uppercase tracking-wider text-muted-foreground">
                        Término
                      </span>
                      <input
                        type="time"
                        value={schedule.endTime}
                        onChange={(e) => setSchedule({ ...schedule, endTime: e.target.value })}
                        className="w-full rounded-lg border border-border bg-surface px-2 py-1.5 text-[11px] outline-none focus:border-primary"
                      />
                    </label>
                  </div>
                  {scheduleError && <p className="text-[11px] text-danger">{scheduleError}</p>}
                  <div className="flex gap-1.5">
                    <button
                      disabled={!timesValid || scheduling}
                      onClick={confirmSchedule}
                      className="flex-1 rounded-lg bg-primary py-1.5 text-[11px] font-semibold text-primary-foreground disabled:opacity-50"
                    >
                      {scheduling ? "Agendando…" : "Confirmar na agenda"}
                    </button>
                    <button
                      onClick={() => {
                        setShowScheduleForm(false);
                        setScheduleError("");
                      }}
                      className="rounded-lg border border-dashed border-border px-3 py-1.5 text-[11px] text-muted-foreground"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {!adding ? (
        <button
          onClick={() => setAdding(true)}
          className="mt-2.5 flex items-center gap-1 text-[11px] font-semibold text-primary"
        >
          <Plus className="h-3 w-3" /> nova execução para essa etapa
        </button>
      ) : (
        <div className="mt-2.5 rounded-lg border border-border bg-surface-2 p-2.5">
          <label className="block">
            <span className="mb-0.5 block text-[10px] uppercase tracking-wider text-muted-foreground">
              O que precisa ser feito?
            </span>
            <input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="Ex: Pesquisar três concorrentes"
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-xs outline-none focus:border-primary"
            />
          </label>
          <div className="mt-1.5">
            <DateField
              label="Realizar até quando?"
              value={form.dueDate}
              onChange={(v) => {
                setForm({ ...form, dueDate: v });
                setFormError("");
              }}
              className="flex w-full items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-left text-xs outline-none focus:border-primary"
            />
          </div>
          <div className="mt-1.5">
            <span className="mb-0.5 block text-[10px] uppercase tracking-wider text-muted-foreground">
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
          {formError && <p className="mt-1 text-[11px] text-danger">{formError}</p>}
          <button
            disabled={!form.title || !form.dueDate || saving}
            onClick={save}
            className="mt-1.5 w-full rounded-lg bg-primary py-1.5 text-[11px] font-semibold text-primary-foreground disabled:opacity-50"
          >
            {saving ? "Criando…" : "Criar execução"}
          </button>
        </div>
      )}

      {subtasks.length > 0 && (
        <ul className="mt-2.5 space-y-1.5 border-t border-border pt-2.5">
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
  onUnlink,
}: {
  e: Execution;
  allExecutions: Execution[];
  highlighted?: boolean;
  compact?: boolean;
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
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [schedule, setSchedule] = useState({
    date: e.agendaDate ?? toISODate(addDays(nowDate(), 1)),
    startTime: e.startTime ?? "",
    endTime: e.endTime ?? "",
  });
  const timesValid =
    !!schedule.startTime && !!schedule.endTime && schedule.endTime > schedule.startTime;

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
            <p
              className={`text-xs font-medium ${status === "concluida" ? "text-muted-foreground line-through" : ""} ${compact ? "" : "text-sm"}`}
            >
              {e.title}
            </p>
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
        <div className="relative shrink-0">
          <button
            onClick={() => setMenuOpen((v) => !v)}
            aria-label="Mais ações"
            className="text-muted-foreground hover:text-foreground"
          >
            <MoreVertical className="h-3.5 w-3.5" />
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-6 z-10 w-40 rounded-lg border border-border bg-surface p-1 shadow-lg">
              {!confirmDelete ? (
                <>
                  <button
                    onClick={() =>
                      nav({ to: "/criar", search: { modo: "agenda", executionId: e.id } })
                    }
                    className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-[11px] text-muted-foreground hover:bg-surface-2"
                  >
                    <CalendarClock className="h-3 w-3" /> agenda completa
                  </button>
                  <button
                    onClick={() => setConfirmDelete(true)}
                    className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-[11px] text-danger hover:bg-surface-2"
                  >
                    <Trash2 className="h-3 w-3" /> excluir
                  </button>
                </>
              ) : (
                <div className="p-1">
                  <p className="text-[10px] text-muted-foreground">Excluir de vez?</p>
                  <div className="mt-1 flex gap-1">
                    <button
                      onClick={() => run(() => removeExecution(e.id))}
                      className="rounded-md bg-danger px-1.5 py-1 text-[10px] font-semibold text-white"
                    >
                      excluir
                    </button>
                    <button
                      onClick={() => {
                        setConfirmDelete(false);
                        setMenuOpen(false);
                      }}
                      className="text-[10px] text-muted-foreground"
                    >
                      cancelar
                    </button>
                  </div>
                </div>
              )}
              {onUnlink && !confirmDelete && (
                <button
                  onClick={() => {
                    onUnlink();
                    setMenuOpen(false);
                  }}
                  className="flex w-full items-center rounded-md px-2 py-1.5 text-left text-[11px] text-muted-foreground hover:bg-surface-2"
                >
                  desvincular do plano
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {(status === "planejada" || status === "perdida") && !editing && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {!rescheduling ? (
            <>
              <button
                onClick={() => setRescheduling(true)}
                className="flex items-center gap-1 rounded-lg border border-border bg-surface px-2 py-1 text-[10px] font-medium hover:border-primary/40"
              >
                <CalendarClock className="h-3 w-3" />
                {scheduled ? "reagendar" : "colocar na agenda"}
              </button>
              <button
                onClick={() => run(() => redistributeExecution(e.id, allExecutions))}
                disabled={busy}
                className="flex items-center gap-1 rounded-lg border border-border bg-surface px-2 py-1 text-[10px] font-medium hover:border-primary/40 disabled:opacity-50"
              >
                <RotateCcw className="h-3 w-3" /> redistribuir
              </button>
              <button
                onClick={() => setEditing(true)}
                className="flex items-center gap-1 rounded-lg border border-border bg-surface px-2 py-1 text-[10px] font-medium hover:border-primary/40"
              >
                <Pencil className="h-3 w-3" /> editar
              </button>
            </>
          ) : (
            <div className="flex flex-wrap items-end gap-1.5">
              <DateField
                label="Dia"
                value={schedule.date}
                onChange={(v) => setSchedule({ ...schedule, date: v })}
                className="flex items-center gap-1 rounded-md border border-border bg-surface px-1.5 py-1 text-left text-[10px] outline-none focus:border-primary"
              />
              <label className="block">
                <span className="mb-0.5 block text-[9px] uppercase tracking-wider text-muted-foreground">
                  Início
                </span>
                <input
                  type="time"
                  value={schedule.startTime}
                  onChange={(ev) => setSchedule({ ...schedule, startTime: ev.target.value })}
                  className="rounded-md border border-border bg-surface px-1.5 py-1 text-[10px] outline-none focus:border-primary"
                />
              </label>
              <label className="block">
                <span className="mb-0.5 block text-[9px] uppercase tracking-wider text-muted-foreground">
                  Término
                </span>
                <input
                  type="time"
                  value={schedule.endTime}
                  onChange={(ev) => setSchedule({ ...schedule, endTime: ev.target.value })}
                  className="rounded-md border border-border bg-surface px-1.5 py-1 text-[10px] outline-none focus:border-primary"
                />
              </label>
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
          )}
          <button
            onClick={() => run(() => cancelExecution(e.id, "descartado no plano"))}
            disabled={busy}
            className="flex items-center gap-1 rounded-lg border border-dashed border-border px-2 py-1 text-[10px] text-muted-foreground disabled:opacity-50"
          >
            descartar
          </button>
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
