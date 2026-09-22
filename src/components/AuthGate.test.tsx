import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { SignInScreen } from "./AuthGate";
import { supabase } from "@/lib/supabase/client";

vi.mock("@/lib/supabase/client", () => ({
  supabase: {
    auth: {
      signInWithPassword: vi.fn(),
      signInWithOAuth: vi.fn(),
      resetPasswordForEmail: vi.fn(),
      getSession: vi.fn(),
      updateUser: vi.fn(),
    },
  },
  ensureSession: vi.fn(),
  hasLinkedAccount: vi.fn(),
  primeSession: vi.fn(),
}));

vi.mock("./ui/drawer", () => ({
  Drawer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DrawerContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DrawerTitle: ({ children }: { children: React.ReactNode }) => <h1>{children}</h1>,
  DrawerDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
}));

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

it("mostra e-mail, senha e ambos os provedores no painel de entrada", () => {
  render(<SignInScreen onSuccess={vi.fn()} />);
  expect(screen.getByRole("heading", { name: "Entre na sua conta." })).toBeInTheDocument();
  expect(screen.getByLabelText("E-mail")).toBeInTheDocument();
  expect(screen.getByLabelText("Senha")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Esqueci minha senha" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Entrar com Google" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Entrar com Apple" })).toBeInTheDocument();
});

it("envia recuperação e mantém a confirmação genérica", async () => {
  vi.mocked(supabase.auth.resetPasswordForEmail).mockResolvedValue({ data: {}, error: null });
  render(<SignInScreen onSuccess={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "Esqueci minha senha" }));
  fireEvent.change(screen.getByLabelText("E-mail"), { target: { value: "pessoa@exemplo.com" } });
  fireEvent.click(screen.getByRole("button", { name: "Enviar link de recuperação" }));
  await waitFor(() =>
    expect(supabase.auth.resetPasswordForEmail).toHaveBeenCalledWith("pessoa@exemplo.com", {
      redirectTo: `${window.location.origin}/?auth=recovery`,
    }),
  );
  expect(await screen.findByText(/Se houver uma conta com este e-mail/)).toBeInTheDocument();
});

it("troca a senha depois do retorno do link", async () => {
  vi.mocked(supabase.auth.getSession).mockResolvedValue({
    data: { session: { user: { is_anonymous: false } } },
    error: null,
  } as Awaited<ReturnType<typeof supabase.auth.getSession>>);
  vi.mocked(supabase.auth.updateUser).mockResolvedValue({
    data: { user: {} },
    error: null,
  } as Awaited<ReturnType<typeof supabase.auth.updateUser>>);
  const onSuccess = vi.fn();
  render(<SignInScreen recovery onSuccess={onSuccess} />);
  fireEvent.change(screen.getByLabelText("Nova senha"), { target: { value: "uma-senha-nova" } });
  fireEvent.change(screen.getByLabelText("Confirmar nova senha"), {
    target: { value: "uma-senha-nova" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Salvar nova senha" }));
  await waitFor(() =>
    expect(supabase.auth.updateUser).toHaveBeenCalledWith({ password: "uma-senha-nova" }),
  );
  expect(onSuccess).toHaveBeenCalledOnce();
});

it("oferece login Apple para contas criadas com Apple", async () => {
  vi.mocked(supabase.auth.signInWithOAuth).mockResolvedValue({
    data: { provider: "apple", url: "https://example.com/apple" },
    error: null,
  });
  render(<SignInScreen onSuccess={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "Entrar com Apple" }));
  await waitFor(() =>
    expect(supabase.auth.signInWithOAuth).toHaveBeenCalledWith({
      provider: "apple",
      options: { redirectTo: `${window.location.origin}/?auth=login` },
    }),
  );
});
