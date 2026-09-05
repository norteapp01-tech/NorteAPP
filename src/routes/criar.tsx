import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import {
  ChevronLeft,
  Check,
  CalendarDays,
  Target,
  GitBranch,
  Plus,
  Trash2,
  Link2,
} from "lucide-react";
import {
  createGoal,
  createExecution,
  scheduleExecution,
  scheduleStepAsExecution,
  isScheduled,
  formatDateBR,
  useGoalsStore,
  type Goal,
  type Step,
  type Execution,
} from "@/lib/goals-store";
import { categoryMeta, catByArea, lifeAreas } from "@/lib/mock-data";
import { nowDate } from "@/lib/test-clock";
import { DateField } from "@/components/ui/date-wheel-picker";
import { PlanItemPicker, type PlanItemSelection } from "@/components/plan/PlanItemPicker";
import { useProfile } from "@/lib/profile-store";
import { formatTime } from "@/lib/format-utils";

type Mode = "escolha" | "agenda" | "planejamento";

export const Route = createFileRoute("/criar")({
  head: () => ({ meta: [{ title: "Criar — Norte" }] }),
  validateSearch: (
    s: Record<string, unknown>,
  ): { modo?: Mode; goalId?: string; stepId?: string; executionId?: string } => ({
    modo: s.modo as Mode | undefined,
    goalId: s.goalId as string | undefined,
    stepId: s.stepId as string | undefined,
    executionId: s.executionId as string | undefined,
  }),
  component: CreateScreen,
});

function CreateScreen() {
  const nav = useNavigate();
  const search = Route.useSearch();
  const [mode, setMode] = useState<Mode>(search.modo ?? "escolha");

  return (
    <div className="px-5 pt-12">
      <div className="flex items-center justify-between">
        <button
          onClick={() => (mode === "escolha" ? nav({ to: "/" }) : setMode("escolha"))}
          className="-ml-2 flex h-9 w-9 items-center justify-center rounded-full hover:bg-surface"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {mode === "escolha" ? "Novo" : mode === "agenda" ? "Compromisso" : "Plano"}
        </p>
        <button onClick={() => nav({ to: "/" })} className="text-xs text-muted-foreground">
          Cancelar
        </button>
      </div>

      {mode === "escolha" && (
        <div className="mt-10 space-y-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-balance-tight">
              O que você quer criar?
            </h1>
            <p className="mt-2 text-sm text-muted-foreground text-balance-tight">
              Plano é o que você quer construir. Agenda é o que tem hora marcada.
            </p>
          </div>

          <button
            onClick={() => setMode("planejamento")}
            className="card-surface flex w-full items-start gap-4 p-5 text-left transition-colors hover:border-primary/50"
          >
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-warning/15">
              <Target className="h-6 w-6 text-warning" />
            </div>
            <div>
              <p className="font-bold">Criar um Plano</p>
              <p className="mt-1 text-xs text-muted-foreground text-balance-tight">
                Algo que você quer conquistar ou realizar. Ex: "Abrir uma loja", "Aprender inglês",
                "Melhorar minha saúde".
              </p>
              <p className="mt-2 flex items-center gap-1 text-[11px] font-semibold text-warning">
                <GitBranch className="h-3 w-3" /> Só título e prazo já bastam pra salvar
              </p>
            </div>
          </button>

          <button
            onClick={() => setMode("agenda")}
            className="card-surface flex w-full items-start gap-4 p-5 text-left transition-colors hover:border-primary/50"
          >
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/15">
              <CalendarDays className="h-6 w-6 text-primary" />
            </div>
            <div>
              <p className="font-bold">Adicionar à Agenda</p>
              <p className="mt-1 text-xs text-muted-foreground text-balance-tight">
                Algo pontual, com hora marcada. Ex: "Reunião segunda às 14h", "Médico sexta".
              </p>
              <p className="mt-2 text-[11px] font-semibold text-primary">
                3 campos · 15s · pode vincular a um plano
              </p>
            </div>
          </button>

          <div className="mt-6 rounded-2xl border border-border bg-surface/60 p-4 text-xs text-muted-foreground">
            <span className="font-semibold text-foreground">Regra do Norte:</span> compromissos são{" "}
            <em>o que tem hora</em>. Planos são <em>o que você quer construir</em> — e cada
            compromisso pode empurrar um plano.
          </div>
        </div>
      )}

      {mode === "agenda" && (
        <AgendaFlow
          onDone={() => nav({ to: "/agenda" })}
          deepLink={{
            goalId: search.goalId,
            stepId: search.stepId,
            executionId: search.executionId,
          }}
        />
      )}
      {mode === "planejamento" && (
        <PlanejamentoFlow onDone={(id) => nav({ to: "/objetivo/$id", params: { id } })} />
      )}
    </div>
  );
}

// -------- Agenda: seleção estruturada Plano→Etapa→Execução, ou compromisso avulso --------
type DeepLink = { goalId?: string; stepId?: string; executionId?: string };

function resolveDeepLink(
  deepLink: DeepLink | undefined,
  goals: Goal[],
  steps: Step[],
  executions: Execution[],
): PlanItemSelection | null {
  if (!deepLink) return null;
  if (deepLink.executionId) {
    const execution = executions.find((e) => e.id === deepLink.executionId);
    if (!execution) return null;
    const goal = goals.find((g) => g.id === execution.goalId);
    if (!goal) return null;
    const step = execution.stepId ? steps.find((s) => s.id === execution.stepId) : undefined;
    return { kind: "execution", goal, step, execution };
  }
  if (deepLink.stepId) {
    const step = steps.find((s) => s.id === deepLink.stepId);
    const goal = goals.find((g) => g.id === (deepLink.goalId ?? step?.goalId));
    if (!goal || !step) return null;
    return { kind: "step", goal, step };
  }
  if (deepLink.goalId) {
    const goal = goals.find((g) => g.id === deepLink.goalId);
    if (!goal) return null;
    return { kind: "goal", goal };
  }
  return null;
}

function AgendaFlow({ onDone, deepLink }: { onDone: () => void; deepLink?: DeepLink }) {
  const goals = useGoalsStore((s) => s.goals);
  const steps = useGoalsStore((s) => s.steps);
  const executions = useGoalsStore((s) => s.executions);
  const profile = useProfile();

  const [avulso, setAvulso] = useState(false);
  const [selection, setSelection] = useState<PlanItemSelection | null>(() =>
    resolveDeepLink(deepLink, goals, steps, executions),
  );
  const [showPicker, setShowPicker] = useState(false);
  const [avulsoTitle, setAvulsoTitle] = useState("");
  const [form, setForm] = useState({
    date: "",
    startTime: "",
    endTime: "",
    location: "",
    rigid: true,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const creatingNew = avulso || selection?.kind === "goal" || selection?.kind === "step";
  const timesValid = !!form.startTime && !!form.endTime && form.endTime > form.startTime;
  const title =
    selection?.kind === "step"
      ? selection.step.title
      : selection?.kind === "execution"
        ? selection.execution.title
        : avulsoTitle;
  const valid = !!title.trim() && !!form.date && timesValid && (avulso || selection !== null);

  const save = async () => {
    if (!valid || saving) return;
    setSaving(true);
    setError("");
    try {
      if (selection?.kind === "execution") {
        await scheduleExecution(selection.execution.id, form.date, form.startTime, form.endTime);
      } else if (selection?.kind === "step") {
        await scheduleStepAsExecution(
          selection.step,
          selection.goal,
          form.date,
          form.startTime,
          form.endTime,
        );
      } else {
        await createExecution({
          title: title.trim(),
          dueDate: form.date,
          agendaDate: form.date,
          startTime: form.startTime,
          endTime: form.endTime,
          category: selection?.kind === "goal" ? selection.goal.category : "generico",
          location: form.location || undefined,
          rigid: form.rigid,
          weight: "leve",
          goalId: selection?.kind === "goal" ? selection.goal.id : undefined,
        });
      }
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível salvar. Tente de novo.");
    } finally {
      setSaving(false);
    }
  };

  const breadcrumb =
    selection &&
    [
      selection.goal.title,
      selection.kind !== "goal" && selection.kind === "step" ? selection.step.title : null,
      selection.kind === "execution" ? (selection.step?.title ?? null) : null,
      selection.kind === "execution" ? selection.execution.title : null,
    ].filter(Boolean);

  return (
    <div className="mt-8 space-y-5">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Novo compromisso</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Só o essencial. Você edita depois se precisar.
        </p>
      </div>

      <div>
        <span className="mb-1 block text-[11px] uppercase tracking-wider text-muted-foreground">
          O quê
        </span>
        {!avulso ? (
          <>
            <button
              type="button"
              onClick={() => setShowPicker(true)}
              className="flex w-full items-center gap-2 rounded-xl border border-border bg-surface px-4 py-3 text-left text-sm outline-none focus:border-primary"
            >
              <Target className="h-4 w-4 shrink-0 text-muted-foreground" />
              {selection ? (
                <span className="min-w-0 flex-1 truncate">{breadcrumb!.join(" › ")}</span>
              ) : (
                <span className="flex-1 text-muted-foreground">
                  Selecionar plano, etapa ou execução
                </span>
              )}
            </button>
            {selection && (
              <button
                type="button"
                onClick={() => setShowPicker(true)}
                className="mt-1.5 text-[11px] font-semibold text-primary"
              >
                trocar
              </button>
            )}
            {selection?.kind === "execution" && (
              <p className="mt-2 text-[11px] text-muted-foreground">
                Prazo: {formatDateBR(selection.execution.dueDate)}
                {isScheduled(selection.execution)
                  ? ` — já agendada para ${formatDateBR(selection.execution.agendaDate!)} às ${formatTime(selection.execution.startTime, profile.timeFormat)}. Confirmar aqui só troca o horário, não duplica.`
                  : " — agendar aqui não muda o prazo nem duplica a execução, só marca dia e horário."}
              </p>
            )}
            {selection?.kind === "step" && (
              <p className="mt-2 flex items-center gap-1.5 text-[11px] text-primary">
                <Link2 className="h-3 w-3" /> essa etapa ainda não tem execução — vamos criar uma ao
                agendar.
              </p>
            )}
            <button
              type="button"
              onClick={() => {
                setAvulso(true);
                setSelection(null);
              }}
              className="mt-2.5 text-[11px] font-semibold text-muted-foreground underline decoration-dotted"
            >
              ou criar um compromisso avulso (sem plano)
            </button>
          </>
        ) : (
          <>
            <input
              value={avulsoTitle}
              onChange={(e) => setAvulsoTitle(e.target.value)}
              placeholder='Ex: "Dentista"'
              autoFocus
              className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-sm outline-none focus:border-primary"
            />
            <button
              type="button"
              onClick={() => setAvulso(false)}
              className="mt-1.5 text-[11px] font-semibold text-primary"
            >
              vincular a um plano em vez disso
            </button>
          </>
        )}
      </div>

      <DateField label="Dia" value={form.date} onChange={(v) => setForm({ ...form, date: v })} />
      <div className="grid grid-cols-2 gap-3">
        <Field
          label="Início"
          placeholder="14:00"
          value={form.startTime}
          onChange={(v) => setForm({ ...form, startTime: v })}
          type="time"
        />
        <Field
          label="Fim"
          placeholder="15:00"
          value={form.endTime}
          onChange={(v) => setForm({ ...form, endTime: v })}
          type="time"
        />
      </div>
      {form.startTime && form.endTime && !timesValid && (
        <p className="text-[11px] text-danger">O horário de fim precisa ser depois do início.</p>
      )}
      {creatingNew && (
        <>
          <Field
            label="Onde (opcional)"
            placeholder="Ex: Clínica Norte"
            value={form.location}
            onChange={(v) => setForm({ ...form, location: v })}
          />
          <label className="flex items-center gap-3 rounded-xl border border-border bg-surface p-4">
            <input
              type="checkbox"
              checked={form.rigid}
              onChange={(e) => setForm({ ...form, rigid: e.target.checked })}
              className="h-4 w-4 accent-primary"
            />
            <div>
              <p className="text-sm font-medium">Rígido</p>
              <p className="text-[11px] text-muted-foreground">
                Não pode ser renegociado sem confronto.
              </p>
            </div>
          </label>
        </>
      )}
      {error && <p className="text-[11px] text-danger">{error}</p>}
      <button
        disabled={!valid || saving}
        onClick={save}
        className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3.5 text-sm font-semibold text-primary-foreground disabled:opacity-40"
      >
        <Check className="h-4 w-4" />
        {saving
          ? "Salvando…"
          : selection?.kind === "execution"
            ? "Agendar execução"
            : "Salvar na agenda"}
      </button>

      {showPicker && (
        <PlanItemPicker
          onClose={() => setShowPicker(false)}
          onSelect={(sel) => {
            setSelection(sel);
            setShowPicker(false);
          }}
        />
      )}
    </div>
  );
}

// -------- Plano: título + prazo já salvam; etapas são opcionais --------
const planSteps = ["identidade", "prazo", "etapas"] as const;
type PlanStep = (typeof planSteps)[number];

type PresetDeadline = "Semana" | "Mês" | "90 dias" | "Semestre" | "Ano" | "personalizado";

function addDaysLocal(base: Date, n: number) {
  const d = new Date(base);
  d.setDate(d.getDate() + n);
  return d;
}
function addMonths(base: Date, m: number) {
  const d = new Date(base);
  d.setMonth(d.getMonth() + m);
  return d;
}
function fmtDate(d: Date) {
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
}
function isoDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function PlanejamentoFlow({ onDone }: { onDone: (id: string) => void }) {
  const [step, setStep] = useState<PlanStep>("identidade");
  const [form, setForm] = useState({
    title: "",
    why: "",
    lifeArea: "",
    preset: "" as PresetDeadline | "",
    customISO: "",
    stepsList: [] as { id: string; title: string; targetDate: string }[],
    firstExecution: { title: "", dueDate: "" },
  });
  const [stepDraft, setStepDraft] = useState("");
  const [stepDraftDate, setStepDraftDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const back = () => {
    if (step === "prazo") setStep("identidade");
    if (step === "etapas") setStep("prazo");
  };

  const deadlineDate: Date | undefined = (() => {
    if (form.preset === "Semana") return addDaysLocal(nowDate(), 7);
    if (form.preset === "Mês") return addMonths(nowDate(), 1);
    if (form.preset === "90 dias") return addDaysLocal(nowDate(), 90);
    if (form.preset === "Semestre") return addMonths(nowDate(), 6);
    if (form.preset === "Ano") return addMonths(nowDate(), 12);
    if (form.preset === "personalizado" && form.customISO)
      return new Date(form.customISO + "T00:00:00");
    return undefined;
  })();
  const prazoValid = !!form.preset && !(form.preset === "personalizado" && !form.customISO);

  const finalize = async (withSteps: boolean) => {
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      const cat = catByArea[form.lifeArea] ?? "generico";
      const { id, firstStepId } = await createGoal({
        title: form.title.trim(),
        why: form.why.trim(),
        trackingType: "etapas",
        kind: "projeto",
        category: cat,
        lifeArea: form.lifeArea || "Carreira",
        deadlineLabel:
          form.preset === "personalizado" && deadlineDate
            ? fmtDate(deadlineDate)
            : form.preset || "sem prazo",
        deadlineISO: deadlineDate ? isoDate(deadlineDate) : undefined,
        metric: { target: Math.max(1, form.stepsList.length), unit: "etapas" },
        steps: withSteps
          ? form.stepsList.map((s) => ({ title: s.title, targetDate: s.targetDate || undefined }))
          : undefined,
      });
      if (withSteps && form.firstExecution.title && form.firstExecution.dueDate) {
        await createExecution({
          title: form.firstExecution.title,
          dueDate: form.firstExecution.dueDate,
          category: cat,
          weight: "medio",
          goalId: id,
          stepId: firstStepId,
        });
      }
      onDone(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível criar o plano. Tente de novo.");
      setSaving(false);
    }
  };

  return (
    <div className="mt-6">
      <div className="mb-6 flex items-center gap-1">
        {planSteps.map((s, i) => (
          <span
            key={s}
            className={`h-1 flex-1 rounded-full ${i <= planSteps.indexOf(step) ? "bg-primary" : "bg-surface-2"}`}
          />
        ))}
      </div>

      {step === "identidade" && (
        <Section
          title="O que você quer realizar?"
          hint="Uma frase basta. Prazo já é o suficiente pra salvar."
        >
          <div className="space-y-3">
            <Field
              label="O que você quer realizar"
              placeholder='Ex: "Abrir uma nova loja"'
              value={form.title}
              onChange={(v) => setForm({ ...form, title: v })}
              autoFocus
            />
            <div>
              <span className="mb-1 block text-[11px] uppercase tracking-wider text-muted-foreground">
                Por que isso é importante (opcional)
              </span>
              <textarea
                value={form.why}
                onChange={(e) => setForm({ ...form, why: e.target.value })}
                placeholder='Ex: "Quero expandir meu negócio."'
                className="card-surface min-h-20 w-full resize-none p-4 text-sm outline-none focus:border-primary"
              />
            </div>
            <div>
              <span className="mb-1.5 block text-[11px] uppercase tracking-wider text-muted-foreground">
                Área da vida (opcional)
              </span>
              <div className="flex flex-wrap gap-1.5">
                {lifeAreas.map((a) => (
                  <Chip
                    key={a}
                    active={form.lifeArea === a}
                    onClick={() => setForm({ ...form, lifeArea: a })}
                  >
                    {a}
                  </Chip>
                ))}
              </div>
            </div>
            <PrimaryBtn onClick={() => setStep("prazo")} disabled={!form.title}>
              Continuar
            </PrimaryBtn>
          </div>
        </Section>
      )}

      {step === "prazo" && (
        <Section
          title="Quando você quer realizar isso?"
          hint="Escolha um atalho ou uma data específica."
        >
          <div className="grid grid-cols-2 gap-2">
            {(["Semana", "Mês", "90 dias", "Semestre", "Ano"] as const).map((d) => (
              <button
                key={d}
                onClick={() => setForm({ ...form, preset: d, customISO: "" })}
                className={`rounded-xl border p-4 text-sm font-semibold transition-colors ${form.preset === d ? "border-primary bg-primary/10 text-primary" : "border-border bg-surface hover:border-primary/40"}`}
              >
                {d}
              </button>
            ))}
          </div>
          <div className="mt-3">
            <button
              onClick={() => setForm({ ...form, preset: "personalizado" })}
              className={`w-full rounded-xl border p-3 text-sm transition-colors ${form.preset === "personalizado" ? "border-primary bg-primary/10 text-primary" : "border-border bg-surface hover:border-primary/40"}`}
            >
              Data personalizada
            </button>
            {form.preset === "personalizado" && (
              <div className="mt-2">
                <DateField
                  value={form.customISO}
                  onChange={(v) => setForm({ ...form, customISO: v })}
                />
              </div>
            )}
          </div>
          {deadlineDate && (
            <div className="mt-4 rounded-xl border border-primary/25 bg-primary/5 p-3 text-[11px] text-muted-foreground">
              <span className="font-semibold text-primary">Prazo:</span> {fmtDate(deadlineDate)}.
            </div>
          )}
          <PrimaryBtn onClick={() => finalize(false)} disabled={!prazoValid || saving}>
            <Check className="h-4 w-4" /> {saving ? "Criando…" : "Criar plano"}
          </PrimaryBtn>
          {error && <p className="mt-2 text-[11px] text-danger">{error}</p>}
          <button
            onClick={() => setStep("etapas")}
            disabled={!prazoValid}
            className="mt-2 w-full text-xs font-semibold text-primary disabled:opacity-40"
          >
            + adicionar etapas antes de criar
          </button>
        </Section>
      )}

      {step === "etapas" && (
        <Section
          title="Quer dividir esse plano em etapas?"
          hint="Opcional. Data por etapa também é opcional — dá pra ajustar depois."
        >
          <div className="space-y-2">
            {form.stepsList.map((s) => (
              <div key={s.id} className="card-surface flex items-center justify-between gap-2 p-3">
                <div className="min-w-0">
                  <p className="truncate text-sm">{s.title}</p>
                  {s.targetDate && (
                    <p className="text-[10px] text-muted-foreground">
                      {formatDateBR(s.targetDate)}
                    </p>
                  )}
                </div>
                <button
                  onClick={() =>
                    setForm({ ...form, stepsList: form.stepsList.filter((x) => x.id !== s.id) })
                  }
                  className="shrink-0 text-muted-foreground hover:text-danger"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
            <div className="card-surface space-y-2 p-3">
              <input
                value={stepDraft}
                onChange={(e) => setStepDraft(e.target.value)}
                placeholder="Ex: Definir fornecedores"
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
              />
              <div className="flex gap-2">
                <DateField
                  value={stepDraftDate}
                  onChange={setStepDraftDate}
                  className="flex flex-1 items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-left text-sm outline-none focus:border-primary"
                />
                <button
                  onClick={() => {
                    if (!stepDraft.trim()) return;
                    setForm({
                      ...form,
                      stepsList: [
                        ...form.stepsList,
                        {
                          id: `d${Date.now().toString(36)}`,
                          title: stepDraft.trim(),
                          targetDate: stepDraftDate,
                        },
                      ],
                    });
                    setStepDraft("");
                    setStepDraftDate("");
                  }}
                  className="rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
          <div className="mt-5">
            <span className="mb-1 block text-[11px] uppercase tracking-wider text-muted-foreground">
              Quer já criar a primeira execução? (opcional — agenda fica pra depois)
            </span>
            <Field
              label="O que precisa ser feito?"
              placeholder="Ex: Pesquisar fornecedores"
              value={form.firstExecution.title}
              onChange={(v) =>
                setForm({ ...form, firstExecution: { ...form.firstExecution, title: v } })
              }
            />
            <div className="mt-2">
              <Field
                label="Até quando?"
                value={form.firstExecution.dueDate}
                onChange={(v) =>
                  setForm({ ...form, firstExecution: { ...form.firstExecution, dueDate: v } })
                }
                type="date"
              />
            </div>
          </div>
          <PrimaryBtn onClick={() => finalize(true)} disabled={saving}>
            <Check className="h-4 w-4" /> {saving ? "Criando…" : "Criar plano"}
          </PrimaryBtn>
          {error && <p className="mt-2 text-[11px] text-danger">{error}</p>}
        </Section>
      )}

      {step !== "identidade" && (
        <button onClick={back} className="mt-4 w-full text-xs text-muted-foreground">
          ← voltar
        </button>
      )}
    </div>
  );
}

function Chip({
  children,
  active,
  onClick,
}: {
  children: React.ReactNode;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3 py-1.5 text-[11px] font-semibold transition-colors ${active ? "bg-primary text-primary-foreground" : "border border-border bg-surface-2 text-muted-foreground hover:border-primary/40"}`}
    >
      {children}
    </button>
  );
}

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-balance-tight">{title}</h2>
        {hint && <p className="mt-1 text-sm text-muted-foreground">{hint}</p>}
      </div>
      {children}
    </div>
  );
}

function PrimaryBtn({
  children,
  className = "",
  ...p
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...p}
      className={`mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3.5 text-sm font-semibold text-primary-foreground transition-opacity disabled:opacity-40 ${className}`}
    >
      {children}
    </button>
  );
}

function Field({
  label,
  autoFocus,
  type = "text",
  ...p
}: {
  label: string;
  placeholder?: string;
  value: string;
  onChange: (v: string) => void;
  autoFocus?: boolean;
  type?: string;
}) {
  if (type === "date") {
    return <DateField label={label} value={p.value} onChange={p.onChange} />;
  }
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <input
        type={type}
        autoFocus={autoFocus}
        value={p.value}
        onChange={(e) => p.onChange(e.target.value)}
        placeholder={p.placeholder}
        className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-sm outline-none focus:border-primary"
      />
    </label>
  );
}
