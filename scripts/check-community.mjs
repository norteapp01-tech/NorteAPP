// Browser checks with isolated fixtures, not a production integration test.
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
const browser = await chromium.launch({ headless: true });
const output = "/tmp/norte-community-review";
await mkdir(output, { recursive: true });
let passed = 0;
try {
  for (const width of [360, 390, 430, 1280])
    for (const theme of ["dark", "light"]) {
      const page = await browser.newPage({
        viewport: { width, height: 900 },
        reducedMotion: "reduce",
      });
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
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
        .map((x) =>
          Buffer.from(typeof x === "string" ? x : JSON.stringify(x)).toString("base64url"),
        )
        .join(".");
      const circle = {
        id: "group",
        name: "Leitura juntos",
        description: "Um pouco todo dia",
        owner_id: user.id,
        invite_token: "00000000-0000-4000-a000-000000000002",
        auto_approve: false,
        archived: false,
      };
      const post = {
        id: "post",
        circle_id: "group",
        user_id: user.id,
        body: "Hoje terminei meu capítulo.",
        parent_id: null,
        created_at: new Date().toISOString(),
      };
      let failedComment = false;
      await page.addInitScript(
        ({ theme }) => {
          sessionStorage.setItem("norte-welcome-entered", "true");
          localStorage.setItem("norte-appearance", theme);
        },
        { theme },
      );
      await page.route("**/*", async (route) => {
        const url = new URL(route.request().url());
        if (url.pathname.includes("/auth/v1/"))
          return route.fulfill({
            json: {
              access_token: token,
              refresh_token: "fixture",
              token_type: "bearer",
              expires_in: 3600,
              user,
            },
          });
        if (url.pathname.includes("/rest/v1/")) {
          const table = url.pathname.split("/").at(-1);
          if (table === "norte_community_action") {
            const payload = route.request().postDataJSON();
            if (payload.p_action === "post" && payload.p_data.parent_id) {
              failedComment = true;
              return route.fulfill({ status: 503, json: { message: "Sem conexão de teste" } });
            }
            return route.fulfill({ json: { id: "group" } });
          }
          const fixtures = {
            norte_circles: [circle],
            norte_circle_members: [
              {
                circle_id: "group",
                user_id: user.id,
                alias: "Ana",
                status: "active",
                muted: false,
              },
            ],
            norte_circle_posts:
              url.searchParams.has("parent_id") && url.searchParams.get("parent_id") !== "is.null"
                ? []
                : [post],
            norte_challenges: [
              {
                id: "challenge",
                circle_id: "group",
                title: "Ler juntos",
                mode: "cooperative",
                unit: "min",
                target: 100,
                start_date: "2026-11-12",
                end_date: "2026-12-12",
              },
            ],
            norte_circle_progress: [],
            norte_challenge_progress: [],
            habit_settings: null,
          };
          return route.fulfill({ json: fixtures[table] ?? [] });
        }
        if (!["127.0.0.1", "localhost"].includes(url.hostname)) return route.abort();
        return route.continue();
      });
      await page.goto(`${process.env.APP_URL ?? "http://127.0.0.1:8081"}/juntos`);
      await page.getByRole("button", { name: "Leitura juntos Um pouco todo dia" }).click();
      await page.getByText(post.body, { exact: true }).waitFor();
      for (const tab of ["Atividades", "Rotinas", "Desafios", "Pessoas"]) {
        await page.getByRole("tab", { name: tab, exact: true }).click();
        assert.equal(
          await page.locator("body").evaluate((el) => el.scrollWidth > innerWidth),
          false,
          `${width} ${theme} ${tab} overflow`,
        );
        await page.screenshot({ path: `${output}/${width}-${theme}-${tab}.png`, fullPage: true });
        passed++;
      }
      await page.getByRole("tab", { name: "Atividades", exact: true }).click();
      await page.getByRole("button", { name: "Comentários", exact: true }).click();
      await page.getByRole("textbox", { name: "Seu comentário" }).fill("Não perder meu comentário");
      await page.getByRole("button", { name: "Enviar", exact: true }).click();
      await page.getByText("Sem conexão de teste", { exact: true }).first().waitFor();
      assert.ok(failedComment);
      assert.equal(
        await page.getByRole("textbox", { name: "Seu comentário" }).inputValue(),
        "Não perder meu comentário",
      );
      assert.deepEqual(errors, []);
      passed++;
      await page.close();
    }
  console.log(`${passed} browser checks passed with fixtures. Screenshots: ${output}`);
} finally {
  await browser.close();
}
