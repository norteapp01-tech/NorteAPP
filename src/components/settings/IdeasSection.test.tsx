import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { IdeasSection } from "./IdeasSection";

const state = vi.hoisted(() => ({
  ensureSession: vi.fn(),
  insert: vi.fn(),
}));
vi.mock("@/lib/supabase/client", () => ({
  ensureSession: state.ensureSession,
  supabase: { from: () => ({ insert: state.insert }) },
}));

beforeEach(() => {
  state.ensureSession.mockResolvedValue("user-id");
  state.insert.mockResolvedValue({ error: null });
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it("envia uma melhoria e limpa o texto após confirmação", async () => {
  render(<IdeasSection />);
  fireEvent.change(screen.getByLabelText("Descreva sua ideia"), {
    target: { value: "  Melhorar a busca da agenda  " },
  });
  fireEvent.click(screen.getByRole("button", { name: "Enviar ideia" }));

  await waitFor(() =>
    expect(state.insert).toHaveBeenCalledWith({
      kind: "melhoria",
      message: "Melhorar a busca da agenda",
    }),
  );
  expect(screen.getByRole("status")).toHaveTextContent("Ideia enviada");
  expect(screen.getByLabelText("Descreva sua ideia")).toHaveValue("");
});

it("preserva a novidade escrita se o envio falhar", async () => {
  state.insert.mockResolvedValue({ error: new Error("offline") });
  render(<IdeasSection />);
  fireEvent.click(screen.getByLabelText("Novidade"));
  fireEvent.change(screen.getByLabelText("Descreva sua ideia"), {
    target: { value: "Adicionar calendário compartilhado" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Enviar ideia" }));

  await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Não conseguimos"));
  expect(state.insert).toHaveBeenCalledWith({
    kind: "novidade",
    message: "Adicionar calendário compartilhado",
  });
  expect(screen.getByLabelText("Descreva sua ideia")).toHaveValue(
    "Adicionar calendário compartilhado",
  );
});
