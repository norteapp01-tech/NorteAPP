// Orquestrador da simulação de 10 personas x 30 dias.
//
// Cada persona roda num browser context isolado (localStorage próprio ->
// usuário anônimo próprio no Supabase). Pra cada "dia simulado" avançamos o
// relógio de teste (src/lib/test-clock.ts, só ativo em dev) pra uma data real
// diferente, recarregamos e deixamos a persona agir. Erros de página/console
// e falhas de ação viram parte do relatório — nada é inventado: se uma ação
// não achou o elemento esperado ou o app lançou um erro de verdade, isso fica
// registrado como achado.
//
// Uso: node scripts/persona-sim/run.mjs [--days=30] [--concurrency=3] [--personas=ana,bruno]

import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { personas as allPersonas } from "./personas.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORT_DIR = path.join(__dirname, "reports");
const AUTH_DIR = path.join(__dirname, ".auth");
fs.mkdirSync(REPORT_DIR, { recursive: true });
fs.mkdirSync(AUTH_DIR, { recursive: true });

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? true];
  }),
);

const BASE_URL = process.env.NORTE_BASE_URL || "http://localhost:8080";
const DAYS = parseInt(args.days || "30", 10);
const CONCURRENCY = parseInt(args.concurrency || "3", 10);
const ONLY = args.personas ? String(args.personas).split(",") : null;
const START_MS = Date.parse("2026-01-05T09:00:00"); // uma segunda-feira

const personas = ONLY ? allPersonas.filter((p) => ONLY.includes(p.id)) : allPersonas;

function isBenignAbort(text) {
  // Requisição em voo cancelada pelo nosso próprio page.goto() entre ações —
  // artefato da automação (navegação rápida demais pra um humano), não bug do app.
  return /net::ERR_ABORTED/.test(text) && /requestfailed:/.test(text);
}

/** Um storageState só conta como sessão de verdade se tiver o token de auth do Supabase salvo
 * — um arquivo existente mas vazio (de uma tentativa de signup que levou 429) não conta. */
function hasValidSession(authFile) {
  if (!fs.existsSync(authFile)) return false;
  try {
    const data = JSON.parse(fs.readFileSync(authFile, "utf8"));
    return (data.origins ?? []).some((o) =>
      (o.localStorage ?? []).some(
        (item) => item.name.startsWith("sb-") && item.name.endsWith("-auth-token"),
      ),
    );
  } catch {
    return false;
  }
}

async function runPersona(persona, browser, staggerMs) {
  // Reaproveita a sessão anônima da persona entre execuções (localStorage
  // salvo em disco) — sem isso, cada re-run desse script cria 10 usuários
  // anônimos novos no Supabase em rajada e esbarra no rate limit de
  // signInAnonymously() (HTTP 429), que não é um bug do app: é o mesmo
  // Supabase se defendendo de um padrão que nenhum usuário real produz.
  const authFile = path.join(AUTH_DIR, `${persona.id}.json`);
  const hasSession = hasValidSession(authFile);
  // Sem sessão salva ainda -> vai criar um usuário novo agora. Espaça essas
  // primeiras criações no tempo (mesmo sob concorrência) pra nunca rajar o
  // endpoint de signup.
  if (!hasSession && staggerMs > 0) await new Promise((r) => setTimeout(r, staggerMs));
  const context = await browser.newContext(hasSession ? { storageState: authFile } : {});
  const page = await context.newPage();

  const report = {
    id: persona.id,
    name: persona.name,
    description: persona.description,
    startedAt: new Date().toISOString(),
    days: [],
    pageErrors: [],
    actionFailures: [],
  };

  page.on("pageerror", (e) => {
    report.pageErrors.push({ type: "pageerror", message: e.message, at: new Date().toISOString() });
  });
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      report.pageErrors.push({
        type: "console.error",
        message: msg.text(),
        at: new Date().toISOString(),
      });
    }
  });
  page.on("requestfailed", (req) => {
    const text = `requestfailed: ${req.method()} ${req.url()} :: ${req.failure()?.errorText}`;
    if (isBenignAbort(text)) return;
    report.pageErrors.push({ type: "requestfailed", message: text, at: new Date().toISOString() });
  });
  page.on("response", (res) => {
    if (res.status() >= 400) {
      report.pageErrors.push({
        type: "http",
        message: `http ${res.status()}: ${res.request().method()} ${res.url()}`,
        at: new Date().toISOString(),
      });
    }
  });

  for (let day = 0; day < DAYS; day++) {
    const ms = START_MS + day * 86400000;
    const weekday = new Date(ms).getDay();
    const dayReport = { day, date: new Date(ms).toISOString().slice(0, 10), weekday, actions: [] };

    try {
      if (day === 0) {
        // 1ª visita desta persona: localStorage ainda não existe nessa origem.
        // Usa domcontentloaded (não deixa o app terminar de bootar e disparar
        // fetches reais) só pra ganhar acesso a localStorage antes de setar o
        // relógio — evita cancelar um signInAnonymously() em voo com um reload
        // logo em seguida.
        await page.goto(BASE_URL + "/", { waitUntil: "domcontentloaded", timeout: 20000 });
      }
      await page.evaluate((v) => {
        if (typeof window.__norteTestClock === "function") window.__norteTestClock(v);
      }, ms);
      await page.goto(BASE_URL + "/", { waitUntil: "networkidle", timeout: 20000 });
      if (day === 0) {
        // captura a sessão anônima assim que ela existe, antes de qualquer
        // ação do dia poder falhar — próximos runs reaproveitam essa persona
        // sem criar outro usuário novo no Supabase.
        await context.storageState({ path: authFile }).catch(() => {});
      }

      const run = async (label, fn) => {
        try {
          await fn();
          dayReport.actions.push({ label, ok: true });
        } catch (err) {
          const message = String(err && err.message ? err.message : err);
          dayReport.actions.push({ label, ok: false, error: message });
          report.actionFailures.push({ day, label, error: message });
          const shotPath = path.join(
            REPORT_DIR,
            `${persona.id}-day${String(day).padStart(2, "0")}-${label.replace(/[^a-z0-9]/gi, "_")}.png`,
          );
          await page.screenshot({ path: shotPath, fullPage: true }).catch(() => {});
        }
      };

      await persona.daily({ page, baseUrl: BASE_URL, day, weekday, run });
    } catch (err) {
      dayReport.actions.push({
        label: "day-crash",
        ok: false,
        error: String(err && err.message ? err.message : err),
      });
      report.actionFailures.push({
        day,
        label: "day-crash",
        error: String(err && err.message ? err.message : err),
      });
    }

    report.days.push(dayReport);
  }

  report.finishedAt = new Date().toISOString();
  await context.storageState({ path: authFile }).catch(() => {});
  await context.close();

  const reportPath = path.join(REPORT_DIR, `${persona.id}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  return report;
}

async function withConcurrency(items, limit, fn) {
  const results = [];
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await fn(items[idx]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

async function main() {
  console.log(`Simulação: ${personas.length} personas x ${DAYS} dias, concorrência ${CONCURRENCY}`);
  console.log(`Base URL: ${BASE_URL}`);
  const browser = await chromium.launch();

  const startedAt = Date.now();
  const STAGGER_MS = 90000; // espaçamento entre criações de conta novas — o rate limit de signup do Supabase se mostrou por hora, não por segundo; 8s não bastou
  let staggerIndex = 0;
  const results = await withConcurrency(personas, CONCURRENCY, async (persona) => {
    const authFile = path.join(AUTH_DIR, `${persona.id}.json`);
    const myStagger = hasValidSession(authFile) ? 0 : staggerIndex++ * STAGGER_MS;
    console.log(`-> iniciando ${persona.name}`);
    const r = await runPersona(persona, browser, myStagger);
    const fails = r.actionFailures.length;
    const errs = r.pageErrors.length;
    console.log(
      `<- ${persona.name} concluída: ${fails} falha(s) de ação, ${errs} erro(s) de página/console`,
    );
    return r;
  });

  await browser.close();

  const summary = {
    generatedAt: new Date().toISOString(),
    baseUrl: BASE_URL,
    days: DAYS,
    durationSeconds: Math.round((Date.now() - startedAt) / 1000),
    personas: results.map((r) => ({
      id: r.id,
      name: r.name,
      actionFailures: r.actionFailures.length,
      pageErrors: r.pageErrors.length,
      totalActions: r.days.reduce((s, d) => s + d.actions.length, 0),
    })),
    totalActionFailures: results.reduce((s, r) => s + r.actionFailures.length, 0),
    totalPageErrors: results.reduce((s, r) => s + r.pageErrors.length, 0),
  };
  fs.writeFileSync(path.join(REPORT_DIR, "summary.json"), JSON.stringify(summary, null, 2));

  console.log("\n=== RESUMO ===");
  console.log(JSON.stringify(summary, null, 2));

  const clean = summary.totalActionFailures === 0 && summary.totalPageErrors === 0;
  process.exit(clean ? 0 : 1);
}

main().catch((err) => {
  console.error("ERRO FATAL NA SIMULAÇÃO:", err);
  process.exit(2);
});
