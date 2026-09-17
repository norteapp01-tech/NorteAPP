import { addDays, daysBetweenISO, toISODate, todayISO } from "./goals-store";
import type {
  Exercise,
  MuscleGroup,
  ExerciseEquipment,
  SetLog,
  WorkoutPlan,
  WorkoutSession,
} from "./workout-store";

// ---------------------------------------------------------------------------
// Cálculos da Evolução da Academia.
//
// Tudo aqui é função pura sobre os registros: indicadores, listas e gráficos
// partem do MESMO conjunto filtrado, então o número do topo e o ponto do
// gráfico nunca podem discordar.
//
// Regras que atravessam o arquivo inteiro:
// - Só sessão concluída conta. Sessão em andamento não é treino realizado.
// - Carga só se compara com o MESMO número de repetições. 30kg×5 e 30kg×12 não
//   são resultados equivalentes.
// - Trocar de equipamento quebra a comparação: 40kg na barra e 40kg por halter
//   não são a mesma carga.
// - Nada é estimado. Sem registro, a resposta é "não há dado", não uma curva
//   desenhada por interpolação.
// ---------------------------------------------------------------------------

export const muscleGroupLabel: Record<MuscleGroup, string> = {
  peito: "Peito",
  costas: "Costas",
  ombros: "Ombros",
  biceps: "Bíceps",
  triceps: "Tríceps",
  antebraco: "Antebraço",
  quadriceps: "Quadríceps",
  posteriores: "Posteriores",
  gluteos: "Glúteos",
  panturrilhas: "Panturrilhas",
  abdomen: "Abdômen",
  corpo_inteiro: "Corpo inteiro",
  cardio: "Cardio",
};

export const equipmentLabel: Record<ExerciseEquipment, string> = {
  barra: "Barra",
  halteres: "Halteres",
  maquina: "Máquina",
  cabo: "Cabo",
  peso_corporal: "Peso corporal",
  assistido: "Assistido",
  kettlebell: "Kettlebell",
  elastico: "Elástico",
  outro: "Outro",
};

/** Exercícios sem carga externa comparável ficam fora do ranking de kg: subir
 * de "assistido -30kg" para "-20kg" é progresso, mas não é aumento de carga. */
const EQUIPMENT_WITHOUT_EXTERNAL_LOAD: ExerciseEquipment[] = ["peso_corporal", "assistido"];

export const UNCLASSIFIED = "nao_classificado";

/** Grupo muscular escolhido no filtro — inclui o balde honesto dos exercícios
 * sem classificação. */
export type MuscleGroupFilter = MuscleGroup | typeof UNCLASSIFIED;

// ---------------------------------------------------------------------------
// Período
// ---------------------------------------------------------------------------

export type DateRange = { from: string; to: string };

export function rangeOfLastDays(days: number, today = todayISO()): DateRange {
  return { from: toISODate(addDays(new Date(today + "T00:00:00"), -(days - 1))), to: today };
}

export function rangeLengthDays(range: DateRange): number {
  return daysBetweenISO(range.from, range.to) + 1;
}

/** Intervalo imediatamente anterior, de mesma duração — a única comparação
 * honesta: "os 30 dias antes destes 30". */
export function previousRange(range: DateRange): DateRange {
  const length = rangeLengthDays(range);
  const to = toISODate(addDays(new Date(range.from + "T00:00:00"), -1));
  return { from: toISODate(addDays(new Date(to + "T00:00:00"), -(length - 1))), to };
}

/** Recorta um período pelo escopo da etapa. Escolher uma etapa e depois mudar o
 * período não pode fazer o painel mostrar dias que não pertencem a ela. */
export function clampToScope(range: DateRange, scope?: DateRange): DateRange {
  if (!scope) return range;
  return {
    from: range.from > scope.from ? range.from : scope.from,
    to: range.to < scope.to ? range.to : scope.to,
  };
}

// ---------------------------------------------------------------------------
// Identidade de um exercício dentro dos registros
// ---------------------------------------------------------------------------

/** O que a Evolução precisa saber de cada série registrada. Resolvido uma vez,
 * a partir do retrato da sessão (quando existe) ou da ficha viva. */
export type ResolvedSet = {
  sessionId: string;
  date: string;
  planLineageId?: string;
  planLabel: string;
  exerciseId: string;
  lineageId: string;
  name: string;
  muscleGroup: MuscleGroup | null;
  equipment: ExerciseEquipment | null;
  weight: number;
  reps: number;
  setIndex: number;
};

/** Chave de comparabilidade: mesma linhagem E mesmo equipamento. Trocar de
 * aparelho cria outra série histórica em vez de um degrau falso na mesma. */
export function comparabilityKey(lineageId: string, equipment: ExerciseEquipment | null): string {
  return `${lineageId}::${equipment ?? "indef"}`;
}

/**
 * Achata as sessões concluídas em séries resolvidas.
 *
 * A classificação vem do RETRATO da sessão quando ele a tem — é o que impede
 * que reclassificar a ficha hoje reescreva a distribuição de meses atrás.
 * Sessões gravadas antes de a classificação existir não têm essa informação em
 * lugar nenhum; para elas, e só para elas, a ficha atual é a melhor evidência
 * disponível, e a interface diz isso.
 */
export function resolveSets(
  sessions: WorkoutSession[],
  exercises: Exercise[],
  plans: WorkoutPlan[],
): ResolvedSet[] {
  const byId = new Map(exercises.map((e) => [e.id, e]));
  const out: ResolvedSet[] = [];
  for (const session of sessions) {
    if (session.status !== "concluido") continue;
    const snapshot = new Map((session.plannedSnapshot ?? []).map((p) => [p.exerciseId, p]));
    const plan = plans.find((p) => p.id === session.planId);
    const planLabel = session.planLabel ?? (plan ? `${plan.letter} · ${plan.name}` : "Treino");
    for (const log of session.exerciseLogs) {
      if (!log.exerciseId || log.sets.length === 0) continue;
      const snap = snapshot.get(log.exerciseId);
      const live = byId.get(log.exerciseId);
      const lineageId = snap?.lineageId ?? live?.lineageId ?? log.exerciseId;
      const name = snap?.name ?? live?.name ?? "Exercício";
      const muscleGroup = snap?.muscleGroup ?? live?.muscleGroup ?? null;
      const equipment = snap?.equipment ?? live?.equipment ?? null;
      for (const set of log.sets) {
        out.push({
          sessionId: session.id,
          date: session.date,
          planLineageId: session.planLineageId,
          planLabel,
          exerciseId: log.exerciseId,
          lineageId,
          name,
          muscleGroup,
          equipment,
          weight: set.weight,
          reps: set.reps,
          setIndex: set.setIndex,
        });
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Filtros
// ---------------------------------------------------------------------------

export type EvolutionFilters = {
  range: DateRange;
  /** Escopo da etapa selecionada — limita as datas, nunca é ampliado. */
  scope?: DateRange;
  /** Linhagens dos treinos da etapa/planejamento escolhido. */
  planLineageIds?: string[];
  muscleGroup?: MuscleGroupFilter;
  exerciseLineageId?: string;
};

export type FilteredData = {
  effectiveRange: DateRange;
  sessions: WorkoutSession[];
  sets: ResolvedSet[];
};

/** Conjunto único do qual TUDO parte. Indicadores, gráficos e listas leem
 * daqui, então não há como a lista discordar do número do topo. */
export function applyFilters(
  allSessions: WorkoutSession[],
  exercises: Exercise[],
  plans: WorkoutPlan[],
  filters: EvolutionFilters,
): FilteredData {
  const effectiveRange = clampToScope(filters.range, filters.scope);
  const inRange = allSessions.filter(
    (s) => s.status === "concluido" && s.date >= effectiveRange.from && s.date <= effectiveRange.to,
  );
  const byPlan = filters.planLineageIds?.length
    ? inRange.filter((s) => s.planLineageId && filters.planLineageIds!.includes(s.planLineageId))
    : inRange;

  let sets = resolveSets(byPlan, exercises, plans);
  if (filters.muscleGroup) {
    sets = sets.filter((s) =>
      filters.muscleGroup === UNCLASSIFIED
        ? s.muscleGroup === null
        : s.muscleGroup === filters.muscleGroup,
    );
  }
  if (filters.exerciseLineageId) {
    sets = sets.filter((s) => s.lineageId === filters.exerciseLineageId);
  }

  // Um filtro de exercício ou músculo não remove a sessão da contagem de
  // treinos — ela aconteceu. Só a lista de séries é recortada.
  const sessionIds = new Set(sets.map((s) => s.sessionId));
  const sessions =
    filters.muscleGroup || filters.exerciseLineageId
      ? byPlan.filter((s) => sessionIds.has(s.id))
      : byPlan;

  return { effectiveRange, sessions, sets };
}

// ---------------------------------------------------------------------------
// Indicadores
// ---------------------------------------------------------------------------

export type Indicator = {
  key: "treinos" | "dias" | "series";
  label: string;
  value: number;
  /** Diferença em QUANTIDADE, não em porcentagem: sair de 0 para 3 não é
   * "+300%", e sair de 3 para 0 não é "queda de 100%". */
  delta?: number;
  comparison?: DateRange;
  comparisonUnavailableReason?: string;
};

export function indicators(
  current: FilteredData,
  previous: FilteredData | null,
  reason?: string,
): Indicator[] {
  const count = (data: FilteredData) => ({
    treinos: data.sessions.length,
    dias: new Set(data.sessions.map((s) => s.date)).size,
    series: data.sets.length,
  });
  const now = count(current);
  const before = previous ? count(previous) : null;

  return (
    [
      { key: "treinos", label: "Treinos realizados" },
      { key: "dias", label: "Dias treinados" },
      { key: "series", label: "Séries registradas" },
    ] as const
  ).map(({ key, label }) => ({
    key,
    label,
    value: now[key],
    delta: before ? now[key] - before[key] : undefined,
    comparison: previous?.effectiveRange,
    comparisonUnavailableReason: previous ? undefined : (reason ?? "Sem comparação disponível"),
  }));
}

// ---------------------------------------------------------------------------
// Progressão de carga
// ---------------------------------------------------------------------------

export const MIN_SESSIONS_FOR_PROGRESSION = 3;

export type LoadProgression = {
  lineageId: string;
  name: string;
  equipment: ExerciseEquipment | null;
  reps: number;
  firstWeight: number;
  lastWeight: number;
  firstDate: string;
  lastDate: string;
  deltaKg: number;
  /** Só quando a base é maior que zero — variação relativa de carga
   * registrada, nada além disso. */
  deltaPct?: number;
  sessionCount: number;
};

/** Melhor carga por sessão, numa referência exata de repetições. */
function bestPerSession(
  sets: ResolvedSet[],
  reps: number,
): { date: string; sessionId: string; weight: number }[] {
  const best = new Map<string, { date: string; sessionId: string; weight: number }>();
  for (const set of sets) {
    if (set.reps !== reps) continue;
    const found = best.get(set.sessionId);
    if (!found || set.weight > found.weight) {
      best.set(set.sessionId, { date: set.date, sessionId: set.sessionId, weight: set.weight });
    }
  }
  return [...best.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Maiores progressões de carga do período.
 *
 * Critério, propositalmente estreito — um ranking permissivo enganaria:
 * mesmo exercício e mesmo equipamento, séries com o MESMO número de
 * repetições, pelo menos 3 sessões com registro comparável. Compara a melhor
 * carga da primeira sessão elegível com a da última.
 */
export function loadProgressions(sets: ResolvedSet[], limit = 3): LoadProgression[] {
  const groups = new Map<string, ResolvedSet[]>();
  for (const set of sets) {
    if (set.equipment && EQUIPMENT_WITHOUT_EXTERNAL_LOAD.includes(set.equipment)) continue;
    if (set.weight <= 0) continue;
    const key = comparabilityKey(set.lineageId, set.equipment);
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(set);
  }

  const out: LoadProgression[] = [];
  for (const group of groups.values()) {
    // Dentro do grupo, a referência é o número de repetições mais presente
    // entre as sessões — é onde há mais evidência para comparar.
    const repCounts = new Map<number, Set<string>>();
    for (const set of group) {
      if (!repCounts.has(set.reps)) repCounts.set(set.reps, new Set());
      repCounts.get(set.reps)!.add(set.sessionId);
    }
    let bestReps: number | null = null;
    let bestSessions = 0;
    for (const [reps, sessionIds] of repCounts) {
      if (sessionIds.size > bestSessions) {
        bestSessions = sessionIds.size;
        bestReps = reps;
      }
    }
    if (bestReps === null || bestSessions < MIN_SESSIONS_FOR_PROGRESSION) continue;

    const points = bestPerSession(group, bestReps);
    if (points.length < MIN_SESSIONS_FOR_PROGRESSION) continue;
    const first = points[0];
    const last = points.at(-1)!;
    const deltaKg = Math.round((last.weight - first.weight) * 100) / 100;
    if (deltaKg <= 0) continue;

    out.push({
      lineageId: group[0].lineageId,
      name: group[0].name,
      equipment: group[0].equipment,
      reps: bestReps,
      firstWeight: first.weight,
      lastWeight: last.weight,
      firstDate: first.date,
      lastDate: last.date,
      deltaKg,
      deltaPct: first.weight > 0 ? Math.round((deltaKg / first.weight) * 1000) / 10 : undefined,
      sessionCount: points.length,
    });
  }

  return out
    .sort((a, b) => (b.deltaPct ?? 0) - (a.deltaPct ?? 0) || b.deltaKg - a.deltaKg)
    .slice(0, limit);
}

// ---------------------------------------------------------------------------
// Série do gráfico
// ---------------------------------------------------------------------------

export type ChartMode = "carga" | "repeticoes";

export type ChartPoint = {
  sessionId: string;
  date: string;
  value: number;
  planLabel: string;
};

/**
 * Pontos do gráfico de um exercício. Cada ponto é UMA sessão elegível —
 * duas sessões no mesmo dia continuam sendo dois pontos.
 *
 * Modo "carga": melhor carga com exatamente N repetições.
 * Modo "repeticoes": maior número de repetições com exatamente X kg.
 *
 * Nos dois, o que não bate a referência simplesmente não vira ponto: ligar
 * registros incompatíveis desenharia uma curva que não aconteceu.
 */
export function exerciseChartSeries(
  sets: ResolvedSet[],
  lineageId: string,
  mode: ChartMode,
  reference: number,
  equipment?: ExerciseEquipment | null,
): ChartPoint[] {
  const relevant = sets.filter(
    (s) => s.lineageId === lineageId && (equipment === undefined || s.equipment === equipment),
  );
  const best = new Map<string, ChartPoint>();
  for (const set of relevant) {
    const matches = mode === "carga" ? set.reps === reference : set.weight === reference;
    if (!matches) continue;
    const value = mode === "carga" ? set.weight : set.reps;
    const found = best.get(set.sessionId);
    if (!found || value > found.value) {
      best.set(set.sessionId, {
        sessionId: set.sessionId,
        date: set.date,
        value,
        planLabel: set.planLabel,
      });
    }
  }
  return [...best.values()].sort(
    (a, b) => a.date.localeCompare(b.date) || a.sessionId.localeCompare(b.sessionId),
  );
}

/** Referências disponíveis no histórico — o seletor só oferece o que existe,
 * em vez de deixar escolher um valor que nunca foi registrado. */
export function availableReferences(
  sets: ResolvedSet[],
  lineageId: string,
  mode: ChartMode,
): { value: number; sessions: number }[] {
  const map = new Map<number, Set<string>>();
  for (const set of sets) {
    if (set.lineageId !== lineageId) continue;
    const key = mode === "carga" ? set.reps : set.weight;
    if (!map.has(key)) map.set(key, new Set());
    map.get(key)!.add(set.sessionId);
  }
  return [...map.entries()]
    .map(([value, sessions]) => ({ value, sessions: sessions.size }))
    .sort((a, b) => b.sessions - a.sessions || a.value - b.value);
}

/** Exercícios presentes nos dados filtrados, para a busca do seletor. */
export function exercisesInData(
  sets: ResolvedSet[],
): { lineageId: string; name: string; sessions: number; lastDate: string }[] {
  const map = new Map<string, { name: string; sessions: Set<string>; lastDate: string }>();
  for (const set of sets) {
    const found = map.get(set.lineageId);
    if (found) {
      found.sessions.add(set.sessionId);
      if (set.date > found.lastDate) found.lastDate = set.date;
    } else {
      map.set(set.lineageId, {
        name: set.name,
        sessions: new Set([set.sessionId]),
        lastDate: set.date,
      });
    }
  }
  return [...map.entries()]
    .map(([lineageId, v]) => ({
      lineageId,
      name: v.name,
      sessions: v.sessions.size,
      lastDate: v.lastDate,
    }))
    .sort((a, b) => b.lastDate.localeCompare(a.lastDate) || a.name.localeCompare(b.name));
}

// ---------------------------------------------------------------------------
// Distribuição
// ---------------------------------------------------------------------------

export type DistributionBar = {
  key: string;
  label: string;
  value: number;
};

/** Séries por grupo muscular PRINCIPAL. Cada série entra em um grupo só — o
 * total é a soma real das séries, não uma soma inflada por estímulo
 * secundário. */
export function muscleDistribution(sets: ResolvedSet[]): DistributionBar[] {
  const map = new Map<string, number>();
  for (const set of sets) {
    const key = set.muscleGroup ?? UNCLASSIFIED;
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return [...map.entries()]
    .map(([key, value]) => ({
      key,
      label: key === UNCLASSIFIED ? "Não classificado" : muscleGroupLabel[key as MuscleGroup],
      value,
    }))
    .sort((a, b) => b.value - a.value);
}

/** Sessões concluídas por treino, pela identidade estável (linhagem) — duas
 * fichas chamadas "A" em etapas diferentes não são o mesmo treino. */
export function workoutDistribution(sessions: WorkoutSession[]): DistributionBar[] {
  const map = new Map<string, { label: string; value: number }>();
  for (const session of sessions) {
    if (session.status !== "concluido") continue;
    const key = session.planLineageId ?? session.planId ?? "sem-treino";
    const label = session.planLabel ?? "Treino";
    const found = map.get(key);
    if (found) found.value += 1;
    else map.set(key, { label, value: 1 });
  }
  return [...map.entries()]
    .map(([key, v]) => ({ key, label: v.label, value: v.value }))
    .sort((a, b) => b.value - a.value);
}

// ---------------------------------------------------------------------------
// Recordes pessoais
// ---------------------------------------------------------------------------

export type PersonalRecord = {
  sessionId: string;
  date: string;
  lineageId: string;
  name: string;
  kind: "carga" | "repeticoes";
  reps: number;
  weight: number;
  /** O que era o melhor ANTES desta sessão. */
  previousWeight?: number;
  previousReps?: number;
};

/**
 * Recordes verificáveis: mais carga para o mesmo número de repetições, ou mais
 * repetições com a mesma carga.
 *
 * A comparação usa TODO o histórico anterior à sessão, inclusive fora do
 * período visível — senão, encurtar a janela fabricaria recordes.
 *
 * O primeiro registro estabelece referência e NÃO é anunciado como recorde
 * superado. Empate também não é recorde. E cada sessão rende no máximo um
 * recorde por exercício, para não notificar várias séries equivalentes.
 */
export function personalRecords(
  allSets: ResolvedSet[],
  range: DateRange,
  limit = 20,
): PersonalRecord[] {
  const ordered = [...allSets].sort(
    (a, b) => a.date.localeCompare(b.date) || a.sessionId.localeCompare(b.sessionId),
  );
  // melhor carga por (linhagem+equipamento, reps) e melhor reps por (…, peso)
  const bestWeightAtReps = new Map<string, number>();
  const bestRepsAtWeight = new Map<string, number>();
  const records: PersonalRecord[] = [];
  const claimed = new Set<string>();

  const bySession = new Map<string, ResolvedSet[]>();
  for (const set of ordered) {
    (bySession.get(set.sessionId) ?? bySession.set(set.sessionId, []).get(set.sessionId)!).push(
      set,
    );
  }

  for (const [sessionId, sets] of bySession) {
    const news: PersonalRecord[] = [];
    for (const set of sets) {
      const base = comparabilityKey(set.lineageId, set.equipment);
      const wKey = `${base}|r${set.reps}`;
      const rKey = `${base}|w${set.weight}`;
      const priorWeight = bestWeightAtReps.get(wKey);
      const priorReps = bestRepsAtWeight.get(rKey);

      if (priorWeight !== undefined && set.weight > priorWeight) {
        news.push({
          sessionId,
          date: set.date,
          lineageId: set.lineageId,
          name: set.name,
          kind: "carga",
          reps: set.reps,
          weight: set.weight,
          previousWeight: priorWeight,
        });
      } else if (priorReps !== undefined && set.reps > priorReps) {
        news.push({
          sessionId,
          date: set.date,
          lineageId: set.lineageId,
          name: set.name,
          kind: "repeticoes",
          reps: set.reps,
          weight: set.weight,
          previousReps: priorReps,
        });
      }
    }
    // Atualiza os melhores só depois de avaliar a sessão inteira: séries da
    // mesma sessão não competem entre si.
    for (const set of sets) {
      const base = comparabilityKey(set.lineageId, set.equipment);
      const wKey = `${base}|r${set.reps}`;
      const rKey = `${base}|w${set.weight}`;
      bestWeightAtReps.set(wKey, Math.max(bestWeightAtReps.get(wKey) ?? 0, set.weight));
      bestRepsAtWeight.set(rKey, Math.max(bestRepsAtWeight.get(rKey) ?? 0, set.reps));
    }
    // Um recorde por exercício por sessão.
    for (const record of news) {
      const key = `${sessionId}|${record.lineageId}`;
      if (claimed.has(key)) continue;
      claimed.add(key);
      records.push(record);
    }
  }

  return records
    .filter((r) => r.date >= range.from && r.date <= range.to)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, limit);
}

/** Recordes de uma sessão específica — a evidência mostrada ao finalizar. */
export function recordsForSession(allSets: ResolvedSet[], sessionId: string): PersonalRecord[] {
  const session = allSets.find((s) => s.sessionId === sessionId);
  if (!session) return [];
  return personalRecords(allSets, { from: session.date, to: session.date }, 5).filter(
    (r) => r.sessionId === sessionId,
  );
}
