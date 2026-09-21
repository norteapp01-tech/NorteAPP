// Visual/interaction audit with isolated fixtures. Never writes production data.
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
const out = "/tmp/norte-harmony";
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({
  viewport: { width: 390, height: 844 },
  reducedMotion: "reduce",
});
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.addInitScript(() => sessionStorage.setItem("norte-welcome-entered", "true"));
const day = new Date().toLocaleDateString("en-CA");
const tables = {
  meals: ["Café da manhã", "Almoço", "Jantar"].map((name, i) => ({
    id: `m${i}`,
    name,
    time: ["07:00", "12:00", "20:00"][i],
    weekdays: [0, 1, 2, 3, 4, 5, 6],
    order_index: i,
  })),
  meal_logs: Array.from({ length: 30 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - i);
    return {
      id: `ml${i}`,
      meal_id: "m0",
      date: d.toLocaleDateString("en-CA"),
      source: "custom",
      description: "Iogurte e frutas",
      protein: 100 + (i % 5) * 10,
      carbs: 230,
      fat: 65,
      calories: 2200,
      confirmed_at: d.toISOString(),
    };
  }),
  nutrition_goals: { protein: 120, carbs: 260, fat: 70, calories: 2380 },
  transactions: [
    {
      id: "t1",
      type: "income",
      amount: 4500,
      description: "Salário",
      category: "Salário",
      date: day,
    },
    {
      id: "t2",
      type: "expense",
      amount: 450,
      description: "Mercado",
      category: "Alimentação",
      date: day,
    },
    {
      id: "t3",
      type: "expense",
      amount: 120,
      description: "Transporte",
      category: "Transporte",
      date: day,
    },
  ],
  reading_books: [
    {
      id: "b1",
      title: "Hábitos Atômicos",
      authors: ["James Clear"],
      format: "physical",
      progress_mode: "pages",
      total_pages: 320,
      current_page: 188,
      status: "reading",
      created_at: new Date().toISOString(),
    },
  ],
  notebook_entries: [
    {
      id: "n1",
      type: "gratidao",
      title: "Um encontro importante",
      content: "Hoje reservei um tempo para agradecer pela minha família.",
      tags: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ],
};
tables.sport_activities = Array.from({ length: 8 }, (_, i) => {
  const date = new Date();
  date.setDate(date.getDate() - i * 3);
  return {
    id: `run-${i}`,
    modality: "corrida",
    source: "manual",
    title: "Corrida no parque",
    started_at: date.toISOString(),
    ended_at: date.toISOString(),
    active_duration_s: 1800 + i * 60,
    total_duration_s: 1800 + i * 60,
    distance_m: 5000,
    avg_pace_s_per_km: 360 + i * 12,
    avg_speed_kmh: 10,
    created_at: date.toISOString(),
    updated_at: date.toISOString(),
  };
});
const tomorrowDate = new Date();
tomorrowDate.setDate(tomorrowDate.getDate() + 1);
const tomorrow = tomorrowDate.toLocaleDateString("en-CA");
tables.profiles = { mood_date: day, mood_extra_execution_ids: ["extra"], water_goal_ml: 2000 };
tables.executions = [
  {
    id: "today-task",
    title: "Preparar a semana",
    due_date: day,
    agenda_date: day,
    start_time: "18:00",
  },
  { id: "extra", title: "Revisar minhas anotações", due_date: tomorrow },
].map((task) => ({
  ...task,
  category: "generico",
  status: "planejada",
  weight: "media",
  rigid: false,
  created_at: new Date().toISOString(),
}));
tables.transactions = tables.transactions.map((t) => ({
  ...t,
  created_at: new Date().toISOString(),
}));
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
  if (!["127.0.0.1", "localhost"].includes(url.hostname)) return route.abort();
  return route.continue();
});
const routes = [
  ["hoje", "/"],
  ["agenda", "/agenda"],
  ["planos", "/planejamento"],
  ["espelho", "/dashboard"],
  ["esportes", "/sub-agenda/esportes"],
  ["academia", "/sub-agenda/academia"],
  ["alimentacao", "/sub-agenda/alimentacao"],
  ["financas", "/sub-agenda/financas"],
  ["leitura", "/sub-agenda/leitura"],
  ["fe", "/sub-agenda/fe"],
  ["criar", "/criar"],
].filter(
  ([name]) => !process.env.AUDIT_ROUTES || process.env.AUDIT_ROUTES.split(",").includes(name),
);
async function check(name) {
  assert.equal(
    await page.locator("body").evaluate((el) => el.scrollWidth > innerWidth),
    false,
    `${name}: horizontal overflow`,
  );
  assert.equal(
    await page.getByText("Algo travou aqui", { exact: true }).count(),
    0,
    `${name}: error boundary`,
  );
  assert.equal(await page.locator(".norte-app").count(), 1, `${name}: app loaded`);
  await page.screenshot({ path: `${out}/${name}.png`, fullPage: true });
}
try {
  for (const theme of ["dark", "light"]) {
    for (const [name, route] of routes) {
      await page.goto(`${process.env.APP_URL ?? "http://127.0.0.1:8080"}${route}`);
      await page.locator(".norte-app").waitFor();
      await page.locator("h1").first().waitFor();
      await page.evaluate((theme) => {
        document.documentElement.dataset.theme = theme;
        document.documentElement.classList.toggle("dark", theme === "dark");
        document.documentElement.style.colorScheme = theme;
      }, theme);
      await page.waitForTimeout(200);
      await check(`${theme}-${name}`);
      await page.setViewportSize({ width: 320, height: 740 });
      await check(`${theme}-${name}-320`);
      await page.setViewportSize({ width: 390, height: 844 });
      if (name === "alimentacao") {
        await page.getByRole("tab", { name: "Análise", exact: true }).click();
        await page.getByRole("heading", { name: "Consistência", exact: true }).waitFor();
        await check(`${theme}-nutrition-analysis`);
        await page.getByRole("button", { name: "Próximo nutriente", exact: true }).click();
        assert.equal(await page.getByLabel("Nutriente", { exact: true }).inputValue(), "1");
      }
      if (name === "hoje") {
        const extras = page.locator("details").filter({ hasText: "Extras de hoje" });
        assert.equal(await extras.getAttribute("open"), null);
        await extras.locator("summary").focus();
        await page.keyboard.press("Enter");
        await extras.getByText("Revisar minhas anotações", { exact: true }).waitFor();
        await extras.locator("summary").click();
        await extras
          .getByText("Revisar minhas anotações", { exact: true })
          .waitFor({ state: "hidden" });
      }
      if (name === "financas") {
        const recent = page.locator("details").filter({ hasText: "Gastos recentes" });
        assert.equal(await recent.getAttribute("open"), null, "Recent expenses starts collapsed");
        assert.equal(await recent.getByText("Mercado", { exact: true }).isVisible(), false);
        await recent.locator("summary").focus();
        await page.keyboard.press("Enter");
        await recent.getByText("Mercado", { exact: true }).waitFor();
        await recent.locator("summary").click();
        await recent.getByText("Mercado", { exact: true }).waitFor({ state: "hidden" });
        await page
          .locator(".finance-distribution button")
          .filter({ hasText: "Alimentação" })
          .click();
        await recent.getByText("Mercado", { exact: true }).waitFor();
        assert.equal(await recent.getByText("Transporte", { exact: true }).count(), 0);
        await check(`${theme}-finance-category-drawer`);
        await recent.getByRole("button", { name: "Limpar filtro" }).click();
        await recent.getByText("Transporte", { exact: true }).waitFor();
        await page.getByRole("button", { name: "Próximo mês", exact: true }).click();
        await page.getByText("O gráfico começa com o primeiro gasto").waitFor();
        await page.getByRole("button", { name: "Mês anterior", exact: true }).click();
        await recent.locator("summary").waitFor();
        assert.equal(
          await recent.getAttribute("open"),
          null,
          "Month change resets drawer and category",
        );
        await page.getByRole("tab", { name: "Visão", exact: true }).focus();
        await page.keyboard.press("ArrowRight");
        assert.equal(
          await page
            .getByRole("tab", { name: "Registros", exact: true })
            .getAttribute("aria-selected"),
          "true",
        );
        await check(`${theme}-finance-movements`);
      }
      console.log(`PASS ${theme} ${name}`);
    }
  }
  assert.deepEqual(errors, [], "No runtime errors");
  console.log(
    `PASS: ${routes.length} routes, both themes, 320/390px, charts, keyboard tabs and disclosure interactions. Screenshots: ${out}`,
  );
} catch (error) {
  console.error(errors);
  await page.screenshot({ path: `${out}/failure.png`, fullPage: true });
  throw error;
} finally {
  await browser.close();
}
