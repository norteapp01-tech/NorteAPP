// Ações reutilizáveis de simulação — cada uma tenta uma interação real na UI
// e devolve { ok, error } sem nunca lançar, pra uma falha isolada não derrubar
// o resto do dia/persona. Erros ficam registrados no relatório da persona.

export async function withResult(label, fn) {
  try {
    await fn();
    return { label, ok: true };
  } catch (err) {
    return { label, ok: false, error: String(err && err.message ? err.message : err) };
  }
}

export async function setClockAndOpen(page, baseUrl, path, ms) {
  // localStorage é por origem, não existe antes do 1º load — garante um documento carregado.
  if (page.url() === "about:blank") {
    await page.goto(baseUrl + "/", { waitUntil: "networkidle" });
  }
  await page.evaluate((v) => {
    if (typeof window.__norteTestClock === "function") window.__norteTestClock(v);
  }, ms);
  await page.goto(baseUrl + path, { waitUntil: "networkidle" });
}

export async function goto(page, baseUrl, path) {
  await page.goto(baseUrl + path, { waitUntil: "networkidle" });
}

// Último overlay `.fixed.inset-0` aberto (modal/sheet) — evita clicar em algo
// com o mesmo texto que já existe atrás, na tela principal.
function modalScope(page) {
  return page.locator("div.fixed.inset-0").last();
}

async function clickText(page, text, opts = {}) {
  const scope = opts.scope ?? page;
  const loc = scope.getByText(text, { exact: opts.exact ?? false }).first();
  await loc.waitFor({ state: "visible", timeout: opts.timeout ?? 10000 });
  await loc.click();
}

async function clickButtonNamed(page, name, opts = {}) {
  const scope = opts.scope ?? page;
  const loc = scope.getByRole("button", { name, exact: opts.exact ?? false }).first();
  await loc.waitFor({ state: "visible", timeout: opts.timeout ?? 10000 });
  await loc.click();
}

async function fillLabel(page, labelText, value, opts = {}) {
  const scope = opts.scope ?? page;
  const loc = scope
    .locator(`label:has-text("${labelText}") input, label:has-text("${labelText}") textarea`)
    .first();
  await loc.waitFor({ state: "visible", timeout: opts.timeout ?? 10000 });
  await loc.fill(String(value));
}

// ---------------------------------------------------------------------------
// Hoje — check-in de humor (sempre visível, baixo risco, alta frequência)
// ---------------------------------------------------------------------------
export async function checkinMood(page, mood = "Normal") {
  await clickButtonNamed(page, mood, { timeout: 12000 });
}

// ---------------------------------------------------------------------------
// Planejamento / Agenda (/criar)
// ---------------------------------------------------------------------------
export async function createGoalViaCriar(page, baseUrl, { title, area, preset = "Mês" }) {
  await goto(page, baseUrl, "/criar");
  await clickButtonNamed(page, "Criar um Plano", { timeout: 4000 });
  await page.waitForTimeout(200);
  await fillLabel(page, "O que você quer realizar", title);
  if (area) {
    const areaBtn = page.getByRole("button", { name: area, exact: true }).first();
    if (await areaBtn.count()) await areaBtn.click();
  }
  await clickButtonNamed(page, "Continuar");
  await page.waitForTimeout(300);
  await clickButtonNamed(page, preset, { exact: true });
  await page.waitForTimeout(200);
  await clickButtonNamed(page, "Criar plano");
  await page.waitForTimeout(800);
}

export async function quickAgendaItem(
  page,
  baseUrl,
  { title, date, startTime = "10:00", endTime = "11:00" },
) {
  await goto(page, baseUrl, "/criar");
  await clickButtonNamed(page, "Adicionar à Agenda", { timeout: 4000 });
  await page.waitForTimeout(200);
  await fillLabel(page, "O quê", title);
  await fillLabel(page, "Dia", date);
  await fillLabel(page, "Início", startTime);
  await fillLabel(page, "Fim", endTime);
  await clickButtonNamed(page, "Salvar na agenda");
  await page.waitForTimeout(600);
}

// ---------------------------------------------------------------------------
// Academia
// ---------------------------------------------------------------------------
export async function ensureWorkoutPlan(page, baseUrl, { letter, name, muscleGroups }) {
  await goto(page, baseUrl, "/sub-agenda/academia");
  if (await page.getByText(name, { exact: true }).count()) return "already-exists";

  await clickButtonNamed(page, "novo treino");
  await page.locator('input[placeholder="D"]').first().fill(letter);
  await page.locator('input[placeholder*="Ombro"]').first().fill(name);
  await page.locator('input[placeholder*="Grupos musculares"]').first().fill(muscleGroups);
  await clickButtonNamed(page, "Criar treino");
  await page.waitForTimeout(600);

  // expande o treino recém-criado (linha com o nome, dentro de "Treinos cadastrados")
  const row = page.getByRole("button").filter({ hasText: name }).first();
  await row.waitFor({ state: "visible", timeout: 5000 });
  await row.click();
  await page
    .getByRole("button", { name: "exercício", exact: true })
    .first()
    .waitFor({ state: "visible", timeout: 5000 });

  await clickButtonNamed(page, "exercício", { exact: true });
  await page.locator('input[placeholder="Nome do exercício"]').first().fill("Supino reto");
  await clickButtonNamed(page, "Adicionar", { exact: true });
  // espera a escrita no Supabase terminar de verdade (some o form de "novo
  // exercício" só depois do `await addExercise(...)` resolver) — sem isso o
  // teste pode seguir e navegar embora antes da escrita terminar.
  await page
    .locator('input[placeholder="Nome do exercício"]')
    .first()
    .waitFor({ state: "hidden", timeout: 5000 });
  await page
    .getByText("Supino reto", { exact: true })
    .first()
    .waitFor({ state: "visible", timeout: 5000 });
  return "created";
}

export async function assignWorkoutDay(page, baseUrl, { weekdayLabel, planName }) {
  await goto(page, baseUrl, "/sub-agenda/academia");
  await clickButtonNamed(page, weekdayLabel, { timeout: 4000 });
  await page.waitForTimeout(300);
  await clickButtonNamed(page, planName, { scope: modalScope(page) });
  await page.waitForTimeout(300);
}

export async function runTodayWorkout(page, baseUrl) {
  await goto(page, baseUrl, "/sub-agenda/academia");
  if (await page.getByText("Hoje é dia de descanso").count()) return "rest-day";
  if (await page.getByText("Treino concluído hoje").count()) return "already-done";
  if (await page.getByText("ainda não tem exercícios").count()) return "plan-empty";

  const startBtn = page.locator("button").filter({ hasText: "kg" }).first();
  // a lista de exercícios do treino de hoje pode levar um instante a mais
  // pra assentar depois do networkidle (fetch + re-render) — espera de
  // verdade em vez de checar count() no mesmo tick.
  const appeared = await startBtn
    .waitFor({ state: "visible", timeout: 10000 })
    .then(() => true)
    .catch(() => false);
  if (!appeared) return "no-exercises";
  await startBtn.click();
  await page.waitForTimeout(600);

  const pendingCount = () =>
    page.locator('button[title="Registrar série"], button[title="Adicionar série extra"]').count();

  for (let i = 0; i < 2; i++) {
    const before = await pendingCount();
    if (before === 0) break;
    // Retry de verdade: confirma que a série foi CONTABILIZADA (o botão pendente
    // sumiu) antes de seguir — clicar de novo se o clique anterior não "pegou"
    // a tempo, em vez de confiar num único `waitForResponse` que pode perder a
    // corrida contra o clique seguinte.
    let confirmed = false;
    for (let attempt = 0; attempt < 3 && !confirmed; attempt++) {
      const checkBtn = page.locator('button[title="Registrar série"]').first();
      const extraBtn = page.locator('button[title="Adicionar série extra"]').first();
      const btn = (await checkBtn.count()) ? checkBtn : (await extraBtn.count()) ? extraBtn : null;
      if (!btn) {
        confirmed = true;
        break;
      }
      await btn.click().catch(() => {});
      confirmed = await page
        .waitForFunction(
          (n) => {
            const sel = 'button[title="Registrar série"], button[title="Adicionar série extra"]';
            return document.querySelectorAll(sel).length < n;
          },
          before,
          { timeout: 3000 },
        )
        .then(() => true)
        .catch(() => false);
    }
  }
  const closeBtn = modalScope(page).locator("button:has(svg.lucide-x)").first();
  if (await closeBtn.count()) await closeBtn.click().catch(() => {});
  await page.waitForTimeout(300);

  const finishBtn = page.getByRole("button", { name: "Finalizar treino" }).first();
  if (await finishBtn.count()) {
    await finishBtn.click();
    await page.waitForTimeout(600);
    const summaryClose = modalScope(page).locator("button").first();
    if (await summaryClose.count()) await summaryClose.click().catch(() => {});
  }
  return "logged";
}

export async function logBodyWeight(page, baseUrl, kg) {
  await goto(page, baseUrl, "/sub-agenda/academia");
  const registerBtn = page.getByRole("button", { name: "+ registrar" }).first();
  if (await registerBtn.count()) {
    await registerBtn.click();
    const input = page.locator('input[type="number"]').first();
    await input.fill(String(kg));
    await clickButtonNamed(page, "ok", { exact: true });
    return "logged";
  }
  return "no-button";
}

// ---------------------------------------------------------------------------
// Leitura
// ---------------------------------------------------------------------------
export async function addBook(page, baseUrl, { title, totalPages = 200 }) {
  await goto(page, baseUrl, "/sub-agenda/leitura");
  await clickButtonNamed(page, "Adicionar livro");
  await page.waitForTimeout(300);
  const manualLink = page.getByText("Não encontrei — cadastrar manualmente");
  if (await manualLink.count()) await manualLink.click();
  await page.waitForTimeout(300);
  await fillLabel(page, "Título", title);
  const pagesInput = page.locator('label:has-text("Total de páginas") input');
  if (await pagesInput.count()) await pagesInput.fill(String(totalPages));
  await clickButtonNamed(page, "Continuar");
  await page.waitForTimeout(700);
  const skip = page.getByText("configurar depois");
  if (await skip.count()) await skip.click();
  await page.waitForTimeout(400);
}

export async function readingSession(page, baseUrl, { pagesRead = 15 } = {}) {
  await goto(page, baseUrl, "/sub-agenda/leitura");
  const continueBtn = page.getByRole("button", { name: "Continuar leitura" }).first();
  if (!(await continueBtn.count())) return "no-active-book";
  await continueBtn.click();

  const finishBtn = page.getByRole("button", { name: "Finalizar leitura" }).first();
  await finishBtn.waitFor({ state: "visible", timeout: 6000 });
  await finishBtn.click();

  const posInput = page.locator('label:has-text("onde parou") input').first();
  await posInput.waitFor({ state: "visible", timeout: 4000 });
  const current = (await posInput.inputValue().catch(() => "0")) || "0";
  const newValue = (parseInt(current, 10) || 0) + pagesRead;
  await posInput.fill(String(newValue));
  await clickButtonNamed(page, "Confirmar");
  await page.waitForTimeout(800);
  const closeBtn = page.getByRole("button", { name: "Fechar" }).first();
  if (await closeBtn.count()) await closeBtn.click().catch(() => {});
  await page.waitForTimeout(300);
  return "logged";
}

// ---------------------------------------------------------------------------
// Alimentação
// ---------------------------------------------------------------------------
export async function confirmAnyMeal(page, baseUrl) {
  await goto(page, baseUrl, "/sub-agenda/alimentacao");
  const mealCard = page.locator("button").filter({ hasText: "Conforme planejado" }).first();
  if (await mealCard.count()) {
    await mealCard.click();
    await page.waitForTimeout(300);
    const confirmBtn = modalScope(page)
      .getByRole("button", { name: /Confirmar/ })
      .first();
    if (await confirmBtn.count()) {
      await confirmBtn.click();
      await page.waitForTimeout(400);
      return "confirmed";
    }
  }
  return "no-pending-meal";
}

// ---------------------------------------------------------------------------
// Finanças
// ---------------------------------------------------------------------------
export async function quickAddTransaction(page, baseUrl, text) {
  await goto(page, baseUrl, "/sub-agenda/financas");
  const fab = page.locator('button[class*="fixed"][class*="bottom-24"]').first();
  await fab.waitFor({ state: "visible", timeout: 5000 });
  await fab.click();
  await page.waitForTimeout(300);
  const textarea = modalScope(page).locator("textarea").first();
  await textarea.fill(text);
  await clickButtonNamed(page, "Interpretar", { scope: modalScope(page) });
  await page.waitForTimeout(400);
  const saveBtn = modalScope(page).getByRole("button", { name: "Salvar" }).first();
  await saveBtn.click();
  await page.waitForTimeout(500);
}

// ---------------------------------------------------------------------------
// Fé
// ---------------------------------------------------------------------------
export async function addNotebookEntry(page, baseUrl, text) {
  await goto(page, baseUrl, "/sub-agenda/fe");
  await clickButtonNamed(page, "Caderno", { timeout: 4000 });
  await page.waitForTimeout(300);
  const plusBtn = page
    .locator("button")
    .filter({ has: page.locator("svg.lucide-plus") })
    .first();
  if (await plusBtn.count()) {
    await plusBtn.click();
    await page.waitForTimeout(300);
    const textarea = modalScope(page).locator("textarea").first();
    if (await textarea.count()) {
      await textarea.fill(text);
      const saveBtn = modalScope(page)
        .getByRole("button", { name: /Salvar/ })
        .first();
      if (await saveBtn.count()) await saveBtn.click();
      await page.waitForTimeout(400);
      return "added";
    }
  }
  return "no-add-button";
}
