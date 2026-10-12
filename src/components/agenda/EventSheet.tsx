import { useMemo, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  Bell,
  CalendarClock,
  Check,
  Copy,
  ExternalLink,
  History,
  Link2,
  Lock,
  MapPin,
  Pencil,
  Repeat,
  RotateCcw,
  Target,
  Trash2,
  X,
} from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { DateField } from "@/components/ui/date-wheel-picker";
import { categoryMeta } from "@/lib/mock-data";
import { addDaysISO, durationMinutes, formatDuration } from "@/lib/agenda-intervals";
import { minutesToTime, timeToMinutes } from "@/lib/agenda-time";
import { alertLabel } from "@/lib/agenda-settings";
import { describeRule } from "@/lib/agenda-recurrence";
import { formatLongDate } from "@/lib/agenda-navigation";
import { fetchExecutionChanges, summarizeHistory } from "@/lib/agenda-history";
import {
  cancelOccurrence,
  completeOccurrence,
  moveOccurrence,
  removeFromAgenda,
} from "@/lib/agenda-series-store";
import { setExecutionStatus } from "@/lib/goals-store";
import { formatTime } from "@/lib/format-utils";
import type { AgendaOccurrence } from "@/lib/agenda-occurrences";
import { useAgendaFeedback } from "./agenda-feedback";
import { useAgendaData } from "./use-agenda-data";
import { LabelGlyph } from "./LabelIcon";
import "./agenda-ui.css";

const STATUS_TEXT: Record<string, string> = {
  planejada: "Planejado",
  concluida: "Concluído",
  perdida: "Perdido",
  cancelada: "Cancelado",
  reagendada: "Reagendado",
};

const clock = (minutes: number) => minutesToTime(((minutes % 1440) + 1440) % 1440);

export function EventSheet({
  occ,
  onClose,
  onEdit,
  onDuplicate,
}: {
  occ: AgendaOccurrence;
  onClose: () => void;
  onEdit: (occ: AgendaOccurrence) => void;
  onDuplicate: (occ: AgendaOccurrence) => void;
}) {
  const feedback = useAgendaFeedback();
  const {
    labels,
    goals,
    series,
    alerts,
    profile,
    clock: now,
  } = useAgendaData({
    from: occ.date,
    to: occ.date,
  });
  const label = occ.labelId ? labels.byId.get(occ.labelId) : undefined;
  const goal = occ.goalId ? goals.find((g) => g.id === occ.goalId) : undefined;
  const rule = occ.seriesId ? series.find((s) => s.id === occ.seriesId)?.rule : undefined;
  const alertList = occ.executionId ? alerts.forExecution(occ.executionId) : (occ.alerts ?? []);
  const category = categoryMeta[occ.category] ?? categoryMeta.generico;
  const timed = !occ.allDay && !!occ.startTime;
  const minutes = timed ? durationMinutes(occ.startTime!, occ.endTime) : 0;
  const endsNextDay =
    timed &&
    !!occ.endTime &&
    occ.endTime !== "00:00" &&
    timeToMinutes(occ.endTime) <= timeToMinutes(occ.startTime!);

  const history = useQuery({
    queryKey: ["agenda-history", occ.executionId],
    queryFn: () => fetchExecutionChanges(occ.executionId!),
    enabled: !!occ.executionId,
  });
  const summary = useMemo(() => summarizeHistory(history.data ?? []), [history.data]);

  const [panel, setPanel] = useState<"reschedule" | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState(occ.date);
  const [rescheduleStart, setRescheduleStart] = useState(occ.startTime ?? "09:00");
  const [rescheduleEnd, setRescheduleEnd] = useState(occ.endTime ?? "10:00");
  const [busy, setBusy] = useState(false);

  const act = async (message: string, fn: () => Promise<{ undo: () => Promise<void> }>) => {
    if (busy) return;
    setBusy(true);
    const ok = await feedback.run(message, fn);
    setBusy(false);
    if (ok) onClose();
  };

  const askScopeIfRecurring = async (verb: string) => {
    if (!occ.seriesId) return "this" as const;
    return feedback.askScope(verb);
  };

  const done = occ.status === "concluida";
  const cancelled = occ.status === "cancelada";
  const open = occ.status === "planejada" || occ.status === "perdida";

  const shift = (deltaMinutes: number) => {
    if (!timed) return;
    const start = timeToMinutes(occ.startTime!) + deltaMinutes;
    const dayShift = Math.floor(start / 1440);
    void act("Horário ajustado.", () =>
      moveOccurrence(occ, addDaysISO(occ.date, dayShift), clock(start), clock(start + minutes)),
    );
  };

  const setDuration = (nextMinutes: number) => {
    if (!timed) return;
    void act("Duração ajustada.", () =>
      moveOccurrence(
        occ,
        occ.date,
        occ.startTime!,
        clock(timeToMinutes(occ.startTime!) + nextMinutes),
      ),
    );
  };

  return (
    <Modal onClose={onClose} title={occ.title}>
      {/* Resumo */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {label && (
          <span
            className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-semibold"
            style={{ borderColor: `${label.color}66`, color: label.color }}
          >
            <i className="agenda-dot" style={{ ["--dot" as string]: label.color }} />
            <LabelGlyph icon={label.icon} className="h-3 w-3" />
            {label.name}
          </span>
        )}
        <span
          className={`rounded-full px-2.5 py-1 font-semibold ${
            done
              ? "bg-success/15 text-success"
              : occ.status === "perdida"
                ? "bg-danger/15 text-danger"
                : "bg-surface-2 text-muted-foreground"
          }`}
        >
          {STATUS_TEXT[occ.status] ?? occ.status}
        </span>
        {occ.rigid && (
          <span className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2.5 py-1 text-muted-foreground">
            <Lock className="h-3 w-3" /> Rígido
          </span>
        )}
      </div>

      <div className="mt-4 space-y-3 text-sm">
        <Row icon={<CalendarClock className="h-4 w-4" />}>
          <p className="font-semibold">{formatLongDate(occ.date)}</p>
          <p className="text-muted-foreground">
            {timed
              ? `${formatTime(occ.startTime!, profile.timeFormat)}${occ.endTime ? `–${formatTime(occ.endTime, profile.timeFormat)}` : ""} · ${formatDuration(minutes)}${endsNextDay ? " · termina no dia seguinte" : ""}`
              : "Dia inteiro"}
          </p>
        </Row>
        {(rule || occ.routineId) && (
          <Row icon={<Repeat className="h-4 w-4" />}>
            <p>
              {rule
                ? describeRule(rule, occ.occurrenceDate ?? occ.date)
                : "Parte de uma rotina semanal"}
            </p>
          </Row>
        )}
        {occ.location && (
          <Row icon={<MapPin className="h-4 w-4" />}>
            <p>{occ.location}</p>
          </Row>
        )}
        {occ.link && (
          <Row icon={<ExternalLink className="h-4 w-4" />}>
            <a
              href={/^https?:\/\//i.test(occ.link) ? occ.link : `https://${occ.link}`}
              target="_blank"
              rel="noopener noreferrer"
              className="break-all text-primary underline underline-offset-2"
            >
              {occ.link}
            </a>
          </Row>
        )}
        {occ.notes && (
          <p className="whitespace-pre-wrap rounded-xl bg-surface-2 p-3 text-[13px] text-muted-foreground">
            {occ.notes}
          </p>
        )}
        <Row icon={<Bell className="h-4 w-4" />}>
          <p className={alertList.length ? "" : "text-muted-foreground"}>
            {alertList.length ? alertList.map(alertLabel).join(" · ") : "Sem alerta"}
          </p>
        </Row>
        <Row icon={<span className="text-base leading-none">{category.emoji}</span>}>
          <p>{category.label}</p>
        </Row>
        {goal && (
          <Row icon={<Target className="h-4 w-4" />}>
            <Link
              to="/objetivo/$id"
              params={{ id: goal.id }}
              onClick={onClose}
              className="inline-flex items-center gap-1 font-semibold text-primary"
            >
              <Link2 className="h-3.5 w-3.5" /> {goal.title}
            </Link>
          </Row>
        )}
        {occ.routineId && (
          <Row icon={<Repeat className="h-4 w-4" />}>
            <Link
              to="/sub-agenda/$categoria"
              params={{ categoria: occ.category }}
              onClick={onClose}
              className="font-semibold text-primary"
            >
              Abrir a rotina de {category.label}
            </Link>
          </Row>
        )}
        <p className="text-[11px] text-muted-foreground">
          Origem: {occ.source === "external" ? "calendário externo" : "criado no Norte"}
        </p>
        {(summary.rescheduleCount > 0 || summary.completedAt || summary.cancelledAt) && (
          <Row icon={<History className="h-4 w-4" />}>
            <p className="text-[12px] text-muted-foreground">
              {summary.rescheduleCount > 0 &&
                `Reagendado ${summary.rescheduleCount} ${summary.rescheduleCount === 1 ? "vez" : "vezes"}`}
              {summary.original &&
                summary.rescheduleCount > 0 &&
                ` · horário original ${summary.original.date.split("-").reverse().slice(0, 2).join("/")} às ${formatTime(summary.original.start, profile.timeFormat)}`}
              {summary.completedAt &&
                `${summary.rescheduleCount ? " · " : ""}concluído em ${new Date(summary.completedAt).toLocaleDateString("pt-BR")}`}
              {summary.cancelledAt &&
                `${summary.rescheduleCount ? " · " : ""}cancelado em ${new Date(summary.cancelledAt).toLocaleDateString("pt-BR")}`}
            </p>
          </Row>
        )}
      </div>

      {/* Ações frequentes, à vista */}
      <div className="mt-5 grid grid-cols-2 gap-2">
        {open && (
          <ActionButton
            primary
            icon={<Check className="h-4 w-4" />}
            label="Concluir"
            onClick={() => void act("Marcado como concluído.", () => completeOccurrence(occ))}
          />
        )}
        {(done || cancelled) && (
          <ActionButton
            primary
            icon={<RotateCcw className="h-4 w-4" />}
            label="Reabrir"
            onClick={() => {
              if (!occ.executionId) return;
              const id = occ.executionId;
              const previous = occ.status;
              void act("Compromisso reaberto.", async () => {
                await setExecutionStatus(id, "planejada", "reaberto");
                return {
                  undo: async () => void (await setExecutionStatus(id, previous, "desfeito")),
                };
              });
            }}
          />
        )}
        {!cancelled && timed && (
          <ActionButton
            icon={<CalendarClock className="h-4 w-4" />}
            label="Reagendar"
            active={panel === "reschedule"}
            onClick={() => setPanel(panel === "reschedule" ? null : "reschedule")}
          />
        )}
        <ActionButton
          icon={<Pencil className="h-4 w-4" />}
          label="Editar"
          onClick={() => {
            onClose();
            onEdit(occ);
          }}
        />
        <ActionButton
          icon={<Copy className="h-4 w-4" />}
          label="Duplicar"
          onClick={() => {
            onClose();
            onDuplicate(occ);
          }}
        />
      </div>

      {panel === "reschedule" && timed && (
        <div className="card-surface-quiet mt-3 space-y-3 p-3">
          <div className="agenda-chips" role="group" aria-label="Ajustes rápidos">
            {[
              ["−15 min", -15],
              ["+15 min", 15],
              ["+1 h", 60],
              ["Amanhã", 1440],
              ["Próxima semana", 10080],
            ].map(([text, delta]) => (
              <button
                key={text}
                type="button"
                className="agenda-chip"
                disabled={busy}
                onClick={() => {
                  if (delta === 1440 || delta === 10080) {
                    void act("Compromisso movido.", () =>
                      moveOccurrence(
                        occ,
                        addDaysISO(occ.date, (delta as number) / 1440),
                        occ.startTime!,
                        occ.endTime,
                      ),
                    );
                  } else shift(delta as number);
                }}
              >
                {text}
              </button>
            ))}
          </div>
          <div>
            <p className="mb-1 text-[11px] uppercase tracking-wider text-muted-foreground">
              Duração
            </p>
            <div className="agenda-chips" role="group" aria-label="Duração">
              {[15, 30, 45, 60, 90, 120].map((m) => (
                <button
                  key={m}
                  type="button"
                  aria-pressed={m === minutes}
                  className="agenda-chip"
                  disabled={busy}
                  onClick={() => setDuration(m)}
                >
                  {formatDuration(m)}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <DateField label="Dia" value={rescheduleDate} onChange={setRescheduleDate} />
            <label className="block">
              <span className="mb-1 block text-[10px] uppercase tracking-wider text-muted-foreground">
                Início
              </span>
              <input
                type="time"
                value={rescheduleStart}
                onChange={(e) => setRescheduleStart(e.target.value)}
                className="w-full rounded-xl border border-border bg-surface px-2 py-3 text-sm outline-none focus:border-primary"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[10px] uppercase tracking-wider text-muted-foreground">
                Fim
              </span>
              <input
                type="time"
                value={rescheduleEnd}
                onChange={(e) => setRescheduleEnd(e.target.value)}
                className="w-full rounded-xl border border-border bg-surface px-2 py-3 text-sm outline-none focus:border-primary"
              />
            </label>
          </div>
          <button
            type="button"
            disabled={
              busy || !rescheduleStart || !rescheduleEnd || rescheduleStart === rescheduleEnd
            }
            onClick={() =>
              void act("Compromisso reagendado.", () =>
                moveOccurrence(occ, rescheduleDate, rescheduleStart, rescheduleEnd),
              )
            }
            className="interactive-press min-h-11 w-full rounded-xl bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-40"
          >
            Reagendar
          </button>
          {occ.seriesId && (
            <p className="text-[11px] text-muted-foreground">
              Vale só para esta ocorrência. Para mudar a série, use “Editar”.
            </p>
          )}
        </div>
      )}

      {/* Cancelar mantém o registro; excluir apaga */}
      {!cancelled && (
        <div className="mt-4 grid grid-cols-2 gap-2 border-t border-border pt-4">
          <ActionButton
            icon={<X className="h-4 w-4" />}
            label="Cancelar"
            onClick={async () => {
              const scope = await askScopeIfRecurring("cancelar");
              if (!scope) return;
              void act("Compromisso cancelado.", () => cancelOccurrence(occ, scope));
            }}
          />
          {!occ.routineId && (
            <ActionButton
              danger
              icon={<Trash2 className="h-4 w-4" />}
              label={occ.goalId && !occ.seriesId ? "Tirar da Agenda" : "Excluir"}
              onClick={async () => {
                const scope = await askScopeIfRecurring("excluir");
                if (!scope) return;
                void act(
                  occ.goalId && !occ.seriesId ? "Horário removido." : "Compromisso excluído.",
                  () => removeFromAgenda(occ, scope),
                );
              }}
            />
          )}
        </div>
      )}
      {occ.goalId && !occ.seriesId && (
        <p className="mt-2 flex items-start gap-1.5 text-[11px] text-muted-foreground">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" /> Tirar da Agenda mantém a ação no
          plano — ela pode ser agendada de novo.
        </p>
      )}
      {now.date > occ.date && occ.status === "perdida" && (
        <p className="mt-2 text-[11px] text-muted-foreground">
          Este compromisso já passou sem ser concluído. Reagende ou marque como concluído.
        </p>
      )}
    </Modal>
  );
}

function Row({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center text-muted-foreground">
        {icon}
      </span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

function ActionButton({
  icon,
  label,
  onClick,
  primary,
  danger,
  active,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  primary?: boolean;
  danger?: boolean;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`interactive-press flex min-h-12 items-center justify-center gap-2 rounded-xl border text-sm font-semibold ${
        primary
          ? "border-transparent bg-primary text-primary-foreground"
          : danger
            ? "border-danger/40 text-danger"
            : active
              ? "border-primary text-primary"
              : "border-border text-foreground"
      }`}
    >
      {icon} {label}
    </button>
  );
}
