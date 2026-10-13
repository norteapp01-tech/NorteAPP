import { GoogleApiError, GoogleCalendarApi, type GoogleCalendarListEntry } from "./api.ts";
import { decryptToken, encryptToken, randomToken, sha256Hex, timingSafeEqual } from "./crypto.ts";
import {
  enqueueBackfill,
  pullCalendar,
  pushOutbox,
  resolveConflict,
  SyncUserError,
  type Cal,
  type Conn,
  type Ctx,
  type Db,
  type Stats,
} from "./engine.ts";
import {
  GOOGLE_SCOPES,
  OAuthError,
  buildAuthUrl,
  createState,
  exchangeCode,
  fetchUserInfo,
  isAllowedOrigin,
  refreshAccessToken,
  revokeToken,
  verifyState,
  type FetchLike,
  type OAuthConfig,
} from "./oauth.ts";
import { isValidTimeZone } from "./time.ts";

// ---------------------------------------------------------------------------
// Serviço do Google Agenda: tudo o que as Edge Functions fazem, sem depender do
// Deno — recebe o banco, o `fetch`, os segredos e o relógio por injeção, e por
// isso é testado por inteiro com um Google e um Supabase de mentira.
// ---------------------------------------------------------------------------

type Row = Record<string, unknown>;
type Result<T> = PromiseLike<{ data: T | null; error: { message: string } | null }>;

export type Env = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  stateSecret: string;
  encryptionKey: string;
  /** Origem principal do app (para onde o OAuth devolve a pessoa). */
  appUrl: string;
  /** Outras origens aceitas (ex.: ambiente de desenvolvimento). */
  allowedOrigins: string[];
  /** URL pública que o Google chama (webhook). Vazio = sem webhook. */
  webhookAddress: string;
};

export type Deps = {
  db: Db;
  fetch: FetchLike;
  env: Env;
  now: () => Date;
  /** Para testes: troca o cliente da API. */
  makeApi?: (getAccessToken: () => Promise<string>) => GoogleCalendarApi;
  newId?: () => string;
};

/** Erro com mensagem própria para a pessoa e um código estável para a interface. */
export class ServiceError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

const DEFAULT_ZONE = "America/Sao_Paulo";
const WEBHOOK_TTL_SECONDS = 6 * 24 * 3600;
const RENEW_BEFORE_MS = 24 * 3600 * 1000;
const PENDING_TTL_MS = 15 * 60 * 1000;
const LOCK_STALE_MS = 10 * 60 * 1000;

async function q<T>(p: Result<T>): Promise<T> {
  const r = await p;
  if (r.error) throw new Error(r.error.message);
  return r.data as T;
}

const oauthConfig = (env: Env): OAuthConfig => ({
  clientId: env.clientId,
  clientSecret: env.clientSecret,
  redirectUri: env.redirectUri,
  stateSecret: env.stateSecret,
});

const originsOf = (env: Env) => [env.appUrl, ...env.allowedOrigins].filter(Boolean);

function appRedirect(origin: string, params: Record<string, string>): string {
  const url = new URL("/agenda", origin);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return url.toString();
}

// ---------------------------------------------------------------------------
// OAuth
// ---------------------------------------------------------------------------

/** Passo 1: a pessoa (logada no Norte) pede para conectar. */
export async function startOAuth(
  deps: Deps,
  userId: string,
  origin: string | undefined,
  loginHint?: string,
): Promise<{ url: string }> {
  const { env } = deps;
  const chosen =
    origin && isAllowedOrigin(origin, originsOf(env)) ? new URL(origin).origin : env.appUrl;
  const nowSeconds = Math.floor(deps.now().getTime() / 1000);
  const { state, nonce } = await createState(userId, chosen, env.stateSecret, nowSeconds);
  await q(
    deps.db
      .from("google_oauth_states")
      .insert({ nonce, user_id: userId, app_origin: chosen })
      .select(),
  );
  // Faxina: estados e bilhetes antigos nunca devem acumular.
  const cutoff = new Date(deps.now().getTime() - 60 * 60 * 1000).toISOString();
  await deps.db.from("google_oauth_states").delete().lt("created_at", cutoff);
  await deps.db
    .from("google_oauth_pending")
    .delete()
    .lt("created_at", new Date(deps.now().getTime() - PENDING_TTL_MS).toISOString());
  return { url: buildAuthUrl(oauthConfig(env), state, loginHint) };
}

/** Passo 2: o Google devolve a pessoa aqui. Não há sessão do Norte neste pedido,
 * então nada é gravado em nome de ninguém: os tokens esperam um bilhete que só
 * o navegador da MESMA pessoa, já logada, consegue confirmar. */
export async function handleOAuthCallback(
  deps: Deps,
  params: { code?: string | null; state?: string | null; error?: string | null },
): Promise<{ redirect: string }> {
  const { env } = deps;
  const fallback = (reason: string) => ({
    redirect: appRedirect(env.appUrl, { google: "error", reason }),
  });
  if (!params.state) return fallback("state");

  let payload;
  try {
    payload = await verifyState(
      params.state,
      env.stateSecret,
      Math.floor(deps.now().getTime() / 1000),
    );
  } catch {
    return fallback("state");
  }
  const origin = isAllowedOrigin(payload.origin, originsOf(env)) ? payload.origin : env.appUrl;

  // Cada state vale uma vez: consumir é atômico (só uma chamada consegue).
  const consumed = await q<Row[]>(
    deps.db
      .from("google_oauth_states")
      .update({ used_at: deps.now().toISOString() })
      .eq("nonce", payload.nonce)
      .eq("user_id", payload.uid)
      .is("used_at", null)
      .select(),
  );
  if (!consumed || consumed.length === 0)
    return { redirect: appRedirect(origin, { google: "error", reason: "state" }) };

  if (params.error) {
    const reason = params.error === "access_denied" ? "denied" : "google";
    return { redirect: appRedirect(origin, { google: "error", reason }) };
  }
  if (!params.code) return { redirect: appRedirect(origin, { google: "error", reason: "code" }) };

  try {
    const tokens = await exchangeCode(deps.fetch, oauthConfig(env), params.code);
    const granted = (tokens.scope ?? "").split(" ");
    const missing = GOOGLE_SCOPES.filter((s) => s.startsWith("https://") && !granted.includes(s));
    if (missing.length > 0)
      return { redirect: appRedirect(origin, { google: "error", reason: "scopes" }) };

    const info = await fetchUserInfo(deps.fetch, tokens.access_token);
    let refreshToken = tokens.refresh_token ?? null;
    if (!refreshToken) {
      // Sem refresh token novo: só serve se já havia um da mesma conta.
      const existing = await q<Row | null>(
        deps.db
          .from("google_calendar_connections")
          .select("id, google_account_id")
          .eq("user_id", payload.uid)
          .maybeSingle(),
      );
      if (existing && existing.google_account_id === info.sub) {
        const stored = await q<Row | null>(
          deps.db
            .from("google_calendar_tokens")
            .select("refresh_token_enc")
            .eq("connection_id", existing.id)
            .maybeSingle(),
        );
        if (stored?.refresh_token_enc)
          refreshToken = await decryptToken(String(stored.refresh_token_enc), env.encryptionKey);
      }
      if (!refreshToken)
        return { redirect: appRedirect(origin, { google: "error", reason: "refresh" }) };
    }

    const ticket = randomToken(32);
    await q(
      deps.db
        .from("google_oauth_pending")
        .insert({
          ticket,
          user_id: payload.uid,
          google_account_id: info.sub,
          google_email: info.email,
          scopes: granted,
          access_token_enc: await encryptToken(tokens.access_token, env.encryptionKey),
          refresh_token_enc: await encryptToken(refreshToken, env.encryptionKey),
          expires_at: new Date(deps.now().getTime() + tokens.expires_in * 1000).toISOString(),
        })
        .select(),
    );
    return { redirect: appRedirect(origin, { google_ticket: ticket }) };
  } catch (error) {
    const reason = error instanceof OAuthError ? "exchange" : "unexpected";
    return { redirect: appRedirect(origin, { google: "error", reason }) };
  }
}

/** Passo 3: o navegador logado confirma o bilhete e a conexão passa a valer. */
export async function completeConnection(
  deps: Deps,
  userId: string,
  ticket: string,
  timeZone?: string,
  options: { syncInitial?: boolean } = {},
): Promise<{ email: string }> {
  const pending = await q<Row | null>(
    deps.db.from("google_oauth_pending").select("*").eq("ticket", ticket).maybeSingle(),
  );
  // O bilhete precisa ser da MESMA pessoa que iniciou: é isso que impede
  // ligar a conta Google de alguém à conta Norte de outra pessoa.
  if (!pending || pending.user_id !== userId)
    throw new ServiceError(
      "Este pedido de conexão não é válido. Tente conectar de novo.",
      "ticket_invalid",
      403,
    );
  if (deps.now().getTime() - new Date(String(pending.created_at)).getTime() > PENDING_TTL_MS) {
    await deps.db.from("google_oauth_pending").delete().eq("ticket", ticket);
    throw new ServiceError(
      "O pedido de conexão expirou. Tente conectar de novo.",
      "ticket_expired",
      410,
    );
  }

  const zone = timeZone && isValidTimeZone(timeZone) ? timeZone : DEFAULT_ZONE;
  const existing = await q<Row | null>(
    deps.db.from("google_calendar_connections").select("*").eq("user_id", userId).maybeSingle(),
  );
  if (existing && existing.google_account_id !== pending.google_account_id) {
    // Trocou de conta Google: a conexão anterior é desfeita por inteiro.
    await disconnect(deps, userId);
  }
  const current = await q<Row | null>(
    deps.db.from("google_calendar_connections").select("*").eq("user_id", userId).maybeSingle(),
  );
  let connectionId: string;
  if (current) {
    connectionId = String(current.id);
    await q(
      deps.db
        .from("google_calendar_connections")
        .update({
          status: "active",
          google_email: pending.google_email,
          scopes: pending.scopes,
          time_zone: zone,
          last_error: null,
          last_error_at: null,
          sync_state: "idle",
        })
        .eq("id", connectionId)
        .select(),
    );
  } else {
    const created = await q<Row>(
      deps.db
        .from("google_calendar_connections")
        .insert({
          user_id: userId,
          google_account_id: pending.google_account_id,
          google_email: pending.google_email,
          scopes: pending.scopes,
          time_zone: zone,
        })
        .select()
        .single(),
    );
    connectionId = String(created.id);
  }
  await q(
    deps.db
      .from("google_calendar_tokens")
      .upsert(
        {
          connection_id: connectionId,
          user_id: userId,
          access_token_enc: pending.access_token_enc,
          refresh_token_enc: pending.refresh_token_enc,
          expires_at: pending.expires_at,
          updated_at: deps.now().toISOString(),
        },
        { onConflict: "connection_id" },
      )
      .select(),
  );
  await deps.db.from("google_oauth_pending").delete().eq("ticket", ticket);

  // Agendas: a principal já vem marcada (e recebe o que for criado no Norte).
  await listCalendars(deps, userId, { firstConnection: !current });
  if (options.syncInitial !== false) await syncConnection(deps, userId, { trigger: "initial" });
  return { email: String(pending.google_email) };
}

// ---------------------------------------------------------------------------
// Token e cliente da API
// ---------------------------------------------------------------------------

async function loadConnection(deps: Deps, userId: string): Promise<Row> {
  const conn = await q<Row | null>(
    deps.db.from("google_calendar_connections").select("*").eq("user_id", userId).maybeSingle(),
  );
  if (!conn) throw new ServiceError("O Google Agenda não está conectado.", "not_connected", 404);
  return conn;
}

/** Token de acesso válido (renova com o refresh token quando perto de vencer). */
async function accessTokenFor(deps: Deps, conn: Row, force = false): Promise<string> {
  const tokens = await q<Row | null>(
    deps.db.from("google_calendar_tokens").select("*").eq("connection_id", conn.id).maybeSingle(),
  );
  if (!tokens)
    throw new ServiceError("Conexão sem token. Reconecte o Google Agenda.", "needs_reauth", 401);
  const expiresAt = tokens.expires_at ? new Date(String(tokens.expires_at)).getTime() : 0;
  if (!force && expiresAt - deps.now().getTime() > 60_000)
    return decryptToken(String(tokens.access_token_enc), deps.env.encryptionKey);

  if (!tokens.refresh_token_enc) {
    await markNeedsReauth(deps, conn, "O Google não forneceu um token de renovação.");
    throw new ServiceError("É preciso reconectar o Google Agenda.", "needs_reauth", 401);
  }
  const refresh = await decryptToken(String(tokens.refresh_token_enc), deps.env.encryptionKey);
  try {
    const fresh = await refreshAccessToken(deps.fetch, oauthConfig(deps.env), refresh);
    await q(
      deps.db
        .from("google_calendar_tokens")
        .update({
          access_token_enc: await encryptToken(fresh.access_token, deps.env.encryptionKey),
          // O Google só reenvia o refresh token quando muda.
          ...(fresh.refresh_token
            ? { refresh_token_enc: await encryptToken(fresh.refresh_token, deps.env.encryptionKey) }
            : {}),
          expires_at: new Date(deps.now().getTime() + fresh.expires_in * 1000).toISOString(),
          updated_at: deps.now().toISOString(),
        })
        .eq("connection_id", conn.id)
        .select(),
    );
    return fresh.access_token;
  } catch (error) {
    if (error instanceof OAuthError && error.needsReauth) {
      await markNeedsReauth(deps, conn, "O acesso ao Google foi revogado ou expirou.");
      throw new ServiceError(
        "O acesso ao Google expirou. Reconecte o Google Agenda.",
        "needs_reauth",
        401,
      );
    }
    throw error;
  }
}

async function markNeedsReauth(deps: Deps, conn: Row, message: string) {
  await deps.db
    .from("google_calendar_connections")
    .update({
      status: "needs_reauth",
      sync_state: "error",
      last_error: message,
      last_error_at: deps.now().toISOString(),
    })
    .eq("id", conn.id);
}

function makeApi(deps: Deps, conn: Row): GoogleCalendarApi {
  const getAccessToken = () => accessTokenFor(deps, conn);
  return deps.makeApi
    ? deps.makeApi(getAccessToken)
    : new GoogleCalendarApi({ getAccessToken, fetch: deps.fetch });
}

/** Roda a ação; se o Google disser 401, renova o token e tenta mais uma vez. */
async function withTokenRetry<T>(deps: Deps, conn: Row, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof GoogleApiError && error.isUnauthorized) {
      await accessTokenFor(deps, conn, true);
      return fn();
    }
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Agendas
// ---------------------------------------------------------------------------

const isWritable = (role: string) => role === "owner" || role === "writer";

/** Atualiza a lista de agendas da conta Google. Escolhas já feitas são mantidas. */
export async function listCalendars(
  deps: Deps,
  userId: string,
  opts: { firstConnection?: boolean } = {},
): Promise<Row[]> {
  const conn = await loadConnection(deps, userId);
  const api = makeApi(deps, conn);
  const remote: GoogleCalendarListEntry[] = await withTokenRetry(deps, conn, () =>
    api.listCalendars(),
  );
  const existing =
    (await q<Row[]>(
      deps.db
        .from("google_calendars")
        .select("*")
        .eq("connection_id", conn.id)
        .eq("user_id", userId),
    )) ?? [];
  const byGoogleId = new Map(existing.map((c) => [String(c.google_calendar_id), c]));

  for (const entry of remote) {
    const fields = {
      summary: entry.summaryOverride ?? entry.summary ?? entry.id,
      description: entry.description ?? null,
      time_zone: entry.timeZone ?? null,
      background_color: entry.backgroundColor ?? null,
      foreground_color: entry.foregroundColor ?? null,
      access_role: entry.accessRole,
      is_primary: Boolean(entry.primary),
    };
    const known = byGoogleId.get(entry.id);
    if (known) {
      await deps.db.from("google_calendars").update(fields).eq("id", known.id);
    } else {
      // Na primeira conexão, só a agenda principal vem marcada.
      const first =
        Boolean(opts.firstConnection) && Boolean(entry.primary) && isWritable(entry.accessRole);
      await q(
        deps.db
          .from("google_calendars")
          .insert({
            connection_id: conn.id,
            user_id: userId,
            google_calendar_id: entry.id,
            ...fields,
            selected: first,
            push_new_events: first,
          })
          .select(),
      );
    }
  }
  // Agenda que sumiu da conta (apagada, descompartilhada): sai daqui também.
  const remoteIds = new Set(remote.map((c) => c.id));
  for (const c of existing)
    if (!remoteIds.has(String(c.google_calendar_id))) await detachCalendar(deps, conn, c);

  return (
    (await q<Row[]>(
      deps.db
        .from("google_calendars")
        .select("*")
        .eq("connection_id", conn.id)
        .eq("user_id", userId),
    )) ?? []
  );
}

/** Deixa de sincronizar uma agenda: para o webhook e solta os vínculos. */
async function detachCalendar(deps: Deps, conn: Row, cal: Row): Promise<void> {
  const channels =
    (await q<Row[]>(
      deps.db
        .from("google_calendar_channels")
        .select("*")
        .eq("calendar_id", cal.id)
        .is("stopped_at", null),
    )) ?? [];
  if (channels.length > 0) {
    try {
      const api = makeApi(deps, conn);
      for (const ch of channels)
        if (ch.resource_id)
          await api.stopChannel({ id: String(ch.id), resourceId: String(ch.resource_id) });
    } catch {
      /* O canal expira sozinho; o webhook também recusa canais desativados. */
    }
    await deps.db
      .from("google_calendar_channels")
      .update({ stopped_at: deps.now().toISOString() })
      .eq("calendar_id", cal.id);
  }
  // Espelho de agenda somente leitura não faz sentido sem a agenda: sai do Norte.
  const mirrored =
    (await q<Row[]>(
      deps.db
        .from("agenda_external_links")
        .select("*")
        .eq("user_id", String(cal.user_id))
        .eq("calendar_id", cal.id),
    )) ?? [];
  for (const link of mirrored) {
    const readOnly = link.access_role === "read" || Boolean(link.read_only_reason);
    if (readOnly) {
      if (link.kind === "series" && link.series_id) {
        await deps.db.from("executions").delete().eq("series_id", link.series_id);
        await deps.db.from("agenda_series").delete().eq("id", link.series_id);
      } else if (link.execution_id) {
        await deps.db.from("executions").delete().eq("id", link.execution_id);
      }
    } else if (link.execution_id) {
      // Compromisso editável: fica no Norte, agora como um compromisso comum.
      await deps.db.from("executions").update({ source: "norte" }).eq("id", link.execution_id);
    } else if (link.series_id && link.kind === "series") {
      await deps.db.from("agenda_series").update({ source: "norte" }).eq("id", link.series_id);
    }
    await deps.db.from("agenda_external_links").delete().eq("id", link.id);
  }
  await deps.db.from("google_calendar_sync_state").delete().eq("calendar_id", cal.id);
  if (
    !(await q<Row | null>(
      deps.db.from("google_calendars").select("id").eq("id", cal.id).maybeSingle(),
    ))
  )
    return;
  await deps.db
    .from("google_calendars")
    .update({ selected: false, push_new_events: false, sync_status: "idle", webhook_status: "off" })
    .eq("id", cal.id);
}

export type Selection = { id: string; selected?: boolean; pushNewEvents?: boolean };

export async function selectCalendars(
  deps: Deps,
  userId: string,
  selections: Selection[],
  options: { pushRoutines?: boolean; timeZone?: string } = {},
): Promise<Row[]> {
  const conn = await loadConnection(deps, userId);
  const calendars =
    (await q<Row[]>(
      deps.db
        .from("google_calendars")
        .select("*")
        .eq("connection_id", conn.id)
        .eq("user_id", userId),
    )) ?? [];
  const byId = new Map(calendars.map((c) => [String(c.id), c]));
  for (const s of selections)
    if (!byId.has(s.id)) throw new ServiceError("Agenda desconhecida.", "unknown_calendar", 404);

  const final = new Map(calendars.map((c) => [String(c.id), { ...c }]));
  for (const s of selections) {
    const cal = final.get(s.id)!;
    if (s.selected !== undefined) cal.selected = s.selected;
    if (s.pushNewEvents !== undefined) cal.push_new_events = s.pushNewEvents;
    if (!cal.selected) cal.push_new_events = false;
  }
  const targets = [...final.values()].filter((c) => c.push_new_events);
  if (targets.length > 1) {
    // Só UMA agenda recebe os eventos novos do Norte: a última escolhida vence.
    const chosen = selections.find((s) => s.pushNewEvents)?.id;
    for (const c of targets) if (String(c.id) !== chosen) c.push_new_events = false;
  }
  for (const c of final.values())
    if (c.push_new_events && !isWritable(String(c.access_role)))
      throw new ServiceError(
        "Esta agenda é somente leitura e não pode receber eventos do Norte.",
        "read_only_target",
        400,
      );

  const newlySelected: Row[] = [];
  for (const c of final.values()) {
    const before = byId.get(String(c.id))!;
    if (before.selected && !c.selected) await detachCalendar(deps, conn, before);
    // (a ordem importa: o destino antigo é liberado antes de marcar o novo)
  }
  for (const c of final.values()) {
    const before = byId.get(String(c.id))!;
    if (before.push_new_events && !c.push_new_events)
      await deps.db.from("google_calendars").update({ push_new_events: false }).eq("id", c.id);
  }
  for (const c of final.values()) {
    const before = byId.get(String(c.id))!;
    if (c.selected) {
      await deps.db
        .from("google_calendars")
        .update({ selected: true, push_new_events: Boolean(c.push_new_events) })
        .eq("id", c.id);
      if (!before.selected) newlySelected.push(c);
    }
  }

  const connPatch: Row = {};
  if (options.pushRoutines !== undefined) connPatch.push_routines = options.pushRoutines;
  if (Object.keys(connPatch).length > 0)
    await deps.db.from("google_calendar_connections").update(connPatch).eq("id", conn.id);

  if (
    newlySelected.length > 0 ||
    options.pushRoutines !== undefined ||
    selections.some((s) => s.pushNewEvents)
  ) {
    await syncConnection(deps, userId, {
      trigger: "manual",
      timeZone: options.timeZone,
      initialCalendars: newlySelected.map((c) => String(c.id)),
      backfill: options.pushRoutines === true || selections.some((s) => s.pushNewEvents),
    });
  }
  return (
    (await q<Row[]>(
      deps.db
        .from("google_calendars")
        .select("*")
        .eq("connection_id", conn.id)
        .eq("user_id", userId),
    )) ?? []
  );
}

// ---------------------------------------------------------------------------
// Sincronização
// ---------------------------------------------------------------------------

export type SyncOptions = {
  trigger: "initial" | "manual" | "webhook" | "cron" | "push";
  timeZone?: string;
  /** Só estas agendas (webhook). */
  onlyCalendars?: string[];
  /** Agendas recém-escolhidas: a primeira leitura trata duplicatas. */
  initialCalendars?: string[];
  /** Coloca na fila tudo o que já existe no Norte (primeira conexão). */
  backfill?: boolean;
};

export type SyncSummary = { skipped?: boolean; stats: Stats; error?: string };

export async function syncConnection(
  deps: Deps,
  userId: string,
  opts: SyncOptions,
): Promise<SyncSummary> {
  const conn = await loadConnection(deps, userId);
  if (conn.status !== "active")
    throw new ServiceError("É preciso reconectar o Google Agenda.", "needs_reauth", 409);

  // Trava: uma sincronização por vez por pessoa (a travada há muito tempo é ignorada).
  const staleBefore = new Date(deps.now().getTime() - LOCK_STALE_MS).toISOString();
  const locked = await q<Row[]>(
    deps.db
      .from("google_calendar_connections")
      .update({ sync_state: "syncing" })
      .eq("id", conn.id)
      .neq("sync_state", "syncing")
      .select(),
  );
  let acquired = Boolean(locked && locked.length > 0);
  if (!acquired) {
    // A retomada também precisa ser atômica. Usar o `updated_at` carregado antes
    // permitiria que duas chamadas vissem a mesma fotografia antiga e ambas
    // roubassem a trava que a outra acabou de adquirir.
    const reclaimed = await q<Row[]>(
      deps.db
        .from("google_calendar_connections")
        .update({ sync_state: "syncing" })
        .eq("id", conn.id)
        .eq("sync_state", "syncing")
        .lt("updated_at", staleBefore)
        .select(),
    );
    acquired = Boolean(reclaimed && reclaimed.length > 0);
  }
  if (!acquired) return { skipped: true, stats: {} };

  const stats: Stats = {};
  const run = await q<Row>(
    deps.db
      .from("google_calendar_sync_runs")
      .insert({ connection_id: conn.id, user_id: userId, trigger: opts.trigger })
      .select()
      .single(),
  );
  let failure: string | undefined;
  try {
    const zone =
      opts.timeZone && isValidTimeZone(opts.timeZone)
        ? opts.timeZone
        : String(conn.time_zone ?? DEFAULT_ZONE);
    if (zone !== conn.time_zone)
      await deps.db
        .from("google_calendar_connections")
        .update({ time_zone: zone })
        .eq("id", conn.id);

    const api = makeApi(deps, conn);
    const connInfo: Conn = {
      id: String(conn.id),
      user_id: userId,
      time_zone: zone,
      push_routines: Boolean(conn.push_routines),
    };
    const ctx: Ctx = {
      db: deps.db,
      api,
      conn: connInfo,
      zone,
      now: deps.now,
      stats,
      newId: deps.newId ?? (() => crypto.randomUUID()),
    };
    await withTokenRetry(deps, conn, async () => {
      let calendars = ((await q<Cal[]>(
        deps.db
          .from("google_calendars")
          .select("*")
          .eq("connection_id", conn.id)
          .eq("user_id", userId)
          .eq("selected", true),
      )) ?? []) as Cal[];
      if (opts.onlyCalendars)
        calendars = calendars.filter((c) => opts.onlyCalendars!.includes(c.id));

      for (const cal of calendars) {
        await deps.db.from("google_calendars").update({ sync_status: "syncing" }).eq("id", cal.id);
        try {
          const first = !(await q<Row | null>(
            deps.db
              .from("google_calendar_sync_state")
              .select("calendar_id")
              .eq("calendar_id", cal.id)
              .maybeSingle(),
          ));
          await pullCalendar(ctx, cal, {
            initial:
              opts.trigger === "initial" ||
              first ||
              Boolean(opts.initialCalendars?.includes(cal.id)),
          });
          await deps.db
            .from("google_calendars")
            .update({
              sync_status: "idle",
              last_synced_at: deps.now().toISOString(),
              last_error: null,
            })
            .eq("id", cal.id);
          await ensureChannel(deps, conn, api, cal);
        } catch (error) {
          await deps.db
            .from("google_calendars")
            .update({ sync_status: "error", last_error: message(error) })
            .eq("id", cal.id);
          // Sem acesso (token revogado/expirado) vale para a conexão toda.
          if (
            error instanceof ServiceError ||
            (error instanceof GoogleApiError && error.isUnauthorized)
          )
            throw error;
          stats.agendas_com_erro = (stats.agendas_com_erro ?? 0) + 1;
        }
      }
      if (opts.backfill || opts.trigger === "initial") await enqueueBackfill(ctx);
      // "Sincronizar agora" também é a ação de recuperação: ignora o backoff
      // automático e tenta imediatamente tudo o que ainda está pendente.
      if (opts.trigger === "manual")
        await deps.db
          .from("agenda_sync_outbox")
          .update({ next_attempt_at: null })
          .eq("user_id", userId);
      await pushOutbox(ctx);
    });
  } catch (error) {
    failure = message(error);
    if (error instanceof ServiceError && error.code === "needs_reauth") throw error;
  } finally {
    const now = deps.now().toISOString();
    await deps.db
      .from("google_calendar_connections")
      .update(
        failure
          ? { sync_state: "error", last_error: failure, last_error_at: now }
          : { sync_state: "idle", last_sync_at: now, last_error: null },
      )
      .eq("id", conn.id)
      .eq("status", "active");
    await deps.db
      .from("google_calendar_sync_runs")
      .update({ status: failure ? "error" : "ok", finished_at: now, stats, error: failure ?? null })
      .eq("id", run.id);
  }
  return { stats, error: failure };
}

function message(error: unknown): string {
  if (error instanceof Error) return error.message.slice(0, 300);
  return "Erro inesperado.";
}

// ---------------------------------------------------------------------------
// Webhooks (notificações push do Google)
// ---------------------------------------------------------------------------

/** Garante um canal ativo para a agenda. Se o Google recusar o endereço, a
 * agenda segue sincronizando por verificação periódica. */
async function ensureChannel(
  deps: Deps,
  conn: Row,
  api: GoogleCalendarApi,
  cal: Cal,
): Promise<void> {
  if (!deps.env.webhookAddress) return;
  const active =
    (await q<Row[]>(
      deps.db
        .from("google_calendar_channels")
        .select("*")
        .eq("calendar_id", cal.id)
        .is("stopped_at", null),
    )) ?? [];
  const nowMs = deps.now().getTime();
  const current = active.find(
    (c) => new Date(String(c.expires_at)).getTime() - nowMs > RENEW_BEFORE_MS,
  );
  if (current) return;

  const id = (deps.newId ?? (() => crypto.randomUUID()))();
  const token = randomToken(24);
  try {
    const watch = await api.watch(cal.google_calendar_id, {
      id,
      address: deps.env.webhookAddress,
      token,
      ttlSeconds: WEBHOOK_TTL_SECONDS,
    });
    await q(
      deps.db
        .from("google_calendar_channels")
        .insert({
          id,
          calendar_id: cal.id,
          user_id: String(conn.user_id),
          resource_id: watch.resourceId,
          token_hash: await sha256Hex(token),
          expires_at: new Date(
            watch.expiration ? Number(watch.expiration) : nowMs + WEBHOOK_TTL_SECONDS * 1000,
          ).toISOString(),
        })
        .select(),
    );
    await deps.db.from("google_calendars").update({ webhook_status: "active" }).eq("id", cal.id);
    // O canal antigo já foi substituído.
    for (const old of active) {
      try {
        if (old.resource_id)
          await api.stopChannel({ id: String(old.id), resourceId: String(old.resource_id) });
      } catch {
        /* expira sozinho */
      }
      await deps.db
        .from("google_calendar_channels")
        .update({ stopped_at: deps.now().toISOString() })
        .eq("id", old.id);
    }
  } catch (error) {
    // Ex.: domínio do webhook não verificado no Google. Não é um erro da
    // sincronização: a verificação periódica cobre.
    if (error instanceof GoogleApiError && error.status >= 500) throw error;
    await deps.db
      .from("google_calendars")
      .update({ webhook_status: "unavailable" })
      .eq("id", cal.id);
  }
}

/** Valida e atende uma notificação do Google. */
export async function handleWebhook(
  deps: Deps,
  headers: { get(name: string): string | null },
): Promise<{ status: number; work?: Promise<unknown> }> {
  const channelId = headers.get("x-goog-channel-id");
  const token = headers.get("x-goog-channel-token");
  const resourceId = headers.get("x-goog-resource-id");
  const state = headers.get("x-goog-resource-state");
  if (!channelId || !token || !resourceId) return { status: 400 };

  const channel = await q<Row | null>(
    deps.db.from("google_calendar_channels").select("*").eq("id", channelId).maybeSingle(),
  );
  // Canal desconhecido, parado, vencido, de outro recurso ou com token errado:
  // ninguém além do Google, com o segredo que demos, aciona a sincronização.
  if (
    !channel ||
    channel.stopped_at ||
    new Date(String(channel.expires_at)).getTime() < deps.now().getTime() ||
    channel.resource_id !== resourceId ||
    !timingSafeEqual(String(channel.token_hash), await sha256Hex(token))
  )
    return { status: 404 };

  if (state === "sync") return { status: 200 }; // aviso de que o canal foi criado
  const work = syncConnection(deps, String(channel.user_id), {
    trigger: "webhook",
    onlyCalendars: [String(channel.calendar_id)],
  }).catch(() => undefined);
  return { status: 200, work };
}

// ---------------------------------------------------------------------------
// Verificação periódica (cron)
// ---------------------------------------------------------------------------

export async function runCron(
  deps: Deps,
  secret: string | null,
  budgetMs = 50_000,
  wallNow: () => number = Date.now,
): Promise<{ status: number; processed: number }> {
  const internal = await q<Row | null>(
    deps.db.from("google_sync_internal").select("cron_secret, cron_cursor").maybeSingle(),
  );
  if (!secret || !internal || !timingSafeEqual(String(internal.cron_secret), secret))
    return { status: 401, processed: 0 };

  // O orçamento de tempo é de relógio real, não do relógio injetado.
  const started = wallNow();
  const loadBatch = async (after?: string): Promise<Row[]> => {
    let query = deps.db
      .from("google_calendar_connections")
      .select("*")
      .eq("status", "active")
      .order("id", { ascending: true })
      .limit(100);
    if (after) query = query.gt("id", after);
    return (await q<Row[]>(query)) ?? [];
  };
  const cursor = internal.cron_cursor ? String(internal.cron_cursor) : undefined;
  let connections = await loadBatch(cursor);
  // Chegou ao fim: a rodada seguinte recomeça do início, sem manter as mesmas
  // pessoas eternamente na frente da fila.
  if (connections.length === 0 && cursor) connections = await loadBatch();
  let processed = 0;
  let lastAttempted: string | null = null;
  for (const conn of connections) {
    if (wallNow() - started >= budgetMs) break;
    lastAttempted = String(conn.id);
    try {
      await syncConnection(deps, String(conn.user_id), { trigger: "cron" });
      processed += 1;
    } catch {
      /* uma pessoa com problema não pode parar as demais */
    }
  }
  if (lastAttempted)
    await deps.db
      .from("google_sync_internal")
      .update({ cron_cursor: lastAttempted })
      .eq("singleton", true);
  return { status: 200, processed };
}

// ---------------------------------------------------------------------------
// Conflitos e desconexão
// ---------------------------------------------------------------------------

export async function resolveConflictAction(
  deps: Deps,
  userId: string,
  linkId: string,
  resolution: "google" | "norte",
): Promise<void> {
  const conn = await loadConnection(deps, userId);
  const api = makeApi(deps, conn);
  const ctx: Ctx = {
    db: deps.db,
    api,
    conn: {
      id: String(conn.id),
      user_id: userId,
      time_zone: String(conn.time_zone),
      push_routines: Boolean(conn.push_routines),
    },
    zone: String(conn.time_zone),
    now: deps.now,
    stats: {},
    newId: deps.newId ?? (() => crypto.randomUUID()),
  };
  try {
    await withTokenRetry(deps, conn, () => resolveConflict(ctx, linkId, resolution));
  } catch (error) {
    if (error instanceof SyncUserError) throw new ServiceError(error.message, "conflict", 409);
    throw error;
  }
}

/** Desconecta: para os webhooks, revoga o acesso no Google, solta os vínculos e
 * apaga tokens. O que a pessoa criou continua no Norte; o espelho de agendas
 * somente leitura sai. */
export async function disconnect(deps: Deps, userId: string): Promise<{ revoked: boolean }> {
  const conn = await q<Row | null>(
    deps.db.from("google_calendar_connections").select("*").eq("user_id", userId).maybeSingle(),
  );
  if (!conn) return { revoked: false };

  const calendars =
    (await q<Row[]>(
      deps.db
        .from("google_calendars")
        .select("*")
        .eq("connection_id", conn.id)
        .eq("user_id", userId),
    )) ?? [];
  for (const cal of calendars) await detachCalendar(deps, conn, cal);

  let revoked = false;
  const tokens = await q<Row | null>(
    deps.db.from("google_calendar_tokens").select("*").eq("connection_id", conn.id).maybeSingle(),
  );
  if (tokens) {
    // Revogar o refresh token invalida também os tokens de acesso dele.
    const secret = tokens.refresh_token_enc ?? tokens.access_token_enc;
    try {
      revoked = await revokeToken(
        deps.fetch,
        await decryptToken(String(secret), deps.env.encryptionKey),
      );
    } catch {
      revoked = false;
    }
  }
  await deps.db.from("agenda_sync_outbox").delete().eq("user_id", userId);
  // Cascata: tokens, agendas, estado, canais e histórico saem junto.
  await q(deps.db.from("google_calendar_connections").delete().eq("id", conn.id).select());
  await deps.db.from("google_oauth_pending").delete().eq("user_id", userId);
  return { revoked };
}
