import { afterEach, expect, it, vi } from "vitest";
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
vi.mock("./AgentCard", () => ({ AgentCard: () => null, parseCard: () => null }));
vi.mock("@/components/ui/app-design-system", () => ({
  DawnMark: () => null,
  AppMenuButton: () => null,
}));

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
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
