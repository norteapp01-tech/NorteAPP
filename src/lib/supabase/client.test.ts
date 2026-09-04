import { describe, it, expect, vi, beforeEach } from "vitest";
import { supabase, ensureSession } from "./client";

// Testa o client real (createClient de verdade, com as env vars do .env local) —
// só substituo os métodos de auth por spies, sem mockar o módulo inteiro, pra
// garantir que o `ensureSession()` testado é exatamente o que roda em produção.

describe("ensureSession — resiliência a falha de rede/auth", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("uma falha não 'gruda' — a próxima chamada tenta de novo em vez de repetir a mesma rejeição", async () => {
    vi.spyOn(supabase.auth, "getSession").mockResolvedValue({
      data: { session: null },
      error: null,
    } as Awaited<ReturnType<typeof supabase.auth.getSession>>);

    const signInSpy = vi.spyOn(supabase.auth, "signInAnonymously").mockResolvedValueOnce({
      data: { user: null, session: null },
      error: { message: "network down" } as never,
    } as Awaited<ReturnType<typeof supabase.auth.signInAnonymously>>);

    await expect(ensureSession()).rejects.toThrow(/network down/);
    expect(signInSpy).toHaveBeenCalledTimes(1);

    // Segunda tentativa: rede "voltou" — signInAnonymously deve ser chamado de
    // novo (não reaproveitar a promise rejeitada da primeira vez).
    signInSpy.mockResolvedValueOnce({
      data: {
        user: { id: "user-123" } as never,
        session: { user: { id: "user-123" } } as never,
      },
      error: null,
    } as Awaited<ReturnType<typeof supabase.auth.signInAnonymously>>);

    const userId = await ensureSession();
    expect(userId).toBe("user-123");
    expect(signInSpy).toHaveBeenCalledTimes(2);
  });
});
