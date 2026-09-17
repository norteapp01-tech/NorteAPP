import { useState } from "react";
import type { MuscleGroup } from "@/lib/workout-store";
import { UNCLASSIFIED, type MuscleStimulus } from "@/lib/workout-evolution";
import { Bar } from "./shared";

// ---------------------------------------------------------------------------
// "Distribuição de séries" — radar com alternativa em barras.
//
// Representa a DISTRIBUIÇÃO DOS REGISTROS. Não é diagnóstico de simetria,
// equilíbrio postural nem risco de lesão.
//
// Escala comum a todos os eixos: normalizar cada eixo pelo próprio máximo faria
// um grupo com 2 séries parecer igual a outro com 30.
// ---------------------------------------------------------------------------

const SIZE = 220;
const CENTER = SIZE / 2;
const RADIUS = 78;
const RINGS = 4;

export function RadarDistribution({
  stimulus,
  selected,
  onSelect,
}: {
  stimulus: MuscleStimulus[];
  selected: MuscleGroup | null;
  onSelect: (group: MuscleGroup | null) => void;
}) {
  const [mode, setMode] = useState<"radar" | "barras">("radar");

  const axes = stimulus.filter((s) => s.group !== UNCLASSIFIED && s.directSets > 0);
  const unclassified = stimulus.find((s) => s.group === UNCLASSIFIED);
  const max = Math.max(1, ...axes.map((a) => a.directSets));

  if (axes.length === 0) {
    return (
      <p className="text-sm leading-relaxed text-muted-foreground">
        Nenhuma série classificada por grupo muscular no período. Classifique os exercícios na ficha
        do treino para ver a distribuição.
      </p>
    );
  }

  const point = (index: number, value: number) => {
    const angle = (Math.PI * 2 * index) / axes.length - Math.PI / 2;
    const r = (value / max) * RADIUS;
    return [CENTER + Math.cos(angle) * r, CENTER + Math.sin(angle) * r] as const;
  };

  return (
    <div>
      <div className="flex justify-end gap-1">
        {(
          [
            ["radar", "Radar"],
            ["barras", "Barras"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setMode(key)}
            aria-pressed={mode === key}
            className={`interactive-press rounded-md px-2 py-1 text-[10px] font-semibold ${
              mode === key ? "bg-primary/15 text-primary" : "text-muted-foreground"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {mode === "radar" ? (
        <div className="mt-2 flex justify-center">
          <svg
            viewBox={`0 0 ${SIZE} ${SIZE}`}
            className="h-56 w-full max-w-[260px]"
            role="img"
            aria-label={`Distribuição de séries: ${axes.map((a) => `${a.label} ${a.directSets}`).join(", ")}`}
          >
            {Array.from({ length: RINGS }, (_, i) => (
              <circle
                key={i}
                cx={CENTER}
                cy={CENTER}
                r={(RADIUS * (i + 1)) / RINGS}
                fill="none"
                stroke="var(--color-border)"
                strokeWidth="0.7"
              />
            ))}
            {axes.map((axis, i) => {
              const [x, y] = point(i, max);
              return (
                <line
                  key={`axis-${axis.group}`}
                  x1={CENTER}
                  y1={CENTER}
                  x2={x}
                  y2={y}
                  stroke="var(--color-border)"
                  strokeWidth="0.7"
                />
              );
            })}
            <polygon
              points={axes.map((a, i) => point(i, a.directSets).join(",")).join(" ")}
              fill="var(--color-primary)"
              fillOpacity="0.22"
              stroke="var(--color-primary)"
              strokeWidth="1.6"
            />
            {axes.map((axis, i) => {
              const [x, y] = point(i, max * 1.24);
              const isSelected = selected === axis.group;
              return (
                <g key={`label-${axis.group}`}>
                  <text
                    x={x}
                    y={y}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontSize="8"
                    fill={isSelected ? "var(--color-primary)" : "var(--color-muted-foreground)"}
                    fontWeight={isSelected ? 700 : 500}
                  >
                    {axis.label}
                  </text>
                  <text
                    x={x}
                    y={y + 9}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontSize="7.5"
                    fill="var(--color-foreground)"
                  >
                    {axis.directSets}
                  </text>
                  {/* Área de toque generosa sobre o rótulo do eixo. */}
                  <circle
                    cx={x}
                    cy={y + 4}
                    r="17"
                    fill="transparent"
                    role="button"
                    tabIndex={0}
                    aria-label={`${axis.label}: ${axis.directSets} séries diretas`}
                    aria-pressed={isSelected}
                    onClick={() => onSelect(isSelected ? null : (axis.group as MuscleGroup))}
                    onKeyDown={(e) => {
                      if (e.key !== "Enter" && e.key !== " ") return;
                      e.preventDefault();
                      onSelect(isSelected ? null : (axis.group as MuscleGroup));
                    }}
                    style={{ cursor: "pointer" }}
                  />
                </g>
              );
            })}
          </svg>
        </div>
      ) : (
        <div className="mt-2 space-y-1">
          {axes.map((axis) => (
            <Bar
              key={axis.group}
              label={axis.label}
              value={axis.directSets}
              max={max}
              suffix="séries"
              selected={selected === axis.group}
              onClick={() => onSelect(selected === axis.group ? null : (axis.group as MuscleGroup))}
            />
          ))}
        </div>
      )}

      {axes.some((a) => a.assistedSets > 0) && (
        <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
          Participação como músculo secundário aparece à parte, ao selecionar o grupo — somar a
          série inteira em cada músculo inflaria o total.
        </p>
      )}
      {unclassified && unclassified.directSets > 0 && (
        <p className="mt-1 text-[11px] text-warning">
          {unclassified.directSets} séries de exercícios sem grupo definido ficam fora do radar.
        </p>
      )}
      <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
        Distribuição dos registros deste período, na mesma escala para todos os grupos. Não é
        diagnóstico de simetria, postura nem risco de lesão.
      </p>
    </div>
  );
}
