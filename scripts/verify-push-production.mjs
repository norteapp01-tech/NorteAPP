// stdin: database URL. All test rows are transactionally rolled back.
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
  new URL("../supabase/migrations/0069_push_delivery_receipts.sql", import.meta.url),
  "utf8",
);
const sql = source.replace(/^begin;\s*$/m, "").replace(/^commit;\s*$/m, "");
try {
  await db.connect();
  await db.query("begin");
  await db.query("set local statement_timeout='15s'");
  const exists = (await db.query("select to_regclass('public.push_delivery_receipts') as v"))
    .rows[0].v;
  if (!exists) await db.query(sql);
  const [u, r, s, t] = Array.from({ length: 4 }, randomUUID);
  await db.query("insert into auth.users(id) values($1)", [u]);
  await db.query(
    "insert into reminders(id,user_id,text,date,remind_at) values($1,$2,'QA temporary',current_date,now())",
    [r, u],
  );
  await db.query(
    "insert into push_subscriptions(id,user_id,endpoint,p256dh,auth) values($1,$2,'https://example.invalid/qa','fixture','fixture')",
    [s, u],
  );
  const claim =
    "update reminders set dispatch_token=$2,dispatch_claim_until=now()+interval '5 minutes' where id=$1 and notified_at is null and not done and (dispatch_claim_until is null or dispatch_claim_until<now()) returning id";
  assert.equal((await db.query(claim, [r, t])).rowCount, 1);
  console.log("PASS first worker acquires lease");
  assert.equal((await db.query(claim, [r, randomUUID()])).rowCount, 0);
  console.log("PASS active lease rejects second worker");
  await db.query(
    "update reminders set dispatch_claim_until=now()-interval '1 minute' where id=$1",
    [r],
  );
  assert.equal((await db.query(claim, [r, t])).rowCount, 1);
  console.log("PASS expired lease can be recovered");
  await db.query("set local role service_role");
  await db.query(
    "insert into push_delivery_receipts(reminder_id,subscription_id) values($1,$2) on conflict do nothing",
    [r, s],
  );
  await db.query(
    "insert into push_delivery_receipts(reminder_id,subscription_id) values($1,$2) on conflict do nothing",
    [r, s],
  );
  assert.equal(
    (await db.query("select * from push_delivery_receipts where reminder_id=$1", [r])).rowCount,
    1,
  );
  console.log("PASS service receipts are idempotent");
  await db.query("reset role");
  await db.query("select set_config('request.jwt.claim.sub',$1,true)", [u]);
  await db.query("set local role authenticated");
  await db.query("savepoint permission");
  let denied = false;
  try {
    await db.query("select * from push_delivery_receipts");
  } catch {
    denied = true;
  }
  await db.query("rollback to savepoint permission");
  assert.ok(denied);
  console.log("PASS device receipts inaccessible to users");
  await db.query("reset role");
  await db.query("delete from reminders where id=$1", [r]);
  assert.equal(
    (await db.query("select * from push_delivery_receipts where reminder_id=$1", [r])).rowCount,
    0,
  );
  console.log("PASS removal cleans receipts");
  await db.query("rollback");
  console.log("6 real-database checks passed; fixtures rolled back.");
  if (process.argv.includes("--apply") && !exists) {
    await db.query("begin");
    await db.query("set local lock_timeout='5s'");
    await db.query(sql);
    await db.query(
      "insert into supabase_migrations.schema_migrations(version,name,statements) values('0069','push_delivery_receipts',$1)",
      [[sql]],
    );
    await db.query("notify pgrst, 'reload schema'");
    await db.query("commit");
    console.log("0069 applied; dispatch function NOT deployed.");
  }
} catch (e) {
  await db.query("rollback").catch(() => {});
  console.error("FAILED", e.code ?? "", e.message);
  process.exitCode = 1;
} finally {
  await db.end();
}
