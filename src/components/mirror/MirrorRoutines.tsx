import { Link } from "@tanstack/react-router";
import {
  Activity,
  AlertCircle,
  BookOpen,
  ChevronRight,
  CircleDollarSign,
  Dumbbell,
  Flame,
  HandHeart,
  Salad,
  TrendingDown,
  TrendingUp,
  Trophy,
  type LucideIcon,
} from "lucide-react";
import { categoryMeta } from "@/lib/mock-data";
import {
  achievementsEarned,
  goalPace,
  goalProgress,
  isGoalComplete,
  streakForTitle,
  useGoalsStore,
} from "@/lib/goals-store";
import { formatMinutes, type AgendaAnalysis, type Period } from "@/lib/mirror-analytics";
import { hasModuleActivity, moduleActivity } from "@/lib/mirror-modules";
import { plural, decimalBR } from "@/lib/format-utils";
import { useWorkoutStore } from "@/lib/workout-store";
import { useSportStore } from "@/lib/sport-store";
import { useReadingStore } from "@/lib/reading-store";
import { useMemo } from "react";
import { Disclosure } from "./charts";

const icons: Record<string, LucideIcon> = {
  academia: Dumbbell,
  esportes: Activity,
  leitura: BookOpen,
  alimentacao: Salad,
  financas: CircleDollarSign,
  fe: HandHeart,
};

/** Rotinas dos módulos (Academia, Alimentação, Leitura, Esportes, Fé…). Mantém
 * o que o Espelho já mostrava — áreas, atenção, planos, sequências, conquistas —
 * agora respeitando o período escolhido e comparando cada área com ela mesma. */
export function MirrorRoutines({
  current,
  previous,
  scope,
  period,
  previousPeriod,
}: {
  current: AgendaAnalysis;
  previous: AgendaAnalysis;
  scope: string;
  period: Period;
  previousPeriod: Period;
}) {
  const workouts = useWorkoutStore((s) => s.sessions);
  const activities = useSportStore((s) => s.activities);
  const readingSessions = useReadingStore((s) => s.sessions);
  const modules = useMemo(() => {
    const input = { workouts, activities, readingSessions };
    return { now: moduleActivity(input, period), before: moduleActivity(input, previousPeriod) };
  }, [workouts, activities, readingSessions, period, previousPeriod]);
  const state = useGoalsStore((s) => s);
  const { goals, steps, executions } = state;
  const achievements = achievementsEarned(state);
  const activeGoals = goals.filter((g) => !isGoalComplete(g, steps, executions));
  const onTrack = activeGoals.filter((g) => goalPace(g, steps, executions) === "ontrack").length;
  const behind = activeGoals.filter((g) => goalPace(g, steps, executions) === "behind").length;
  const streaks = [...new Set(executions.map((e) => e.title))]
    .map((title) => ({ title, streak: streakForTitle(executions, title) }))
    .filter((x) => x.streak > 0)
    .sort((a, b) => b.streak - a.streak)
    .slice(0, 3);

  const prevByCat = new Map(previous.byCategory.map((g) => [g.key, g]));
  const areas = current.byCategory.filter((g) => g.rate !== null).slice(0, 6);
  const strongest = [...areas].sort((a, b) => (b.rate ?? 0) - (a.rate ?? 0))[0];
  const attention = current.topTroubled[0];
  // O detalhe do ponto forte precisa falar da MESMA área do título (antes usava a maior
  // sequência de qualquer rotina, ex.: "Academia com 100%" + "dias seguidos em Leitura").
  const strongStreak = strongest
    ? [...new Set(executions.filter((e) => e.category === strongest.key).map((e) => e.title))]
        .map((title) => ({ title, streak: streakForTitle(executions, title) }))
        .filter((x) => x.streak > 0)
        .sort((a, b) => b.streak - a.streak)[0]
    : undefined;

  return (
    <div className="space-y-4">
      {hasModuleActivity(modules.now) && (
        <section>
          <h2 className="norte-section-title">Registrado nos módulos</h2>
          <div className="card-surface mt-3 divide-y divide-border px-4">
            {modules.now.workouts.count > 0 && (
              <ModuleRow
                icon={Dumbbell}
                title="Academia"
                value={`${modules.now.workouts.count} ${plural(modules.now.workouts.count, "treino", "treinos")}`}
                detail={`em ${modules.now.workouts.days} ${plural(modules.now.workouts.days, "dia", "dias")} ${scope}`}
                delta={modules.now.workouts.count - modules.before.workouts.count}
              />
            )}
            {modules.now.sport.count > 0 && (
              <ModuleRow
                icon={Activity}
                title="Esportes"
                value={`${modules.now.sport.count} ${plural(modules.now.sport.count, "atividade", "atividades")}`}
                detail={`${decimalBR(modules.now.sport.distanceM / 1000, 1)} km · ${formatMinutes(modules.now.sport.activeSeconds / 60)} em movimento`}
                delta={modules.now.sport.count - modules.before.sport.count}
              />
            )}
            {modules.now.reading.sessions > 0 && (
              <ModuleRow
                icon={BookOpen}
                title="Leitura"
                value={`${modules.now.reading.sessions} ${plural(modules.now.reading.sessions, "sessão", "sessões")}`}
                detail={`${formatMinutes(modules.now.reading.seconds / 60)}${modules.now.reading.pages ? ` · ${modules.now.reading.pages} ${plural(modules.now.reading.pages, "página", "páginas")}` : ""}`}
                delta={modules.now.reading.sessions - modules.before.reading.sessions}
              />
            )}
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            Vem do que você registrou em cada módulo, sem estimativas. A comparação é com o período
            anterior.
          </p>
        </section>
      )}

      <section>
        <h2 className="norte-section-title">Áreas da sua vida</h2>
        <div className="card-surface mt-3 grid grid-cols-2 overflow-hidden">
          {areas.length === 0 ? (
            <p className="col-span-2 p-5 text-sm text-muted-foreground">
              Sem rotinas encerradas {scope}. Conclua ações para revelar o ritmo de cada área.
            </p>
          ) : (
            areas.map((a, i) => {
              const Icon = icons[a.key] ?? Activity;
              const before = prevByCat.get(a.key);
              const trend =
                before && before.rate !== null && before.done + before.missed >= 3
                  ? Math.round(((a.rate ?? 0) - before.rate) * 100)
                  : null;
              return (
                <div
                  key={a.key}
                  className={`p-4 ${i % 2 === 0 ? "border-r border-border" : ""} ${i < areas.length - 2 ? "border-b border-border" : ""}`}
                >
                  <div className="flex gap-3">
                    <Icon
                      className="mt-0.5 h-6 w-6 shrink-0 text-muted-foreground"
                      strokeWidth={1.8}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs text-muted-foreground">
                        {categoryMeta[a.key]?.label ?? a.name}
                      </p>
                      <div className="flex items-baseline justify-between gap-1">
                        <b className="text-xl">{Math.round((a.rate ?? 0) * 100)}%</b>
                        <span
                          className={`text-[11px] font-semibold ${trend === null ? "text-muted-foreground" : trend > 0 ? "text-primary" : trend < 0 ? "text-warning" : "text-muted-foreground"}`}
                        >
                          {trend === null
                            ? ""
                            : trend > 0
                              ? `↑ +${trend}`
                              : trend < 0
                                ? `↓ ${trend}`
                                : "— estável"}
                        </span>
                      </div>
                      <div className="mt-2 h-1 overflow-hidden rounded-full bg-surface-2">
                        <div
                          className="progress-fill h-full rounded-full bg-primary"
                          style={{ width: `${Math.round((a.rate ?? 0) * 100)}%` }}
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

      <section>
        <h2 className="norte-section-title">O que o espelho mostra</h2>
        <div className="card-surface mt-3 divide-y divide-border px-4">
          <Row
            icon={TrendingUp}
            tone={strongest ? "text-primary" : "text-muted-foreground"}
            label="Ponto forte"
            title={
              strongest
                ? `${categoryMeta[strongest.key]?.label ?? strongest.name} com ${Math.round((strongest.rate ?? 0) * 100)}%`
                : "Seu primeiro padrão aparecerá aqui"
            }
            detail={
              strongStreak
                ? `${strongStreak.streak} ${strongStreak.streak === 1 ? "dia seguido" : "dias seguidos"} em “${strongStreak.title}”`
                : strongest
                  ? `${strongest.done} de ${strongest.done + strongest.missed} realizadas ${scope}`
                  : "Continue registrando suas ações"
            }
          />
          <Row
            icon={AlertCircle}
            tone={attention ? "text-warning" : "text-muted-foreground"}
            label="Merece atenção"
            title={attention ? attention.title : "Nenhum atraso relevante"}
            detail={
              attention
                ? `${attention.missed + attention.moves} vezes adiada ou não realizada · vale reservar um horário específico`
                : "Bom sinal — seu ritmo está protegido"
            }
          />
        </div>
      </section>

      <section>
        <div className="flex items-end justify-between">
          <h2 className="norte-section-title">Planos</h2>
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
                      className={
                        pace === "behind" ? "text-xs text-warning" : "text-xs text-muted-foreground"
                      }
                    >
                      {pace === "behind" ? "Atrasado" : pace === "ahead" ? "Adiantado" : "No prazo"}
                    </p>
                  </div>
                  <b className="text-sm">{p}%</b>
                  <div className="h-1 w-20 rounded-full bg-surface-2">
                    <div
                      className="progress-fill h-full rounded-full bg-primary"
                      style={{ width: `${p}%` }}
                    />
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </Link>
              );
            })
          )}
        </div>
      </section>

      <div className="card-surface divide-y divide-border px-5">
        <Disclosure title="Padrões das rotinas" subtitle="Adiadas e sequências">
          <div className="space-y-2 text-xs text-muted-foreground">
            {current.topTroubled.length ? (
              current.topTroubled.slice(0, 3).map((x) => (
                <p key={x.key}>
                  <TrendingDown className="mr-2 inline h-3.5 w-3.5 text-warning" />
                  {x.title} ·{" "}
                  {[
                    x.moves ? `${x.moves}× reagendada` : "",
                    x.missed ? `${x.missed}× não realizada` : "",
                  ]
                    .filter(Boolean)
                    .join(" · ") || `${x.cancelled}× cancelada`}
                </p>
              ))
            ) : (
              <p>Nenhuma rotina adiada de forma relevante.</p>
            )}
            {streaks.map((x) => (
              <p key={x.title}>
                <Flame className="mr-2 inline h-3.5 w-3.5 text-primary" />
                {x.title} · {x.streak} {x.streak === 1 ? "dia seguido" : "dias seguidos"}
              </p>
            ))}
          </div>
        </Disclosure>
        <Disclosure title="Conquistas" subtitle={`${achievements.length} marcos desbloqueados`}>
          <div className="space-y-2 text-xs text-muted-foreground">
            {achievements.length ? (
              achievements.map((a) => (
                <div key={a.id}>
                  <p className="font-semibold text-foreground">
                    <Trophy className="mr-2 inline h-3.5 w-3.5 text-primary" />
                    {a.title}
                  </p>
                  <p>{a.detail}</p>
                </div>
              ))
            ) : (
              <p>Sua primeira ação concluída desbloqueia uma conquista.</p>
            )}
          </div>
        </Disclosure>
      </div>
    </div>
  );
}

function Row({
  icon: Icon,
  tone,
  label,
  title,
  detail,
}: {
  icon: LucideIcon;
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
    </div>
  );
}

function ModuleRow({
  icon: Icon,
  title,
  value,
  detail,
  delta,
}: {
  icon: LucideIcon;
  title: string;
  value: string;
  detail: string;
  delta: number;
}) {
  return (
    <div className="flex items-center gap-3 py-3.5">
      <Icon className="h-6 w-6 shrink-0 text-muted-foreground" strokeWidth={1.8} />
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted-foreground">{title}</p>
        <p className="text-sm font-semibold">{value}</p>
        <p className="text-xs text-muted-foreground">{detail}</p>
      </div>
      {delta !== 0 && (
        <span
          className={`shrink-0 text-xs font-semibold ${delta > 0 ? "text-primary" : "text-muted-foreground"}`}
        >
          {delta > 0 ? `+${delta}` : delta}
        </span>
      )}
    </div>
  );
}
