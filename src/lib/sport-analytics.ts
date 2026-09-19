import type { Execution } from "./goals-store";
import {
  activitiesForModality,
  computePaceSPerKm,
  computeSpeedKmh,
  mondayOfWeek,
  type SportActivity,
  type SportModality,
  type SportWeeklyGoal,
} from "./sport-store";

// ---------------------------------------------------------------------------
// Análise da Visão geral de Esportes — funções puras, sem I/O.
//
// Três regras que atravessam o arquivo:
//
// 1. Ritmo semanal é PONDERADO: tempo ativo total dividido pela distância
//    total. A média das médias mentiria — uma corrida de 1 km pesaria igual a
//    uma de 15 km.
// 2. Atividade sem distância não entra na conta de ritmo. Um registro manual
//    de "30 min" sem km não torna a semana inteira mais lenta; ele só não
//    responde à pergunta "qual foi meu ritmo".
// 3. Semana sem registro continua na série, com valores nulos. Pular a semana
//    vazia transformaria uma pausa em constância.
// ---------------------------------------------------------------------------

export type WeeklyMetrics = {
  weekStartIso: string;
  weekEndIso: string;
  isCurrent: boolean;
  /** Atividades concluídas na semana. */
  sessions: number;
  distanceM: number;
  activeDurationS: number;
  /** Ponderado pela distância; nulo quando não há distância registrada. */
  paceSPerKm: number | null;
  speedKmh: number | null;
  /** Datas (YYYY-MM-DD) das atividades, em ordem. */
  dates: string[];
};

const pad = (n: number) => String(n).padStart(2, "0");
const isoOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export function weekEndOf(weekStartIso: string): string {
  const d = new Date(weekStartIso + "T00:00:00");
  d.setDate(d.getDate() + 6);
  return isoOf(d);
}

/**
 * Métricas por semana, das mais antigas para as mais recentes. A última
 * posição é sempre a semana de `todayIso`.
 *
 * Um único percurso pela lista alimenta ritmo, frequência e volume — as três
 * faces do carrossel leem a MESMA série, então não há como discordarem entre
 * si.
 */
export function weeklyMetricsSeries(
  activities: SportActivity[],
  modality: SportModality,
  weeks: number,
  todayIso: string,
): WeeklyMetrics[] {
  const list = activitiesForModality(activities, modality);
  const currentWeekStart = mondayOfWeek(todayIso);
  const series: WeeklyMetrics[] = [];

  for (let i = weeks - 1; i >= 0; i--) {
    const ref = new Date(todayIso + "T00:00:00");
    ref.setDate(ref.getDate() - i * 7);
    const weekStart = mondayOfWeek(isoOf(ref));
    const weekEnd = weekEndOf(weekStart);

    const inWeek = list
      .filter((a) => {
        const d = a.startedAt.slice(0, 10);
        return d >= weekStart && d <= weekEnd;
      })
      .sort((a, b) => a.startedAt.localeCompare(b.startedAt));

    // Ritmo e velocidade só olham o que TEM distância — ver regra 2.
    const withDistance = inWeek.filter((a) => a.distanceM > 0);
    const distanceM = inWeek.reduce((s, a) => s + a.distanceM, 0);
    const pacedDistanceM = withDistance.reduce((s, a) => s + a.distanceM, 0);
    const pacedDurationS = withDistance.reduce((s, a) => s + a.activeDurationS, 0);

    series.push({
      weekStartIso: weekStart,
      weekEndIso: weekEnd,
      isCurrent: weekStart === currentWeekStart,
      sessions: inWeek.length,
      distanceM,
      activeDurationS: inWeek.reduce((s, a) => s + a.activeDurationS, 0),
      paceSPerKm: computePaceSPerKm(pacedDistanceM, pacedDurationS),
      speedKmh: pacedDurationS > 0 ? computeSpeedKmh(pacedDistanceM, pacedDurationS) : null,
      dates: inWeek.map((a) => a.startedAt.slice(0, 10)),
    });
  }
  return series;
}

// ---------------------------------------------------------------------------
// Consistência da semana
// ---------------------------------------------------------------------------

export type WeekConsistency = {
  /** Atividades JÁ CONCLUÍDAS nesta semana. Planejada não conta. */
  done: number;
  /** Só quando existe meta configurada — sem meta não existe denominador. */
  target?: number;
  distanceM: number;
};

export function weekConsistency(
  activities: SportActivity[],
  goal: SportWeeklyGoal | undefined,
  modality: SportModality,
  todayIso: string,
): WeekConsistency {
  const weekStart = mondayOfWeek(todayIso);
  const weekEnd = weekEndOf(weekStart);
  const inWeek = activitiesForModality(activities, modality).filter((a) => {
    const d = a.startedAt.slice(0, 10);
    return d >= weekStart && d <= weekEnd;
  });
  return {
    done: inWeek.length,
    target: goal?.targetSessions,
    distanceM: inWeek.reduce((s, a) => s + a.distanceM, 0),
  };
}

// ---------------------------------------------------------------------------
// Próxima atividade planejada
// ---------------------------------------------------------------------------

export type PlannedSportActivity = {
  execution: Execution;
  dateIso: string;
  startTime?: string;
  /** Verdadeiro quando é hoje — muda o rótulo para "Hoje". */
  isToday: boolean;
};

/**
 * A primeira execução de esportes ainda não concluída, de hoje em diante.
 *
 * "Ainda não concluída" exclui concluída, perdida, cancelada e reagendada:
 * uma execução reagendada foi substituída por outra, e anunciá-la como "sua
 * próxima corrida" apontaria para uma data que não vale mais.
 */
export function nextPlannedSportActivity(
  executions: Execution[],
  modality: SportModality,
  todayIso: string,
): PlannedSportActivity | null {
  const candidates = executions
    .filter(
      (e) =>
        e.category === "esportes" &&
        e.sportModality === modality &&
        e.status === "planejada" &&
        (e.agendaDate ?? e.dueDate) >= todayIso,
    )
    .map((e) => ({
      execution: e,
      dateIso: (e.agendaDate ?? e.dueDate) as string,
      startTime: e.startTime,
      isToday: (e.agendaDate ?? e.dueDate) === todayIso,
    }))
    .sort(
      (a, b) =>
        a.dateIso.localeCompare(b.dateIso) ||
        (a.startTime ?? "99:99").localeCompare(b.startTime ?? "99:99"),
    );
  return candidates[0] ?? null;
}

/** Objetivo do treino planejado em uma linha, ou null quando não há. */
export function plannedTargetLabel(execution: Execution): string | null {
  if (execution.sportTargetDistanceM) {
    return `${(execution.sportTargetDistanceM / 1000).toFixed(1).replace(".0", "")} km`;
  }
  if (execution.sportTargetDurationS) {
    const min = Math.round(execution.sportTargetDurationS / 60);
    return `${min} min`;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Faces do carrossel
// ---------------------------------------------------------------------------

export type MetricFace = "ritmo" | "frequencia" | "volume";

export const METRIC_FACES: MetricFace[] = ["ritmo", "frequencia", "volume"];

/** Ciclismo mede velocidade; correr e caminhar medem ritmo. É a mesma face,
 * com o nome certo para cada modalidade. */
export function paceFaceLabel(modality: SportModality): string {
  return modality === "ciclismo" ? "Velocidade média" : "Ritmo médio";
}

export function metricFaceLabel(face: MetricFace, modality: SportModality): string {
  if (face === "ritmo") return paceFaceLabel(modality);
  return face === "frequencia" ? "Frequência" : "Volume";
}

/** Próxima face na rotação, com volta ao início nos dois sentidos. */
export function rotateFace(current: MetricFace, direction: 1 | -1): MetricFace {
  const i = METRIC_FACES.indexOf(current);
  const next = (i + direction + METRIC_FACES.length) % METRIC_FACES.length;
  return METRIC_FACES[next];
}

export type FaceDataState = "ok" | "sem_atividades" | "dados_insuficientes";

/**
 * O que a face tem para mostrar.
 *
 * Um único ponto não desenha evolução — a tela mostra o valor e diz que falta
 * histórico, em vez de traçar uma linha reta que sugeriria tendência.
 */
export function faceDataState(series: WeeklyMetrics[], face: MetricFace): FaceDataState {
  const filled = series.filter((w) =>
    face === "ritmo" ? w.paceSPerKm !== null : face === "volume" ? w.distanceM > 0 : w.sessions > 0,
  );
  if (filled.length === 0) return "sem_atividades";
  if (filled.length === 1) return "dados_insuficientes";
  return "ok";
}

/** Variação entre a última semana com dado e a anterior com dado. Nulo quando
 * não há duas semanas comparáveis. */
export function paceDelta(series: WeeklyMetrics[]): number | null {
  const filled = series.filter((w) => w.paceSPerKm !== null);
  if (filled.length < 2) return null;
  return filled.at(-1)!.paceSPerKm! - filled.at(-2)!.paceSPerKm!;
}

/** "12s mais rápido" / "8s mais lento" — sempre dizendo o sentido, porque no
 * ritmo o número menor é o melhor e isso se lê ao contrário. */
export function formatPaceDelta(deltaSPerKm: number | null): string | null {
  if (deltaSPerKm === null) return null;
  const abs = Math.round(Math.abs(deltaSPerKm));
  if (abs === 0) return "mesmo ritmo";
  return `${abs}s ${deltaSPerKm < 0 ? "mais rápido" : "mais lento"}`;
}

// ---------------------------------------------------------------------------
// Histórico por semana e por dia
// ---------------------------------------------------------------------------

export function addDaysIso(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + days);
  return isoOf(d);
}

/** Atividades da semana que começa em `weekStartIso`, mais recentes primeiro. */
export function activitiesInWeek(
  activities: SportActivity[],
  modality: SportModality,
  weekStartIso: string,
): SportActivity[] {
  const weekEnd = weekEndOf(weekStartIso);
  return activitiesForModality(activities, modality)
    .filter((a) => {
      const d = a.startedAt.slice(0, 10);
      return d >= weekStartIso && d <= weekEnd;
    })
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

/** Filtra por um dia da semana (0 = domingo, igual ao resto do Norte). */
export function activitiesOnWeekday(
  weekActivities: SportActivity[],
  weekStartIso: string,
  weekday: number,
): SportActivity[] {
  // A semana começa na segunda; domingo é o sétimo dia.
  const offset = weekday === 0 ? 6 : weekday - 1;
  const target = addDaysIso(weekStartIso, offset);
  return weekActivities.filter((a) => a.startedAt.slice(0, 10) === target);
}

/** Quais dias da semana têm atividade — usado para o ponto discreto no
 * seletor, sem precisar recalcular por dia na renderização. */
export function weekdaysWithActivity(
  weekActivities: SportActivity[],
  weekStartIso: string,
): Set<number> {
  const out = new Set<number>();
  for (const a of weekActivities) {
    const days = Math.round(
      (new Date(a.startedAt.slice(0, 10) + "T00:00:00").getTime() -
        new Date(weekStartIso + "T00:00:00").getTime()) /
        86_400_000,
    );
    if (days >= 0 && days <= 6) out.add((days + 1) % 7);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Rotas salvas
// ---------------------------------------------------------------------------

export type RouteRun = {
  activityId: string;
  dateIso: string;
  startedAt: string;
  activeDurationS: number;
  distanceM: number;
  paceSPerKm: number | null;
};

export type RouteStats = {
  runs: RouteRun[];
  /** Quantas vezes a rota foi de fato percorrida. */
  count: number;
  last: RouteRun | null;
  /** Menor tempo ativo entre as tentativas. */
  best: RouteRun | null;
  bestPaceSPerKm: number | null;
};

/**
 * Consolida as tentativas de uma rota.
 *
 * Só entram atividades que existem: uma tentativa cuja atividade foi apagada
 * não vira uma linha fantasma na lista nem conta para os recordes.
 */
export function routeStats(
  routeId: string,
  attempts: { routeId: string; activityId: string }[],
  activities: SportActivity[],
): RouteStats {
  const byId = new Map(activities.map((a) => [a.id, a]));
  const runs: RouteRun[] = attempts
    .filter((t) => t.routeId === routeId)
    .map((t) => byId.get(t.activityId))
    .filter((a): a is SportActivity => !!a)
    .map((a) => ({
      activityId: a.id,
      dateIso: a.startedAt.slice(0, 10),
      startedAt: a.startedAt,
      activeDurationS: a.activeDurationS,
      distanceM: a.distanceM,
      paceSPerKm: a.avgPaceSPerKm ?? computePaceSPerKm(a.distanceM, a.activeDurationS),
    }))
    .sort((a, b) => a.startedAt.localeCompare(b.startedAt));

  // Recorde só entre tentativas com tempo registrado — um zero não é o melhor
  // tempo de ninguém.
  const timed = runs.filter((r) => r.activeDurationS > 0);
  const paced = runs.filter((r) => r.paceSPerKm !== null && r.paceSPerKm > 0);

  return {
    runs,
    count: runs.length,
    last: runs.at(-1) ?? null,
    best: timed.length
      ? timed.reduce((min, r) => (r.activeDurationS < min.activeDurationS ? r : min))
      : null,
    bestPaceSPerKm: paced.length ? Math.min(...paced.map((r) => r.paceSPerKm!)) : null,
  };
}
