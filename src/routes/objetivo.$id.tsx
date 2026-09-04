import { createFileRoute, Link, useNavigate, notFound } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  ChevronLeft,
  Check,
  Plus,
  Target,
  Flame,
  CalendarDays,
  Trash2,
  MapPin,
  Link2,
  TrendingUp,
  X,
  CalendarClock,
  RotateCcw,
} from "lucide-react";
import { categoryMeta } from "@/lib/mock-data";
import { useProfile } from "@/lib/profile-store";
import { formatTime } from "@/lib/format-utils";
import { nowDate, nowMs } from "@/lib/test-clock";
import { Modal } from "@/components/ui/modal";
import {
  useGoalsStore,
  useGoalsLoading,
  addStep,
  toggleStep,
  removeStep,
  addSubtask,
  toggleSubtask,
  removeSubtask,
  createExecution,
  scheduleExecution,
  isScheduled,
  completeExecution,
  cancelExecution,
  rescheduleExecution,
  redistributeExecution,
  linkExecutionToGoal,
  goalProgress,
  goalPace,
  planningStatus,
  stepsForGoal,
  executionsForGoal,
  effectiveStatus,
  relevantDate,
  formatDateBR,
  toISODate,
  addDays,
  todayISO,
  type Goal,
  type Step,
  type Execution,
  type PlanningStatus,
  type TrackingType,
} from "@/lib/goals-store";

const trackingTypeLabel: Record<TrackingType, string> = {
  etapas: "Por etapas",
  frequencia: "Por frequência",
  numero: "Por número",
};

const statusLabel: Record<PlanningStatus, string> = {
  ativo: "ativo",
  concluido: "concluído",
  em_risco: "em risco",
  atrasado: "atrasado",
};
const statusTone: Record<PlanningStatus, string> = {
  ativo: "bg-primary/15 text-primary",
  concluido: "bg-success/15 text-success",
  em_risco: "bg-warning/15 text-warning",
  atrasado: "bg-danger/15 text-danger",
};

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

  const [tab, setTab] = useState<"vista" | "vinculos" | "evolucao">("vista");
  const [newStep, setNewStep] = useState("");
  const [newStepDate, setNewStepDate] = useState("");
  const [stepDateError, setStepDateError] = useState("");
  const [showPicker, setShowPicker] = useState(false);
  const [completingNext, setCompletingNext] = useState(false);
  const [addingStep, setAddingStep] = useState(false);

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
  const status = planningStatus(goal, allSteps, allExecutions);
  const concluded = executions.filter((e) => e.status === "concluida");
  const target = goal.metric.target;

  return (
    <div className="px-5 pt-12">
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
      </header>

      {/* Progress ring + numbers */}
      <section className="card-surface mt-5 p-5">
        <div className="flex items-center gap-5">
          <ProgressRing pct={progress} pace={pace} />
          <div className="min-w-0 flex-1">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Progresso</p>
            <p className="mt-1 text-3xl font-bold leading-none">{progress}%</p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {goal.trackingType === "etapas"
                ? `${steps.filter((s) => s.done).length} de ${steps.length} etapas`
                : `${concluded.length} de ${target} ${goal.metric.unit}`}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span
                className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusTone[status]}`}
              >
                {statusLabel[status]}
              </span>
              <span
                className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${pace === "behind" ? "bg-danger/15 text-danger" : pace === "ahead" ? "bg-warning/15 text-warning" : "bg-primary/15 text-primary"}`}
              >
                {pace === "behind" ? "atrasado" : pace === "ahead" ? "adiantado" : "no ritmo"}
              </span>
              <span className="text-[10px] text-muted-foreground">
                · prazo {goal.deadlineLabel}
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Tabs */}
      <div className="mt-5 flex gap-1 rounded-2xl border border-border bg-surface p-1">
        {(["vista", "vinculos", "evolucao"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 rounded-xl py-2 text-[11px] font-semibold capitalize transition-colors ${tab === t ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
          >
            {t === "vista"
              ? "Visão"
              : t === "vinculos"
                ? `Execuções (${executions.length})`
                : "Evolução"}
          </button>
        ))}
      </div>

      {tab === "vista" && (
        <div className="mt-5 space-y-3">
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
          <Card label="Números">
            <div
              className={`grid gap-2 ${goal.trackingType === "etapas" ? "grid-cols-2" : "grid-cols-3"}`}
            >
              <Stat n={steps.filter((s) => s.done).length} of={steps.length} label="Etapas" />
              {goal.trackingType !== "etapas" && (
                <Stat n={concluded.length} of={target} label={goal.metric.unit} />
              )}
              <Stat n={executions.length} label="Execuções" />
            </div>
          </Card>
          <Card label="Próxima etapa">
            {(() => {
              const next = steps.find((s) => !s.done);
              if (!next)
                return (
                  <p className="text-sm text-muted-foreground">
                    Sem etapas abertas — adicione uma abaixo.
                  </p>
                );
              return (
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{next.title}</p>
                    {next.dueLabel && (
                      <p className="text-[11px] text-muted-foreground">{next.dueLabel}</p>
                    )}
                  </div>
                  <button
                    disabled={completingNext}
                    onClick={async () => {
                      setCompletingNext(true);
                      try {
                        await toggleStep(next.id, next.done);
                      } finally {
                        setCompletingNext(false);
                      }
                    }}
                    className="rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-xs disabled:opacity-60"
                  >
                    concluir
                  </button>
                </div>
              );
            })()}
          </Card>

          <h2 className="pt-2 text-sm font-bold uppercase tracking-wider text-muted-foreground">
            Etapas
          </h2>
          {steps.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Nenhuma etapa ainda. Divida o planejamento em passos concretos.
            </p>
          )}
          {steps.map((s) => (
            <StepRow
              key={s.id}
              step={s}
              goal={goal}
              executions={executionsForGoal(allExecutions, goal.id).filter(
                (e) => e.stepId === s.id,
              )}
            />
          ))}
          <form
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
                <input
                  type="date"
                  value={newStepDate}
                  onChange={(e) => {
                    setNewStepDate(e.target.value);
                    setStepDateError("");
                  }}
                  className="flex-1 rounded-xl border border-border bg-surface px-3 py-3 text-xs outline-none focus:border-primary"
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
        </div>
      )}

      {tab === "vinculos" && (
        <div className="mt-5 space-y-2.5">
          <p className="text-xs text-muted-foreground text-balance-tight">
            Execuções vinculadas contam como avanço real deste planejamento.
          </p>
          {executions.length === 0 && (
            <div className="card-surface p-5 text-center text-sm text-muted-foreground">
              Nenhuma execução vinculada.
            </div>
          )}
          {executions.map((e) => (
            <ExecutionRow key={e.id} e={e} allExecutions={allExecutions} steps={steps} />
          ))}
          <button
            onClick={() => setShowPicker(true)}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border py-3 text-sm text-muted-foreground hover:border-primary/40 hover:text-primary"
          >
            <Link2 className="h-4 w-4" /> Vincular execução existente
          </button>
        </div>
      )}

      {tab === "evolucao" && (
        <div className="mt-5 space-y-3">
          <Card label="Ritmo esperado vs. real">
            <PaceBar goal={goal} steps={allSteps} executions={allExecutions} />
          </Card>
          <Card label={`Histórico (${concluded.length})`}>
            {concluded.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma execução concluída ainda.</p>
            ) : (
              <ul className="space-y-2">
                {[...concluded]
                  .sort((a, b) => relevantDate(b).localeCompare(relevantDate(a)))
                  .slice(0, 20)
                  .map((c) => (
                    <li key={c.id} className="flex items-center gap-3 text-sm">
                      <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                      <span className="font-mono text-[11px] text-muted-foreground">
                        {relevantDate(c).slice(5).replace("-", "/")}
                      </span>
                      <span className="truncate">
                        {c.title}
                        {c.rescheduledFromId ? " (reagendada)" : ""}
                      </span>
                    </li>
                  ))}
              </ul>
            )}
          </Card>
        </div>
      )}

      {showPicker && <ExecutionPicker goalId={goal.id} onClose={() => setShowPicker(false)} />}
    </div>
  );
}

function StepRow({ step, goal, executions }: { step: Step; goal: Goal; executions: Execution[] }) {
  const profile = useProfile();
  const [adding, setAdding] = useState(false);
  const [showSubtasks, setShowSubtasks] = useState(false);
  const [subtaskDraft, setSubtaskDraft] = useState("");
  const [form, setForm] = useState({ title: "", dueDate: "" });
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [justCreatedId, setJustCreatedId] = useState<string | null>(null);
  const [showScheduleForm, setShowScheduleForm] = useState(false);
  const [schedule, setSchedule] = useState({ date: todayISO(), startTime: "", endTime: "" });
  const [scheduleError, setScheduleError] = useState("");
  const [scheduling, setScheduling] = useState(false);
  const subtasks = step.subtasks ?? [];
  const justCreated = executions.find((e) => e.id === justCreatedId);
  const justCreatedScheduled = justCreated ? isScheduled(justCreated) : false;

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
        weight: "medio",
        goalId: goal.id,
        stepId: step.id,
      });
      setForm({ title: "", dueDate: "" });
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

  return (
    <div className="card-surface p-3.5">
      <div className="flex items-start gap-3">
        <button
          disabled={toggling}
          onClick={async () => {
            setToggling(true);
            try {
              await toggleStep(step.id, step.done);
            } finally {
              setToggling(false);
            }
          }}
          className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border disabled:opacity-60 ${step.done ? "border-primary bg-primary text-primary-foreground" : "border-border bg-surface-2"}`}
        >
          {step.done && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
        </button>
        <div className="min-w-0 flex-1">
          <p className={`text-sm font-medium ${step.done ? "line-through opacity-60" : ""}`}>
            {step.title}
          </p>
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
        <button
          onClick={async () => {
            await removeStep(step.id);
          }}
          className="text-muted-foreground hover:text-danger"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

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
                  <label className="block">
                    <span className="mb-0.5 block text-[10px] uppercase tracking-wider text-muted-foreground">
                      Dia na agenda
                    </span>
                    <input
                      type="date"
                      value={schedule.date}
                      onChange={(e) => setSchedule({ ...schedule, date: e.target.value })}
                      className="w-full rounded-lg border border-border bg-surface px-2 py-1.5 text-[11px] outline-none focus:border-primary"
                    />
                  </label>
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
          <input
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder="O que precisa ser feito?"
            className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-xs outline-none focus:border-primary"
          />
          <label className="mt-1.5 block">
            <span className="mb-0.5 block text-[10px] uppercase tracking-wider text-muted-foreground">
              Realizar esta execução até:
            </span>
            <input
              type="date"
              value={form.dueDate}
              onChange={(e) => {
                setForm({ ...form, dueDate: e.target.value });
                setFormError("");
              }}
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-xs outline-none focus:border-primary"
            />
          </label>
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
      {!showSubtasks ? (
        <button
          onClick={() => setShowSubtasks(true)}
          className="mt-2 flex items-center gap-1 text-[11px] text-muted-foreground hover:text-primary"
        >
          <Plus className="h-3 w-3" /> subtarefa
        </button>
      ) : (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (subtaskDraft.trim()) {
              const title = subtaskDraft.trim();
              setSubtaskDraft("");
              await addSubtask(step.id, title);
            }
          }}
          className="mt-2 flex gap-1.5"
        >
          <input
            autoFocus
            value={subtaskDraft}
            onChange={(e) => setSubtaskDraft(e.target.value)}
            placeholder="Ex: Pesquisar referências"
            className="flex-1 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs outline-none focus:border-primary"
          />
          <button className="rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground">
            <Plus className="h-3 w-3" />
          </button>
        </form>
      )}
    </div>
  );
}

function ExecutionRow({
  e,
  allExecutions,
  steps,
}: {
  e: Execution;
  allExecutions: Execution[];
  steps: Step[];
}) {
  const c = categoryMeta[e.category] ?? categoryMeta.generico;
  const status = effectiveStatus(e);
  const scheduled = isScheduled(e);
  const relatedStep = steps.find((s) => s.id === e.stepId);
  const profile = useProfile();
  const [rescheduling, setRescheduling] = useState(false);
  const [busy, setBusy] = useState(false);
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
          "reagendado no objetivo",
        );
      } else {
        await scheduleExecution(e.id, schedule.date, schedule.startTime, schedule.endTime);
      }
      setRescheduling(false);
    });

  return (
    <div className="card-surface p-3.5">
      <div className="flex items-start gap-3">
        <div className="min-w-[4.5rem] rounded-lg bg-surface-2 px-2.5 py-2 text-center">
          {scheduled ? (
            <>
              <p className="font-mono text-[11px] text-muted-foreground">
                {e.agendaDate!.slice(5).replace("-", "/")}
              </p>
              <p className="font-mono text-sm font-bold">
                {formatTime(e.startTime, profile.timeFormat)}
                {e.endTime ? `–${formatTime(e.endTime, profile.timeFormat)}` : ""}
              </p>
            </>
          ) : (
            <p className="text-[10px] font-semibold uppercase text-muted-foreground">
              sem
              <br />
              agenda
            </p>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
            {c.emoji} {c.label}
          </p>
          <p className="mt-0.5 truncate text-sm font-semibold">{e.title}</p>
          {relatedStep && (
            <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
              Etapa: {relatedStep.title}
            </p>
          )}
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Prazo: {formatDateBR(e.dueDate)}
          </p>
          {e.location && (
            <p className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
              <MapPin className="h-3 w-3" />
              {e.location}
            </p>
          )}
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <span
              className={`inline-block rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${status === "concluida" ? "bg-success/15 text-success" : status === "perdida" ? "bg-danger/15 text-danger" : status === "cancelada" ? "bg-surface-2 text-muted-foreground" : "bg-primary/15 text-primary"}`}
            >
              {status === "concluida"
                ? "concluída"
                : status === "perdida"
                  ? "perdida"
                  : status === "cancelada"
                    ? "descartada"
                    : "planejada"}
            </span>
            {!scheduled && status === "planejada" && (
              <span className="inline-block rounded-full bg-surface-2 px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                Ainda não agendada
              </span>
            )}
          </div>
        </div>
        <button
          onClick={() => run(() => linkExecutionToGoal(e.id, null))}
          disabled={busy}
          className="text-muted-foreground hover:text-danger disabled:opacity-50"
          title="Desvincular"
          aria-label="Desvincular"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      {(status === "planejada" || status === "perdida") && (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          <button
            onClick={() => run(() => completeExecution(e.id))}
            disabled={busy}
            className="flex items-center gap-1 rounded-lg border border-border bg-surface-2 px-2.5 py-1.5 text-[11px] font-medium hover:border-primary/40 disabled:opacity-50"
          >
            <Check className="h-3 w-3" /> concluir
          </button>
          {!rescheduling ? (
            <button
              onClick={() => setRescheduling(true)}
              className="flex items-center gap-1 rounded-lg border border-border bg-surface-2 px-2.5 py-1.5 text-[11px] font-medium hover:border-primary/40"
            >
              <CalendarClock className="h-3 w-3" />
              {scheduled ? "reagendar" : "Adicionar à agenda"}
            </button>
          ) : (
            <div className="flex flex-wrap items-end gap-1.5">
              <label className="block">
                <span className="mb-0.5 block text-[9px] uppercase tracking-wider text-muted-foreground">
                  Dia na agenda
                </span>
                <input
                  type="date"
                  value={schedule.date}
                  onChange={(ev) => setSchedule({ ...schedule, date: ev.target.value })}
                  className="rounded-lg border border-border bg-surface px-2 py-1.5 text-[11px] outline-none focus:border-primary"
                />
              </label>
              <label className="block">
                <span className="mb-0.5 block text-[9px] uppercase tracking-wider text-muted-foreground">
                  Início
                </span>
                <input
                  type="time"
                  value={schedule.startTime}
                  onChange={(ev) => setSchedule({ ...schedule, startTime: ev.target.value })}
                  className="rounded-lg border border-border bg-surface px-2 py-1.5 text-[11px] outline-none focus:border-primary"
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
                  className="rounded-lg border border-border bg-surface px-2 py-1.5 text-[11px] outline-none focus:border-primary"
                />
              </label>
              <button
                onClick={confirmSchedule}
                disabled={busy || !timesValid}
                className="rounded-lg bg-primary px-2.5 py-1.5 text-[11px] font-semibold text-primary-foreground disabled:opacity-50"
              >
                ok
              </button>
            </div>
          )}
          <button
            onClick={() => run(() => redistributeExecution(e.id, allExecutions))}
            disabled={busy}
            className="flex items-center gap-1 rounded-lg border border-border bg-surface-2 px-2.5 py-1.5 text-[11px] font-medium hover:border-primary/40 disabled:opacity-50"
          >
            <RotateCcw className="h-3 w-3" /> redistribuir
          </button>
          <button
            onClick={() => run(() => cancelExecution(e.id, "descartado no objetivo"))}
            disabled={busy}
            className="flex items-center gap-1 rounded-lg border border-dashed border-border px-2.5 py-1.5 text-[11px] text-muted-foreground disabled:opacity-50"
          >
            descartar
          </button>
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

function Stat({ n, of, label }: { n: number; of?: number; label: string }) {
  return (
    <div className="rounded-xl bg-surface-2 p-3 text-center">
      <p className="text-lg font-bold">
        {n}
        {of !== undefined && <span className="text-xs text-muted-foreground">/{of}</span>}
      </p>
      <p className="mt-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
    </div>
  );
}

function ProgressRing({ pct, pace }: { pct: number; pace: "ahead" | "ontrack" | "behind" }) {
  const r = 34;
  const c = 2 * Math.PI * r;
  const stroke =
    pace === "behind" ? "var(--danger)" : pace === "ahead" ? "var(--warning)" : "var(--primary)";
  return (
    <div className="relative h-20 w-20 shrink-0">
      <svg viewBox="0 0 80 80" className="h-20 w-20 -rotate-90">
        <circle cx="40" cy="40" r={r} fill="none" stroke="var(--surface-2)" strokeWidth="8" />
        <circle
          cx="40"
          cy="40"
          r={r}
          fill="none"
          stroke={stroke}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct / 100)}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <Target className="h-5 w-5 text-muted-foreground" />
      </div>
    </div>
  );
}

function PaceBar({
  goal,
  steps,
  executions,
}: {
  goal: Goal;
  steps: Step[];
  executions: Execution[];
}) {
  const actual = goalProgress(goal, steps, executions);
  let expected = 0;
  if (goal.deadlineISO) {
    const start = new Date(goal.createdAt).getTime();
    const end = new Date(goal.deadlineISO + "T23:59:59").getTime();
    const now = nowMs();
    if (end > start) expected = Math.min(100, Math.max(0, ((now - start) / (end - start)) * 100));
  }
  return (
    <div className="space-y-2">
      <Row label="Real" pct={actual} color="var(--primary)" />
      <Row label="Esperado" pct={Math.round(expected)} color="var(--muted-foreground)" />
      <p className="pt-1 text-[11px] text-muted-foreground">
        {actual >= expected ? (
          <>
            <TrendingUp className="inline h-3 w-3" /> Você está {Math.round(actual - expected)}{" "}
            pontos {actual > expected ? "à frente" : "no ritmo"}.
          </>
        ) : (
          <>
            <Flame className="inline h-3 w-3 text-danger" /> Faltam {Math.round(expected - actual)}{" "}
            pontos para o ritmo esperado.
          </>
        )}
      </p>
    </div>
  );
}

function Row({ label, pct, color }: { label: string; pct: number; color: string }) {
  return (
    <div>
      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span>{label}</span>
        <span>{pct}%</span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
      </div>
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
        Toque para vincular. Ela passa a contar como execução deste planejamento.
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
              <CalendarDays className="h-4 w-4 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">
                  {c.emoji} {e.title}
                </p>
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
