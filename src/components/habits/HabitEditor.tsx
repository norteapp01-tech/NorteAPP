import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { NumberField } from "@/components/ui/number-field";
import { InlineError } from "@/components/ui/inline-error";
import { todayISO, useGoalsStore } from "@/lib/goals-store";
import { versionAt } from "@/lib/habits/engine";
import {
  createHabit,
  setGoalVersion,
  setHabitReminders,
  updateHabit,
  type HabitInput,
} from "@/lib/habits/store";
import type {
  ChecklistItem,
  EndCondition,
  GoalPeriod,
  Habit,
  HabitModule,
  HabitReminder,
  Intent,
  Measure,
  ModuleMetric,
  Schedule,
  TimeOfDay,
} from "@/lib/habits/types";
import { UNIT_SUGGESTIONS } from "@/lib/habits/units";
import { HABIT_TEMPLATES, type HabitTemplate } from "./habit-templates";
import {
  INTENT_LABEL,
  MEASURE_LABEL,
  PERIOD_LABEL,
  TIME_OF_DAY_LABEL,
  WEEKDAY_ABBR,
} from "@/lib/habits/format";
import { parseHabitPhrase } from "./parse-phrase";

const COLORS = [
  "#91f5da",
  "#7cb8ff",
  "#b9a1db",
  "#f0b867",
  "#f08a8a",
  "#8fd694",
  "#e59ad0",
  "#a3b1bf",
];

const MODULES: {
  id: HabitModule;
  label: string;
  metrics: { id: ModuleMetric; label: string }[];
}[] = [
  {
    id: "academia",
    label: "Academia",
    metrics: [
      { id: "sessions", label: "treinos concluídos" },
      { id: "minutes", label: "minutos de treino" },
    ],
  },
  {
    id: "esportes",
    label: "Esportes",
    metrics: [
      { id: "km", label: "quilômetros" },
      { id: "minutes", label: "minutos em movimento" },
      { id: "sessions", label: "atividades" },
    ],
  },
  {
    id: "leitura",
    label: "Leitura",
    metrics: [
      { id: "pages", label: "páginas lidas" },
      { id: "minutes", label: "minutos de leitura" },
      { id: "sessions", label: "sessões" },
    ],
  },
  { id: "agua", label: "Água", metrics: [{ id: "ml", label: "ml bebidos" }] },
];

type Kind = "daily" | "weekdays" | "monthdays" | "interval" | "flexible";

type Form = {
  name: string;
  intent: Intent;
  measure: Measure;
  unit: string;
  value: number;
  period: GoalPeriod;
  kind: Kind;
  weekdays: number[];
  monthdays: string;
  every: number;
  area: string;
  color: string;
  timesOfDay: TimeOfDay[];
  startDate: string;
  end: "none" | "date" | "completions" | "total";
  endDate: string;
  endCount: number;
  endAmount: number;
  checklist: ChecklistItem[];
  reminders: { time: string; weekdays: number[] }[];
  goalId: string;
  stepId: string;
  module: "" | HabitModule;
  moduleMetric: "" | ModuleMetric;
};

const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

function emptyForm(startDate: string): Form {
  return {
    name: "",
    intent: "build",
    measure: "binary",
    unit: "",
    value: 1,
    period: "day",
    kind: "daily",
    weekdays: [1, 2, 3, 4, 5],
    monthdays: "1",
    every: 2,
    area: "",
    color: COLORS[0],
    timesOfDay: [],
    startDate,
    end: "none",
    endDate: "",
    endCount: 30,
    endAmount: 100,
    checklist: [],
    reminders: [],
    goalId: "",
    stepId: "",
    module: "",
    moduleMetric: "",
  };
}

function formFromHabit(h: Habit, reminders: HabitReminder[], today: string): Form {
  const v = versionAt(h, today) ?? h.versions[h.versions.length - 1];
  const f = emptyForm(h.startDate);
  const s = v?.schedule ?? { type: "daily" as const };
  return {
    ...f,
    name: h.name,
    intent: h.intent,
    measure: h.measure,
    unit: h.unit ?? "",
    value: v?.goalValue ?? 1,
    period: v?.goalPeriod ?? "day",
    kind: v?.flexible ? "flexible" : s.type,
    weekdays: s.type === "weekdays" ? s.weekdays : f.weekdays,
    monthdays: s.type === "monthdays" ? s.days.join(", ") : f.monthdays,
    every: s.type === "interval" ? s.every : f.every,
    area: h.area ?? "",
    color: h.color ?? COLORS[0],
    timesOfDay: v?.timesOfDay ?? [],
    end: h.endCondition?.type ?? "none",
    endDate: h.endCondition?.type === "date" ? h.endCondition.date : "",
    endCount: h.endCondition?.type === "completions" ? h.endCondition.count : f.endCount,
    endAmount: h.endCondition?.type === "total" ? h.endCondition.amount : f.endAmount,
    checklist: v?.checklist ?? [],
    reminders: reminders
      .filter((r) => r.habitId === h.id && r.enabled)
      .map((r) => ({ time: r.time, weekdays: r.weekdays })),
    goalId: h.goalId ?? "",
    stepId: h.stepId ?? "",
    module: h.module ?? "",
    moduleMetric: h.moduleMetric ?? "",
  };
}

function toSchedule(f: Form): { schedule: Schedule; flexible: boolean } {
  if (f.kind === "flexible") return { schedule: { type: "daily" }, flexible: true };
  if (f.kind === "weekdays")
    return { schedule: { type: "weekdays", weekdays: f.weekdays }, flexible: false };
  if (f.kind === "monthdays") {
    const days = [
      ...new Set(
        f.monthdays
          .split(/[,\s]+/)
          .map((d) => parseInt(d, 10))
          .filter((d) => d >= 1 && d <= 31),
      ),
    ];
    return { schedule: { type: "monthdays", days }, flexible: false };
  }
  if (f.kind === "interval")
    return { schedule: { type: "interval", every: f.every }, flexible: false };
  return { schedule: { type: "daily" }, flexible: false };
}

function toEnd(f: Form): EndCondition | undefined {
  if (f.end === "date" && f.endDate) return { type: "date", date: f.endDate };
  if (f.end === "completions") return { type: "completions", count: f.endCount };
  if (f.end === "total") return { type: "total", amount: f.endAmount };
  return undefined;
}

const chip = (on: boolean) =>
  `interactive-press min-h-10 rounded-full border px-3.5 text-xs font-semibold ${
    on ? "border-primary/60 bg-primary/15 text-primary" : "border-border text-muted-foreground"
  }`;

export function HabitEditor({
  habit,
  reminders,
  knownAreas,
  onClose,
  onSaved,
}: {
  habit?: Habit;
  reminders: HabitReminder[];
  knownAreas: string[];
  onClose: () => void;
  onSaved: (id: string, created: boolean) => void;
}) {
  const today = todayISO();
  const goals = useGoalsStore((s) => s.goals);
  const steps = useGoalsStore((s) => s.steps);
  const [form, setForm] = useState<Form>(() =>
    habit ? formFromHabit(habit, reminders, today) : emptyForm(today),
  );
  const [stage, setStage] = useState<"start" | "form">(habit ? "form" : "start");
  const [phrase, setPhrase] = useState("");
  const [phraseError, setPhraseError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [scope, setScope] = useState<"today" | "start">("today");
  const original = useMemo(
    () => (habit ? formFromHabit(habit, reminders, today) : null),
    [habit, reminders, today],
  );
  const set = <K extends keyof Form>(patch: Pick<Form, K>) => setForm((f) => ({ ...f, ...patch }));

  const goalChanged =
    !!original &&
    (original.value !== form.value ||
      original.period !== form.period ||
      original.kind !== form.kind ||
      original.weekdays.join() !== form.weekdays.join() ||
      original.monthdays !== form.monthdays ||
      original.every !== form.every ||
      original.timesOfDay.join() !== form.timesOfDay.join() ||
      JSON.stringify(original.checklist) !== JSON.stringify(form.checklist));

  const applyTemplate = (t: HabitTemplate) => {
    setForm({
      ...emptyForm(today),
      name: t.name,
      intent: t.intent,
      measure: t.measure,
      unit: t.unit ?? "",
      value: t.value,
      period: t.period,
      area: t.area ?? "",
      module: t.module ?? "",
      moduleMetric: t.moduleMetric ?? "",
    });
    setStage("form");
  };

  const applyPhrase = () => {
    const draft = parseHabitPhrase(phrase);
    if (!draft) {
      setPhraseError("Não consegui entender. Tente algo como “ler 50 páginas por semana”.");
      return;
    }
    setPhraseError(null);
    setForm({
      ...emptyForm(today),
      name: draft.name,
      intent: draft.intent,
      measure: draft.measure,
      unit: draft.unit ?? "",
      value: draft.value,
      period: draft.period,
      kind: draft.period === "day" ? "daily" : "flexible",
    });
    setStage("form");
  };

  const setIntent = (intent: Intent) =>
    setForm((f) => ({
      ...f,
      intent,
      measure: intent === "quit" && f.measure === "binary" ? "count" : f.measure,
      unit: intent === "quit" && !f.unit ? "vezes" : f.unit,
      value: intent === "quit" ? 0 : f.value || 1,
    }));

  const setMeasure = (measure: Measure) =>
    setForm((f) => ({
      ...f,
      measure,
      unit:
        measure === "binary"
          ? ""
          : measure === "duration"
            ? "min"
            : measure === "count" && !f.unit
              ? "vezes"
              : f.unit,
      value: measure === "binary" ? Math.max(1, Math.round(f.value) || 1) : f.value,
    }));

  const validate = (): Record<string, string> => {
    const e: Record<string, string> = {};
    if (!form.name.trim()) e.name = "Dê um nome à rotina.";
    if (
      form.intent !== "quit" &&
      (!Number.isFinite(form.value) || form.value <= 0 || form.value >= 1_000_000_000)
    )
      e.value = "A meta precisa ser maior que zero.";
    if (form.intent === "limit" && form.measure === "binary")
      e.measure = "Para reduzir, conte vezes ou informe uma quantidade.";
    if (form.measure === "quantity" && !form.unit.trim()) e.unit = "Escolha uma unidade.";
    if (form.kind === "weekdays" && form.weekdays.length === 0)
      e.schedule = "Escolha ao menos um dia da semana.";
    if (
      form.kind === "monthdays" &&
      toSchedule(form).schedule.type === "monthdays" &&
      (toSchedule(form).schedule as { days: number[] }).days.length === 0
    )
      e.schedule = "Informe dias do mês entre 1 e 31.";
    if (form.kind === "interval" && (form.every < 1 || form.every > 365))
      e.schedule = "O intervalo vai de 1 a 365 dias.";
    if (form.end === "date" && !form.endDate) e.end = "Escolha a data de encerramento.";
    if (form.end === "date" && form.endDate && form.endDate < form.startDate)
      e.end = "A data final precisa ser depois do início.";
    if (form.end === "completions" && !(form.endCount >= 1))
      e.end = "Informe quantas conclusões encerram.";
    if (form.end === "total" && !(form.endAmount > 0)) e.end = "Informe a quantidade que encerra.";
    if (form.reminders.some((r) => !/^([01]\d|2[0-3]):[0-5]\d$/.test(r.time)))
      e.reminders = "Horário de lembrete inválido.";
    if (form.module && !form.moduleMetric) e.module = "Escolha o que o módulo conta.";
    return e;
  };

  const save = async () => {
    if (saving) return;
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length) return;
    setSaving(true);
    setFormError(null);
    try {
      const { schedule, flexible } = toSchedule(form);
      const goal = {
        value: form.intent === "quit" ? 0 : form.value,
        period: form.period,
        schedule,
        flexible,
        timesOfDay: form.timesOfDay,
        checklist: form.checklist.filter((c) => c.title.trim()),
      };
      const unit = form.measure === "binary" ? undefined : form.unit.trim() || undefined;
      if (!habit) {
        const input: HabitInput = {
          name: form.name,
          color: form.color,
          area: form.area || undefined,
          intent: form.intent,
          measure: form.measure,
          unit,
          startDate: form.startDate,
          endCondition: toEnd(form),
          goalId: form.goalId || undefined,
          stepId: form.stepId || undefined,
          module: form.module || undefined,
          moduleMetric: form.moduleMetric || undefined,
          goal,
          reminders: form.reminders,
        };
        const id = await createHabit(input);
        onSaved(id, true);
      } else {
        await updateHabit(habit.id, {
          name: form.name,
          color: form.color,
          area: form.area || undefined,
          unit,
          endCondition: toEnd(form),
          goalId: form.goalId || undefined,
          stepId: form.stepId || undefined,
        });
        if (goalChanged)
          await setGoalVersion(habit, goal, scope === "today" ? today : habit.startDate);
        if (JSON.stringify(original?.reminders) !== JSON.stringify(form.reminders))
          await setHabitReminders(habit.id, form.reminders);
        onSaved(habit.id, false);
      }
      onClose();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Não foi possível salvar. Tente de novo.");
      setSaving(false);
    }
  };

  const stepsOfGoal = steps.filter((s) => s.goalId === form.goalId);
  const moduleDef = MODULES.find((m) => m.id === form.module);
  const fieldError = (k: string) =>
    errors[k] ? <p className="mt-1 text-xs text-danger">{errors[k]}</p> : null;

  if (stage === "start") {
    return (
      <Modal onClose={onClose} title="Nova rotina">
        <div className="space-y-5">
          <section>
            <label htmlFor="habit-phrase" className="mb-1 block text-sm font-medium">
              Conte em uma frase
            </label>
            <div className="flex gap-2">
              <input
                id="habit-phrase"
                value={phrase}
                onChange={(e) => setPhrase(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && applyPhrase()}
                placeholder="Ex.: ler 50 páginas por semana"
                className="min-h-12 min-w-0 flex-1 rounded-xl border border-border bg-surface px-3 text-sm outline-none focus:border-primary"
              />
              <button
                type="button"
                onClick={applyPhrase}
                disabled={phrase.trim().length < 3}
                className="interactive-press min-h-12 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-40"
              >
                Preencher
              </button>
            </div>
            {phraseError && (
              <p role="alert" className="mt-1.5 text-xs text-danger">
                {phraseError}
              </p>
            )}
            <p className="mt-1.5 text-[11px] text-muted-foreground">
              Você revisa tudo antes de salvar.
            </p>
          </section>

          <section>
            <h3 className="mb-2 text-[11px] uppercase tracking-wider text-muted-foreground">
              Ou comece por um modelo
            </h3>
            <div className="grid grid-cols-2 gap-2">
              {HABIT_TEMPLATES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => applyTemplate(t)}
                  className="habit-template interactive-press"
                >
                  <strong>{t.name}</strong>
                  <span>
                    {t.intent === "build" ? "" : `${INTENT_LABEL[t.intent]} · `}
                    {t.measure === "binary"
                      ? "Feito / não feito"
                      : `${t.value} ${t.unit ?? "min"} ${PERIOD_LABEL[t.period]}`}
                  </span>
                </button>
              ))}
            </div>
          </section>

          <button
            type="button"
            onClick={() => setStage("form")}
            className="interactive-press min-h-12 w-full rounded-xl border border-border text-sm font-semibold"
          >
            Criar do zero
          </button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      onClose={onClose}
      title={habit ? "Editar rotina" : "Nova rotina"}
      footer={
        <div className="space-y-2">
          {formError && <InlineError message={formError} />}
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="interactive-press min-h-12 w-full rounded-xl bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-40"
          >
            {saving ? "Salvando…" : habit ? "Salvar alterações" : "Criar rotina"}
          </button>
        </div>
      }
    >
      <div className="space-y-6">
        <div>
          <label
            htmlFor="habit-name"
            className="mb-1 block text-[11px] uppercase tracking-wider text-muted-foreground"
          >
            Nome
          </label>
          <input
            id="habit-name"
            value={form.name}
            maxLength={120}
            onChange={(e) => set({ name: e.target.value })}
            placeholder="Ex.: Beber água"
            aria-invalid={!!errors.name}
            className="min-h-12 w-full rounded-xl border border-border bg-surface px-3 text-base outline-none focus:border-primary"
          />
          {fieldError("name")}
        </div>

        {!habit && (
          <div role="radiogroup" aria-label="Intenção" className="grid grid-cols-3 gap-2">
            {(["build", "limit", "quit"] as Intent[]).map((i) => (
              <button
                key={i}
                role="radio"
                aria-checked={form.intent === i}
                onClick={() => setIntent(i)}
                className={chip(form.intent === i)}
              >
                {INTENT_LABEL[i]}
              </button>
            ))}
          </div>
        )}

        {!habit && form.intent !== "quit" && (
          <div>
            <p className="mb-1 text-[11px] uppercase tracking-wider text-muted-foreground">
              Como medir
            </p>
            <div role="radiogroup" aria-label="Como medir" className="flex flex-wrap gap-2">
              {(["binary", "count", "quantity", "duration"] as Measure[]).map((m) => (
                <button
                  key={m}
                  role="radio"
                  aria-checked={form.measure === m}
                  onClick={() => setMeasure(m)}
                  className={chip(form.measure === m)}
                >
                  {MEASURE_LABEL[m]}
                </button>
              ))}
            </div>
            {fieldError("measure")}
          </div>
        )}

        {form.intent !== "quit" && (
          <div>
            <p className="mb-1 text-[11px] uppercase tracking-wider text-muted-foreground">
              {form.intent === "limit" ? "Limite" : "Meta"}
            </p>
            <div className="flex items-center gap-2">
              <NumberField
                value={form.value}
                onValue={(v) => set({ value: v })}
                onEmpty={() => set({ value: 0 })}
                aria-label="Valor da meta"
                className="min-h-12 w-24 rounded-xl border border-border bg-surface px-3 text-center text-lg font-semibold outline-none focus:border-primary"
              />
              {form.measure !== "binary" && form.measure !== "duration" && (
                <input
                  list="habit-units"
                  value={form.unit}
                  maxLength={24}
                  onChange={(e) => set({ unit: e.target.value })}
                  aria-label="Unidade"
                  placeholder="unidade"
                  className="min-h-12 min-w-0 flex-1 rounded-xl border border-border bg-surface px-3 text-sm outline-none focus:border-primary"
                />
              )}
              {form.measure === "binary" && (
                <span className="text-sm text-muted-foreground">
                  {form.value === 1 ? "dia" : "dias"}
                </span>
              )}
              {form.measure === "duration" && (
                <span className="text-sm text-muted-foreground">min</span>
              )}
            </div>
            <datalist id="habit-units">
              {UNIT_SUGGESTIONS.map((u) => (
                <option key={u} value={u} />
              ))}
            </datalist>
            {fieldError("value")}
            {fieldError("unit")}
            <div
              role="radiogroup"
              aria-label="Período da meta"
              className="mt-2 flex flex-wrap gap-2"
            >
              {(["day", "week", "month", "year"] as GoalPeriod[]).map((p) => (
                <button
                  key={p}
                  role="radio"
                  aria-checked={form.period === p}
                  onClick={() => set({ period: p })}
                  className={chip(form.period === p)}
                >
                  {PERIOD_LABEL[p]}
                </button>
              ))}
            </div>
          </div>
        )}
        {form.intent === "quit" && (
          <p className="rounded-xl border border-border px-3 py-2.5 text-sm text-muted-foreground">
            A meta é zero. Registre quando acontecer e feche o dia para confirmar que ficou limpo —
            sem fechar, o Norte não conclui nada por você.
          </p>
        )}

        <div>
          <p className="mb-1 text-[11px] uppercase tracking-wider text-muted-foreground">
            Quando aparece
          </p>
          <div role="radiogroup" aria-label="Frequência" className="flex flex-wrap gap-2">
            {(
              [
                ["daily", "Todo dia"],
                ["weekdays", "Dias da semana"],
                ["monthdays", "Dias do mês"],
                ["interval", "A cada N dias"],
                ["flexible", "Sem dia fixo"],
              ] as [Kind, string][]
            ).map(([k, label]) => (
              <button
                key={k}
                role="radio"
                aria-checked={form.kind === k}
                onClick={() => set({ kind: k })}
                className={chip(form.kind === k)}
              >
                {label}
              </button>
            ))}
          </div>
          {form.kind === "weekdays" && (
            <div role="group" aria-label="Dias da semana" className="mt-3 flex gap-1.5">
              {ALL_DAYS.map((d) => (
                <button
                  key={d}
                  type="button"
                  aria-pressed={form.weekdays.includes(d)}
                  aria-label={WEEKDAY_ABBR[d]}
                  onClick={() =>
                    set({
                      weekdays: form.weekdays.includes(d)
                        ? form.weekdays.filter((x) => x !== d)
                        : [...form.weekdays, d],
                    })
                  }
                  className={`interactive-press h-10 min-w-0 flex-1 rounded-full border text-xs font-semibold ${
                    form.weekdays.includes(d)
                      ? "border-primary/60 bg-primary/15 text-primary"
                      : "border-border text-muted-foreground"
                  }`}
                >
                  {WEEKDAY_ABBR[d]}
                </button>
              ))}
            </div>
          )}
          {form.kind === "monthdays" && (
            <input
              value={form.monthdays}
              onChange={(e) => set({ monthdays: e.target.value })}
              aria-label="Dias do mês"
              placeholder="Ex.: 1, 15, 30"
              className="mt-3 min-h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm outline-none focus:border-primary"
            />
          )}
          {form.kind === "interval" && (
            <div className="mt-3 flex items-center gap-2 text-sm">
              A cada
              <NumberField
                integer
                value={form.every}
                onValue={(v) => set({ every: v })}
                aria-label="Intervalo em dias"
                className="min-h-11 w-20 rounded-xl border border-border bg-surface px-3 text-center outline-none focus:border-primary"
              />
              dias
            </div>
          )}
          {form.kind === "flexible" && (
            <p className="mt-2 text-xs text-muted-foreground">
              A meta vale para o período inteiro; a rotina aparece todo dia até ser cumprida.
            </p>
          )}
          {fieldError("schedule")}
        </div>

        {habit && goalChanged && (
          <fieldset className="rounded-xl border border-primary/40 bg-primary/5 p-3">
            <legend className="px-1 text-xs font-semibold text-primary">
              Valer a partir de quando?
            </legend>
            <label className="flex min-h-11 items-center gap-3 text-sm">
              <input
                type="radio"
                name="scope"
                checked={scope === "today"}
                onChange={() => setScope("today")}
                className="accent-primary"
              />
              De hoje em diante (o passado fica como estava)
            </label>
            <label className="flex min-h-11 items-center gap-3 text-sm">
              <input
                type="radio"
                name="scope"
                checked={scope === "start"}
                onChange={() => setScope("start")}
                className="accent-primary"
              />
              Desde o início (reescreve o histórico)
            </label>
          </fieldset>
        )}

        <details
          className="rounded-xl border border-border px-3 py-2"
          open={!!habit && (form.area !== "" || form.checklist.length > 0)}
        >
          <summary className="min-h-10 cursor-pointer py-2 text-sm font-medium">
            Mais opções
          </summary>
          <div className="space-y-5 pb-2 pt-3">
            <div>
              <label
                htmlFor="habit-area"
                className="mb-1 block text-[11px] uppercase tracking-wider text-muted-foreground"
              >
                Área
              </label>
              <input
                id="habit-area"
                list="habit-areas"
                value={form.area}
                maxLength={40}
                onChange={(e) => set({ area: e.target.value })}
                placeholder="Saúde, Estudo…"
                className="min-h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm outline-none focus:border-primary"
              />
              <datalist id="habit-areas">
                {knownAreas.map((a) => (
                  <option key={a} value={a} />
                ))}
              </datalist>
            </div>

            <div>
              <p className="mb-1 text-[11px] uppercase tracking-wider text-muted-foreground">Cor</p>
              <div role="radiogroup" aria-label="Cor" className="flex flex-wrap gap-2">
                {COLORS.map((c) => (
                  <button
                    key={c}
                    role="radio"
                    aria-checked={form.color === c}
                    aria-label={`Cor ${c}`}
                    onClick={() => set({ color: c })}
                    style={{ background: c }}
                    className={`h-9 w-9 rounded-full border-2 ${form.color === c ? "border-foreground" : "border-transparent"}`}
                  />
                ))}
              </div>
            </div>

            <div>
              <p className="mb-1 text-[11px] uppercase tracking-wider text-muted-foreground">
                Período do dia
              </p>
              <div className="flex flex-wrap gap-2">
                {(["morning", "afternoon", "evening"] as TimeOfDay[]).map((t) => (
                  <button
                    key={t}
                    type="button"
                    aria-pressed={form.timesOfDay.includes(t)}
                    onClick={() =>
                      set({
                        timesOfDay: form.timesOfDay.includes(t)
                          ? form.timesOfDay.filter((x) => x !== t)
                          : [...form.timesOfDay, t],
                      })
                    }
                    className={chip(form.timesOfDay.includes(t))}
                  >
                    {TIME_OF_DAY_LABEL[t]}
                  </button>
                ))}
              </div>
            </div>

            {!habit && (
              <label className="block text-[11px] uppercase tracking-wider text-muted-foreground">
                Começa em
                <input
                  type="date"
                  value={form.startDate}
                  onChange={(e) => e.target.value && set({ startDate: e.target.value })}
                  className="mt-1 min-h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm normal-case tracking-normal text-foreground"
                />
              </label>
            )}

            <div>
              <p className="mb-1 text-[11px] uppercase tracking-wider text-muted-foreground">
                Encerrar quando
              </p>
              <div role="radiogroup" aria-label="Encerramento" className="flex flex-wrap gap-2">
                {(
                  [
                    ["none", "Nunca"],
                    ["date", "Numa data"],
                    ["completions", "Após N conclusões"],
                    ["total", "Após uma quantidade"],
                  ] as const
                ).map(([k, label]) => (
                  <button
                    key={k}
                    role="radio"
                    aria-checked={form.end === k}
                    onClick={() => set({ end: k })}
                    className={chip(form.end === k)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {form.end === "date" && (
                <input
                  type="date"
                  value={form.endDate}
                  onChange={(e) => set({ endDate: e.target.value })}
                  aria-label="Data de encerramento"
                  className="mt-2 min-h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm"
                />
              )}
              {form.end === "completions" && (
                <NumberField
                  integer
                  value={form.endCount}
                  onValue={(v) => set({ endCount: v })}
                  aria-label="Número de conclusões"
                  className="mt-2 min-h-11 w-28 rounded-xl border border-border bg-surface px-3 text-center"
                />
              )}
              {form.end === "total" && (
                <NumberField
                  value={form.endAmount}
                  onValue={(v) => set({ endAmount: v })}
                  aria-label="Quantidade total"
                  className="mt-2 min-h-11 w-32 rounded-xl border border-border bg-surface px-3 text-center"
                />
              )}
              {fieldError("end")}
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                Ao atingir, o Norte pergunta se você continua ou arquiva — nada some sozinho.
              </p>
            </div>

            <div>
              <p className="mb-1 text-[11px] uppercase tracking-wider text-muted-foreground">
                Checklist da rotina
              </p>
              <div className="space-y-2">
                {form.checklist.map((item, i) => (
                  <div key={item.id} className="flex items-center gap-2">
                    <input
                      value={item.title}
                      maxLength={120}
                      onChange={(e) =>
                        set({
                          checklist: form.checklist.map((c, j) =>
                            j === i ? { ...c, title: e.target.value } : c,
                          ),
                        })
                      }
                      aria-label={`Item ${i + 1} do checklist`}
                      className="min-h-11 min-w-0 flex-1 rounded-xl border border-border bg-surface px-3 text-sm outline-none focus:border-primary"
                    />
                    <button
                      type="button"
                      onClick={() => set({ checklist: form.checklist.filter((_, j) => j !== i) })}
                      aria-label={`Remover item ${i + 1}`}
                      className="interactive-press grid h-11 w-11 place-items-center rounded-full text-muted-foreground"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
                {form.checklist.length < 30 && (
                  <button
                    type="button"
                    onClick={() =>
                      set({
                        checklist: [
                          ...form.checklist,
                          { id: crypto.randomUUID().slice(0, 8), title: "" },
                        ],
                      })
                    }
                    className="interactive-press inline-flex min-h-10 items-center gap-1 text-xs font-semibold text-primary"
                  >
                    <Plus className="h-3.5 w-3.5" /> Adicionar item
                  </button>
                )}
              </div>
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                Reinicia a cada ocorrência: o de ontem fica com o de ontem.
              </p>
            </div>

            <div>
              <p className="mb-1 text-[11px] uppercase tracking-wider text-muted-foreground">
                Lembretes
              </p>
              <div className="space-y-2">
                {form.reminders.map((r, i) => (
                  <div key={i} className="rounded-xl border border-border p-2.5">
                    <div className="flex items-center gap-2">
                      <input
                        type="time"
                        value={r.time}
                        onChange={(e) =>
                          set({
                            reminders: form.reminders.map((x, j) =>
                              j === i ? { ...x, time: e.target.value } : x,
                            ),
                          })
                        }
                        aria-label={`Horário do lembrete ${i + 1}`}
                        className="min-h-11 rounded-xl border border-border bg-surface px-3 text-sm"
                      />
                      <button
                        type="button"
                        onClick={() => set({ reminders: form.reminders.filter((_, j) => j !== i) })}
                        aria-label={`Remover lembrete ${i + 1}`}
                        className="interactive-press ml-auto grid h-11 w-11 place-items-center rounded-full text-muted-foreground"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                    <div role="group" aria-label="Dias do lembrete" className="mt-2 flex gap-1">
                      {ALL_DAYS.map((d) => (
                        <button
                          key={d}
                          type="button"
                          aria-pressed={r.weekdays.includes(d)}
                          aria-label={WEEKDAY_ABBR[d]}
                          onClick={() =>
                            set({
                              reminders: form.reminders.map((x, j) =>
                                j === i
                                  ? {
                                      ...x,
                                      weekdays: x.weekdays.includes(d)
                                        ? x.weekdays.filter((w) => w !== d)
                                        : [...x.weekdays, d].sort(),
                                    }
                                  : x,
                              ),
                            })
                          }
                          className={`interactive-press h-9 min-w-0 flex-1 rounded-full border text-[11px] font-semibold ${
                            r.weekdays.includes(d)
                              ? "border-primary/60 bg-primary/15 text-primary"
                              : "border-border text-muted-foreground"
                          }`}
                        >
                          {WEEKDAY_ABBR[d].slice(0, 1)}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() =>
                    set({ reminders: [...form.reminders, { time: "08:00", weekdays: ALL_DAYS }] })
                  }
                  className="interactive-press inline-flex min-h-10 items-center gap-1 text-xs font-semibold text-primary"
                >
                  <Plus className="h-3.5 w-3.5" /> Adicionar lembrete
                </button>
              </div>
              {fieldError("reminders")}
            </div>

            {goals.length > 0 && (
              <div className="space-y-2">
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                  Ligar a um plano
                </p>
                <select
                  value={form.goalId}
                  onChange={(e) => set({ goalId: e.target.value, stepId: "" })}
                  aria-label="Plano"
                  className="min-h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm"
                >
                  <option value="">Nenhum</option>
                  {goals.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.title}
                    </option>
                  ))}
                </select>
                {form.goalId && stepsOfGoal.length > 0 && (
                  <select
                    value={form.stepId}
                    onChange={(e) => set({ stepId: e.target.value })}
                    aria-label="Etapa"
                    className="min-h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm"
                  >
                    <option value="">Qualquer etapa</option>
                    {stepsOfGoal.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.title}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            )}

            {!habit && (
              <div className="space-y-2">
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                  Alimentar sozinha a partir de um módulo
                </p>
                <select
                  value={form.module}
                  onChange={(e) => {
                    const m = MODULES.find((x) => x.id === e.target.value);
                    set({
                      module: (e.target.value as HabitModule) || "",
                      moduleMetric: m?.metrics[0].id ?? "",
                    });
                  }}
                  aria-label="Módulo"
                  className="min-h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm"
                >
                  <option value="">Não (registro manual)</option>
                  {MODULES.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                </select>
                {moduleDef && (
                  <select
                    value={form.moduleMetric}
                    onChange={(e) => set({ moduleMetric: e.target.value as ModuleMetric })}
                    aria-label="O que contar"
                    className="min-h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm"
                  >
                    {moduleDef.metrics.map((m) => (
                      <option key={m.id} value={m.id}>
                        Contar {m.label}
                      </option>
                    ))}
                  </select>
                )}
                {fieldError("module")}
                {form.module && (
                  <p className="text-[11px] text-muted-foreground">
                    O que você registrar em {moduleDef?.label} entra aqui automaticamente, uma única
                    vez. Os valores da meta precisam estar na mesma unidade.
                  </p>
                )}
              </div>
            )}
          </div>
        </details>
      </div>
    </Modal>
  );
}
