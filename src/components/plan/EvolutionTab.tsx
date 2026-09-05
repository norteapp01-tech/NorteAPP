import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Flame, TrendingUp } from "lucide-react";
import {
  goalProgress,
  goalPace,
  planningStatus,
  stepsForGoal,
  executionsForGoal,
  progressOverTime,
  plannedVsActual,
  estimatedCompletionDate,
  formatDateBR,
  type Goal,
  type Step,
  type Execution,
  type ProgressPoint,
} from "@/lib/goals-store";
import { nowMs } from "@/lib/test-clock";
import { PlanVisualMap } from "./PlanVisualMap";

const statusLabel = {
  ativo: "ativo",
  concluido: "concluído",
  em_risco: "em risco",
  atrasado: "atrasado",
};
const statusTone = {
  ativo: "bg-primary/15 text-primary",
  concluido: "bg-success/15 text-success",
  em_risco: "bg-warning/15 text-warning",
  atrasado: "bg-danger/15 text-danger",
};

function Card({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="card-surface p-4">
      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <div className="mt-2.5">{children}</div>
    </div>
  );
}

function Stat({ n, of, label }: { n: number; of?: number; label: string }) {
  return (
    <div className="rounded-xl bg-surface-2 p-3 text-center">
      <p className="text-lg font-bold">
        {n}
        {of !== undefined && <span className="text-xs text-muted-foreground">/{of}</span>}
      </p>
      <p className="mt-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
    </div>
  );
}

export function EvolutionTab({
  goal,
  allSteps,
  allExecutions,
  onNavigate,
}: {
  goal: Goal;
  allSteps: Step[];
  allExecutions: Execution[];
  onNavigate: (target: { stepId?: string; executionId?: string }) => void;
}) {
  const steps = stepsForGoal(allSteps, goal.id);
  const executions = executionsForGoal(allExecutions, goal.id);
  const progress = goalProgress(goal, allSteps, allExecutions);
  const pace = goalPace(goal, allSteps, allExecutions);
  const status = planningStatus(goal, allSteps, allExecutions);
  const concluded = executions.filter((e) => e.status === "concluida");
  const line = progressOverTime(goal, allSteps, allExecutions);
  const { planned, actual } = plannedVsActual(goal, allExecutions);
  const eta = estimatedCompletionDate(goal, allSteps, allExecutions);

  return (
    <div className="mt-5 space-y-3">
      <Card label="Resumo">
        <div className="flex items-center gap-5">
          <ProgressRing pct={progress} pace={pace} />
          <div className="min-w-0 flex-1">
            <p className="text-3xl font-bold leading-none">{progress}%</p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {goal.trackingType === "etapas"
                ? `${steps.filter((s) => s.done).length} de ${steps.length} etapas concluídas`
                : `${concluded.length} de ${goal.metric.target} ${goal.metric.unit}`}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span
                className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusTone[status]}`}
              >
                {statusLabel[status]}
              </span>
              <span
                className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${pace === "behind" ? "bg-danger/15 text-danger" : pace === "ahead" ? "bg-warning/15 text-warning" : "bg-primary/15 text-primary"}`}
              >
                {pace === "behind" ? "atrasado" : pace === "ahead" ? "adiantado" : "no ritmo"}
              </span>
            </div>
          </div>
        </div>
        <p className="mt-3 text-[11px] text-muted-foreground">
          <span className="font-semibold text-foreground">Como calculamos:</span>{" "}
          {goal.trackingType === "etapas"
            ? "percentual de etapas concluídas em relação ao total de etapas do plano."
            : `execuções concluídas em relação à meta de ${goal.metric.target} ${goal.metric.unit}.`}
        </p>
      </Card>

      <Card label="Números">
        <div
          className={`grid gap-2 ${goal.trackingType === "etapas" ? "grid-cols-2" : "grid-cols-3"}`}
        >
          <Stat n={steps.filter((s) => s.done).length} of={steps.length} label="Etapas" />
          {goal.trackingType !== "etapas" && (
            <Stat n={concluded.length} of={goal.metric.target} label={goal.metric.unit} />
          )}
          <Stat n={executions.length} label="Execuções" />
        </div>
        <div className="mt-2.5 grid grid-cols-2 gap-2 text-center text-[11px]">
          <div className="rounded-xl bg-surface-2 p-2.5">
            <p className="text-muted-foreground">Prazo</p>
            <p className="mt-0.5 font-semibold">{goal.deadlineLabel || "sem prazo definido"}</p>
          </div>
          <div className="rounded-xl bg-surface-2 p-2.5">
            <p className="text-muted-foreground">Previsão de conclusão</p>
            <p className="mt-0.5 font-semibold">{eta ? formatDateBR(eta) : "sem dados ainda"}</p>
          </div>
        </div>
      </Card>

      <Card label="Ritmo esperado vs. real">
        <PaceBar goal={goal} steps={allSteps} executions={allExecutions} />
      </Card>

      <Card label="Linha de evolução">
        {line.length < 2 ? (
          <p className="text-sm text-muted-foreground">
            Ainda não há histórico suficiente pra desenhar a evolução — conclua etapas ou execuções
            pra essa linha ganhar forma.
          </p>
        ) : (
          <EvolutionLine data={line} />
        )}
      </Card>

      <Card label="Planejado vs. realizado">
        {planned === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhuma execução deste plano venceu ainda — nada a comparar por enquanto.
          </p>
        ) : (
          <>
            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
              <span>Deveriam estar concluídas até hoje</span>
              <span className="font-semibold text-foreground">{planned}</span>
            </div>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface-2">
              <div className="h-full rounded-full bg-border" style={{ width: "100%" }} />
            </div>
            <div className="mt-2.5 flex items-center justify-between text-[11px] text-muted-foreground">
              <span>Foram concluídas de fato</span>
              <span className="font-semibold text-foreground">{actual}</span>
            </div>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface-2">
              <div
                className={`h-full rounded-full ${actual >= planned ? "bg-success" : "bg-primary"}`}
                style={{ width: `${Math.min(100, Math.round((actual / planned) * 100))}%` }}
              />
            </div>
          </>
        )}
      </Card>

      <Card label="Mapa do plano">
        <PlanVisualMap
          goal={goal}
          allSteps={allSteps}
          allExecutions={allExecutions}
          onNavigate={onNavigate}
        />
      </Card>

      <Card label={`Histórico (${concluded.length})`}>
        {concluded.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma execução concluída ainda.</p>
        ) : (
          <ul className="space-y-2">
            {[...concluded]
              .sort((a, b) => (b.agendaDate ?? b.dueDate).localeCompare(a.agendaDate ?? a.dueDate))
              .slice(0, 20)
              .map((c) => (
                <li key={c.id} className="flex items-center gap-3 text-sm">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                  <span className="font-mono text-[11px] text-muted-foreground">
                    {(c.agendaDate ?? c.dueDate).slice(5).replace("-", "/")}
                  </span>
                  <span className="truncate">
                    {c.title}
                    {c.rescheduledFromId ? " (reagendada)" : ""}
                  </span>
                </li>
              ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function EvolutionLine({ data }: { data: ProgressPoint[] }) {
  return (
    <div className="h-40 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
          <XAxis
            dataKey="date"
            tickFormatter={(d: string) => d.slice(5).split("-").reverse().join("/")}
            tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
            axisLine={{ stroke: "var(--border)" }}
            tickLine={false}
            minTickGap={24}
          />
          <YAxis
            domain={[0, 100]}
            tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
            axisLine={false}
            tickLine={false}
            width={32}
            tickFormatter={(v: number) => `${v}%`}
          />
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const p = payload[0].payload as ProgressPoint;
              return (
                <div className="card-surface px-2.5 py-1.5 text-[11px] shadow-lg">
                  <p className="font-semibold">{p.pct}%</p>
                  <p className="text-muted-foreground">
                    {p.date.slice(5).split("-").reverse().join("/")}
                  </p>
                </div>
              );
            }}
            cursor={{ stroke: "var(--border)" }}
          />
          <Line
            type="monotone"
            dataKey="pct"
            stroke="var(--primary)"
            strokeWidth={2}
            dot={{ r: 3, fill: "var(--primary)", strokeWidth: 0 }}
            activeDot={{ r: 4 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function ProgressRing({ pct, pace }: { pct: number; pace: "ahead" | "ontrack" | "behind" }) {
  const r = 34;
  const c = 2 * Math.PI * r;
  const stroke =
    pace === "behind" ? "var(--danger)" : pace === "ahead" ? "var(--warning)" : "var(--primary)";
  return (
    <div className="relative h-20 w-20 shrink-0">
      <svg viewBox="0 0 80 80" className="h-20 w-20 -rotate-90">
        <circle cx="40" cy="40" r={r} fill="none" stroke="var(--surface-2)" strokeWidth="8" />
        <circle
          cx="40"
          cy="40"
          r={r}
          fill="none"
          stroke={stroke}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct / 100)}
        />
      </svg>
    </div>
  );
}

function PaceBar({
  goal,
  steps,
  executions,
}: {
  goal: Goal;
  steps: Step[];
  executions: Execution[];
}) {
  const actual = goalProgress(goal, steps, executions);
  let expected = 0;
  if (goal.deadlineISO) {
    const start = new Date(goal.createdAt).getTime();
    const end = new Date(goal.deadlineISO + "T23:59:59").getTime();
    const now = nowMs();
    if (end > start) expected = Math.min(100, Math.max(0, ((now - start) / (end - start)) * 100));
  }
  return (
    <div className="space-y-2">
      <Row label="Real" pct={actual} color="var(--primary)" />
      <Row label="Esperado" pct={Math.round(expected)} color="var(--muted-foreground)" />
      <p className="pt-1 text-[11px] text-muted-foreground">
        {actual >= expected ? (
          <>
            <TrendingUp className="inline h-3 w-3" /> Você está {Math.round(actual - expected)}{" "}
            pontos {actual > expected ? "à frente" : "no ritmo"}.
          </>
        ) : (
          <>
            <Flame className="inline h-3 w-3 text-danger" /> Faltam {Math.round(expected - actual)}{" "}
            pontos para o ritmo esperado.
          </>
        )}
      </p>
    </div>
  );
}

function Row({ label, pct, color }: { label: string; pct: number; color: string }) {
  return (
    <div>
      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span>{label}</span>
        <span>{pct}%</span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}
