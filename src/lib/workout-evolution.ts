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
  secondaryMuscles: MuscleGroup[];
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
      const secondaryMuscles = snap?.secondaryMuscles ?? live?.secondaryMuscles ?? [];
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
          secondaryMuscles,
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

// ---------------------------------------------------------------------------
// Frequência
// ---------------------------------------------------------------------------

/**
 * Frequência do período.
 *
 * O denominador só existe quando há programação HISTÓRICA confiável — os dias
 * das etapas do ciclo, cujas datas são fixas. A atribuição semanal solta é
 * estado ATUAL: usá-la para dizer o que estava previsto há dois meses
 * reescreveria o passado a cada mudança de ficha.
 *
 * Sem denominador, devolve só a contagem realizada. Um percentual inventado
 * seria pior do que nenhum.
 */
export type Frequency = {
  done: number;
  planned?: number;
  /** Sessões além do programado — contadas à parte, nunca empurrando o
   * cumprimento acima de 100%. */
  extra: number;
  percent?: number;
  reason?: string;
};

export function frequency(data: FilteredData, plannedInRange: number | null): Frequency {
  const done = data.sessions.length;
  if (plannedInRange === null) {
    return {
      done,
      extra: 0,
      reason: "Sem programação histórica para comparar — mostramos o realizado.",
    };
  }
  const counted = Math.min(done, plannedInRange);
  return {
    done,
    planned: plannedInRange,
    extra: Math.max(0, done - plannedInRange),
    percent: plannedInRange > 0 ? Math.round((counted / plannedInRange) * 100) : 0,
  };
}

// ---------------------------------------------------------------------------
// Volume
// ---------------------------------------------------------------------------

export type Volume = {
  /** Soma de carga × repetições das séries elegíveis. */
  kg: number;
  sets: number;
  /** Séries deixadas de fora por não terem carga externa comparável. */
  excludedSets: number;
  deltaKg?: number;
};

/** Peso corporal, assistido e séries sem carga não entram na tonelagem —
 * forçar modalidades incompatíveis numa conta só produziria um número que não
 * significa nada. */
function isEligibleForVolume(set: ResolvedSet): boolean {
  if (set.equipment && EQUIPMENT_WITHOUT_EXTERNAL_LOAD.includes(set.equipment)) return false;
  return set.weight > 0 && set.reps > 0;
}

export function volume(sets: ResolvedSet[]): Omit<Volume, "deltaKg"> {
  let kg = 0;
  let counted = 0;
  let excluded = 0;
  for (const set of sets) {
    if (!isEligibleForVolume(set)) {
      excluded += 1;
      continue;
    }
    kg += set.weight * set.reps;
    counted += 1;
  }
  return { kg: Math.round(kg), sets: counted, excludedSets: excluded };
}

export function volumeWithComparison(
  current: ResolvedSet[],
  previous: ResolvedSet[] | null,
): Volume {
  const now = volume(current);
  if (!previous) return now;
  return { ...now, deltaKg: now.kg - volume(previous).kg };
}

// ---------------------------------------------------------------------------
// Estímulo por músculo
// ---------------------------------------------------------------------------

export type MuscleStimulus = {
  group: MuscleGroupFilter;
  label: string;
  /** Séries cujo grupo PRINCIPAL é este — é o que soma. */
  directSets: number;
  /** Séries em que o músculo participa como secundário. Reportado à parte:
   * somar a série inteira em cada músculo inflaria o total. */
  assistedSets: number;
  sessions: number;
  lastDate?: string;
};

export function muscleStimulus(sets: ResolvedSet[]): MuscleStimulus[] {
  const map = new Map<string, MuscleStimulus>();
  const ensure = (key: MuscleGroupFilter): MuscleStimulus => {
    const found = map.get(key);
    if (found) return found;
    const created: MuscleStimulus = {
      group: key,
      label: key === UNCLASSIFIED ? "Não classificado" : muscleGroupLabel[key as MuscleGroup],
      directSets: 0,
      assistedSets: 0,
      sessions: 0,
    };
    map.set(key, created);
    return created;
  };
  const sessionsByGroup = new Map<string, Set<string>>();

  for (const set of sets) {
    const primary = (set.muscleGroup ?? UNCLASSIFIED) as MuscleGroupFilter;
    const row = ensure(primary);
    row.directSets += 1;
    if (!row.lastDate || set.date > row.lastDate) row.lastDate = set.date;
    if (!sessionsByGroup.has(primary)) sessionsByGroup.set(primary, new Set());
    sessionsByGroup.get(primary)!.add(set.sessionId);

    for (const secondary of set.secondaryMuscles) {
      if (secondary === set.muscleGroup) continue;
      const other = ensure(secondary);
      other.assistedSets += 1;
      if (!sessionsByGroup.has(secondary)) sessionsByGroup.set(secondary, new Set());
      sessionsByGroup.get(secondary)!.add(set.sessionId);
    }
  }

  for (const [key, ids] of sessionsByGroup) {
    const row = map.get(key);
    if (row) row.sessions = ids.size;
  }
  return [...map.values()].sort((a, b) => b.directSets - a.directSets);
}

/** Grupo com mais séries DIRETAS — descrição do registro, não julgamento de
 * força nem de preferência. */
export function topMuscle(stimulus: MuscleStimulus[]): MuscleStimulus | undefined {
  return stimulus.filter((m) => m.group !== UNCLASSIFIED && m.directSets > 0)[0];
}

// ---------------------------------------------------------------------------
// Pontos de atenção
// ---------------------------------------------------------------------------

export type AttentionPoint = {
  id: string;
  text: string;
  tone: "neutro" | "bom" | "alerta";
  /** Para onde levar quando a pessoa quiser conferir a origem. */
  target:
    | { kind: "exercicio"; lineageId: string }
    | { kind: "musculo"; group: MuscleGroupFilter }
    | { kind: "programacao" }
    | { kind: "classificacao" };
};

/**
 * No máximo três observações, todas verificáveis a partir dos registros e com
 * um caminho para a evidência.
 *
 * Regras transparentes calculadas dos dados — nenhuma chamada de IA, nenhuma
 * frase gerada. Músculo sem registro não é tratado como problema: só vira
 * observação quando JÁ foi treinado antes e ficou muito tempo sem.
 */
export function attentionPoints(
  data: FilteredData,
  progressions: LoadProgression[],
  stimulus: MuscleStimulus[],
  freq: Frequency,
  today: string,
  daysWithoutThreshold = 14,
): AttentionPoint[] {
  const points: AttentionPoint[] = [];

  const best = progressions[0];
  if (best) {
    points.push({
      id: `prog-${best.lineageId}`,
      tone: "bom",
      text: `${best.name}: ${best.firstWeight} → ${best.lastWeight} kg em ${best.reps} repetições.`,
      target: { kind: "exercicio", lineageId: best.lineageId },
    });
  }

  if (freq.planned !== undefined) {
    points.push({
      id: "freq",
      tone: freq.done >= freq.planned ? "bom" : "neutro",
      text: `Você concluiu ${freq.done} de ${freq.planned} treinos programados.`,
      target: { kind: "programacao" },
    });
  }

  const stale = stimulus
    .filter((m) => m.group !== UNCLASSIFIED && m.lastDate)
    .map((m) => ({ m, days: daysBetweenISO(m.lastDate!, today) }))
    .filter((x) => x.days >= daysWithoutThreshold)
    .sort((a, b) => b.days - a.days)[0];
  if (stale) {
    points.push({
      id: `stale-${stale.m.group}`,
      tone: "alerta",
      text: `${stale.m.label}: último registro há ${stale.days} dias.`,
      target: { kind: "musculo", group: stale.m.group },
    });
  }

  const unclassified = stimulus.find((m) => m.group === UNCLASSIFIED);
  if (unclassified && points.length < 3) {
    points.push({
      id: "sem-classificacao",
      tone: "neutro",
      text: `${unclassified.directSets} séries de exercícios sem grupo muscular definido.`,
      target: { kind: "classificacao" },
    });
  }

  return points.slice(0, 3);
}

// ---------------------------------------------------------------------------
// Progresso por exercício, no formato da lista "Sobrecarga progressiva"
// ---------------------------------------------------------------------------

export type ExerciseTrend = {
  lineageId: string;
  name: string;
  muscleGroup: MuscleGroup | null;
  equipment: ExerciseEquipment | null;
  sessions: number;
  lastDate: string;
  /** Pontos do minigráfico — melhor carga na referência de cada sessão. */
  spark: number[];
  /** Frase objetiva do resultado, ou a ausência honesta dele. */
  summary: string;
  kind: "melhora" | "estavel" | "sem_comparacao";
  reference?: { reps: number; weight?: number };
};

/**
 * Tendência de cada exercício com registros no período.
 *
 * Prioriza, nesta ordem: mais repetições com a MESMA carga, depois mais carga
 * numa referência de repetições. Sem comparação defensável, diz "Sem
 * comparação" — e sem mudança observável, "Estável nas últimas sessões".
 *
 * Nunca conclui platô por tempo, nem atribui queda a fadiga ou falta de foco:
 * uma carga menor pode ser deload, técnica, amplitude ou mudança de objetivo.
 */
export function exerciseTrends(sets: ResolvedSet[]): ExerciseTrend[] {
  const groups = new Map<string, ResolvedSet[]>();
  for (const set of sets) {
    const key = comparabilityKey(set.lineageId, set.equipment);
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(set);
  }

  const out: ExerciseTrend[] = [];
  for (const group of groups) {
    const rows = group[1];
    const head = rows[0];
    const sessionIds = new Set(rows.map((r) => r.sessionId));
    const lastDate = rows.reduce((max, r) => (r.date > max ? r.date : max), rows[0].date);

    // 1. Mais repetições com a mesma carga.
    let best: ExerciseTrend | null = null;
    const byWeight = new Map<number, { date: string; sessionId: string; reps: number }[]>();
    for (const r of rows) {
      if (r.weight <= 0) continue;
      const list = byWeight.get(r.weight) ?? byWeight.set(r.weight, []).get(r.weight)!;
      const found = list.find((x) => x.sessionId === r.sessionId);
      if (found) found.reps = Math.max(found.reps, r.reps);
      else list.push({ date: r.date, sessionId: r.sessionId, reps: r.reps });
    }
    for (const [weight, list] of byWeight) {
      if (list.length < 2) continue;
      const ordered = [...list].sort((a, b) => a.date.localeCompare(b.date));
      const delta = ordered.at(-1)!.reps - ordered[0].reps;
      if (delta > 0 && (!best || delta > 0)) {
        best = {
          lineageId: head.lineageId,
          name: head.name,
          muscleGroup: head.muscleGroup,
          equipment: head.equipment,
          sessions: sessionIds.size,
          lastDate,
          spark: ordered.map((x) => x.reps),
          summary: `+${delta} ${delta === 1 ? "repetição" : "repetições"} com ${weight} kg`,
          kind: "melhora",
          reference: { reps: ordered.at(-1)!.reps, weight },
        };
        break;
      }
    }

    // 2. Mais carga numa referência de repetições.
    if (!best) {
      const byReps = new Map<number, Set<string>>();
      for (const r of rows) {
        if (!byReps.has(r.reps)) byReps.set(r.reps, new Set());
        byReps.get(r.reps)!.add(r.sessionId);
      }
      const reference = [...byReps.entries()].sort((a, b) => b[1].size - a[1].size)[0];
      if (reference && reference[1].size >= 2) {
        const points = rows
          .filter((r) => r.reps === reference[0])
          .reduce(
            (acc, r) => {
              const found = acc.find((x) => x.sessionId === r.sessionId);
              if (found) found.weight = Math.max(found.weight, r.weight);
              else acc.push({ sessionId: r.sessionId, date: r.date, weight: r.weight });
              return acc;
            },
            [] as { sessionId: string; date: string; weight: number }[],
          )
          .sort((a, b) => a.date.localeCompare(b.date));
        const delta = Math.round((points.at(-1)!.weight - points[0].weight) * 100) / 100;
        best = {
          lineageId: head.lineageId,
          name: head.name,
          muscleGroup: head.muscleGroup,
          equipment: head.equipment,
          sessions: sessionIds.size,
          lastDate,
          spark: points.map((p) => p.weight),
          summary:
            delta > 0
              ? `+${delta} kg em ${reference[0]} repetições`
              : "Estável nas últimas sessões",
          kind: delta > 0 ? "melhora" : "estavel",
          reference: { reps: reference[0] },
        };
      }
    }

    out.push(
      best ?? {
        lineageId: head.lineageId,
        name: head.name,
        muscleGroup: head.muscleGroup,
        equipment: head.equipment,
        sessions: sessionIds.size,
        lastDate,
        spark: [],
        summary: "Sem comparação",
        kind: "sem_comparacao",
      },
    );
  }

  return out;
}
