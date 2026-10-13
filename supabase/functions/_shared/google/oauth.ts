import { fromBase64Url, hmacSha256, randomToken, timingSafeEqual, toBase64Url } from "./crypto.ts";

// ---------------------------------------------------------------------------
// OAuth 2.0 com o Google: URL de consentimento, `state` anti-CSRF, troca de
// código e renovação de token. `fetch` é injetado para poder ser testado.
// ---------------------------------------------------------------------------

/** O mínimo necessário: identidade, eventos e a LISTA de agendas.
 * (O escopo `calendar.calendars`, que permite criar/apagar agendas, não é usado.) */
export const GOOGLE_SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
];

export const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
export const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
export const REVOKE_ENDPOINT = "https://oauth2.googleapis.com/revoke";
export const USERINFO_ENDPOINT = "https://openidconnect.googleapis.com/v1/userinfo";

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export type OAuthConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  stateSecret: string;
};

/** O `state` vale 10 minutos e carrega: quem iniciou, de onde, e um nonce que
 * só pode ser usado uma vez (o banco o marca ao consumir). */
export const STATE_TTL_SECONDS = 600;

export type StatePayload = { uid: string; nonce: string; origin: string; exp: number };

export async function signState(payload: StatePayload, secret: string): Promise<string> {
  const body = toBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
  return `${body}.${await hmacSha256(body, secret)}`;
}

export async function verifyState(
  token: string,
  secret: string,
  nowSeconds: number,
): Promise<StatePayload> {
  const [body, signature] = token.split(".");
  if (!body || !signature) throw new Error("state inválido");
  const expected = await hmacSha256(body, secret);
  if (!timingSafeEqual(signature, expected)) throw new Error("state adulterado");
  const payload = JSON.parse(new TextDecoder().decode(fromBase64Url(body))) as StatePayload;
  if (!payload.uid || !payload.nonce || !payload.origin) throw new Error("state incompleto");
  if (payload.exp < nowSeconds) throw new Error("state expirado");
  return payload;
}

export async function createState(
  uid: string,
  origin: string,
  secret: string,
  nowSeconds: number,
): Promise<{ state: string; nonce: string }> {
  const nonce = randomToken(24);
  const state = await signState(
    { uid, nonce, origin, exp: nowSeconds + STATE_TTL_SECONDS },
    secret,
  );
  return { state, nonce };
}

export function buildAuthUrl(config: OAuthConfig, state: string, loginHint?: string): string {
  const url = new URL(AUTH_ENDPOINT);
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", GOOGLE_SCOPES.join(" "));
  // `offline` + `consent` garantem um refresh token também ao reconectar.
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("state", state);
  if (loginHint) url.searchParams.set("login_hint", loginHint);
  return url.toString();
}

export type TokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope?: string;
  id_token?: string;
};

export class OAuthError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
  ) {
    super(message);
  }
  /** O Google revogou ou expirou o acesso: só uma nova autorização resolve. */
  get needsReauth() {
    return this.code === "invalid_grant";
  }
}

async function tokenRequest(fetchImpl: FetchLike, params: Record<string, string>) {
  const res = await fetchImpl(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params).toString(),
  });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    throw new OAuthError(
      String(body.error_description ?? body.error ?? "Falha ao falar com o Google."),
      String(body.error ?? "unknown"),
      res.status,
    );
  }
  return body as unknown as TokenResponse;
}

export const exchangeCode = (fetchImpl: FetchLike, config: OAuthConfig, code: string) =>
  tokenRequest(fetchImpl, {
    code,
    client_id: config.clientId,
    client_secret: config.clientSecret,
    redirect_uri: config.redirectUri,
    grant_type: "authorization_code",
  });

export const refreshAccessToken = (
  fetchImpl: FetchLike,
  config: OAuthConfig,
  refreshToken: string,
) =>
  tokenRequest(fetchImpl, {
    refresh_token: refreshToken,
    client_id: config.clientId,
    client_secret: config.clientSecret,
    grant_type: "refresh_token",
  });

export async function fetchUserInfo(fetchImpl: FetchLike, accessToken: string) {
  const res = await fetchImpl(USERINFO_ENDPOINT, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok)
    throw new OAuthError("Não foi possível identificar a conta Google.", "userinfo", res.status);
  return (await res.json()) as { sub: string; email: string; email_verified?: boolean };
}

/** Revoga o acesso no Google. Falhar aqui não impede desconectar no Norte. */
export async function revokeToken(fetchImpl: FetchLike, token: string): Promise<boolean> {
  try {
    const res = await fetchImpl(REVOKE_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token }).toString(),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Só devolve a pessoa para origens conhecidas (sem redirecionamento aberto). */
export function isAllowedOrigin(origin: string, allowed: string[]): boolean {
  try {
    const url = new URL(origin);
    return allowed.some((a) => new URL(a).origin === url.origin);
  } catch {
    return false;
  }
}
