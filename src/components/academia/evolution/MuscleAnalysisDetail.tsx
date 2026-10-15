import { useState } from "react";
import { formatDateShortBR } from "@/lib/goals-store";
import { updateExercise, useWorkoutStore } from "@/lib/workout-store";
import type {
  CompletionResult,
  EvolutionResult,
  ProgressionSuggestion,
} from "@/lib/muscle-analysis/types";
import { COMPLETION_STATUS_TEXT } from "@/lib/muscle-analysis/scale";
import type { RadarMode } from "./RadarDistribution";
import { STATUS_COLOR } from "./radar-colors";

const fmt = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
const CONF = { alta: "Confiança alta", media: "Confiança média", baixa: "Poucos dados" } as const;
const KIND = {
  nao_realizado: "treino não realizado",
  pulado: "pulado",
  parcial: "incompleto",
} as const;

/** Detalhamento do músculo tocado no radar: como a nota foi calculada. */
export function MuscleAnalysisDetail({
  mode,
  completion,
  evolution,
}: {
  mode: RadarMode;
  completion?: CompletionResult;
  evolution?: EvolutionResult;
}) {
  const name = completion?.muscleName ?? evolution?.muscleName ?? "";
  if (mode === "evolucao") {
    return (
      <div className="evo-analysis" aria-live="polite">
        <div className="evo-analysis-head">
          <h3>{name}</h3>
          {evolution && !evolution.insufficientData ? (
            <strong>{fmt(evolution.score!)} / 10</strong>
          ) : (
            <strong className="text-muted-foreground">—</strong>
          )}
        </div>
        {!evolution || evolution.insufficientData ? (
          <p className="evo-analysis-text">Dados insuficientes para calcular a evolução.</p>
        ) : (
          <>
            <p className="evo-analysis-lead">
              {evolution.label}: {evolution.evolutionPercentage! > 0 ? "+" : ""}
              {fmt(evolution.evolutionPercentage!)}% contra o período anterior ·{" "}
              {CONF[evolution.confidence]}
            </p>
            <ul className="evo-analysis-list">
              {evolution.exercises.map((e) => (
                <li key={e.lineageId + e.metric}>
                  <span>
                    {e.name}
                    {e.weight < 1 && <em> · secundário</em>}
                  </span>
                  <span>
                    {e.metric === "forca_estimada"
                      ? `${fmt(e.previous)} → ${fmt(e.current)} kg est.`
                      : `${fmt(e.previous)} → ${fmt(e.current)} reps`}{" "}
                    ·{" "}
                    <b className={e.percentage >= 0 ? "text-primary" : "text-warning"}>
                      {e.percentage > 0 ? "+" : ""}
                      {fmt(e.percentage)}%
                    </b>
                  </span>
                </li>
              ))}
            </ul>
            <p className="evo-analysis-text">{evolution.explanation}</p>
          </>
        )}
      </div>
    );
  }

  if (!completion || completion.insufficientData) {
    return (
      <div className="evo-analysis" aria-live="polite">
        <div className="evo-analysis-head">
          <h3>{name}</h3>
          <strong className="text-muted-foreground">—</strong>
        </div>
        <p className="evo-analysis-text">
          Nada planejado para este músculo no período — não há o que cumprir.
        </p>
      </div>
    );
  }

  const c = completion;
  const delta =
    c.previousScore !== null ? Math.round((c.score! - c.previousScore) * 10) / 10 : null;
  const p = c.plannedVolume;
  const d = c.completedVolume;
  return (
    <div className="evo-analysis" aria-live="polite">
      <div className="evo-analysis-head">
        <h3>{c.muscleName}</h3>
        <strong style={{ color: STATUS_COLOR[c.status!] }}>{fmt(c.score!)} / 10</strong>
      </div>
      <p className="evo-analysis-lead">
        <span style={{ color: STATUS_COLOR[c.status!] }}>{COMPLETION_STATUS_TEXT[c.status!]}</span>{" "}
        · {fmt(c.completionPercentage!)}% do planejado
        {delta !== null && (
          <span className="text-muted-foreground">
            {" "}
            ·{" "}
            {delta === 0
              ? "igual ao período anterior"
              : `${delta > 0 ? "+" : ""}${fmt(delta)} vs período anterior`}
          </span>
        )}
      </p>

      <dl className="evo-analysis-grid">
        <div>
          <dt>Treinos</dt>
          <dd>
            {d.sessions} de {p.sessions}
          </dd>
        </div>
        <div>
          <dt>Exercícios completos</dt>
          <dd>
            {d.exercises} de {p.exercises}
          </dd>
        </div>
        <div>
          <dt>Séries</dt>
          <dd>
            {d.sets} de {p.sets}
          </dd>
        </div>
        <div>
          <dt>Repetições</dt>
          <dd>
            {d.reps} de {p.reps}
          </dd>
        </div>
      </dl>

      {c.eligibleForProgression && <Progression items={c.progression} />}

      {c.incomplete.length > 0 && (
        <>
          <p className="evo-analysis-sub">O que ficou para trás</p>
          <ul className="evo-analysis-list">
            {c.incomplete.slice(0, 6).map((i, idx) => (
              <li key={`${i.name}-${i.date}-${idx}`}>
                <span>
                  {i.name} · {formatDateShortBR(i.date)}
                </span>
                <span className="text-muted-foreground">
                  {i.kind !== "parcial"
                    ? KIND[i.kind]
                    : i.setsDone < i.setsPlanned
                      ? `${i.setsDone}/${i.setsPlanned} séries`
                      : `${i.repsDone}/${i.repsPlanned} reps`}
                </span>
              </li>
            ))}
          </ul>
          {c.incomplete.length > 6 && (
            <p className="evo-analysis-text">e mais {c.incomplete.length - 6}.</p>
          )}
        </>
      )}

      {c.planShareNote && <p className="evo-analysis-note">{c.planShareNote}</p>}
      <p className="evo-analysis-text">
        {c.explanation} {CONF[c.confidence]}.
      </p>
    </div>
  );
}

/** Estado dourado: recomenda, nunca altera sozinho. A pessoa confirma a nova meta. */
function Progression({ items }: { items: ProgressionSuggestion[] }) {
  const exercises = useWorkoutStore((s) => s.exercises);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [done, setDone] = useState<Record<string, boolean>>({});
  const [error, setError] = useState("");
  const apply = async (item: ProgressionSuggestion) => {
    const live = exercises.find((e) => e.id === item.exerciseId);
    if (!live || item.suggestedLoad === undefined) return;
    setError("");
    try {
      await updateExercise(live.id, {
        loadTarget: item.suggestedLoad,
        setTargets: (live.setTargets ?? []).map((t) => ({ ...t, weight: item.suggestedLoad! })),
      });
      setDone((x) => ({ ...x, [item.lineageId]: true }));
      setConfirming(null);
    } catch {
      setError("Não foi possível atualizar a meta. Tente de novo.");
    }
  };
  return (
    <div className="evo-progression">
      <p>
        <b>Você cumpriu o treino e atingiu o topo da faixa de repetições.</b> Considere progredir a
        carga ou atualizar a meta.
      </p>
      <ul>
        {items.map((i) => (
          <li key={i.lineageId}>
            <span>
              {i.name} · {i.repsTarget} reps
              {i.currentLoad > 0 ? ` com ${fmt(i.currentLoad)} kg` : ""}
            </span>
            {done[i.lineageId] ? (
              <span className="text-primary">Meta atualizada</span>
            ) : i.suggestedLoad !== undefined && i.exerciseId ? (
              confirming === i.lineageId ? (
                <span className="flex gap-2">
                  <button onClick={() => apply(i)} className="evo-progression-confirm">
                    Confirmar {fmt(i.suggestedLoad)} kg
                  </button>
                  <button onClick={() => setConfirming(null)} className="text-muted-foreground">
                    cancelar
                  </button>
                </span>
              ) : (
                <button
                  onClick={() => setConfirming(i.lineageId)}
                  className="evo-progression-action"
                >
                  Subir para {fmt(i.suggestedLoad)} kg
                </button>
              )
            ) : (
              <span className="text-muted-foreground">Aumente repetições ou carga na ficha</span>
            )}
          </li>
        ))}
      </ul>
      {error && <p className="text-warning">{error}</p>}
    </div>
  );
}
