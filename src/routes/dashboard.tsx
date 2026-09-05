import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { categoryMeta } from "@/lib/mock-data";
import {
  useGoalsStore,
  kpisForRange,
  insightsComputed,
  confidenceIndexByCategory,
  procrastinationRanking,
  streakForTitle,
  achievementsEarned,
  goalPace,
  isGoalComplete,
  type Range,
} from "@/lib/goals-store";
import { TrendingUp, TrendingDown, Trophy, Sparkles, ChevronRight, Flame } from "lucide-react";

export const Route = createFileRoute("/dashboard")({
  head: () => ({ meta: [{ title: "Espelho de hábitos — Norte" }] }),
  component: Dashboard,
});

function Dashboard() {
  const [range, setRange] = useState<Range>("semana");
  const state = useGoalsStore((s) => s);
  const { goals, steps, executions } = state;

  const kpis = kpisForRange(state, range);
  const kpisPrev = kpisForRange(
    state,
    range,
    range === "dia" ? 1 : range === "semana" ? 7 : range === "mes" ? 30 : 365,
  );
  const delta = kpis.cumprimento - kpisPrev.cumprimento;
  const insights = insightsComputed(state);
  const confidence = confidenceIndexByCategory(executions);
  const procrastinated = procrastinationRanking(executions);
  const achievements = achievementsEarned(state);
  // Ritmo (adiantado/no ritmo/atrasado) só faz sentido pra plano ainda em andamento —
  // um plano concluído não "atrasa" mais nada. A conquista de conclusão continua
  // aparecendo normalmente em achievementsEarned, que não é filtrado aqui.
  const activeGoals = goals.filter((g) => !isGoalComplete(g, steps, executions));

  const kpiCards = [
    {
      label: "Cumprimento",
      value: `${kpis.cumprimento}%`,
      delta: kpis.resolved > 0 ? `${delta >= 0 ? "+" : ""}${delta}%` : "sem dados",
      tone:
        kpis.resolved === 0
          ? "muted"
          : kpis.cumprimento >= 70
            ? "success"
            : kpis.cumprimento >= 40
              ? "warning"
              : "danger",
    },
    range === "dia"
      ? {
          label: "Execuções resolvidas",
          value: `${kpis.resolved}`,
          delta: `${kpis.concluded} feitas`,
          tone: "muted",
        }
      : {
          label: "Dias ativos",
          value: `${kpis.daysWithActivity}/${kpis.totalDays}d`,
          delta: "consistência",
          tone: "muted",
        },
    {
      label: "Planejamentos atrasados",
      value: `${kpis.behindGoals}`,
      delta: kpis.behindGoals > 0 ? "atenção" : "tudo ok",
      tone: kpis.behindGoals > 0 ? "danger" : "success",
    },
  ] as const;

  const streakLeaders = [...new Set(executions.map((e) => e.title))]
    .map((title) => ({
      title,
      streak: streakForTitle(executions, title),
      category: executions.find((e) => e.title === title)!.category,
    }))
    .filter((s) => s.streak > 0)
    .sort((a, b) => b.streak - a.streak)
    .slice(0, 3);

  const bestConfidence = confidence[0];
  const worstConfidence = [...confidence].sort((a, b) => a.pct - b.pct)[0];
  const riskGoal = goals.find((g) => goalPace(g, steps, executions) === "behind");

  return (
    <div className="px-5 pt-12 pb-4">
      <header>
        <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
          Espelho de hábitos
        </p>
        <h1 className="mt-1 text-3xl font-bold text-balance-tight">Aqui você não se engana.</h1>
      </header>

      <div className="mt-6 flex gap-1 rounded-2xl border border-border bg-surface p-1">
        {(["dia", "semana", "mes", "ano"] as Range[]).map((r) => (
          <button
            key={r}
            onClick={() => setRange(r)}
            className={`flex-1 rounded-xl py-2 text-xs font-semibold capitalize transition-colors ${range === r ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
          >
            {r === "dia" ? "Dia" : r === "semana" ? "Semana" : r === "mes" ? "Mês" : "Ano"}
          </button>
        ))}
      </div>

      {/* KPIs */}
      <div className="mt-4 grid grid-cols-3 gap-2">
        {kpiCards.map((k) => (
          <div key={k.label} className="card-surface p-3">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{k.label}</p>
            <p className="mt-1 text-xl font-bold">{k.value}</p>
            <p
              className={`mt-1 text-[10px] font-semibold ${k.tone === "success" ? "text-success" : k.tone === "danger" ? "text-danger" : k.tone === "warning" ? "text-warning" : "text-muted-foreground"}`}
            >
              {k.delta}
            </p>
          </div>
        ))}
      </div>

      {/* Insights automáticos */}
      <div className="mt-8">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
            Insights automáticos
          </h2>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          O que eu percebi que você ainda não viu.
        </p>
        <div className="mt-3 space-y-2.5">
          {insights.map((i) => (
            <div
              key={i.id}
              className={`card-surface p-4 ${i.tone === "danger" ? "border-danger/40" : i.tone === "success" ? "border-success/40" : i.tone === "warning" ? "border-warning/40" : ""}`}
            >
              <div className="flex items-start gap-3">
                <span className="text-2xl">{i.icon}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold leading-snug">{i.title}</p>
                  <p className="mt-1 text-xs text-muted-foreground text-balance-tight">
                    {i.detail}
                  </p>
                  {i.action && (
                    <span
                      className={`mt-2 inline-block text-xs font-semibold ${i.tone === "danger" ? "text-danger" : i.tone === "success" ? "text-success" : i.tone === "warning" ? "text-warning" : "text-primary"}`}
                    >
                      {i.action} →
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Confidence index */}
      <div className="mt-7">
        <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
          Índice de confiança
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Quanto eu confio que você cumpre — por categoria, com base no que já venceu.
        </p>
        <div className="mt-3 space-y-2.5">
          {confidence.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Ainda sem execuções vencidas para medir.
            </p>
          )}
          {confidence.map((c) => {
            const cat = categoryMeta[c.category] ?? categoryMeta.generico;
            const tone = c.pct >= 80 ? "success" : c.pct >= 50 ? "warning" : "danger";
            return (
              <div key={c.category} className="card-surface flex items-center gap-3 p-3.5">
                <span className="text-xl">{cat.emoji}</span>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold">{cat.label}</p>
                    <span
                      className={`font-mono text-sm font-bold ${tone === "success" ? "text-success" : tone === "warning" ? "text-warning" : "text-danger"}`}
                    >
                      {c.pct}%
                    </span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-2">
                    <div
                      className={`h-full rounded-full ${tone === "success" ? "bg-success" : tone === "warning" ? "bg-warning" : "bg-danger"}`}
                      style={{ width: `${c.pct}%` }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Planejamentos: adiantados / no ritmo / atrasados */}
      <div className="mt-7">
        <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
          Planejamentos
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Quais estão adiantados, no ritmo ou atrasados — e a previsão no ritmo atual.
        </p>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          {(["ahead", "ontrack", "behind"] as const).map((p) => {
            const count = activeGoals.filter((g) => goalPace(g, steps, executions) === p).length;
            const label = p === "ahead" ? "adiantados" : p === "ontrack" ? "no ritmo" : "atrasados";
            const tone =
              p === "ahead" ? "text-warning" : p === "ontrack" ? "text-success" : "text-danger";
            return (
              <div key={p} className="rounded-xl bg-surface-2 p-2.5">
                <p className={`text-lg font-bold ${tone}`}>{count}</p>
                <p className="text-[10px] uppercase text-muted-foreground">{label}</p>
              </div>
            );
          })}
        </div>
        <div className="mt-3 space-y-2.5">
          {activeGoals.slice(0, 4).map((g) => {
            const pace = goalPace(g, steps, executions);
            const forecast =
              pace === "behind" ? "atrasa" : pace === "ahead" ? "adianta" : "no prazo";
            const tone =
              pace === "behind"
                ? "text-danger"
                : pace === "ahead"
                  ? "text-warning"
                  : "text-success";
            return (
              <Link
                key={g.id}
                to="/objetivo/$id"
                params={{ id: g.id }}
                className="card-surface flex items-center justify-between p-3.5 hover:border-primary/40"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{g.title}</p>
                  <p className="text-[11px] text-muted-foreground">
                    prazo {g.deadlineLabel} · <span className={tone}>{forecast}</span>
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </Link>
            );
          })}
        </div>
      </div>

      <div className="mt-7 grid grid-cols-1 gap-3">
        <div className="card-surface p-4">
          <div className="flex items-center gap-2 text-danger">
            <TrendingDown className="h-4 w-4" />
            <h3 className="text-sm font-bold">Você mais procrastina</h3>
          </div>
          {procrastinated.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">
              Nada de relevante perdido ainda — bom sinal.
            </p>
          ) : (
            <ul className="mt-3 space-y-2">
              {procrastinated.map((p, i) => (
                <li key={p.title} className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2">
                    <span className="font-mono text-xs text-muted-foreground">#{i + 1}</span>
                    {p.title}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {p.times}x perdida/reagendada
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="card-surface p-4">
          <div className="flex items-center gap-2 text-success">
            <TrendingUp className="h-4 w-4" />
            <h3 className="text-sm font-bold">Suas maiores sequências</h3>
          </div>
          {streakLeaders.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">Ainda sem sequência ativa.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {streakLeaders.map((p) => (
                <li key={p.title} className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2">
                    <Flame className="h-3.5 w-3.5 text-warning" /> {p.title}
                  </span>
                  <span className="text-xs text-muted-foreground">{p.streak}d seguidos</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="mt-6">
        <div className="flex items-center gap-2">
          <Trophy className="h-4 w-4 text-warning" />
          <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
            Conquistas
          </h2>
        </div>
        {achievements.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">
            Nenhuma conquista ainda — a primeira execução concluída já destrava uma.
          </p>
        ) : (
          <div className="mt-3 -mx-5 flex gap-3 overflow-x-auto px-5 pb-2">
            {achievements.map((a) => (
              <div key={a.id} className="card-surface min-w-56 shrink-0 p-4">
                <div className="text-3xl">{a.icon}</div>
                <p className="mt-2 text-sm font-semibold leading-snug">{a.title}</p>
                <p className="mt-1 text-[11px] text-muted-foreground">{a.detail}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card-surface mt-6 border-primary/40 bg-primary/5 p-5">
        <p className="text-xs font-semibold uppercase tracking-wider text-primary">
          Retrospectiva{" "}
          {range === "dia"
            ? "diária"
            : range === "semana"
              ? "semanal"
              : range === "mes"
                ? "mensal"
                : "anual"}
        </p>
        <h3 className="mt-2 text-lg font-bold text-balance-tight">
          {kpis.resolved === 0
            ? "Ainda sem dados suficientes nesse período."
            : `Você cumpriu ${kpis.cumprimento}% do que venceu.`}
        </h3>
        <p className="mt-2 text-sm text-muted-foreground text-balance-tight">
          {bestConfidence && (
            <>
              {categoryMeta[bestConfidence.category]?.label ?? bestConfidence.category} foi sua
              âncora ({bestConfidence.pct}%).{" "}
            </>
          )}
          {worstConfidence && worstConfidence.category !== bestConfidence?.category && (
            <>
              {categoryMeta[worstConfidence.category]?.label ?? worstConfidence.category} travou (
              {worstConfidence.pct}%).{" "}
            </>
          )}
          {riskGoal ? (
            <>"{riskGoal.title}" está no ritmo de atrasar — vale redistribuir sessões.</>
          ) : (
            "Nenhum planejamento em risco imediato."
          )}
        </p>
        <Link to="/planejamento" className="mt-4 inline-block text-xs font-semibold text-primary">
          Ver detalhes →
        </Link>
      </div>
    </div>
  );
}
