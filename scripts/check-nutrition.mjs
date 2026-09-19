import { chromium } from "playwright";
import assert from "node:assert/strict";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const meals = ["Café da manhã", "Lanche da manhã", "Almoço", "Lanche da tarde", "Jantar"].map(
  (name, i) => ({
    id: String(i),
    name,
    time: ["07:00", "10:00", "12:30", "16:00", "20:00"][i],
    weekdays: [0, 1, 2, 3, 4, 5, 6],
    order_index: i,
  }),
);
const logs = Array.from({ length: 30 }, (_, i) => {
  const d = new Date();
  d.setDate(d.getDate() - i);
  return {
    id: String(i),
    meal_id: "0",
    date: d.toLocaleDateString("en-CA"),
    source: "custom",
    description: "Iogurte com granola e banana",
    protein: 90 + (i % 6) * 10,
    carbs: 250,
    fat: 65,
    calories: 2300,
    confirmed_at: d.toISOString(),
  };
});
const tables = {
  meals,
  meal_logs: logs,
  nutrition_goals: { protein: 120, carbs: 260, fat: 70, calories: 2380 },
};
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
try {
  await page.goto("http://127.0.0.1:5173/sub-agenda/alimentacao");
  await page.getByRole("heading", { name: "Metas de hoje" }).waitFor();
  await page.screenshot({ path: "/tmp/nutrition-today.png", fullPage: true });
  await page.getByRole("button", { name: /Metas de hoje/ }).click();
  assert.equal(await page.locator("#nutrition-daily-goals").count(), 0);
  await page.getByRole("tab", { name: "Análise", exact: true }).click();
  await page.getByRole("heading", { name: "Consistência", exact: true }).waitFor();
  await page.screenshot({ path: "/tmp/nutrition-analysis.png", fullPage: true });
  await page.getByRole("button", { name: "Próximo nutriente", exact: true }).click();
  assert.equal(await page.getByLabel("Nutriente", { exact: true }).inputValue(), "1");
  await page.getByRole("button", { name: "3 meses", exact: true }).click();
  assert.equal(await page.locator("body").evaluate((el) => el.scrollWidth > innerWidth), false);
  await page.getByRole("button", { name: "Ver detalhes →", exact: true }).click();
  await page
    .getByRole("heading", { name: "Regularidade das refeições", exact: true })
    .last()
    .waitFor();
  assert.deepEqual(errors, []);
  console.log("Nutrition mobile interactions passed");
} finally {
  await browser.close();
}
