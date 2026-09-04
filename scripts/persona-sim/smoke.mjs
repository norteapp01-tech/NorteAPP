import { chromium } from "playwright";
import * as A from "./lib/actions.mjs";

const BASE = process.env.NORTE_BASE_URL || "http://localhost:8080";

const browser = await chromium.launch();
const context = await browser.newContext();
const page = await context.newPage();
const consoleErrors = [];
page.on("pageerror", (e) => consoleErrors.push("pageerror: " + e.message));
page.on("console", (msg) => {
  if (msg.type() === "error") consoleErrors.push("console.error: " + msg.text());
});
page.on("requestfailed", (req) => {
  consoleErrors.push(`requestfailed: ${req.method()} ${req.url()} :: ${req.failure()?.errorText}`);
});
page.on("response", (res) => {
  if (res.status() >= 400) {
    consoleErrors.push(`http ${res.status()}: ${res.request().method()} ${res.url()}`);
  }
});

const results = [];
async function run(label, fn) {
  const r = await A.withResult(label, fn);
  results.push(r);
  console.log(r.ok ? `OK   ${label}` : `FAIL ${label} :: ${r.error}`);
  if (!r.ok) {
    await page
      .screenshot({
        path: `/tmp/smoke-fail-${label.replace(/[^a-z0-9]/gi, "_")}.png`,
        fullPage: true,
      })
      .catch(() => {});
  }
}

const now = Date.now();

await run("open app", async () => {
  await A.goto(page, BASE, "/");
});

await run("checkin mood", async () => {
  await A.checkinMood(page, "Normal");
});

await run("quick agenda item", async () => {
  const d = new Date();
  const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  await A.quickAgendaItem(page, BASE, {
    title: "Smoke agenda " + now,
    date: iso,
    startTime: "10:00",
    endTime: "11:00",
  });
});

await run("create goal via criar", async () => {
  await A.createGoalViaCriar(page, BASE, {
    title: "Smoke goal " + now,
    area: "Saúde",
    preset: "Mês",
  });
});

await run("add book", async () => {
  await A.addBook(page, BASE, { title: "Smoke book " + now, totalPages: 150 });
});

await run("reading session", async () => {
  const r = await A.readingSession(page, BASE, { pagesRead: 10 });
  if (r !== "logged") throw new Error("unexpected result: " + r);
});

await run("workout plan create", async () => {
  await A.ensureWorkoutPlan(page, BASE, {
    letter: "S",
    name: "Smoke Treino " + now,
    muscleGroups: "Peito",
  });
});

await run("assign workout day", async () => {
  await A.assignWorkoutDay(page, BASE, { weekdayLabel: "Seg", planName: "Smoke Treino " + now });
});

await run("run today workout (may be rest day)", async () => {
  const r = await A.runTodayWorkout(page, BASE);
  console.log("   workout result:", r);
});

await run("log body weight", async () => {
  await A.logBodyWeight(page, BASE, 70.5);
});

await run("confirm meal", async () => {
  const r = await A.confirmAnyMeal(page, BASE);
  console.log("   meal result:", r);
});

await run("quick add transaction", async () => {
  await A.quickAddTransaction(page, BASE, "gastei 20 reais com uber");
});

await run("add notebook entry", async () => {
  await A.addNotebookEntry(page, BASE, "Smoke reflexão " + now);
});

console.log("\n=== SUMMARY ===");
const fails = results.filter((r) => !r.ok);
console.log(`${results.length - fails.length}/${results.length} passed`);
if (fails.length) {
  console.log("FAILURES:");
  for (const f of fails) console.log(" -", f.label, "::", f.error);
}
console.log("\nCONSOLE/PAGE ERRORS:", consoleErrors.length);
for (const e of consoleErrors) console.log(" -", e);

await browser.close();
process.exit(fails.length > 0 ? 1 : 0);
