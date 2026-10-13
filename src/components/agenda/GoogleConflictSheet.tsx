import { useState } from "react";
import { AlertTriangle, CalendarSync, Loader2 } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { InlineError } from "@/components/ui/inline-error";
import {
  resolveGoogleConflict,
  useGoogleCalendar,
  type GoogleConflict,
  type Snapshot,
} from "@/lib/google-calendar-store";
import "./agenda-ui.css";

/** "2026-10-14 15:00" → "14/10 15:00". */
function shortWhen(value: string): string {
  const [date, time] = value.split(" ");
  const [, month, day] = date.split("-");
  return `${day}/${month}${time ? ` ${time}` : ""}`;
}

function SnapshotView({
  title,
  snapshot,
}: {
  title: string;
  snapshot: Snapshot | { deleted: true } | undefined;
}) {
  const deleted = !snapshot || ("deleted" in snapshot && snapshot.deleted);
  const s = deleted ? null : (snapshot as Snapshot);
  return (
    <div className="min-w-0 rounded-xl border border-border bg-surface p-3 text-xs">
      <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
        {title}
      </p>
      {!s ? (
        <p className="font-semibold text-danger">Foi apagado</p>
      ) : (
        <>
          <p className="truncate text-sm font-semibold">{s.title}</p>
          <p className="mt-1 text-muted-foreground">
            {s.allDay
              ? `${shortWhen(s.start)} · dia inteiro`
              : `${shortWhen(s.start)}–${s.end.split(" ").pop()}`}
          </p>
          {s.location && <p className="truncate text-muted-foreground">{s.location}</p>}
          {s.notes && <p className="line-clamp-2 text-muted-foreground">{s.notes}</p>}
        </>
      )}
    </div>
  );
}

/** Eventos que mudaram nos dois lados: a pessoa decide qual versão vale. */
export function GoogleConflictSheet({ onClose }: { onClose: () => void }) {
  const { conflicts } = useGoogleCalendar();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const resolve = async (item: GoogleConflict, resolution: "google" | "norte") => {
    setBusy(`${item.id}:${resolution}`);
    setError(null);
    try {
      await resolveGoogleConflict(item.id, resolution);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível resolver.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <Modal onClose={onClose} title="Conflitos com o Google">
      {conflicts.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          Nenhum conflito. Tudo em dia.
        </p>
      ) : (
        <>
          <p className="flex items-start gap-2 text-xs text-muted-foreground">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
            Estes eventos mudaram no Norte e no Google. Nada foi sobrescrito: escolha qual versão
            vale para cada um.
          </p>
          <ul className="mt-4 space-y-4">
            {conflicts.map((item) => (
              <li key={item.id} className="space-y-2">
                <p className="flex items-center gap-1.5 text-sm font-semibold">
                  <CalendarSync className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="truncate">{item.title}</span>
                  {item.calendarName && (
                    <span className="shrink-0 text-[11px] font-normal text-muted-foreground">
                      · {item.calendarName}
                    </span>
                  )}
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <SnapshotView title="No Norte" snapshot={item.local} />
                  <SnapshotView
                    title="No Google"
                    snapshot={item.remoteDeleted ? { deleted: true } : item.remote}
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {(
                    [
                      [
                        "norte",
                        item.remoteDeleted ? "Manter (recriar no Google)" : "Manter o do Norte",
                      ],
                      ["google", item.remoteDeleted ? "Apagar no Norte" : "Usar o do Google"],
                    ] as const
                  ).map(([resolution, label]) => (
                    <button
                      key={resolution}
                      type="button"
                      disabled={busy !== null}
                      onClick={() => void resolve(item, resolution)}
                      className={`interactive-press flex min-h-11 items-center justify-center gap-1 rounded-xl border px-2 text-xs font-semibold disabled:opacity-50 ${resolution === "norte" ? "border-primary/50 text-primary" : "border-border"}`}
                    >
                      {busy === `${item.id}:${resolution}` && (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      )}
                      {label}
                    </button>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
      {error && <InlineError message={error} className="mt-3" />}
    </Modal>
  );
}
