import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createRef } from "react";
import type { ExerciseLog, PlannedExercise, WorkoutSession } from "@/lib/workout-store";

const h = vi.hoisted(() => ({
  gym: {} as Record<string, unknown>,
  logSet: vi.fn(async () => undefined),
  skipSet: vi.fn(async () => undefined),
  skipExercise: vi.fn(async () => undefined),
  completeExerciseLog: vi.fn(async () => undefined),
  startRest: vi.fn(async () => undefined),
  updateSet: vi.fn(async () => undefined),
}));

vi.mock("@tanstack/react-router", () => ({ useNavigate: () => vi.fn() }));
vi.mock("@/lib/gym-session-context", () => ({ useGymSession: () => h.gym }));
vi.mock("@/lib/workout-store", async () => {
  const actual = await vi.importActual<typeof import("@/lib/workout-store")>("@/lib/workout-store");
  return {
    ...actual,
    logSet: h.logSet,
    skipSet: h.skipSet,
    skipExercise: h.skipExercise,
    completeExerciseLog: h.completeExerciseLog,
    startRest: h.startRest,
    updateSet: h.updateSet,
  };
});
vi.mock("@/lib/supabase/client", () => ({
  supabase: {},
  ensureSession: async () => "u",
  useSupabaseUserId: () => "u",
}));

import { QuickSetPanel } from "./QuickSetPanel";
import { SwipeToSkip } from "./SwipeToSkip";
import { WorkoutBubble } from "./WorkoutBubble";

const planned: PlannedExercise = {
  exerciseId: "ex-1",
  name: "Supino reto",
  setsTarget: 3,
  repsTarget: 10,
  loadTarget: 40,
  restSeconds: 60,
  setTargets: [
    { reps: 10, weight: 40, restSeconds: 60 },
    { reps: 10, weight: 40, restSeconds: 60 },
    { reps: 10, weight: 40, restSeconds: 60 },
  ],
  order: 0,
} as unknown as PlannedExercise;

function session(log: Partial<ExerciseLog> = {}, extra: Partial<WorkoutSession> = {}) {
  return {
    id: "s1",
    planId: "p1",
    status: "em_andamento",
    startedAt: new Date(Date.now() - 600_000).toISOString(),
    pausedSeconds: 0,
    restOverrides: {},
    exerciseLogs: [{ exerciseId: "ex-1", sets: [], done: false, skippedSets: [], ...log }],
    ...extra,
  } as unknown as WorkoutSession;
}

function setup(s: WorkoutSession) {
  h.gym = {
    session: s,
    plan: { id: "p1", letter: "A" },
    planned: [planned, { ...planned, exerciseId: "ex-2", name: "Crucifixo" }],
    selectedExerciseId: "ex-1",
    select: vi.fn(),
    advance: vi.fn(),
    autoRest: false,
    timerFace: "descanso",
    setTimerFace: vi.fn(),
    setFullscreen: vi.fn(),
    setFinishedSummaryId: vi.fn(),
    panelOpen: true,
    setPanelOpen: vi.fn(),
  };
  const el = document.createElement("div");
  el.getBoundingClientRect = () => ({ width: 390, height: 800 }) as DOMRect;
  const ref = createRef<HTMLDivElement>();
  (ref as { current: HTMLDivElement }).current = el;
  return render(
    <QuickSetPanel
      anchor={{ x: 300, y: 600 }}
      bubbleSize={56}
      containerRef={ref}
      onClose={vi.fn()}
    />,
  );
}

beforeEach(() => vi.clearAllMocks());

describe("painel rápido (Alter)", () => {
  it("'Adicionar série' não aparece enquanto o exercício está em andamento", () => {
    setup(session({ sets: [{ setIndex: 0, weight: 40, reps: 10 }] }));
    expect(screen.queryByRole("button", { name: /adicionar série/i })).toBeNull();
    expect(screen.getByText(/série/i, { selector: "p" })).toHaveTextContent("Série 2 de 3");
  });

  it("depois de concluir a última série, aparece 'Adicionar série' e um botão para o próximo exercício", () => {
    setup(
      session({
        done: true,
        sets: [0, 1, 2].map((i) => ({ setIndex: i, weight: 40, reps: 10 })),
      }),
    );
    expect(screen.getByText("Exercício concluído")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /adicionar série/i })).toBeInTheDocument();
    fireEvent.click(
      screen
        .getAllByRole("button", { name: /próximo exercício/i })
        .find((b) => b.textContent?.includes("Próximo"))!,
    );
    expect(h.gym.advance as ReturnType<typeof vi.fn>).toHaveBeenCalledWith("ex-1");
  });

  it("concluir a última série não avança sozinho: fica no exercício", async () => {
    setup(
      session({
        sets: [0, 1].map((i) => ({ setIndex: i, weight: 40, reps: 10 })),
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: /registrar série 3/i }));
    await waitFor(() => expect(h.completeExerciseLog).toHaveBeenCalledWith("s1", "ex-1"));
    expect(h.gym.advance as ReturnType<typeof vi.fn>).not.toHaveBeenCalled();
  });

  it("drop: um único check grava a série e o drop juntos", async () => {
    setup(session());
    fireEvent.click(screen.getByRole("button", { name: "Drop" }));
    expect(screen.getByLabelText("Peso do drop")).toBeInTheDocument();
    // um só botão de registrar, e nenhum segundo "Registrar drop"
    expect(screen.getAllByRole("button", { name: /registrar/i })).toHaveLength(1);
    expect(screen.queryByRole("button", { name: /registrar drop/i })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /registrar série 1/i }));
    await waitFor(() => expect(h.logSet).toHaveBeenCalledTimes(1));
    const call = h.logSet.mock.calls[0] as unknown[];
    expect(call.slice(0, 4)).toEqual(["s1", "ex-1", 40, 10]);
    expect(call[4]).toEqual({ drop: { weight: 30, reps: 5 } });
  });

  it("sem ligar o drop, a série é gravada sem drop", async () => {
    setup(session());
    fireEvent.click(screen.getByRole("button", { name: /registrar série 1/i }));
    await waitFor(() => expect(h.logSet).toHaveBeenCalled());
    expect((h.logSet.mock.calls[0] as unknown[])[4]).toEqual({});
  });

  it("pular série na 2 de 3 grava uma série pulada e não conclui o exercício", async () => {
    setup(session({ sets: [{ setIndex: 0, weight: 40, reps: 10 }] }));
    fireEvent.click(screen.getByRole("button", { name: /pular série/i }));
    await waitFor(() => expect(h.skipSet).toHaveBeenCalledWith("s1", "ex-1"));
    expect(h.completeExerciseLog).not.toHaveBeenCalled();
  });

  it("pular a última série, tendo feito outras, conclui o exercício", async () => {
    setup(session({ sets: [0, 1].map((i) => ({ setIndex: i, weight: 40, reps: 10 })) }));
    fireEvent.click(screen.getByRole("button", { name: /pular série/i }));
    await waitFor(() => expect(h.completeExerciseLog).toHaveBeenCalledWith("s1", "ex-1"));
  });

  it("'Pular exercício' funciona mesmo com séries já feitas", async () => {
    setup(session({ sets: [{ setIndex: 0, weight: 40, reps: 10 }] }));
    const button = screen.getByRole("button", { name: /pular exercício/i });
    expect(button).toBeEnabled();
    fireEvent.click(button);
    await waitFor(() => expect(h.skipExercise).toHaveBeenCalledWith("s1", "ex-1", true));
    expect(h.gym.advance as ReturnType<typeof vi.fn>).toHaveBeenCalled();
  });

  it("série pulada aparece como 'pulada' e a seguinte é a atual", () => {
    setup(session({ sets: [{ setIndex: 0, weight: 40, reps: 10 }], skippedSets: [1] }));
    expect(screen.getByText(/série/i, { selector: "p" })).toHaveTextContent("Série 3 de 3");
    fireEvent.click(screen.getByRole("button", { name: /séries? registradas?/i }));
    expect(screen.getByText("pulada")).toBeInTheDocument();
  });

  it("série com drop mostra o drop anexado a ela", () => {
    setup(
      session({
        sets: [{ setIndex: 0, weight: 40, reps: 10, drop: { weight: 30, reps: 6 } }],
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: /séries? registradas?/i }));
    expect(screen.getByLabelText("Peso do drop de Série 1")).toHaveValue(30);
  });
});

describe("cronômetro na bolha do Alter", () => {
  it("passando do descanso, conta o tempo a mais com '+' em vez de congelar em 0:00", () => {
    const now = Date.now();
    setup(
      session(
        {},
        {
          restStartedAt: new Date(now - 65_000).toISOString(),
          restTotalSeconds: 60,
          restPausedSeconds: 0,
        },
      ),
    );
    const { container } = render(<WorkoutBubble />);
    const text = container.querySelector("button span")?.textContent ?? "";
    expect(text).toMatch(/^\+00:0[4-9]$/);
  });

  it("durante o descanso mostra a contagem regressiva", () => {
    const now = Date.now();
    setup(
      session(
        {},
        {
          restStartedAt: new Date(now - 10_000).toISOString(),
          restTotalSeconds: 60,
          restPausedSeconds: 0,
        },
      ),
    );
    const { container } = render(<WorkoutBubble />);
    expect(container.querySelector("button span")?.textContent).toMatch(/^00:(49|50)$/);
  });
});

describe("arrastar para pular", () => {
  const drag = (el: HTMLElement, from: [number, number], to: [number, number]) => {
    fireEvent.pointerDown(el, { pointerId: 1, clientX: from[0], clientY: from[1] });
    fireEvent.pointerMove(el, { pointerId: 1, clientX: to[0], clientY: to[1] });
    fireEvent.pointerUp(el, { pointerId: 1, clientX: to[0], clientY: to[1] });
  };

  it("um arrasto horizontal longo para a esquerda pula", () => {
    const onSkip = vi.fn();
    render(
      <SwipeToSkip onSkip={onSkip}>
        <p>Série 2</p>
      </SwipeToSkip>,
    );
    drag(screen.getByText("Série 2"), [300, 100], [150, 105]);
    expect(onSkip).toHaveBeenCalledTimes(1);
  });

  it("arrasto curto, vertical ou para a direita não pula", () => {
    const onSkip = vi.fn();
    render(
      <SwipeToSkip onSkip={onSkip}>
        <p>Série 2</p>
      </SwipeToSkip>,
    );
    const row = screen.getByText("Série 2");
    drag(row, [300, 100], [260, 100]);
    drag(row, [300, 100], [290, 300]);
    drag(row, [100, 100], [300, 100]);
    expect(onSkip).not.toHaveBeenCalled();
  });

  it("desativado não pula", () => {
    const onSkip = vi.fn();
    render(
      <SwipeToSkip onSkip={onSkip} disabled>
        <p>Série 2</p>
      </SwipeToSkip>,
    );
    drag(screen.getByText("Série 2"), [300, 100], [100, 100]);
    expect(onSkip).not.toHaveBeenCalled();
  });
});
