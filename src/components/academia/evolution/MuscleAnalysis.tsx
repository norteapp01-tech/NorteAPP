import { useMemo, useState } from "react";
import { ArrowRight, CalendarClock } from "lucide-react";
import { formatDateShortBR } from "@/lib/goals-store";
import type { MuscleGroup } from "@/lib/workout-store";
import {
  muscleGroupLabel,
  type DateRange,
  type PersonalRecord,
  type ResolvedSet,
} from "@/lib/workout-evolution";
import {
  bucketingFor,
  comparabilityKeyOf,
  exerciseEvolutions,
  muscleComparison,
  muscleSummary,
  nextStepForMuscle,
  setsPerBucket,
  type NextStep,
} from "@/lib/workout-explorer";
import { ExerciseList } from "./ExerciseList";

// ---------------------------------------------------------------------------
// Análise do músculo — gaveta inline, logo abaixo do corpo.
//
// Sem modal e sem troca de página: quem tocou no peitoral continua vendo o
// peitoral selecionado no mapa enquanto lê a análise.
//
// Quatro números, uma comparação factual com o período anterior, um gráfico
// compacto, os exercícios e um próximo passo. O resto fica recolhido.
// ---------------------------------------------------------------------------

const BUCKET_TITLE = {
  dia: "Séries por dia",
  semana: "Séries por semana",
  mes: "Séries por mês",
};

export function MuscleAnalysis({
  group,
  sets,
  previousSets,
  range,
  records,
  nextPlannedDate,
  onAction,
  openExerciseKey,
  onOpenExerciseKey,
  exercisesOpen,
  onExercisesOpenChange,
}: {
  group: MuscleGroup;
  /** Todas as séries do período (não só as do músculo): a participação
   * secundária precisa enxergar os outros exercícios. */
  sets: ResolvedSet[];
  previousSets: ResolvedSet[] | null;
  range: DateRange;
  records: PersonalRecord[];
  nextPlannedDate: string | null;
  onAction: (step: NextStep) => void;
  openExerciseKey: string | null;
  onOpenExerciseKey: (key: string | null) => void;
  exercisesOpen: boolean;
  onExercisesOpenChange: (open: boolean) => void;
}) {
  const direct = useMemo(() => sets.filter((s) => s.muscleGroup === group), [sets, group]);
  const summary = useMemo(() => muscleSummary(sets, group, range), [sets, group, range]);
  const comparison = useMemo(
    () => muscleComparison(sets, previousSets, group),
    [sets, previousSets, group],
  );
  const evolutions = useMemo(() => exerciseEvolutions(direct), [direct]);
  const bucketing = bucketingFor(range);
  const buckets = useMemo(
    () => setsPerBucket(direct, range, bucketing),
    [direct, range, bucketing],
  );
  const steps = useMemo(
    () => nextStepForMuscle(evolutions, summary, nextPlannedDate),
    [evolutions, summary, nextPlannedDate],
  );

  const setsOf = useMemo(() => {
    const byKey = new Map<string, ResolvedSet[]>();
    for (const s of direct) {
      const key = comparabilityKeyOf(s);
      const list = byKey.get(key);
      if (list) list.push(s);
      else byKey.set(key, [s]);
    }
    return (key: string) => byKey.get(key) ?? [];
  }, [direct]);

  return (
    <section className="evo-muscle" aria-label={`Análise de ${muscleGroupLabel[group]}`}>
      <h3 className="evo-muscle-title">Análise de {muscleGroupLabel[group]}</h3>

      {summary.directSets === 0 ? (
        <p className="evo-note mt-1">
          Sem séries diretas registradas neste período. Isso descreve o registro — não conclui que
          você deixou de treinar.
        </p>
      ) : (
        <>
          <dl className="evo-stats mt-2">
            <div>
              <dt>Séries diretas</dt>
              <dd className="font-mono tabular-nums">{summary.directSets}</dd>
            </div>
            <div>
              <dt>Sessões</dt>
              <dd className="font-mono tabular-nums">{summary.sessions}</dd>
            </div>
            <div>
              <dt>Frequência</dt>
              <dd className="text-[15px]">{summary.frequencyText}</dd>
            </div>
            <div>
              <dt>Último registro</dt>
              <dd className="text-[15px]">
                {summary.lastDate ? formatDateShortBR(summary.lastDate) : "—"}
              </dd>
            </div>
          </dl>

          {summary.assistedSets > 0 && (
            <p className="evo-note">
              Participação secundária em outras {summary.assistedSets} séries — contadas à parte,
              nunca somadas ao volume direto.
            </p>
          )}

          <div className="evo-divider" />

          {/* Comparação factual: o número atual e o anterior, lado a lado. */}
          <p className="text-[11px] leading-relaxed">
            <span className="text-muted-foreground">Período atual: </span>
            <span className="font-mono tabular-nums">
              {comparison.current.sets} séries em {comparison.current.sessions}{" "}
              {comparison.current.sessions === 1 ? "sessão" : "sessões"}
            </span>
          </p>
          <p className="text-[11px] leading-relaxed">
            <span className="text-muted-foreground">Período anterior: </span>
            {comparison.previous ? (
              <span className="font-mono tabular-nums">
                {comparison.previous.sets} séries em {comparison.previous.sessions}{" "}
                {comparison.previous.sessions === 1 ? "sessão" : "sessões"}
              </span>
            ) : (
              <span className="text-muted-foreground">sem dados para comparar</span>
            )}
          </p>

          <div className="evo-divider" />

          <BucketChart title={BUCKET_TITLE[bucketing]} buckets={buckets} />
        </>
      )}

      <div className="evo-divider" />

      <ExerciseList
        evolutions={evolutions}
        setsOf={setsOf}
        records={records}
        openKey={openExerciseKey}
        onOpenKey={onOpenExerciseKey}
        open={exercisesOpen}
        onOpenChange={onExercisesOpenChange}
      />

      <div className="evo-divider" />

      <div className="evo-next">
        <p className="evo-next-title">
          <CalendarClock size={14} /> Próximo passo
        </p>
        <ul className="mt-1.5 space-y-1.5">
          {steps.map((step) => (
            <li key={step.text} className="flex items-start gap-2">
              <span className="min-w-0 flex-1 text-[11px] leading-relaxed">{step.text}</span>
              {step.action && (
                <button
                  onClick={() => onAction(step)}
                  className="interactive-press shrink-0 whitespace-nowrap text-[11px] font-semibold text-primary"
                >
                  {step.action.label} <ArrowRight size={11} className="inline" />
                </button>
              )}
            </li>
          ))}
        </ul>
        <p className="evo-note mt-1.5">
          Sugestões descritivas. Nada aqui altera carga, séries, exercícios ou programação.
        </p>
      </div>
    </section>
  );
}

/** Barras por intervalo. Intervalo vazio continua na tela — é a diferença
 * entre treinar toda semana e concentrar tudo em duas sessões. */
function BucketChart({
  title,
  buckets,
}: {
  title: string;
  buckets: ReturnType<typeof setsPerBucket>;
}) {
  const [picked, setPicked] = useState<string | null>(null);
  const max = Math.max(1, ...buckets.map((b) => b.sets));
  const chosen = buckets.find((b) => b.key === picked);

  return (
    <div>
      <p className="text-[11px] font-bold">{title}</p>
      <div className="evo-buckets mt-1.5" role="group" aria-label={title}>
        {buckets.map((bucket) => (
          <button
            key={bucket.key}
            onClick={() => setPicked(picked === bucket.key ? null : bucket.key)}
            aria-pressed={picked === bucket.key}
            aria-label={`${bucket.fullLabel}: ${bucket.sets} séries em ${bucket.sessions} sessões`}
            className="interactive-press"
          >
            <span
              className="evo-bucket-bar"
              data-empty={bucket.sets === 0 || undefined}
              style={{ height: `${Math.max(2, (bucket.sets / max) * 100)}%` }}
            />
            <small>{bucket.label}</small>
          </button>
        ))}
      </div>
      <p className="evo-note" aria-live="polite">
        {chosen
          ? `${chosen.fullLabel}: ${chosen.sets} ${chosen.sets === 1 ? "série direta" : "séries diretas"} em ${chosen.sessions} ${chosen.sessions === 1 ? "sessão" : "sessões"}.`
          : "Toque numa barra para ver o detalhe do intervalo."}
      </p>
    </div>
  );
}
