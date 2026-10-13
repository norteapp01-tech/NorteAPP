import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { DEFAULT_AGENDA_SETTINGS } from "@/lib/agenda-settings";

const h = vi.hoisted(() => ({ updateProfile: vi.fn(async () => undefined) }));

vi.mock("@/lib/profile-store", () => ({
  useProfile: () => ({ agendaSettings: DEFAULT_AGENDA_SETTINGS, timeFormat: "24h" }),
  updateProfile: h.updateProfile,
}));
vi.mock("@/lib/agenda-labels-store", () => ({
  useAgendaLabels: () => ({ all: [], active: [], byId: new Map(), loading: false }),
}));
vi.mock("./LabelManager", () => ({ LabelManager: () => <div>gerenciador</div> }));
vi.mock("./GoogleCalendarSection", () => ({
  GoogleCalendarSection: () => <div>seção do google</div>,
}));

import { AgendaPreferences } from "./AgendaPreferences";
import { AgendaSettingsSheet } from "./AgendaSettingsSheet";

beforeEach(() => vi.clearAllMocks());

describe("preferências da Agenda (agora em Configurações)", () => {
  it("traz duração, dia habitual, alerta, visualização e rótulos", () => {
    render(<AgendaPreferences />);
    expect(screen.getByText("Duração padrão de um compromisso novo")).toBeInTheDocument();
    expect(screen.getByText("Seu dia habitual")).toBeInTheDocument();
    expect(screen.getByText("Alerta padrão")).toBeInTheDocument();
    expect(screen.getByText("Visualização ao abrir")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Gerenciar rótulos" })).toBeInTheDocument();
  });

  it("salva a escolha no perfil", () => {
    render(<AgendaPreferences />);
    fireEvent.click(screen.getByRole("radio", { name: "Semana" }));
    expect(h.updateProfile).toHaveBeenCalledWith({ agendaSettings: { defaultView: "semana" } });
  });

  it("gerenciar rótulos abre o gerenciador", () => {
    render(<AgendaPreferences />);
    fireEvent.click(screen.getByRole("button", { name: "Gerenciar rótulos" }));
    expect(screen.getByText("gerenciador")).toBeInTheDocument();
  });
});

describe("atalho do Google na Agenda", () => {
  it("só mostra o Google — nada das preferências", () => {
    render(<AgendaSettingsSheet onClose={() => {}} />);
    expect(screen.getByText("seção do google")).toBeInTheDocument();
    expect(screen.queryByText("Alerta padrão")).toBeNull();
    expect(screen.queryByText("Seu dia habitual")).toBeNull();
    expect(screen.queryByText(/duração padrão/i)).toBeNull();
  });
});
