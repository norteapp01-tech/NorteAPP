import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  useGoalsStore,
  focusGoal,
  isGoalComplete,
  type Goal,
  type Step,
  type Execution,
} from "@/lib/goals-store";
import { CompletedPlansSection } from "@/components/plan/CompletedPlansSection";
import { FocusPlanCard } from "@/components/plan/FocusPlanCard";
import { OtherPlansSection } from "@/components/plan/OtherPlansSection";
import { PlanMenuSheet } from "@/components/plan/PlanMenuSheet";
import { nowDate } from "@/lib/test-clock";
import { UnderlineTabs } from "@/components/ui/app-design-system";

export const Route = createFileRoute("/planejamento")({
  head: () => ({ meta: [{ title: "Planejamento — Norte" }] }),
  component: PlanScreen,
});

type Layer = "mes" | "quarter" | "semestre" | "ano";

const layerLabel: Record<Layer, string> = {
  mes: "Mês",
  quarter: "90 dias",
  semestre: "Semestre",
  ano: "Ano",
};

/** Dias entre hoje e uma data ISO (negativo se já passou). */
function daysUntil(iso?: string): number | null {
  if (!iso) return null;
  const today = nowDate();
  today.setHours(0, 0, 0, 0);
  const d = new Date(iso + "T00:00:00");
  return Math.round((d.getTime() - today.getTime()) / 86400000);
}

/** Planejamentos com prazo dentro da janela — camadas são visões temporais do mesmo dado, não sistemas separados. */
function planningsWithinDeadline(goals: Goal[], maxDays: number): Goal[] {
  return [...goals]
    .filter((g) => {
      const d = daysUntil(g.deadlineISO);
      return d !== null && d <= maxDays;
    })
    .sort((a, b) => (daysUntil(a.deadlineISO) ?? 0) - (daysUntil(b.deadlineISO) ?? 0));
}

function PlanScreen() {
  const [layer, setLayer] = useState<Layer>("quarter");
  const goals = useGoalsStore((s) => s.goals);
  const steps = useGoalsStore((s) => s.steps);
  const executions = useGoalsStore((s) => s.executions);
  // Planos 100% concluídos saem das visões ativas (Semana/Mês/90 dias/Semestre/Ano) —
  // ficam só na seção "Planos concluídos", reativo (reabrir uma etapa/execução já basta
  // pra voltar a aparecer aqui, sem reload).
  const activeGoals = useMemo(
    () => goals.filter((g) => !isGoalComplete(g, steps, executions)),
    [goals, steps, executions],
  );

  return (
    <div className="px-5 pt-12">
      <div className="flex items-start justify-between gap-3">
        <header className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Plano
          </p>
          <h1 className="mt-1 text-3xl font-bold">Do sonho ao próximo passo</h1>
          <p className="mt-2 text-sm text-muted-foreground text-balance-tight">
            Transforme seus planos em próximas ações.
          </p>
        </header>
        <div className="-mr-2 -mt-1 shrink-0">
          <PlanMenuSheet goals={goals} />
        </div>
      </div>

      <UnderlineTabs
        className="mt-6"
        items={(Object.keys(layerLabel) as Layer[]).map((key) => ({
          key,
          label: layerLabel[key],
        }))}
        value={layer}
        onChange={setLayer}
      />
      {layer === "mes" && (
        <PlanningHorizonView
          maxDays={31}
          goals={activeGoals}
          steps={steps}
          executions={executions}
        />
      )}
      {layer === "quarter" && (
        <PlanningHorizonView
          maxDays={90}
          goals={activeGoals}
          steps={steps}
          executions={executions}
        />
      )}
      {layer === "semestre" && (
        <PlanningHorizonView
          maxDays={183}
          goals={activeGoals}
          steps={steps}
          executions={executions}
        />
      )}
      {layer === "ano" && (
        <PlanningHorizonView
          maxDays={null}
          goals={activeGoals}
          steps={steps}
          executions={executions}
        />
      )}

      <CompletedPlansSection goals={goals} steps={steps} executions={executions} />
    </div>
  );
}

function EmptyLayer({ text }: { text: string }) {
  return <div className="card-surface p-6 text-center text-sm text-muted-foreground">{text}</div>;
}

/** `maxDays: null` = sem filtro de horizonte (visão "Ano": todos os planos,
 * inclusive os sem prazo definido, ordenados com os sem prazo por último).
 * Recorta o mesmo dataset de goals/steps/executions pelo horizonte da camada
 * atual e apresenta como "Em foco" (1 plano, por `focusGoal`) + "Outros
 * planos" (o resto) — nunca uma lista separada. */
function PlanningHorizonView({
  maxDays,
  goals,
  steps,
  executions,
}: {
  maxDays: number | null;
  goals: Goal[];
  steps: Step[];
  executions: Execution[];
}) {
  const filtered =
    maxDays === null
      ? [...goals].sort((a, b) =>
          (a.deadlineISO ?? "9999-99-99").localeCompare(b.deadlineISO ?? "9999-99-99"),
        )
      : planningsWithinDeadline(goals, maxDays);

  if (filtered.length === 0) {
    return (
      <div className="mt-5">
        <EmptyLayer text="Sem planejamentos com prazo nesse horizonte." />
      </div>
    );
  }

  const focus = focusGoal(filtered, steps, executions);
  const others = filtered.filter((g) => g.id !== focus?.id);

  return (
    <div className="mt-5 space-y-5">
      {focus && (
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Em foco
          </p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">próximo passo</p>
          <div className="mt-3">
            <FocusPlanCard goal={focus} steps={steps} executions={executions} />
          </div>
        </div>
      )}
      <OtherPlansSection goals={others} steps={steps} executions={executions} />
    </div>
  );
}
