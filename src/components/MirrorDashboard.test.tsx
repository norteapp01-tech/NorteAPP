import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { queryClient } from "@/lib/query-client";
import {
  analyzeAgenda,
  compare,
  previousPeriod,
  resolvePeriod,
  type AnalysisInput,
} from "@/lib/mirror-analytics";
import { buildInsights } from "@/lib/mirror-insights";
import type { AgendaOccurrence } from "@/lib/agenda-occurrences";

const mirror = vi.hoisted(() => ({ value: { status: "loading" } as unknown }));
vi.mock("@/lib/mirror-store", async () => {
  const actual = await vi.importActual<typeof import("@/lib/mirror-store")>("@/lib/mirror-store");
  return { ...actual, useMirror: () => mirror.value };
});
vi.mock("@tanstack/react-router", async () => {
  const actual =
    await vi.importActual<typeof import("@tanstack/react-router")>("@tanstack/react-router");
  return {
    ...actual,
    Link: ({ children, to, ...rest }: { children: ReactNode; to: string }) => (
      <a href={to} {...(rest as object)}>
        {children}
      </a>
    ),
  };
});
vi.mock("@/lib/supabase/client", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/supabase/client")>("@/lib/supabase/client");
  return { ...actual, useSupabaseUserId: () => null };
});

import { MirrorDashboard } from "./MirrorDashboard";

const TODAY = "2026-10-14";
const now = { date: TODAY, minute: 12 * 60 };
let n = 0;
const occ = (p: Partial<AgendaOccurrence> & { date: string }): AgendaOccurrence =>
  ({
    key: `k${++n}`,
    kind: "execution",
    executionId: `e${n}`,
    title: `Item ${n}`,
    startTime: "09:00",
    endTime: "10:00",
    allDay: false,
    category: "generico",
    rigid: false,
    weight: "medio",
    status: "concluida",
    recurring: false,
    source: "norte",
    ...p,
  }) as AgendaOccurrence;

function ready(occurrences: AgendaOccurrence[], over: Record<string, unknown> = {}) {
  const period = resolvePeriod("7d", TODAY);
  const base: AnalysisInput = {
    occurrences,
    changes: [],
    executions: [],
    labels: [{ id: "w", name: "Trabalho", color: "#7cb8ff" }],
    now,
    window: { start: 420, end: 1320 },
  };
  const current = analyzeAgenda(base, period);
  const previous = analyzeAgenda(base, previousPeriod(period));
  const comparison = compare(current, previous);
  return {
    status: "ready",
    period,
    current,
    previous,
    comparison,
    insights: buildInsights(current, comparison, {
      labels: base.labels,
      scope: "nos últimos 7 dias",
    }),
    historyMissing: false,
    routines: { current, previous },
    recentUnanswered: [],
    labels: base.labels,
    ...over,
  };
}

function renderIt() {
  return render(
    <QueryClientProvider client={queryClient}>
      <MirrorDashboard />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(`${TODAY}T12:00:00`));
  mirror.value = { status: "loading" };
});

describe("Espelho: estados", () => {
  it("carregando", () => {
    renderIt();
    expect(screen.getByRole("status", { name: /carregando o espelho/i })).toBeInTheDocument();
  });

  it("erro com nova tentativa", () => {
    const retry = vi.fn();
    mirror.value = { status: "error", retry };
    renderIt();
    expect(screen.getByRole("alert")).toHaveTextContent(/não consegui carregar/i);
    fireEvent.click(screen.getByRole("button", { name: /tentar de novo/i }));
    expect(retry).toHaveBeenCalled();
  });

  it("sem dados: explica e não inventa números", () => {
    mirror.value = ready([]);
    renderIt();
    expect(screen.getByText(/ainda não há compromissos encerrados/i)).toBeInTheDocument();
    expect(screen.queryByText(/%/)).toBeNull();
  });

  it("dados insuficientes: mostra o que existe e avisa", () => {
    mirror.value = ready([
      occ({ date: "2026-10-12" }),
      occ({ date: "2026-10-13", status: "perdida" }),
    ]);
    renderIt();
    expect(screen.getByText(/1 de 2 compromissos realizados/i)).toBeInTheDocument();
    expect(screen.getAllByText(/poucos/i).length).toBeGreaterThan(0);
  });

  it("histórico de mudanças indisponível: avisa e não mostra zero", () => {
    mirror.value = ready(
      [
        occ({ date: "2026-10-12" }),
        occ({ date: "2026-10-12", startTime: "11:00", endTime: "12:00" }),
      ],
      { historyMissing: true },
    );
    renderIt();
    expect(screen.getByText(/não consegui carregar o histórico/i)).toBeInTheDocument();
  });
});

describe("Espelho: conteúdo e navegação", () => {
  const rich = () => {
    const list: AgendaOccurrence[] = [];
    for (const d of ["2026-10-08", "2026-10-09", "2026-10-10", "2026-10-11"]) {
      list.push(
        occ({ date: d, startTime: "07:00", endTime: "08:00", labelId: "w", title: "Treino" }),
      );
      list.push(
        occ({
          date: d,
          startTime: "20:00",
          endTime: "21:00",
          labelId: "w",
          status: "perdida",
          title: "Estudo",
        }),
      );
    }
    return list;
  };

  it("visão geral traz o insight principal e a origem do dado sob demanda", () => {
    mirror.value = ready(rich());
    renderIt();
    expect(screen.getByText(/4 de 8 compromissos realizados/i)).toBeInTheDocument();
    expect(screen.getByText(/cumprir melhor seus compromissos pela manhã/i)).toBeInTheDocument();
    expect(screen.queryByText(/4 de 4 concluídos/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /de onde vem isso/i }));
    expect(screen.getByText(/4 de 4 concluídos pela manhã/i)).toBeInTheDocument();
  });

  it("não usa a expressão 'tempo real gasto' como dado", () => {
    mirror.value = ready(rich());
    renderIt();
    expect(screen.getByText(/duração planejada, não tempo real/i)).toBeInTheDocument();
  });

  it("alterna entre Agenda e Rotinas", () => {
    mirror.value = ready(rich());
    renderIt();
    fireEvent.click(screen.getByRole("tab", { name: "Agenda" }));
    expect(screen.getByText(/para onde o tempo foi/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "Rotinas" }));
    expect(screen.getByText(/áreas da sua vida/i)).toBeInTheDocument();
  });

  it("períodos: personalizado mostra as datas", () => {
    mirror.value = ready(rich());
    renderIt();
    expect(screen.queryByLabelText("De")).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: "Personalizado" }));
    expect(screen.getByLabelText("De")).toBeInTheDocument();
    expect(screen.getByLabelText("Até")).toHaveAttribute("max", TODAY);
    for (const label of ["7 dias", "30 dias", "3 meses"])
      expect(screen.getByRole("tab", { name: label })).toBeInTheDocument();
  });

  it("'Como foram?' só aparece com concluídos recentes sem resposta", () => {
    const pending = occ({ date: "2026-10-13", title: "Caminhada" });
    mirror.value = ready(rich(), { recentUnanswered: [pending] });
    renderIt();
    expect(screen.getByText("Como foram?")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pesado" })).toBeInTheDocument();
  });
});
