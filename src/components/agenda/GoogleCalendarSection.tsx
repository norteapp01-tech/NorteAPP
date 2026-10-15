import { useState } from "react";
import {
  AlertTriangle,
  CalendarSync,
  Check,
  Loader2,
  Lock,
  Plug,
  RefreshCw,
  Send,
  Unplug,
} from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { InlineError } from "@/components/ui/inline-error";
import {
  disconnectGoogle,
  googleUiState,
  selectGoogleCalendars,
  startGoogleConnect,
  syncGoogleNow,
  useGoogleCalendar,
  type GoogleCalendarRow,
} from "@/lib/google-calendar-store";
import { useAgendaFeedback } from "./agenda-feedback";
import { GoogleConflictSheet } from "./GoogleConflictSheet";
import "./agenda-ui.css";

function relativeTime(iso: string | undefined, now = Date.now()): string {
  if (!iso) return "Nunca";
  const minutes = Math.round((now - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return "Agora";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h`;
  return `${Math.round(hours / 24)} d`;
}

const ROLE_TEXT: Record<GoogleCalendarRow["role"], string> = {
  owner: "Edição",
  writer: "Edição",
  reader: "Somente leitura",
  freeBusyReader: "Só disponibilidade",
};

const STATE_BADGE = {
  disconnected: { text: "Desconectado", tone: "text-muted-foreground bg-surface-2" },
  connecting: { text: "Conectando…", tone: "text-primary bg-primary/10" },
  connected: { text: "Conectado", tone: "text-success bg-success/10" },
  syncing: { text: "Sincronizando…", tone: "text-primary bg-primary/10" },
  needs_reauth: { text: "Reconexão necessária", tone: "text-warning bg-warning/10" },
  error: { text: "Erro", tone: "text-danger bg-danger/10" },
} as const;

/** Conectar o Google Agenda, escolher agendas e acompanhar a sincronização. */
export function GoogleCalendarSection({
  connectingExternally = false,
}: {
  connectingExternally?: boolean;
}) {
  const google = useGoogleCalendar();
  const feedback = useAgendaFeedback();
  const [connecting, setConnecting] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [showConflicts, setShowConflicts] = useState(false);

  const ui = googleUiState(google, connecting || connectingExternally);
  const badge = STATE_BADGE[ui];
  const conn = google.connection;
  const writableSelected = google.calendars.filter(
    (c) => c.selected && (c.role === "owner" || c.role === "writer"),
  );

  const run = async (key: string, fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(key);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível concluir.");
    } finally {
      setBusy(null);
    }
  };

  /** Redireciona para o Google. Reconectar usa o mesmo caminho. */
  const connect = () =>
    run("connect", async () => {
      setConnecting(true);
      try {
        window.location.assign(await startGoogleConnect());
      } catch (e) {
        setConnecting(false);
        throw e;
      }
    });

  return (
    <section aria-label="Google Agenda" className="space-y-3 border-b border-border pb-6">
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <CalendarSync className="h-4 w-4 text-primary" /> Google Agenda
        </h3>
        <span
          className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${badge.tone}`}
          aria-live="polite"
        >
          {ui === "syncing" || ui === "connecting" ? (
            <Loader2 className="mr-1 inline h-3 w-3 animate-spin" />
          ) : null}
          {badge.text}
        </span>
      </div>

      {(ui === "disconnected" || ui === "connecting") && (
        <div className="pt-1">
          <button
            type="button"
            onClick={connect}
            disabled={ui === "connecting" || busy === "connect"}
            className="interactive-press flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-60"
          >
            {ui === "connecting" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plug className="h-4 w-4" />
            )}
            {ui === "connecting" ? "Conectando…" : "Conectar Google Agenda"}
          </button>
        </div>
      )}

      {ui === "needs_reauth" && (
        <div role="alert" className="rounded-xl border border-warning/40 bg-warning/5 p-3 text-xs">
          <p className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
            <span>
              {conn?.lastError ?? "O acesso ao Google expirou ou foi revogado."} Seus compromissos
              continuam no Norte; reconecte para voltar a sincronizar.
            </span>
          </p>
          <button
            type="button"
            onClick={connect}
            disabled={busy === "connect"}
            className="interactive-press mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-60"
          >
            <Plug className="h-4 w-4" /> Reconectar
          </button>
        </div>
      )}

      {conn && ui !== "needs_reauth" && ui !== "disconnected" && ui !== "connecting" && (
        <>
          <div className="card-surface-quiet flex items-center gap-3 px-3 py-2.5 text-xs">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
              <Check className="h-4 w-4" />
            </span>
            <p className="min-w-0 flex-1 truncate font-semibold text-foreground">{conn.email}</p>
            <time className="shrink-0 text-[11px] text-muted-foreground">
              {relativeTime(conn.lastSyncAt)}
            </time>
          </div>

          {ui === "error" && (
            <InlineError
              message={conn.lastError ?? "A última sincronização falhou."}
              onRetry={() =>
                void run("sync", async () => {
                  const result = await syncGoogleNow("manual");
                  if (result.error) throw new Error(result.error);
                  feedback.notify("Google Agenda sincronizado.");
                })
              }
            />
          )}

          {google.conflicts.length > 0 && (
            <button
              type="button"
              onClick={() => setShowConflicts(true)}
              className="flex w-full items-center justify-between gap-2 rounded-xl border border-danger/50 bg-danger/5 p-3 text-left text-sm"
            >
              <span className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-danger" />
                {google.conflicts.length}{" "}
                {google.conflicts.length === 1 ? "evento mudou" : "eventos mudaram"} nos dois
                lugares
              </span>
              <span className="text-xs font-semibold text-primary">Resolver</span>
            </button>
          )}

          {conn.pendingSyncErrors > 0 && (
            <div
              role="alert"
              className="rounded-xl border border-warning/40 bg-warning/5 p-3 text-xs"
            >
              <p className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                <span>
                  <strong className="block text-foreground">
                    {conn.pendingSyncErrors}{" "}
                    {conn.pendingSyncErrors === 1
                      ? "alteração ainda não foi enviada"
                      : "alterações ainda não foram enviadas"}
                  </strong>
                  {conn.lastPushError ?? "O Norte tentará novamente automaticamente."}
                </span>
              </p>
              <button
                type="button"
                disabled={busy !== null || ui === "syncing"}
                onClick={() =>
                  void run("retry-pending", async () => {
                    const result = await syncGoogleNow("manual");
                    if (result.error) throw new Error(result.error);
                    if ((result.stats.erros_envio ?? 0) > 0)
                      throw new Error(
                        "Algumas alterações continuam pendentes. Tentaremos novamente.",
                      );
                    feedback.notify("Alterações pendentes sincronizadas.");
                  })
                }
                className="interactive-press mt-3 min-h-10 w-full rounded-xl border border-warning/40 font-semibold text-foreground disabled:opacity-50"
              >
                Tentar novamente agora
              </button>
            </div>
          )}

          <div>
            <p className="mb-2 text-[11px] uppercase tracking-wider text-muted-foreground">
              Agendas
            </p>
            <ul className="space-y-2">
              {google.calendars.map((cal) => {
                const writable = cal.role === "owner" || cal.role === "writer";
                return (
                  <li key={cal.id} className="card-surface-quiet p-3">
                    <div className="flex items-center gap-3">
                      <label className="flex min-w-0 flex-1 items-center gap-3">
                        <input
                          type="checkbox"
                          checked={cal.selected}
                          disabled={busy !== null}
                          onChange={(e) =>
                            void run(`cal-${cal.id}`, () =>
                              selectGoogleCalendars([{ id: cal.id, selected: e.target.checked }]),
                            )
                          }
                          aria-label={`Sincronizar ${cal.summary}`}
                          className="h-5 w-5 shrink-0 accent-primary"
                        />
                        <i
                          className="agenda-dot"
                          style={{ ["--dot" as string]: cal.color ?? "var(--muted-foreground)" }}
                        />
                        <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                          {cal.summary}
                        </span>
                      </label>
                      <span
                        className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${writable ? "bg-surface-2 text-muted-foreground" : "bg-warning/10 text-warning"}`}
                      >
                        {!writable && <Lock className="h-2.5 w-2.5" />}
                        {ROLE_TEXT[cal.role]}
                      </span>
                      {cal.selected && writable && (
                        <button
                          type="button"
                          aria-pressed={cal.pushNewEvents}
                          aria-label={`${cal.summary} como destino dos eventos criados no Norte`}
                          title="Destino dos novos eventos do Norte"
                          disabled={busy !== null}
                          onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            void run(`push-${cal.id}`, () =>
                              selectGoogleCalendars([{ id: cal.id, pushNewEvents: true }]),
                            );
                          }}
                          className={`interactive-press inline-flex h-7 shrink-0 items-center gap-1 rounded-full px-2 text-[10px] font-semibold ${
                            cal.pushNewEvents
                              ? "bg-primary/15 text-primary"
                              : "border border-border text-muted-foreground"
                          }`}
                        >
                          <Send className="h-3 w-3" />
                          {cal.pushNewEvents ? "Destino" : "Usar"}
                        </button>
                      )}
                    </div>
                    {cal.selected && (cal.syncStatus === "error" || cal.lastError) && (
                      <p className="mt-2 text-[11px] text-danger">
                        {cal.lastError ?? "Erro ao sincronizar."}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
            {writableSelected.length > 0 && !writableSelected.some((c) => c.pushNewEvents) && (
              <p className="mt-2 text-[11px] text-warning">Defina o destino dos novos eventos.</p>
            )}
            {google.calendars.every((c) => !c.selected) && (
              <p className="mt-2 text-[11px] text-muted-foreground">
                Marque ao menos uma agenda para começar a sincronizar.
              </p>
            )}
          </div>

          <label className="flex min-h-12 items-center justify-between gap-3 rounded-xl border border-border bg-surface px-4 py-2.5">
            <span className="text-sm font-medium">Sincronizar rotinas</span>
            <input
              type="checkbox"
              checked={conn.pushRoutines}
              disabled={busy !== null}
              onChange={(e) =>
                void run("routines", () =>
                  selectGoogleCalendars([], { pushRoutines: e.target.checked }),
                )
              }
              className="h-5 w-5 shrink-0 accent-primary"
            />
          </label>

          {error && <InlineError message={error} />}

          <div className="grid grid-cols-[1fr_48px_48px] gap-2">
            <button
              type="button"
              onClick={() =>
                void run("sync", async () => {
                  const result = await syncGoogleNow("manual");
                  if (result.skipped)
                    feedback.notify("Já está sincronizando. Aguarde um instante.");
                  else if (result.error) throw new Error(result.error);
                  else if ((result.stats.erros_envio ?? 0) > 0)
                    throw new Error("Algumas alterações não foram enviadas. Tente novamente.");
                  else {
                    const created =
                      (result.stats.criados_no_norte ?? 0) + (result.stats.criados_no_google ?? 0);
                    feedback.notify(
                      created > 0
                        ? `Sincronizado: ${created} novo(s) evento(s).`
                        : "Tudo sincronizado.",
                    );
                  }
                })
              }
              disabled={busy !== null || ui === "syncing"}
              className="interactive-press flex min-h-12 items-center justify-center gap-2 rounded-xl bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-50"
            >
              {busy === "sync" || ui === "syncing" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              Sincronizar
            </button>
            <button
              type="button"
              onClick={connect}
              disabled={busy !== null}
              aria-label="Reconectar Google Agenda"
              title="Reconectar"
              className="interactive-press flex min-h-12 items-center justify-center rounded-xl border border-border disabled:opacity-50"
            >
              <Plug className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setConfirmDisconnect(true)}
              disabled={busy !== null}
              aria-label="Desconectar Google Agenda"
              title="Desconectar"
              className="interactive-press flex min-h-12 items-center justify-center rounded-xl border border-danger/40 text-danger disabled:opacity-50"
            >
              <Unplug className="h-4 w-4" />
            </button>
          </div>
        </>
      )}

      {ui === "needs_reauth" && conn && (
        <button
          type="button"
          onClick={() => setConfirmDisconnect(true)}
          className="min-h-10 w-full text-xs font-semibold text-muted-foreground underline"
        >
          Desconectar de vez
        </button>
      )}

      {error && ui === "disconnected" && <InlineError message={error} />}

      {confirmDisconnect && (
        <Modal onClose={() => setConfirmDisconnect(false)} title="Desconectar o Google Agenda?">
          <p className="text-sm text-muted-foreground">
            A sincronização para. Seus compromissos permanecem salvos.
          </p>
          <div className="mt-5 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setConfirmDisconnect(false)}
              className="interactive-press min-h-12 rounded-xl border border-border text-sm font-semibold"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={busy !== null}
              onClick={() =>
                void run("disconnect", async () => {
                  const result = await disconnectGoogle();
                  setConfirmDisconnect(false);
                  feedback.notify(
                    result.revoked
                      ? "Google Agenda desconectado e acesso revogado."
                      : "Desconectado. Para garantir, remova o Norte em myaccount.google.com/permissions.",
                  );
                })
              }
              className="interactive-press min-h-12 rounded-xl bg-danger text-sm font-semibold text-white disabled:opacity-50"
            >
              {busy === "disconnect" ? "Desconectando…" : "Desconectar"}
            </button>
          </div>
        </Modal>
      )}
      {showConflicts && <GoogleConflictSheet onClose={() => setShowConflicts(false)} />}
    </section>
  );
}
