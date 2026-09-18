import { useMemo, useState } from "react";
import { formatDateShortBR } from "@/lib/goals-store";
import {
  availableReferences,
  equipmentLabel,
  exerciseChartSeries,
  type ChartMode,
  type PersonalRecord,
  type ResolvedSet,
} from "@/lib/workout-evolution";
import {
  bestPerformance,
  sessionsOfExercise,
  type ExerciseEvolution,
} from "@/lib/workout-explorer";
import { LoadRepsChart } from "./LoadRepsChart";
import { Disclosure } from "./shared";

// ---------------------------------------------------------------------------
// Análise de um exercício, aberta NA PRÓPRIA LINHA da lista.
//
// Começa com quatro números e um gráfico. O que é avançado — comparar séries
// equivalentes, ver todas as séries — fica em gavetas fechadas, porque deixar
// tudo aberto transformava a página numa parede de controles.
//
// Toda frase aqui descreve o registro. Carga menor não vira "fadiga", carga
// maior não vira "hipertrofia".
// ---------------------------------------------------------------------------

const BASIS_NOTE: Record<ExerciseEvolution["basis"], string> = {
  forca_estimada: "Comparação por força estimada entre a primeira e a última sessão do período.",
  carga: "Sem força estimada para todas as sessões — a comparação usa a carga registrada.",
  repeticoes:
    "Exercício sem carga externa registrada: a comparação usa repetições, e força estimada não se aplica.",
  nenhuma: "Sem duas sessões comparáveis no período.",
};

export function ExerciseAnalysis({
  evolution,
  sets,
  records,
  onOpenSession,
}: {
  evolution: ExerciseEvolution;
  /** Séries já recortadas por linhagem + equipamento. */
  sets: ResolvedSet[];
  records: PersonalRecord[];
  onOpenSession?: (sessionId: string) => void;
}) {
  const last = evolution.sessions.at(-1) ?? null;
  const best = bestPerformance(evolution.sessions);
  const showEstimate = evolution.basis === "forca_estimada";
  const unit = "kg";

  return (
    <div className="evo-analysis">
      <dl className="evo-stats">
        <Stat
          label="Último"
          value={last ? `${last.weight} ${unit} × ${last.reps}` : "—"}
          note={last ? formatDateShortBR(last.date) : "Sem registro"}
        />
        <Stat
          label="Melhor"
          value={best ? `${best.weight} ${unit} × ${best.reps}` : "—"}
          note={best ? formatDateShortBR(best.date) : "Sem registro"}
        />
        <Stat
          label={showEstimate ? "Evolução estimada" : "Evolução"}
          value={
            evolution.pct === null
              ? "—"
              : `${evolution.pct > 0 ? "+" : ""}${evolution.pct.toLocaleString("pt-BR", {
                  maximumFractionDigits: 1,
                })}%`
          }
          note={evolution.pct === null ? "Sem comparação" : "no período"}
          tone={
            evolution.status === "progressao"
              ? "up"
              : evolution.status === "queda"
                ? "down"
                : undefined
          }
        />
        <Stat
          label="Sessões"
          value={String(evolution.sessions.length)}
          note={
            evolution.equipment ? equipmentLabel[evolution.equipment] : "Equipamento não informado"
          }
        />
      </dl>

      <p className="evo-note">{BASIS_NOTE[evolution.basis]}</p>

      {evolution.sessions.length >= 2 ? (
        <LoadRepsChart sessions={evolution.sessions} showEstimate={showEstimate} />
      ) : (
        <p className="evo-note mt-2">
          Uma sessão registrada no período. Com duas dá para desenhar a comparação.
        </p>
      )}

      <Disclosure title="Comparar séries equivalentes" hint="avançado">
        <EquivalentSets sets={sets} />
      </Disclosure>

      <Disclosure title="Ver séries e sessões">
        <History sets={sets} records={records} onOpenSession={onOpenSession} />
      </Disclosure>
    </div>
  );
}

function Stat({
  label,
  value,
  note,
  tone,
}: {
  label: string;
  value: string;
  note: string;
  tone?: "up" | "down";
}) {
  return (
    <div>
      <dt>{label}</dt>
      <dd data-tone={tone} className="font-mono tabular-nums">
        {value}
      </dd>
      <small>{note}</small>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Comparação por referência exata — a função antiga, preservada inteira.
// ---------------------------------------------------------------------------

function EquivalentSets({ sets }: { sets: ResolvedSet[] }) {
  const lineageId = sets[0]?.lineageId ?? "";
  const [mode, setMode] = useState<ChartMode>("carga");
  const [reference, setReference] = useState<number | null>(null);

  const references = useMemo(
    () => availableReferences(sets, lineageId, mode),
    [sets, lineageId, mode],
  );
  const effective = references.some((r) => r.value === reference)
    ? reference!
    : (references[0]?.value ?? null);
  const points = useMemo(
    () =>
      effective === null
        ? []
        : exerciseChartSeries(sets, lineageId, mode, effective, sets[0]?.equipment),
    [sets, lineageId, mode, effective],
  );

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="evo-seg" role="group" aria-label="Tipo de comparação">
          {(
            [
              ["carga", "Carga com X reps"],
              ["repeticoes", "Reps com X kg"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              aria-pressed={mode === key}
              onClick={() => {
                setMode(key);
                setReference(null);
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <select
          aria-label={mode === "carga" ? "Número de repetições" : "Carga"}
          value={effective ?? ""}
          onChange={(e) => setReference(Number(e.target.value))}
        >
          {references.length === 0 && <option value="">Sem referência</option>}
          {references.map((r) => (
            <option key={r.value} value={r.value}>
              {mode === "carga" ? `${r.value} reps` : `${r.value} kg`} ({r.sessions})
            </option>
          ))}
        </select>
      </div>

      <p className="evo-note mt-2">
        {effective === null
          ? "Sem registros suficientes para uma referência exata."
          : mode === "carga"
            ? `Carga registrada com exatamente ${effective} repetições.`
            : `Repetições registradas com exatamente ${effective} kg.`}
      </p>

      {points.length > 0 && (
        <ul className="evo-chart-rows mt-2">
          {points.map((p) => (
            <li key={p.sessionId}>
              <span className="text-muted-foreground">{formatDateShortBR(p.date)}</span>
              <span className="min-w-0 flex-1 truncate text-muted-foreground">{p.planLabel}</span>
              <span className="font-mono font-semibold tabular-nums">
                {p.value} {mode === "carga" ? "kg" : "reps"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Histórico completo
// ---------------------------------------------------------------------------

function History({
  sets,
  records,
  onOpenSession,
}: {
  sets: ResolvedSet[];
  records: PersonalRecord[];
  onOpenSession?: (sessionId: string) => void;
}) {
  const grouped = useMemo(() => sessionsOfExercise(sets), [sets]);
  const recordBySession = new Map(records.map((r) => [r.sessionId, r]));

  if (grouped.length === 0) {
    return <p className="evo-note">Nenhuma série registrada neste recorte.</p>;
  }

  return (
    <ul className="space-y-2">
      {grouped.map((group) => {
        const record = recordBySession.get(group.sessionId);
        return (
          <li key={group.sessionId} className="evo-history">
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-xs font-bold">{formatDateShortBR(group.date)}</p>
              <p className="min-w-0 truncate text-[10px] text-muted-foreground">
                {group.planLabel}
              </p>
            </div>
            {record && (
              <p className="mt-0.5 text-[10px] font-semibold text-success">
                {record.kind === "carga"
                  ? `Recorde de carga: ${record.weight} kg em ${record.reps} reps (antes ${record.previousWeight} kg)`
                  : `Recorde de repetições: ${record.reps} com ${record.weight} kg (antes ${record.previousReps})`}
              </p>
            )}
            <ul className="mt-1.5 space-y-1">
              {group.sets.map((s) => (
                <li key={s.setIndex} className="evo-set-row">
                  <span className="text-muted-foreground">Série {s.setIndex + 1}</span>
                  <span className="font-mono tabular-nums">
                    {s.weight} kg × {s.reps}
                  </span>
                </li>
              ))}
            </ul>
            {onOpenSession && (
              <button
                onClick={() => onOpenSession(group.sessionId)}
                className="interactive-press mt-1.5 text-[11px] font-semibold text-primary"
              >
                Abrir a sessão →
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
