// Run with PGLITE_MODULE pointing to an installed @electric-sql/pglite entry.
// Isolated PostgreSQL; never connects to production.
import fs from "node:fs/promises";
import assert from "node:assert/strict";
const { PGlite } = await import(process.env.PGLITE_MODULE || "@electric-sql/pglite");
const db = new PGlite();
await db.exec(`
 create role anon; create role authenticated; create schema auth;
 create table auth.users(id uuid primary key);
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;
 create table public.habits(id uuid primary key,user_id uuid references auth.users(id),name text,unit text,measure text,intent text,archived_at timestamptz,unique(id,user_id));
 create table public.habit_logs(id uuid primary key default gen_random_uuid(),habit_id uuid references public.habits(id),value numeric,status text,local_date date,occurred_at timestamptz default now(),deleted_at timestamptz,note text);
 alter table public.habits enable row level security; alter table public.habit_logs enable row level security;
 grant select on public.habits,public.habit_logs to authenticated;
 create policy private_habits on public.habits to authenticated using(user_id=auth.uid());
 create policy private_logs on public.habit_logs to authenticated using(exists(select 1 from public.habits h where h.id=habit_id));
`);
await db.exec(
  await fs.readFile(new URL("../supabase/migrations/0067_circles.sql", import.meta.url), "utf8"),
);
const A = "11111111-1111-4111-8111-111111111111",
  B = "22222222-2222-4222-8222-222222222222",
  C = "33333333-3333-4333-8333-333333333333",
  H = "44444444-4444-4444-8444-444444444444";
await db.query("insert into auth.users values ($1),($2),($3)", [A, B, C]);
await db.query("insert into habits values($1,$2,'Leitura','min','duration','build',null)", [H, B]);
async function as(user) {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [user]);
  await db.exec("set role authenticated");
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
let passed = 0;
async function check(name, fn) {
  await fn();
  passed++;
  console.log("PASS", name);
}
await as(A);
const circle = (await action("create", null, { name: "Leitura juntos", alias: "Ana" })).id;
const token = (await db.query("select invite_token from norte_circles")).rows[0].invite_token;
await check("owner is active", async () =>
  assert.equal(
    (await db.query("select status from norte_circle_members")).rows[0].status,
    "active",
  ),
);
await as(B);
await check("outsider cannot read circle", async () =>
  assert.equal((await db.query("select * from norte_circles")).rows.length, 0),
);
await check("join waits for approval", async () =>
  assert.equal((await action("join", null, { token, alias: "Bia" })).status, "pending"),
);
await check("pending user cannot post", async () =>
  assert.rejects(action("post", circle, { body: "hello" })),
);
await as(A);
await action("approve", circle, { user_id: B });
await as(B);
await check("member cannot change owner settings", async () =>
  assert.rejects(action("update", circle, { auto_approve: true })),
);
await action("share", circle, { habit_id: H });
await db.exec("reset role");
await db.query(
  "insert into habit_logs(habit_id,value,status,local_date,note) values($1,20,'recorded',current_date,'PRIVATE NOTE')",
  [H],
);
await as(A);
await check("shared summary contains no private notes", async () => {
  const rows = (await db.query("select norte_circle_progress($1) as v", [circle])).rows[0].v;
  assert.equal(rows[0].value, 20);
  assert.ok(!JSON.stringify(rows).includes("PRIVATE"));
  assert.equal((await db.query("select * from habit_logs")).rows.length, 0);
});
await as(B);
const post = (await action("post", circle, { body: "Hoje li!", mentions: [A] })).id;
await check("reaction toggles without duplicates", async () => {
  await action("react", circle, { id: post });
  await action("react", circle, { id: post });
  assert.equal((await db.query("select * from norte_circle_reactions")).rows.length, 0);
});
await as(A);
await check("mention notification created", async () =>
  assert.equal(
    (await db.query("select * from norte_social_notifications where kind='mention'")).rows.length,
    1,
  ),
);
const now = new Date().toISOString().slice(0, 10);
const challenge = (
  await action("challenge", circle, {
    title: "Leitura",
    mode: "cooperative",
    unit: "min",
    target: 100,
    start_date: now,
    end_date: now,
  })
).id;
await as(B);
await action("enroll", circle, { id: challenge, habit_id: H });
await db.exec("reset role");
await db.query(
  "insert into habit_logs(habit_id,value,status,local_date) values($1,30,'recorded',current_date)",
  [H],
);
await as(A);
await check("challenge counts logs since enrollment only", async () =>
  assert.equal(
    (await db.query("select norte_challenge_progress($1) as v", [challenge])).rows[0].v[0].value,
    30,
  ),
);
await check("support rate limit", async () => {
  await action("support", circle, { user_id: B });
  await action("support", circle, { user_id: B });
});
await as(B);
assert.equal(
  (await db.query("select * from norte_social_notifications where kind='support'")).rows.length,
  1,
);
await action("unshare", circle, { habit_id: H });
await as(A);
await check("revocation removes summary immediately", async () =>
  assert.deepEqual(
    (await db.query("select norte_circle_progress($1) as v", [circle])).rows[0].v,
    [],
  ),
);
await action("remove", circle, { user_id: B });
await as(B);
await check("removed member loses access and cannot reuse invite", async () => {
  assert.equal((await db.query("select * from norte_circle_posts")).rows.length, 0);
  await assert.rejects(action("join", null, { token, alias: "Bia" }));
});
await as(C);
await check("outsider cannot access challenge summaries", async () =>
  assert.rejects(db.query("select norte_challenge_progress($1)", [challenge])),
);
await check("direct member insertion forbidden", async () =>
  assert.rejects(
    db.query(
      "insert into norte_circle_members(circle_id,user_id,alias,status) values($1,$2,'X','active')",
      [circle, C],
    ),
  ),
);
console.log(`${passed} checks passed`);
await db.close();
