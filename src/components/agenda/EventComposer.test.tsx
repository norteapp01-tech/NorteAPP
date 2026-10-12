import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import type { createFakeSupabase } from "../../test/fake-supabase";

type Fake = ReturnType<typeof createFakeSupabase>;

vi.mock("@/lib/supabase/client", async () => {
  const { createFakeSupabase } = await import("../../test/fake-supabase");
  const fake = createFakeSupabase("user-a");
  (globalThis as unknown as { __fake: Fake }).__fake = fake;
  return {
    supabase: fake.client,
    ensureSession: async () => fake.userId,
    useSupabaseUserId: () => fake.userId,
  };
});
vi.mock("@/lib/push-notifications", () => ({
  isPushSupported: () => false,
  pushPermission: () => "unsupported",
  registerPush: async () => ({ ok: false }),
}));

import { EventComposer, type ComposerSeed } from "./EventComposer";
import { AgendaFeedbackProvider } from "./agenda-feedback";
import { queryClient } from "@/lib/query-client";
import { setTestClockOverride } from "@/lib/test-clock";

const fake = (globalThis as unknown as { __fake: Fake }).__fake;

const seed: ComposerSeed = {
  mode: "create",
  date: "2026-10-12",
  startTime: "14:00",
  endTime: "15:00",
};

function renderComposer(overrides: Partial<ComposerSeed> = {}) {
  const onClose = vi.fn();
  render(
    <QueryClientProvider client={queryClient}>
      <AgendaFeedbackProvider>
        <EventComposer seed={{ ...seed, ...overrides }} onClose={onClose} />
      </AgendaFeedbackProvider>
    </QueryClientProvider>,
  );
  return { onClose };
}

const field = (label: RegExp | string) => screen.getByLabelText(label) as HTMLInputElement;
const saveButton = () => screen.getByRole("button", { name: /salvar|criar série/i });

beforeEach(() => {
  fake.reset();
  fake.setUser("user-a");
  queryClient.clear();
  setTestClockOverride(new Date(2026, 9, 12, 8, 0).getTime());
});
afterEach(() => setTestClockOverride(null));

describe("criação rápida", () => {
  it("só precisa do nome: o horário já vem preenchido", async () => {
    const { onClose } = renderComposer();
    expect(saveButton()).toBeDisabled();
    fireEvent.change(field("Nome do compromisso"), { target: { value: "Dentista" } });
    expect(saveButton()).toBeEnabled();
    fireEvent.click(saveButton());
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    const [row] = fake.rows("executions");
    expect(row).toMatchObject({
      title: "Dentista",
      agenda_date: "2026-10-12",
      start_time: "14:00",
      end_time: "15:00",
    });
    expect(fake.rows("agenda_changes").some((c) => c.kind === "scheduled")).toBe(true);
  });

  it("opções avançadas começam recolhidas", () => {
    renderComposer();
    expect(screen.queryByPlaceholderText(/Clínica Norte/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /mais opções/i }));
    expect(screen.getByPlaceholderText(/Clínica Norte/)).toBeInTheDocument();
  });

  it("o fim acompanha o início enquanto a pessoa não mexe nele", () => {
    renderComposer();
    fireEvent.change(field(/^Início/), { target: { value: "16:00" } });
    expect(field(/^Fim/).value).toBe("17:00");
  });

  it("botões de duração ajustam o fim", () => {
    renderComposer();
    fireEvent.click(screen.getByRole("button", { name: "30min" }));
    expect(field(/^Fim/).value).toBe("14:30");
  });

  it("salva com rótulo e alerta, e cria o lembrete do alerta", async () => {
    const labelRow = fake.seed("agenda_labels", {
      user_id: "user-a",
      name: "Saúde",
      color: "#8fd694",
    });
    const { onClose } = renderComposer();
    fireEvent.change(field("Nome do compromisso"), { target: { value: "Consulta" } });
    fireEvent.click(await screen.findByRole("radio", { name: /Saúde/ }));
    fireEvent.click(screen.getByRole("button", { name: /mais opções/i }));
    fireEvent.click(screen.getByRole("button", { name: "1 hora antes" }));
    fireEvent.click(saveButton());
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(fake.rows("executions")[0].label_id).toBe(labelRow.id);
    const [reminder] = fake.rows("reminders");
    expect(reminder).toMatchObject({ origin: "agenda_alert", offset_minutes: 60 });
  });
});

describe("compromissos que atravessam a meia-noite", () => {
  it("23:00–01:00 é aceito e explicado", async () => {
    const { onClose } = renderComposer({ startTime: "23:00", endTime: "01:00" });
    fireEvent.change(field("Nome do compromisso"), { target: { value: "Plantão" } });
    expect(saveButton()).toBeEnabled();
    expect(screen.getByText(/Termina no dia seguinte/)).toBeInTheDocument();
    fireEvent.click(saveButton());
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(fake.rows("executions")[0]).toMatchObject({ start_time: "23:00", end_time: "01:00" });
  });

  it("22:30–00:00 e 00:00–02:00 são aceitos", () => {
    renderComposer({ startTime: "22:30", endTime: "00:00" });
    fireEvent.change(field("Nome do compromisso"), { target: { value: "Jantar" } });
    expect(saveButton()).toBeEnabled();
    fireEvent.change(field(/^Início/), { target: { value: "00:00" } });
    fireEvent.change(field(/^Fim/), { target: { value: "02:00" } });
    expect(saveButton()).toBeEnabled();
  });

  it("início igual ao fim continua inválido", () => {
    renderComposer({ startTime: "10:00", endTime: "10:00" });
    fireEvent.change(field("Nome do compromisso"), { target: { value: "x" } });
    expect(saveButton()).toBeDisabled();
  });
});

describe("conflitos", () => {
  const existing = () =>
    fake.seed("executions", {
      user_id: "user-a",
      title: "Academia",
      due_date: "2026-10-12",
      agenda_date: "2026-10-12",
      start_time: "14:30",
      end_time: "15:30",
      category: "academia",
      rigid: false,
    });

  it("mostra com quem conflita, se é flexível, e sugere horários livres", async () => {
    existing();
    renderComposer();
    fireEvent.change(field("Nome do compromisso"), { target: { value: "Dentista" } });
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/conflita com Academia \(flexível\)/);
    expect(screen.getByRole("button", { name: /Salvar mesmo assim/ })).toBeEnabled();
    expect(alert).toHaveTextContent(/Horários livres/);
  });

  it("aceitar uma sugestão resolve o conflito sem mover nada sozinho", async () => {
    const academia = existing();
    renderComposer();
    fireEvent.change(field("Nome do compromisso"), { target: { value: "Dentista" } });
    const alert = await screen.findByRole("alert");
    const suggestion = Array.from(alert.querySelectorAll("button"))[0];
    fireEvent.click(suggestion);
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
    expect(academia.start_time).toBe("14:30"); // o outro compromisso continua onde estava
  });

  it("conflito com compromisso rígido é dito", async () => {
    existing().rigid = true;
    renderComposer();
    fireEvent.change(field("Nome do compromisso"), { target: { value: "Dentista" } });
    expect(await screen.findByRole("alert")).toHaveTextContent(/\(rígido\)/);
  });

  it("não há alerta quando os horários só se encostam", () => {
    existing();
    renderComposer({ startTime: "13:30", endTime: "14:30" });
    fireEvent.change(field("Nome do compromisso"), { target: { value: "Dentista" } });
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("recorrência", () => {
  it("criar “toda segunda” gera uma série, não várias linhas", async () => {
    const { onClose } = renderComposer();
    fireEvent.change(field("Nome do compromisso"), { target: { value: "Academia" } });
    fireEvent.click(screen.getByRole("button", { name: /mais opções/i }));
    fireEvent.click(screen.getByRole("radio", { name: "Toda segunda" }));
    fireEvent.click(screen.getByRole("button", { name: /Criar série/ }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(fake.rows("agenda_series")).toHaveLength(1);
    expect(fake.rows("agenda_series")[0].rule).toMatchObject({ freq: "weekly", byWeekday: [1] });
    // só hoje vira compromisso real; o futuro continua sendo regra
    expect(fake.rows("executions").length).toBeLessThanOrEqual(2);
  });

  it("escolher “Não repete” volta ao compromisso simples", () => {
    renderComposer();
    fireEvent.click(screen.getByRole("button", { name: /mais opções/i }));
    fireEvent.click(screen.getByRole("radio", { name: "Todos os dias" }));
    expect(screen.getAllByText("Todos os dias").length).toBeGreaterThan(1);
    fireEvent.click(screen.getByRole("radio", { name: "Não repete" }));
    expect(screen.getByRole("button", { name: /Salvar na agenda/ })).toBeInTheDocument();
  });
});
