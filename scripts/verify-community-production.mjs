// Reads a database URL from stdin; never stores or prints credentials.
// All fixture data and DDL are rolled back. Pass --apply to apply only after checks pass.
import fs from "node:fs/promises";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import dns from "node:dns/promises";
const { default: pg } = await import(process.env.PG_MODULE || "pg");
let input = "";
for await (const part of process.stdin) input += part;
const connection = new URL(input.trim());
let host = connection.hostname;
try {
  await dns.lookup(host);
} catch (e) {
  if (e.code !== "ENOTFOUND") throw e;
  // Some macOS resolver configurations omit IPv6-only database hosts.
  host = (await dns.resolve6(host))[0];
}
const db = new pg.Client({
  host,
  port: Number(connection.port || 5432),
  user: decodeURIComponent(connection.username),
  password: decodeURIComponent(connection.password),
  database: connection.pathname.slice(1),
  ssl: { servername: connection.hostname, rejectUnauthorized: false },
  connectionTimeoutMillis: 15000,
});
const source = await fs.readFile(
  new URL("../supabase/migrations/0067_circles.sql", import.meta.url),
  "utf8",
);
const migration = source.replace(/^begin;\s*$/m, "").replace(/^commit;\s*$/m, "");
let passed = 0;
async function check(name, fn) {
  await fn();
  console.log("PASS", name);
  passed++;
}
async function denied(fn) {
  await db.query("savepoint expected_denial");
  let error;
  try {
    await fn();
  } catch (e) {
    error = e;
  }
  await db.query("rollback to savepoint expected_denial");
  assert.ok(error, "Unauthorized operation unexpectedly succeeded");
}
async function as(user) {
  await db.query("reset role");
  await db.query("select set_config('request.jwt.claim.sub',$1,true)", [user]);
  await db.query("set local role authenticated");
}
async function action(name, circle = null, data = {}) {
  return (
    await db.query("select public.norte_community_action($1,$2,$3) as value", [
      name,
      circle,
      JSON.stringify(data),
    ])
  ).rows[0].value;
}
try {
  await db.connect();
  await db.query("begin");
  await db.query("set local statement_timeout='15s'");
  const exists = (await db.query("select to_regclass('public.norte_circles') as name")).rows[0]
    .name;
  if (!exists) await db.query(migration);
  const [a, b, c, h] = Array.from({ length: 4 }, randomUUID);
  await db.query("insert into auth.users(id) values($1),($2),($3)", [a, b, c]);
  await db.query(
    "insert into public.habits(id,user_id,name,measure,unit) values($1,$2,'QA temporary','duration','min')",
    [h, b],
  );
  await as(a);
  const group = (await action("create", null, { name: "QA temporary", alias: "A" })).id;
  const token = (
    await db.query("select invite_token from public.norte_circles where id=$1", [group])
  ).rows[0].invite_token;
  await as(b);
  await check("outsider cannot see the group", async () =>
    assert.equal(
      (await db.query("select id from public.norte_circles where id=$1", [group])).rowCount,
      0,
    ),
  );
  await check("approval is required", async () =>
    assert.equal((await action("join", null, { token, alias: "B" })).status, "pending"),
  );
  await check("pending cannot post", () =>
    denied(() => action("post", group, { body: "blocked" })),
  );
  await as(a);
  await action("approve", group, { user_id: b });
  await as(b);
  await check("member cannot administer", () =>
    denied(() => action("update", group, { auto_approve: true })),
  );
  await action("share", group, { habit_id: h });
  await db.query(
    "insert into public.habit_logs(habit_id,local_date,value,note) values($1,current_date,20,'PRIVATE QA NOTE')",
    [h],
  );
  await as(a);
  await check("summary does not expose notes or private logs", async () => {
    const result = (await db.query("select public.norte_circle_progress($1) as value", [group]))
      .rows[0].value;
    assert.equal(result[0].value, 20);
    assert.ok(!JSON.stringify(result).includes("PRIVATE"));
    assert.equal(
      (await db.query("select id from public.habit_logs where habit_id=$1", [h])).rowCount,
      0,
    );
  });
  await as(b);
  const post = (await action("post", group, { body: "Hello", mentions: [a] })).id;
  await check("reactions do not duplicate", async () => {
    await action("react", group, { id: post });
    await action("react", group, { id: post });
    assert.equal(
      (await db.query("select * from public.norte_circle_reactions where post_id=$1", [post]))
        .rowCount,
      0,
    );
  });
  await as(a);
  await check("mention reaches only recipient", async () =>
    assert.equal(
      (
        await db.query(
          "select id from public.norte_social_notifications where circle_id=$1 and kind='mention'",
          [group],
        )
      ).rowCount,
      1,
    ),
  );
  const date = (await db.query("select to_char(current_date,'YYYY-MM-DD') as value")).rows[0].value;
  const challenge = (
    await action("challenge", group, {
      title: "QA",
      mode: "competitive",
      unit: "min",
      target: 100,
      start_date: date,
      end_date: date,
    })
  ).id;
  await as(b);
  await action("enroll", group, { id: challenge, habit_id: h });
  await check("enrollment retry is idempotent", async () => {
    await action("enroll", group, { id: challenge, habit_id: h });
    assert.equal(
      (
        await db.query("select * from public.norte_challenge_members where challenge_id=$1", [
          challenge,
        ])
      ).rowCount,
      1,
    );
  });
  await action("unshare", group, { habit_id: h });
  await as(a);
  await check("unsharing immediately removes visibility", async () =>
    assert.deepEqual(
      (await db.query("select public.norte_circle_progress($1) as value", [group])).rows[0].value,
      [],
    ),
  );
  await action("remove", group, { user_id: b });
  await as(b);
  await check("removed participant cannot reenter", () =>
    denied(() => action("join", null, { token, alias: "B" })),
  );
  await check("removed participant cannot read feed", async () =>
    assert.equal(
      (await db.query("select id from public.norte_circle_posts where circle_id=$1", [group]))
        .rowCount,
      0,
    ),
  );
  await as(c);
  await check("outsider cannot read challenge", () =>
    denied(() => db.query("select public.norte_challenge_progress($1)", [challenge])),
  );
  await check("direct privilege escalation denied", () =>
    denied(() =>
      db.query(
        "insert into public.norte_circle_members(circle_id,user_id,alias,status) values($1,$2,'X','active')",
        [group, c],
      ),
    ),
  );
  await db.query("rollback");
  console.log(`${passed} real-database checks passed; all fixtures rolled back.`);
  if (process.argv.includes("--apply") && !exists) {
    await db.query("begin");
    await db.query("set local lock_timeout='5s'");
    await db.query(migration);
    await db.query(
      "insert into supabase_migrations.schema_migrations(version,name,statements) values('0067','circles',$1)",
      [[migration]],
    );
    await db.query("notify pgrst, 'reload schema'");
    await db.query("commit");
    console.log("0067 applied and registered. Website not deployed.");
  }
} catch (e) {
  await db.query("rollback").catch(() => {});
  console.error("FAILED", e.code ?? "", e.message);
  process.exitCode = 1;
} finally {
  await db.end();
}
