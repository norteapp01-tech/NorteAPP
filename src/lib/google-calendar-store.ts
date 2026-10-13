import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase, useSupabaseUserId } from "./supabase/client";
import { queryClient } from "./query-client";
import { QUERY_KEY as GOALS_QUERY_KEY } from "./goals-store";
import { SERIES_QUERY_KEY } from "./agenda-series-store";

// ---------------------------------------------------------------------------
// Integração com o Google Agenda (lado do app).
//
// O navegador SÓ LÊ (conexão, agendas, vínculos) e SÓ chama a Edge Function
// `google-calendar` para agir. Tokens e segredos nunca passam por aqui: nem as
// colunas existem para a pessoa autenticada (ver migração 0056).
// ---------------------------------------------------------------------------

type Row = Record<string, unknown>;

export type GoogleConnection = {
  id: string;
  email: string;
  status: "active" | "needs_reauth" | "revoked" | "error";
  syncState: "idle" | "syncing" | "error";
  pushRoutines: boolean;
  timeZone: string;
  lastSyncAt?: string;
  lastError?: string;
};

export type GoogleCalendarRow = {
  id: string;
  googleId: string;
  summary: string;
  color?: string;
  role: "owner" | "writer" | "reader" | "freeBusyReader";
  primary: boolean;
  selected: boolean;
  pushNewEvents: boolean;
  syncStatus: "idle" | "syncing" | "error" | "needs_full_sync";
  lastSyncedAt?: string;
  lastError?: string;
  webhookStatus: "off" | "active" | "unavailable";
};

export type ExternalLink = {
  id: string;
  executionId?: string;
  seriesId?: string;
  calendarId?: string;
  kind: "event" | "series" | "instance";
  syncState: string;
  readOnly: boolean;
  readOnlyReason?: string;
  color?: string;
  calendarName?: string;
};

export type GoogleConflict = ExternalLink & {
  remoteDeleted: boolean;
  conflictAt?: string;
  remote?: Snapshot | { deleted: true };
  local?: Snapshot;
  title: string;
};

export type Snapshot = {
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  location: string | null;
  notes: string | null;
  cancelled: boolean;
};

export type GoogleState = {
  connection: GoogleConnection | null;
  calendars: GoogleCalendarRow[];
  links: ExternalLink[];
  conflicts: GoogleConflict[];
};

const EMPTY: GoogleState = { connection: null, calendars: [], links: [], conflicts: [] };

const text = (v: unknown) => (typeof v === "string" && v ? v : undefined);

function mapConnection(r: Row): GoogleConnection {
  return {
    id: r.id as string,
    email: r.google_email as string,
    status: r.status as GoogleConnection["status"],
    syncState: r.sync_state as GoogleConnection["syncState"],
    pushRoutines: Boolean(r.push_routines),
    timeZone: r.time_zone as string,
    lastSyncAt: text(r.last_sync_at),
    lastError: text(r.last_error),
  };
}

function mapCalendar(r: Row): GoogleCalendarRow {
  return {
    id: r.id as string,
    googleId: r.google_calendar_id as string,
    summary: r.summary as string,
    color: text(r.background_color),
    role: r.access_role as GoogleCalendarRow["role"],
    primary: Boolean(r.is_primary),
    selected: Boolean(r.selected),
    pushNewEvents: Boolean(r.push_new_events),
    syncStatus: r.sync_status as GoogleCalendarRow["syncStatus"],
    lastSyncedAt: text(r.last_synced_at),
    lastError: text(r.last_error),
    webhookStatus: (r.webhook_status as GoogleCalendarRow["webhookStatus"]) ?? "off",
  };
}

function mapLink(r: Row): ExternalLink {
  return {
    id: r.id as string,
    executionId: text(r.execution_id),
    seriesId: text(r.series_id),
    calendarId: text(r.calendar_id),
    kind: r.kind as ExternalLink["kind"],
    syncState: r.sync_state as string,
    readOnly: r.access_role === "read" || Boolean(r.read_only_reason),
    readOnlyReason: text(r.read_only_reason),
    color: text(r.external_color),
    calendarName: text(r.external_label),
  };
}

export async function fetchGoogleState(): Promise<GoogleState> {
  const { data: conn, error } = await supabase
    .from("google_calendar_connections")
    .select("*")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!conn) return EMPTY;
  const [calendarsRes, linksRes, conflictsRes] = await Promise.all([
    supabase.from("google_calendars").select("*").order("is_primary", { ascending: false }),
    supabase
      .from("agenda_external_links")
      .select(
        "id, execution_id, series_id, calendar_id, kind, sync_state, access_role, read_only_reason, external_color, external_label",
      )
      .eq("provider", "google"),
    supabase
      .from("agenda_external_links")
      .select("*")
      .eq("provider", "google")
      .eq("sync_state", "conflict"),
  ]);
  const links = ((linksRes.data ?? []) as Row[]).map(mapLink);
  const titleOf = (r: Row) => {
    const local = r.local_snapshot as Snapshot | null;
    const remote = r.remote_snapshot as Snapshot | { deleted: true } | null;
    return local?.title ?? (remote && "title" in remote ? remote.title : "Evento");
  };
  const conflicts: GoogleConflict[] = ((conflictsRes.data ?? []) as Row[]).map((r) => ({
    ...mapLink(r),
    remoteDeleted: Boolean(r.remote_deleted),
    conflictAt: text(r.conflict_at),
    remote: (r.remote_snapshot as Snapshot | { deleted: true } | null) ?? undefined,
    local: (r.local_snapshot as Snapshot | null) ?? undefined,
    title: titleOf(r),
  }));
  return {
    connection: mapConnection(conn as Row),
    calendars: ((calendarsRes.data ?? []) as Row[]).map(mapCalendar),
    links,
    conflicts,
  };
}

export const GOOGLE_QUERY_KEY = ["google-calendar"] as const;

export function invalidateGoogle() {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: GOOGLE_QUERY_KEY, refetchType: "all" }),
    // O que veio do Google (ou foi ao Google) muda a Agenda inteira.
    queryClient.invalidateQueries({ queryKey: GOALS_QUERY_KEY, refetchType: "all" }),
    queryClient.invalidateQueries({ queryKey: SERIES_QUERY_KEY, refetchType: "all" }),
  ]);
}

export function useGoogleCalendar(): GoogleState & { loading: boolean } {
  const userId = useSupabaseUserId();
  const { data, isLoading } = useQuery({
    queryKey: GOOGLE_QUERY_KEY,
    queryFn: fetchGoogleState,
    enabled: !!userId,
    // Enquanto sincroniza, acompanha o andamento.
    refetchInterval: (query) =>
      query.state.data?.connection?.syncState === "syncing" ? 3000 : false,
  });
  return { ...(data ?? EMPTY), loading: !userId || isLoading };
}

// ---------------------------------------------------------------------------
// Chamadas à Edge Function
// ---------------------------------------------------------------------------

export class GoogleActionError extends Error {
  constructor(
    message: string,
    readonly code?: string,
  ) {
    super(message);
  }
  get needsReauth() {
    return this.code === "needs_reauth";
  }
}

async function call<T>(action: string, body: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.functions.invoke("google-calendar", {
    body: { action, ...body },
  });
  if (error) {
    let message = "Não foi possível falar com o Google Agenda. Tente de novo.";
    let code: string | undefined;
    // Respostas de erro da função trazem { error, code } no corpo.
    const response = (error as { context?: Response }).context;
    if (response && typeof response.json === "function") {
      try {
        const payload = (await response.json()) as { error?: string; code?: string };
        if (payload.error) message = payload.error;
        code = payload.code;
      } catch {
        /* usa a mensagem padrão */
      }
    }
    throw new GoogleActionError(message, code);
  }
  return data as T;
}

const deviceZone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return undefined;
  }
};

/** Pede a URL de consentimento do Google; quem chama redireciona o navegador. */
export async function startGoogleConnect(): Promise<string> {
  const { url } = await call<{ url: string }>("oauth-start", { origin: window.location.origin });
  return url;
}

export async function completeGoogleConnect(ticket: string): Promise<{ email: string }> {
  const result = await call<{ email: string }>("oauth-complete", {
    ticket,
    timeZone: deviceZone(),
  });
  await invalidateGoogle();
  return result;
}

export async function refreshGoogleCalendars() {
  await call("list-calendars");
  await invalidateGoogle();
}

export async function selectGoogleCalendars(
  selections: { id: string; selected?: boolean; pushNewEvents?: boolean }[],
  options: { pushRoutines?: boolean } = {},
) {
  await call("select-calendars", { selections, ...options, timeZone: deviceZone() });
  await invalidateGoogle();
}

export type SyncResult = { stats: Record<string, number>; skipped: boolean; error: string | null };

export async function syncGoogleNow(trigger: "manual" | "push" = "manual"): Promise<SyncResult> {
  const result = await call<SyncResult>("sync", { trigger, timeZone: deviceZone() });
  await invalidateGoogle();
  return result;
}

export async function resolveGoogleConflict(linkId: string, resolution: "google" | "norte") {
  await call("resolve-conflict", { linkId, resolution });
  await invalidateGoogle();
}

export async function disconnectGoogle(): Promise<{ revoked: boolean }> {
  const result = await call<{ revoked: boolean }>("disconnect");
  await invalidateGoogle();
  return result;
}

// ---------------------------------------------------------------------------
// Estado para a interface
// ---------------------------------------------------------------------------

export type GoogleUiState =
  "disconnected" | "connecting" | "connected" | "syncing" | "needs_reauth" | "error";

export function googleUiState(state: GoogleState, connecting: boolean): GoogleUiState {
  if (connecting) return "connecting";
  const c = state.connection;
  if (!c) return "disconnected";
  if (c.status === "needs_reauth" || c.status === "revoked") return "needs_reauth";
  if (c.syncState === "syncing") return "syncing";
  if (c.syncState === "error" || c.status === "error") return "error";
  return "connected";
}

export const RETURN_MESSAGES: Record<string, string> = {
  denied: "Você cancelou a autorização. Nada foi conectado.",
  state: "A autorização expirou ou já foi usada. Tente conectar de novo.",
  scopes: "Faltou permitir o acesso à agenda. Autorize todas as permissões pedidas.",
  refresh:
    "O Google não concluiu a autorização. Remova o Norte em myaccount.google.com/permissions e conecte de novo.",
  exchange: "Não foi possível concluir a autorização com o Google. Tente de novo.",
  code: "O Google não devolveu a autorização. Tente de novo.",
  google: "O Google recusou a autorização. Tente de novo.",
  unexpected: "Algo deu errado ao conectar. Tente de novo.",
};

// ---------------------------------------------------------------------------
// Sincronização automática do lado do app
//
// A fila de saída é preenchida por gatilhos do banco; quem envia é a função.
// Aqui só pedimos para ela rodar: ao abrir, ao voltar para o app e depois de
// mudanças — com folga, para que as próprias atualizações da sincronização
// não disparem outra.
// ---------------------------------------------------------------------------

const DEBOUNCE_MS = 3000;
const COOLDOWN_MS = 5000;
const MIN_GAP_MS = 60_000;

export function useGoogleAutoSync(enabled: boolean) {
  const lastRun = useRef(0);
  const running = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const run = async (trigger: "manual" | "push") => {
      if (running.current) return;
      running.current = true;
      try {
        await syncGoogleNow(trigger);
      } catch {
        /* O estado de erro já aparece nas configurações. */
      } finally {
        running.current = false;
        lastRun.current = Date.now();
      }
    };
    const schedule = (delay = DEBOUNCE_MS) => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void run("push"), delay);
    };

    // Ao abrir: se faz tempo, sincroniza.
    if (Date.now() - lastRun.current > MIN_GAP_MS) schedule(800);

    const onVisible = () => {
      if (document.visibilityState === "visible" && Date.now() - lastRun.current > MIN_GAP_MS)
        schedule(500);
    };
    const onOnline = () => schedule(500);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);

    // Mudanças da pessoa na Agenda: envia pouco depois.
    const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
      if (event.type !== "updated" || event.action.type !== "success") return;
      const key = event.query.queryKey[0];
      if (key !== GOALS_QUERY_KEY[0] && key !== SERIES_QUERY_KEY[0]) return;
      if (running.current || Date.now() - lastRun.current < COOLDOWN_MS) return;
      schedule();
    });

    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
      unsubscribe();
      if (timer.current) clearTimeout(timer.current);
    };
  }, [enabled]);
}
