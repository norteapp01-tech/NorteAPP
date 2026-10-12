import type { CSSProperties } from "react";
import { AlertTriangle, Check, Link2, Lock, MapPin, Repeat, X } from "lucide-react";
import { formatTime } from "@/lib/format-utils";
import type { AgendaOccurrence } from "@/lib/agenda-occurrences";
import type { AgendaLabel } from "@/lib/agenda-labels-store";
import type { TimeFormat } from "@/lib/profile-store";
import "./agenda-ui.css";

export function timeRangeLabel(occ: AgendaOccurrence, timeFormat: TimeFormat): string {
  if (occ.allDay || !occ.startTime) return "Dia inteiro";
  const start = formatTime(occ.startTime, timeFormat);
  return occ.endTime ? `${start}–${formatTime(occ.endTime, timeFormat)}` : start;
}

const STATUS_TEXT: Record<string, string> = {
  concluida: "Concluído",
  perdida: "Perdido",
  cancelada: "Cancelado",
};

/** Cartão de leitura rápida: usado em Próximos, Busca, Mês e Para encaixar. */
export function OccurrenceCard({
  occ,
  label,
  conflict,
  timeFormat,
  showDate,
  dateText,
  onOpen,
}: {
  occ: AgendaOccurrence;
  label?: AgendaLabel;
  conflict?: boolean;
  timeFormat: TimeFormat;
  showDate?: boolean;
  dateText?: string;
  onOpen: (occ: AgendaOccurrence) => void;
}) {
  const style = { ["--lbl" as string]: label?.color } as CSSProperties;
  return (
    <button
      type="button"
      data-status={occ.status}
      className="agenda-card interactive-press"
      style={style}
      onClick={() => onOpen(occ)}
      aria-label={`${occ.title}, ${dateText ?? ""} ${timeRangeLabel(occ, timeFormat)}${STATUS_TEXT[occ.status] ? `, ${STATUS_TEXT[occ.status].toLowerCase()}` : ""}${conflict ? ", em conflito" : ""}`}
    >
      <div className="w-[86px] shrink-0">
        {showDate && dateText && (
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            {dateText}
          </p>
        )}
        <p className="whitespace-nowrap font-mono text-[11.5px] font-bold leading-tight">
          {timeRangeLabel(occ, timeFormat)}
        </p>
      </div>
      <div className="min-w-0 flex-1">
        <p
          className={`truncate text-sm font-semibold ${occ.status === "cancelada" ? "line-through" : ""}`}
        >
          {occ.title}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
          {label && (
            <span className="inline-flex items-center gap-1">
              <i className="agenda-dot" style={{ ["--dot" as string]: label.color }} />
              {label.name}
            </span>
          )}
          {occ.location && (
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-3 w-3" /> {occ.location}
            </span>
          )}
          {occ.goalId && (
            <span className="inline-flex items-center gap-1 text-primary">
              <Link2 className="h-3 w-3" /> plano
            </span>
          )}
          {occ.rigid && (
            <span className="inline-flex items-center gap-1">
              <Lock className="h-3 w-3" /> rígido
            </span>
          )}
          {occ.recurring && (
            <span className="inline-flex items-center gap-1">
              <Repeat className="h-3 w-3" /> repete
            </span>
          )}
          {conflict && (
            <span className="inline-flex items-center gap-1 text-warning">
              <AlertTriangle className="h-3 w-3" /> conflito
            </span>
          )}
          {occ.status === "concluida" && (
            <span className="inline-flex items-center gap-1 text-success">
              <Check className="h-3 w-3" /> concluído
            </span>
          )}
          {occ.status === "perdida" && (
            <span className="inline-flex items-center gap-1 text-danger">
              <X className="h-3 w-3" /> perdido
            </span>
          )}
        </div>
      </div>
    </button>
  );
}
