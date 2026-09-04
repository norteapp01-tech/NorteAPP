// Reseta os dados de todas as personas (mantendo a sessão anônima salva) —
// usado antes de rodar a simulação de 30 dias "de verdade", pra não carregar
// lixo de execuções parciais feitas durante o desenvolvimento do harness.
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { personas } from "./personas.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AUTH_DIR = path.join(__dirname, ".auth");
const BASE_URL = process.env.NORTE_BASE_URL || "http://localhost:8080";

const TABLES = [
  "goals",
  "routines",
  "workout_plans",
  "reading_books",
  "transactions",
  "savings_goals_monthly",
  "category_limits",
  "financial_goals",
  "financial_intentions",
  "meals",
  "nutrition_goals",
  "prayer_subjects",
  "spiritual_activities",
  "purposes",
  "notebook_entries",
  "hydration_logs",
];

const browser = await chromium.launch();
for (const persona of personas) {
  const authFile = path.join(AUTH_DIR, `${persona.id}.json`);
  if (!fs.existsSync(authFile)) {
    console.log(`${persona.id}: sem sessão salva, nada a limpar`);
    continue;
  }
  const context = await browser.newContext({ storageState: authFile });
  const page = await context.newPage();
  await page.goto(BASE_URL + "/", { waitUntil: "networkidle" });
  const result = await page.evaluate(async (tables) => {
    const mod = await import("/src/lib/supabase/client.ts");
    const { supabase, ensureSession } = mod;
    const userId = await ensureSession();
    const out = {};
    for (const t of tables) {
      const { error } = await supabase.from(t).delete().eq("user_id", userId);
      out[t] = error ? error.message : "ok";
    }
    return out;
  }, TABLES);
  const failed = Object.entries(result).filter(([, v]) => v !== "ok");
  console.log(`${persona.id}: limpo`, failed.length ? JSON.stringify(failed) : "");
  await context.close();
}
await browser.close();
