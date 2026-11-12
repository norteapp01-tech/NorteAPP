// stdin: database URL. Temporary accounts, keys and logs are ALWAYS rolled back.
// --apply installs 0068 only after all checks pass. No tokens printed or persisted.
import fs from "node:fs/promises";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
const { default: pg } = await import(process.env.PG_MODULE || "pg");
let input = "";
for await (const part of process.stdin) input += part;
const db = new pg.Client({
  connectionString: input.trim(),
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 15000,
});
const source = await fs.readFile(
  new URL("../supabase/migrations/0068_habit_automation.sql", import.meta.url),
  "utf8",
);
const sql = source.replace(/^begin;\s*$/m, "").replace(/^commit;\s*$/m, "");
let count = 0;
async function check(name, fn) {
  await fn();
  console.log("PASS", name);
  count++;
}
async function denied(fn) {
  await db.query("savepoint denied");
  let error;
  try {
    await fn();
  } catch (e) {
    error = e;
  }
  await db.query("rollback to savepoint denied");
  assert.ok(error);
}
async function as(id, role = "authenticated") {
  await db.query("reset role");
  await db.query("select set_config('request.jwt.claim.sub',$1,true)", [id]);
  await db.query(`set local role ${role}`);
}
async function manage(action, data) {
  return (
    await db.query("select norte_manage_automation($1,$2) as v", [action, JSON.stringify(data)])
  ).rows[0].v;
}
async function call(token, action, data = {}) {
  return (
    await db.query("select norte_habit_automation($1,$2,$3) as v", [
      token,
      action,
      JSON.stringify(data),
    ])
  ).rows[0].v;
}
try {
  await db.connect();
  await db.query("begin");
  await db.query("set local statement_timeout='15s'");
  const exists = (await db.query("select to_regclass('public.norte_automation_keys') as v")).rows[0]
    .v;
  if (!exists) await db.query(sql);
  const [a, b, h] = Array.from({ length: 3 }, randomUUID);
  await db.query("insert into auth.users(id) values($1),($2)", [a, b]);
  await db.query(
    "insert into habits(id,user_id,name,measure,unit) values($1,$2,'QA temporary','quantity','páginas')",
    [h, a],
  );
  await as(a);
  const ro = await manage("create", { name: "QA read", habit_id: h });
  const rw = await manage("create", { name: "QA log", habit_id: h, can_log: true });
  await check("owner cannot retrieve stored hash", () =>
    denied(() => db.query("select token_hash from norte_automation_keys")),
  );
  await as(b);
  await check("another user cannot create scoped key", () =>
    denied(() => manage("create", { name: "QA invalid", habit_id: h })),
  );
  await check("another user cannot list keys", async () =>
    assert.equal(
      (await db.query("select id from norte_automation_keys where id=$1", [rw.id])).rowCount,
      0,
    ),
  );
  await manage("revoke", { id: rw.id });
  await as("", "anon");
  await check("anon cannot create keys", () =>
    denied(() => manage("create", { name: "QA", habit_id: h })),
  );
  await check("invalid token refused", () => denied(() => call("invalid", "read")));
  await check("read-only key cannot write", () =>
    denied(() => call(ro.token, "log", { request_id: "one", value: 1 })),
  );
  const first = await call(rw.token, "log", {
    request_id: "same-request",
    value: 20,
    user_id: b,
    habit_id: b,
  });
  await check("real log_habit retry does not duplicate", async () =>
    assert.equal(
      (await call(rw.token, "log", { request_id: "same-request", value: 20 })).id,
      first.id,
    ),
  );
  await check("request identity restored", async () =>
    assert.equal((await db.query("select auth.uid() as v")).rows[0].v, null),
  );
  await check("future date rejected", () =>
    denied(() => call(rw.token, "log", { request_id: "future", value: 1, date: "2099-01-01" })),
  );
  await db.query("reset role");
  await check("log belongs to authorized owner and routine", async () => {
    const rows = (await db.query("select user_id,habit_id from habit_logs where habit_id=$1", [h]))
      .rows;
    assert.equal(rows.length, 1);
    assert.equal(rows[0].user_id, a);
  });
  await as(a);
  await manage("revoke", { id: rw.id });
  await as("", "anon");
  await check("revocation effective immediately", () => denied(() => call(rw.token, "read")));
  await db.query("rollback");
  console.log(`${count} real-database checks passed; fixtures rolled back.`);
  if (process.argv.includes("--apply") && !exists) {
    await db.query("begin");
    await db.query("set local lock_timeout='5s'");
    await db.query(sql);
    await db.query(
      "insert into supabase_migrations.schema_migrations(version,name,statements) values('0068','habit_automation',$1)",
      [[sql]],
    );
    await db.query("notify pgrst, 'reload schema'");
    await db.query("commit");
    console.log("0068 applied and registered.");
  }
} catch (e) {
  await db.query("rollback").catch(() => {});
  console.error("FAILED", e.code ?? "", e.message);
  process.exitCode = 1;
} finally {
  await db.end();
}
