// Isolated mobile UI audit: fake identity/data, no production writes or microphone access.
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";

const out = process.env.AUDIT_OUTPUT ?? "/tmp/norte-conversation";
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.addInitScript(() => {
  sessionStorage.setItem("norte-welcome-entered", "true");
  localStorage.setItem(
    "norte-chat:00000000-0000-4000-a000-000000000001",
    JSON.stringify([
      { role: "user", text: "Norte, eu tenho um dentista hoje às sete horas. Agende para mim." },
      {
        role: "assistant",
        text: "O compromisso com o dentista foi marcado para hoje às 19h.",
        toolTrace: [
          {
            name: "criar_execucao",
            args: {},
            result: JSON.stringify({
              card: "appointment",
              id: "fixture-appointment",
              title: "Dentista",
              date: "2026-09-29",
              startTime: "19:00",
            }),
          },
        ],
      },
    ]),
  );
  Object.defineProperty(navigator, "mediaDevices", {
    value: { getUserMedia: async () => ({ getTracks: () => [{ stop() {} }] }) },
    configurable: true,
  });
  window.MediaRecorder = class {
    state = "inactive";
    start() {
      this.state = "recording";
    }
    stop() {
      this.state = "inactive";
      this.onstop?.();
    }
  };
  window.AudioContext = class {
    constructor() {
      throw new Error("No real audio in visual audit");
    }
  };
});
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
  if (url.pathname.includes("/rest/v1/")) return route.fulfill({ json: [] });
  if (!["127.0.0.1", "localhost"].includes(url.hostname) || route.request().method() !== "GET")
    return route.abort();
  return route.continue();
});

try {
  await page.goto(process.env.AUDIT_URL ?? "http://127.0.0.1:4173");
  for (const width of [320, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    const restingDock = page.locator(".norte-pulse-dock");
    const restingWidth = (await restingDock.boundingBox()).width;
    await page.getByRole("button", { name: "Conversar por voz com o Norte" }).click();
    await page.waitForTimeout(180);
    const collapsingWidth = (await restingDock.boundingBox()).width;
    assert.ok(
      collapsingWidth < restingWidth * 0.7,
      `${width}: dock did not contract toward microphone`,
    );
    if (width === 390) await page.screenshot({ path: `${out}/voice-collapse-${width}.png` });
    await page.getByRole("button", { name: "Parar gravação e enviar" }).waitFor();
    await page.waitForTimeout(800);
    const listeningDock = page.locator(".pulse-chat-composer");
    const listeningWidth = (await listeningDock.boundingBox()).width;
    assert.ok(
      listeningWidth >= 180 && listeningWidth <= 188,
      `${width}: listening pill has wrong width`,
    );
    assert.equal(
      await page
        .locator(".pulse-active-pill")
        .evaluate((el) => getComputedStyle(el).borderTopWidth),
      "0px",
    );
    assert.equal(
      await page
        .locator(".pulse-composer-controls > .pulse-side")
        .first()
        .evaluate((el) => Number(getComputedStyle(el).opacity)),
      0,
    );
    assert.equal(await page.locator("body").evaluate((el) => el.scrollWidth > innerWidth), false);
    await page.screenshot({ path: `${out}/listening-${width}.png` });
    await page.getByRole("button", { name: "Voltar", exact: true }).click();
    await page.getByRole("button", { name: "Abrir teclado da conversa" }).click();
    await page.waitForTimeout(700);
    assert.equal(
      await page
        .getByRole("textbox", { name: "Mensagem para o Norte" })
        .evaluate((el) => el === document.activeElement),
      true,
    );
    await page.getByRole("textbox", { name: "Mensagem para o Norte" }).fill("Mudar para amanhã");
    await page.screenshot({ path: `${out}/keyboard-${width}.png` });
    await page.getByRole("button", { name: "Recolher teclado" }).click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${out}/conversation-${width}.png` });
    await page.getByRole("button", { name: "Abrir teclado da conversa" }).click();
    assert.equal(
      await page.getByRole("textbox", { name: "Mensagem para o Norte" }).inputValue(),
      "Mudar para amanhã",
    );
    await page.getByRole("button", { name: "Abrir mais funções", exact: true }).click();
    await page
      .getByRole("dialog", { name: "Mais funções" })
      .getByRole("link", { name: "Hoje Seu dia e próximas ações" })
      .click();
    assert.equal(await page.locator(".norte-global-chat").count(), 0);
  }
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.getByRole("button", { name: "Abrir teclado da conversa" }).click();
  assert.equal(
    await page.locator(".pulse-glass").evaluate((el) => getComputedStyle(el).animationName),
    "none",
  );
  assert.deepEqual(errors, []);
  console.log(`Conversation audit passed at 320, 390, 430px; screenshots: ${out}`);
} finally {
  await browser.close();
}
