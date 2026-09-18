import { useId, useState } from "react";
import type { MuscleGroup } from "@/lib/workout-store";
import { muscleGroupLabel, type MuscleStimulus } from "@/lib/workout-evolution";
import type { MuscleEvolution } from "@/lib/workout-explorer";
import { ATLAS_HEIGHT, ATLAS_WIDTH, BACK, FRONT, HEAD, MAPPED_GROUPS, STRUCTURE } from "./anatomy";

// ---------------------------------------------------------------------------
// Mapa corporal — dois modos sobre o MESMO atlas.
//
// "Estímulo" mostra quantas séries diretas foram registradas. "Evolução"
// mostra a progressão dos exercícios associados ao músculo. Não existe um
// terceiro modo de frequência: frequência é assunto da análise do músculo,
// onde cabe a frase inteira.
//
// O que a cor NÃO diz, em nenhum dos dois modos: recuperação, risco de lesão,
// faixa ideal de volume, força isolada de um músculo. A legenda diz exatamente
// o que a escala representa, e região sem registro fica neutra.
// ---------------------------------------------------------------------------

export type BodyMode = "estimulo" | "evolucao";
export type BodyView = "frente" | "costas";

const STIMULUS_STEPS = [
  { at: 0.34, color: "var(--evo-stim-1)", label: "Menos séries" },
  { at: 0.67, color: "var(--evo-stim-2)", label: "Intermediário" },
  { at: 1, color: "var(--evo-stim-3)", label: "Mais séries" },
];

const EVOLUTION_LEGEND = [
  { color: "var(--evo-up)", label: "Progressão" },
  { color: "var(--evo-flat)", label: "Estável" },
  { color: "var(--evo-down)", label: "Redução" },
  { color: "var(--evo-none)", label: "Sem comparação" },
  { color: "var(--evo-empty)", label: "Sem registros" },
];

export function BodyAtlas({
  mode,
  onModeChange,
  stimulus,
  evolution,
  selected,
  onSelect,
}: {
  mode: BodyMode;
  onModeChange: (mode: BodyMode) => void;
  stimulus: MuscleStimulus[];
  evolution: MuscleEvolution[];
  selected: MuscleGroup | null;
  onSelect: (group: MuscleGroup | null) => void;
}) {
  const [view, setView] = useState<BodyView>("frente");
  const uid = useId().replace(/:/g, "");
  const regions = view === "frente" ? FRONT : BACK;

  const stimulusOf = new Map(stimulus.map((s) => [s.group, s]));
  const evolutionOf = new Map(evolution.map((e) => [e.group, e]));
  const maxSets = Math.max(1, ...stimulus.map((s) => s.directSets));

  /** Cor do preenchimento. Sem registro é sempre neutro, nos dois modos. */
  const fillOf = (group: MuscleGroup): string => {
    const sets = stimulusOf.get(group)?.directSets ?? 0;
    if (sets === 0) return "var(--evo-empty)";
    if (mode === "estimulo") {
      const ratio = sets / maxSets;
      return (STIMULUS_STEPS.find((s) => ratio <= s.at) ?? STIMULUS_STEPS.at(-1)!).color;
    }
    const state = evolutionOf.get(group);
    if (!state || state.status === "sem_dados") return "var(--evo-none)";
    if (state.status === "progressao") return "var(--evo-up)";
    if (state.status === "queda") return "var(--evo-down)";
    if (state.status === "estavel") return "var(--evo-flat)";
    return "var(--evo-none)";
  };

  /** Texto do leitor de tela: sempre o número, nunca só a cor. */
  const describe = (group: MuscleGroup): string => {
    const sets = stimulusOf.get(group)?.directSets ?? 0;
    if (mode === "estimulo") {
      return sets === 0
        ? `${muscleGroupLabel[group]}: sem registros no período`
        : `${muscleGroupLabel[group]}: ${sets} ${sets === 1 ? "série direta" : "séries diretas"}`;
    }
    const state = evolutionOf.get(group);
    if (!state || state.status === "sem_dados" || state.medianPct === null) {
      return `${muscleGroupLabel[group]}: sem comparação no período`;
    }
    const pct = state.medianPct;
    return `${muscleGroupLabel[group]}: ${pct > 0 ? "+" : ""}${pct.toLocaleString("pt-BR", {
      maximumFractionDigits: 1,
    })}% em ${state.comparable} de ${state.total} exercícios comparáveis`;
  };

  const toggle = (group: MuscleGroup) => onSelect(selected === group ? null : group);

  const selectedState = selected ? evolutionOf.get(selected) : undefined;

  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <div className="evo-seg" role="group" aria-label="Modo do mapa">
          {(
            [
              ["estimulo", "Estímulo"],
              ["evolucao", "Evolução"],
            ] as const
          ).map(([key, label]) => (
            <button key={key} aria-pressed={mode === key} onClick={() => onModeChange(key)}>
              {label}
            </button>
          ))}
        </div>
        <div className="evo-seg" role="group" aria-label="Vista do corpo">
          {(
            [
              ["frente", "Frente"],
              ["costas", "Costas"],
            ] as const
          ).map(([key, label]) => (
            <button key={key} aria-pressed={view === key} onClick={() => setView(key)}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="evo-atlas mt-3">
        <svg
          /* Recortado no corpo: a margem morta embaixo só empurrava o resto da
             página para longe. */
          viewBox={`4 2 ${ATLAS_WIDTH - 8} ${ATLAS_HEIGHT - 26}`}
          role="group"
          aria-label={`Mapa muscular, vista ${view}, modo ${mode === "estimulo" ? "estímulo" : "evolução"}`}
        >
          <defs>
            {/* Volume discreto: um degradê sobre a figura inteira, sem borrão
                nem halo. Não captura toque. */}
            <linearGradient id={`shade-${uid}`} x1="0" y1="0" x2="1" y2="0.6">
              <stop offset="0%" stopColor="#ffffff" stopOpacity="0.1" />
              <stop offset="45%" stopColor="#ffffff" stopOpacity="0.02" />
              <stop offset="100%" stopColor="#000000" stopOpacity="0.22" />
            </linearGradient>
          </defs>

          <ellipse
            cx={HEAD.cx}
            cy={HEAD.cy}
            rx={HEAD.rx}
            ry={HEAD.ry}
            className="evo-atlas-structure"
          />
          {STRUCTURE.map((d, i) => (
            <path key={`structure-${i}`} d={d} className="evo-atlas-structure" />
          ))}

          {regions.map((region) => {
            const active = selected === region.group;
            return (
              <path
                key={`${view}-${region.group}`}
                d={region.d}
                className="evo-atlas-region"
                data-selected={active || undefined}
                fill={fillOf(region.group)}
                role="button"
                tabIndex={0}
                aria-pressed={active}
                aria-label={describe(region.group)}
                onClick={() => toggle(region.group)}
                onKeyDown={(e) => {
                  if (e.key !== "Enter" && e.key !== " ") return;
                  e.preventDefault();
                  toggle(region.group);
                }}
              />
            );
          })}

          <rect
            x="0"
            y="0"
            width={ATLAS_WIDTH}
            height={ATLAS_HEIGHT}
            fill={`url(#shade-${uid})`}
            pointerEvents="none"
          />
        </svg>
      </div>

      <p className="mt-2 text-center text-[11px] text-muted-foreground" aria-live="polite">
        {selected ? describe(selected) : "Toque em um músculo para analisar."}
      </p>
      {selected && selectedState?.limited && (
        <p className="mt-0.5 text-center text-[10px] text-warning">
          Dados limitados · 1 exercício comparável
        </p>
      )}

      <div className="evo-legend-row mt-3">
        {(mode === "estimulo"
          ? [...STIMULUS_STEPS, { color: "var(--evo-empty)", label: "Sem registros" }]
          : EVOLUTION_LEGEND
        ).map((item) => (
          <span key={item.label}>
            <i style={{ background: item.color }} aria-hidden />
            {item.label}
          </span>
        ))}
      </div>

      <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">
        {mode === "estimulo"
          ? "A escala compara a quantidade de séries diretas entre os seus próprios músculos no período. Não indica recuperação, risco de lesão nem faixa ideal de volume."
          : `Progressão registrada nos exercícios associados ao músculo — não é a força isolada do músculo. Variações de até ${"2,5"}% contam como estáveis. Uma redução registrada não é atribuída a fadiga, lesão ou erro de treino.`}
      </p>

      {/* O corpo não pode ser a única forma de escolher um músculo. */}
      <label className="mt-3 block">
        <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Ou escolha pelo nome
        </span>
        <select
          className="w-full"
          aria-label="Selecionar músculo"
          value={selected ?? ""}
          onChange={(e) => onSelect((e.target.value || null) as MuscleGroup | null)}
        >
          <option value="">Todos os músculos</option>
          {MAPPED_GROUPS.map((group) => (
            <option key={group} value={group}>
              {muscleGroupLabel[group]}
              {` — ${stimulusOf.get(group)?.directSets ?? 0} séries`}
            </option>
          ))}
          {/* Fora do corpo, mas existem como classificação. */}
          <optgroup label="Sem região no mapa">
            {(["corpo_inteiro", "cardio"] as MuscleGroup[]).map((group) => (
              <option key={group} value={group}>
                {muscleGroupLabel[group]}
                {` — ${stimulusOf.get(group)?.directSets ?? 0} séries`}
              </option>
            ))}
          </optgroup>
        </select>
      </label>
    </div>
  );
}
