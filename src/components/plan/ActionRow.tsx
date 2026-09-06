import { useState } from "react";
import {
  CalendarClock,
  Check,
  MapPin,
  MoreVertical,
  Pencil,
  RotateCcw,
  Trash2,
  Link2,
} from "lucide-react";
import { DateField } from "@/components/ui/date-wheel-picker";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ScheduleFields,
  scheduleTimesValid,
  type ScheduleValue,
} from "@/components/plan/ScheduleFields";
import { useProfile } from "@/lib/profile-store";
import { formatTime } from "@/lib/format-utils";
import { nowDate } from "@/lib/test-clock";
import {
  addDays,
  cancelExecution,
  effectiveStatus,
  formatDateShortBR,
  isScheduled,
  patchExecution,
  redistributeExecution,
  removeExecution,
  rescheduleExecution,
  scheduleExecution,
  toISODate,
  toggleExecutionDone,
  type Execution,
} from "@/lib/goals-store";

function statusMeta(status: ReturnType<typeof effectiveStatus>) {
  if (status === "concluida") return { label: "concluída", tone: "bg-success/15 text-success" };
  if (status === "perdida") return { label: "atrasada", tone: "bg-danger/15 text-danger" };
  if (status === "cancelada")
    return { label: "descartada", tone: "bg-surface-2 text-muted-foreground" };
  return { label: "pendente", tone: "bg-primary/15 text-primary" };
}

/**
 * Ação dentro de uma etapa (ou sem etapa) — checkbox circular pra
 * concluir/reabrir, prazo curto, situação da agenda, botão de calendário só
 * ícone (agendar/reagendar), e menu de três pontos com
 * redistribuir/editar/[separador]/descartar/excluir. Mesma lógica de
 * `ExecutionItem` de antes, só reduzida visualmente e com "Ação" no lugar de
 * "Execução" em todo texto visível.
 */
export function ActionRow({
  e,
  allExecutions,
  highlighted,
  isNext,
  onUnlink,
}: {
  e: Execution;
  allExecutions: Execution[];
  highlighted?: boolean;
  isNext?: boolean;
  onUnlink?: () => void;
}) {
  const status = effectiveStatus(e);
  const meta = statusMeta(status);
  const scheduled = isScheduled(e);
  const profile = useProfile();
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

  const actionable = status === "planejada" || status === "perdida";

  return (
    <div
      className={`rounded-xl border p-3 transition-colors ${highlighted ? "border-primary bg-primary/5" : "border-border bg-surface-2"}`}
    >
      <div className="flex items-start gap-2.5">
        <button
          disabled={busy}
          onClick={() => run(() => toggleExecutionDone(e.id))}
          aria-label={status === "concluida" ? "Reabrir ação" : "Concluir ação"}
          className={`relative mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border disabled:opacity-50 ${status === "concluida" ? "border-primary bg-primary text-primary-foreground" : "border-border bg-surface"}`}
        >
          {status === "concluida" && <Check className="h-3 w-3" strokeWidth={3} />}
          {isNext && status !== "concluida" && (
            <span
              className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-primary"
              aria-hidden
            />
          )}
        </button>
        <div className="min-w-0 flex-1">
          {!editing ? (
            <p
              className={`text-[13px] font-medium ${status === "concluida" ? "text-muted-foreground line-through" : ""}`}
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
              {status === "concluida" ? (
                <p className="mt-0.5 text-[11px] text-muted-foreground">Concluída</p>
              ) : (
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  Até {formatDateShortBR(e.dueDate)} ·{" "}
                  {scheduled
                    ? `${formatDateShortBR(e.agendaDate!)} ${formatTime(e.startTime, profile.timeFormat)}`
                    : "Sem agenda"}
                </p>
              )}
              {e.location && (
                <p className="mt-0.5 flex items-center gap-1 text-[10px] text-muted-foreground">
                  <MapPin className="h-2.5 w-2.5" />
                  {e.location}
                </p>
              )}
              {status !== "concluida" && status !== "planejada" && (
                <span
                  className={`mt-1 inline-block rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${meta.tone}`}
                >
                  {meta.label}
                </span>
              )}
            </>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {actionable && !editing && (
            <button
              onClick={() => setRescheduling((v) => !v)}
              aria-label={scheduled ? "Reagendar ação" : "Agendar ação"}
              className="flex h-8 w-8 items-center justify-center rounded-full text-primary hover:bg-primary/10"
            >
              <CalendarClock className="h-4 w-4" />
            </button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                aria-label="Mais ações"
                className="flex h-8 w-8 items-center justify-center text-muted-foreground hover:text-foreground"
              >
                <MoreVertical className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {actionable && (
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
              {actionable && (
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
              ? "Descartar esta ação?"
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
