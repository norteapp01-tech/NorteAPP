import { daysBetweenISO, toISODate, addDays } from "./goals-store";
import type { ExerciseEquipment, MuscleGroup } from "./workout-store";
import {
  comparabilityKey,
  muscleGroupLabel,
  rangeLengthDays,
  UNCLASSIFIED,
  type DateRange,
  type FilteredData,
  type Frequency,
  type MuscleGroupFilter,
  type ResolvedSet,
} from "./workout-evolution";
import { estimatedStrength, isEstimableSet } from "./workout-performance";

// ---------------------------------------------------------------------------
// Cálculos do explorador da Evolução: corpo → músculo → exercício → sessões.
//
// Tudo aqui é função pura sobre as séries já filtradas. Três regras atravessam
// o arquivo:
//
// 1. Comparar só o comparável. A identidade de uma série histórica é
//    LINHAGEM + EQUIPAMENTO. Barra, halteres, máquina e cabo nunca entram na
//    mesma curva.
// 2. Cada exercício vota uma vez. O estado de um músculo é a MEDIANA da
//    evolução dos exercícios elegíveis — senão o exercício com mais séries
//    decidiria sozinho a cor da região.
// 3. Variação pequena não é evolução nem queda. Abaixo da margem mínima o
//    resultado é "estável", e isso é uma escolha declarada, não um efeito
//    colateral de arredondamento.
//
// O que NÃO se conclui daqui: qualidade técnica, recuperação, dor, lesão,
// motivação, overtraining, hipertrofia, gordura localizada ou força isolada de
// um músculo. Carga e repetições só sustentam frases sobre carga e repetições.
// ---------------------------------------------------------------------------

/**
 * Margem mínima para chamar uma variação de evolução ou de queda.
 *
 * 2,5% é aproximadamente o menor degrau real de carga na maioria das barras e
 * máquinas (2,5 kg em 100 kg). Abaixo disso a diferença diz mais sobre qual
 * anilha estava disponível do que sobre o treino, então o resultado honesto é
 * "estável".
 */
export const EVOLUTION_MARGIN_PCT = 2.5;

/** Quantas sessões seguidas sem mudança já configuram estabilidade prolongada —
 * é o que a página chama de ponto de atenção. Não é diagnóstico de platô. */
export const PROLONGED_STABILITY_SESSIONS = 4;

export type ProgressStatus = "progressao" | "estavel" | "queda" | "sem_comparacao";

// ---------------------------------------------------------------------------
// Sessão representativa e evolução de um exercício
// ---------------------------------------------------------------------------

export type SessionPerformance = {
  sessionId: string;
  date: string;
  planLabel: string;
  /** Série escolhida para representar a sessão. */
  weight: number;
  reps: number;
  setIndex: number;
  /** Só quando a série sustenta a fórmula. */
  estimated: number | null;
};

/**
 * Uma performance por sessão.
 *
 * A série representativa é a ELEGÍVEL COM MAIOR FORÇA ESTIMADA — é a que
 * melhor resume o esforço da sessão sem depender da ordem em que as séries
 * foram registradas. Quando nenhuma série da sessão é estimável (peso
 * corporal, assistido, elástico, carga zerada), cai para a de maior carga e,
 * em empate, mais repetições; `estimated` fica nulo e a interface diz isso.
 */
export function sessionPerformances(sets: ResolvedSet[]): SessionPerformance[] {
  const bySession = new Map<string, ResolvedSet[]>();
  for (const set of sets) {
    const list = bySession.get(set.sessionId);
    if (list) list.push(set);
    else bySession.set(set.sessionId, [set]);
  }

  const out: SessionPerformance[] = [];
  for (const rows of bySession.values()) {
    const estimable = rows.filter(isEstimableSet);
    const pool = estimable.length > 0 ? estimable : rows;
    const chosen = [...pool].sort((a, b) => {
      const ea = estimatedStrength(a);
      const eb = estimatedStrength(b);
      if (ea !== null && eb !== null && ea !== eb) return eb - ea;
      if (a.weight !== b.weight) return b.weight - a.weight;
      if (a.reps !== b.reps) return b.reps - a.reps;
      return a.setIndex - b.setIndex;
    })[0];
    out.push({
      sessionId: chosen.sessionId,
      date: chosen.date,
      planLabel: chosen.planLabel,
      weight: chosen.weight,
      reps: chosen.reps,
      setIndex: chosen.setIndex,
      estimated: estimatedStrength(chosen),
    });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.sessionId.localeCompare(b.sessionId));
}

/** Chave de comparabilidade de uma série já resolvida — mesmo critério do
 * resto da Evolução: linhagem + equipamento. */
export function comparabilityKeyOf(set: ResolvedSet): string {
  return comparabilityKey(set.lineageId, set.equipment);
}

/** Classifica uma variação percentual respeitando a margem declarada. */
export function classifyPct(pct: number, margin = EVOLUTION_MARGIN_PCT): ProgressStatus {
  if (pct > margin) return "progressao";
  if (pct < -margin) return "queda";
  return "estavel";
}

export type ExerciseEvolution = {
  key: string;
  lineageId: string;
  name: string;
  muscleGroup: MuscleGroup | null;
  equipment: ExerciseEquipment | null;
  sessions: SessionPerformance[];
  /** Variação entre a primeira e a última sessão comparável, em %. */
  pct: number | null;
  status: ProgressStatus;
  /** Em que base a comparação foi feita — a interface precisa dizer. */
  basis: "forca_estimada" | "carga" | "repeticoes" | "nenhuma";
  /** Sessões consecutivas sem mudança acima da margem, contadas do fim. */
  stableStreak: number;
  lastDate: string;
  setCount: number;
};

/**
 * Evolução de UM exercício (já recortado por linhagem + equipamento).
 *
 * Base da comparação, nesta ordem:
 * 1. Força estimada, quando todas as sessões comparadas a sustentam.
 * 2. Carga da série representativa, quando a estimativa não se aplica mas há
 *    carga externa positiva.
 * 3. Repetições, quando não há carga (peso corporal, por exemplo).
 *
 * Sem duas sessões, o resultado é "sem comparação" — não um zero.
 */
export function exerciseEvolution(
  sets: ResolvedSet[],
  margin = EVOLUTION_MARGIN_PCT,
): ExerciseEvolution {
  const head = sets[0];
  const sessions = sessionPerformances(sets);
  const lastDate = sessions.at(-1)?.date ?? head?.date ?? "";
  const base: Omit<ExerciseEvolution, "pct" | "status" | "basis" | "stableStreak"> = {
    key: comparabilityKey(head?.lineageId ?? "", head?.equipment ?? null),
    lineageId: head?.lineageId ?? "",
    name: head?.name ?? "Exercício",
    muscleGroup: head?.muscleGroup ?? null,
    equipment: head?.equipment ?? null,
    sessions,
    lastDate,
    setCount: sets.length,
  };

  if (sessions.length < 2) {
    return { ...base, pct: null, status: "sem_comparacao", basis: "nenhuma", stableStreak: 0 };
  }

  const allEstimated = sessions.every((s) => s.estimated !== null);
  const allLoaded = sessions.every((s) => s.weight > 0);
  const basis: ExerciseEvolution["basis"] = allEstimated
    ? "forca_estimada"
    : allLoaded
      ? "carga"
      : "repeticoes";
  const valueOf = (s: SessionPerformance) =>
    basis === "forca_estimada" ? s.estimated! : basis === "carga" ? s.weight : s.reps;

  const first = valueOf(sessions[0]);
  const last = valueOf(sessions.at(-1)!);
  if (first <= 0) {
    return { ...base, pct: null, status: "sem_comparacao", basis: "nenhuma", stableStreak: 0 };
  }
  const pct = Math.round(((last - first) / first) * 1000) / 10;

  // Sequência estável contada do fim: quantas sessões seguidas ficaram dentro
  // da margem em relação à anterior.
  let streak = 1;
  for (let i = sessions.length - 1; i > 0; i--) {
    const a = valueOf(sessions[i - 1]);
    const b = valueOf(sessions[i]);
    if (a <= 0) break;
    const step = ((b - a) / a) * 100;
    if (Math.abs(step) > margin) break;
    streak += 1;
  }

  return { ...base, pct, status: classifyPct(pct, margin), basis, stableStreak: streak };
}

/** Agrupa as séries por linhagem + equipamento e avalia cada grupo. */
export function exerciseEvolutions(
  sets: ResolvedSet[],
  margin = EVOLUTION_MARGIN_PCT,
): ExerciseEvolution[] {
  const groups = new Map<string, ResolvedSet[]>();
  for (const set of sets) {
    const key = comparabilityKey(set.lineageId, set.equipment);
    const list = groups.get(key);
    if (list) list.push(set);
    else groups.set(key, [set]);
  }
  return [...groups.values()].map((rows) => exerciseEvolution(rows, margin));
}

// ---------------------------------------------------------------------------
// Estado de um músculo no modo Evolução
// ---------------------------------------------------------------------------

export type MuscleEvolution = {
  group: MuscleGroup;
  /** Mediana da evolução percentual dos exercícios elegíveis. */
  medianPct: number | null;
  status: ProgressStatus | "sem_dados";
  /** Quantos exercícios daquele músculo entraram na conta… */
  comparable: number;
  /** …de quantos com registro no período. */
  total: number;
  /** Um exercício só decide pouco: a interface avisa em vez de esconder. */
  limited: boolean;
};

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const raw = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  return Math.round(raw * 10) / 10;
}

/**
 * Estado de cada músculo a partir dos exercícios cujo grupo PRINCIPAL é ele.
 *
 * Isto descreve a progressão registrada nos exercícios associados ao músculo —
 * não "a força do músculo", que nenhum registro de carga consegue isolar.
 */
export function muscleEvolutions(
  sets: ResolvedSet[],
  margin = EVOLUTION_MARGIN_PCT,
): MuscleEvolution[] {
  const byGroup = new Map<MuscleGroup, ResolvedSet[]>();
  for (const set of sets) {
    if (!set.muscleGroup) continue;
    const list = byGroup.get(set.muscleGroup);
    if (list) list.push(set);
    else byGroup.set(set.muscleGroup, [set]);
  }

  const out: MuscleEvolution[] = [];
  for (const [group, rows] of byGroup) {
    const evolutions = exerciseEvolutions(rows, margin);
    // Só carga externa positiva entra na leitura de evolução do músculo:
    // "mais repetições de flexão" é progresso, mas não é a mesma grandeza.
    const eligible = evolutions.filter(
      (e) => e.status !== "sem_comparacao" && (e.basis === "forca_estimada" || e.basis === "carga"),
    );
    const medianPct = median(eligible.map((e) => e.pct!));
    out.push({
      group,
      medianPct,
      status: medianPct === null ? "sem_dados" : classifyPct(medianPct, margin),
      comparable: eligible.length,
      total: evolutions.length,
      limited: eligible.length === 1,
    });
  }
  return out.sort((a, b) => muscleGroupLabel[a.group].localeCompare(muscleGroupLabel[b.group]));
}

// ---------------------------------------------------------------------------
// Resumo de um músculo
// ---------------------------------------------------------------------------

export type MuscleSummary = {
  group: MuscleGroupFilter;
  label: string;
  directSets: number;
  assistedSets: number;
  sessions: number;
  lastDate?: string;
  /** Sessões por semana no período. Nulo quando o período é curto demais para
   * a média significar alguma coisa. */
  perWeek: number | null;
  /** Frase pronta e concreta, preferida em períodos curtos. */
  frequencyText: string;
  rangeDays: number;
};

/** Períodos curtos não rendem média semanal legível: "2 sessões em 7 dias"
 * informa; "2,0 vezes por semana" a partir de 7 dias, não. */
const SHORT_RANGE_DAYS = 14;

export function muscleSummary(
  sets: ResolvedSet[],
  group: MuscleGroupFilter,
  range: DateRange,
): MuscleSummary {
  const isMatch = (s: ResolvedSet) =>
    group === UNCLASSIFIED ? s.muscleGroup === null : s.muscleGroup === group;
  const direct = sets.filter(isMatch);
  const assisted = sets.filter(
    (s) =>
      !isMatch(s) && group !== UNCLASSIFIED && s.secondaryMuscles.includes(group as MuscleGroup),
  );
  const sessions = new Set(direct.map((s) => s.sessionId));
  const lastDate = direct.reduce<string | undefined>(
    (max, s) => (!max || s.date > max ? s.date : max),
    undefined,
  );
  const rangeDays = rangeLengthDays(range);
  const weeks = rangeDays / 7;
  const perWeek =
    rangeDays >= SHORT_RANGE_DAYS && weeks > 0
      ? Math.round((sessions.size / weeks) * 10) / 10
      : null;

  const plural = sessions.size === 1 ? "sessão" : "sessões";
  const frequencyText =
    perWeek === null
      ? `${sessions.size} ${plural} em ${rangeDays} dias`
      : `${perWeek.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} ${
          perWeek === 1 ? "vez" : "vezes"
        } por semana`;

  return {
    group,
    label: group === UNCLASSIFIED ? "Não classificado" : muscleGroupLabel[group as MuscleGroup],
    directSets: direct.length,
    assistedSets: assisted.length,
    sessions: sessions.size,
    lastDate,
    perWeek,
    frequencyText,
    rangeDays,
  };
}

// ---------------------------------------------------------------------------
// Séries por semana (ou dia, ou mês)
// ---------------------------------------------------------------------------

export type Bucketing = "dia" | "semana" | "mes";

export type SetBucket = {
  key: string;
  /** Rótulo curto do eixo. */
  label: string;
  /** Descrição completa, usada ao tocar na barra. */
  fullLabel: string;
  sets: number;
  sessions: number;
};

/** 7 dias vira leitura diária; 1 ano vira mensal. No meio, semanal. */
export function bucketingFor(range: DateRange): Bucketing {
  const days = rangeLengthDays(range);
  if (days <= 10) return "dia";
  if (days > 180) return "mes";
  return "semana";
}

const MONTHS_PT = [
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

function startOfWeekISO(iso: string): string {
  const date = new Date(iso + "T00:00:00");
  // Semana começando na segunda, igual ao resto do app.
  const shift = (date.getDay() + 6) % 7;
  return toISODate(addDays(date, -shift));
}

function shortDate(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}

/**
 * Distribui as séries diretas ao longo do período.
 *
 * Todos os intervalos do período aparecem, inclusive os vazios: esconder a
 * semana sem treino transformaria concentração em consistência.
 */
export function setsPerBucket(
  sets: ResolvedSet[],
  range: DateRange,
  mode: Bucketing = bucketingFor(range),
): SetBucket[] {
  const buckets = new Map<string, SetBucket & { sessionIds: Set<string> }>();
  const ensure = (key: string, label: string, fullLabel: string) => {
    const found = buckets.get(key);
    if (found) return found;
    const created = { key, label, fullLabel, sets: 0, sessions: 0, sessionIds: new Set<string>() };
    buckets.set(key, created);
    return created;
  };

  const describe = (iso: string): { key: string; label: string; fullLabel: string } => {
    if (mode === "dia") {
      return { key: iso, label: shortDate(iso), fullLabel: shortDate(iso) };
    }
    if (mode === "mes") {
      const key = iso.slice(0, 7);
      const label = MONTHS_PT[Number(iso.slice(5, 7)) - 1];
      return { key, label, fullLabel: `${label}/${iso.slice(2, 4)}` };
    }
    const start = startOfWeekISO(iso);
    const end = toISODate(addDays(new Date(start + "T00:00:00"), 6));
    // A primeira e a última semana do período costumam ser parciais. Mostrar
    // "31/08 a 06/09" num período que começa em 01/09 sugeriria dias que não
    // foram olhados, então o rótulo é recortado pelo próprio período.
    const from = start < range.from ? range.from : start;
    const to = end > range.to ? range.to : end;
    return {
      key: start,
      label: shortDate(from),
      fullLabel: from === to ? shortDate(from) : `${shortDate(from)} a ${shortDate(to)}`,
    };
  };

  // Esqueleto do período inteiro, para as lacunas aparecerem.
  const total = rangeLengthDays(range);
  const step = mode === "dia" ? 1 : mode === "semana" ? 7 : 28;
  for (let offset = 0; offset < total; offset += step) {
    const iso = toISODate(addDays(new Date(range.from + "T00:00:00"), offset));
    const d = describe(iso);
    ensure(d.key, d.label, d.fullLabel);
  }
  const lastDescriptor = describe(range.to);
  ensure(lastDescriptor.key, lastDescriptor.label, lastDescriptor.fullLabel);

  for (const set of sets) {
    const d = describe(set.date);
    const bucket = ensure(d.key, d.label, d.fullLabel);
    bucket.sets += 1;
    bucket.sessionIds.add(set.sessionId);
  }

  return [...buckets.values()]
    .sort((a, b) => a.key.localeCompare(b.key))
    .map(({ sessionIds, ...rest }) => ({ ...rest, sessions: sessionIds.size }));
}

// ---------------------------------------------------------------------------
// Participação por exercício dentro do músculo
// ---------------------------------------------------------------------------

export type ExerciseShare = {
  key: string;
  lineageId: string;
  name: string;
  equipment: ExerciseEquipment | null;
  sets: number;
  pct: number;
};

/** Distribuição das séries DIRETAS do músculo entre os exercícios. Série
 * secundária não entra: ela não foi feita para este músculo. */
export function exerciseShares(sets: ResolvedSet[]): ExerciseShare[] {
  const map = new Map<string, ExerciseShare>();
  for (const set of sets) {
    const key = comparabilityKey(set.lineageId, set.equipment);
    const found = map.get(key);
    if (found) found.sets += 1;
    else
      map.set(key, {
        key,
        lineageId: set.lineageId,
        name: set.name,
        equipment: set.equipment,
        sets: 1,
        pct: 0,
      });
  }
  const total = sets.length || 1;
  return [...map.values()]
    .map((row) => ({ ...row, pct: Math.round((row.sets / total) * 100) }))
    .sort((a, b) => b.sets - a.sets || a.name.localeCompare(b.name));
}

// ---------------------------------------------------------------------------
// Indicadores do topo
// ---------------------------------------------------------------------------

export type ProgressionIndicator = {
  improving: number;
  comparable: number;
  /** Quem sustenta o número de "em progressão" — o indicador precisa levar à
   * evidência, não só mostrar a contagem. */
  improvingList: ExerciseEvolution[];
  /** Exercícios com queda registrada ou estabilidade prolongada. */
  attention: ExerciseEvolution[];
};

export function progressionIndicator(
  sets: ResolvedSet[],
  margin = EVOLUTION_MARGIN_PCT,
): ProgressionIndicator {
  const evolutions = exerciseEvolutions(sets, margin);
  const comparable = evolutions.filter((e) => e.status !== "sem_comparacao");
  const improvingList = comparable
    .filter((e) => e.status === "progressao")
    .sort((a, b) => (b.pct ?? 0) - (a.pct ?? 0));
  return {
    improving: improvingList.length,
    comparable: comparable.length,
    improvingList,
    attention: comparable
      .filter(
        (e) =>
          e.status === "queda" ||
          (e.status === "estavel" && e.stableStreak >= PROLONGED_STABILITY_SESSIONS),
      )
      .sort((a, b) => (a.status === "queda" ? -1 : 1) - (b.status === "queda" ? -1 : 1)),
  };
}

// ---------------------------------------------------------------------------
// Comparação com o período anterior
// ---------------------------------------------------------------------------

export type MuscleComparison = {
  current: { sets: number; sessions: number };
  previous: { sets: number; sessions: number } | null;
};

export function muscleComparison(
  current: ResolvedSet[],
  previous: ResolvedSet[] | null,
  group: MuscleGroupFilter,
): MuscleComparison {
  const count = (rows: ResolvedSet[]) => {
    const mine = rows.filter((s) =>
      group === UNCLASSIFIED ? s.muscleGroup === null : s.muscleGroup === group,
    );
    return { sets: mine.length, sessions: new Set(mine.map((s) => s.sessionId)).size };
  };
  return { current: count(current), previous: previous ? count(previous) : null };
}

// ---------------------------------------------------------------------------
// Próximo passo
// ---------------------------------------------------------------------------

export type NextStep = {
  text: string;
  /** Ação oferecida — nada é aplicado automaticamente. */
  action?:
    | { kind: "exercicio"; lineageId: string; label: string }
    | { kind: "treino"; label: string }
    | { kind: "programa"; label: string };
};

const WEEKDAY_PT = [
  "domingo",
  "segunda-feira",
  "terça-feira",
  "quarta-feira",
  "quinta-feira",
  "sexta-feira",
  "sábado",
];

/**
 * Observação curta e acionável sobre o músculo, por regras transparentes.
 *
 * Todas as frases descrevem o REGISTRO. Nenhuma delas atribui causa, e nada
 * aqui altera carga, séries, exercícios ou programação.
 */
export function nextStepForMuscle(
  evolutions: ExerciseEvolution[],
  summary: MuscleSummary,
  nextPlannedDate: string | null,
): NextStep[] {
  const steps: NextStep[] = [];

  const falling = evolutions.find((e) => e.status === "queda");
  const stalled = evolutions.find(
    (e) => e.status === "estavel" && e.stableStreak >= PROLONGED_STABILITY_SESSIONS,
  );
  const rising = evolutions.find((e) => e.status === "progressao");

  if (falling) {
    steps.push({
      text: `${falling.name}: redução registrada de ${Math.abs(falling.pct!).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% no período.`,
      action: { kind: "exercicio", lineageId: falling.lineageId, label: "Consultar exercício" },
    });
  }
  if (stalled) {
    steps.push({
      text: `${stalled.name} manteve a mesma referência em ${stalled.stableStreak} sessões.`,
      action: { kind: "exercicio", lineageId: stalled.lineageId, label: "Consultar exercício" },
    });
  }
  if (rising && steps.length < 2) {
    steps.push({
      text: `${rising.name} está progredindo: ${rising.pct! > 0 ? "+" : ""}${rising.pct!.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% no período.`,
      action: { kind: "exercicio", lineageId: rising.lineageId, label: "Consultar exercício" },
    });
  }
  if (steps.length === 0) {
    steps.push({
      text:
        summary.directSets === 0
          ? `Sem séries de ${summary.label.toLowerCase()} registradas neste período.`
          : "Ainda faltam registros comparáveis para avaliar este músculo.",
      action: { kind: "programa", label: "Revisar programa" },
    });
  }

  if (nextPlannedDate) {
    const weekday = WEEKDAY_PT[new Date(nextPlannedDate + "T12:00:00").getDay()];
    steps.push({
      text: `Seu próximo treino com ${summary.label.toLowerCase()} está previsto para ${weekday}.`,
      action: { kind: "treino", label: "Abrir próximo treino" },
    });
  }

  return steps.slice(0, 3);
}

// ---------------------------------------------------------------------------
// Consistência
// ---------------------------------------------------------------------------

export type ConsistencyView = {
  headline: string;
  detail: string;
  /** Verdadeiro só quando existe programação histórica confiável. */
  hasPlan: boolean;
};

/** Sem programação histórica não existe porcentagem — existe contagem. */
export function consistencyView(freq: Frequency): ConsistencyView {
  if (freq.percent === undefined || freq.planned === undefined) {
    return {
      headline: `${freq.done} ${freq.done === 1 ? "treino" : "treinos"}`,
      detail: "realizados no período",
      hasPlan: false,
    };
  }
  return {
    headline: `${freq.percent}%`,
    detail: `${Math.min(freq.done, freq.planned)} de ${freq.planned} treinos`,
    hasPlan: true,
  };
}

// ---------------------------------------------------------------------------
// Sessões de um exercício, para o histórico
// ---------------------------------------------------------------------------

export type SessionSets = {
  sessionId: string;
  date: string;
  planLabel: string;
  sets: ResolvedSet[];
};

export function sessionsOfExercise(sets: ResolvedSet[]): SessionSets[] {
  const map = new Map<string, SessionSets>();
  for (const set of sets) {
    const found = map.get(set.sessionId);
    if (found) found.sets.push(set);
    else
      map.set(set.sessionId, {
        sessionId: set.sessionId,
        date: set.date,
        planLabel: set.planLabel,
        sets: [set],
      });
  }
  for (const entry of map.values()) entry.sets.sort((a, b) => a.setIndex - b.setIndex);
  return [...map.values()].sort((a, b) => b.date.localeCompare(a.date));
}

/** Melhor desempenho registrado no recorte — por força estimada quando
 * possível, senão pela maior carga. */
export function bestPerformance(sessions: SessionPerformance[]): SessionPerformance | null {
  if (sessions.length === 0) return null;
  return [...sessions].sort((a, b) => {
    if (a.estimated !== null && b.estimated !== null && a.estimated !== b.estimated)
      return b.estimated - a.estimated;
    if (a.weight !== b.weight) return b.weight - a.weight;
    return b.reps - a.reps;
  })[0];
}

/** Dias desde o último registro — usado nas frases, nunca como julgamento. */
export function daysSince(lastDate: string | undefined, today: string): number | null {
  if (!lastDate) return null;
  return daysBetweenISO(lastDate, today);
}

/** Próxima data programada para um músculo, olhando os dias da etapa ativa.
 * Sem programação, devolve null em vez de chutar um dia. */
export function nextPlannedDateForMuscle(
  plannedDays: { date: string; muscleGroups: MuscleGroup[] }[],
  group: MuscleGroup,
  today: string,
): string | null {
  return (
    plannedDays
      .filter((d) => d.date >= today && d.muscleGroups.includes(group))
      .sort((a, b) => a.date.localeCompare(b.date))[0]?.date ?? null
  );
}

/** Conveniência para a página: dados filtrados → indicadores prontos. */
export function explorerIndicators(data: FilteredData, freq: Frequency) {
  return {
    consistency: consistencyView(freq),
    progression: progressionIndicator(data.sets),
  };
}
