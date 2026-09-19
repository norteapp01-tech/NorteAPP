// Isolated browser fixtures. All Supabase requests are intercepted; no real
// user account or production workout is created or changed.
import { chromium } from "playwright";
import assert from "node:assert/strict";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const tables = {};
tables.workout_plans = [
  { id: "p1", letter: "A", name: "Superior", lineage_id: "p1", order_index: 0 },
];
tables.workout_exercises = [
  { id: "e1", name: "Supino reto", muscle_group: "peito", equipment: "barra" },
  { id: "e2", name: "Agachamento livre", muscle_group: "quadriceps", equipment: "barra" },
  { id: "e3", name: "Elevação lateral", muscle_group: "ombros", equipment: "halteres" },
].map((e, i) => ({
  ...e,
  plan_id: "p1",
  lineage_id: e.id,
  order_index: i,
  sets_target: 3,
  reps_target: 8,
  load_target: 20,
  secondary_muscles: [],
}));
tables.workout_sessions = [];
tables.workout_exercise_logs = [];
tables.workout_set_logs = [];
for (let i = 0; i < 6; i++) {
  const date = new Date();
  date.setDate(date.getDate() - 24 + i * 4);
  const day = date.toISOString().slice(0, 10);
  tables.workout_sessions.push({
    id: `s${i}`,
    plan_id: "p1",
    date: day,
    started_at: `${day}T10:00:00Z`,
    status: "concluido",
    plan_label: "A · Superior",
  });
  for (let j = 0; j < 3; j++) {
    const id = `l${i}-${j}`;
    tables.workout_exercise_logs.push({
      id,
      session_id: `s${i}`,
      exercise_id: `e${j + 1}`,
      done: true,
    });
    for (let k = 0; k < 3; k++)
      tables.workout_set_logs.push({
        id: `${id}-${k}`,
        exercise_log_id: id,
        set_index: k,
        reps: 8,
        weight: j === 2 ? 10 : 50 + i * 2 + j * 20,
      });
  }
}
await page.route("**/*", async (route) => {
  const url = new URL(route.request().url());
  if (url.pathname.includes("/auth/v1/")) {
    const user = {
      id: "00000000-0000-4000-a000-000000000001",
      aud: "authenticated",
      role: "authenticated",
      is_anonymous: true,
    };
    const token = [
      { alg: "HS256", typ: "JWT" },
      { sub: user.id, exp: Math.floor(Date.now() / 1000) + 3600 },
      "fixture",
    ]
      .map((x) => Buffer.from(typeof x === "string" ? x : JSON.stringify(x)).toString("base64url"))
      .join(".");
    return route.fulfill({
      json: {
        access_token: token,
        refresh_token: "fixture",
        token_type: "bearer",
        expires_in: 3600,
        user,
      },
    });
  }
  if (url.pathname.includes("/rest/v1/"))
    return route.fulfill({ json: tables[url.pathname.split("/").at(-1)] ?? [] });
  if (url.hostname !== "127.0.0.1" && url.hostname !== "localhost") return route.abort();
  return route.continue();
});
try {
  await page.goto(
    `${process.env.APP_URL ?? "http://127.0.0.1:8080"}/sub-agenda/academia?aba=evolucao`,
  );
  await page.getByRole("button", { name: "Corpo", exact: true }).waitFor();
  await page.screenshot({ path: "/tmp/norte-corpo.png", fullPage: true });
  assert.equal(
    await page.locator("body").evaluate((el) => el.scrollWidth > innerWidth),
    false,
    "No horizontal overflow",
  );
  await page.getByRole("button", { name: "Costas", exact: true }).click();
  await page.getByRole("group", { name: "Mapa muscular: costas" }).waitFor();
  await page.screenshot({ path: "/tmp/norte-evolution-back.png", fullPage: true });
  assert.equal(await page.getByRole("button", { name: /Trapézio · região superior/ }).count(), 2);
  assert.equal(await page.getByRole("button", { name: /Lombar · eretores/ }).count(), 2);
  await page.getByRole("button", { name: "Frente", exact: true }).click();
  await page.getByLabel("Selecionar músculo", { exact: true }).selectOption("peito");
  await page.getByRole("heading", { name: "Por exercício", exact: true }).waitFor();
  assert.equal(
    await page.getByRole("button", { name: "Corpo", exact: true }).getAttribute("aria-pressed"),
    "true",
  );
  await page.getByRole("button", { name: "Progressão", exact: true }).click();
  await page.getByRole("button", { name: /Supino reto.*sessões/ }).click();
  await page.getByRole("heading", { name: "Sua progressão" }).waitFor();
  await page.getByText("Melhor registro", { exact: true }).waitFor();
  await page.screenshot({ path: "/tmp/norte-exercise-analysis.png", fullPage: true });
  await page.keyboard.press("Escape");
  await page.getByText("Perfil de repetições", { exact: false }).first().click();
  await page.getByRole("button", { name: /6–12 repetições/ }).click();
  await page.screenshot({ path: "/tmp/norte-corpo-selected.png", fullPage: true });
  await page.setViewportSize({ width: 320, height: 740 });
  assert.equal(
    await page.locator("body").evaluate((el) => el.scrollWidth > innerWidth),
    false,
    "Loaded dashboard fits at 320px",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Desempenho", exact: true }).click();
  await page.getByRole("heading", { name: "Evolução de força", exact: true }).waitFor();
  await page.getByRole("button", { name: /Limpar filtro: Peito/ }).click();
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({ path: "/tmp/norte-desempenho.png", fullPage: true });
  await page.getByRole("button", { name: "Carga", exact: true }).click();
  await page.getByLabel("Referência de comparação").waitFor();
  await page.getByRole("button", { name: "Revisar próximo treino", exact: true }).click();
  await page.getByRole("tab", { name: "Evolução", exact: true }).click();
  await page.getByRole("button", { name: "Personalizar", exact: true }).click();
  await page.getByLabel("Início do período").fill("2020-01-01");
  await page.getByLabel("Fim do período").fill("2020-01-31");
  await page.getByRole("heading", { name: "Sem registros neste período" }).waitFor();
  await page.evaluate(() => {
    document.documentElement.dataset.theme = "light";
    document.documentElement.classList.remove("dark");
  });
  await page.screenshot({ path: "/tmp/norte-evolution-light-empty.png", fullPage: true });
  await page.setViewportSize({ width: 320, height: 740 });
  assert.equal(
    await page.locator("body").evaluate((el) => el.scrollWidth > innerWidth),
    false,
    "No horizontal overflow at 320px",
  );
  assert.deepEqual(errors, [], "No runtime errors");
  console.log(
    "PASS: body/back, muscle selection, performance chart, metric switch, review workout, custom empty period, no overflow or runtime errors.",
  );
} finally {
  await browser.close();
}
