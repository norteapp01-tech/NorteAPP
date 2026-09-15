import { describe, it, expect, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useAsyncAction } from "./use-async-action";
import { useCompletedInSession } from "./use-completed-in-session";

describe("useAsyncAction", () => {
  it("ignora o segundo toque enquanto o primeiro está em andamento", async () => {
    let resolveFirst: () => void = () => {};
    const fn = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveFirst = resolve;
        }),
    );
    const { result } = renderHook(() => useAsyncAction());

    act(() => {
      void result.current.run(fn);
      void result.current.run(fn); // toque duplo no mesmo frame
    });

    expect(fn).toHaveBeenCalledTimes(1);
    await act(async () => {
      resolveFirst();
    });
    await waitFor(() => expect(result.current.pending).toBe(false));
  });

  it("libera a trava depois que termina, permitindo uma nova ação", async () => {
    const fn = vi.fn(async () => {});
    const { result } = renderHook(() => useAsyncAction());

    await act(async () => {
      await result.current.run(fn);
    });
    await act(async () => {
      await result.current.run(fn);
    });
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("guarda a mensagem de erro em vez de deixar a falha passar em silêncio", async () => {
    const { result } = renderHook(() => useAsyncAction());

    await act(async () => {
      await result.current.run(async () => {
        throw new Error("Sem conexão");
      });
    });

    expect(result.current.error).toBe("Sem conexão");
    expect(result.current.pending).toBe(false);
  });

  it("limpa o erro ao tentar de novo", async () => {
    const { result } = renderHook(() => useAsyncAction());
    await act(async () => {
      await result.current.run(async () => {
        throw new Error("falhou");
      });
    });
    expect(result.current.error).toBe("falhou");

    await act(async () => {
      await result.current.run(async () => {});
    });
    expect(result.current.error).toBeNull();
  });
});

describe("useCompletedInSession", () => {
  it("não anima o que já nasce concluído (reabrir a tela não recomemora)", () => {
    const { result } = renderHook(() => useCompletedInSession(true));
    expect(result.current).toBe(false);
  });

  it("anima quando a conclusão acontece com o componente montado", () => {
    const { result, rerender } = renderHook(({ done }) => useCompletedInSession(done), {
      initialProps: { done: false },
    });
    expect(result.current).toBe(false);

    rerender({ done: true });
    expect(result.current).toBe(true);
  });

  it("volta a armar depois de desmarcar, pra remarcar animar de novo", () => {
    const { result, rerender } = renderHook(({ done }) => useCompletedInSession(done), {
      initialProps: { done: false },
    });
    rerender({ done: true });
    expect(result.current).toBe(true);

    rerender({ done: false });
    expect(result.current).toBe(false);

    rerender({ done: true });
    expect(result.current).toBe(true);
  });
});
