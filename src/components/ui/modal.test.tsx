import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, act, cleanup } from "@testing-library/react";
import { Modal } from "./modal";

/** O ponto de risco do ciclo de presença: o modal agora só avisa o pai
 * depois da animação de saída. Se o `animationend` não chegar (ambiente sem
 * as animações do tw-animate-css carregadas — exatamente o caso do jsdom, e
 * o mesmo risco de um navegador com redução de movimento), o tempo-limite
 * precisa garantir o fechamento: um modal preso na tela seria pior que não
 * ter animação nenhuma. */
describe("Modal — fechamento", () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("avisa o pai pra desmontar mesmo sem animação de saída (fallback)", async () => {
    vi.useFakeTimers();
    const onClose = vi.fn();
    render(
      <Modal title="Teste" onClose={onClose}>
        <p>conteúdo</p>
      </Modal>,
    );

    fireEvent.click(screen.getByLabelText("Fechar"));
    expect(onClose).not.toHaveBeenCalled(); // espera a saída terminar

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("fecha pelo Escape", async () => {
    vi.useFakeTimers();
    const onClose = vi.fn();
    render(
      <Modal title="Teste" onClose={onClose}>
        <p>conteúdo</p>
      </Modal>,
    );

    fireEvent.keyDown(document, { key: "Escape" });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("não chama onClose duas vezes quando fecham em sequência", async () => {
    vi.useFakeTimers();
    const onClose = vi.fn();
    render(
      <Modal title="Teste" onClose={onClose}>
        <p>conteúdo</p>
      </Modal>,
    );

    fireEvent.click(screen.getByLabelText("Fechar"));
    fireEvent.keyDown(document, { key: "Escape" });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(800);
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("mantém título e conteúdo acessíveis enquanto está aberto", () => {
    render(
      <Modal title="Meu título" onClose={vi.fn()}>
        <button>Ação</button>
      </Modal>,
    );

    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByText("Meu título")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Ação" })).toBeTruthy();
  });
});
