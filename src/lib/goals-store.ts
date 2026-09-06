import { useQuery } from "@tanstack/react-query";
import { categoryMeta } from "./mock-data";
import { supabase } from "./supabase/client";
import { queryClient } from "./query-client";
import { useSupabaseUserId, ensureSession } from "./supabase/client";
import { nowDate, nowMs } from "./test-clock";

// ---------------------------------------------------------------------------
// Norte — fonte única de verdade, agora persistida no Supabase.
// Cadeia: Objetivo -> Etapa (estratégia) -> Execução (agenda) -> Realidade.
// Toda a lógica de seletores (progresso, ritmo, insights, KPIs) é pura e
// permanece inalterada — só a camada de leitura/escrita abaixo trocou de
// "variável de módulo" para "query/mutation contra o Postgres real".
// ---------------------------------------------------------------------------

export type GoalKind = "sonho" | "projeto" | "habito";
export type TaskWeight = "leve" | "medio" | "pesado";
export type ExecutionStatus = "planejada" | "concluida" | "perdida" | "reagendada" | "cancelada";
/** Como o progresso deste planejamento é medido. */
export type TrackingType = "etapas" | "frequencia" | "numero";
export type PlanningStatus = "ativo" | "concluido" | "em_risco" | "atrasado";

export type Goal = {
  id: string;
  title: string;
  why: string;
  how?: string;
  /** "Como saberemos que deu certo?" — texto livre, nunca obrigatório. */
  finalOutcome?: string;
  trackingType: TrackingType;
  /** Só usado quando trackingType === "frequencia". */
  frequency?: { timesPerWeek: number };
  kind: GoalKind;
  category: string;
  lifeArea: string;
  deadlineLabel: string;
  deadlineISO?: string;
  createdAt: string;
  metric: { target: number; unit: string };
};

export type Subtask = { id: string; title: string; done: boolean };

export type Step = {
  id: string;
  goalId: string;
  title: string;
  done: boolean;
  dueLabel?: string;
  /** Data-alvo real da etapa — usada pelas camadas Semana/Mês do Planejamento. */
  targetDate?: string;
  /** Quando a etapa foi marcada concluída de verdade — null enquanto aberta ou reaberta.
   * Alimenta a linha de evolução (progresso ao longo do tempo) de planejamentos "por etapas". */
  completedAt?: string;
  /** Só uma etapa por planejamento pode estar assim (garantido por índice único no banco)
   * — usada pra destacar o foco atual do plano, independente de ordem/prazo. */
  isCurrent: boolean;
  /** Organização interna da etapa — não entra no cálculo de progresso do planejamento.
   * Dado legado: a interface não cria subtarefas novas, só exibe/conclui/remove as existentes. */
  subtasks?: Subtask[];
  order: number;
};

export type ExecutionHistoryEntry = {
  at: string;
  from: ExecutionStatus;
  to: ExecutionStatus;
  note?: string;
};

export type AgendaSession = {
  id: string;
  date: string;
  startTime: string;
  endTime?: string;
};

export type Execution = {
  id: string;
  title: string;
  /** PRAZO — até quando isso precisa ser feito. Sempre presente, nunca representa hora. */
  dueDate: string; // YYYY-MM-DD
  /** AGENDA — só existe quando reservei tempo de verdade pra isso. Os três nascem juntos. */
  agendaDate?: string; // YYYY-MM-DD
  startTime?: string; // HH:MM
  endTime?: string; // HH:MM
  agendaSessions?: AgendaSession[];
  /** Identifica uma ocorrência virtual quando a ação aparece várias vezes na Agenda. */
  agendaSessionId?: string;
  /** CRONOGRAMA — em qual período do plano esta ação está sendo trabalhada.
   * Terceiro conceito de tempo, independente de prazo e agenda: uma ação pode
   * ter intervalo planejado sem estar na agenda, estar na agenda sem intervalo
   * planejado, ou as duas coisas ao mesmo tempo. Os dois nascem juntos. */
  plannedStartDate?: string; // YYYY-MM-DD
  plannedEndDate?: string; // YYYY-MM-DD
  category: string;
  location?: string;
  rigid: boolean;
  weight: TaskWeight;
  how?: string;
  why?: string;
  status: ExecutionStatus;
  goalId?: string;
  stepId?: string;
  rescheduledFromId?: string;
  /** Presente quando esta execução foi gerada por uma rotina configurada na sub-agenda. */
  routineId?: string;
  history: ExecutionHistoryEntry[];
  createdAt: string;
};

/** Uma execução "existe" sempre (tem prazo); só passa a valer pra Agenda/Hoje quando agendada. */
export function isScheduled(e: Execution): boolean {
  const today = todayISO();
  if (e.agendaSessions?.some((session) => session.date >= today)) return true;
  return !!e.agendaDate && e.agendaDate >= today;
}

/** Rotina configurada numa sub-agenda (ex.: Academia, Segunda 18h) — gera execuções reais na agenda. */
export type Routine = {
  id: string;
  category: string;
  title: string;
  weekday: number; // 0=domingo .. 6=sábado
  time: string;
  weight: TaskWeight;
  active: boolean;
  createdAt: string;
};

type State = { goals: Goal[]; steps: Step[]; executions: Execution[]; routines: Routine[] };
const EMPTY_STATE: State = { goals: [], steps: [], executions: [], routines: [] };

// ---------------------------------------------------------------------------
// Utilidades de data (locais, não UTC — evita virar o dia errado à noite)
// ---------------------------------------------------------------------------
function pad(n: number) {
  return String(n).padStart(2, "0");
}
export function toISODate(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
export function addDays(base: Date, n: number) {
  const d = new Date(base);
  d.setDate(d.getDate() + n);
  return d;
}
/** Dias entre duas datas ISO (b - a) — usado pro cronograma posicionar barras
 * relativas ao início da janela sem repetir aritmética de Date espalhada. */
export function daysBetweenISO(a: string, b: string): number {
  const da = new Date(a + "T00:00:00").getTime();
  const db = new Date(b + "T00:00:00").getTime();
  return Math.round((db - da) / 86400000);
}
export function todayISO() {
  return toISODate(nowDate());
}
export function nowHM() {
  const d = nowDate();
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
/** "YYYY-MM-DD" -> "DD/MM/YYYY" por split de string — nunca passa por `Date`,
 * então nunca sofre o deslocamento de fuso que `new Date(iso)` (UTC) causaria. */
export function formatDateBR(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

const MONTH_ABBR_PT = [
  "jan",
  "fev",
  "mar",
  "abr",
  "mai",
  "jun",
  "jul",
  "ago",
  "set",
  "out",
  "nov",
  "dez",
];

/** "YYYY-MM-DD" -> "12 set." — mesma regra de `formatDateBR` (split de string,
 * nunca `Date`/UTC), só pra rótulos curtos como "Até 12 set." no card de
 * próximo passo e nas linhas de ação. */
export function formatDateShortBR(iso: string): string {
  const [, m, d] = iso.split("-");
  const monthIdx = Number(m) - 1;
  return `${Number(d)} ${MONTH_ABBR_PT[monthIdx] ?? m}.`;
}

const weightHours: Record<TaskWeight, number> = { leve: 0.5, medio: 1.5, pesado: 2.5 };
export const DAILY_CAPACITY_HOURS = 8;

// ---------------------------------------------------------------------------
// Seletores puros (sem depender do store — recebem os arrays e devolvem valor)
// Nenhuma mudança nesta seção: toda a lógica de negócio já era pura.
// ---------------------------------------------------------------------------
export function stepsForGoal(steps: Step[], goalId: string): Step[] {
  return steps.filter((s) => s.goalId === goalId).sort((a, b) => a.order - b.order);
}

export function executionsForGoal(executions: Execution[], goalId: string): Execution[] {
  return executions.filter((e) => e.goalId === goalId);
}

/** Alvo efetivo de execuções para trackingType "numero"/"frequencia". Frequência deriva o alvo do prazo. */
function effectiveExecutionTarget(goal: Goal): number {
  if (goal.trackingType === "numero") return Math.max(1, goal.metric.target);
  const timesPerWeek = Math.max(1, goal.frequency?.timesPerWeek ?? 1);
  const weeks = goal.deadlineISO
    ? Math.max(
        1,
        Math.ceil(
          (new Date(goal.deadlineISO).getTime() - new Date(goal.createdAt).getTime()) /
            (7 * 24 * 3600 * 1000),
        ),
      )
    : 12;
  return Math.max(1, timesPerWeek * weeks);
}

/**
 * Progresso ramifica pelo tipo de acompanhamento escolhido na criação:
 * etapas -> % de etapas concluídas; número/frequência -> execuções concluídas / alvo.
 */
export function goalProgress(goal: Goal, steps: Step[], executions: Execution[]): number {
  if (goal.trackingType === "etapas") {
    const gSteps = stepsForGoal(steps, goal.id);
    if (gSteps.length === 0) return 0;
    return Math.round((gSteps.filter((s) => s.done).length / gSteps.length) * 100);
  }
  const concluded = executionsForGoal(executions, goal.id).filter(
    (e) => e.status === "concluida",
  ).length;
  return Math.min(100, Math.round((concluded / effectiveExecutionTarget(goal)) * 100));
}

export function goalPace(
  goal: Goal,
  steps: Step[],
  executions: Execution[],
): "ahead" | "ontrack" | "behind" {
  if (!goal.deadlineISO) return "ontrack";
  const start = new Date(goal.createdAt).getTime();
  const end = new Date(goal.deadlineISO + "T23:59:59").getTime();
  const now = nowMs();
  if (end <= start) return "ontrack";
  const expected = Math.min(100, Math.max(0, ((now - start) / (end - start)) * 100));
  const actual = goalProgress(goal, steps, executions);
  if (actual > expected + 8) return "ahead";
  if (actual < expected - 8) return "behind";
  return "ontrack";
}

/**
 * Status do planejamento (visão de resumo) — diferente do ritmo (`goalPace`, 3 valores,
 * usado no Espelho/Timeline). Este é o "como estou de verdade" mostrado no detalhe.
 */
export function planningStatus(goal: Goal, steps: Step[], executions: Execution[]): PlanningStatus {
  const progress = goalProgress(goal, steps, executions);
  if (progress >= 100) return "concluido";
  const deadlinePassed = goal.deadlineISO ? goal.deadlineISO < todayISO() : false;
  if (deadlinePassed) return "atrasado";
  const pace = goalPace(goal, steps, executions);
  if (pace !== "behind") return "ativo";
  if (!goal.deadlineISO) return "em_risco";
  const start = new Date(goal.createdAt).getTime();
  const end = new Date(goal.deadlineISO + "T23:59:59").getTime();
  const now = nowMs();
  const expected =
    end > start ? Math.min(100, Math.max(0, ((now - start) / (end - start)) * 100)) : 0;
  return progress < expected - 20 ? "atrasado" : "em_risco";
}

export type ProgressPoint = { date: string; pct: number };

/**
 * Linha de evolução do percentual ao longo do tempo — só com dados reais, nunca
 * interpolado/inventado. "Etapas": cada ponto é o momento em que uma etapa foi
 * marcada concluída (completedAt), dividido pelo total de etapas atual. "Frequência/
 * número": cada ponto é o momento em que uma execução foi concluída (última entrada
 * "-> concluida" no histórico), dividido pelo alvo efetivo. Sempre começa em 0% na
 * criação do plano e termina hoje com o percentual atual (mesmo cálculo de
 * `goalProgress`), pra nunca destoar do número mostrado em outro lugar da tela.
 */
export function progressOverTime(
  goal: Goal,
  steps: Step[],
  executions: Execution[],
): ProgressPoint[] {
  const todayIso = todayISO();
  const startPoint: ProgressPoint = { date: toISODate(new Date(goal.createdAt)), pct: 0 };
  const points: ProgressPoint[] = [startPoint];

  if (goal.trackingType === "etapas") {
    const gSteps = stepsForGoal(steps, goal.id);
    const total = gSteps.length;
    if (total === 0) return [];
    const completions = gSteps
      .filter((s) => s.completedAt)
      .map((s) => s.completedAt as string)
      .sort();
    let doneCount = 0;
    for (const at of completions) {
      doneCount += 1;
      points.push({ date: at.slice(0, 10), pct: Math.round((doneCount / total) * 100) });
    }
  } else {
    const target = effectiveExecutionTarget(goal);
    const completions = executionsForGoal(executions, goal.id)
      .map((e) => {
        const doneEntry = [...e.history].reverse().find((h) => h.to === "concluida");
        return doneEntry?.at ?? (e.status === "concluida" ? e.createdAt : null);
      })
      .filter((x): x is string => !!x)
      .sort();
    let doneCount = 0;
    for (const at of completions) {
      doneCount += 1;
      points.push({
        date: at.slice(0, 10),
        pct: Math.min(100, Math.round((doneCount / target) * 100)),
      });
    }
  }

  const last = points[points.length - 1];
  const currentPct = goalProgress(goal, steps, executions);
  if (last.date !== todayIso || last.pct !== currentPct) {
    points.push({ date: todayIso, pct: currentPct });
  }
  return points;
}

/** Planejado vs. realizado: quantas execuções deste plano já deveriam ter acontecido até
 * hoje (agenda vencida ou prazo vencido, excluindo canceladas/reagendadas) e quantas de
 * fato foram concluídas. */
export function plannedVsActual(
  goal: Goal,
  executions: Execution[],
): { planned: number; actual: number } {
  const gExecs = executionsForGoal(executions, goal.id).filter(
    (e) => e.status !== "cancelada" && e.status !== "reagendada",
  );
  const iso = todayISO();
  const hm = nowHM();
  const dueByToday = gExecs.filter((e) => isDue(e, iso, hm));
  return {
    planned: dueByToday.length,
    actual: dueByToday.filter((e) => e.status === "concluida").length,
  };
}

/** Previsão de conclusão por extrapolação linear simples do ritmo até agora — não é
 * uma promessa, é "se você continuar nesse ritmo". Retorna null sem dado suficiente
 * (progresso zerado, plano recém-criado, ou já concluído). */
export function estimatedCompletionDate(
  goal: Goal,
  steps: Step[],
  executions: Execution[],
): string | null {
  const progress = goalProgress(goal, steps, executions);
  if (progress >= 100 || progress <= 0) return null;
  const elapsedDays = (nowMs() - new Date(goal.createdAt).getTime()) / 86400000;
  if (elapsedDays <= 0) return null;
  const ratePerDay = progress / elapsedDays;
  if (ratePerDay <= 0) return null;
  const daysNeeded = (100 - progress) / ratePerDay;
  return toISODate(addDays(nowDate(), Math.ceil(daysNeeded)));
}

/** Plano ativo (não concluído) sem nenhuma próxima ação visível: nenhuma execução
 * pendente, nenhuma etapa aberta (marcada como atual ou não — qualquer etapa aberta
 * já é "a próxima ação" pro NextStepCard, então também zera o alerta aqui), e nada
 * concluído nos últimos 14 dias. */
export function isPlanStalled(goal: Goal, steps: Step[], executions: Execution[]): boolean {
  if (goalProgress(goal, steps, executions) >= 100) return false;
  const gSteps = stepsForGoal(steps, goal.id);
  const gExecs = executionsForGoal(executions, goal.id);
  if (gExecs.some((e) => e.status === "planejada")) return false;
  if (gSteps.some((s) => !s.done)) return false;
  const cutoff = toISODate(addDays(nowDate(), -14));
  if (gSteps.some((s) => s.completedAt && s.completedAt.slice(0, 10) >= cutoff)) return false;
  if (gExecs.some((e) => e.status === "concluida" && relevantDate(e) >= cutoff)) return false;
  return true;
}

/** Plano 100% concluído — sai das listas de planos ativos (planejamento.tsx, gráfico
 * de progresso, seletor de vínculo da Agenda, prévia do Espelho), mas nunca é apagado:
 * volta pra "ativo" sozinho assim que qualquer etapa/execução for reaberta. */
export function isGoalComplete(goal: Goal, steps: Step[], executions: Execution[]): boolean {
  return goalProgress(goal, steps, executions) >= 100;
}

/** Data real da conclusão (não estimada) — mesma fonte de dados do progressOverTime:
 * completedAt mais recente das etapas ("etapas") ou última transição "->concluida"
 * do histórico de execuções (frequência/número). Null se o plano não está 100%. */
export function goalCompletionDate(
  goal: Goal,
  steps: Step[],
  executions: Execution[],
): string | null {
  if (!isGoalComplete(goal, steps, executions)) return null;
  if (goal.trackingType === "etapas") {
    const dates = stepsForGoal(steps, goal.id)
      .map((s) => s.completedAt)
      .filter((x): x is string => !!x)
      .sort();
    return dates.length > 0 ? dates[dates.length - 1].slice(0, 10) : null;
  }
  const dates = executionsForGoal(executions, goal.id)
    .map((e) => {
      const doneEntry = [...e.history].reverse().find((h) => h.to === "concluida");
      return doneEntry?.at ?? (e.status === "concluida" ? e.createdAt : null);
    })
    .filter((x): x is string => !!x)
    .sort();
  return dates.length > 0 ? dates[dates.length - 1].slice(0, 10) : null;
}

/** Data que efetivamente rege "quando isso deveria ter acontecido" — agenda se existir, senão o prazo. */
export function relevantDate(e: Execution): string {
  return e.agendaDate ?? e.dueDate;
}

/** "Já devia ter acontecido/sido decidido?" — agendada: compara com o horário marcado.
 * Sem agenda: só conta como vencida quando o próprio PRAZO já passou. */
function isDue(e: Execution, iso: string, hm: string): boolean {
  if (e.agendaDate) {
    return e.agendaDate < iso || (e.agendaDate === iso && !!e.startTime && e.startTime <= hm);
  }
  return e.dueDate < iso;
}

/** Execução vencida que ainda não foi reconhecida como perdida pelo usuário. */
export function isMissed(e: Execution): boolean {
  if (e.status !== "planejada") return false;
  return isDue(e, todayISO(), nowHM());
}

/** Status "de verdade" (não muta nada) — planejada vencida aparece como perdida na UI. */
export function effectiveStatus(e: Execution): ExecutionStatus {
  return isMissed(e) ? "perdida" : e.status;
}

/** Carga horária reservada num dia — só conta o que foi de fato agendado pra essa data. */
export function plannedHoursForDate(executions: Execution[], date: string): number {
  return (agendaByDate(executions)[date] ?? [])
    .filter((e) => e.status === "planejada" || e.status === "concluida")
    .reduce((sum, e) => sum + weightHours[e.weight], 0);
}

/** HOJE = o que chegou a hora de fazer — só execuções agendadas pra essa data. */
export function todayExecutions(executions: Execution[], date = todayISO()): Execution[] {
  return agendaByDate(executions)[date] ?? [];
}

/** Ordena a lista "Hoje" pra exibição: pendentes por horário primeiro (mesma ordem
 * que todayExecutions já entrega), concluídas por último — sort é estável, então a
 * ordem cronológica dentro de cada grupo se preserva sem precisar reordenar por hora. */
export function orderedTodayTasks(tasks: Execution[]): Execution[] {
  return [...tasks].sort((a, b) => {
    const aDone = a.status === "concluida" ? 1 : 0;
    const bDone = b.status === "concluida" ? 1 : 0;
    return aDone - bDone;
  });
}

export function agendaByDate(executions: Execution[]): Record<string, Execution[]> {
  const map: Record<string, Execution[]> = {};
  for (const e of executions) {
    if (e.status === "reagendada") continue; // substituída pela nova execução
    const sessions = e.agendaSessions?.length
      ? e.agendaSessions
      : e.agendaDate
        ? [
            {
              id: `legacy-${e.id}`,
              date: e.agendaDate,
              startTime: e.startTime ?? "",
              endTime: e.endTime,
            },
          ]
        : [];
    for (const session of sessions) {
      (map[session.date] ??= []).push({
        ...e,
        agendaDate: session.date,
        startTime: session.startTime,
        endTime: session.endTime,
        agendaSessionId: session.id,
      });
    }
  }
  for (const k in map) map[k].sort((a, b) => (a.startTime ?? "").localeCompare(b.startTime ?? ""));
  return map;
}

export function confidenceIndexByCategory(
  executions: Execution[],
): { category: string; pct: number }[] {
  const byCat: Record<string, { done: number; total: number }> = {};
  const iso = todayISO();
  const hm = nowHM();
  for (const e of executions) {
    if (e.status === "cancelada" || e.status === "reagendada") continue;
    if (!isDue(e, iso, hm)) continue;
    const c = (byCat[e.category] ??= { done: 0, total: 0 });
    c.total += 1;
    if (e.status === "concluida") c.done += 1;
  }
  return Object.entries(byCat)
    .map(([category, v]) => ({
      category,
      pct: v.total > 0 ? Math.round((v.done / v.total) * 100) : 0,
    }))
    .sort((a, b) => b.pct - a.pct);
}

export function procrastinationRanking(
  executions: Execution[],
): { title: string; category: string; times: number }[] {
  const byTitle: Record<string, { category: string; times: number }> = {};
  for (const e of executions) {
    if (e.status === "perdida" || e.status === "reagendada") {
      const cur = (byTitle[e.title] ??= { category: e.category, times: 0 });
      cur.times += 1;
    }
  }
  return Object.entries(byTitle)
    .map(([title, v]) => ({ title, category: v.category, times: v.times }))
    .sort((a, b) => b.times - a.times)
    .slice(0, 5);
}

export function streakForTitle(executions: Execution[], title: string): number {
  const dates = new Set(
    executions
      .filter((e) => e.title === title && e.status === "concluida")
      .map((e) => relevantDate(e)),
  );
  let cursor = nowDate();
  if (!dates.has(toISODate(cursor))) cursor = addDays(cursor, -1);
  let streak = 0;
  while (dates.has(toISODate(cursor))) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

export function achievementsEarned(
  state: State,
): { id: string; icon: string; title: string; detail: string }[] {
  const out: { id: string; icon: string; title: string; detail: string }[] = [];
  const concluded = state.executions
    .filter((e) => e.status === "concluida")
    .sort((a, b) => relevantDate(a).localeCompare(relevantDate(b)));
  if (concluded.length > 0) {
    out.push({
      id: "a-first",
      icon: "🎯",
      title: "Primeira execução concluída",
      detail: `"${concluded[0].title}" foi seu primeiro passo registrado.`,
    });
  }
  let bestTitle = "";
  let bestStreak = 0;
  for (const t of new Set(state.executions.map((e) => e.title))) {
    const st = streakForTitle(state.executions, t);
    if (st > bestStreak) {
      bestStreak = st;
      bestTitle = t;
    }
  }
  if (bestStreak >= 7)
    out.push({
      id: "a-streak",
      icon: "🔥",
      title: `${bestStreak} dias seguidos`,
      detail: `"${bestTitle}" virou consistência.`,
    });
  for (const g of state.goals) {
    if (goalProgress(g, state.steps, state.executions) >= 100) {
      out.push({ id: `a-done-${g.id}`, icon: "🏆", title: "Objetivo concluído", detail: g.title });
    }
  }
  return out;
}

function categoryLabel(cat: string) {
  return categoryMeta[cat]?.label ?? cat;
}

/** Compara taxa de conclusão manhã (antes de 12h) vs. resto do dia, por categoria — só entra se a diferença for real. */
function timeOfDayPattern(
  executions: Execution[],
): { category: string; betterLabel: string; betterPct: number; worsePct: number } | null {
  const byCat: Record<
    string,
    { morning: { done: number; total: number }; rest: { done: number; total: number } }
  > = {};
  const iso = todayISO();
  const hm = nowHM();
  for (const e of executions) {
    if (e.status === "cancelada" || e.status === "reagendada") continue;
    if (!e.startTime) continue; // padrão de horário só faz sentido pra quem tem agenda
    if (!isDue(e, iso, hm)) continue;
    const bucket = e.startTime < "12:00" ? "morning" : "rest";
    const c = (byCat[e.category] ??= {
      morning: { done: 0, total: 0 },
      rest: { done: 0, total: 0 },
    });
    c[bucket].total += 1;
    if (e.status === "concluida") c[bucket].done += 1;
  }
  let best: { category: string; betterLabel: string; betterPct: number; worsePct: number } | null =
    null;
  let bestGap = 0;
  for (const [category, v] of Object.entries(byCat)) {
    if (v.morning.total < 3 || v.rest.total < 3) continue;
    const morningPct = Math.round((v.morning.done / v.morning.total) * 100);
    const restPct = Math.round((v.rest.done / v.rest.total) * 100);
    const gap = Math.abs(morningPct - restPct);
    if (gap >= 15 && gap > bestGap) {
      bestGap = gap;
      best =
        morningPct >= restPct
          ? { category, betterLabel: "manhã", betterPct: morningPct, worsePct: restPct }
          : { category, betterLabel: "tarde/noite", betterPct: restPct, worsePct: morningPct };
    }
  }
  return best;
}

export function insightsComputed(state: State): {
  id: string;
  icon: string;
  tone: "success" | "warning" | "danger" | "info";
  title: string;
  detail: string;
  action?: string;
}[] {
  const out: {
    id: string;
    icon: string;
    tone: "success" | "warning" | "danger" | "info";
    title: string;
    detail: string;
    action?: string;
  }[] = [];
  const conf = confidenceIndexByCategory(state.executions);
  const worst = [...conf].filter((c) => c.pct < 50).sort((a, b) => a.pct - b.pct)[0];
  if (worst)
    out.push({
      id: "i-worst",
      icon: "🔁",
      tone: "danger",
      title: `${categoryLabel(worst.category)} está travando`,
      detail: `Só ${worst.pct}% de cumprimento até agora nessa categoria.`,
      action: "Rever essa categoria",
    });
  const best = conf.find((c) => c.pct >= 80);
  if (best)
    out.push({
      id: "i-best",
      icon: "📈",
      tone: "success",
      title: `${categoryLabel(best.category)} é sua âncora`,
      detail: `${best.pct}% de cumprimento — sua categoria mais confiável.`,
    });
  const behindGoal = state.goals.find(
    (g) => goalPace(g, state.steps, state.executions) === "behind",
  );
  if (behindGoal)
    out.push({
      id: "i-behind",
      icon: "🎯",
      tone: "warning",
      title: `"${behindGoal.title}" no ritmo pra atrasar`,
      detail: "O progresso atual está abaixo do esperado para o prazo definido.",
      action: "Redistribuir sessões",
    });
  const proc = procrastinationRanking(state.executions)[0];
  if (proc && proc.times >= 2)
    out.push({
      id: "i-proc",
      icon: "⏰",
      tone: "info",
      title: `"${proc.title}" já foi perdida/adiada ${proc.times}x`,
      detail: "Vale considerar mudar o horário ou reduzir a meta.",
    });
  const timePattern = timeOfDayPattern(state.executions);
  if (timePattern)
    out.push({
      id: "i-time",
      icon: "🌅",
      tone: "info",
      title: `Você rende mais pela ${timePattern.betterLabel}`,
      detail: `${categoryLabel(timePattern.category)}: ${timePattern.betterPct}% de manhã vs. ${timePattern.worsePct}% no resto do dia.`,
    });
  if (out.length === 0)
    out.push({
      id: "i-empty",
      icon: "🧠",
      tone: "info",
      title: "Ainda sem dados suficientes",
      detail:
        "Continue registrando execuções para eu identificar padrões reais no seu comportamento.",
    });
  return out;
}

export type Range = "dia" | "semana" | "mes" | "ano";

export function kpisForRange(state: State, range: Range, offsetDays = 0) {
  const days = range === "dia" ? 1 : range === "semana" ? 7 : range === "mes" ? 30 : 365;
  const windowEnd = addDays(nowDate(), -offsetDays);
  const end = toISODate(windowEnd);
  const start = toISODate(addDays(windowEnd, -(days - 1)));
  const iso = todayISO();
  const hm = nowHM();
  const inRange = state.executions.filter(
    (e) => relevantDate(e) >= start && relevantDate(e) <= end,
  );
  const due = inRange.filter((e) => e.status !== "reagendada" && isDue(e, iso, hm));
  const concluded = due.filter((e) => e.status === "concluida").length;
  // Conta tudo que já venceu e não foi conscientemente descartado — inclui "planejada"
  // ainda não reconhecida como perdida, senão o KPI mentiria por omissão (ethos do app).
  const resolved = due.filter((e) => e.status !== "cancelada").length;
  const cumprimento = resolved > 0 ? Math.round((concluded / resolved) * 100) : 0;
  const daysWithActivity = new Set(
    due.filter((e) => e.status === "concluida").map((e) => relevantDate(e)),
  ).size;
  const behindGoals = state.goals.filter(
    (g) => goalPace(g, state.steps, state.executions) === "behind",
  ).length;
  return { cumprimento, concluded, resolved, daysWithActivity, totalDays: days, behindGoals };
}

export function stepsForGoalId(steps: Step[], goalId: string): Step[] {
  return stepsForGoal(steps, goalId);
}

/** Próxima ação real de um plano — única fonte usada por "Em foco", "Outros
 * planos" (planejamento.tsx) e pelo módulo "Próxima ação" (objetivo.$id.tsx),
 * pra nunca haver dois caminhos calculando isso de formas diferentes. */
export type NextAction =
  | { kind: "execution"; step: Step; execution: Execution }
  | { kind: "step"; step: Step }
  | { kind: "define"; step: Step }
  | { kind: "none" };

export function nextActionForGoal(goal: Goal, steps: Step[], executions: Execution[]): NextAction {
  const openStep = stepsForGoal(steps, goal.id).find((s) => !s.done);
  if (!openStep) return { kind: "none" };
  const stepExecs = executionsForGoal(executions, goal.id).filter((e) => e.stepId === openStep.id);
  const pending = stepExecs
    .filter((e) => e.status !== "concluida" && e.status !== "cancelada")
    .sort((a, b) => relevantDate(a).localeCompare(relevantDate(b)))[0];
  if (pending) return { kind: "execution", step: openStep, execution: pending };
  if (stepExecs.length === 0) return { kind: "define", step: openStep };
  return { kind: "step", step: openStep };
}

/** Data que rege a urgência de uma NextAction — usada só pro desempate de `focusGoal`. */
function nextActionDate(action: NextAction): string {
  if (action.kind === "execution") return relevantDate(action.execution);
  if (action.kind === "step" || action.kind === "define")
    return action.step.targetDate ?? "9999-99-99";
  return "9999-99-99";
}

/** Escolhe UM plano pra destacar em "Em foco" — nunca duplica o registro, só
 * ordena os mesmos planos já filtrados pelo horizonte atual. Prioridade:
 * (1) em risco/atrasado primeiro; (2) tem ação pendente real antes de precisar
 * "definir"; (3) ação/etapa mais próxima; (4) prazo do plano como desempate. */
export function focusGoal(goals: Goal[], steps: Step[], executions: Execution[]): Goal | null {
  if (goals.length === 0) return null;
  const rank = (g: Goal): [number, number, string, string] => {
    const status = planningStatus(g, steps, executions);
    const statusRank = status === "atrasado" || status === "em_risco" ? 0 : 1;
    const action = nextActionForGoal(g, steps, executions);
    const hasAction = action.kind === "execution" || action.kind === "step" ? 0 : 1;
    return [statusRank, hasAction, nextActionDate(action), g.deadlineISO ?? "9999-99-99"];
  };
  return [...goals].sort((a, b) => {
    const ra = rank(a);
    const rb = rank(b);
    for (let i = 0; i < ra.length; i++) {
      if (ra[i] < rb[i]) return -1;
      if (ra[i] > rb[i]) return 1;
    }
    return 0;
  })[0];
}

/** "Próximo passo" do detalhe do plano — algoritmo próprio, diferente de
 * `nextActionForGoal` (que só olha a primeira etapa aberta): aqui o pool são
 * as ações de QUALQUER etapa ainda aberta, priorizando agendadas mais
 * próximas, depois prazo mais próximo, com a primeira etapa aberta como
 * desempate final. Nunca cria/copia registro — só escolhe qual mostrar. */
export type PlanNextAction =
  | { kind: "action"; step: Step; execution: Execution }
  | { kind: "define"; step: Step }
  | { kind: "none" };

export function nextPlanAction(goal: Goal, steps: Step[], executions: Execution[]): PlanNextAction {
  const openSteps = stepsForGoal(steps, goal.id).filter((s) => !s.done);
  if (openSteps.length === 0) return { kind: "none" };
  const openStepIds = new Set(openSteps.map((s) => s.id));
  const firstOpenId = openSteps[0].id;
  const candidates = executionsForGoal(executions, goal.id).filter(
    (e) =>
      e.stepId &&
      openStepIds.has(e.stepId) &&
      e.status !== "cancelada" &&
      e.status !== "reagendada" &&
      e.status !== "concluida",
  );
  if (candidates.length === 0) return { kind: "define", step: openSteps[0] };

  const rank = (e: Execution): [number, string, number] => {
    const belongsFirst = e.stepId === firstOpenId ? 0 : 1;
    if (isScheduled(e)) return [0, `${e.agendaDate}${e.startTime ?? "00:00"}`, belongsFirst];
    return [1, e.dueDate, belongsFirst];
  };
  const winner = [...candidates].sort((a, b) => {
    const ra = rank(a);
    const rb = rank(b);
    for (let i = 0; i < ra.length; i++) {
      if (ra[i] < rb[i]) return -1;
      if (ra[i] > rb[i]) return 1;
    }
    return 0;
  })[0];
  const step = openSteps.find((s) => s.id === winner.stepId)!;
  return { kind: "action", step, execution: winner };
}

// ---------------------------------------------------------------------------
// Cronograma (Gantt) — seletores puros. Nenhum depende do store; recebem
// datas/escala e devolvem geometria/agrupamento pro componente desenhar.
// ---------------------------------------------------------------------------
export function hasPlannedRange(e: Execution): boolean {
  return !!e.plannedStartDate && !!e.plannedEndDate;
}

/** Vencida no cronograma: o fim planejado já passou e a ação não foi concluída
 * (nem cancelada — descartada não é "atrasada", só deixou de valer). */
export function isPlannedOverdue(e: Execution, todayIso: string): boolean {
  if (!e.plannedEndDate) return false;
  if (e.status === "concluida" || e.status === "cancelada") return false;
  return e.plannedEndDate < todayIso;
}

export type GanttScale = "dia" | "semana" | "mes" | "45dias" | "90dias";

export const ganttScaleLabel: Record<GanttScale, string> = {
  dia: "Dia",
  semana: "Semana",
  mes: "Mês",
  "45dias": "45 dias",
  "90dias": "90 dias",
};

const GANTT_SCALE_DAYS: Record<GanttScale, number> = {
  dia: 7,
  semana: 7,
  mes: 28,
  "45dias": 45,
  "90dias": 90,
};

/** Quanto cada escala "olha pra trás" a partir de hoje — evita que a linha de
 * hoje fique grudada na borda esquerda da janela (a referência visual mostra
 * hoje já na 2ª semana da visão mensal, não na primeira). */
const GANTT_SCALE_LOOKBACK: Record<GanttScale, number> = {
  dia: 1,
  semana: 1,
  mes: 11,
  "45dias": 7,
  "90dias": 14,
};

/** Janela do cronograma pra uma escala — ancorada perto de hoje (não no
 * prazo do plano, que pode estar muito longe). Nunca datas fixas no código:
 * tudo deriva de `todayIso`. */
export function ganttWindow(
  scale: GanttScale,
  todayIso: string,
): { startISO: string; endISO: string; totalDays: number } {
  const totalDays = GANTT_SCALE_DAYS[scale];
  const start = addDays(new Date(todayIso + "T00:00:00"), -GANTT_SCALE_LOOKBACK[scale]);
  const end = addDays(start, totalDays - 1);
  return { startISO: toISODate(start), endISO: toISODate(end), totalDays };
}

const GANTT_BUCKET_DAYS: Record<GanttScale, number> = {
  dia: 1,
  semana: 7,
  mes: 30,
  "45dias": 45,
  "90dias": 90,
};

function isoParts(iso: string): { y: number; m: number; d: number } {
  const [y, m, d] = iso.split("-").map(Number);
  return { y, m, d };
}

function ganttBucketLabel(startISO: string, endISO: string): string {
  const s = isoParts(startISO);
  const e = isoParts(endISO);
  if (startISO === endISO) return `${s.d} ${MONTH_ABBR_PT[s.m - 1].toUpperCase()}`;
  if (s.m === e.m) return `${s.d}–${e.d} ${MONTH_ABBR_PT[s.m - 1].toUpperCase()}`;
  return `${s.d} ${MONTH_ABBR_PT[s.m - 1].toUpperCase()}–${e.d} ${MONTH_ABBR_PT[e.m - 1].toUpperCase()}`;
}

export type GanttBucket = { startISO: string; endISO: string; label: string };

/** Régua do cronograma: dias individuais; semanas civis (dom–sáb); meses de
 * calendário; ou blocos corridos de 45/90 dias. Início e prazo são clipados. */
export function ganttBuckets(startISO: string, endISO: string, scale: GanttScale): GanttBucket[] {
  const start = new Date(startISO + "T00:00:00");
  const end = new Date(endISO + "T00:00:00");
  const totalDays = Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
  const buckets: GanttBucket[] = [];
  let offset = 0;
  while (offset < totalDays) {
    const bStartISO = toISODate(addDays(start, offset));
    const cursor = addDays(start, offset);
    let bucketDays = GANTT_BUCKET_DAYS[scale];
    if (scale === "semana") {
      const daysUntilSaturday = (6 - cursor.getDay() + 7) % 7;
      bucketDays = daysUntilSaturday + 1;
    } else if (scale === "mes") {
      bucketDays =
        new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate() - cursor.getDate() + 1;
    }
    const actualDays = Math.min(bucketDays, totalDays - offset);
    const bEndISO = toISODate(addDays(start, offset + actualDays - 1));
    buckets.push({
      startISO: bStartISO,
      endISO: bEndISO,
      label: ganttBucketLabel(bStartISO, bEndISO),
    });
    offset += actualDays;
  }
  return buckets;
}

/** Aloca cada item numa "lane" (linha visual) dentro do corredor da etapa —
 * packing guloso por intervalo: duas ações com período sobreposto nunca
 * caem na mesma lane, então nunca ficam desenhadas uma em cima da outra. */
export function assignLanes(items: { id: string; start: string; end: string }[]): {
  laneOf: Record<string, number>;
  laneCount: number;
} {
  const sorted = [...items].sort((a, b) => a.start.localeCompare(b.start));
  const laneEnds: string[] = [];
  const laneOf: Record<string, number> = {};
  for (const item of sorted) {
    let lane = laneEnds.findIndex((end) => end < item.start);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(item.end);
    } else {
      laneEnds[lane] = item.end;
    }
    laneOf[item.id] = lane;
  }
  return { laneOf, laneCount: Math.max(1, laneEnds.length) };
}

// ---------------------------------------------------------------------------
// Mapeamento de linhas do banco (snake_case) para os tipos acima (camelCase) —
// única fronteira que conhece o formato das tabelas.
// ---------------------------------------------------------------------------
type Row = Record<string, unknown>;

function mapGoal(r: Row): Goal {
  return {
    id: r.id as string,
    title: r.title as string,
    why: (r.why as string) ?? "",
    how: (r.how as string) ?? undefined,
    finalOutcome: (r.final_outcome as string) ?? undefined,
    trackingType: r.tracking_type as TrackingType,
    frequency:
      r.frequency_times_per_week != null
        ? { timesPerWeek: r.frequency_times_per_week as number }
        : undefined,
    kind: r.kind as GoalKind,
    category: r.category as string,
    lifeArea: r.life_area as string,
    deadlineLabel: (r.deadline_label as string) ?? "",
    deadlineISO: (r.deadline_date as string) ?? undefined,
    createdAt: r.created_at as string,
    metric: { target: Number(r.metric_target ?? 0), unit: (r.metric_unit as string) ?? "" },
  };
}

function mapStep(r: Row, subtasks: Subtask[]): Step {
  return {
    id: r.id as string,
    goalId: r.goal_id as string,
    title: r.title as string,
    done: r.done as boolean,
    dueLabel: (r.due_label as string) ?? undefined,
    targetDate: (r.target_date as string) ?? undefined,
    completedAt: (r.completed_at as string) ?? undefined,
    isCurrent: (r.is_current as boolean) ?? false,
    subtasks: subtasks.length > 0 ? subtasks : undefined,
    order: (r.order_index as number) ?? 0,
  };
}

function mapSubtask(r: Row): Subtask {
  return { id: r.id as string, title: r.title as string, done: r.done as boolean };
}

function mapExecution(r: Row, history: ExecutionHistoryEntry[]): Execution {
  return {
    id: r.id as string,
    title: r.title as string,
    dueDate: r.due_date as string,
    agendaDate: (r.agenda_date as string) ?? undefined,
    startTime: (r.start_time as string) ?? undefined,
    endTime: (r.end_time as string) ?? undefined,
    agendaSessions: Array.isArray(r.agenda_sessions)
      ? (r.agenda_sessions as AgendaSession[])
      : undefined,
    plannedStartDate: (r.planned_start_date as string) ?? undefined,
    plannedEndDate: (r.planned_end_date as string) ?? undefined,
    category: r.category as string,
    location: (r.location as string) ?? undefined,
    rigid: r.rigid as boolean,
    weight: r.weight as TaskWeight,
    how: (r.how as string) ?? undefined,
    why: (r.why as string) ?? undefined,
    status: r.status as ExecutionStatus,
    goalId: (r.goal_id as string) ?? undefined,
    stepId: (r.step_id as string) ?? undefined,
    rescheduledFromId: (r.rescheduled_from_id as string) ?? undefined,
    routineId: (r.routine_id as string) ?? undefined,
    history,
    createdAt: r.created_at as string,
  };
}

function mapHistory(r: Row): ExecutionHistoryEntry {
  return {
    at: r.at as string,
    from: r.from_status as ExecutionStatus,
    to: r.to_status as ExecutionStatus,
    note: (r.note as string) ?? undefined,
  };
}

function mapRoutine(r: Row): Routine {
  return {
    id: r.id as string,
    category: r.category as string,
    title: r.title as string,
    weekday: r.weekday as number,
    time: r.time as string,
    weight: r.weight as TaskWeight,
    active: r.active as boolean,
    createdAt: r.created_at as string,
  };
}

function groupBy<T extends Row>(rows: T[], key: string): Record<string, T[]> {
  const out: Record<string, T[]> = {};
  for (const r of rows) {
    const k = r[key] as string;
    (out[k] ??= []).push(r);
  }
  return out;
}

function unwrap<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

/** Exportado só pra teste poder registrar a mesma queryFn real via prefetchQuery
 * — sem isso, um refetch pós-invalidate reusaria uma queryFn de teste incompleta. */
export async function fetchState(): Promise<State> {
  const [goalsRes, stepsRes, subtasksRes, execRes, histRes, routinesRes] = await Promise.all([
    supabase.from("goals").select("*").order("created_at", { ascending: false }),
    supabase.from("steps").select("*").order("order_index"),
    supabase.from("subtasks").select("*").order("order_index"),
    supabase.from("executions").select("*").order("created_at", { ascending: false }),
    supabase.from("execution_history").select("*").order("at"),
    supabase.from("routines").select("*").order("created_at", { ascending: false }),
  ]);
  const goalRows = unwrap(goalsRes);
  const stepRows = unwrap(stepsRes);
  const subtaskRows = unwrap(subtasksRes);
  const execRows = unwrap(execRes);
  const histRows = unwrap(histRes);
  const routineRows = unwrap(routinesRes);

  const subtasksByStep = groupBy(subtaskRows as Row[], "step_id");
  const historyByExec = groupBy(histRows as Row[], "execution_id");

  return {
    goals: (goalRows as Row[]).map(mapGoal),
    steps: (stepRows as Row[]).map((r) =>
      mapStep(r, (subtasksByStep[r.id as string] ?? []).map(mapSubtask)),
    ),
    executions: (execRows as Row[]).map((r) =>
      mapExecution(r, (historyByExec[r.id as string] ?? []).map(mapHistory)),
    ),
    routines: (routineRows as Row[]).map(mapRoutine),
  };
}

export const QUERY_KEY = ["goals-domain"] as const;
/** Espera o refetch terminar antes de resolver — evita navegar pra uma tela que lê
 * o cache antes do dado novo chegar (ex.: ir pro detalhe do objetivo recém-criado).
 * `refetchType: "all"` é essencial: o default do TanStack Query só re-busca queries
 * com observador ATIVO no momento da chamada. Ações disparadas de telas que não leem
 * `useGoalsStore` (ex.: PlanejamentoFlow em criar.tsx) não têm observador ativo — sem
 * isso, o invalidate só marcava a query como stale e a navegação seguinte lia cache
 * antigo enquanto o refetch acontecia em segundo plano (causa raiz do "Planejamento
 * não encontrado" transitório). */
function invalidate() {
  return queryClient.invalidateQueries({ queryKey: QUERY_KEY, refetchType: "all" });
}

export function useGoalsStore<T>(selector: (s: State) => T): T {
  const userId = useSupabaseUserId();
  const { data } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: fetchState,
    enabled: !!userId,
  });
  return selector(data ?? EMPTY_STATE);
}

/** true enquanto o primeiro carregamento OU um refetch em segundo plano ainda não
 * terminou — evita telas tratarem "ainda buscando/atualizando" como "não existe"
 * (ex.: notFound() num objetivo recém-criado, cujo refetch pós-invalidate ainda não
 * chegou). Checar só `isLoading` não bastava: com dado antigo em cache, o TanStack
 * Query considera a query "success" mesmo enquanto refaz o fetch em segundo plano. */
export function useGoalsLoading(): boolean {
  const userId = useSupabaseUserId();
  const { isLoading, isFetching } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: fetchState,
    enabled: !!userId,
  });
  return !userId || isLoading || isFetching;
}

// ---------------------------------------------------------------------------
// Ações — todas assíncronas agora (persistem no Supabase e invalidam o cache).
// ---------------------------------------------------------------------------
export async function createGoal(input: {
  title: string;
  why: string;
  how?: string;
  finalOutcome?: string;
  trackingType: TrackingType;
  frequency?: { timesPerWeek: number };
  kind: GoalKind;
  category: string;
  lifeArea: string;
  deadlineLabel: string;
  deadlineISO?: string;
  metric: { target: number; unit: string };
  steps?: { title: string; targetDate?: string }[];
}): Promise<{ id: string; firstStepId?: string }> {
  const userId = await ensureSession();
  const goal = unwrap<{ id: string }>(
    await supabase
      .from("goals")
      .insert({
        user_id: userId,
        title: input.title,
        why: input.why,
        how: input.how,
        final_outcome: input.finalOutcome,
        tracking_type: input.trackingType,
        frequency_times_per_week: input.frequency?.timesPerWeek,
        kind: input.kind,
        category: input.category,
        life_area: input.lifeArea,
        deadline_label: input.deadlineLabel,
        deadline_date: input.deadlineISO,
        metric_target: input.metric.target,
        metric_unit: input.metric.unit,
      })
      .select()
      .single(),
  );
  let firstStepId: string | undefined;
  if (input.steps && input.steps.length > 0) {
    // `.select()` de volta pra saber o id gerado da 1a etapa — a primeira execução
    // criada junto com o plano (criar.tsx) precisa vincular a ela via stepId.
    const rows = unwrap<{ id: string; order_index: number }[]>(
      await supabase
        .from("steps")
        .insert(
          input.steps.map((s, i) => ({
            user_id: userId,
            goal_id: goal.id,
            title: s.title,
            target_date: s.targetDate,
            order_index: i,
          })),
        )
        .select("id, order_index"),
    );
    firstStepId = rows.find((r) => r.order_index === 0)?.id;
  }
  await invalidate();
  return { id: goal.id as string, firstStepId };
}

export async function addStep(
  goalId: string,
  title: string,
  targetDate?: string,
  dueLabel?: string,
) {
  const userId = await ensureSession();
  const { count } = await supabase
    .from("steps")
    .select("id", { count: "exact", head: true })
    .eq("goal_id", goalId);
  unwrap(
    await supabase.from("steps").insert({
      user_id: userId,
      goal_id: goalId,
      title,
      target_date: targetDate,
      due_label: dueLabel,
      order_index: count ?? 0,
    }),
  );
  await invalidate();
}

/** Toque em "concluir etapa" é o gesto mais repetido da tela do plano — atualiza o
 * cache local na hora (checkbox responde no mesmo frame do toque) e só then espera
 * o servidor; se a escrita falhar, desfaz o otimismo pro valor anterior. */
export async function toggleStep(stepId: string, currentlyDone: boolean) {
  const nowDone = !currentlyDone;
  const completedAt = nowDone ? nowDate().toISOString() : undefined;
  const previous = queryClient.getQueryData<State>(QUERY_KEY);
  if (previous) {
    queryClient.setQueryData<State>(QUERY_KEY, {
      ...previous,
      steps: previous.steps.map((s) =>
        s.id === stepId ? { ...s, done: nowDone, completedAt } : s,
      ),
    });
  }
  try {
    unwrap(
      await supabase
        .from("steps")
        .update({ done: nowDone, completed_at: nowDone ? nowDate().toISOString() : null })
        .eq("id", stepId)
        .select()
        .single(),
    );
    await invalidate();
  } catch (err) {
    if (previous) queryClient.setQueryData(QUERY_KEY, previous);
    throw err;
  }
}

export async function removeStep(stepId: string) {
  await supabase.from("executions").update({ step_id: null }).eq("step_id", stepId);
  await supabase.from("steps").delete().eq("id", stepId);
  await invalidate();
}

/** Marca `stepId` como a etapa atual do plano, desmarcando qualquer outra que já estivesse
 * (o índice único no banco também garante isso, mas fazemos explícito aqui pra não depender
 * só do erro de constraint). Passar `null` só remove o destaque, sem marcar nenhuma outra. */
export async function setCurrentStep(goalId: string, stepId: string | null) {
  await supabase.from("steps").update({ is_current: false }).eq("goal_id", goalId);
  if (stepId) {
    unwrap(
      await supabase.from("steps").update({ is_current: true }).eq("id", stepId).select().single(),
    );
  }
  await invalidate();
}

export async function addSubtask(stepId: string, title: string) {
  const userId = await ensureSession();
  const { count } = await supabase
    .from("subtasks")
    .select("id", { count: "exact", head: true })
    .eq("step_id", stepId);
  unwrap(
    await supabase
      .from("subtasks")
      .insert({ user_id: userId, step_id: stepId, title, order_index: count ?? 0 }),
  );
  await invalidate();
}

export async function toggleSubtask(_stepId: string, subtaskId: string, currentlyDone: boolean) {
  unwrap(
    await supabase
      .from("subtasks")
      .update({ done: !currentlyDone })
      .eq("id", subtaskId)
      .select()
      .single(),
  );
  await invalidate();
}

export async function removeSubtask(_stepId: string, subtaskId: string) {
  await supabase.from("subtasks").delete().eq("id", subtaskId);
  await invalidate();
}

export async function createExecution(input: {
  title: string;
  /** PRAZO — sempre obrigatório. */
  dueDate: string;
  /** AGENDA — opcional. Os três nascem juntos ou nenhum deles nasce. */
  agendaDate?: string;
  startTime?: string;
  endTime?: string;
  /** CRONOGRAMA — opcional. Independente de agenda; os dois nascem juntos ou nenhum. */
  plannedStartDate?: string;
  plannedEndDate?: string;
  category: string;
  location?: string;
  rigid?: boolean;
  weight?: TaskWeight;
  how?: string;
  why?: string;
  goalId?: string;
  stepId?: string;
  status?: ExecutionStatus;
}): Promise<string> {
  const userId = await ensureSession();
  const row = unwrap<{ id: string }>(
    await supabase
      .from("executions")
      .insert({
        user_id: userId,
        title: input.title,
        due_date: input.dueDate,
        agenda_date: input.agendaDate,
        start_time: input.startTime,
        end_time: input.endTime,
        planned_start_date: input.plannedStartDate,
        planned_end_date: input.plannedEndDate,
        category: input.category,
        location: input.location,
        rigid: input.rigid ?? false,
        weight: input.weight ?? "leve",
        how: input.how,
        why: input.why,
        status: input.status ?? "planejada",
        goal_id: input.goalId,
        step_id: input.stepId,
      })
      .select()
      .single(),
  );
  await invalidate();
  return row.id as string;
}

/** Cria a execução "derivada" de uma etapa que ainda não tem nenhuma execução própria,
 * já direto na agenda — usada tanto pelo atalho rápido no card da etapa quanto pelo
 * fluxo completo de Adicionar à Agenda. Nunca duplica: só faz sentido oferecer enquanto
 * a etapa não tiver nenhuma execução (o chamador é quem garante essa condição antes de
 * chamar — assim que a execução existe, a UI que oferecia esse atalho some sozinha). */
export async function scheduleStepAsExecution(
  step: Step,
  goal: Goal,
  agendaDate: string,
  startTime: string,
  endTime?: string,
): Promise<string> {
  return createExecution({
    title: step.title,
    dueDate: step.targetDate ?? agendaDate,
    agendaDate,
    startTime,
    endTime,
    category: goal.category,
    weight: "medio",
    goalId: goal.id,
    stepId: step.id,
  });
}

/** Agenda uma execução que só tinha prazo — atualiza a MESMA linha, nunca duplica. */
export async function scheduleExecution(
  id: string,
  agendaDate: string,
  startTime: string,
  endTime?: string,
): Promise<void> {
  const row = await fetchExecutionRow(id);
  const existing = Array.isArray(row.agenda_sessions)
    ? (row.agenda_sessions as AgendaSession[])
    : [];
  const legacy =
    existing.length === 0 && row.agenda_date
      ? [
          {
            id: `legacy-${id}`,
            date: row.agenda_date as string,
            startTime: (row.start_time as string) ?? "",
            endTime: (row.end_time as string) ?? undefined,
          },
        ]
      : [];
  const session: AgendaSession = {
    id: crypto.randomUUID(),
    date: agendaDate,
    startTime,
    endTime,
  };
  unwrap(
    await supabase
      .from("executions")
      .update({
        agenda_date: agendaDate,
        start_time: startTime,
        end_time: endTime,
        agenda_sessions: [...legacy, ...existing, session],
      })
      .eq("id", id)
      .select()
      .single(),
  );
  await invalidate();
}

/** Edita uma ocorrência específica na Agenda sem alterar prazo ou intervalo do
 * Cronograma. A ação pode possuir várias sessões, portanto nunca clonamos nem
 * movemos as demais ocorrências. */
export async function updateAgendaSession(
  id: string,
  sessionId: string | undefined,
  agendaDate: string,
  startTime: string,
  endTime?: string,
): Promise<void> {
  const row = await fetchExecutionRow(id);
  const sessions = Array.isArray(row.agenda_sessions)
    ? (row.agenda_sessions as AgendaSession[])
    : [];

  if (sessions.length > 0 && sessionId && !sessionId.startsWith("legacy-")) {
    const updated = sessions.map((session) =>
      session.id === sessionId ? { ...session, date: agendaDate, startTime, endTime } : session,
    );
    unwrap(
      await supabase
        .from("executions")
        .update({
          agenda_sessions: updated,
          agenda_date: agendaDate,
          start_time: startTime,
          end_time: endTime,
        })
        .eq("id", id)
        .select()
        .single(),
    );
  } else {
    unwrap(
      await supabase
        .from("executions")
        .update({ agenda_date: agendaDate, start_time: startTime, end_time: endTime })
        .eq("id", id)
        .select()
        .single(),
    );
  }
  await invalidate();
}

/** Remove apenas a sessão tocada da Agenda. A ação do planejamento continua
 * existindo e pode ser agendada novamente. */
export async function removeAgendaSession(id: string, sessionId?: string): Promise<void> {
  const row = await fetchExecutionRow(id);
  const sessions = Array.isArray(row.agenda_sessions)
    ? (row.agenda_sessions as AgendaSession[])
    : [];

  if (sessions.length > 0 && sessionId && !sessionId.startsWith("legacy-")) {
    const remaining = sessions.filter((session) => session.id !== sessionId);
    const fallback = remaining.at(-1);
    unwrap(
      await supabase
        .from("executions")
        .update({
          agenda_sessions: remaining,
          agenda_date: fallback?.date ?? null,
          start_time: fallback?.startTime ?? null,
          end_time: fallback?.endTime ?? null,
        })
        .eq("id", id)
        .select()
        .single(),
    );
  } else {
    unwrap(
      await supabase
        .from("executions")
        .update({ agenda_date: null, start_time: null, end_time: null })
        .eq("id", id)
        .select()
        .single(),
    );
  }
  await invalidate();
}

/** Move/redimensiona uma ação no Cronograma — atualiza a MESMA linha, nunca
 * mexe em dueDate/agendaDate/startTime/endTime (três conceitos de tempo
 * independentes). Usado no `pointerup` do arrasto, nunca a cada pixel. */
export async function setPlannedRange(
  id: string,
  plannedStartDate: string,
  plannedEndDate: string,
): Promise<void> {
  unwrap(
    await supabase
      .from("executions")
      .update({
        planned_start_date: plannedStartDate,
        planned_end_date: plannedEndDate,
        due_date: plannedEndDate,
      })
      .eq("id", id)
      .select()
      .single(),
  );
  await invalidate();
}

/** Estender o cronograma além do prazo é uma decisão explícita do usuário. */
export async function updateGoalDeadline(goalId: string, deadlineISO: string): Promise<void> {
  unwrap(
    await supabase
      .from("goals")
      .update({ deadline_date: deadlineISO })
      .eq("id", goalId)
      .select()
      .single(),
  );
  await invalidate();
}

async function fetchExecutionRow(id: string): Promise<Row> {
  return unwrap(await supabase.from("executions").select("*").eq("id", id).single());
}

async function pushHistory(
  executionId: string,
  from: ExecutionStatus,
  to: ExecutionStatus,
  note?: string,
) {
  const userId = await ensureSession();
  await supabase
    .from("execution_history")
    .insert({ user_id: userId, execution_id: executionId, from_status: from, to_status: to, note });
  unwrap(
    await supabase
      .from("executions")
      .update({ status: to })
      .eq("id", executionId)
      .select()
      .single(),
  );
}

export async function completeExecution(id: string) {
  const row = await fetchExecutionRow(id);
  if (row.status === "concluida") return;
  await pushHistory(id, row.status as ExecutionStatus, "concluida");
  await invalidate();
}

/** Alterna feita/não-feita — usado no checkbox rápido do dia (permite desmarcar por engano). */
export async function toggleExecutionDone(id: string) {
  const row = await fetchExecutionRow(id);
  if (row.status === "concluida") await pushHistory(id, "concluida", "planejada", "desmarcado");
  else await pushHistory(id, row.status as ExecutionStatus, "concluida");
  await invalidate();
}

export async function patchExecution(
  id: string,
  patch: Partial<Pick<Execution, "how" | "why" | "weight" | "title" | "rigid" | "dueDate">>,
) {
  const dbPatch: Row = {};
  if (patch.how !== undefined) dbPatch.how = patch.how;
  if (patch.why !== undefined) dbPatch.why = patch.why;
  if (patch.weight !== undefined) dbPatch.weight = patch.weight;
  if (patch.title !== undefined) dbPatch.title = patch.title;
  if (patch.rigid !== undefined) dbPatch.rigid = patch.rigid;
  if (patch.dueDate !== undefined) dbPatch.due_date = patch.dueDate;
  unwrap(await supabase.from("executions").update(dbPatch).eq("id", id).select().single());
  await invalidate();
}

/** Exclusão real (não soft-delete) — diferente de `cancelExecution` (que preserva
 * histórico como "cancelada"). Usada só quando o usuário confirma explicitamente
 * que quer apagar o registro, não só descartá-lo. `execution_history` cai junto
 * (FK on delete cascade), sem deixar rastro órfão. */
export async function removeExecution(id: string) {
  await supabase.from("executions").delete().eq("id", id);
  await invalidate();
}

export async function markMissed(id: string, note?: string) {
  const row = await fetchExecutionRow(id);
  if (row.status !== "planejada") return;
  await pushHistory(id, "planejada", "perdida", note);
  await invalidate();
}

export async function cancelExecution(id: string, note?: string) {
  const row = await fetchExecutionRow(id);
  await pushHistory(id, row.status as ExecutionStatus, "cancelada", note);
  await invalidate();
}

/** Move uma execução JÁ agendada pra outro dia/hora — clona e marca a original como
 * "reagendada", preservando o histórico (o prazo do clone continua igual ao original). */
export async function rescheduleExecution(
  id: string,
  newAgendaDate: string,
  newStartTime: string,
  newEndTime?: string,
  note?: string,
  opts?: { rigid?: boolean },
): Promise<string> {
  const userId = await ensureSession();
  const originalRow = await fetchExecutionRow(id);
  const clone = unwrap<{ id: string }>(
    await supabase
      .from("executions")
      .insert({
        user_id: userId,
        title: originalRow.title,
        due_date: originalRow.due_date,
        agenda_date: newAgendaDate,
        start_time: newStartTime,
        end_time: newEndTime,
        category: originalRow.category,
        location: originalRow.location,
        rigid: opts?.rigid ?? originalRow.rigid,
        weight: originalRow.weight,
        how: originalRow.how,
        why: originalRow.why,
        status: "planejada",
        goal_id: originalRow.goal_id,
        step_id: originalRow.step_id,
        rescheduled_from_id: id,
        routine_id: originalRow.routine_id,
      })
      .select()
      .single(),
  );
  await pushHistory(id, originalRow.status as ExecutionStatus, "reagendada", note);
  await invalidate();
  return clone.id as string;
}

export function suggestRedistributionDate(allExecutions: Execution[]): string {
  let best = addDays(nowDate(), 1);
  let bestLoad = Infinity;
  for (let i = 1; i <= 3; i++) {
    const d = addDays(nowDate(), i);
    const load = plannedHoursForDate(allExecutions, toISODate(d));
    if (load < bestLoad) {
      bestLoad = load;
      best = d;
    }
  }
  return toISODate(best);
}

export async function redistributeExecution(
  id: string,
  allExecutions: Execution[],
): Promise<string> {
  const date = suggestRedistributionDate(allExecutions);
  const userId = await ensureSession();
  const originalRow = await fetchExecutionRow(id);
  const clone = unwrap<{ id: string }>(
    await supabase
      .from("executions")
      .insert({
        user_id: userId,
        title: originalRow.title,
        due_date: originalRow.due_date,
        agenda_date: date,
        start_time: (originalRow.start_time as string | null) ?? "09:00",
        end_time: originalRow.end_time,
        category: originalRow.category,
        location: originalRow.location,
        rigid: originalRow.rigid,
        weight: originalRow.weight,
        how: originalRow.how,
        why: originalRow.why,
        status: "planejada",
        goal_id: originalRow.goal_id,
        step_id: originalRow.step_id,
        rescheduled_from_id: id,
        routine_id: originalRow.routine_id,
      })
      .select()
      .single(),
  );
  await pushHistory(
    id,
    originalRow.status as ExecutionStatus,
    "reagendada",
    "redistribuído automaticamente",
  );
  await invalidate();
  return clone.id as string;
}

export async function linkExecutionToGoal(executionId: string, goalId: string | null) {
  unwrap(
    await supabase
      .from("executions")
      .update({ goal_id: goalId, step_id: goalId ? undefined : null })
      .eq("id", executionId)
      .select()
      .single(),
  );
  await invalidate();
}

/** Registro manual rápido: cria e já conclui uma execução hoje, contando como avanço do objetivo. */
export async function logExecution(goalId: string, note?: string): Promise<string> {
  const userId = await ensureSession();
  const { data: goal } = await supabase.from("goals").select("category").eq("id", goalId).single();
  const row = unwrap<{ id: string }>(
    await supabase
      .from("executions")
      .insert({
        user_id: userId,
        title: note?.trim() || "Registro manual",
        due_date: todayISO(),
        agenda_date: todayISO(),
        start_time: nowHM(),
        category: goal?.category ?? "generico",
        rigid: false,
        weight: "leve",
        status: "concluida",
        goal_id: goalId,
      })
      .select()
      .single(),
  );
  await supabase.from("execution_history").insert({
    user_id: userId,
    execution_id: row.id,
    from_status: "planejada",
    to_status: "concluida",
    note: "registro manual",
  });
  await invalidate();
  return row.id as string;
}

// ---------------------------------------------------------------------------
// Rotinas — configurar um horário recorrente numa sub-agenda gera execuções
// reais na agenda, pelas próximas semanas.
// ---------------------------------------------------------------------------
const ROUTINE_WEEKS_AHEAD = 4;

async function materializeRoutineExecutions(routine: {
  id: string;
  category: string;
  title: string;
  weekday: number;
  time: string;
  weight: TaskWeight;
}) {
  const userId = await ensureSession();
  const { data: existing } = await supabase
    .from("executions")
    .select("agenda_date")
    .eq("routine_id", routine.id);
  const already = new Set((existing ?? []).map((e) => e.agenda_date as string));
  const today = nowDate();
  const toInsert: Row[] = [];
  for (let i = 0; i < ROUTINE_WEEKS_AHEAD * 7; i++) {
    const d = addDays(today, i);
    if (d.getDay() !== routine.weekday) continue;
    const date = toISODate(d);
    if (already.has(date)) continue;
    toInsert.push({
      user_id: userId,
      title: routine.title,
      due_date: date,
      agenda_date: date,
      start_time: routine.time,
      category: routine.category,
      rigid: false,
      weight: routine.weight,
      status: "planejada",
      routine_id: routine.id,
    });
  }
  if (toInsert.length > 0) unwrap(await supabase.from("executions").insert(toInsert));
}

export async function createRoutine(input: {
  category: string;
  title: string;
  weekday: number;
  time: string;
  weight?: TaskWeight;
}): Promise<string> {
  const userId = await ensureSession();
  const routine = unwrap<{
    id: string;
    category: string;
    title: string;
    weekday: number;
    time: string;
    weight: TaskWeight;
    active: boolean;
  }>(
    await supabase
      .from("routines")
      .insert({
        user_id: userId,
        category: input.category,
        title: input.title,
        weekday: input.weekday,
        time: input.time,
        weight: input.weight ?? "leve",
      })
      .select()
      .single(),
  );
  await materializeRoutineExecutions({
    id: routine.id as string,
    category: input.category,
    title: input.title,
    weekday: input.weekday,
    time: input.time,
    weight: input.weight ?? "leve",
  });
  await invalidate();
  return routine.id as string;
}

export async function toggleRoutineActive(routineId: string, currentlyActive: boolean) {
  const nowActive = !currentlyActive;
  const routine = unwrap<{
    id: string;
    category: string;
    title: string;
    weekday: number;
    time: string;
    weight: TaskWeight;
    active: boolean;
  }>(
    await supabase
      .from("routines")
      .update({ active: nowActive })
      .eq("id", routineId)
      .select()
      .single(),
  );
  if (nowActive) {
    await materializeRoutineExecutions({
      id: routine.id as string,
      category: routine.category as string,
      title: routine.title as string,
      weekday: routine.weekday as number,
      time: routine.time as string,
      weight: routine.weight as TaskWeight,
    });
  }
  await invalidate();
}

export async function removeRoutine(routineId: string) {
  const userId = await ensureSession();
  const { data: planned } = await supabase
    .from("executions")
    .select("id, status")
    .eq("routine_id", routineId)
    .eq("status", "planejada");
  for (const e of planned ?? []) {
    await supabase.from("execution_history").insert({
      user_id: userId,
      execution_id: e.id,
      from_status: "planejada",
      to_status: "cancelada",
      note: "rotina removida",
    });
    await supabase.from("executions").update({ status: "cancelada" }).eq("id", e.id);
  }
  await supabase.from("routines").delete().eq("id", routineId);
  await invalidate();
}
