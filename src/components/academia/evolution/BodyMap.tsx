import { useState } from "react";
import type { MuscleGroup } from "@/lib/workout-store";
import { muscleGroupLabel, type MuscleStimulus } from "@/lib/workout-evolution";

// ---------------------------------------------------------------------------
// Mapa de estímulo — figura anatômica por regiões, frente e costas.
//
// A silhueta é montada com primitivas (cabeça, tronco, braços, pernas) e cada
// músculo é UMA forma desenhada sobre ela. O que se vê e o que se toca são o
// MESMO elemento, então não há como as áreas clicáveis saírem do lugar em
// telas diferentes.
//
// A escala representa QUANTIDADE DE SÉRIES DIRETAS no período, e só isso. As
// cores não afirmam recuperação, risco de lesão, overtraining nem uma faixa
// "ideal": a legenda vai de "Menos séries" a "Mais séries", e região sem
// registro aparece em cinza como "sem registros".
// ---------------------------------------------------------------------------

export type BodyView = "frente" | "costas";

type Shape =
  | { kind: "ellipse"; cx: number; cy: number; rx: number; ry: number; rotate?: number }
  | { kind: "path"; d: string };

type Region = { group: MuscleGroup; label: string; shape: Shape };

const ellipse = (
  group: MuscleGroup,
  label: string,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  rotate?: number,
): Region => ({ group, label, shape: { kind: "ellipse", cx, cy, rx, ry, rotate } });

/** Canvas 200×340. Cabeça em ~1/8 da altura e ombros com ~2,2 cabeças de
 * largura — proporções que fazem cada região cair sobre o músculo certo. */
const FRONT: Region[] = [
  ellipse("ombros", "Ombro esquerdo", 70, 74, 12, 11),
  ellipse("ombros", "Ombro direito", 130, 74, 12, 11),
  ellipse("peito", "Peito esquerdo", 88, 82, 13, 11, -8),
  ellipse("peito", "Peito direito", 112, 82, 13, 11, 8),
  {
    group: "abdomen",
    label: "Abdômen",
    shape: { kind: "path", d: "M88 100 q12 -4 24 0 l2 42 q-14 5 -28 0 z" },
  },
  ellipse("biceps", "Bíceps esquerdo", 58, 104, 8, 18, -5),
  ellipse("biceps", "Bíceps direito", 142, 104, 8, 18, 5),
  ellipse("antebraco", "Antebraço esquerdo", 50, 143, 7, 17, -3),
  ellipse("antebraco", "Antebraço direito", 150, 143, 7, 17, 3),
  ellipse("quadriceps", "Quadríceps esquerdo", 88, 198, 12, 38),
  ellipse("quadriceps", "Quadríceps direito", 112, 198, 12, 38),
  ellipse("panturrilhas", "Panturrilha esquerda", 89, 268, 9, 26),
  ellipse("panturrilhas", "Panturrilha direita", 111, 268, 9, 26),
];

const BACK: Region[] = [
  ellipse("ombros", "Ombro esquerdo", 70, 74, 12, 11),
  ellipse("ombros", "Ombro direito", 130, 74, 12, 11),
  {
    group: "costas",
    label: "Costas",
    // Trapézio e dorsais: ombro a ombro no topo, afunilando na cintura.
    shape: {
      kind: "path",
      d: "M81 66 q19 -6 38 0 l5 28 q-4 22 -11 36 q-13 5 -26 0 q-7 -14 -11 -36 z",
    },
  },
  ellipse("triceps", "Tríceps esquerdo", 58, 104, 8, 18, -5),
  ellipse("triceps", "Tríceps direito", 142, 104, 8, 18, 5),
  ellipse("antebraco", "Antebraço esquerdo", 50, 143, 7, 17, -3),
  ellipse("antebraco", "Antebraço direito", 150, 143, 7, 17, 3),
  ellipse("gluteos", "Glúteo esquerdo", 90, 150, 13, 12),
  ellipse("gluteos", "Glúteo direito", 110, 150, 13, 12),
  ellipse("posteriores", "Posterior esquerdo", 88, 203, 12, 34),
  ellipse("posteriores", "Posterior direito", 112, 203, 12, 34),
  ellipse("panturrilhas", "Panturrilha esquerda", 89, 268, 9, 26),
  ellipse("panturrilhas", "Panturrilha direita", 111, 268, 9, 26),
];

const LEVELS = 4;

export function BodyMap({
  stimulus,
  selected,
  onSelect,
}: {
  stimulus: MuscleStimulus[];
  selected: MuscleGroup | null;
  onSelect: (group: MuscleGroup | null) => void;
}) {
  const [view, setView] = useState<BodyView>("frente");
  const regions = view === "frente" ? FRONT : BACK;

  const byGroup = new Map(stimulus.map((s) => [s.group, s]));
  const max = Math.max(1, ...stimulus.map((s) => s.directSets));

  /** 0 = sem registro; 1..LEVELS = escala declarada de quantidade. */
  const levelOf = (group: MuscleGroup): number => {
    const sets = byGroup.get(group)?.directSets ?? 0;
    if (sets === 0) return 0;
    return Math.max(1, Math.ceil((sets / max) * LEVELS));
  };

  const fillOf = (group: MuscleGroup): string => {
    const level = levelOf(group);
    if (level === 0) return "var(--color-surface-2)";
    return `color-mix(in oklab, var(--color-primary) ${14 + level * 21}%, var(--color-surface-2))`;
  };

  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <div
          role="group"
          aria-label="Vista do corpo"
          className="flex rounded-lg border border-border p-0.5"
        >
          {(["frente", "costas"] as const).map((option) => (
            <button
              key={option}
              onClick={() => setView(option)}
              aria-pressed={view === option}
              className={`interactive-press rounded-md px-3 py-1 text-[11px] font-semibold capitalize ${
                view === option ? "bg-primary/15 text-primary" : "text-muted-foreground"
              }`}
            >
              {option}
            </button>
          ))}
        </div>
        {selected && (
          <button
            onClick={() => onSelect(null)}
            className="interactive-press text-[11px] font-semibold text-primary underline"
          >
            Limpar seleção
          </button>
        )}
      </div>

      <div className="mt-3 flex justify-center">
        <svg
          viewBox="0 0 200 340"
          className="h-72 w-auto"
          role="group"
          aria-label={`Mapa de estímulo, vista ${view}`}
        >
          <defs>
            {/* Sombreado suave: dá volume sem virar gráfico decorativo. */}
            <radialGradient id="bodyShade" cx="38%" cy="26%" r="80%">
              <stop offset="0%" stopColor="#ffffff" stopOpacity="0.09" />
              <stop offset="100%" stopColor="#000000" stopOpacity="0.15" />
            </radialGradient>
          </defs>

          <Silhouette />

          {regions.map((region, index) => {
            const info = byGroup.get(region.group);
            const isSelected = selected === region.group;
            const handlers = {
              fill: fillOf(region.group),
              stroke: isSelected ? "var(--color-primary)" : "var(--color-border)",
              strokeWidth: isSelected ? 2.2 : 0.9,
              role: "button",
              tabIndex: 0,
              "aria-label": `${region.label}: ${info?.directSets ?? 0} séries diretas em ${muscleGroupLabel[region.group]}`,
              "aria-pressed": isSelected,
              onClick: () => onSelect(isSelected ? null : region.group),
              onKeyDown: (e: React.KeyboardEvent) => {
                if (e.key !== "Enter" && e.key !== " ") return;
                e.preventDefault();
                onSelect(isSelected ? null : region.group);
              },
              style: {
                cursor: "pointer",
                transition: "fill var(--dur-state) var(--ease-out)",
              } as React.CSSProperties,
            };
            const key = `${region.group}-${index}`;
            if (region.shape.kind === "ellipse") {
              const { cx, cy, rx, ry, rotate } = region.shape;
              return (
                <ellipse
                  key={key}
                  cx={cx}
                  cy={cy}
                  rx={rx}
                  ry={ry}
                  transform={rotate ? `rotate(${rotate} ${cx} ${cy})` : undefined}
                  {...handlers}
                />
              );
            }
            return <path key={key} d={region.shape.d} {...handlers} />;
          })}

          <rect x="0" y="0" width="200" height="340" fill="url(#bodyShade)" pointerEvents="none" />
        </svg>
      </div>

      <p className="mt-1 text-center text-[11px] text-muted-foreground">
        Toque em um músculo para analisar
      </p>

      <div className="mt-3 flex items-center gap-2">
        <span className="text-[10px] text-muted-foreground">Menos séries</span>
        <div className="flex h-2 flex-1 overflow-hidden rounded-full">
          {Array.from({ length: LEVELS }, (_, i) => (
            <div
              key={i}
              className="flex-1"
              style={{
                background: `color-mix(in oklab, var(--color-primary) ${14 + (i + 1) * 21}%, var(--color-surface-2))`,
              }}
            />
          ))}
        </div>
        <span className="text-[10px] text-muted-foreground">Mais séries</span>
      </div>
      <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">
        A escala mostra a quantidade de séries diretas registradas no período. Não indica
        recuperação, risco de lesão nem uma faixa ideal. Região cinza significa “sem registros”.
      </p>

      {/* O mapa não pode ser a única forma de selecionar um músculo. */}
      <label className="mt-3 block">
        <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Ou escolha pelo nome
        </span>
        <select
          value={selected ?? ""}
          onChange={(e) => onSelect((e.target.value || null) as MuscleGroup | null)}
          className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
        >
          <option value="">Todos os músculos</option>
          {stimulus
            .filter((s) => s.group !== "nao_classificado")
            .map((s) => (
              <option key={s.group} value={s.group}>
                {s.label} — {s.directSets} séries
              </option>
            ))}
        </select>
      </label>
    </div>
  );
}

/** Corpo de fundo, montado com primitivas — previsível em qualquer tamanho e
 * sem capturar toque, para não competir com as regiões. */
function Silhouette() {
  return (
    <g fill="var(--color-surface-2)" opacity="0.9" pointerEvents="none">
      <circle cx="100" cy="30" r="16" />
      <rect x="93" y="43" width="14" height="12" rx="5" />
      {/* Tronco: ombro a ombro, afunilando na cintura */}
      <path d="M76 62 q24 -8 48 0 l5 40 q-3 24 -8 44 q-21 7 -42 0 q-5 -20 -8 -44 z" />
      {/* Braços */}
      <path d="M70 64 q-13 4 -17 19 l-7 77 q7 5 13 2 l9 -75 q3 -18 8 -23 z" />
      <path d="M130 64 q13 4 17 19 l7 77 q-7 5 -13 2 l-9 -75 q-3 -18 -8 -23 z" />
      <ellipse cx="47" cy="170" rx="7" ry="11" />
      <ellipse cx="153" cy="170" rx="7" ry="11" />
      {/* Pernas */}
      <path d="M79 146 q11 -5 20 0 l2 90 q-2 31 -4 58 q-8 4 -16 0 q-3 -29 -4 -58 z" />
      <path d="M121 146 q-11 -5 -20 0 l-2 90 q2 31 4 58 q8 4 16 0 q3 -29 4 -58 z" />
      <ellipse cx="87" cy="302" rx="10" ry="6" />
      <ellipse cx="113" cy="302" rx="10" ry="6" />
    </g>
  );
}
