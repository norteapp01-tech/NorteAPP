import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { categoryMeta, lifeAreas, lifeAreaColor } from "@/lib/mock-data";
import {
  useGoalsStore,
  goalProgress,
  goalPace,
  todayExecutions,
  type Goal,
  type Step,
  type Execution,
} from "@/lib/goals-store";
import { Plus, GitBranch, Target } from "lucide-react";
import { PlanProgressChart } from "@/components/PlanProgressChart";
import { useProfile } from "@/lib/profile-store";
import { formatTime } from "@/lib/format-utils";
import { nowDate } from "@/lib/test-clock";

export const Route = createFileRoute("/planejamento")({
  head: () => ({ meta: [{ title: "Planejamento — Norte" }] }),
  component: PlanScreen,
});

type Layer = "hoje" | "semana" | "mes" | "quarter" | "semestre" | "ano";

const sundayMode = nowDate().getDay() === 0;

const layerLabel: Record<Layer, string> = {
  hoje: "Hoje",
  semana: "Semana",
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
  const profile = useProfile();

  return (
    <div className="px-5 pt-12">
      <header>
        <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
          Planejamento em camadas
        </p>
        <h1 className="mt-1 text-3xl font-bold">Do sonho ao próximo passo</h1>
        <p className="mt-2 text-sm text-muted-foreground text-balance-tight">
          Semana, mês, 90 dias, semestre e ano são visões do mesmo planejamento — não listas
          separadas.
        </p>
      </header>

      <div className="mt-6 -mx-5 overflow-x-auto px-5">
        <div
          className="flex gap-1 rounded-2xl border border-border bg-surface p-1"
          style={{ width: "max-content", minWidth: "100%" }}
        >
          {(Object.keys(layerLabel) as Layer[]).map((l) => (
            <button
              key={l}
              onClick={() => setLayer(l)}
              className={`rounded-xl px-3 py-2 text-xs font-semibold transition-colors ${layer === l ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
            >
              {layerLabel[l]}
            </button>
          ))}
        </div>
      </div>

      {/* cascade banner */}
      <div className="mt-4 flex items-start gap-2 rounded-2xl border border-border bg-surface/60 p-3 text-[11px] text-muted-foreground">
        <GitBranch className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
        <p className="text-balance-tight">
          {layer === "ano" && "Todos os seus planejamentos, com prazo em qualquer horizonte."}
          {layer === "semestre" && "Planejamentos com prazo dentro dos próximos 6 meses."}
          {layer === "quarter" && "Planejamentos com prazo dentro dos próximos 90 dias."}
          {layer === "mes" && "Planejamentos com prazo dentro deste mês."}
          {layer === "semana" && "Planejamentos com prazo nos próximos 7 dias."}
          {layer === "hoje" && "O que aparece hoje veio direto das execuções planejadas."}
        </p>
      </div>

      {layer === "hoje" && (
        <div className="mt-5 space-y-2.5">
          {todayExecutions(executions)
            .filter((t) => t.status !== "cancelada")
            .map((t) => (
              <div key={t.id} className="card-surface flex items-center gap-3 p-3.5">
                <span className="font-mono text-xs font-bold text-muted-foreground">
                  {formatTime(t.startTime, profile.timeFormat)}
                </span>
                <span className="text-lg">
                  {(categoryMeta[t.category] ?? categoryMeta.generico).emoji}
                </span>
                <p
                  className={`flex-1 text-sm ${t.status === "concluida" ? "line-through opacity-60" : ""}`}
                >
                  {t.title}
                </p>
                {t.goalId && (
                  <span className="text-[10px] text-muted-foreground">
                    ← {goals.find((g) => g.id === t.goalId)?.title.slice(0, 18)}
                  </span>
                )}
              </div>
            ))}
          {todayExecutions(executions).length === 0 && (
            <div className="card-surface p-6 text-center text-sm text-muted-foreground">
              Nada planejado para hoje.
            </div>
          )}
        </div>
      )}

      {layer === "semana" && <WeekLayer steps={steps} goals={goals} executions={executions} />}
      {layer === "mes" && (
        <PlanningHorizonView
          title="Planejamentos deste mês"
          maxDays={31}
          goals={goals}
          steps={steps}
          executions={executions}
        />
      )}
      {layer === "quarter" && (
        <PlanningHorizonView
          title="Planejamentos dos próximos 90 dias"
          maxDays={90}
          goals={goals}
          steps={steps}
          executions={executions}
        />
      )}
      {layer === "semestre" && (
        <PlanningHorizonView
          title="Planejamentos deste semestre"
          maxDays={183}
          goals={goals}
          steps={steps}
          executions={executions}
        />
      )}
      {layer === "ano" && <YearGoals />}

      <div className="mt-8 rounded-2xl border border-border bg-surface p-4">
        <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
          Áreas da vida
        </p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {lifeAreas.map((area) => (
            <div key={area} className="rounded-xl border border-border bg-surface-2 p-3">
              <span
                className="text-[10px] font-bold uppercase tracking-[0.15em]"
                style={{ color: lifeAreaColor[area] }}
              >
                {area}
              </span>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {goals.filter((g) => g.lifeArea === area).length} planej.
              </p>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-6">
        <PlanProgressChart />
      </div>
    </div>
  );
}

function EmptyLayer({ text }: { text: string }) {
  return <div className="card-surface p-6 text-center text-sm text-muted-foreground">{text}</div>;
}

function PlanningProgressBar({
  goal,
  steps,
  executions,
}: {
  goal: Goal;
  steps: Step[];
  executions: Execution[];
}) {
  const pct = goalProgress(goal, steps, executions);
  const pace = goalPace(goal, steps, executions);
  return (
    <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-2">
      <div
        className={`h-full rounded-full ${pace === "behind" ? "bg-danger" : pace === "ahead" ? "bg-warning" : "bg-primary"}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function WeekLayer({
  steps,
  goals,
  executions,
}: {
  steps: Step[];
  goals: Goal[];
  executions: Execution[];
}) {
  return (
    <>
      {sundayMode && (
        <div className="mt-5 rounded-2xl border border-primary/30 bg-primary/10 p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">
            🛋️ Ritual de Domingo ativo
          </p>
          <p className="mt-1.5 text-sm text-balance-tight">
            Revise as execuções da semana e ajuste o que precisar antes de segunda. A agenda dia a
            dia fica na aba Agenda.
          </p>
        </div>
      )}
      <PlanningHorizonView
        title="Planejamentos desta semana"
        maxDays={7}
        goals={goals}
        steps={steps}
        executions={executions}
      />
    </>
  );
}

function PlanningHorizonView({
  title,
  maxDays,
  goals,
  steps,
  executions,
}: {
  title: string;
  maxDays: number;
  goals: Goal[];
  steps: Step[];
  executions: Execution[];
}) {
  const filtered = planningsWithinDeadline(goals, maxDays);
  const overdue = filtered.filter((g) => (daysUntil(g.deadlineISO) ?? 0) < 0);
  const upcoming = filtered.filter((g) => (daysUntil(g.deadlineISO) ?? 0) >= 0);

  return (
    <div className="mt-5 space-y-5">
      {overdue.length > 0 && (
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-danger">
            Atrasados ({overdue.length})
          </p>
          <div className="mt-3 space-y-2.5">
            {overdue.map((g) => (
              <PlanCard key={g.id} goal={g} steps={steps} executions={executions} />
            ))}
          </div>
        </div>
      )}
      <div>
        <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{title}</p>
        <div className="mt-3 space-y-2.5">
          {upcoming.map((g) => (
            <PlanCard key={g.id} goal={g} steps={steps} executions={executions} />
          ))}
          {filtered.length === 0 && (
            <EmptyLayer text="Sem planejamentos com prazo nesse horizonte." />
          )}
        </div>
      </div>
    </div>
  );
}

function PlanCard({
  goal: g,
  steps,
  executions,
}: {
  goal: Goal;
  steps: Step[];
  executions: Execution[];
}) {
  const cat = categoryMeta[g.category] ?? categoryMeta.generico;
  const pct = goalProgress(g, steps, executions);
  const gSteps = steps.filter((s) => s.goalId === g.id).sort((a, b) => a.order - b.order);
  const nextAction = gSteps.find((s) => !s.done);
  return (
    <Link
      to="/objetivo/$id"
      params={{ id: g.id }}
      className="card-surface block p-4 hover:border-primary/40"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-[10px] uppercase tracking-wider text-muted-foreground">
            {cat.emoji} {g.lifeArea}
          </p>
          <p className="mt-1 font-semibold leading-snug">{g.title}</p>
          <p className="text-[11px] text-muted-foreground">
            prazo {g.deadlineLabel}
            {gSteps.length > 0
              ? ` · ${gSteps.filter((s) => s.done).length}/${gSteps.length} etapas`
              : ""}
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-primary/10 px-2.5 py-1 font-mono text-xs font-bold text-primary">
          {pct}%
        </span>
      </div>
      {nextAction && (
        <p className="mt-2 truncate text-[11px] text-primary">Próxima ação: {nextAction.title}</p>
      )}
      <PlanningProgressBar goal={g} steps={steps} executions={executions} />
    </Link>
  );
}

function YearGoals() {
  const storedGoals = useGoalsStore((s) => s.goals);
  const steps = useGoalsStore((s) => s.steps);
  const executions = useGoalsStore((s) => s.executions);
  return (
    <div className="mt-5 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Planejamentos que você está construindo.</p>
        <Link
          to="/criar"
          search={{ modo: "planejamento" }}
          className="flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-semibold text-primary"
        >
          <Plus className="h-3 w-3" /> novo
        </Link>
      </div>
      {storedGoals.map((g) => {
        const cat = categoryMeta[g.category] ?? categoryMeta.generico;
        const pct = goalProgress(g, steps, executions);
        const pace = goalPace(g, steps, executions);
        const gSteps = steps.filter((s) => s.goalId === g.id).sort((a, b) => a.order - b.order);
        const gExecs = executions.filter((e) => e.goalId === g.id);
        const nextAction = gSteps.find((s) => !s.done);
        return (
          <Link
            key={g.id}
            to="/objetivo/$id"
            params={{ id: g.id }}
            className="card-surface block p-4 hover:border-primary/40"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold">
                  {cat.emoji} {g.title}
                </p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {g.lifeArea} · prazo {g.deadlineLabel}
                </p>
              </div>
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${pace === "behind" ? "bg-danger/15 text-danger" : pace === "ahead" ? "bg-warning/15 text-warning" : "bg-primary/15 text-primary"}`}
              >
                {pace === "behind" ? "atrasado" : pace === "ahead" ? "adiantado" : "no ritmo"}
              </span>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-2">
              <div
                className={`h-full rounded-full ${pace === "behind" ? "bg-danger" : pace === "ahead" ? "bg-warning" : "bg-primary"}`}
                style={{ width: `${pct}%` }}
              />
            </div>
            <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1">
                <Target className="h-3 w-3 text-primary" />
                {g.trackingType === "etapas"
                  ? `${gSteps.filter((s) => s.done).length}/${gSteps.length} etapas`
                  : `${gExecs.filter((e) => e.status === "concluida").length} execuções`}
              </span>
              <span className="font-semibold text-foreground">{pct}%</span>
            </div>
            {nextAction && (
              <p className="mt-2 truncate text-[11px] text-primary">
                Próxima ação: {nextAction.title}
              </p>
            )}
          </Link>
        );
      })}
      {storedGoals.length === 0 && (
        <div className="card-surface p-6 text-center text-sm text-muted-foreground">
          Nenhum planejamento ainda. Toque em <span className="text-primary">novo</span> para criar.
        </div>
      )}
    </div>
  );
}
