// Relógio de teste — só existe em build de desenvolvimento (`import.meta.env.DEV`).
// Em produção, `import.meta.env.DEV` é `false` em tempo de build e o Vite elimina
// este branch por dead-code elimination: `nowDate()` vira sempre `new Date()`.
//
// Permite à simulação de personas (Playwright) avançar o "hoje" do app sem tocar
// no relógio do sistema operacional — necessário pra testar de verdade sequências,
// virada de semana e ajuste de meta perdida ao longo de "30 dias" simulados numa
// única sessão de navegador. Nada aqui é lido pelo Supabase: os `created_at`/
// `updated_at` com `default now()` no Postgres continuam sendo o horário real do
// servidor, só os timestamps calculados no cliente (todayISO, nowHM, "started_at"
// de sessões etc.) respeitam o override.
//
// Persistido em localStorage (não só memória) pra sobreviver a um `page.goto`/
// reload do Playwright entre "dias" simulados — sem isso, constantes calculadas
// no topo de módulo (ex.: rótulos de data formatados uma vez no import) ficariam
// presas no valor de antes do reload.

const STORAGE_KEY = "__norte_test_clock_override_ms__";

function readStored(): number | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? Number(raw) : null;
  } catch {
    return null;
  }
}

let overrideMs: number | null = import.meta.env.DEV ? readStored() : null;

export function setTestClockOverride(ms: number | null) {
  if (!import.meta.env.DEV) return;
  overrideMs = ms;
  try {
    if (ms === null) window.localStorage.removeItem(STORAGE_KEY);
    else window.localStorage.setItem(STORAGE_KEY, String(ms));
  } catch {
    // ambiente sem localStorage (ex.: SSR) — override fica só em memória desta execução
  }
}

export function nowDate(): Date {
  if (import.meta.env.DEV && overrideMs !== null) return new Date(overrideMs);
  return new Date();
}

export function nowMs(): number {
  return nowDate().getTime();
}

if (import.meta.env.DEV && typeof window !== "undefined") {
  (window as unknown as { __norteTestClock: typeof setTestClockOverride }).__norteTestClock =
    setTestClockOverride;
}
