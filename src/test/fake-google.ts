// ---------------------------------------------------------------------------
// Google Agenda falso, em memória, com a semântica que a sincronização usa:
//  * etags que mudam a cada escrita e `If-Match` (412 quando está velho);
//  * syncToken incremental, com exclusões aparecendo como `status: cancelled`;
//  * eventos de séries (mestre + exceções) como o Google devolve;
//  * propriedades privadas (para religar eventos criados pelo Norte).
// ---------------------------------------------------------------------------
import { GoogleApiError } from "../../supabase/functions/_shared/google/api.ts";
import type {
  GoogleEvent,
  GooglePayload,
} from "../../supabase/functions/_shared/google/mapping.ts";

type Stored = GoogleEvent & { _rev: number };

export class FakeGoogle {
  private calendars = new Map<string, { events: Map<string, Stored>; rev: number }>();
  private counter = 0;
  /** Tudo o que o Norte pediu, para conferir nos testes. */
  calls: { op: string; calendar?: string; id?: string; body?: unknown }[] = [];
  /** Relógio do Google (validade dos canais de webhook). */
  nowFn: () => Date = () => new Date();
  /** Força a próxima chamada de listagem incremental a falhar com 410. */
  expireSyncToken = false;
  /** Falhas programadas por operação (429/5xx já são tratadas pelo cliente real). */
  failNext: Partial<Record<string, GoogleApiError>> = {};

  calendar(id: string) {
    let cal = this.calendars.get(id);
    if (!cal) this.calendars.set(id, (cal = { events: new Map(), rev: 0 }));
    return cal;
  }

  private touch(calId: string, ev: Stored): Stored {
    const cal = this.calendar(calId);
    cal.rev += 1;
    ev._rev = cal.rev;
    ev.etag = `"e${cal.rev}"`;
    ev.updated = new Date(1_800_000_000_000 + cal.rev * 1000).toISOString();
    cal.events.set(ev.id, ev);
    return ev;
  }

  /** A pessoa mexe direto no Google (interface do Google Agenda). */
  put(calId: string, ev: GoogleEvent): GoogleEvent {
    const existing = this.calendar(calId).events.get(ev.id);
    return this.touch(calId, { ...(existing ?? {}), ...ev, _rev: 0 } as Stored);
  }

  remove(calId: string, id: string) {
    const cal = this.calendar(calId);
    const existing = cal.events.get(id);
    this.touch(calId, {
      id,
      status: "cancelled",
      ...(existing?.recurringEventId
        ? {
            recurringEventId: existing.recurringEventId,
            originalStartTime: existing.originalStartTime,
          }
        : {}),
      _rev: 0,
    } as Stored);
  }

  get(calId: string, id: string): GoogleEvent | undefined {
    return this.calendar(calId).events.get(id);
  }

  live(calId: string): GoogleEvent[] {
    return [...this.calendar(calId).events.values()].filter((e) => e.status !== "cancelled");
  }

  private maybeFail(op: string) {
    const failure = this.failNext[op];
    if (failure) {
      delete this.failNext[op];
      throw failure;
    }
  }

  readonly api = {
    listCalendars: async () => [],

    listEvents: async (calId: string, opts: { syncToken?: string; timeMin?: string }) => {
      this.calls.push({
        op: opts.syncToken ? "listEvents:incremental" : "listEvents:full",
        calendar: calId,
      });
      const cal = this.calendar(calId);
      if (opts.syncToken && this.expireSyncToken) {
        this.expireSyncToken = false;
        throw new GoogleApiError("Sync token is no longer valid", 410);
      }
      const since = opts.syncToken ? Number(opts.syncToken.replace("T", "")) : -1;
      const events = [...cal.events.values()]
        .filter((e) => e._rev > since && (opts.syncToken ? true : e.status !== "cancelled"))
        .map(({ _rev, ...e }) => {
          void _rev;
          return structuredClone(e);
        });
      return { events, nextSyncToken: `T${cal.rev}` };
    },

    getEvent: async (calId: string, id: string) => {
      this.calls.push({ op: "get", calendar: calId, id });
      const found = this.calendar(calId).events.get(id);
      if (!found || found.status === "cancelled") throw new GoogleApiError("Not Found", 404);
      const { _rev, ...event } = found;
      void _rev;
      return structuredClone(event);
    },

    insertEvent: async (calId: string, payload: GooglePayload) => {
      this.maybeFail("insert");
      this.calls.push({ op: "insert", calendar: calId, body: payload });
      this.counter += 1;
      const ev = this.touch(calId, {
        id: `g${this.counter}`,
        status: "confirmed",
        ...structuredClone(payload),
        _rev: 0,
      } as Stored);
      const { _rev, ...event } = ev;
      void _rev;
      return structuredClone(event);
    },

    patchEvent: async (
      calId: string,
      id: string,
      payload: Record<string, unknown>,
      ifMatch?: string,
    ) => {
      this.maybeFail("patch");
      this.calls.push({ op: "patch", calendar: calId, id, body: payload });
      const existing = this.calendar(calId).events.get(id);
      if (!existing || existing.status === "cancelled") throw new GoogleApiError("Not Found", 404);
      if (ifMatch && existing.etag !== ifMatch)
        throw new GoogleApiError("Precondition Failed", 412);
      // Como no Google, um campo enviado como null é removido.
      const dropNulls = (v: unknown): unknown =>
        v && typeof v === "object" && !Array.isArray(v)
          ? Object.fromEntries(
              Object.entries(v)
                .filter(([, x]) => x !== null)
                .map(([k, x]) => [k, dropNulls(x)]),
            )
          : v;
      const merged = { ...existing, ...(dropNulls(structuredClone(payload)) as object) } as Stored;
      // O PATCH não apaga o que não foi enviado (ex.: convidados, lembretes).
      const { _rev, ...event } = this.touch(calId, merged);
      void _rev;
      return structuredClone(event);
    },

    deleteEvent: async (calId: string, id: string) => {
      this.calls.push({ op: "delete", calendar: calId, id });
      const existing = this.calendar(calId).events.get(id);
      if (!existing || existing.status === "cancelled") return;
      this.remove(calId, id);
    },

    listInstances: async (calId: string, masterId: string) => {
      this.calls.push({ op: "instances", calendar: calId, id: masterId });
      return this.live(calId)
        .filter((e) => e.recurringEventId === masterId)
        .map((e) => structuredClone(e));
    },

    findByPrivateProperty: async (calId: string, key: string, value: string) => {
      this.calls.push({ op: "find", calendar: calId });
      return this.live(calId)
        .filter((e) => e.extendedProperties?.private?.[key] === value)
        .map((e) => structuredClone(e));
    },

    watch: async (_calId: string, channel: { id: string }) => ({
      id: channel.id,
      resourceId: `res-${channel.id}`,
      expiration: String(this.nowFn().getTime() + 7 * 86_400_000),
    }),
    stopChannel: async () => undefined,
  };

  callsOf(op: string) {
    return this.calls.filter((c) => c.op === op);
  }
  resetCalls() {
    this.calls = [];
  }
}
