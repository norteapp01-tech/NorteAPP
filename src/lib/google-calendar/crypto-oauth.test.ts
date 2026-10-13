// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  decryptToken,
  encryptToken,
  randomToken,
  sha256Hex,
  timingSafeEqual,
} from "../../../supabase/functions/_shared/google/crypto.ts";
import {
  GOOGLE_SCOPES,
  OAuthError,
  buildAuthUrl,
  createState,
  exchangeCode,
  isAllowedOrigin,
  refreshAccessToken,
  signState,
  verifyState,
} from "../../../supabase/functions/_shared/google/oauth.ts";
import {
  GoogleApiError,
  GoogleCalendarApi,
} from "../../../supabase/functions/_shared/google/api.ts";

const KEY = "uma-chave-qualquer-para-teste";
const config = {
  clientId: "cid",
  clientSecret: "secret",
  redirectUri: "https://x.supabase.co/functions/v1/google-calendar-oauth/callback",
  stateSecret: "state-secret",
};

describe("criptografia dos tokens", () => {
  it("cifra e decifra, e o texto cifrado não revela o token", async () => {
    const blob = await encryptToken("ya29.token-secreto", KEY);
    expect(blob).not.toContain("ya29");
    expect(blob.startsWith("v1.")).toBe(true);
    expect(await decryptToken(blob, KEY)).toBe("ya29.token-secreto");
  });

  it("o mesmo token cifrado duas vezes dá resultados diferentes (IV novo)", async () => {
    expect(await encryptToken("x", KEY)).not.toBe(await encryptToken("x", KEY));
  });

  it("chave errada ou texto adulterado não decifram", async () => {
    const blob = await encryptToken("abc", KEY);
    await expect(decryptToken(blob, "outra-chave")).rejects.toThrow();
    const parts = blob.split(".");
    parts[2] = parts[2].slice(0, -2) + "AA";
    await expect(decryptToken(parts.join("."), KEY)).rejects.toThrow();
    await expect(decryptToken("lixo", KEY)).rejects.toThrow();
  });

  it("aceita chave em hexadecimal e em base64", async () => {
    const hex = "ab".repeat(32);
    expect(await decryptToken(await encryptToken("t", hex), hex)).toBe("t");
    const b64 = btoa(String.fromCharCode(...new Uint8Array(32).fill(7)));
    expect(await decryptToken(await encryptToken("t", b64), b64)).toBe("t");
  });

  it("utilitários de segredo", async () => {
    expect(await sha256Hex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
    expect(randomToken()).not.toBe(randomToken());
    expect(timingSafeEqual("abc", "abc")).toBe(true);
    expect(timingSafeEqual("abc", "abd")).toBe(false);
    expect(timingSafeEqual("abc", "abcd")).toBe(false);
  });
});

describe("OAuth: state anti-CSRF", () => {
  const now = 1_800_000_000;

  it("o state assinado volta íntegro", async () => {
    const { state } = await createState("user-1", "https://app.example", config.stateSecret, now);
    const payload = await verifyState(state, config.stateSecret, now + 5);
    expect(payload).toMatchObject({ uid: "user-1", origin: "https://app.example" });
  });

  it("recusa state adulterado, de outro segredo, expirado ou malformado", async () => {
    const { state } = await createState("user-1", "https://app.example", config.stateSecret, now);
    const [body] = state.split(".");
    await expect(verifyState(`${body}.assinaturafalsa`, config.stateSecret, now)).rejects.toThrow(
      /adulterado/,
    );
    await expect(verifyState(state, "outro-segredo", now)).rejects.toThrow();
    await expect(verifyState(state, config.stateSecret, now + 601)).rejects.toThrow(/expirado/);
    await expect(verifyState("lixo", config.stateSecret, now)).rejects.toThrow();
    // trocar o usuário dentro do corpo quebra a assinatura
    const forged = btoa(
      JSON.stringify({ uid: "atacante", nonce: "n", origin: "x", exp: now + 100 }),
    );
    await expect(
      verifyState(`${forged}.${state.split(".")[1]}`, config.stateSecret, now),
    ).rejects.toThrow();
  });

  it("cada state tem um nonce próprio", async () => {
    const a = await createState("u", "o", config.stateSecret, now);
    const b = await createState("u", "o", config.stateSecret, now);
    expect(a.nonce).not.toBe(b.nonce);
    expect(await signState({ uid: "u", nonce: "n", origin: "o", exp: now + 1 }, "s")).toContain(
      ".",
    );
  });

  it("só devolve para origens conhecidas", () => {
    const allowed = ["https://app.example", "http://localhost:8080"];
    expect(isAllowedOrigin("https://app.example", allowed)).toBe(true);
    expect(isAllowedOrigin("https://app.example/qualquer/coisa", allowed)).toBe(true);
    expect(isAllowedOrigin("https://evil.example", allowed)).toBe(false);
    expect(isAllowedOrigin("javascript:alert(1)", allowed)).toBe(false);
    expect(isAllowedOrigin("não é url", allowed)).toBe(false);
  });
});

describe("OAuth: URL e troca de código", () => {
  it("pede só os escopos necessários, acesso offline e consentimento", () => {
    const url = new URL(buildAuthUrl(config, "STATE", "a@b.com"));
    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(url.searchParams.get("state")).toBe("STATE");
    expect(url.searchParams.get("redirect_uri")).toBe(config.redirectUri);
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("prompt")).toBe("consent");
    expect(url.searchParams.get("scope")).toBe(GOOGLE_SCOPES.join(" "));
    expect(GOOGLE_SCOPES).not.toContain("https://www.googleapis.com/auth/calendar.calendars");
    expect(url.searchParams.get("login_hint")).toBe("a@b.com");
  });

  it("troca o código e renova o token", async () => {
    const calls: { url: string; body: string }[] = [];
    const fetchImpl = async (url: string, init?: RequestInit) => {
      calls.push({ url, body: String(init?.body) });
      return new Response(
        JSON.stringify({ access_token: "A", refresh_token: "R", expires_in: 3599 }),
        {
          status: 200,
        },
      );
    };
    const tokens = await exchangeCode(fetchImpl, config, "CODE");
    expect(tokens.refresh_token).toBe("R");
    expect(calls[0].body).toContain("grant_type=authorization_code");
    expect(calls[0].body).toContain("code=CODE");
    await refreshAccessToken(fetchImpl, config, "R");
    expect(calls[1].body).toContain("grant_type=refresh_token");
  });

  it("invalid_grant pede nova autorização", async () => {
    const fetchImpl = async () =>
      new Response(JSON.stringify({ error: "invalid_grant", error_description: "Token revoked" }), {
        status: 400,
      });
    const error = await refreshAccessToken(fetchImpl, config, "R").catch((e) => e);
    expect(error).toBeInstanceOf(OAuthError);
    expect(error.needsReauth).toBe(true);
  });
});

describe("cliente da Google Calendar API", () => {
  const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
    new Response(JSON.stringify(body), { status, headers });

  it("tenta de novo em 429 e 5xx e respeita Retry-After", async () => {
    const waits: number[] = [];
    let n = 0;
    const api = new GoogleCalendarApi({
      getAccessToken: async () => "tok",
      sleep: async (ms) => void waits.push(ms),
      fetch: async () => {
        n += 1;
        if (n === 1) return json(429, { error: { message: "rate" } }, { "Retry-After": "2" });
        if (n === 2) return json(503, { error: { message: "down" } });
        return json(200, { items: [{ id: "c1", accessRole: "owner" }] });
      },
    });
    const calendars = await api.listCalendars();
    expect(calendars).toHaveLength(1);
    expect(waits[0]).toBe(2000);
    expect(waits).toHaveLength(2);
  });

  it("erros definitivos viram GoogleApiError tipado", async () => {
    const api = new GoogleCalendarApi({
      getAccessToken: async () => "tok",
      fetch: async () => json(412, { error: { message: "Precondition Failed" } }),
    });
    const error = await api.patchEvent("cal", "ev", { summary: "x" }, '"etag"').catch((e) => e);
    expect(error).toBeInstanceOf(GoogleApiError);
    expect(error.isPreconditionFailed).toBe(true);
  });

  it("manda If-Match no PATCH e Bearer em tudo", async () => {
    let seen: { headers: Record<string, string>; url: string } | null = null;
    const api = new GoogleCalendarApi({
      getAccessToken: async () => "tok",
      fetch: async (url, init) => {
        seen = { url, headers: init?.headers as Record<string, string> };
        return json(200, { id: "ev" });
      },
    });
    await api.patchEvent("a@b.com", "ev1", { summary: "x" }, '"abc"');
    expect(seen!.headers["If-Match"]).toBe('"abc"');
    expect(seen!.headers.Authorization).toBe("Bearer tok");
    expect(seen!.url).toContain("calendars/a%40b.com/events/ev1");
    expect(seen!.url).toContain("sendUpdates=none");
  });

  it("excluir um evento que já não existe não é erro", async () => {
    const api = new GoogleCalendarApi({
      getAccessToken: async () => "tok",
      fetch: async () => json(410, { error: { message: "Gone" } }),
    });
    await expect(api.deleteEvent("cal", "ev")).resolves.toBeUndefined();
  });

  it("sincronização incremental pede os excluídos e devolve o novo token", async () => {
    const urls: string[] = [];
    const api = new GoogleCalendarApi({
      getAccessToken: async () => "tok",
      fetch: async (url) => {
        urls.push(url);
        const u = new URL(url);
        return u.searchParams.get("pageToken")
          ? json(200, { items: [{ id: "b" }], nextSyncToken: "SYNC2" })
          : json(200, { items: [{ id: "a" }], nextPageToken: "P2" });
      },
    });
    const page = await api.listEvents("cal", { syncToken: "SYNC1" });
    expect(page.events.map((e) => e.id)).toEqual(["a", "b"]);
    expect(page.nextSyncToken).toBe("SYNC2");
    expect(urls[0]).toContain("syncToken=SYNC1");
    expect(urls[0]).toContain("showDeleted=true");
    expect(urls[0]).toContain("singleEvents=false");
    expect(urls[0]).not.toContain("timeMin");
  });
});
