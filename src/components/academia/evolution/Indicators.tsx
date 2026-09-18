import { useState } from "react";
import { ChartNoAxesColumnIncreasing, TrendingUp, TriangleAlert } from "lucide-react";
import { equipmentLabel, type Frequency } from "@/lib/workout-evolution";
import {
  PROLONGED_STABILITY_SESSIONS,
  consistencyView,
  type ExerciseEvolution,
  type ProgressionIndicator,
} from "@/lib/workout-explorer";

// ---------------------------------------------------------------------------
// Três indicadores, e só três.
//
// Peso total acumulado saiu: somar carga × repetições de exercícios diferentes
// produz um número grande que não responde a nenhuma pergunta.
//
// Tocar num indicador abre, embaixo, a lista que sustenta o número — o caminho
// mais curto entre "2 exercícios precisam de atenção" e quais são eles.
// ---------------------------------------------------------------------------

type Key = "consistencia" | "progressao" | "atencao";

export function Indicators({
  frequency,
  progression,
  onOpenExercise,
}: {
  frequency: Frequency;
  progression: ProgressionIndicator;
  onOpenExercise: (exercise: ExerciseEvolution) => void;
}) {
  const [open, setOpen] = useState<Key | null>(null);
  const consistency = consistencyView(frequency);

  const cards = [
    {
      key: "consistencia" as const,
      label: "CONSISTÊNCIA",
      icon: ChartNoAxesColumnIncreasing,
      value: consistency.headline,
      detail: consistency.detail,
    },
    {
      key: "progressao" as const,
      label: "EM PROGRESSÃO",
      icon: TrendingUp,
      value: `${progression.improving} em progressão`,
      detail: `de ${progression.comparable} ${progression.comparable === 1 ? "comparável" : "comparáveis"}`,
    },
    {
      key: "atencao" as const,
      label: "ATENÇÃO",
      icon: TriangleAlert,
      value: `${progression.attention.length} ${progression.attention.length === 1 ? "exercício" : "exercícios"}`,
      detail: progression.attention.length ? "precisam de atenção" : "sem ponto a destacar",
    },
  ];

  return (
    <div>
      <div className="evo-kpis">
        {cards.map((card) => (
          <button
            key={card.key}
            className="evo-card evo-kpi"
            aria-expanded={open === card.key}
            onClick={() => setOpen(open === card.key ? null : card.key)}
          >
            <card.icon data-tone={card.key === "atencao" ? "warn" : undefined} />
            <small>{card.label}</small>
            <strong>{card.value}</strong>
            <span>{card.detail}</span>
          </button>
        ))}
      </div>

      {open && (
        <div className="evo-card mt-2 p-3" role="region" aria-label="Detalhe do indicador">
          {open === "consistencia" && (
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              {consistency.hasPlan ? (
                <>
                  {frequency.done}{" "}
                  {frequency.done === 1 ? "treino concluído" : "treinos concluídos"} contra{" "}
                  {frequency.planned} programados nas etapas do período.
                  {frequency.extra > 0 &&
                    ` ${frequency.extra} ${frequency.extra === 1 ? "sessão foi" : "sessões foram"} além do programado e não empurram o cumprimento acima de 100%.`}
                </>
              ) : (
                <>
                  {frequency.reason ??
                    "Sem programação histórica para comparar — mostramos o realizado."}{" "}
                  Uma porcentagem aqui seria inventada: a escala semanal atual não diz o que estava
                  previsto no passado.
                </>
              )}
            </p>
          )}

          {open === "progressao" && (
            <ExerciseHints
              items={progression.improvingList}
              onOpen={onOpenExercise}
              empty={
                progression.comparable === 0
                  ? "Nenhum exercício com duas sessões comparáveis no período."
                  : "Nenhum exercício acima da margem mínima de progressão no período."
              }
              note="Comparação válida = mesmo exercício, mesmo equipamento e pelo menos duas sessões registradas."
            />
          )}

          {open === "atencao" && (
            <ExerciseHints
              items={progression.attention}
              onOpen={onOpenExercise}
              empty="Nenhum exercício com redução registrada ou estabilidade prolongada."
              note={`Entram aqui: redução objetiva registrada, ou a mesma referência mantida em ${PROLONGED_STABILITY_SESSIONS} sessões ou mais. Não é diagnóstico de platô.`}
            />
          )}
        </div>
      )}
    </div>
  );
}

function ExerciseHints({
  items,
  onOpen,
  empty,
  note,
}: {
  items?: ExerciseEvolution[];
  onOpen?: (exercise: ExerciseEvolution) => void;
  empty: string;
  note: string;
}) {
  return (
    <>
      {items && items.length > 0 ? (
        <ul className="space-y-1">
          {items.map((item) => (
            <li key={item.key}>
              <button
                onClick={() => onOpen?.(item)}
                className="interactive-press flex w-full items-baseline justify-between gap-2 py-1 text-left"
              >
                <span className="min-w-0 flex-1 truncate text-xs font-semibold">{item.name}</span>
                <span className="shrink-0 text-[10px] text-muted-foreground">
                  {item.equipment ? equipmentLabel[item.equipment] : "—"} ·{" "}
                  {item.status === "estavel"
                    ? `${item.stableStreak} sessões estáveis`
                    : `${item.pct! > 0 ? "+" : ""}${item.pct!.toLocaleString("pt-BR", {
                        maximumFractionDigits: 1,
                      })}%`}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[11px] leading-relaxed text-muted-foreground">{empty}</p>
      )}
      <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">{note}</p>
    </>
  );
}
