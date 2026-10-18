import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("VITE_SUPABASE_URL", "https://x.supabase.co");
  vi.stubEnv("VITE_SUPABASE_ANON_KEY", "anon");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("provedores de entrada aceitos pelo projeto", () => {
  it("lê o que o Supabase informa como ligado", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ external: { google: true, apple: false } }))),
    );
    const { loadEnabledProviders } = await import("./providers");
    expect(await loadEnabledProviders()).toEqual({ google: true, apple: false });
  });

  it("sem resposta, nenhum provedor aparece (e tenta de novo depois)", async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error("offline");
    });
    vi.stubGlobal("fetch", fetchMock);
    const { loadEnabledProviders } = await import("./providers");
    expect(await loadEnabledProviders()).toEqual({});
    await Promise.resolve();
    await loadEnabledProviders();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("resposta de erro também não liga nada", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("no", { status: 500 })),
    );
    const { loadEnabledProviders } = await import("./providers");
    expect(await loadEnabledProviders()).toEqual({});
  });
});
