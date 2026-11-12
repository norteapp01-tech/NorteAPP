// Exercises the real browser-side queue against controlled network responses.
import { chromium } from "playwright";
import assert from "node:assert/strict";
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const uid = "00000000-0000-4000-a000-000000000001";
  const habit = "00000000-0000-4000-a000-000000000002";
  const user = { id: uid, aud: "authenticated", role: "authenticated", is_anonymous: true };
  const token = [
    { alg: "HS256", typ: "JWT" },
    { sub: uid, exp: Math.floor(Date.now() / 1000) + 3600 },
    "fixture",
  ]
    .map((x) => Buffer.from(typeof x === "string" ? x : JSON.stringify(x)).toString("base64url"))
    .join(".");
  let offline = true,
    writes = 0;
  const logs = [];
  const requests = [];
  await page.addInitScript(() => sessionStorage.setItem("norte-welcome-entered", "true"));
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.includes("/auth/v1/"))
      return route.fulfill({
        json: {
          access_token: token,
          refresh_token: "fixture",
          token_type: "bearer",
          expires_in: 3600,
          user,
        },
      });
    if (url.pathname.includes("/rest/v1/")) {
      const table = url.pathname.split("/").at(-1);
      if (table === "log_habit") {
        const p = route.request().postDataJSON();
        requests.push(p);
        if (offline)
          return route.fulfill({
            status: 503,
            json: { message: "Serviço temporariamente indisponível" },
          });
        let log = logs.find((l) => l.idempotency_key === p.p_idempotency_key);
        if (!log) {
          log = {
            id: "00000000-0000-4000-a000-000000000003",
            habit_id: habit,
            user_id: uid,
            local_date: p.p_date,
            occurred_at: p.p_occurred_at,
            time_zone: p.p_time_zone,
            status: p.p_status,
            value: p.p_value,
            note: p.p_note,
            checks: p.p_checks,
            source: p.p_source,
            idempotency_key: p.p_idempotency_key,
            deleted_at: null,
          };
          logs.push(log);
          writes++;
        }
        return route.fulfill({ json: log });
      }
      const fixtures = {
        habit_logs: logs,
        habit_timers: null,
        habit_settings: null,
        habits: [
          {
            id: habit,
            user_id: uid,
            name: "Leitura",
            intent: "build",
            measure: "binary",
            start_date: "2020-01-01",
            position: 0,
            created_at: "2020-01-01T00:00:00Z",
          },
        ],
        habit_versions: [
          {
            id: "version",
            habit_id: habit,
            effective_from: "2020-01-01",
            goal_value: 1,
            goal_period: "day",
            schedule: { type: "daily" },
            flexible: false,
            times_of_day: [],
            checklist: [],
          },
        ],
      };
      return route.fulfill({ json: fixtures[table] ?? [] });
    }
    if (!["localhost", "127.0.0.1"].includes(url.hostname)) return route.abort();
    return route.continue();
  });
  await page.goto(`${process.env.APP_URL ?? "http://127.0.0.1:8081"}/rotinas`);
  await page.getByRole("heading", { name: "Seu ritmo, no seu tempo.", exact: true }).waitFor();
  await page.getByRole("button", { name: "Marcar Leitura como feita", exact: true }).click();
  await page.getByText("Guardado neste aparelho. Aguardando conexão.", { exact: true }).waitFor();
  assert.equal(writes, 0);
  const queued = await page.evaluate(
    (uid) => JSON.parse(localStorage.getItem(`norte-habit-outbox:${uid}`)),
    uid,
  );
  assert.equal(queued.length, 1);
  const original = queued[0].input;
  await page.getByText("1 registro aguardando envio · Ver", { exact: true }).waitFor();
  await page.reload();
  await page.getByRole("heading", { name: "Seu ritmo, no seu tempo.", exact: true }).waitFor();
  assert.equal(
    await page.evaluate(
      (uid) => JSON.parse(localStorage.getItem(`norte-habit-outbox:${uid}`)).length,
      uid,
    ),
    1,
  );
  offline = false;
  await page.getByText("1 registro aguardando envio · Ver", { exact: true }).click();
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await page.getByText("Tudo sincronizado", { exact: true }).waitFor();
  assert.equal(writes, 1);
  assert.ok(requests.every((r) => r.p_idempotency_key === original.key));
  assert.ok(
    requests.every((r) => r.p_date === original.date && r.p_occurred_at === original.occurredAt),
  );
  console.log(
    "PASS offline save, visible pending state, reload persistence, idempotent retry and original timestamp. Fixture backend only.",
  );
} finally {
  await browser.close();
}
