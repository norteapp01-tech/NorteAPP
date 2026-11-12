// Isolated PostgreSQL authorization/idempotency checks. No production credentials.
import fs from "node:fs/promises";
import assert from "node:assert/strict";
const { PGlite } = await import(process.env.PGLITE_MODULE || "@electric-sql/pglite");
const db = new PGlite();
try {
  await db.exec(`create role anon;create role authenticated;create schema auth;
 create table auth.users(id uuid primary key);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema auth to anon,authenticated; grant execute on function auth.uid() to anon,authenticated;
 create table public.habits(id uuid primary key,user_id uuid references auth.users(id),name text,measure text,unit text,archived_at timestamptz,unique(id,user_id));
 create table public.habit_logs(id uuid primary key default gen_random_uuid(),habit_id uuid,user_id uuid,local_date date,value numeric not null,deleted_at timestamptz,idempotency_key text unique);
 create function public.log_habit(p_habit uuid,p_date date,p_status text default 'recorded',p_value numeric default 0,p_duration integer default null,p_note text default '',p_reason text default null,p_feeling text default null,p_checks text[] default '{}',p_source text default 'manual',p_source_ref text default null,p_idempotency_key text default null,p_time_zone text default null,p_occurred_at timestamptz default now()) returns public.habit_logs language plpgsql as $$declare r public.habit_logs;begin insert into public.habit_logs(habit_id,user_id,local_date,value,idempotency_key) values(p_habit,auth.uid(),p_date,p_value,p_idempotency_key) on conflict(idempotency_key) do update set idempotency_key=excluded.idempotency_key returning * into r;return r;end$$;`);
  await db.exec(
    await fs.readFile(
      new URL("../supabase/migrations/0068_habit_automation.sql", import.meta.url),
      "utf8",
    ),
  );
  const a = "11111111-1111-4111-8111-111111111111",
    b = "22222222-2222-4222-8222-222222222222",
    h = "33333333-3333-4333-8333-333333333333";
  await db.query("insert into auth.users values($1),($2)", [a, b]);
  await db.query(
    "insert into habits(id,user_id,name,measure,unit) values($1,$2,'Leitura','quantity','páginas')",
    [h, a],
  );
  async function as(user, role = "authenticated") {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [user]);
    await db.exec(`set role ${role}`);
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
  let passed = 0;
  async function check(name, fn) {
    await fn();
    passed++;
    console.log("PASS", name);
  }
  await as(a);
  const read = await manage("create", { name: "Consulta", habit_id: h });
  const write = await manage("create", { name: "Registro", habit_id: h, can_log: true });
  await check("hash inaccessible to authenticated user", () =>
    assert.rejects(db.query("select token_hash from norte_automation_keys")),
  );
  await as(b);
  await check("another user cannot create key for a private habit", () =>
    assert.rejects(manage("create", { name: "Invalid", habit_id: h })),
  );
  await check("key metadata isolated", async () =>
    assert.equal((await db.query("select id,name from norte_automation_keys")).rows.length, 0),
  );
  await manage("revoke", { id: write.id });
  await as("", "anon");
  await check("anonymous user cannot create keys", () =>
    assert.rejects(manage("create", { name: "No", habit_id: h })),
  );
  await check("invalid key rejected", () => assert.rejects(call("invalid", "read")));
  await check("read returns only scoped habit metadata", async () =>
    assert.deepEqual(await call(read.token, "read"), {
      id: h,
      name: "Leitura",
      measure: "quantity",
      unit: "páginas",
    }),
  );
  await check("read-only key cannot write", () =>
    assert.rejects(call(read.token, "log", { request_id: "first", value: 1 })),
  );
  await check("idempotency key required", () =>
    assert.rejects(call(write.token, "log", { value: 20 })),
  );
  await check("future date refused", () =>
    assert.rejects(
      call(write.token, "log", { value: 20, request_id: "future", date: "2099-01-01" }),
    ),
  );
  const first = await call(write.token, "log", {
    request_id: "same-action",
    value: 20,
    user_id: b,
    habit_id: b,
  });
  await check("retries return the same record", async () =>
    assert.equal(
      (await call(write.token, "log", { request_id: "same-action", value: 20 })).id,
      first.id,
    ),
  );
  await check("caller identity restored", async () =>
    assert.equal((await db.query("select auth.uid() as id")).rows[0].id, null),
  );
  await db.exec("reset role");
  await check("payload cannot change the authorized owner or habit", async () => {
    const r = (await db.query("select * from habit_logs")).rows;
    assert.equal(r.length, 1);
    assert.equal(r[0].user_id, a);
    assert.equal(r[0].habit_id, h);
  });
  await db.query("update norte_automation_keys set minute_count=60 where id=$1", [write.id]);
  await as("", "anon");
  await check("rate limit enforced", () => assert.rejects(call(write.token, "read")));
  await as(a);
  await manage("revoke", { id: write.id });
  await as("", "anon");
  await check("revocation takes effect immediately", () =>
    assert.rejects(call(write.token, "read")),
  );
  await db.exec("reset role");
  await db.query(
    "update norte_automation_keys set expires_at=now()-interval '1 hour' where id=$1",
    [read.id],
  );
  await as("", "anon");
  await check("expired key refused", () => assert.rejects(call(read.token, "read")));
  console.log(`${passed} automation checks passed (isolated database).`);
} finally {
  await db.close();
}
