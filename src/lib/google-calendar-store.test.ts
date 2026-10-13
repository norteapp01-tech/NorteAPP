import { beforeEach, describe, expect, it, vi } from "vitest";
import type { createFakeSupabase } from "../test/fake-supabase";

type Fake = ReturnType<typeof createFakeSupabase>;
const invoke = vi.fn();

vi.mock("./supabase/client", async () => {
  const { createFakeSupabase } = await import("../test/fake-supabase");
  const fake = createFakeSupabase("user-a");
  (globalThis as unknown as { __fake: Fake }).__fake = fake;
  return {
    supabase: Object.assign(fake.client, {
      functions: { invoke: (...a: unknown[]) => invoke(...a) },
    }),
    ensureSession: async () => fake.userId,
    useSupabaseUserId: () => fake.userId,
  };
});

import {
  GoogleActionError,
  completeGoogleConnect,
  disconnectGoogle,
  fetchGoogleState,
  googleUiState,
  resolveGoogleConflict,
  selectGoogleCalendars,
  startGoogleConnect,
  syncGoogleNow,
  type GoogleState,
} from "./google-calendar-store";

const fake = (globalThis as unknown as { __fake: Fake }).__fake;

beforeEach(() => {
  fake.reset();
  fake.setUser("user-a");
  invoke.mockReset();
});

const seedConnection = (user = "user-a", extra: Record<string, unknown> = {}) =>
  fake.seed("google_calendar_connections", {
    user_id: user,
    google_account_id: `sub-${user}`,
    google_email: `${user}@example.com`,
    ...extra,
  });

describe("estado lido pelo app (só leitura, isolado por pessoa)", () => {
  it("sem conexão: tudo vazio", async () => {
    const state = await fetchGoogleState();
    expect(state.connection).toBeNull();
    expect(state.calendars).toEqual([]);
  });

  it("devolve conta, agendas, vínculos e conflitos — sem nenhum token", async () => {
    const conn = seedConnection("user-a", { last_sync_at: "2026-10-12T12:00:00Z" });
    const cal = fake.seed("google_calendars", {
      connection_id: conn.id,
      user_id: "user-a",
      google_calendar_id: "a@x",
      summary: "Principal",
      background_color: "#7cb8ff",
      access_role: "owner",
      is_primary: true,
      selected: true,
      push_new_events: true,
    });
    fake.seed("google_calendar_tokens", {
      connection_id: conn.id,
      user_id: "user-a",
      access_token_enc: "v1.x.y",
      refresh_token_enc: "v1.z.w",
    });
    fake.seed("agenda_external_links", {
      user_id: "user-a",
      execution_id: "e1",
      calendar_id: cal.id,
      external_event_id: "g1",
      access_role: "write",
      sync_state: "conflict",
      conflict_at: "2026-10-12T12:00:00Z",
      remote_snapshot: {
        title: "No Google",
        start: "2026-10-14 10:00",
        end: "2026-10-14 11:00",
        allDay: false,
      },
      local_snapshot: {
        title: "No Norte",
        start: "2026-10-14 09:00",
        end: "2026-10-14 10:00",
        allDay: false,
      },
    });
    const state = await fetchGoogleState();
    expect(state.connection).toMatchObject({ email: "user-a@example.com", status: "active" });
    expect(state.calendars[0]).toMatchObject({
      summary: "Principal",
      role: "owner",
      pushNewEvents: true,
    });
    expect(state.links).toHaveLength(1);
    expect(state.conflicts[0]).toMatchObject({ title: "No Norte", remoteDeleted: false });
    expect(JSON.stringify(state)).not.toContain("v1.x.y");
    expect(JSON.stringify(state)).not.toContain("refresh");
  });

  it("uma pessoa não enxerga a conexão, as agendas nem os conflitos da outra", async () => {
    const conn = seedConnection("user-b");
    fake.seed("google_calendars", {
      connection_id: conn.id,
      user_id: "user-b",
      google_calendar_id: "b@x",
      summary: "Do B",
      access_role: "owner",
    });
    fake.seed("agenda_external_links", {
      user_id: "user-b",
      execution_id: "e9",
      external_event_id: "g9",
      sync_state: "conflict",
    });
    const state = await fetchGoogleState();
    expect(state).toMatchObject({ connection: null, calendars: [], links: [], conflicts: [] });
  });

  it("conflito de evento apagado no Google vem marcado", async () => {
    const conn = seedConnection();
    fake.seed("agenda_external_links", {
      user_id: "user-a",
      execution_id: "e1",
      connection_id: conn.id,
      external_event_id: "g1",
      sync_state: "conflict",
      remote_deleted: true,
      remote_snapshot: { deleted: true },
      local_snapshot: {
        title: "Editado",
        start: "2026-10-14 09:00",
        end: "2026-10-14 10:00",
        allDay: false,
      },
    });
    const state = await fetchGoogleState();
    expect(state.conflicts[0]).toMatchObject({ remoteDeleted: true, title: "Editado" });
  });
});

describe("estados da interface", () => {
  const base: GoogleState = { connection: null, calendars: [], links: [], conflicts: [] };
  const conn = (over: Partial<NonNullable<GoogleState["connection"]>>) => ({
    ...base,
    connection: {
      id: "c",
      email: "a@x",
      status: "active" as const,
      syncState: "idle" as const,
      pushRoutines: false,
      timeZone: "America/Sao_Paulo",
      ...over,
    },
  });
  it("desconectado, conectando, conectado, sincronizando, reconexão e erro", () => {
    expect(googleUiState(base, false)).toBe("disconnected");
    expect(googleUiState(base, true)).toBe("connecting");
    expect(googleUiState(conn({}), false)).toBe("connected");
    expect(googleUiState(conn({ syncState: "syncing" }), false)).toBe("syncing");
    expect(googleUiState(conn({ status: "needs_reauth" }), false)).toBe("needs_reauth");
    expect(googleUiState(conn({ status: "revoked" }), false)).toBe("needs_reauth");
    expect(googleUiState(conn({ syncState: "error" }), false)).toBe("error");
  });
});

describe("chamadas à função", () => {
  it("pedir a URL de consentimento informa a origem do app", async () => {
    invoke.mockResolvedValue({ data: { url: "https://accounts.google.com/x" }, error: null });
    expect(await startGoogleConnect()).toBe("https://accounts.google.com/x");
    expect(invoke).toHaveBeenCalledWith("google-calendar", {
      body: { action: "oauth-start", origin: window.location.origin },
    });
  });

  it("confirmar o bilhete envia o fuso do aparelho", async () => {
    invoke.mockResolvedValue({ data: { email: "a@x" }, error: null });
    await completeGoogleConnect("TICKET");
    const body = invoke.mock.calls[0][1].body;
    expect(body).toMatchObject({ action: "oauth-complete", ticket: "TICKET" });
    expect(typeof body.timeZone).toBe("string");
  });

  it("as demais ações usam o nome certo", async () => {
    invoke.mockResolvedValue({
      data: { stats: {}, skipped: false, error: null, revoked: true },
      error: null,
    });
    await selectGoogleCalendars([{ id: "1", selected: true }], { pushRoutines: true });
    await syncGoogleNow("push");
    await resolveGoogleConflict("link", "norte");
    await disconnectGoogle();
    expect(invoke.mock.calls.map((c) => c[1].body.action)).toEqual([
      "select-calendars",
      "sync",
      "resolve-conflict",
      "disconnect",
    ]);
    expect(invoke.mock.calls[0][1].body).toMatchObject({ pushRoutines: true });
    expect(invoke.mock.calls[2][1].body).toMatchObject({ linkId: "link", resolution: "norte" });
  });

  it("erro da função vira mensagem em português e código estável", async () => {
    const response = new Response(
      JSON.stringify({ error: "O acesso ao Google expirou.", code: "needs_reauth" }),
      {
        status: 401,
      },
    );
    invoke.mockResolvedValue({ data: null, error: { context: response } });
    const error = await syncGoogleNow().catch((e) => e);
    expect(error).toBeInstanceOf(GoogleActionError);
    expect(error.message).toBe("O acesso ao Google expirou.");
    expect(error.needsReauth).toBe(true);
  });

  it("falha de rede (sem corpo) usa mensagem genérica, sem vazar detalhes", async () => {
    invoke.mockResolvedValue({ data: null, error: new Error("TypeError: Failed to fetch") });
    const error = await syncGoogleNow().catch((e) => e);
    expect(error.message).toMatch(/Não foi possível falar com o Google Agenda/);
    expect(error.message).not.toContain("Failed to fetch");
  });
});
