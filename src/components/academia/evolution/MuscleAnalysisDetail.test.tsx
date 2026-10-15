import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { CompletionResult } from "@/lib/muscle-analysis/types";

const updateExercise = vi.fn(async () => {});
vi.mock("@/lib/workout-store", () => ({
  updateExercise: (...a: unknown[]) => updateExercise(...(a as [])),
  useWorkoutStore: (sel: (s: unknown) => unknown) =>
    sel({
      exercises: [
        {
          id: "ex1",
          lineageId: "lin1",
          loadTarget: 20,
          setTargets: [{ reps: 10, weight: 20, restSeconds: 60 }],
        },
      ],
    }),
}));
import { MuscleAnalysisDetail } from "./MuscleAnalysisDetail";
afterEach(cleanup);

const golden: CompletionResult = {
  muscleId: "biceps",
  muscleName: "Bíceps",
  score: 10,
  completionPercentage: 100,
  status: "progredir",
  confidence: "alta",
  plannedVolume: { sessions: 2, exercises: 2, sets: 6, reps: 60 },
  completedVolume: { sessions: 2, exercises: 2, sets: 6, reps: 60 },
  eligibleForProgression: true,
  progression: [
    {
      lineageId: "lin1",
      exerciseId: "ex1",
      name: "Rosca direta",
      currentLoad: 20,
      suggestedLoad: 22.5,
      repsTarget: 10,
    },
  ],
  incomplete: [],
  insufficientData: false,
  previousScore: 8,
  explanation: "100% do treino planejado.",
};

it("estado dourado recomenda progredir e só altera a ficha depois de confirmar", async () => {
  render(<MuscleAnalysisDetail mode="cumprimento" completion={golden} />);
  expect(screen.getByText("Progressão sugerida")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Subir para 22,5 kg" }));
  expect(updateExercise).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Confirmar 22,5 kg" }));
  await waitFor(() =>
    expect(updateExercise).toHaveBeenCalledWith("ex1", {
      loadTarget: 22.5,
      setTargets: [{ reps: 10, weight: 22.5, restSeconds: 60 }],
    }),
  );
  expect(await screen.findByText("Meta atualizada")).toBeInTheDocument();
});

it("mostra séries, repetições, treinos e a comparação com o período anterior", () => {
  render(
    <MuscleAnalysisDetail
      mode="cumprimento"
      completion={{ ...golden, status: "meta", eligibleForProgression: false, progression: [] }}
    />,
  );
  expect(screen.getByText("+2 vs período anterior", { exact: false })).toBeInTheDocument();
  expect(screen.getByText("6 de 6")).toBeInTheDocument();
  expect(screen.getByText("60 de 60")).toBeInTheDocument();
});

it("evolução sem dados mostra 'dados insuficientes', nunca zero", () => {
  render(
    <MuscleAnalysisDetail
      mode="evolucao"
      evolution={{
        muscleId: "biceps",
        muscleName: "Bíceps",
        score: null,
        evolutionPercentage: null,
        label: null,
        confidence: "baixa",
        exercises: [],
        insufficientData: true,
        explanation: "",
      }}
    />,
  );
  expect(screen.getByText("Dados insuficientes para calcular a evolução.")).toBeInTheDocument();
  expect(screen.queryByText(/0 \/ 10/)).not.toBeInTheDocument();
});
