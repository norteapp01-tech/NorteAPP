import { useState } from "react";
import type { MuscleGroup } from "@/lib/workout-store";
import { muscleGroupLabel, type ResolvedSet } from "@/lib/workout-evolution";
import { repetitionProfile } from "@/lib/workout-map";

export function RepetitionProfile({
  sets,
  muscle,
  onOpen,
}: {
  sets: ResolvedSet[];
  muscle: MuscleGroup | null;
  onOpen: (id: string) => void;
}) {
  const [selected, setSelected] = useState<number | null>(null);
  const bins = repetitionProfile(sets, muscle);
  return (
    <details className="evo-open-section">
      <summary>
        Perfil de repetições{" "}
        <span className="text-xs font-normal text-muted-foreground">
          {muscle ? muscleGroupLabel[muscle] : "Todos os músculos"}
        </span>
      </summary>
      <p className="my-3 text-xs text-muted-foreground">
        Como você distribuiu suas séries. Toque numa faixa para ver os exercícios.
      </p>
      {bins.map((bin, i) => (
        <div key={bin.label}>
          <button
            className="evo-profile-bar"
            aria-expanded={selected === i}
            onClick={() => setSelected(selected === i ? null : i)}
          >
            <span>{bin.label}</span>
            <span>
              {bin.count} séries · {bin.percent}%
            </span>
            <span className="evo-track">
              <i style={{ width: `${bin.percent}%` }} />
            </span>
          </button>
          {selected === i && (
            <div className="evo-profile-exercises">
              {bin.exercises.length ? (
                bin.exercises.map((e) => (
                  <button key={e.id} onClick={() => onOpen(e.id)}>
                    <span>{e.name}</span>
                    <span>{e.count} séries →</span>
                  </button>
                ))
              ) : (
                <p>Sem séries nesta faixa no período.</p>
              )}
            </div>
          )}
        </div>
      ))}
      <p className="mt-3 text-xs text-muted-foreground">
        As faixas descrevem os registros, não classificam força, hipertrofia ou resistência. O
        histórico atual não distingue aquecimento de séries de trabalho.
      </p>
    </details>
  );
}
