import type { FetchLike } from "./oauth.ts";
import type { GoogleEvent, GooglePayload } from "./mapping.ts";

// ---------------------------------------------------------------------------
// Cliente da Google Calendar API v3.
//
// Só o que a sincronização usa. Tentativas automáticas em 429/5xx (com espera
// crescente) e erros tipados para o motor decidir: token expirado, evento
// alterado por outro lado (412), evento inexistente (404/410), syncToken
// vencido (410).
// ---------------------------------------------------------------------------

const BASE = "https://www.googleapis.com/calendar/v3";

export class GoogleApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly reason?: string,
  ) {
    super(message);
  }
  get isGone() {
    return this.status === 410;
  }
  get isNotFound() {
    return this.status === 404;
  }
  get isPreconditionFailed() {
    return this.status === 412;
  }
  get isUnauthorized() {
    return this.status === 401;
  }
  get isForbidden() {
    return this.status === 403;
  }
}

export type GoogleCalendarListEntry = {
  id: string;
  summary?: string;
  summaryOverride?: string;
  description?: string;
  timeZone?: string;
  backgroundColor?: string;
  foregroundColor?: string;
  accessRole: "owner" | "writer" | "reader" | "freeBusyReader";
  primary?: boolean;
  selected?: boolean;
  deleted?: boolean;
};

export type EventsPage = { events: GoogleEvent[]; nextSyncToken?: string };

export type WatchResponse = {
  id: string;
  resourceId: string;
  expiration?: string;
};

type Options = {
  getAccessToken: () => Promise<string>;
  fetch: FetchLike;
  sleep?: (ms: number) => Promise<void>;
  maxAttempts?: number;
};

export class GoogleCalendarApi {
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly maxAttempts: number;

  constructor(private readonly options: Options) {
    this.sleep = options.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.maxAttempts = options.maxAttempts ?? 4;
  }

  private async request<T>(
    method: string,
    path: string,
    init: {
      query?: Record<string, string | undefined>;
      body?: unknown;
      headers?: Record<string, string>;
    } = {},
  ): Promise<T> {
    const url = new URL(`${BASE}${path}`);
    for (const [k, v] of Object.entries(init.query ?? {}))
      if (v !== undefined) url.searchParams.set(k, v);

    let lastError: GoogleApiError | null = null;
    for (let attempt = 0; attempt < this.maxAttempts; attempt++) {
      const token = await this.options.getAccessToken();
      const res = await this.options.fetch(url.toString(), {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}),
          ...init.headers,
        },
        body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      });
      if (res.ok) {
        if (res.status === 204) return undefined as T;
        const text = await res.text();
        return (text ? JSON.parse(text) : undefined) as T;
      }
      const payload = (await res.json().catch(() => ({}))) as {
        error?: { message?: string; errors?: { reason?: string }[] };
      };
      lastError = new GoogleApiError(
        payload.error?.message ?? `Google Agenda respondeu ${res.status}`,
        res.status,
        payload.error?.errors?.[0]?.reason,
      );
      const rateLimited =
        res.status === 429 ||
        (res.status === 403 &&
          ["rateLimitExceeded", "userRateLimitExceeded", "quotaExceeded"].includes(
            lastError.reason ?? "",
          ));
      if (rateLimited || res.status >= 500) {
        const retryAfter = Number(res.headers.get("Retry-After"));
        await this.sleep(retryAfter > 0 ? retryAfter * 1000 : Math.min(8000, 500 * 2 ** attempt));
        continue;
      }
      throw lastError;
    }
    throw lastError ?? new GoogleApiError("Google Agenda indisponível.", 503);
  }

  async listCalendars(): Promise<GoogleCalendarListEntry[]> {
    const out: GoogleCalendarListEntry[] = [];
    let pageToken: string | undefined;
    do {
      const page = await this.request<{
        items?: GoogleCalendarListEntry[];
        nextPageToken?: string;
      }>("GET", "/users/me/calendarList", {
        query: { minAccessRole: "reader", maxResults: "250", pageToken },
      });
      out.push(...(page.items ?? []).filter((c) => !c.deleted));
      pageToken = page.nextPageToken;
    } while (pageToken);
    return out;
  }

  /** Lista eventos; com `syncToken` devolve só o que mudou (inclusive exclusões). */
  async listEvents(
    calendarId: string,
    opts: { syncToken?: string; timeMin?: string },
  ): Promise<EventsPage> {
    const events: GoogleEvent[] = [];
    let pageToken: string | undefined;
    let nextSyncToken: string | undefined;
    do {
      const page = await this.request<{
        items?: GoogleEvent[];
        nextPageToken?: string;
        nextSyncToken?: string;
      }>("GET", `/calendars/${encodeURIComponent(calendarId)}/events`, {
        query: {
          maxResults: "250",
          // Mestre + exceções separadas: é assim que a recorrência é preservada.
          singleEvents: "false",
          showDeleted: opts.syncToken ? "true" : "false",
          syncToken: opts.syncToken,
          timeMin: opts.syncToken ? undefined : opts.timeMin,
          pageToken,
        },
      });
      events.push(...(page.items ?? []));
      pageToken = page.nextPageToken;
      nextSyncToken = page.nextSyncToken ?? nextSyncToken;
    } while (pageToken);
    return { events, nextSyncToken };
  }

  /** Eventos que carregam uma propriedade privada (ex.: norteId) — para religar
   * um evento criado pelo Norte em vez de duplicá-lo. */
  async findByPrivateProperty(
    calendarId: string,
    key: string,
    value: string,
  ): Promise<GoogleEvent[]> {
    const page = await this.request<{ items?: GoogleEvent[] }>(
      "GET",
      `/calendars/${encodeURIComponent(calendarId)}/events`,
      {
        query: {
          privateExtendedProperty: `${key}=${value}`,
          showDeleted: "false",
          maxResults: "20",
        },
      },
    );
    return page.items ?? [];
  }

  getEvent(calendarId: string, eventId: string): Promise<GoogleEvent> {
    return this.request(
      "GET",
      `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    );
  }

  insertEvent(calendarId: string, payload: GooglePayload): Promise<GoogleEvent> {
    return this.request("POST", `/calendars/${encodeURIComponent(calendarId)}/events`, {
      query: { sendUpdates: "none" },
      body: payload,
    });
  }

  /** PATCH (parcial): convidados, lembretes e demais campos do Google ficam como estão.
   * `ifMatch` faz o Google recusar (412) se o evento mudou depois do que o Norte viu. */
  patchEvent(
    calendarId: string,
    eventId: string,
    payload: Partial<GooglePayload>,
    ifMatch?: string,
  ): Promise<GoogleEvent> {
    return this.request(
      "PATCH",
      `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
      {
        query: { sendUpdates: "none" },
        body: payload,
        headers: ifMatch ? { "If-Match": ifMatch } : undefined,
      },
    );
  }

  async deleteEvent(calendarId: string, eventId: string, ifMatch?: string): Promise<void> {
    try {
      await this.request(
        "DELETE",
        `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
        { query: { sendUpdates: "none" }, headers: ifMatch ? { "If-Match": ifMatch } : undefined },
      );
    } catch (error) {
      // Já não existe: o objetivo (não existir) foi atingido.
      if (error instanceof GoogleApiError && (error.isNotFound || error.isGone)) return;
      throw error;
    }
  }

  async listInstances(
    calendarId: string,
    recurringEventId: string,
    range: { timeMin: string; timeMax: string },
  ): Promise<GoogleEvent[]> {
    const page = await this.request<{ items?: GoogleEvent[] }>(
      "GET",
      `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(recurringEventId)}/instances`,
      {
        query: {
          timeMin: range.timeMin,
          timeMax: range.timeMax,
          showDeleted: "true",
          maxResults: "50",
        },
      },
    );
    return page.items ?? [];
  }

  watch(
    calendarId: string,
    channel: { id: string; address: string; token: string; ttlSeconds: number },
  ): Promise<WatchResponse> {
    return this.request("POST", `/calendars/${encodeURIComponent(calendarId)}/events/watch`, {
      body: {
        id: channel.id,
        type: "web_hook",
        address: channel.address,
        token: channel.token,
        params: { ttl: String(channel.ttlSeconds) },
      },
    });
  }

  async stopChannel(channel: { id: string; resourceId: string }): Promise<void> {
    try {
      await this.request("POST", "/channels/stop", { body: channel });
    } catch (error) {
      if (error instanceof GoogleApiError && (error.isNotFound || error.isGone)) return;
      throw error;
    }
  }
}
