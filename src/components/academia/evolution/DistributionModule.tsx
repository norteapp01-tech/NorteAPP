import { useState } from "react";
import { Modal } from "@/components/ui/modal";
import { formatDateShortBR } from "@/lib/goals-store";
import {
  muscleDistribution,
  workoutDistribution,
  UNCLASSIFIED,
  type FilteredData,
} from "@/lib/workout-evolution";
import { Bar, EmptyNote, ModuleCard } from "./shared";

// ---------------------------------------------------------------------------
// "Como você distribui seu treino" — um módulo só, com duas leituras.
//
// Grupos musculares: séries por grupo PRINCIPAL. Cada série entra em um grupo
// apenas, então a soma das barras é o total de séries registradas. Distribuir
// "Peito e tríceps" entre os dois seria suposição, e o total deixaria de bater.
//
// Treinos: sessões por identidade estável do treino. Duas fichas chamadas "A"
// em etapas diferentes não são o mesmo treino.
// ---------------------------------------------------------------------------

const INITIAL_BARS = 5;

export function DistributionModule({
  data,
  selectedMuscle,
  onSelectMuscle,
  selectedPlan,
  onSelectPlan,
}: {
  data: FilteredData;
  selectedMuscle: string | null;
  onSelectMuscle: (key: string) => void;
  selectedPlan: string | null;
  onSelectPlan: (lineageId: string) => void;
}) {
  const [view, setView] = useState<"musculos" | "treinos">("musculos");
  const [showAll, setShowAll] = useState(false);
  const [drill, setDrill] = useState<{ key: string; label: string } | null>(null);

  const bars =
    view === "musculos" ? muscleDistribution(data.sets) : workoutDistribution(data.sessions);
  const max = Math.max(1, ...bars.map((b) => b.value));
  const visible = showAll ? bars : bars.slice(0, INITIAL_BARS);
  const selected = view === "musculos" ? selectedMuscle : selectedPlan;

  return (
    <ModuleCard
      title="Como você distribui seu treino"
      action={
        <div className="flex gap-1">
          {(
            [
              ["musculos", "Grupos"],
              ["treinos", "Treinos"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              onClick={() => {
                setView(key);
                setShowAll(false);
              }}
              aria-pressed={view === key}
              className={`interactive-press rounded-md px-2 py-1 text-[10px] font-semibold ${
                view === key ? "bg-primary/15 text-primary" : "text-muted-foreground"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      }
    >
      {bars.length === 0 ? (
        <EmptyNote>Nenhuma série registrada no período com os filtros atuais.</EmptyNote>
      ) : (
        <>
          {view === "treinos" && (
            <p className="mb-1.5 text-[11px] font-semibold text-muted-foreground">
              Mais realizados
            </p>
          )}
          <div className="space-y-1">
            {visible.map((bar) => (
              <Bar
                key={bar.key}
                label={bar.label}
                value={bar.value}
                max={max}
                suffix={view === "musculos" ? "séries" : "sessões"}
                selected={selected === bar.key}
                onClick={() => {
                  if (view === "musculos") onSelectMuscle(bar.key);
                  else onSelectPlan(bar.key);
                  setDrill({ key: bar.key, label: bar.label });
                }}
              />
            ))}
          </div>

          {bars.length > INITIAL_BARS && (
            <button
              onClick={() => setShowAll((v) => !v)}
              className="interactive-press mt-2 text-[11px] font-semibold text-primary"
            >
              {showAll ? "Ver menos" : `Ver todos (${bars.length})`}
            </button>
          )}

          <p className="mt-2.5 text-[11px] leading-relaxed text-muted-foreground">
            {view === "musculos"
              ? "Distribuição por grupo principal; não representa todo o estímulo muscular. Exercícios sem classificação aparecem como “Não classificado”."
              : "Contado pela identidade do treino, não pela letra — duas fichas “A” de etapas diferentes são treinos diferentes."}
          </p>
        </>
      )}

      {drill && (
        <DrillDrawer
          data={data}
          view={view}
          barKey={drill.key}
          label={drill.label}
          onClose={() => setDrill(null)}
        />
      )}
    </ModuleCard>
  );
}

/** Revela os registros que formam aquele total — exercícios e séries para um
 * músculo, sessões para um treino. */
function DrillDrawer({
  data,
  view,
  barKey,
  label,
  onClose,
}: {
  data: FilteredData;
  view: "musculos" | "treinos";
  barKey: string;
  label: string;
  onClose: () => void;
}) {
  if (view === "musculos") {
    const sets = data.sets.filter((s) => (s.muscleGroup ?? UNCLASSIFIED) === barKey);
    const byExercise = new Map<string, { name: string; sets: number; sessions: Set<string> }>();
    for (const s of sets) {
      const found = byExercise.get(s.lineageId);
      if (found) {
        found.sets += 1;
        found.sessions.add(s.sessionId);
      } else {
        byExercise.set(s.lineageId, { name: s.name, sets: 1, sessions: new Set([s.sessionId]) });
      }
    }
    return (
      <Modal onClose={onClose} title={label}>
        <p className="text-xs text-muted-foreground">
          {sets.length} séries registradas, de {byExercise.size} exercícios.
        </p>
        <ul className="mt-3 space-y-1">
          {[...byExercise.values()]
            .sort((a, b) => b.sets - a.sets)
            .map((row) => (
              <li
                key={row.name}
                className="flex items-center justify-between gap-2 rounded-lg border border-border bg-surface-2 px-2.5 py-2 text-xs"
              >
                <span className="min-w-0 truncate">{row.name}</span>
                <span className="shrink-0 font-mono tabular-nums text-muted-foreground">
                  {row.sets} séries · {row.sessions.size} sessões
                </span>
              </li>
            ))}
        </ul>
      </Modal>
    );
  }

  const sessions = data.sessions.filter((s) => (s.planLineageId ?? s.planId) === barKey);
  return (
    <Modal onClose={onClose} title={label}>
      <p className="text-xs text-muted-foreground">{sessions.length} sessões concluídas.</p>
      <ul className="mt-3 space-y-1">
        {[...sessions]
          .sort((a, b) => b.date.localeCompare(a.date))
          .map((s) => {
            const sets = data.sets.filter((set) => set.sessionId === s.id);
            return (
              <li
                key={s.id}
                className="flex items-center justify-between gap-2 rounded-lg border border-border bg-surface-2 px-2.5 py-2 text-xs"
              >
                <span>{formatDateShortBR(s.date)}</span>
                <span className="shrink-0 font-mono tabular-nums text-muted-foreground">
                  {sets.length} séries
                </span>
              </li>
            );
          })}
      </ul>
    </Modal>
  );
}
