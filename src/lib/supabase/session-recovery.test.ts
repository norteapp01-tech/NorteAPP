import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = {
  getSession: vi.fn(),
  refreshSession: vi.fn(),
  signInAnonymously: vi.fn(),
  signOut: vi.fn(async () => ({ error: null })),
  onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe() {} } } })),
};
vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({ auth }) }));
vi.stubEnv("VITE_SUPABASE_URL", "https://x.supabase.co");
vi.stubEnv("VITE_SUPABASE_ANON_KEY", "anon");

async function load() {
  vi.resetModules();
  return import("./client");
}
const noSession = { data: { session: null }, error: null };

describe("sessão anônima: nunca troca de usuário em silêncio", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    auth.getSession.mockResolvedValue(noSession);
  });

  it("primeiro uso (sem sessão anterior) cria a sessão anônima", async () => {
    auth.signInAnonymously.mockResolvedValue({ data: { session: { user: { id: "novo" } } }, error: null });
    const { ensureSession } = await load();
    await expect(ensureSession()).resolves.toBe("novo");
  });

  it("recupera a sessão anterior a partir da cópia guardada", async () => {
    localStorage.setItem("norte-session-backup", JSON.stringify({ userId: "antigo", refreshToken: "rt" }));
    auth.refreshSession.mockResolvedValue({ data: { session: { user: { id: "antigo" } } }, error: null });
    const { ensureSession } = await load();
    await expect(ensureSession()).resolves.toBe("antigo");
    expect(auth.refreshSession).toHaveBeenCalledWith({ refresh_token: "rt" });
    expect(auth.signInAnonymously).not.toHaveBeenCalled();
  });

  it("token recusado: lança SessionLostError e NÃO cria outro usuário", async () => {
    localStorage.setItem("norte-session-backup", JSON.stringify({ userId: "antigo", refreshToken: "rt" }));
    auth.refreshSession.mockResolvedValue({ data: { session: null }, error: { name: "AuthApiError", status: 400, message: "Invalid Refresh Token: Already Used" } });
    const { ensureSession, SessionLostError } = await load();
    await expect(ensureSession()).rejects.toBeInstanceOf(SessionLostError);
    expect(auth.signInAnonymously).not.toHaveBeenCalled();
  });

  it("falha de rede: erro temporário, sem criar outro usuário", async () => {
    localStorage.setItem("norte-session-backup", JSON.stringify({ userId: "antigo", refreshToken: "rt" }));
    auth.refreshSession.mockResolvedValue({ data: { session: null }, error: { name: "AuthRetryableFetchError", status: 0, message: "Failed to fetch" } });
    const { ensureSession, SessionLostError } = await load();
    const err = await ensureSession().catch((e) => e);
    expect(err).not.toBeInstanceOf(SessionLostError);
    expect(auth.signInAnonymously).not.toHaveBeenCalled();
  });

  it("começar do zero é uma escolha explícita e limpa a cópia", async () => {
    localStorage.setItem("norte-session-backup", JSON.stringify({ userId: "antigo", refreshToken: "rt" }));
    auth.signInAnonymously.mockResolvedValue({ data: { session: { user: { id: "novo" } } }, error: null });
    const { startFreshSession } = await load();
    await expect(startFreshSession()).resolves.toBe("novo");
    expect(localStorage.getItem("norte-session-backup")).toBeNull();
  });
});
