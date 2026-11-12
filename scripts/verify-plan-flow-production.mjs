// Validate the previously pending 0062 migration before releasing the combined branch.
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
const sql = await fs.readFile(
  new URL("../supabase/migrations/0062_plan_flow.sql", import.meta.url),
  "utf8",
);
async function denied(query, values) {
  await db.query("savepoint expected");
  let error;
  try {
    await db.query(query, values);
  } catch (e) {
    error = e;
  }
  await db.query("rollback to savepoint expected");
  assert.ok(error);
}
try {
  await db.connect();
  await db.query("begin");
  await db.query("set local statement_timeout='15s'");
  const applied = (
    await db.query("select version from supabase_migrations.schema_migrations where version='0062'")
  ).rowCount;
  if (!applied) await db.query(sql);
  const [u, v, g1, g2, g3, e1, e2, e3, e4] = Array.from({ length: 9 }, randomUUID);
  await db.query("insert into auth.users(id) values($1),($2)", [u, v]);
  await db.query(
    "insert into goals(id,user_id,title,category,life_area) values($1,$4,'QA','Trabalho','Trabalho'),($2,$4,'QA 2','Trabalho','Trabalho'),($3,$5,'QA private','Trabalho','Trabalho')",
    [g1, g2, g3, u, v],
  );
  for (const [id, owner, goal] of [
    [e1, u, g1],
    [e2, u, g1],
    [e3, u, g2],
    [e4, v, g3],
  ])
    await db.query(
      "insert into executions(id,user_id,goal_id,title,due_date,agenda_date,start_time,category) values($1,$2,$3,'QA temporary',current_date,current_date,'10:00','Trabalho')",
      [id, owner, goal],
    );
  await db.query("select set_config('request.jwt.claim.sub',$1,true)", [u]);
  await db.query("set local role authenticated");
  assert.equal(
    (
      await db.query("update executions set depends_on_execution_id=$2 where id=$1 returning id", [
        e1,
        e2,
      ])
    ).rowCount,
    1,
  );
  console.log("PASS same-plan dependency accepted");
  await denied("update executions set depends_on_execution_id=$2 where id=$1", [e2, e1]);
  console.log("PASS dependency cycle refused");
  await denied("update executions set depends_on_execution_id=id where id=$1", [e2]);
  console.log("PASS self dependency refused");
  await denied("update executions set depends_on_execution_id=$2 where id=$1", [e1, e3]);
  console.log("PASS different-plan dependency refused");
  await denied("update executions set depends_on_execution_id=$2 where id=$1", [e1, e4]);
  console.log("PASS different-account dependency refused");
  await denied("update executions set plan_work_status='invalid' where id=$1", [e1]);
  console.log("PASS invalid status refused");
  await denied("update executions set reschedule_count=-1 where id=$1", [e1]);
  console.log("PASS invalid reschedule count refused");
  await db.query("rollback");
  console.log("7 real-database checks passed; fixtures rolled back.");
  if (process.argv.includes("--apply") && !applied) {
    await db.query("begin");
    await db.query("set local lock_timeout='5s'");
    await db.query(sql);
    await db.query(
      "insert into supabase_migrations.schema_migrations(version,name,statements) values('0062','plan_flow',$1)",
      [[sql]],
    );
    await db.query("notify pgrst, 'reload schema'");
    await db.query("commit");
    console.log("0062 applied and registered.");
  }
} catch (e) {
  await db.query("rollback").catch(() => {});
  console.error("FAILED", e.code ?? "", e.message);
  process.exitCode = 1;
} finally {
  await db.end();
}
