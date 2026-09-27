import { useMemo, useState } from "react";
import { ChevronRight, Search } from "lucide-react";
import type { MuscleGroup } from "@/lib/workout-store";
import {
  exerciseTrends,
  muscleGroupLabel,
  type ExerciseTrend,
  type FilteredData,
} from "@/lib/workout-evolution";
import { EmptyNote } from "./shared";

// ---------------------------------------------------------------------------
// "Sobrecarga progressiva" — uma linha por exercício com registros no período.
//
// Cada linha diz o que mudou de forma verificável, ou diz honestamente que não
// dá para comparar. Nunca compara exercícios diferentes entre si para eleger
// "o melhor": cargas de aparelhos distintos não se comparam.
// ---------------------------------------------------------------------------

const INITIAL = 4;

export function OverloadList({
  data,
  selectedMuscle,
  onOpen,
}: {
  data: FilteredData;
  selectedMuscle: MuscleGroup | null;
  onOpen: (lineageId: string) => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const [search, setSearch] = useState("");

  const trends = useMemo(() => exerciseTrends(data.sets), [data.sets]);

  const filtered = trends
    .filter((t) => (selectedMuscle ? t.muscleGroup === selectedMuscle : true))
    .filter((t) => t.name.toLowerCase().includes(search.trim().toLowerCase()));

  // Melhora registrada primeiro; sem comparação por último.
  const ordered = [...filtered].sort((a, b) => {
    const rank = (t: ExerciseTrend) =>
      t.kind === "melhora" ? 0 : t.kind === "queda" ? 1 : t.kind === "estavel" ? 2 : 3;
    return rank(a) - rank(b) || b.sessions - a.sessions;
  });

  const visible = showAll ? ordered : ordered.slice(0, INITIAL);

  return (
    <section className="evo-exercise-trends">
      {!selectedMuscle && <h2>Por exercício</h2>}
      <div>
        {selectedMuscle && (
          <p className="mb-2 rounded-lg bg-primary/10 px-2.5 py-1.5 text-[11px] font-semibold text-primary">
            Filtrado por {muscleGroupLabel[selectedMuscle]}
          </p>
        )}

        {trends.length > INITIAL && (
          <div className="relative mb-2">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar exercício"
              aria-label="Buscar exercício"
              className="w-full rounded-lg border border-border bg-surface py-2 pl-7 pr-2 text-xs outline-none focus:border-primary"
            />
          </div>
        )}

        {visible.length === 0 ? (
          <EmptyNote>
            {selectedMuscle
              ? `Nenhum exercício de ${muscleGroupLabel[selectedMuscle]} com registros neste período.`
              : "Nenhum exercício com séries registradas neste período."}
          </EmptyNote>
        ) : (
          <ul>
            {visible.map((t) => (
              <li key={`${t.lineageId}-${t.equipment ?? "x"}`}>
                <button onClick={() => onOpen(t.lineageId)} className="evo-row interactive-press">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{t.name}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {t.sessions} {t.sessions === 1 ? "sessão" : "sessões"}
                    </p>
                  </div>
                  <Spark values={t.spark} kind={t.kind} />
                  <span className={`evo-trend-label is-${t.kind}`}>{t.summary}</span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                </button>
              </li>
            ))}
          </ul>
        )}

        {ordered.length > INITIAL && (
          <button
            onClick={() => setShowAll((v) => !v)}
            className="interactive-press mt-2 text-[11px] font-semibold text-primary"
          >
            {showAll ? "Ver menos" : `Ver todos os exercícios (${ordered.length})`}
          </button>
        )}
      </div>
    </section>
  );
}

/** Minigráfico das sessões comparáveis. Sem pontos, nada é desenhado — uma
 * linha reta inventada sugeriria medições que não existem. */
function Spark({ values, kind }: { values: number[]; kind: ExerciseTrend["kind"] }) {
  if (values.length < 2) return <span className="w-14 shrink-0" aria-hidden />;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const points = values
    .map((v, i) => `${(i / (values.length - 1)) * 54},${20 - ((v - min) / span) * 16}`)
    .join(" ");
  return (
    <svg data-norte-chart="line" viewBox="0 0 54 22" className="h-6 w-14 shrink-0" aria-hidden>
      <polyline
        data-series="true"
        points={points}
        fill="none"
        stroke={kind === "estavel" ? "#eabf45" : kind === "queda" ? "#f87171" : "var(--evo-accent)"}
        strokeWidth="1.6"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
