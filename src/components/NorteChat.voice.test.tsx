import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NorteChat } from "./NorteChat";

const mocks = vi.hoisted(() => ({
  agent: vi.fn(async () => ({ role: "assistant", text: "Seu treino de hoje é peito e tríceps." })),
  transcribe: vi.fn(async () => ({ text: "Qual é meu treino?" })),
  stop: vi.fn(),
}));
vi.mock("@/lib/agent/run-agent", () => ({ runAgentTurn: mocks.agent }));
vi.mock("@/lib/agent/chat.functions", () => ({ transcribeAudio: mocks.transcribe }));
vi.mock("@/lib/supabase/client", () => ({
  useSupabaseUserId: () => "voice-test",
  getAccessToken: async () => "test",
}));
vi.mock("@/components/settings/SettingsPanel", () => ({ SettingsPanel: () => null }));
vi.mock("./navigation/MoreFunctionsSheet", () => ({ MoreFunctionsSheet: () => null }));
vi.mock("./AgentCard", () => ({ AgentCard: () => null, parseCard: () => null }));
vi.mock("@/components/ui/app-design-system", () => ({
  DawnMark: () => null,
  AppMenuButton: () => null,
}));

beforeEach(() => {
  vi.stubGlobal("matchMedia", () => ({ matches: true }));
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

it("preserva o rascunho ao recolher e reabrir a digitação e envia uma vez", async () => {
  render(<NorteChat fullscreen onBack={() => undefined} />);
  const input = screen.getByRole("textbox", { name: "Mensagem para o Norte" });
  fireEvent.change(input, { target: { value: "Ver meu treino" } });
  fireEvent.click(screen.getByRole("button", { name: "Recolher teclado" }));
  expect(screen.queryByRole("textbox")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Abrir teclado da conversa" }));
  expect(input).toHaveValue("Ver meu treino");
  expect(input).toHaveFocus();
  fireEvent.click(screen.getByRole("button", { name: "Enviar mensagem" }));
  await screen.findByText("Seu treino de hoje é peito e tríceps.");
  expect(mocks.agent).toHaveBeenCalledTimes(1);
});

it("mantém a digitação disponível se o usuário negar o microfone", async () => {
  vi.stubGlobal("navigator", {
    mediaDevices: { getUserMedia: vi.fn().mockRejectedValue(new Error("Denied")) },
  });
  render(<NorteChat fullscreen autoStartAudio onBack={() => undefined} />);
  await screen.findByRole("alert");
  expect(document.querySelector(".is-listening")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Abrir teclado da conversa" }));
  expect(screen.getByRole("textbox", { name: "Mensagem para o Norte" })).toHaveFocus();
  expect(mocks.agent).not.toHaveBeenCalled();
});

it("encerra o microfone ao sair da conversa sem enviar áudio", async () => {
  vi.stubGlobal("navigator", {
    mediaDevices: { getUserMedia: async () => ({ getTracks: () => [{ stop: mocks.stop }] }) },
  });
  vi.stubGlobal(
    "MediaRecorder",
    class {
      state = "inactive";
      start() {
        this.state = "recording";
      }
    },
  );
  const { unmount } = render(<NorteChat fullscreen autoStartAudio onBack={() => undefined} />);
  await screen.findByRole("button", { name: "Parar gravação e enviar" });
  unmount();
  expect(mocks.stop).toHaveBeenCalled();
  expect(mocks.transcribe).not.toHaveBeenCalled();
});

it("envia a fala transcrita uma vez e revela a resposta depois de sair da escuta", async () => {
  vi.stubGlobal("matchMedia", () => ({ matches: true }));
  Element.prototype.scrollIntoView = vi.fn();
  vi.stubGlobal("navigator", {
    mediaDevices: { getUserMedia: async () => ({ getTracks: () => [{ stop: mocks.stop }] }) },
  });
  vi.stubGlobal(
    "MediaRecorder",
    class {
      state = "inactive";
      mimeType = "audio/webm";
      ondataavailable?: (event: { data: Blob }) => void;
      onstop?: () => void;
      start() {
        this.state = "recording";
      }
      stop() {
        this.state = "inactive";
        this.ondataavailable?.({ data: new Blob(["audio"]) });
        this.onstop?.();
      }
    },
  );
  render(<NorteChat fullscreen autoStartAudio onBack={() => undefined} />);
  fireEvent.click(await screen.findByRole("button", { name: "Parar gravação e enviar" }));
  await screen.findByText("Seu treino de hoje é peito e tríceps.");
  expect(screen.getByText("Qual é meu treino?", { selector: "p" })).toBeTruthy();
  expect(mocks.agent).toHaveBeenCalledTimes(1);
  expect(mocks.transcribe).toHaveBeenCalledTimes(1);
  expect(mocks.stop).toHaveBeenCalled();
  await waitFor(() => expect(document.querySelector(".is-listening")).toBeNull());
});
