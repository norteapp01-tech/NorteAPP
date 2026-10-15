import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { GoogleState } from "@/lib/google-calendar-store";

const store = vi.hoisted(() => ({
  state: { connection: null, calendars: [], links: [], conflicts: [] } as unknown,
  startGoogleConnect: vi.fn(),
  selectGoogleCalendars: vi.fn(),
  syncGoogleNow: vi.fn(),
  disconnectGoogle: vi.fn(),
  resolveGoogleConflict: vi.fn(),
}));

vi.mock("@/lib/google-calendar-store", async () => {
  const actual = await vi.importActual<typeof import("@/lib/google-calendar-store")>(
    "@/lib/google-calendar-store",
  );
  return {
    ...actual,
    useGoogleCalendar: () => ({ ...(store.state as GoogleState), loading: false }),
    startGoogleConnect: store.startGoogleConnect,
    selectGoogleCalendars: store.selectGoogleCalendars,
    syncGoogleNow: store.syncGoogleNow,
    disconnectGoogle: store.disconnectGoogle,
    resolveGoogleConflict: store.resolveGoogleConflict,
  };
});

import { GoogleCalendarSection } from "./GoogleCalendarSection";
import { AgendaFeedbackProvider } from "./agenda-feedback";

const connection = {
  id: "c1",
  email: "norteapp01@gmail.com",
  status: "active" as const,
  syncState: "idle" as const,
  pushRoutines: false,
  timeZone: "America/Sao_Paulo",
  lastSyncAt: new Date(Date.now() - 5 * 60_000).toISOString(),
  pendingSyncErrors: 0,
};
const main = {
  id: "cal1",
  googleId: "a@x",
  summary: "Principal",
  color: "#7cb8ff",
  role: "owner" as const,
  primary: true,
  selected: true,
  pushNewEvents: true,
  syncStatus: "idle" as const,
  lastSyncedAt: new Date(Date.now() - 5 * 60_000).toISOString(),
  webhookStatus: "active" as const,
};
const holidays = {
  id: "cal2",
  googleId: "f@x",
  summary: "Feriados",
  color: "#8fd694",
  role: "reader" as const,
  primary: false,
  selected: false,
  pushNewEvents: false,
  syncStatus: "idle" as const,
  webhookStatus: "off" as const,
};

function setState(partial: Partial<GoogleState>) {
  store.state = { connection: null, calendars: [], links: [], conflicts: [], ...partial };
}

function renderSection() {
  return render(
    <AgendaFeedbackProvider>
      <GoogleCalendarSection />
    </AgendaFeedbackProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  setState({});
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { ...window.location, assign: vi.fn(), origin: "http://localhost:8080" },
  });
});

describe("Google Agenda nas configurações", () => {
  it("desconectado: oferece conectar sem texto redundante", () => {
    renderSection();
    expect(screen.getByText("Desconectado")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Conectar Google Agenda/ })).toBeEnabled();
    expect(screen.queryByText(/ver e editar eventos e listar suas agendas/)).toBeNull();
  });

  it("conectar leva a pessoa ao Google", async () => {
    store.startGoogleConnect.mockResolvedValue("https://accounts.google.com/o/oauth2/v2/auth?x=1");
    renderSection();
    fireEvent.click(screen.getByRole("button", { name: /Conectar Google Agenda/ }));
    await waitFor(() =>
      expect(window.location.assign).toHaveBeenCalledWith(
        "https://accounts.google.com/o/oauth2/v2/auth?x=1",
      ),
    );
  });

  it("falha ao iniciar mostra o erro e volta ao estado desconectado", async () => {
    store.startGoogleConnect.mockRejectedValue(new Error("Sem autenticação."));
    renderSection();
    fireEvent.click(screen.getByRole("button", { name: /Conectar Google Agenda/ }));
    expect(await screen.findByText("Sem autenticação.")).toBeInTheDocument();
    expect(screen.getByText("Desconectado")).toBeInTheDocument();
  });

  it("conectado: mostra conta, última sincronização e as agendas com permissão e cor", () => {
    setState({ connection, calendars: [main, holidays] });
    renderSection();
    expect(screen.getByText("Conectado")).toBeInTheDocument();
    expect(screen.getByText("norteapp01@gmail.com")).toBeInTheDocument();
    expect(screen.getByText("5 min")).toBeInTheDocument();
    expect(screen.getByText("Principal")).toBeInTheDocument();
    expect(screen.getByText("Edição")).toBeInTheDocument();
    expect(screen.getByText("Somente leitura")).toBeInTheDocument();
    expect(screen.getByLabelText("Sincronizar Principal")).toBeChecked();
    expect(screen.getByLabelText("Sincronizar Feriados")).not.toBeChecked();
    expect(screen.getByRole("button", { name: /^Sincronizar$/ })).toBeEnabled();
    expect(screen.getByRole("button", { name: /Reconectar/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Desconectar/ })).toBeInTheDocument();
  });

  it("escolher uma agenda chama a seleção", async () => {
    store.selectGoogleCalendars.mockResolvedValue(undefined);
    setState({ connection, calendars: [main, holidays] });
    renderSection();
    fireEvent.click(screen.getByLabelText("Sincronizar Feriados"));
    await waitFor(() =>
      expect(store.selectGoogleCalendars).toHaveBeenCalledWith([{ id: "cal2", selected: true }]),
    );
  });

  it("agenda somente leitura não oferece ser o destino dos eventos do Norte", () => {
    setState({ connection, calendars: [main, { ...holidays, selected: true }] });
    renderSection();
    // só a agenda editável tem a opção de receber os eventos do Norte
    expect(screen.getAllByRole("button", { name: /como destino dos eventos/ })).toHaveLength(1);
  });

  it("avisa quando nenhuma agenda editável recebe os eventos do Norte", () => {
    setState({ connection, calendars: [{ ...main, pushNewEvents: false }] });
    renderSection();
    expect(screen.getByText("Defina o destino dos novos eventos.")).toBeInTheDocument();
  });

  it("tempo real indisponível não polui a tela nem parece erro", () => {
    setState({ connection, calendars: [{ ...main, webhookStatus: "unavailable" }] });
    renderSection();
    expect(screen.queryByText(/atualização em tempo real indisponível/)).toBeNull();
    expect(screen.getByText("Conectado")).toBeInTheDocument();
  });

  it("sincronizando: mostra o andamento e trava o botão", () => {
    setState({ connection: { ...connection, syncState: "syncing" }, calendars: [main] });
    renderSection();
    expect(screen.getAllByText("Sincronizando…").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /^Sincronizar$/ })).toBeDisabled();
  });

  it("Sincronizar agora chama a função e confirma", async () => {
    store.syncGoogleNow.mockResolvedValue({
      stats: { criados_no_norte: 2 },
      skipped: false,
      error: null,
    });
    setState({ connection, calendars: [main] });
    renderSection();
    fireEvent.click(screen.getByRole("button", { name: /^Sincronizar$/ }));
    await waitFor(() => expect(store.syncGoogleNow).toHaveBeenCalledWith("manual"));
    expect(await screen.findByText(/Sincronizado: 2 novo\(s\) evento\(s\)/)).toBeInTheDocument();
  });

  it("não diz que está tudo certo quando algum envio ficou pendente", async () => {
    store.syncGoogleNow.mockResolvedValue({
      stats: { erros_envio: 1 },
      skipped: false,
      error: null,
    });
    setState({ connection, calendars: [main] });
    renderSection();
    fireEvent.click(screen.getByRole("button", { name: /^Sincronizar$/ }));
    expect(await screen.findByText(/Algumas alterações não foram enviadas/)).toBeInTheDocument();
    expect(screen.queryByText("Tudo sincronizado.")).toBeNull();
  });

  it("mostra falhas persistentes e permite tentar novamente", async () => {
    store.syncGoogleNow.mockResolvedValue({ stats: {}, skipped: false, error: null });
    setState({
      connection: {
        ...connection,
        pendingSyncErrors: 2,
        lastPushError: "O Google demorou para responder.",
      },
      calendars: [main],
    });
    renderSection();
    expect(screen.getByText(/2 alterações ainda não foram enviadas/)).toBeInTheDocument();
    expect(screen.getByText("O Google demorou para responder.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Tentar novamente agora/ }));
    await waitFor(() => expect(store.syncGoogleNow).toHaveBeenCalledWith("manual"));
  });

  it("erro de sincronização aparece com opção de tentar de novo", async () => {
    store.syncGoogleNow.mockResolvedValue({ stats: {}, skipped: false, error: null });
    setState({
      connection: { ...connection, syncState: "error", lastError: "O Google não respondeu." },
      calendars: [main],
    });
    renderSection();
    expect(screen.getByText("Erro")).toBeInTheDocument();
    expect(screen.getByText("O Google não respondeu.")).toBeInTheDocument();
  });

  it("acesso expirado pede reconexão sem esconder que os dados do Norte estão salvos", () => {
    setState({
      connection: {
        ...connection,
        status: "needs_reauth",
        lastError: "O acesso ao Google foi revogado ou expirou.",
      },
      calendars: [main],
    });
    renderSection();
    expect(screen.getByText("Reconexão necessária")).toBeInTheDocument();
    expect(screen.getByText(/continuam no Norte/)).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /Reconectar/ }).length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: /^Sincronizar$/ })).toBeNull();
  });

  it("desconectar pede confirmação objetiva", async () => {
    store.disconnectGoogle.mockResolvedValue({ revoked: true });
    setState({ connection, calendars: [main] });
    renderSection();
    fireEvent.click(screen.getByRole("button", { name: "Desconectar Google Agenda" }));
    expect(await screen.findByText(/Desconectar o Google Agenda\?/)).toBeInTheDocument();
    expect(screen.getByText(/Seus compromissos permanecem salvos/)).toBeInTheDocument();
    expect(store.disconnectGoogle).not.toHaveBeenCalled();
    const confirm = screen.getAllByRole("button", { name: /^Desconectar$/ }).at(-1)!;
    fireEvent.click(confirm);
    await waitFor(() => expect(store.disconnectGoogle).toHaveBeenCalled());
    expect(await screen.findByText(/acesso revogado/)).toBeInTheDocument();
  });

  it("conflitos aparecem como aviso e abrem a tela de decisão", async () => {
    store.resolveGoogleConflict.mockResolvedValue(undefined);
    setState({
      connection,
      calendars: [main],
      conflicts: [
        {
          id: "l1",
          kind: "event",
          syncState: "conflict",
          readOnly: false,
          remoteDeleted: false,
          title: "Dentista",
          calendarName: "Principal",
          local: {
            title: "Dentista (Norte)",
            start: "2026-10-14 09:00",
            end: "2026-10-14 10:00",
            allDay: false,
            location: null,
            notes: null,
            cancelled: false,
          },
          remote: {
            title: "Dentista (Google)",
            start: "2026-10-14 10:00",
            end: "2026-10-14 11:00",
            allDay: false,
            location: null,
            notes: null,
            cancelled: false,
          },
        },
      ],
    });
    renderSection();
    fireEvent.click(screen.getByText(/1 evento mudou nos dois lugares/));
    expect(await screen.findByText("Dentista (Norte)")).toBeInTheDocument();
    expect(screen.getByText("Dentista (Google)")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Usar o do Google" }));
    await waitFor(() => expect(store.resolveGoogleConflict).toHaveBeenCalledWith("l1", "google"));
  });

  it("evento apagado no Google oferece recriar ou apagar no Norte", async () => {
    setState({
      connection,
      calendars: [main],
      conflicts: [
        {
          id: "l2",
          kind: "event",
          syncState: "conflict",
          readOnly: false,
          remoteDeleted: true,
          title: "Reunião",
          remote: { deleted: true },
          local: {
            title: "Reunião (editada)",
            start: "2026-10-14 09:00",
            end: "2026-10-14 10:00",
            allDay: false,
            location: null,
            notes: null,
            cancelled: false,
          },
        },
      ],
    });
    renderSection();
    fireEvent.click(screen.getByText(/mudou nos dois lugares/));
    expect(await screen.findByText("Foi apagado")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /recriar no Google/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Apagar no Norte" })).toBeInTheDocument();
  });

  it("rotinas do Norte só vão ao Google se a pessoa ligar", async () => {
    store.selectGoogleCalendars.mockResolvedValue(undefined);
    setState({ connection, calendars: [main] });
    renderSection();
    fireEvent.click(screen.getByLabelText(/Sincronizar rotinas/));
    await waitFor(() =>
      expect(store.selectGoogleCalendars).toHaveBeenCalledWith([], { pushRoutines: true }),
    );
  });
});
