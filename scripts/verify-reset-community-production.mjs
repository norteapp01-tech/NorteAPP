// stdin database URL; every temporary account and fixture is rolled back.
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
  new URL("../supabase/migrations/0070_reset_community_content.sql", import.meta.url),
  "utf8",
);
const sql = source.replace(/^begin;\s*$/m, "").replace(/^commit;\s*$/m, "");
try {
  await db.connect();
  await db.query("begin");
  await db.query("set local statement_timeout='15s'");
  const applied = (
    await db.query("select version from supabase_migrations.schema_migrations where version='0070'")
  ).rowCount;
  if (!applied) await db.query(sql);
  const [u, v, c, h] = Array.from({ length: 4 }, randomUUID);
  await db.query("insert into auth.users(id) values($1),($2)", [u, v]);
  await db.query("insert into norte_circles(id,owner_id,name) values($1,$2,'QA temporary')", [
    c,
    u,
  ]);
  await db.query(
    "insert into norte_circle_members(circle_id,user_id,alias,status) values($1,$2,'A','active'),($1,$3,'B','active')",
    [c, u, v],
  );
  await db.query("insert into habits(id,user_id,name) values($1,$2,'QA private')", [h, v]);
  await db.query("insert into habit_settings(user_id) values($1)", [u]);
  await db.query("select set_config('request.jwt.claim.sub',$1,true)", [u]);
  await db.query("set local role authenticated");
  await db.query("savepoint reset_guard");
  let blocked = false;
  try {
    await db.query("select reset_my_account_content()");
  } catch (e) {
    blocked = e.message.includes("Transfira");
  }
  await db.query("rollback to savepoint reset_guard");
  assert.ok(blocked);
  console.log("PASS reset requires ownership transfer when other members remain");
  await db.query("select norte_community_action('transfer',$1,$2)", [
    c,
    JSON.stringify({ user_id: v }),
  ]);
  await db.query("select reset_my_account_content()");
  await db.query("reset role");
  assert.equal(
    (await db.query("select id from norte_circles where id=$1 and owner_id=$2", [c, v])).rowCount,
    1,
  );
  console.log("PASS transferred group preserved");
  assert.equal(
    (
      await db.query("select user_id from norte_circle_members where circle_id=$1 and user_id=$2", [
        c,
        u,
      ])
    ).rowCount,
    0,
  );
  console.log("PASS reset removes personal membership");
  assert.equal(
    (await db.query("select user_id from habit_settings where user_id=$1", [u])).rowCount,
    0,
  );
  console.log("PASS personal habit preferences removed");
  assert.equal((await db.query("select id from habits where id=$1", [h])).rowCount, 1);
  console.log("PASS other account data preserved");
  await db.query("rollback");
  console.log("5 real-database checks passed; fixtures rolled back.");
  if (process.argv.includes("--apply") && !applied) {
    await db.query("begin");
    await db.query(sql);
    await db.query(
      "insert into supabase_migrations.schema_migrations(version,name,statements) values('0070','reset_community_content',$1)",
      [[sql]],
    );
    await db.query("notify pgrst, 'reload schema'");
    await db.query("commit");
    console.log("0070 applied and registered.");
  }
} catch (e) {
  await db.query("rollback").catch(() => {});
  console.error("FAILED", e.code ?? "", e.message);
  process.exitCode = 1;
} finally {
  await db.end();
}
