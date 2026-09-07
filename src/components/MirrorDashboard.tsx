import { Link } from "@tanstack/react-router";
import { useState, type ComponentType } from "react";
import {
  Activity,
  AlertCircle,
  BookOpen,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  CircleDollarSign,
  Dumbbell,
  Ellipsis,
  Flame,
  HandHeart,
  Salad,
  Trophy,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { categoryMeta } from "@/lib/mock-data";
import {
  achievementsEarned,
  confidenceIndexByCategory,
  goalPace,
  goalProgress,
  isGoalComplete,
  kpisForRange,
  procrastinationRanking,
  streakForTitle,
  useGoalsStore,
  type Range,
} from "@/lib/goals-store";

const days: Record<Range, number> = { dia: 1, semana: 7, mes: 30, ano: 365 };
const icons: Record<string, ComponentType<{ className?: string; strokeWidth?: number }>> = {
  academia: Dumbbell,
  leitura: BookOpen,
  alimentacao: Salad,
  financas: CircleDollarSign,
  fe: HandHeart,
  trabalho: Activity,
  generico: Activity,
};

export function MirrorDashboard() {
  const [range, setRange] = useState<Range>("semana");
  const state = useGoalsStore((s) => s);
  const { goals, steps, executions } = state;
  const kpis = kpisForRange(state, range);
  const previous = kpisForRange(state, range, days[range]);
  const delta = kpis.cumprimento - previous.cumprimento;
  const areas = confidenceIndexByCategory(executions).slice(0, 6);
  const procrastinated = procrastinationRanking(executions);
  const achievements = achievementsEarned(state);
  const activeGoals = goals.filter((g) => !isGoalComplete(g, steps, executions));
  const onTrack = activeGoals.filter((g) => goalPace(g, steps, executions) === "ontrack").length;
  const behind = activeGoals.filter((g) => goalPace(g, steps, executions) === "behind").length;
  const streaks = [...new Set(executions.map((e) => e.title))]
    .map((title) => ({ title, streak: streakForTitle(executions, title) }))
    .filter((x) => x.streak > 0)
    .sort((a, b) => b.streak - a.streak)
    .slice(0, 3);
  const strongest = areas[0];
  const attention = procrastinated[0];

  return (
    <main className="px-5 pb-5 pt-10">
      <header className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[.2em] text-muted-foreground">
            Espelho
          </p>
          <h1 className="mt-2 text-[30px] font-bold leading-tight tracking-tight">
            Seu ritmo, com clareza.
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Um reflexo honesto da sua {range === "dia" ? "rotina" : range}.
          </p>
        </div>
        <button
          aria-label="Mais opções"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-border bg-surface text-muted-foreground"
        >
          <Ellipsis className="h-5 w-5" />
        </button>
      </header>

      <div className="mt-6 flex gap-1 rounded-2xl border border-border bg-surface p-1">
        {(["dia", "semana", "mes", "ano"] as Range[]).map((r) => (
          <button
            key={r}
            onClick={() => setRange(r)}
            className={`flex-1 rounded-xl py-2.5 text-xs font-semibold ${range === r ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
          >
            {r === "dia" ? "Dia" : r === "semana" ? "Semana" : r === "mes" ? "Mês" : "Ano"}
          </button>
        ))}
      </div>

      <section className="card-surface mt-4 p-5">
        <p className="text-[11px] font-semibold uppercase tracking-[.16em] text-muted-foreground">
          Ritmo da {range}
        </p>
        <div className="mt-4 flex items-center gap-6">
          <div
            className="relative grid h-28 w-28 shrink-0 place-items-center rounded-full"
            style={{
              background: `conic-gradient(var(--color-primary) ${kpis.cumprimento * 3.6}deg,var(--color-surface-2) 0)`,
            }}
          >
            <div className="grid h-[94px] w-[94px] place-items-center rounded-full bg-surface">
              <b className="text-3xl">
                {kpis.cumprimento}
                <span className="text-lg">%</span>
              </b>
            </div>
          </div>
          <div>
            <p className="text-xl font-bold">
              {kpis.daysWithActivity} de {kpis.totalDays} dias ativos
            </p>
            <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
              {kpis.resolved
                ? "Você manteve um ritmo consistente."
                : "Registre ações para revelar seu ritmo."}
            </p>
            {kpis.resolved > 0 && (
              <p
                className={`mt-2 text-sm font-semibold ${delta < 0 ? "text-danger" : "text-primary"}`}
              >
                {delta >= 0 ? "+" : ""}
                {delta}% vs. período anterior
              </p>
            )}
          </div>
        </div>
      </section>

      <section className="mt-6">
        <div className="flex items-end justify-between">
          <h2 className="text-lg font-bold">Áreas da sua vida</h2>
          <span className="text-xs text-muted-foreground">
            Histórico e tendências <ChevronRight className="inline h-3.5 w-3.5" />
          </span>
        </div>
        <div className="card-surface mt-3 grid grid-cols-2 overflow-hidden">
          {areas.length === 0 ? (
            <p className="col-span-2 p-5 text-sm text-muted-foreground">
              Conclua ações para revelar o ritmo de cada área.
            </p>
          ) : (
            areas.map((a, i) => {
              const Icon = icons[a.category] ?? Activity;
              const trend = delta;
              return (
                <div
                  key={a.category}
                  className={`p-4 ${i % 2 === 0 ? "border-r border-border" : ""} ${i < areas.length - 2 ? "border-b border-border" : ""}`}
                >
                  <div className="flex gap-3">
                    <Icon className="mt-0.5 h-6 w-6 shrink-0 text-primary" strokeWidth={1.8} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs text-muted-foreground">
                        {categoryMeta[a.category]?.label ?? a.category}
                      </p>
                      <div className="flex items-baseline justify-between gap-1">
                        <b className="text-xl">{a.pct}%</b>
                        <span
                          className={`text-[11px] font-semibold ${trend > 0 ? "text-primary" : trend < 0 ? "text-danger" : "text-muted-foreground"}`}
                        >
                          {trend > 0 ? `↑ +${trend}%` : trend < 0 ? `↓ ${trend}%` : "— estável"}
                        </span>
                      </div>
                      <div className="mt-2 h-1 overflow-hidden rounded-full bg-surface-2">
                        <div
                          className="h-full rounded-full bg-primary"
                          style={{ width: `${a.pct}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>

      <section className="mt-6">
        <h2 className="text-lg font-bold">O que o espelho mostra</h2>
        <div className="card-surface mt-3 divide-y divide-border px-4">
          <Insight
            icon={TrendingUp}
            tone="text-primary"
            label="Ponto forte"
            title={
              strongest
                ? `${categoryMeta[strongest.category]?.label ?? strongest.category} em sequência`
                : "Seu primeiro padrão aparecerá aqui"
            }
            detail={
              streaks[0]
                ? `${streaks[0].streak} dias mantendo o ritmo`
                : "Continue registrando suas ações"
            }
          />
          <Insight
            icon={AlertCircle}
            tone="text-danger"
            label="Merece atenção"
            title={
              attention
                ? `${attention.title} adiada ${attention.times}x`
                : "Nenhum atraso relevante"
            }
            detail={
              attention
                ? "Vale reservar um horário específico"
                : "Bom sinal — seu ritmo está protegido"
            }
          />
        </div>
      </section>

      <section className="mt-6">
        <div className="flex items-end justify-between">
          <h2 className="text-lg font-bold">Planos</h2>
          <p className="text-xs text-muted-foreground">
            {onTrack} no ritmo · {behind} atrasados
          </p>
        </div>
        <div className="card-surface mt-3 divide-y divide-border px-4">
          {activeGoals.length === 0 ? (
            <p className="py-4 text-sm text-muted-foreground">Nenhum plano ativo.</p>
          ) : (
            activeGoals.slice(0, 3).map((g) => {
              const p = goalProgress(g, steps, executions);
              const pace = goalPace(g, steps, executions);
              return (
                <Link
                  key={g.id}
                  to="/objetivo/$id"
                  params={{ id: g.id }}
                  className="flex items-center gap-3 py-3.5"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{g.title}</p>
                    <p
                      className={pace === "behind" ? "text-xs text-danger" : "text-xs text-primary"}
                    >
                      {pace === "behind" ? "Atrasado" : pace === "ahead" ? "Adiantado" : "No prazo"}
                    </p>
                  </div>
                  <b className="text-sm">{p}%</b>
                  <div className="h-1 w-20 rounded-full bg-surface-2">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${p}%` }} />
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </Link>
              );
            })
          )}
        </div>
      </section>

      <div className="mt-4 divide-y divide-border border-y border-border">
        <Drawer
          icon={Activity}
          title="Padrões da semana"
          subtitle="Procrastinação, sequências e uso da agenda"
        >
          {procrastinated.length ? (
            procrastinated.slice(0, 3).map((x) => (
              <p key={x.title}>
                <TrendingDown className="mr-2 inline h-3.5 w-3.5 text-danger" />
                {x.title} · {x.times}x adiada
              </p>
            ))
          ) : (
            <p>Nenhuma procrastinação relevante.</p>
          )}
          {streaks.map((x) => (
            <p key={x.title}>
              <Flame className="mr-2 inline h-3.5 w-3.5 text-primary" />
              {x.title} · {x.streak} dias seguidos
            </p>
          ))}
        </Drawer>
        <Drawer
          icon={Trophy}
          title="Conquistas"
          subtitle={`${achievements.length} marcos desbloqueados`}
        >
          {achievements.length ? (
            achievements.map((a) => (
              <div key={a.id}>
                <p className="font-semibold text-foreground">{a.title}</p>
                <p>{a.detail}</p>
              </div>
            ))
          ) : (
            <p>Sua primeira ação concluída desbloqueia uma conquista.</p>
          )}
        </Drawer>
      </div>
    </main>
  );
}

function Insight({
  icon: Icon,
  tone,
  label,
  title,
  detail,
}: {
  icon: typeof TrendingUp;
  tone: string;
  label: string;
  title: string;
  detail: string;
}) {
  return (
    <div className="flex items-center gap-3 py-3.5">
      <Icon className={`h-8 w-8 shrink-0 ${tone}`} strokeWidth={1.7} />
      <div className="min-w-0 flex-1">
        <p className={`text-[10px] font-semibold uppercase tracking-wider ${tone}`}>{label}</p>
        <p className="truncate text-sm font-semibold">{title}</p>
        <p className="text-xs text-muted-foreground">{detail}</p>
      </div>
      <ChevronRight className="h-4 w-4 text-muted-foreground" />
    </div>
  );
}
function Drawer({
  icon: Icon,
  title,
  subtitle,
  children,
}: {
  icon: typeof Activity;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <details className="group py-3">
      <summary className="flex cursor-pointer list-none items-center gap-3">
        <Icon className="h-5 w-5 text-muted-foreground" />
        <div className="flex-1">
          <p className="text-sm font-semibold">{title}</p>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        </div>
        <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" />
      </summary>
      <div className="mt-3 space-y-2 pl-8 text-xs text-muted-foreground">{children}</div>
    </details>
  );
}
