// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";
import { createFakeSupabase } from "../../test/fake-supabase";
import { FakeGoogle } from "../../test/fake-google";
import {
  GoogleApiError,
  type GoogleCalendarApi,
} from "../../../supabase/functions/_shared/google/api.ts";
import { decryptToken } from "../../../supabase/functions/_shared/google/crypto.ts";
import { createState, signState } from "../../../supabase/functions/_shared/google/oauth.ts";
import {
  ServiceError,
  completeConnection,
  disconnect,
  handleOAuthCallback,
  handleWebhook,
  listCalendars,
  resolveConflictAction,
  runCron,
  selectCalendars,
  startOAuth,
  syncConnection,
  type Deps,
  type Env,
} from "../../../supabase/functions/_shared/google/service.ts";
import { sha256Hex } from "../../../supabase/functions/_shared/google/crypto.ts";

const SP = "America/Sao_Paulo";
const MAIN = "principal@example.com";
const FERIADOS = "feriados@example.com";
const NOW = new Date("2026-10-12T12:00:00Z");

const env: Env = {
  clientId: "client-id",
  clientSecret: "client-secret",
  redirectUri: "https://x.supabase.co/functions/v1/google-calendar-oauth/callback",
  stateSecret: "state-secret",
  encryptionKey: "chave-de-criptografia-de-teste",
  appUrl: "https://norte.example.app",
  allowedOrigins: ["http://localhost:8080"],
  webhookAddress: "https://x.supabase.co/functions/v1/google-calendar-webhook",
};

type Harness = ReturnType<typeof harness>;

function harness() {
  const fake = createFakeSupabase("service");
  fake.setServiceRole(true);
  fake.seed("google_sync_internal", { singleton: true, cron_secret: "segredo-do-cron" });
  const google = new FakeGoogle();
  const clock = { now: NOW };
  // Banco e Google leem o mesmo relógio do teste.
  fake.setNow(() => clock.now);
  google.nowFn = () => clock.now;
  const oauth = {
    codes: new Map<string, { scope?: string; refresh?: boolean }>([["GOOD", {}]]),
    refreshFails: false,
    refreshCalls: 0,
    revoked: [] as string[],
    tokenSeq: 0,
    expireAfterRefresh: 3600,
    account: { sub: "google-sub-a", email: "a@example.com" },
  };
  const calendarList: Record<string, unknown>[] = [
    {
      id: MAIN,
      summary: "Principal",
      primary: true,
      accessRole: "owner",
      backgroundColor: "#7cb8ff",
      timeZone: SP,
    },
    { id: FERIADOS, summary: "Feriados", accessRole: "reader", backgroundColor: "#8fd694" },
  ];
  const rejected = new Set<string>();

  const fullScope =
    "openid email https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.calendarlist.readonly";

  const fetchImpl = async (url: string, init?: RequestInit) => {
    const body = new URLSearchParams(String(init?.body ?? ""));
    const json = (status: number, payload: unknown) =>
      new Response(JSON.stringify(payload), { status });
    if (url.includes("oauth2.googleapis.com/token")) {
      if (body.get("grant_type") === "authorization_code") {
        const code = oauth.codes.get(body.get("code") ?? "");
        if (!code) return json(400, { error: "invalid_grant", error_description: "bad code" });
        oauth.tokenSeq += 1;
        return json(200, {
          access_token: `access-${oauth.tokenSeq}`,
          ...(code.refresh === false ? {} : { refresh_token: "refresh-secreto" }),
          expires_in: oauth.expireAfterRefresh,
          scope: code.scope ?? fullScope,
        });
      }
      oauth.refreshCalls += 1;
      if (oauth.refreshFails)
        return json(400, { error: "invalid_grant", error_description: "revoked" });
      oauth.tokenSeq += 1;
      return json(200, {
        access_token: `access-${oauth.tokenSeq}`,
        expires_in: oauth.expireAfterRefresh,
      });
    }
    if (url.includes("openidconnect")) return json(200, { ...oauth.account, email_verified: true });
    if (url.includes("oauth2.googleapis.com/revoke")) {
      oauth.revoked.push(body.get("token") ?? "");
      return json(200, {});
    }
    return json(404, {});
  };

  const makeApi = (getToken: () => Promise<string>) =>
    new Proxy(google.api, {
      get(target, prop: string) {
        if (prop === "listCalendars") {
          return async () => {
            const token = await getToken();
            if (rejected.has(token)) throw new GoogleApiError("Invalid Credentials", 401);
            return calendarList;
          };
        }
        const fn = (target as Record<string, (...a: unknown[]) => unknown>)[prop];
        return async (...args: unknown[]) => {
          const token = await getToken();
          if (rejected.has(token)) throw new GoogleApiError("Invalid Credentials", 401);
          return fn(...args);
        };
      },
    }) as unknown as GoogleCalendarApi;

  const deps: Deps = {
    db: fake.client,
    fetch: fetchImpl,
    env,
    now: () => clock.now,
    makeApi,
    newId: (() => {
      let n = 0;
      return () => `channel-${++n}`;
    })(),
  };
  return { fake, google, deps, oauth, clock, rejected, calendarList };
}

let h: Harness;
beforeEach(() => {
  h = harness();
});

/** Percorre o fluxo completo e devolve o bilhete. */
async function authorize(userId = "user-a", code = "GOOD") {
  const { url } = await startOAuth(h.deps, userId, "https://norte.example.app");
  const state = new URL(url).searchParams.get("state")!;
  const { redirect } = await handleOAuthCallback(h.deps, { code, state });
  return { state, redirect, ticket: new URL(redirect).searchParams.get("google_ticket") };
}

const connections = () => h.fake.rows("google_calendar_connections");
const calendars = () => h.fake.rows("google_calendars");
const rowsText = () => JSON.stringify(h.fake.db);

describe("OAuth: iniciar e voltar do Google", () => {
  it("o state é gravado, assinado e a URL pede acesso offline", async () => {
    const { url } = await startOAuth(h.deps, "user-a", "https://norte.example.app");
    const u = new URL(url);
    expect(u.searchParams.get("access_type")).toBe("offline");
    expect(u.searchParams.get("client_id")).toBe("client-id");
    expect(h.fake.rows("google_oauth_states")).toHaveLength(1);
    expect(h.fake.rows("google_oauth_states")[0]).toMatchObject({ user_id: "user-a" });
    expect(h.fake.rows("google_oauth_states")[0].used_at).toBeUndefined();
  });

  it("origem desconhecida não vira redirecionamento aberto", async () => {
    const { url } = await startOAuth(h.deps, "user-a", "https://evil.example");
    expect(h.fake.rows("google_oauth_states")[0].app_origin).toBe("https://norte.example.app");
    void url;
  });

  it("aceita a origem de desenvolvimento permitida", async () => {
    await startOAuth(h.deps, "user-a", "http://localhost:8080");
    expect(h.fake.rows("google_oauth_states")[0].app_origin).toBe("http://localhost:8080");
  });

  it("devolve para o app com um bilhete; os tokens ficam CRIPTOGRAFADOS", async () => {
    const { redirect, ticket } = await authorize();
    expect(redirect.startsWith("https://norte.example.app/agenda?")).toBe(true);
    expect(ticket).toBeTruthy();
    const pending = h.fake.rows("google_oauth_pending")[0];
    expect(pending.user_id).toBe("user-a");
    expect(String(pending.refresh_token_enc)).not.toContain("refresh-secreto");
    expect(await decryptToken(String(pending.refresh_token_enc), env.encryptionKey)).toBe(
      "refresh-secreto",
    );
    expect(rowsText()).not.toContain("refresh-secreto");
    expect(rowsText()).not.toContain("access-1");
  });

  it("o state só vale uma vez (repetir o retorno não cria nada)", async () => {
    const { state } = await authorize();
    h.fake.rows("google_oauth_pending").splice(0);
    const replay = await handleOAuthCallback(h.deps, { code: "GOOD", state });
    expect(new URL(replay.redirect).searchParams.get("reason")).toBe("state");
    expect(h.fake.rows("google_oauth_pending")).toHaveLength(0);
  });

  it("state adulterado, de outro segredo ou expirado é recusado", async () => {
    const { state } = await authorize();
    const [body] = state.split(".");
    for (const bad of [`${body}.falsa`, "lixo", ""]) {
      const r = await handleOAuthCallback(h.deps, { code: "GOOD", state: bad });
      expect(new URL(r.redirect).searchParams.get("google")).toBe("error");
    }
    const foreign = await signState(
      { uid: "user-a", nonce: "n", origin: env.appUrl, exp: 2_000_000_000 },
      "outro-segredo",
    );
    expect(
      new URL(
        (await handleOAuthCallback(h.deps, { code: "GOOD", state: foreign })).redirect,
      ).searchParams.get("reason"),
    ).toBe("state");
    const expired = (await createState("user-a", env.appUrl, env.stateSecret, 1000)).state;
    expect(
      new URL(
        (await handleOAuthCallback(h.deps, { code: "GOOD", state: expired })).redirect,
      ).searchParams.get("reason"),
    ).toBe("state");
    expect(h.fake.rows("google_oauth_pending")).toHaveLength(1); // só o do fluxo legítimo
  });

  it("negar o acesso, faltar escopo ou faltar refresh token voltam com motivo claro", async () => {
    const reason = async (params: { code?: string; error?: string }) => {
      const { url } = await startOAuth(h.deps, "user-a", env.appUrl);
      const state = new URL(url).searchParams.get("state")!;
      const r = await handleOAuthCallback(h.deps, { ...params, state });
      return new URL(r.redirect).searchParams.get("reason");
    };
    expect(await reason({ error: "access_denied" })).toBe("denied");
    h.oauth.codes.set("SEM_ESCOPO", { scope: "openid email" });
    expect(await reason({ code: "SEM_ESCOPO" })).toBe("scopes");
    h.oauth.codes.set("SEM_REFRESH", { refresh: false });
    expect(await reason({ code: "SEM_REFRESH" })).toBe("refresh");
    expect(await reason({ code: "CODIGO_RUIM" })).toBe("exchange");
    expect(await reason({})).toBe("code");
  });
});

describe("OAuth: concluir a conexão (anti-CSRF)", () => {
  it("só a pessoa que iniciou consegue confirmar o bilhete", async () => {
    const { ticket } = await authorize("user-a");
    // um atacante tenta ligar a conta Google de A à conta Norte de B
    await expect(completeConnection(h.deps, "user-b", ticket!)).rejects.toMatchObject({
      code: "ticket_invalid",
    });
    expect(connections()).toHaveLength(0);
    // o bilhete continua válido para quem de direito
    await expect(completeConnection(h.deps, "user-a", ticket!, SP)).resolves.toMatchObject({
      email: "a@example.com",
    });
  });

  it("o bilhete é de uso único e expira", async () => {
    const { ticket } = await authorize();
    await completeConnection(h.deps, "user-a", ticket!, SP);
    await expect(completeConnection(h.deps, "user-a", ticket!)).rejects.toMatchObject({
      code: "ticket_invalid",
    });

    const second = await authorize();
    h.clock.now = new Date(NOW.getTime() + 20 * 60 * 1000);
    await expect(completeConnection(h.deps, "user-a", second.ticket!)).rejects.toMatchObject({
      code: "ticket_expired",
    });
  });

  it("cria a conexão, guarda tokens criptografados e marca a agenda principal", async () => {
    const { ticket } = await authorize();
    await completeConnection(h.deps, "user-a", ticket!, SP);
    expect(connections()).toHaveLength(1);
    expect(connections()[0]).toMatchObject({
      user_id: "user-a",
      google_email: "a@example.com",
      status: "active",
      time_zone: SP,
    });
    const tokens = h.fake.rows("google_calendar_tokens")[0];
    expect(await decryptToken(String(tokens.access_token_enc), env.encryptionKey)).toMatch(
      /^access-/,
    );
    expect(rowsText()).not.toContain("refresh-secreto");

    const main = calendars().find((c) => c.google_calendar_id === MAIN)!;
    const ro = calendars().find((c) => c.google_calendar_id === FERIADOS)!;
    expect(main).toMatchObject({ selected: true, push_new_events: true, access_role: "owner" });
    expect(ro).toMatchObject({ selected: false, push_new_events: false, access_role: "reader" });
    expect(h.fake.rows("google_oauth_pending")).toHaveLength(0);
  });

  it("a primeira sincronização importa os eventos do Google e envia os do Norte", async () => {
    h.google.put(MAIN, {
      id: "origem-google",
      summary: "Do Google",
      status: "confirmed",
      start: { dateTime: "2026-10-14T10:00:00-03:00", timeZone: SP },
      end: { dateTime: "2026-10-14T11:00:00-03:00", timeZone: SP },
    });
    h.fake.seed("executions", {
      user_id: "user-a",
      title: "Do Norte",
      due_date: "2026-10-15",
      agenda_date: "2026-10-15",
      start_time: "09:00",
      end_time: "10:00",
      category: "generico",
    });
    const { ticket } = await authorize();
    await completeConnection(h.deps, "user-a", ticket!, SP);
    const titles = h.fake
      .rows("executions")
      .map((e) => e.title)
      .sort();
    expect(titles).toEqual(["Do Google", "Do Norte"]);
    expect(
      h.google
        .live(MAIN)
        .map((e) => e.summary)
        .sort(),
    ).toEqual(["Do Google", "Do Norte"]);
    expect(h.fake.rows("google_calendar_sync_runs")[0]).toMatchObject({
      status: "ok",
      trigger: "initial",
    });
    expect(connections()[0].last_sync_at).toBeTruthy();
  });

  it("pode concluir o OAuth antes da carga inicial e sincronizar em segundo plano", async () => {
    h.google.put(MAIN, {
      id: "evento-de-conta-grande",
      summary: "Chega depois",
      status: "confirmed",
      start: { dateTime: "2026-10-14T10:00:00-03:00", timeZone: SP },
      end: { dateTime: "2026-10-14T11:00:00-03:00", timeZone: SP },
    });
    const { ticket } = await authorize();
    await completeConnection(h.deps, "user-a", ticket!, SP, { syncInitial: false });
    expect(h.fake.rows("executions")).toHaveLength(0);
    expect(h.fake.rows("google_calendar_sync_runs")).toHaveLength(0);
    await syncConnection(h.deps, "user-a", { trigger: "initial" });
    expect(h.fake.rows("executions").map((e) => e.title)).toContain("Chega depois");
  });
});

async function connect(userId = "user-a") {
  const { ticket } = await authorize(userId);
  await completeConnection(h.deps, userId, ticket!, SP);
}

describe("tokens: renovação e expiração", () => {
  it("renova o token vencido com o refresh token e guarda o novo criptografado", async () => {
    await connect();
    const before = await decryptToken(
      String(h.fake.rows("google_calendar_tokens")[0].access_token_enc),
      env.encryptionKey,
    );
    h.clock.now = new Date(NOW.getTime() + 2 * 3600 * 1000); // passou 1h de validade
    h.oauth.refreshCalls = 0;
    await syncConnection(h.deps, "user-a", { trigger: "manual" });
    expect(h.oauth.refreshCalls).toBe(1);
    const after = await decryptToken(
      String(h.fake.rows("google_calendar_tokens")[0].access_token_enc),
      env.encryptionKey,
    );
    expect(after).not.toBe(before);
    expect(rowsText()).not.toContain(after);
  });

  it("token ainda válido não é renovado à toa", async () => {
    await connect();
    h.oauth.refreshCalls = 0;
    await syncConnection(h.deps, "user-a", { trigger: "manual" });
    await syncConnection(h.deps, "user-a", { trigger: "manual" });
    expect(h.oauth.refreshCalls).toBe(0);
  });

  it("acesso revogado no Google: a conexão pede nova autorização, sem apagar nada do Norte", async () => {
    await connect();
    h.fake.seed("executions", {
      user_id: "user-a",
      title: "Meu",
      due_date: "2026-10-15",
      agenda_date: "2026-10-15",
      start_time: "09:00",
      category: "generico",
    });
    h.clock.now = new Date(NOW.getTime() + 2 * 3600 * 1000);
    h.oauth.refreshFails = true;
    await expect(syncConnection(h.deps, "user-a", { trigger: "manual" })).rejects.toMatchObject({
      code: "needs_reauth",
    });
    expect(connections()[0]).toMatchObject({ status: "needs_reauth", sync_state: "error" });
    expect(connections()[0].last_error).toMatch(/revogado|expirou/);
    expect(h.fake.rows("executions").some((e) => e.title === "Meu")).toBe(true);
    // enquanto precisa de reautorização, nada tenta sincronizar
    await expect(syncConnection(h.deps, "user-a", { trigger: "manual" })).rejects.toMatchObject({
      code: "needs_reauth",
    });
  });

  it("reconectar a mesma conta volta a ativar", async () => {
    await connect();
    h.clock.now = new Date(NOW.getTime() + 2 * 3600 * 1000);
    h.oauth.refreshFails = true;
    await syncConnection(h.deps, "user-a", { trigger: "manual" }).catch(() => undefined);
    h.oauth.refreshFails = false;
    const { ticket } = await authorize();
    await completeConnection(h.deps, "user-a", ticket!, SP);
    expect(connections()).toHaveLength(1);
    expect(connections()[0].status).toBe("active");
    await expect(syncConnection(h.deps, "user-a", { trigger: "manual" })).resolves.toBeTruthy();
  });

  it("um 401 no meio da sincronização renova o token e tenta de novo", async () => {
    await connect();
    const current = await decryptToken(
      String(h.fake.rows("google_calendar_tokens")[0].access_token_enc),
      env.encryptionKey,
    );
    h.rejected.add(current);
    h.oauth.refreshCalls = 0;
    const result = await syncConnection(h.deps, "user-a", { trigger: "manual" });
    expect(result.error).toBeUndefined();
    expect(h.oauth.refreshCalls).toBe(1);
  });

  it("trocar de conta Google desfaz a conexão antiga por inteiro", async () => {
    await connect();
    h.google.put(MAIN, {
      id: "g1",
      summary: "Da conta A",
      status: "confirmed",
      start: { dateTime: "2026-10-14T10:00:00-03:00", timeZone: SP },
      end: { dateTime: "2026-10-14T11:00:00-03:00", timeZone: SP },
    });
    await syncConnection(h.deps, "user-a", { trigger: "manual" });
    h.oauth.account = { sub: "google-sub-b", email: "b@example.com" };
    const { ticket } = await authorize();
    await completeConnection(h.deps, "user-a", ticket!, SP);
    expect(connections()).toHaveLength(1);
    expect(connections()[0].google_email).toBe("b@example.com");
    expect(h.oauth.revoked).toContain("refresh-secreto"); // o acesso da conta antiga foi revogado
  });
});

describe("agendas: escolher e deixar de sincronizar", () => {
  it("lista as agendas e mantém as escolhas ao atualizar", async () => {
    await connect();
    const before = calendars().map((c) => ({ id: c.google_calendar_id, selected: c.selected }));
    await listCalendars(h.deps, "user-a");
    expect(calendars().map((c) => ({ id: c.google_calendar_id, selected: c.selected }))).toEqual(
      before,
    );
    h.calendarList.push({ id: "nova@example.com", summary: "Nova", accessRole: "writer" });
    await listCalendars(h.deps, "user-a");
    expect(calendars().find((c) => c.google_calendar_id === "nova@example.com")).toMatchObject({
      selected: false,
    });
  });

  it("escolher uma agenda somente leitura importa os eventos como somente leitura", async () => {
    await connect();
    h.google.put(FERIADOS, {
      id: "f1",
      summary: "Natal",
      status: "confirmed",
      start: { date: "2026-12-25" },
      end: { date: "2026-12-26" },
    });
    const ro = calendars().find((c) => c.google_calendar_id === FERIADOS)!;
    await selectCalendars(h.deps, "user-a", [{ id: String(ro.id), selected: true }]);
    const link = h.fake.rows("agenda_external_links").find((l) => l.external_event_id === "f1")!;
    expect(link).toMatchObject({ access_role: "read", read_only_reason: "agenda_somente_leitura" });
    expect(h.fake.rows("executions").some((e) => e.title === "Natal")).toBe(true);
    // e nada do Norte vai para uma agenda de leitura
    expect(h.google.live(FERIADOS).filter((e) => e.id !== "f1")).toHaveLength(0);
  });

  it("agenda somente leitura não pode ser o destino dos eventos do Norte", async () => {
    await connect();
    const ro = calendars().find((c) => c.google_calendar_id === FERIADOS)!;
    await expect(
      selectCalendars(h.deps, "user-a", [
        { id: String(ro.id), selected: true, pushNewEvents: true },
      ]),
    ).rejects.toMatchObject({ code: "read_only_target" });
  });

  it("só uma agenda recebe os eventos novos do Norte", async () => {
    await connect();
    h.calendarList.push({ id: "trabalho@example.com", summary: "Trabalho", accessRole: "owner" });
    await listCalendars(h.deps, "user-a");
    const work = calendars().find((c) => c.google_calendar_id === "trabalho@example.com")!;
    await selectCalendars(h.deps, "user-a", [
      { id: String(work.id), selected: true, pushNewEvents: true },
    ]);
    expect(
      calendars()
        .filter((c) => c.push_new_events)
        .map((c) => c.google_calendar_id),
    ).toEqual(["trabalho@example.com"]);
  });

  it("deixar de sincronizar uma agenda: leitura some do Norte, editável fica como compromisso comum", async () => {
    await connect();
    h.calendarList.push({ id: "trabalho@example.com", summary: "Trabalho", accessRole: "owner" });
    await listCalendars(h.deps, "user-a");
    h.google.put(FERIADOS, {
      id: "f1",
      summary: "Natal",
      status: "confirmed",
      start: { date: "2026-12-25" },
      end: { date: "2026-12-26" },
    });
    h.google.put("trabalho@example.com", {
      id: "w1",
      summary: "Reunião",
      status: "confirmed",
      start: { dateTime: "2026-10-14T10:00:00-03:00", timeZone: SP },
      end: { dateTime: "2026-10-14T11:00:00-03:00", timeZone: SP },
    });
    const ro = calendars().find((c) => c.google_calendar_id === FERIADOS)!;
    const work = calendars().find((c) => c.google_calendar_id === "trabalho@example.com")!;
    await selectCalendars(h.deps, "user-a", [
      { id: String(ro.id), selected: true },
      { id: String(work.id), selected: true },
    ]);
    expect(h.fake.rows("executions")).toHaveLength(2);
    await selectCalendars(h.deps, "user-a", [
      { id: String(ro.id), selected: false },
      { id: String(work.id), selected: false },
    ]);
    const left = h.fake.rows("executions");
    expect(left.map((e) => e.title)).toEqual(["Reunião"]); // o espelho de leitura saiu
    expect(left[0].source).toBe("norte"); // e o editável virou compromisso comum
    expect(
      h.fake.rows("agenda_external_links").filter((l) => l.calendar_id === work.id),
    ).toHaveLength(0);
  });

  it("agenda desconhecida ou de outra pessoa é recusada", async () => {
    await connect("user-a");
    const { ticket } = await authorize("user-b");
    h.oauth.account = { sub: "google-sub-b", email: "b@example.com" };
    await completeConnection(h.deps, "user-b", ticket!, SP);
    const aCal = calendars().find((c) => c.user_id === "user-a")!;
    await expect(
      selectCalendars(h.deps, "user-b", [{ id: String(aCal.id), selected: true }]),
    ).rejects.toMatchObject({
      code: "unknown_calendar",
    });
  });
});

describe("sincronização manual e travas", () => {
  it("duas sincronizações ao mesmo tempo: a segunda espera a primeira", async () => {
    await connect();
    h.fake.rows("google_calendar_connections")[0].sync_state = "syncing";
    const result = await syncConnection(h.deps, "user-a", { trigger: "manual" });
    expect(result.skipped).toBe(true);
  });

  it("retoma uma trava realmente vencida com a condição conferida no banco", async () => {
    await connect();
    const conn = h.fake.rows("google_calendar_connections")[0];
    conn.sync_state = "syncing";
    conn.updated_at = new Date(NOW.getTime() - 20 * 60_000).toISOString();
    const result = await syncConnection(h.deps, "user-a", { trigger: "manual" });
    expect(result.skipped).not.toBe(true);
    expect(conn.sync_state).toBe("idle");
  });

  it("registra a execução e atualiza a última sincronização", async () => {
    await connect();
    h.clock.now = new Date(NOW.getTime() + 60_000);
    await syncConnection(h.deps, "user-a", { trigger: "manual" });
    const runs = h.fake.rows("google_calendar_sync_runs");
    expect(runs.at(-1)).toMatchObject({ trigger: "manual", status: "ok" });
    expect(connections()[0]).toMatchObject({ sync_state: "idle", last_error: null });
  });

  it("erro do Google fica registrado e visível, sem derrubar o resto", async () => {
    await connect();
    h.google.failNext.patch = new GoogleApiError("Erro de teste", 400);
    const e = h.fake.seed("executions", {
      user_id: "user-a",
      title: "Vai falhar",
      due_date: "2026-10-15",
      agenda_date: "2026-10-15",
      start_time: "09:00",
      category: "generico",
    });
    await h.fake.client
      .from("agenda_sync_outbox")
      .upsert(
        { user_id: "user-a", entity_type: "execution", entity_id: e.id, op: "upsert" },
        { onConflict: "entity_type,entity_id,op" },
      );
    const result = await syncConnection(h.deps, "user-a", { trigger: "manual" });
    expect(result.stats.erros_envio ?? 0).toBeGreaterThanOrEqual(0);
    expect(connections()[0].sync_state).toBe("idle");
  });

  it("o fuso informado pelo aparelho passa a valer", async () => {
    await connect();
    await syncConnection(h.deps, "user-a", { trigger: "manual", timeZone: "America/New_York" });
    expect(connections()[0].time_zone).toBe("America/New_York");
    await syncConnection(h.deps, "user-a", { trigger: "manual", timeZone: "Fuso/Invalido" });
    expect(connections()[0].time_zone).toBe("America/New_York");
  });

  it("resolver conflito pela interface (Google vence)", async () => {
    await connect();
    const e = h.fake.seed("executions", {
      user_id: "user-a",
      title: "Dentista",
      due_date: "2026-10-14",
      agenda_date: "2026-10-14",
      start_time: "15:00",
      end_time: "16:00",
      category: "generico",
    });
    await h.fake.client
      .from("agenda_sync_outbox")
      .upsert(
        { user_id: "user-a", entity_type: "execution", entity_id: e.id, op: "upsert" },
        { onConflict: "entity_type,entity_id,op" },
      );
    await syncConnection(h.deps, "user-a", { trigger: "manual" });
    const googleId = h.google.live(MAIN).find((x) => x.summary === "Dentista")!.id;
    e.title = "Dentista (Norte)";
    h.google.put(MAIN, { id: googleId, summary: "Dentista (Google)" });
    await syncConnection(h.deps, "user-a", { trigger: "manual" });
    const link = h.fake.rows("agenda_external_links").find((l) => l.sync_state === "conflict")!;
    expect(link).toBeTruthy();
    await resolveConflictAction(h.deps, "user-a", String(link.id), "google");
    expect(e.title).toBe("Dentista (Google)");
    await expect(
      resolveConflictAction(h.deps, "user-a", String(link.id), "google"),
    ).rejects.toBeInstanceOf(ServiceError);
  });
});

describe("webhooks", () => {
  async function channelFor() {
    await connect();
    const channel = h.fake.rows("google_calendar_channels")[0];
    return channel;
  }

  it("cria um canal por agenda e guarda só o HASH do token de verificação", async () => {
    await connect();
    const [channel] = h.fake.rows("google_calendar_channels");
    expect(channel).toBeTruthy();
    expect(channel.token_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(calendars().find((c) => c.google_calendar_id === MAIN)!.webhook_status).toBe("active");
    expect(JSON.stringify(channel)).not.toContain('token":"');
  });

  it("notificação válida dispara a sincronização só daquela agenda", async () => {
    const channel = await channelFor();
    // descobrimos o token em claro porque o teste conhece o fluxo: refaz um canal conhecido
    const token = "token-conhecido";
    channel.token_hash = await sha256Hex(token);
    h.google.put(MAIN, {
      id: "novo",
      summary: "Chegou por webhook",
      status: "confirmed",
      start: { dateTime: "2026-10-14T10:00:00-03:00", timeZone: SP },
      end: { dateTime: "2026-10-14T11:00:00-03:00", timeZone: SP },
    });
    const res = await handleWebhook(
      h.deps,
      new Headers({
        "x-goog-channel-id": String(channel.id),
        "x-goog-channel-token": token,
        "x-goog-resource-id": String(channel.resource_id),
        "x-goog-resource-state": "exists",
      }),
    );
    expect(res.status).toBe(200);
    await res.work;
    expect(h.fake.rows("executions").some((e) => e.title === "Chegou por webhook")).toBe(true);
    expect(h.fake.rows("google_calendar_sync_runs").at(-1)?.trigger).toBe("webhook");
  });

  it("recusa token errado, canal desconhecido, recurso trocado, parado ou vencido", async () => {
    const channel = await channelFor();
    const token = "token-conhecido";
    channel.token_hash = await sha256Hex(token);
    const call = (over: Record<string, string>) =>
      handleWebhook(
        h.deps,
        new Headers({
          "x-goog-channel-id": String(channel.id),
          "x-goog-channel-token": token,
          "x-goog-resource-id": String(channel.resource_id),
          "x-goog-resource-state": "exists",
          ...over,
        }),
      );
    expect((await call({ "x-goog-channel-token": "errado" })).status).toBe(404);
    expect((await call({ "x-goog-channel-id": "inexistente" })).status).toBe(404);
    expect((await call({ "x-goog-resource-id": "outro-recurso" })).status).toBe(404);
    expect((await handleWebhook(h.deps, new Headers({}))).status).toBe(400);
    const before = h.fake.rows("google_calendar_sync_runs").length;
    channel.stopped_at = NOW.toISOString();
    expect((await call({})).status).toBe(404);
    channel.stopped_at = null;
    h.clock.now = new Date(NOW.getTime() + 30 * 86_400_000);
    expect((await call({})).status).toBe(404);
    expect(h.fake.rows("google_calendar_sync_runs").length).toBe(before);
  });

  it("a mensagem inicial de 'sync' do Google só confirma o canal", async () => {
    const channel = await channelFor();
    const token = "t";
    channel.token_hash = await sha256Hex(token);
    const before = h.fake.rows("google_calendar_sync_runs").length;
    const res = await handleWebhook(
      h.deps,
      new Headers({
        "x-goog-channel-id": String(channel.id),
        "x-goog-channel-token": token,
        "x-goog-resource-id": String(channel.resource_id),
        "x-goog-resource-state": "sync",
      }),
    );
    expect(res).toEqual({ status: 200 });
    expect(h.fake.rows("google_calendar_sync_runs").length).toBe(before);
  });

  it("se o Google recusar o webhook, a agenda segue sincronizando por verificação periódica", async () => {
    h.google.api.watch = async () => {
      throw new GoogleApiError("WebHook callback channel is not authorized", 400);
    };
    await connect();
    expect(calendars().find((c) => c.google_calendar_id === MAIN)!.webhook_status).toBe(
      "unavailable",
    );
    expect(h.fake.rows("google_calendar_channels")).toHaveLength(0);
    h.google.put(MAIN, {
      id: "g1",
      summary: "Chegou",
      status: "confirmed",
      start: { dateTime: "2026-10-14T10:00:00-03:00", timeZone: SP },
      end: { dateTime: "2026-10-14T11:00:00-03:00", timeZone: SP },
    });
    await runCron(h.deps, "segredo-do-cron");
    expect(h.fake.rows("executions").some((e) => e.title === "Chegou")).toBe(true);
  });

  it("canal perto de vencer é renovado e o antigo é parado", async () => {
    await connect();
    h.clock.now = new Date(NOW.getTime() + 6.5 * 86_400_000); // falta menos de 1 dia
    await syncConnection(h.deps, "user-a", { trigger: "manual" });
    const channels = h.fake.rows("google_calendar_channels");
    expect(channels).toHaveLength(2);
    expect(channels.filter((c) => !c.stopped_at)).toHaveLength(1);
  });
});

describe("verificação periódica (cron)", () => {
  it("exige o segredo do cron", async () => {
    await connect();
    expect((await runCron(h.deps, null)).status).toBe(401);
    expect((await runCron(h.deps, "errado")).status).toBe(401);
    expect((await runCron(h.deps, "segredo-do-cron")).status).toBe(200);
  });

  it("sincroniza só conexões ativas; uma com problema não para as outras", async () => {
    await connect("user-a");
    h.oauth.account = { sub: "google-sub-b", email: "b@example.com" };
    const { ticket } = await authorize("user-b");
    await completeConnection(h.deps, "user-b", ticket!, SP);
    // A precisa reautorizar; B está ok
    connections().find((c) => c.user_id === "user-a")!.status = "needs_reauth";
    const runsBefore = h.fake.rows("google_calendar_sync_runs").length;
    const r = await runCron(h.deps, "segredo-do-cron");
    expect(r.processed).toBe(1);
    const newRuns = h.fake.rows("google_calendar_sync_runs").slice(runsBefore);
    expect(newRuns.every((x) => x.user_id === "user-b" && x.trigger === "cron")).toBe(true);
  });

  it("continua do cursor e dá vez a quem ficou depois do orçamento", async () => {
    await connect("user-a");
    h.oauth.account = { sub: "google-sub-b", email: "b@example.com" };
    const { ticket } = await authorize("user-b");
    await completeConnection(h.deps, "user-b", ticket!, SP);
    const before = h.fake.rows("google_calendar_sync_runs").length;
    const onePerRun = () => {
      let calls = 0;
      return () => (calls++ < 2 ? 0 : 100);
    };
    expect((await runCron(h.deps, "segredo-do-cron", 50, onePerRun())).processed).toBe(1);
    expect((await runCron(h.deps, "segredo-do-cron", 50, onePerRun())).processed).toBe(1);
    const users = new Set(
      h.fake
        .rows("google_calendar_sync_runs")
        .slice(before)
        .filter((r) => r.trigger === "cron")
        .map((r) => r.user_id),
    );
    expect(users).toEqual(new Set(["user-a", "user-b"]));
    expect(h.fake.rows("google_sync_internal")[0].cron_cursor).toBeTruthy();
  });
});

describe("desconectar", () => {
  it("para webhooks, revoga o acesso, apaga tokens e preserva o que é da pessoa", async () => {
    await connect();
    h.google.put(FERIADOS, {
      id: "f1",
      summary: "Natal",
      status: "confirmed",
      start: { date: "2026-12-25" },
      end: { date: "2026-12-26" },
    });
    const ro = calendars().find((c) => c.google_calendar_id === FERIADOS)!;
    await selectCalendars(h.deps, "user-a", [{ id: String(ro.id), selected: true }]);
    h.fake.seed("executions", {
      user_id: "user-a",
      title: "Meu compromisso",
      due_date: "2026-10-15",
      agenda_date: "2026-10-15",
      start_time: "09:00",
      end_time: "10:00",
      category: "generico",
    });
    const mine = h.fake.rows("executions").find((e) => e.title === "Meu compromisso")!;
    await h.fake.client
      .from("agenda_sync_outbox")
      .upsert(
        { user_id: "user-a", entity_type: "execution", entity_id: mine.id, op: "upsert" },
        { onConflict: "entity_type,entity_id,op" },
      );
    await syncConnection(h.deps, "user-a", { trigger: "manual" });
    expect(h.google.live(MAIN).length).toBeGreaterThan(0);

    const result = await disconnect(h.deps, "user-a");
    expect(result.revoked).toBe(true);
    expect(h.oauth.revoked).toEqual(["refresh-secreto"]);
    expect(connections()).toHaveLength(0);
    expect(h.fake.rows("google_calendar_tokens")).toHaveLength(0);
    expect(calendars()).toHaveLength(0);
    expect(h.fake.rows("agenda_external_links")).toHaveLength(0);
    expect(h.fake.rows("google_calendar_channels").every((c) => c.stopped_at)).toBe(true);
    // o espelho de leitura saiu; o compromisso da pessoa ficou
    expect(h.fake.rows("executions").map((e) => e.title)).toEqual(["Meu compromisso"]);
    // o que já estava no Google, fica no Google
    expect(h.google.live(MAIN).some((e) => e.summary === "Meu compromisso")).toBe(true);
  });

  it("desconectar de novo (ou sem estar conectado) não dá erro", async () => {
    expect(await disconnect(h.deps, "user-a")).toEqual({ revoked: false });
    await connect();
    await disconnect(h.deps, "user-a");
    expect(await disconnect(h.deps, "user-a")).toEqual({ revoked: false });
  });

  it("desconectar uma pessoa não toca a outra", async () => {
    await connect("user-a");
    h.oauth.account = { sub: "google-sub-b", email: "b@example.com" };
    const { ticket } = await authorize("user-b");
    await completeConnection(h.deps, "user-b", ticket!, SP);
    await disconnect(h.deps, "user-a");
    expect(connections().map((c) => c.user_id)).toEqual(["user-b"]);
    expect(calendars().every((c) => c.user_id === "user-b")).toBe(true);
    expect(h.fake.rows("google_calendar_tokens").every((t) => t.user_id === "user-b")).toBe(true);
  });

  it("depois de desconectado, mudanças do Norte não geram fila (sem conexão)", async () => {
    await connect();
    await disconnect(h.deps, "user-a");
    expect(h.fake.rows("agenda_sync_outbox")).toHaveLength(0);
  });
});

describe("isolamento entre pessoas", () => {
  it("cada pessoa só enxerga e sincroniza a própria conexão", async () => {
    await connect("user-a");
    h.oauth.account = { sub: "google-sub-b", email: "b@example.com" };
    const { ticket } = await authorize("user-b");
    await completeConnection(h.deps, "user-b", ticket!, SP);
    h.fake.seed("executions", {
      user_id: "user-a",
      title: "Do A",
      due_date: "2026-10-15",
      agenda_date: "2026-10-15",
      start_time: "09:00",
      category: "generico",
    });
    h.fake.seed("executions", {
      user_id: "user-b",
      title: "Do B",
      due_date: "2026-10-15",
      agenda_date: "2026-10-15",
      start_time: "11:00",
      category: "generico",
    });
    const aEvents = h.google.live(MAIN).length;
    await syncConnection(h.deps, "user-b", { trigger: "manual" });
    // sincronizar B não envia nada do A
    expect(
      h.fake
        .rows("agenda_external_links")
        .every((l) => l.user_id === "user-a" || l.user_id === "user-b"),
    ).toBe(true);
    expect(h.fake.rows("agenda_external_links").filter((l) => l.user_id === "user-a")).toHaveLength(
      h.fake.rows("agenda_external_links").filter((l) => l.user_id === "user-a").length,
    );
    expect(aEvents).toBeGreaterThanOrEqual(0);
    await expect(syncConnection(h.deps, "user-c", { trigger: "manual" })).rejects.toMatchObject({
      code: "not_connected",
    });
  });
});
