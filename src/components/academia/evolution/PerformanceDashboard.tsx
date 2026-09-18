import { useMemo, useState } from "react";
import { ChartNoAxesColumnIncreasing, TrendingUp, TriangleAlert, Info } from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { Exercise, WorkoutPlan, WorkoutSession, MuscleGroup } from "@/lib/workout-store";
import {
  availableReferences,
  comparabilityKey,
  equipmentLabel,
  exerciseChartSeries,
  exerciseTrends,
  loadProgressions,
  muscleGroupLabel,
  personalRecords,
  resolveSets,
  type FilteredData,
  type Frequency,
} from "@/lib/workout-evolution";
import { estimatedStrengthSeries } from "@/lib/workout-performance";
import { ModuleCard } from "./shared";

export function DashboardIndicators({
  view,
  data,
  frequency,
  sessions,
  exercises,
  plans,
  onOpen,
}: {
  view: "corpo" | "desempenho";
  data: FilteredData;
  frequency: Frequency;
  sessions: WorkoutSession[];
  exercises: Exercise[];
  plans: WorkoutPlan[];
  onOpen: (id: string) => void;
}) {
  const trends = useMemo(() => exerciseTrends(data.sets), [data.sets]);
  const records = useMemo(() => {
    const scopedSessions = new Set(data.sessions.map((s) => s.id));
    return personalRecords(
      resolveSets(sessions, exercises, plans),
      data.effectiveRange,
      Number.MAX_SAFE_INTEGER,
    ).filter((r) => scopedSessions.has(r.sessionId));
  }, [sessions, exercises, plans, data]);
  const improving = trends.filter((t) => t.kind === "melhora");
  const stable = trends.filter((t) => t.kind === "estavel" && t.spark.length >= 4);
  const best = loadProgressions(data.sets, 1)[0];
  const bestGroup = best
    ? data.sets.find((s) => s.lineageId === best.lineageId)?.muscleGroup
    : null;
  const alert = stable[0];
  const cards =
    view === "corpo"
      ? [
          {
            label: "CONSISTÊNCIA",
            value:
              frequency.percent !== undefined
                ? `${frequency.percent}%`
                : `${frequency.done} treinos`,
            detail:
              frequency.planned !== undefined
                ? `${Math.min(frequency.done, frequency.planned)} de ${frequency.planned} treinos`
                : "realizados no período",
            icon: ChartNoAxesColumnIncreasing,
          },
          {
            label: "MAIOR EVOLUÇÃO",
            value: bestGroup ? muscleGroupLabel[bestGroup] : "—",
            detail: best
              ? `${best.deltaPct !== undefined ? `+${Math.round(best.deltaPct)}% de carga` : `+${best.deltaKg} kg`} · ${best.name}`
              : "Aguardando comparações",
            icon: TrendingUp,
            id: best?.lineageId,
          },
          {
            label: "ATENÇÃO",
            value: alert?.muscleGroup ? muscleGroupLabel[alert.muscleGroup] : "—",
            detail: alert ? `${alert.spark.length} sessões estáveis` : "Sem ponto a destacar",
            icon: TriangleAlert,
            id: alert?.lineageId,
          },
        ]
      : [
          {
            label: "EM PROGRESSÃO",
            value: `${improving.length} exercícios`,
            detail: `de ${trends.filter((t) => t.kind !== "sem_comparacao").length} comparáveis`,
            icon: ChartNoAxesColumnIncreasing,
            id: improving[0]?.lineageId,
          },
          {
            label: "RECORDE PESSOAL",
            value: `${records.length} novos`,
            detail: "no período selecionado",
            icon: TrendingUp,
            id: records[0]?.lineageId,
          },
          {
            label: "ATENÇÃO",
            value: `${stable.length} exercícios`,
            detail: "4 ou mais sessões estáveis",
            icon: TriangleAlert,
            id: alert?.lineageId,
          },
        ];
  return (
    <div className="evo-kpis">
      {cards.map((c, i) => (
        <button
          key={c.label}
          className="evo-card evo-kpi"
          onClick={() => c.id && onOpen(c.id)}
          disabled={!c.id}
        >
          <c.icon style={i === 2 ? { color: "#eabf45" } : undefined} />
          <small>{c.label}</small>
          <strong>{c.value}</strong>
          <span>{c.detail}</span>
        </button>
      ))}
    </div>
  );
}

export function PerformanceChart({
  data,
  selectedMuscle,
  onOpen,
}: {
  data: FilteredData;
  selectedMuscle: MuscleGroup | null;
  onOpen: (id: string) => void;
}) {
  const [chosen, setChosen] = useState("");
  const [mode, setMode] = useState<"estimativa" | "carga" | "repeticoes">("estimativa");
  const [reference, setReference] = useState<number | null>(null);
  const choices = useMemo(
    () =>
      exerciseTrends(data.sets).filter((t) => !selectedMuscle || t.muscleGroup === selectedMuscle),
    [data.sets, selectedMuscle],
  );
  const exercise =
    choices.find((t) => comparabilityKey(t.lineageId, t.equipment) === chosen) ?? choices[0];
  const key = exercise ? comparabilityKey(exercise.lineageId, exercise.equipment) : "";
  const sets = data.sets.filter((s) => comparabilityKey(s.lineageId, s.equipment) === key);
  const refs =
    exercise && mode !== "estimativa" ? availableReferences(sets, exercise.lineageId, mode) : [];
  const ref = refs.some((r) => r.value === reference) ? reference! : refs[0]?.value;
  const points = !exercise
    ? []
    : mode === "estimativa"
      ? estimatedStrengthSeries(sets, key)
      : ref === undefined
        ? []
        : exerciseChartSeries(sets, exercise.lineageId, mode, ref, exercise.equipment);
  const first = points[0]?.value,
    last = points.at(-1)?.value;
  const delta =
    first && last !== undefined && points.length > 1 ? ((last - first) / first) * 100 : null;
  const unit = mode === "repeticoes" ? "reps" : "kg";
  return (
    <ModuleCard
      title="Evolução de força"
      action={
        <span title="Força estimada: fórmula de Epley, séries de 1 a 10 repetições. Compare apenas o mesmo exercício e equipamento.">
          <Info size={14} />
        </span>
      }
    >
      <div className="flex flex-wrap items-center gap-2">
        <select
          aria-label="Exercício do gráfico"
          className="min-w-0 flex-1"
          value={key}
          onChange={(e) => {
            setChosen(e.target.value);
            setReference(null);
          }}
        >
          {!choices.length && <option value="">Sem exercícios</option>}
          {choices.map((t) => (
            <option
              key={comparabilityKey(t.lineageId, t.equipment)}
              value={comparabilityKey(t.lineageId, t.equipment)}
            >
              {t.name}
              {t.equipment ? ` · ${equipmentLabel[t.equipment]}` : ""}
            </option>
          ))}
        </select>
        <div className="evo-tabs w-full" aria-label="Métrica do gráfico">
          {(
            [
              ["estimativa", "Força estimada"],
              ["carga", "Carga"],
              ["repeticoes", "Repetições"],
            ] as const
          ).map(([m, l]) => (
            <button
              key={m}
              style={{ minHeight: 32, fontSize: 10 }}
              aria-pressed={mode === m}
              onClick={() => {
                setMode(m);
                setReference(null);
              }}
            >
              {l}
            </button>
          ))}
        </div>
      </div>
      {mode !== "estimativa" && (
        <label className="mt-2 flex items-center gap-2 text-[10px] text-muted-foreground">
          Comparar com
          <select
            aria-label="Referência de comparação"
            value={ref ?? ""}
            onChange={(e) => setReference(Number(e.target.value))}
          >
            {refs.map((r) => (
              <option key={r.value} value={r.value}>
                {r.value} {mode === "carga" ? "reps" : "kg"}
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="my-3 flex items-baseline gap-2">
        <strong className="text-xl" style={{ color: "var(--evo-accent)" }}>
          {delta === null
            ? "—"
            : `${delta > 0 ? "+" : ""}${delta.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`}
        </strong>
        <span className="text-xs text-muted-foreground">{points.length} sessões</span>
      </div>
      {points.length ? (
        <div className="h-[155px] w-full min-w-0">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={points} margin={{ top: 10, right: 12, bottom: 0, left: -25 }}>
              <CartesianGrid stroke="var(--evo-line)" vertical={false} />
              <XAxis
                dataKey="date"
                tickFormatter={(d) => `${d.slice(8, 10)}/${d.slice(5, 7)}`}
                tick={{ fontSize: 9, fill: "#939da8" }}
                minTickGap={22}
              />
              <YAxis tick={{ fontSize: 9, fill: "#939da8" }} domain={["auto", "auto"]} />
              <Tooltip
                contentStyle={{
                  background: "var(--evo-panel)",
                  border: "1px solid var(--evo-line)",
                  borderRadius: 8,
                  fontSize: 12,
                }}
                formatter={(v: number) => [
                  `${v} ${unit}`,
                  mode === "estimativa" ? "Força estimada" : "Registro",
                ]}
                labelFormatter={(d) => String(d).split("-").reverse().join("/")}
              />
              <Line
                dataKey="value"
                stroke="var(--evo-accent)"
                strokeWidth={2}
                dot={{ r: 4, fill: "var(--evo-accent)" }}
                activeDot={{ r: 6 }}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <p className="py-8 text-center text-xs text-muted-foreground">
          {mode === "estimativa"
            ? "Sem séries elegíveis para estimativa. Consulte carga ou repetições."
            : "Sem registros para esta referência."}
        </p>
      )}
      <p className="mt-1 text-center text-[10px] text-muted-foreground">
        {mode === "estimativa"
          ? "Estimativa de Epley · séries de 1–10 repetições com carga externa."
          : `Mesmo exercício e equipamento · ${ref ?? "—"} ${mode === "carga" ? "repetições" : "kg"}.`}
      </p>
      {exercise && (
        <button
          className="mt-3 text-xs"
          style={{ color: "var(--evo-accent)" }}
          onClick={() => onOpen(exercise.lineageId)}
        >
          Consultar séries e sessões →
        </button>
      )}
    </ModuleCard>
  );
}
