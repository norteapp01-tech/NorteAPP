import { readFileSync } from "node:fs";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";

// Execute the actual Edge handler with injected transport/database adapters.
const source = readFileSync("supabase/functions/dispatch-reminders/index.ts", "utf8").replace(
  /^import .*;\s*$/gm,
  "",
);
const code = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;
function fixture(
  options: {
    secret?: boolean;
    noDevices?: boolean;
    claimed?: boolean;
    receiptFailure?: boolean;
  } = {},
) {
  const reminder: Record<string, unknown> = {
    id: "r",
    user_id: "u",
    text: "Ler",
    origin: "habit_reminder",
    remind_at: "2026-11-12T10:00:00Z",
    done: false,
    notified_at: null,
  };
  const receipts = new Set<string>();
  const devices = options.noDevices
    ? []
    : [
        { id: "d1", endpoint: "https://example.test/1", p256dh: "p", auth: "a" },
        { id: "d2", endpoint: "https://example.test/2", p256dh: "p", auth: "a" },
      ];
  let handler!: (req: Request) => Promise<Response>;
  const send = vi.fn(async () => {});
  const env: Record<string, string> = {
    SUPABASE_URL: "https://example.test",
    SUPABASE_SERVICE_ROLE_KEY: "fixture",
    VAPID_PUBLIC_KEY: "p",
    VAPID_PRIVATE_KEY: "s",
    ...(options.secret === false ? {} : { CRON_SECRET: "test-secret" }),
  };
  const client = {
    from(table: string) {
      let action = "read",
        payload: Record<string, unknown> = {},
        single = false;
      const filters: Record<string, unknown> = {};
      const query = {
        select: () => query,
        update: (p: Record<string, unknown>) => {
          action = "update";
          payload = p;
          return query;
        },
        upsert: (p: Record<string, unknown>) => {
          action = "upsert";
          payload = p;
          return query;
        },
        delete: () => {
          action = "delete";
          return query;
        },
        eq: (k: string, v: unknown) => {
          filters[k] = v;
          return query;
        },
        is: () => query,
        lte: () => query,
        gte: () => query,
        or: () => query,
        order: () => query,
        limit: () => query,
        maybeSingle: () => {
          single = true;
          return query;
        },
        then(resolve: (value: unknown) => unknown) {
          let data: unknown = [],
            error: unknown = null;
          if (table === "reminders") {
            if (action === "update") {
              const matches = Object.entries(filters).every(
                ([key, value]) => reminder[key] === value,
              );
              if (matches && !(payload.dispatch_token && options.claimed)) {
                Object.assign(reminder, payload);
                data = single ? { id: "r" } : [{ id: "r" }];
              } else data = single ? null : [];
            } else data = single ? { ...reminder } : [{ ...reminder }];
          } else if (table === "push_subscriptions") {
            if (action === "delete") {
              const i = devices.findIndex((d) => d.id === filters.id);
              if (i >= 0) devices.splice(i, 1);
            } else data = [...devices];
          } else if (table === "push_delivery_receipts") {
            if (action === "upsert") {
              if (options.receiptFailure) error = { message: "failed" };
              else receipts.add(payload.subscription_id as string);
            } else data = [...receipts].map((subscription_id) => ({ subscription_id }));
          }
          return Promise.resolve({ data, error }).then(resolve);
        },
      };
      return query;
    },
  };
  new Function("Deno", "createClient", "webPush", code)(
    {
      env: { get: (key: string) => env[key] },
      serve: (fn: typeof handler) => {
        handler = fn;
      },
    },
    () => client,
    { setVapidDetails: () => {}, sendNotification: send },
  );
  const run = (auth = "test-secret") =>
    handler(
      new Request("https://example.test/dispatch", {
        method: "POST",
        headers: { Authorization: `Bearer ${auth}` },
      }),
    );
  return { run, send, reminder, receipts, devices };
}
describe("dispatch de lembretes", () => {
  it("falha fechado sem segredo e recusa autorização incorreta", async () => {
    const unset = fixture({ secret: false });
    expect((await unset.run()).status).toBe(503);
    expect(unset.send).not.toHaveBeenCalled();
    const f = fixture();
    expect((await f.run("wrong")).status).toBe(401);
    expect(f.send).not.toHaveBeenCalled();
  });
  it("sem aparelho não marca como entregue", async () => {
    const f = fixture({ noDevices: true });
    expect(await (await f.run()).json()).toMatchObject({ sent: 0, noDevice: 1 });
    expect(f.reminder.notified_at).toBeNull();
  });
  it("outro worker com lease impede envio", async () => {
    const f = fixture({ claimed: true });
    await f.run();
    expect(f.send).not.toHaveBeenCalled();
  });
  it("falha parcial repete só o aparelho que falhou", async () => {
    const f = fixture();
    f.send.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("timeout"));
    expect((await f.run()).status).toBe(207);
    expect(f.reminder.notified_at).toBeNull();
    expect([...f.receipts]).toEqual(["d1"]);
    f.send.mockClear();
    expect(await (await f.run()).json()).toMatchObject({ sent: 1, failed: 0 });
    expect(f.send).toHaveBeenCalledTimes(1);
    expect(f.reminder.notified_at).not.toBeNull();
  });
  it("não confirma entrega se falhou ao guardar recibo", async () => {
    const f = fixture({ receiptFailure: true });
    await f.run();
    expect(f.reminder.notified_at).toBeNull();
  });
  it("remove inscrições expiradas e não inventa entrega", async () => {
    const f = fixture();
    f.send.mockRejectedValue(Object.assign(new Error("gone"), { statusCode: 410 }));
    await f.run();
    expect(f.devices).toHaveLength(0);
    expect(f.reminder.notified_at).toBeNull();
  });
});
