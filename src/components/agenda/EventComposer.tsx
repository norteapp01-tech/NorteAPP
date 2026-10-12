import { useMemo, useState, type ReactNode } from "react";
import { AlertTriangle, Check, ChevronDown, ChevronUp, Link2, Lock, Target } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { DateField } from "@/components/ui/date-wheel-picker";
import { InlineError } from "@/components/ui/inline-error";
import { PlanItemPicker, type PlanItemSelection } from "@/components/plan/PlanItemPicker";
import { categoryMeta } from "@/lib/mock-data";
import {
  addDaysISO,
  durationMinutes,
  findConflicts,
  formatDuration,
  isValidTimeRange,
  suggestFreeSlots,
  type FreeSlot,
} from "@/lib/agenda-intervals";
import { minutesToTime, timeToMinutes } from "@/lib/agenda-time";
import { normalizeRule, type RecurrenceRule } from "@/lib/agenda-recurrence";
import { toConflictable } from "@/lib/agenda-search";
import { relativeDayLabel } from "@/lib/agenda-navigation";
import type { AgendaOccurrence } from "@/lib/agenda-occurrences";
import { setExecutionAlerts } from "@/lib/agenda-alerts";
import {
  archiveSeries,
  createSeries,
  editOccurrence,
  removeOccurrence,
  type OccurrenceChanges,
} from "@/lib/agenda-series-store";
import {
  createExecution,
  removeAgendaSession,
  removeExecution,
  scheduleExecution,
  scheduleStepAsExecution,
  updateExecutionDetails,
  formatDateBR,
} from "@/lib/goals-store";
import { formatTime } from "@/lib/format-utils";
import { AlertsEditor } from "./AlertsEditor";
import { useAgendaFeedback } from "./agenda-feedback";
import { LabelManager } from "./LabelManager";
import { LabelPicker } from "./LabelChips";
import { RecurrenceEditor } from "./RecurrenceEditor";
import { useAgendaData } from "./use-agenda-data";
import "./agenda-ui.css";

export type ComposerSeed = {
  mode: "create" | "edit";
  /** Compromisso de origem: editado (mode=edit) ou duplicado (mode=create). */
  source?: AgendaOccurrence;
  date: string;
  startTime: string;
  endTime: string;
  /** Plano/etapa/execução já escolhidos (atalhos vindos do plano). */
  selection?: PlanItemSelection | null;
};

type Form = {
  title: string;
  date: string;
  allDay: boolean;
  startTime: string;
  endTime: string;
  labelId: string | null;
  category: string;
  location: string;
  notes: string;
  link: string;
  rigid: boolean;
  recurrence: RecurrenceRule | null;
  alerts: number[];
};

const DURATION_CHIPS = [15, 30, 45, 60, 90, 120];

class CancelledEdit extends Error {}

const clock = (minutes: number) => minutesToTime(((minutes % 1440) + 1440) % 1440);

function sameAlerts(a: number[], b: number[]) {
  return a.length === b.length && [...a].sort().every((v, i) => v === [...b].sort()[i]);
}

/** Compromisso novo, editado ou duplicado — o mesmo formulário para o botão
 * "Novo", o toque no espaço vazio da linha do tempo e a edição. */
export function EventComposer({
  seed,
  onClose,
  onDone,
  variant = "sheet",
}: {
  seed: ComposerSeed;
  onClose: () => void;
  /** Depois de salvar com sucesso (a página /criar usa para navegar). */
  onDone?: () => void;
  variant?: "sheet" | "page";
}) {
  const feedback = useAgendaFeedback();
  const editing = seed.mode === "edit" && !!seed.source;
  const source = seed.source;

  const [openRange] = useState(() => ({
    from: addDaysISO(seed.date, -1),
    to: addDaysISO(seed.date, 21),
  }));
  const {
    occurrences: baseOccurrences,
    labels,
    alerts: alertsStore,
    settings,
    series,
    clock: now,
    nowMinute,
    profile,
  } = useAgendaData(openRange);

  const sourceSeries = source?.seriesId ? series.find((s) => s.id === source.seriesId) : undefined;
  const initialAlerts = useMemo(() => {
    if (source?.executionId) return alertsStore.forExecution(source.executionId);
    return source?.alerts ?? sourceSeries?.alerts ?? [];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [form, setForm] = useState<Form>(() => {
    if (source) {
      return {
        title: source.title,
        date: editing ? source.date : seed.date,
        allDay: source.allDay,
        startTime: editing ? (source.startTime ?? seed.startTime) : seed.startTime,
        endTime: editing ? (source.endTime ?? seed.endTime) : seed.endTime,
        labelId: source.labelId ?? null,
        category: source.category,
        location: source.location ?? "",
        notes: source.notes ?? "",
        link: source.link ?? "",
        rigid: source.rigid,
        recurrence: editing && sourceSeries ? sourceSeries.rule : null,
        alerts: initialAlerts,
      };
    }
    return {
      title: "",
      date: seed.date,
      allDay: false,
      startTime: seed.startTime,
      endTime: seed.endTime,
      labelId: settings.defaultLabelId,
      category: "generico",
      location: "",
      notes: "",
      link: "",
      rigid: true,
      recurrence: null,
      alerts: settings.defaultAlertMin !== null ? [settings.defaultAlertMin] : [],
    };
  });
  const [selection, setSelection] = useState<PlanItemSelection | null>(seed.selection ?? null);
  const [showPicker, setShowPicker] = useState(false);
  const [showLabels, setShowLabels] = useState(false);
  const [advanced, setAdvanced] = useState(
    () =>
      Boolean(source && (source.location || source.notes || source.link)) ||
      Boolean(seed.selection),
  );
  const [endTouched, setEndTouched] = useState(editing);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const set = (patch: Partial<Form>) => setForm((f) => ({ ...f, ...patch }));
  const setStart = (startTime: string) => {
    if (!startTime) return set({ startTime });
    // Enquanto a pessoa não mexeu no fim, ele acompanha o início mantendo a duração.
    if (!endTouched && form.startTime && form.endTime) {
      const duration = durationMinutes(form.startTime, form.endTime);
      return set({ startTime, endTime: clock(timeToMinutes(startTime) + duration) });
    }
    set({ startTime });
  };
  const setDuration = (minutes: number) => {
    if (!form.startTime) return;
    setEndTouched(true);
    set({ endTime: clock(timeToMinutes(form.startTime) + minutes) });
  };

  const fromSelection = selection?.kind === "step" || selection?.kind === "execution";
  const title = fromSelection
    ? selection.kind === "step"
      ? selection.step.title
      : selection.execution.title
    : form.title;
  const timesOk = form.allDay || isValidTimeRange(form.startTime, form.endTime);
  const canRepeat = !selection || selection.kind === "goal";
  // Prazo mais cedo entre a ação/etapa e o plano: as sugestões não passam dele.
  const planDeadline = useMemo(() => {
    if (!selection) return undefined;
    const own =
      selection.kind === "execution"
        ? selection.execution.dueDate
        : selection.kind === "step"
          ? selection.step.targetDate
          : undefined;
    const goalDeadline = selection.goal.deadlineISO;
    const dates = [own, goalDeadline].filter((d): d is string => !!d && d >= now.date);
    return dates.length ? dates.sort()[0] : undefined;
  }, [selection, now.date]);
  const valid = !!title.trim() && !!form.date && timesOk;
  const duration =
    form.startTime && form.endTime
      ? durationMinutes(form.startTime, form.endTime)
      : settings.defaultDurationMin;

  // Conflitos e horários livres — recalculados enquanto a pessoa ajusta.
  const others = useMemo(
    () =>
      baseOccurrences
        .filter((o) => o.key !== source?.key && !o.allDay && o.startTime)
        .map(toConflictable),
    [baseOccurrences, source?.key],
  );
  const conflicts = useMemo(
    () =>
      valid && !form.allDay
        ? findConflicts(
            { date: form.date, startTime: form.startTime, endTime: form.endTime },
            others,
          )
        : [],
    [valid, form.allDay, form.date, form.startTime, form.endTime, others],
  );
  const slots = useMemo<FreeSlot[]>(
    () =>
      conflicts.length === 0
        ? []
        : suggestFreeSlots({
            date: form.date >= now.date ? form.date : now.date,
            duration,
            items: others,
            windowStart: settings.dayStart,
            windowEnd: settings.dayEnd,
            notBeforeMinute:
              (form.date >= now.date ? form.date : now.date) === now.date ? nowMinute : undefined,
            // Ação de plano: nunca sugerir depois do prazo.
            lastDate: planDeadline,
            limit: 3,
          }),
    [
      planDeadline,
      conflicts.length,
      form.date,
      duration,
      others,
      settings.dayStart,
      settings.dayEnd,
      now.date,
      nowMinute,
    ],
  );

  const applySlot = (slot: FreeSlot) => {
    setEndTouched(true);
    set({ date: slot.date, startTime: slot.start, endTime: slot.end });
  };

  const save = async () => {
    if (!valid || saving) return;
    setSaving(true);
    setError("");
    try {
      if (editing && source) await saveEdit(source);
      else await saveCreate();
      onDone?.();
      onClose();
    } catch (e) {
      // A pessoa desistiu na pergunta de escopo: não é erro, o formulário segue aberto.
      if (e instanceof CancelledEdit) return;
      setError(e instanceof Error ? e.message : "Não foi possível salvar. Tente de novo.");
    } finally {
      setSaving(false);
    }
  };

  const startForStore = form.allDay ? "" : form.startTime;
  const endForStore = form.allDay ? undefined : form.endTime;

  async function saveCreate() {
    const goal = selection?.goal;
    const category =
      selection && selection.kind !== "execution" ? selection.goal.category : form.category;

    if (form.recurrence && canRepeat) {
      const id = await createSeries({
        title: title.trim(),
        category,
        labelId: form.labelId ?? undefined,
        location: form.location.trim() || undefined,
        notes: form.notes.trim() || undefined,
        link: form.link.trim() || undefined,
        rigid: form.rigid,
        goalId: goal?.id,
        stepId: selection?.kind === "step" ? selection.step.id : undefined,
        startDate: form.date,
        startTime: form.allDay ? undefined : form.startTime,
        endTime: form.allDay ? undefined : form.endTime,
        allDay: form.allDay,
        rule: normalizeRule(form.recurrence),
        alerts: form.alerts,
      });
      void feedback.run("Compromisso recorrente criado.", async () => ({
        undo: async () => archiveSeries(id),
      }));
      return;
    }

    let executionId: string;
    let undo: () => Promise<void>;
    if (selection?.kind === "execution") {
      executionId = selection.execution.id;
      await scheduleExecution(executionId, form.date, startForStore, endForStore);
      undo = async () => removeAgendaSession(executionId);
    } else if (selection?.kind === "step") {
      executionId = await scheduleStepAsExecution(
        selection.step,
        selection.goal,
        form.date,
        startForStore,
        endForStore,
      );
      undo = async () => removeExecution(executionId);
    } else {
      executionId = await createExecution({
        title: title.trim(),
        dueDate: form.date,
        agendaDate: form.date,
        startTime: startForStore,
        endTime: endForStore,
        category,
        location: form.location.trim() || undefined,
        rigid: form.rigid,
        weight: "leve",
        goalId: goal?.id,
        labelId: form.labelId ?? undefined,
        notes: form.notes.trim() || undefined,
        link: form.link.trim() || undefined,
        allDay: form.allDay,
      });
      undo = async () => removeExecution(executionId);
    }
    // Vínculos com plano mantêm título/categoria do plano; o resto é da Agenda.
    if (selection?.kind === "execution" || selection?.kind === "step") {
      await updateExecutionDetails(executionId, {
        labelId: form.labelId,
        notes: form.notes.trim() || null,
        link: form.link.trim() || null,
        location: form.location.trim() || null,
        allDay: form.allDay,
      });
    }
    if (form.alerts.length > 0)
      await setExecutionAlerts(
        {
          id: executionId,
          title: title.trim(),
          date: form.date,
          startTime: form.allDay ? undefined : form.startTime,
        },
        form.alerts,
      );
    void feedback.run("Compromisso criado.", async () => ({ undo }));
  }

  async function saveEdit(original: AgendaOccurrence) {
    const changes: OccurrenceChanges = {};
    const text = (v: string) => v.trim() || null;
    if (form.title.trim() !== original.title) changes.title = form.title.trim();
    if (form.category !== original.category) changes.category = form.category;
    if ((form.labelId ?? null) !== (original.labelId ?? null)) changes.labelId = form.labelId;
    if (text(form.location) !== (original.location ?? null)) changes.location = text(form.location);
    if (text(form.notes) !== (original.notes ?? null)) changes.notes = text(form.notes);
    if (text(form.link) !== (original.link ?? null)) changes.link = text(form.link);
    if (form.rigid !== original.rigid) changes.rigid = form.rigid;
    if (form.allDay !== original.allDay) changes.allDay = form.allDay;
    if (!form.allDay && form.startTime !== (original.startTime ?? ""))
      changes.startTime = form.startTime;
    if (!form.allDay && form.endTime !== (original.endTime ?? "")) changes.endTime = form.endTime;
    if (form.date !== original.date) changes.date = form.date;
    if (!sameAlerts(form.alerts, initialAlerts)) changes.alerts = form.alerts;
    const ruleChanged =
      !!sourceSeries &&
      !!form.recurrence &&
      JSON.stringify(normalizeRule(form.recurrence)) !== JSON.stringify(sourceSeries.rule);
    if (ruleChanged) changes.rule = normalizeRule(form.recurrence!);

    // Repetir um compromisso avulso: vira uma série e o avulso sai de cena.
    if (!original.seriesId && !original.routineId && !original.goalId && form.recurrence) {
      const removal = await removeOccurrence(original, "this");
      const id = await createSeries({
        title: form.title.trim(),
        category: form.category,
        labelId: form.labelId ?? undefined,
        location: form.location.trim() || undefined,
        notes: form.notes.trim() || undefined,
        link: form.link.trim() || undefined,
        rigid: form.rigid,
        startDate: form.date,
        startTime: form.allDay ? undefined : form.startTime,
        endTime: form.allDay ? undefined : form.endTime,
        allDay: form.allDay,
        rule: normalizeRule(form.recurrence),
        alerts: form.alerts,
      });
      void feedback.run("Agora este compromisso se repete.", async () => ({
        undo: async () => {
          await archiveSeries(id);
          await removal.undo();
        },
      }));
      return;
    }

    if (Object.keys(changes).length === 0) return;

    let scope: "this" | "following" | "all" = "this";
    if (original.seriesId) {
      // Mexer na data vale só para uma ocorrência; mudar a regra, só para a série.
      if (changes.date && !ruleChanged) scope = "this";
      else {
        const answer = await feedback.askScope("alterar", { allowThis: !ruleChanged });
        if (!answer) throw new CancelledEdit();
        scope = answer;
      }
    }
    await feedback.run("Compromisso atualizado.", () => editOccurrence(original, scope, changes));
  }

  const body = (
    <div className="space-y-5">
      {/* Essencial: nome, quando */}
      <div>
        {fromSelection ? (
          <div className="flex items-center gap-2 rounded-xl border border-border bg-surface px-4 py-3 text-sm">
            <Target className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate">{title}</span>
          </div>
        ) : (
          <input
            autoFocus={!editing}
            value={form.title}
            onChange={(e) => set({ title: e.target.value })}
            placeholder='Ex.: "Dentista"'
            aria-label="Nome do compromisso"
            className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-base outline-none focus:border-primary"
          />
        )}
        {selection && (
          <p className="mt-2 flex items-center gap-1.5 text-[11px] text-primary">
            <Link2 className="h-3 w-3 shrink-0" /> Plano: {selection.goal.title}
            {selection.kind === "step" && " · essa etapa ainda não tem execução — vamos criar uma."}
          </p>
        )}
        <div className="mt-2 flex items-center gap-4">
          {!editing && (
            <button
              type="button"
              onClick={() => setShowPicker(true)}
              className="min-h-9 text-[11px] font-semibold text-success underline decoration-dotted underline-offset-4"
            >
              {selection
                ? "trocar de plano, etapa ou execução"
                : "ou selecionar um plano, etapa ou execução"}
            </button>
          )}
          {selection && !editing && (
            <button
              type="button"
              onClick={() => setSelection(null)}
              className="min-h-9 text-[11px] font-semibold text-muted-foreground underline decoration-dotted underline-offset-4"
            >
              desvincular
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <DateField label="Dia" value={form.date} onChange={(date) => set({ date })} />
        <label className="flex items-center gap-2 self-end rounded-xl border border-border bg-surface px-4 py-3 text-sm">
          <input
            type="checkbox"
            checked={form.allDay}
            onChange={(e) => set({ allDay: e.target.checked })}
            className="h-4 w-4 accent-primary"
          />
          Dia inteiro
        </label>
      </div>

      {!form.allDay && (
        <div>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1 block text-[11px] uppercase tracking-wider text-muted-foreground">
                Início
              </span>
              <input
                type="time"
                value={form.startTime}
                onChange={(e) => setStart(e.target.value)}
                className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-sm outline-none focus:border-primary"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] uppercase tracking-wider text-muted-foreground">
                Fim
              </span>
              <input
                type="time"
                value={form.endTime}
                onChange={(e) => {
                  setEndTouched(true);
                  set({ endTime: e.target.value });
                }}
                className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-sm outline-none focus:border-primary"
              />
            </label>
          </div>
          <div className="agenda-chips mt-2" role="group" aria-label="Duração">
            {DURATION_CHIPS.map((minutes) => (
              <button
                key={minutes}
                type="button"
                aria-pressed={timesOk && duration === minutes}
                className="agenda-chip"
                onClick={() => setDuration(minutes)}
              >
                {formatDuration(minutes)}
              </button>
            ))}
          </div>
          {form.startTime && form.endTime && !timesOk && (
            <p className="mt-1 text-[11px] text-danger">
              O fim precisa ser diferente do início. Fim antes do início vira o dia (23:00–01:00).
            </p>
          )}
          {timesOk &&
            form.startTime &&
            form.endTime &&
            timeToMinutes(form.endTime) <= timeToMinutes(form.startTime) &&
            form.endTime !== "00:00" && (
              <p className="mt-1 text-[11px] text-muted-foreground">
                Termina no dia seguinte, às {formatTime(form.endTime, profile.timeFormat)}.
              </p>
            )}
        </div>
      )}

      {conflicts.length > 0 && (
        <div role="alert" className="rounded-xl border border-warning/50 bg-warning/5 p-3 text-sm">
          <p className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
            <span>
              Esse horário conflita com{" "}
              {conflicts
                .slice(0, 2)
                .map((c) => `${c.title}${c.rigid ? " (rígido)" : " (flexível)"}`)
                .join(" e ")}
              {conflicts.length > 2 ? ` e mais ${conflicts.length - 2}` : ""}.
            </span>
          </p>
          {slots.length > 0 ? (
            <div className="mt-2">
              <p className="text-[11px] text-muted-foreground">Horários livres:</p>
              <div className="agenda-chips mt-1">
                {slots.map((slot) => (
                  <button
                    key={`${slot.date}${slot.start}`}
                    type="button"
                    className="agenda-chip"
                    onClick={() => applySlot(slot)}
                  >
                    {relativeDayLabel(slot.date, now.date).split(",")[0]}{" "}
                    {formatTime(slot.start, profile.timeFormat)}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <p className="mt-2 text-[11px] text-muted-foreground">
              Não encontrei um horário livre próximo no seu dia habitual.
            </p>
          )}
          <p className="mt-2 text-[11px] text-muted-foreground">
            Nada é movido sozinho. Você pode manter o conflito se for de propósito.
          </p>
        </div>
      )}

      <div>
        <span className="mb-1.5 block text-[11px] uppercase tracking-wider text-muted-foreground">
          Rótulo
        </span>
        <LabelPicker
          labels={labels.active}
          value={form.labelId}
          onChange={(labelId) => set({ labelId })}
          onManage={() => setShowLabels(true)}
        />
      </div>

      <button
        type="button"
        onClick={() => setAdvanced((v) => !v)}
        aria-expanded={advanced}
        className="flex min-h-11 w-full items-center justify-between rounded-xl border border-border px-4 text-sm font-semibold text-muted-foreground"
      >
        Mais opções
        {advanced ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>

      {advanced && (
        <div className="space-y-5">
          {canRepeat && (editing ? !source?.routineId && !source?.goalId : true) && (
            <Section title="Repetir">
              <RecurrenceEditor
                startDate={form.date}
                value={form.recurrence}
                onChange={(recurrence) => set({ recurrence })}
              />
            </Section>
          )}
          {editing && source?.routineId && (
            <p className="rounded-xl border border-border p-3 text-xs text-muted-foreground">
              Este compromisso faz parte de uma rotina. As mudanças valem só para esta ocorrência; a
              rotina se ajusta na área da própria rotina.
            </p>
          )}
          <Section title="Alertas">
            <AlertsEditor value={form.alerts} onChange={(alerts) => set({ alerts })} />
          </Section>
          <Section title="Onde (opcional)">
            <input
              value={form.location}
              onChange={(e) => set({ location: e.target.value })}
              placeholder="Ex.: Clínica Norte"
              className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-sm outline-none focus:border-primary"
            />
          </Section>
          <Section title="Nota (opcional)">
            <textarea
              value={form.notes}
              onChange={(e) => set({ notes: e.target.value })}
              rows={3}
              placeholder="Detalhes que ajudam a lembrar"
              className="w-full resize-none rounded-xl border border-border bg-surface px-4 py-3 text-sm outline-none focus:border-primary"
            />
          </Section>
          <Section title="Link (opcional)">
            <input
              value={form.link}
              onChange={(e) => set({ link: e.target.value })}
              inputMode="url"
              placeholder="https://"
              className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-sm outline-none focus:border-primary"
            />
          </Section>
          <Section title="Categoria">
            <select
              value={form.category}
              disabled={Boolean(selection)}
              onChange={(e) => set({ category: e.target.value })}
              className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-sm outline-none focus:border-primary disabled:opacity-60"
            >
              {Object.entries(categoryMeta).map(([id, meta]) => (
                <option key={id} value={id}>
                  {meta.emoji} {meta.label}
                </option>
              ))}
            </select>
          </Section>
          <label className="flex items-center gap-3 rounded-xl border border-border bg-surface p-4">
            <input
              type="checkbox"
              checked={form.rigid}
              onChange={(e) => set({ rigid: e.target.checked })}
              className="h-4 w-4 accent-primary"
            />
            <div>
              <p className="flex items-center gap-1.5 text-sm font-medium">
                <Lock className="h-3.5 w-3.5" /> Rígido
              </p>
              <p className="text-[11px] text-muted-foreground">
                Não pode ser renegociado sem confronto.
              </p>
            </div>
          </label>
        </div>
      )}

      {error && <InlineError message={error} />}
      <button
        type="button"
        disabled={!valid || saving}
        onClick={save}
        className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-40"
      >
        <Check className="h-4 w-4" />
        {saving
          ? "Salvando…"
          : editing
            ? conflicts.length > 0
              ? "Salvar mesmo assim"
              : "Salvar alterações"
            : form.recurrence && canRepeat
              ? conflicts.length > 0
                ? "Criar série mesmo assim"
                : "Criar série"
              : conflicts.length > 0
                ? "Salvar mesmo assim"
                : "Salvar na agenda"}
      </button>
      {!editing && selection?.kind === "execution" && (
        <p className="text-center text-[11px] text-muted-foreground">
          Prazo: {formatDateBR(selection.execution.dueDate)} — agendar aqui só marca dia e horário.
        </p>
      )}
    </div>
  );

  return (
    <>
      {variant === "sheet" ? (
        <Modal onClose={onClose} title={editing ? "Editar compromisso" : "Novo compromisso"}>
          {body}
        </Modal>
      ) : (
        body
      )}
      {showPicker && (
        <PlanItemPicker
          onClose={() => setShowPicker(false)}
          onSelect={(sel) => {
            setSelection(sel);
            setShowPicker(false);
            setForm((f) => ({ ...f, recurrence: sel.kind === "goal" ? f.recurrence : null }));
          }}
        />
      )}
      {showLabels && <LabelManager onClose={() => setShowLabels(false)} />}
    </>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <span className="mb-1.5 block text-[11px] uppercase tracking-wider text-muted-foreground">
        {title}
      </span>
      {children}
    </div>
  );
}
