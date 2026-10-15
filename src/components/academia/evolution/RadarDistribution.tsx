import { useState } from "react";
import type { MuscleGroup } from "@/lib/workout-store";
import type {
  CompletionResult,
  CompletionStatus,
  EvolutionResult,
} from "@/lib/muscle-analysis/types";
import { COMPLETION_STATUS_TEXT } from "@/lib/muscle-analysis/scale";
import { Bar } from "./shared";
import { STATUS_COLOR } from "./radar-colors";

// ---------------------------------------------------------------------------
// Radar por músculo — o mesmo desenho de antes, com dois modos:
// - Cumprimento: 10 = 100% do treino PLANEJADO para o músculo (não um ideal universal).
// - Evolução: desempenho atual contra o próprio histórico (período anterior).
// Escala fixa 0–10 em todos os eixos. Estado nunca só por cor: forma + texto.
// ---------------------------------------------------------------------------

export type RadarMode = "cumprimento" | "evolucao";

const SIZE = 220;
const CENTER = SIZE / 2;
const RADIUS = 78;
const RINGS = 4;
const MAX = 10;

const EVOLUTION_COLOR = "var(--color-primary)";

const fmt = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 1 });

/** Forma do ponto por status (acessível sem cor). */
function Marker({
  status,
  x,
  y,
  missing,
}: {
  status: CompletionStatus | "evolucao" | null;
  x: number;
  y: number;
  missing?: boolean;
}) {
  if (missing || !status)
    return (
      <circle
        cx={x}
        cy={y}
        r="3.4"
        fill="var(--color-background)"
        stroke="var(--color-muted-foreground)"
        strokeDasharray="1.5 1.5"
      />
    );
  const c = status === "evolucao" ? EVOLUTION_COLOR : STATUS_COLOR[status];
  switch (status) {
    case "atencao":
      return <path d={`M${x} ${y - 4.4} L${x + 4.2} ${y + 3} L${x - 4.2} ${y + 3} Z`} fill={c} />;
    case "abaixo":
      return (
        <circle cx={x} cy={y} r="3.4" fill="var(--color-background)" stroke={c} strokeWidth="1.6" />
      );
    case "proximo":
      return (
        <rect
          x={x - 3.2}
          y={y - 3.2}
          width="6.4"
          height="6.4"
          transform={`rotate(45 ${x} ${y})`}
          fill={c}
        />
      );
    case "progredir": {
      const pts = Array.from({ length: 10 }, (_, i) => {
        const r = i % 2 ? 2.3 : 5.2;
        const a = (Math.PI / 5) * i - Math.PI / 2;
        return `${x + Math.cos(a) * r},${y + Math.sin(a) * r}`;
      }).join(" ");
      return <polygon points={pts} fill={c} />;
    }
    case "meta":
      return (
        <g>
          <circle cx={x} cy={y} r="4.2" fill={c} />
          <path
            d={`M${x - 2} ${y} l1.4 1.5 l2.8 -3`}
            stroke="var(--color-background)"
            strokeWidth="1.2"
            fill="none"
          />
        </g>
      );
    default:
      return <circle cx={x} cy={y} r="3.6" fill={c} />;
  }
}

type Axis = {
  group: MuscleGroup;
  label: string;
  value: number | null;
  status: CompletionStatus | "evolucao" | null;
  caption: string;
};

export function RadarDistribution({
  completion,
  evolution,
  mode,
  onModeChange,
  selected,
  onSelect,
}: {
  completion: CompletionResult[];
  evolution: EvolutionResult[];
  mode: RadarMode;
  onModeChange: (m: RadarMode) => void;
  selected: MuscleGroup | null;
  onSelect: (group: MuscleGroup | null) => void;
}) {
  const [view, setView] = useState<"radar" | "barras">("radar");

  // Mesmos músculos e mesma ordem nos dois modos: a troca não embaralha o radar.
  const groups = [
    ...new Set([...completion.map((c) => c.muscleId), ...evolution.map((e) => e.muscleId)]),
  ];
  const order = (g: MuscleGroup) =>
    completion.findIndex((c) => c.muscleId === g) +
    evolution.findIndex((e) => e.muscleId === g) * 0.001;
  groups.sort((a, b) => order(a) - order(b));
  const axes: Axis[] = groups.map((g) => {
    if (mode === "cumprimento") {
      const c = completion.find((x) => x.muscleId === g);
      return {
        group: g,
        label: c?.muscleName ?? evolution.find((e) => e.muscleId === g)!.muscleName,
        value: c?.score ?? null,
        status: c?.status ?? null,
        caption: c?.score != null ? fmt(c.score) : "—",
      };
    }
    const e = evolution.find((x) => x.muscleId === g);
    return {
      group: g,
      label: e?.muscleName ?? completion.find((c) => c.muscleId === g)!.muscleName,
      value: e?.score ?? null,
      status: e?.score != null ? "evolucao" : null,
      caption:
        e?.evolutionPercentage != null
          ? `${e.evolutionPercentage > 0 ? "+" : ""}${fmt(e.evolutionPercentage)}%`
          : "s/ dados",
    };
  });

  if (axes.length === 0) {
    return (
      <p className="text-sm leading-relaxed text-muted-foreground">
        Nenhum exercício planejado ou registrado com grupo muscular no período. Classifique os
        exercícios na ficha do treino para ver o gráfico.
      </p>
    );
  }

  const point = (index: number, value: number) => {
    const angle = (Math.PI * 2 * index) / axes.length - Math.PI / 2;
    const r = (Math.max(0, Math.min(MAX, value)) / MAX) * RADIUS;
    return [CENTER + Math.cos(angle) * r, CENTER + Math.sin(angle) * r] as const;
  };
  const known = axes.map((a, i) => ({ a, i })).filter((x) => x.a.value !== null);
  const toggle = (g: MuscleGroup) => onSelect(selected === g ? null : g);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="evo-radar-modes" role="group" aria-label="Modo do gráfico">
          {(
            [
              ["cumprimento", "Cumprimento do treino"],
              ["evolucao", "Evolução de desempenho"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              onClick={() => onModeChange(key)}
              aria-pressed={mode === key}
              className="interactive-press"
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex gap-1">
          {(
            [
              ["radar", "Radar"],
              ["barras", "Barras"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setView(key)}
              aria-pressed={view === key}
              className={`interactive-press rounded-md px-2 py-1 text-[10px] font-semibold ${view === key ? "bg-primary/15 text-primary" : "text-muted-foreground"}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {view === "radar" ? (
        <div className="mt-2 flex justify-center">
          <svg
            viewBox={`0 0 ${SIZE} ${SIZE}`}
            className="h-56 w-full max-w-[260px]"
            role="img"
            aria-label={`${mode === "cumprimento" ? "Cumprimento do treino" : "Evolução de desempenho"}: ${axes.map((a) => `${a.label} ${a.caption}`).join(", ")}`}
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
              const [x, y] = point(i, MAX);
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
            {known.length >= 3 && (
              <polygon
                points={known.map(({ a, i }) => point(i, a.value!).join(",")).join(" ")}
                fill="var(--color-primary)"
                fillOpacity="0.22"
                stroke="var(--color-primary)"
                strokeWidth="1.6"
              />
            )}
            {axes.map((axis, i) => {
              const [px, py] = point(i, axis.value ?? 0);
              return (
                <Marker
                  key={`m-${axis.group}`}
                  status={axis.status}
                  x={px}
                  y={py}
                  missing={axis.value === null}
                />
              );
            })}
            {axes.map((axis, i) => {
              const [x, y] = point(i, MAX * 1.24);
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
                    {axis.label.replace(/ \(.*\)/, "")}
                  </text>
                  <text
                    x={x}
                    y={y + 9}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontSize="7.5"
                    fill="var(--color-foreground)"
                  >
                    {axis.caption}
                  </text>
                  {/* Área de toque generosa sobre o rótulo do eixo. */}
                  <circle
                    cx={x}
                    cy={y + 4}
                    r="17"
                    fill="transparent"
                    role="button"
                    tabIndex={0}
                    aria-label={`${axis.label}: ${axis.caption}`}
                    aria-pressed={isSelected}
                    onClick={() => toggle(axis.group)}
                    onKeyDown={(e) => {
                      if (e.key !== "Enter" && e.key !== " ") return;
                      e.preventDefault();
                      toggle(axis.group);
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
              label={`${axis.label.replace(/ \(.*\)/, "")}${axis.status && axis.status !== "evolucao" ? ` · ${COMPLETION_STATUS_TEXT[axis.status]}` : ""}`}
              value={axis.value ?? 0}
              max={MAX}
              suffix={mode === "cumprimento" ? "/ 10" : `/ 10 (${axis.caption})`}
              selected={selected === axis.group}
              onClick={() => toggle(axis.group)}
            />
          ))}
        </div>
      )}

      {mode === "cumprimento" && (
        <ul className="evo-radar-legend" aria-label="Legenda">
          {(
            ["atencao", "abaixo", "proximo", "quase", "meta", "progredir"] as CompletionStatus[]
          ).map((s) => (
            <li key={s}>
              <svg viewBox="-6 -6 12 12" width="12" height="12" aria-hidden="true">
                <Marker status={s} x={0} y={0} />
              </svg>
              {COMPLETION_STATUS_TEXT[s]}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
