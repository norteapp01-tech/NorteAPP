import { useId, useState } from "react";
import type { MuscleGroup } from "@/lib/workout-store";
import { muscleGroupLabel, regionSetCount, type MuscleStimulus } from "@/lib/workout-evolution";
import { progressLabel, type muscleProgress } from "@/lib/workout-map";
type Region = { group: MuscleGroup; label: string; d: string };

/** Subgrupo que cada região representa. Região que não aparece aqui responde
 * pelo grupo inteiro. */
const REGION_DETAIL: Record<string, MuscleGroup> = {
  "Peitoral · região superior": "peito_superior",
  "Peitoral · região média": "peito_medio",
  "Peitoral · região inferior": "peito_inferior",
  "Deltoide anterior": "ombro_anterior",
  "Deltoide lateral": "ombro_lateral",
  "Deltoide posterior": "ombro_posterior",
  "Trapézio · região superior": "trapezio",
  "Trapézio · região média e inferior": "costas_meio",
  "Costas · região escapular": "costas_meio",
  Dorsal: "dorsais",
  "Lombar · eretores da coluna": "lombar",
  "Tríceps · cabeça longa": "triceps_longa",
  "Tríceps · cabeça lateral": "triceps_lateral",
  "Tríceps · região medial visível": "triceps_medial",
};

/** Séries de uma região que valem "totalmente aceso". Escala ABSOLUTA: antes
 * a cor era relativa ao grupo mais treinado, então quem treinou só um
 * exercício de ombro via o ombro "no máximo". */
const FULL_SETS = 12;
// Atlas fascia traced as separate bilateral shapes. Visible paths ARE hit targets.
// Regional outlines are anatomical, not invented regional measurements.
const FRONT: Region[] = [
  {
    group: "peito",
    label: "Peitoral · região superior",
    d: "M218 264 Q249 235 307 234 Q321 236 324 247 L324 268 Q266 257 218 276 Z",
  },
  {
    group: "peito",
    label: "Peitoral · região média",
    d: "M216 281 Q269 264 324 273 L324 302 Q269 304 221 291 Z",
  },
  {
    group: "peito",
    label: "Peitoral · região inferior",
    d: "M222 297 Q269 310 324 307 L322 326 Q279 347 250 327 Q233 314 222 297 Z",
  },
  {
    group: "ombros",
    label: "Deltoide anterior",
    d: "M239 224 Q219 218 201 228 Q179 247 172 281 L164 307 Q177 293 190 280 Q207 247 239 224 Z",
  },
  {
    group: "ombros",
    label: "Deltoide lateral",
    d: "M194 228 Q160 245 160 291 L163 313 Q170 299 173 277 Q178 246 194 228 Z",
  },
  {
    group: "biceps",
    label: "Bíceps",
    d: "M193 297 Q212 323 197 365 Q185 397 165 409 Q157 398 164 373 Q178 321 193 297 Z",
  },
  {
    group: "antebraco",
    label: "Antebraço · flexores",
    d: "M157 424 Q170 418 173 407 Q170 449 144 490 L115 536 L104 540 Q121 489 157 424 Z",
  },
  {
    group: "antebraco",
    label: "Antebraço · região lateral",
    d: "M144 414 L154 427 Q122 470 102 538 L91 544 Q104 482 127 449 Z",
  },
  {
    group: "abdomen",
    label: "Abdômen superior",
    d: "M298 340 Q312 330 324 338 L324 366 L296 367 Q291 355 298 340 Z",
  },
  { group: "abdomen", label: "Abdômen médio", d: "M296 373 L324 371 L324 410 L293 409 Z" },
  {
    group: "abdomen",
    label: "Abdômen inferior",
    d: "M294 416 L324 416 L324 457 Q305 464 296 448 Z M298 463 L324 464 L324 510 Q309 491 298 463 Z",
  },
  {
    group: "abdomen",
    label: "Oblíquos",
    d: "M250 350 Q264 365 281 370 L278 453 L296 508 Q271 486 259 460 Q258 412 250 350 Z",
  },
  {
    group: "quadriceps",
    label: "Quadríceps · reto femoral",
    d: "M252 507 Q272 507 285 535 Q301 612 280 710 Q266 687 253 631 Q240 566 252 507 Z",
  },
  {
    group: "quadriceps",
    label: "Quadríceps · vasto lateral",
    d: "M241 530 Q217 587 219 652 Q216 717 246 754 L256 731 Q233 662 241 530 Z",
  },
  {
    group: "quadriceps",
    label: "Quadríceps · vasto medial",
    d: "M295 624 Q304 692 290 745 Q282 776 269 768 L260 749 Q284 705 295 624 Z",
  },
  {
    group: "panturrilhas",
    label: "Panturrilha · contorno lateral",
    d: "M222 832 Q207 873 217 924 L228 976 Q220 885 232 851 Z",
  },
];
const BACK: Region[] = [
  {
    group: "costas",
    label: "Trapézio · região superior",
    d: "M254 184 Q239 204 196 223 Q235 225 290 257 L290 216 Q267 203 254 184 Z",
  },
  {
    group: "costas",
    label: "Trapézio · região média e inferior",
    d: "M218 239 Q260 244 290 266 L291 388 Q278 356 260 316 Z",
  },
  {
    group: "costas",
    label: "Costas · região escapular",
    d: "M208 248 Q234 259 247 294 L260 323 Q220 332 193 305 Q186 284 208 248 Z",
  },
  {
    group: "costas",
    label: "Dorsal",
    d: "M196 319 Q222 337 258 329 Q274 356 287 400 L281 448 L260 476 Q221 429 211 385 Z",
  },
  {
    group: "costas",
    label: "Lombar · eretores da coluna",
    d: "M286 403 L291 426 L291 522 Q276 504 267 481 L283 444 Z",
  },
  {
    group: "ombros",
    label: "Deltoide posterior",
    d: "M179 225 Q152 234 145 266 L140 309 Q158 288 177 282 Q183 255 204 239 Z",
  },
  {
    group: "triceps",
    label: "Tríceps · cabeça longa",
    d: "M178 307 Q195 338 181 374 Q173 391 155 408 Q152 393 158 367 Z",
  },
  {
    group: "triceps",
    label: "Tríceps · cabeça lateral",
    d: "M147 314 Q158 300 173 298 Q157 344 151 377 L137 397 Q130 360 147 314 Z",
  },
  {
    group: "triceps",
    label: "Tríceps · região medial visível",
    d: "M150 382 L153 409 L135 426 L128 420 Z",
  },
  {
    group: "antebraco",
    label: "Antebraço",
    d: "M122 433 L147 423 Q133 476 90 530 L79 540 Q89 483 122 433 Z",
  },
  {
    group: "gluteos",
    label: "Glúteos",
    d: "M230 491 Q261 487 291 539 L289 601 Q258 622 218 633 Q199 584 218 526 Z",
  },
  {
    group: "posteriores",
    label: "Posterior · região lateral",
    d: "M212 641 L240 632 Q229 700 243 761 L232 790 Q205 723 212 641 Z",
  },
  {
    group: "posteriores",
    label: "Posterior · região medial",
    d: "M249 630 L284 614 Q280 691 263 755 L249 780 Q235 701 249 630 Z",
  },
  {
    group: "panturrilhas",
    label: "Panturrilha · cabeça lateral",
    d: "M216 816 L236 821 Q245 880 230 945 Q214 940 209 905 Q203 865 216 816 Z",
  },
  {
    group: "panturrilhas",
    label: "Panturrilha · cabeça medial",
    d: "M242 819 L258 821 Q278 871 260 928 Q249 954 240 960 Q245 887 242 819 Z",
  },
];
const COLORS = {
  melhora: "#80e780",
  estavel: "#92a7b5",
  queda: "#e8b56a",
  misto: "#b9a1db",
  insuficiente: "#63717d",
};
export function BodyMap({
  stimulus,
  detailCounts,
  selected,
  onSelect,
  progress,
  expanded,
  onExpand,
  onCollapse,
}: {
  stimulus: MuscleStimulus[];
  detailCounts: Map<MuscleGroup, number>;
  selected: MuscleGroup | null;
  onSelect: (g: MuscleGroup | null) => void;
  progress: ReturnType<typeof muscleProgress>;
  /** O card do mapa está aberto: o boneco cresce, centraliza e os músculos ficam tocáveis. */
  expanded: boolean;
  onExpand: () => void;
  onCollapse: () => void;
}) {
  const [view, setView] = useState<"frente" | "costas">("frente");
  const [mode, setMode] = useState<"volume" | "progressao">("volume");
  const id = useId().replace(/:/g, "");
  const interactive = expanded;
  const selectedInfo = selected ? stimulus.find((s) => s.group === selected) : undefined;

  const stage = (
    <div className="evo-body-stage">
      <svg
        viewBox="10 0 610 1220"
        role={interactive ? "group" : "img"}
        aria-label={`Mapa muscular: ${view}`}
      >
        <defs>
          <clipPath id={`${id}-atlas`}>
            <rect width="627" height="1254" />
          </clipPath>
        </defs>
        {/* Atlas com fundo transparente (mesmo desenho do original, preto convertido em alfa):
            só o boneco aparece sobre o card, sem retângulo preto. */}
        <image
          clipPath={`url(#${id}-atlas)`}
          href="/images/academia/anatomy-atlas-alpha.png"
          x={view === "frente" ? 0 : -627}
          width="1254"
          height="1254"
          pointerEvents="none"
        />
        {(view === "frente" ? FRONT : BACK).flatMap((region, index) =>
          [false, true].map((mirror) => {
            const count = regionSetCount(detailCounts, region.group, REGION_DETAIL[region.label]);
            const ratio = Math.min(1, count / FULL_SETS);
            const state = progress.get(region.group)?.state ?? "insuficiente";
            const known = mode === "volume" ? count > 0 : state !== "insuficiente";
            const color =
              mode === "progressao"
                ? COLORS[state]
                : !count
                  ? COLORS.insuficiente
                  : ratio > 0.72
                    ? "#efba5b"
                    : ratio > 0.35
                      ? "#80e780"
                      : "#63b4dd";
            const active = selected === region.group;
            return (
              <path
                key={`${index}-${mirror}`}
                d={region.d}
                transform={
                  mirror ? `translate(${view === "frente" ? 660 : 590} 0) scale(-1 1)` : undefined
                }
                fill={color}
                fillOpacity={
                  mode === "volume" ? (count > 0 ? 0.22 + ratio * 0.4 : 0.05) : known ? 0.48 : 0.05
                }
                stroke={active ? "#fff" : color}
                strokeOpacity={active ? 1 : 0.65}
                strokeWidth={active ? 2.5 : 1.2}
                role={interactive ? "button" : undefined}
                tabIndex={interactive ? 0 : undefined}
                aria-pressed={interactive ? active : undefined}
                aria-label={
                  interactive
                    ? `${region.label}, ${mirror ? "direita" : "esquerda"}: ${mode === "volume" ? `${count} séries` : progressLabel[state]}`
                    : undefined
                }
                onClick={interactive ? () => onSelect(active ? null : region.group) : undefined}
                onKeyDown={
                  interactive
                    ? (event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          onSelect(active ? null : region.group);
                        }
                      }
                    : undefined
                }
                style={{ cursor: interactive ? "pointer" : "default" }}
              >
                <title>
                  {region.label} · dados de {muscleGroupLabel[region.group]}
                </title>
              </path>
            );
          }),
        )}
      </svg>
    </div>
  );

  const legend = (
    <div className="evo-map-legend" aria-label="Legenda do mapa">
      {(mode === "volume"
        ? [
            ["#63b4dd", "Poucas séries"],
            ["#80e780", "Intermediário"],
            ["#efba5b", "Bastante (9+)"],
            ["#63717d", "Sem registro"],
          ]
        : Object.entries(COLORS).map(([key, color]) => [
            color,
            progressLabel[key as keyof typeof COLORS],
          ])
      ).map(([color, label]) => (
        <span key={label}>
          <i style={{ background: color }} />
          {label}
        </span>
      ))}
    </div>
  );

  return (
    <div className={`evo-map-compact ${expanded ? "is-expanded" : ""}`}>
      <div className="evo-map-controls">
        <div className="evo-tabs" role="group" aria-label="Análise do mapa">
          <button aria-pressed={mode === "volume"} onClick={() => setMode("volume")}>
            Volume
          </button>
          <button aria-pressed={mode === "progressao"} onClick={() => setMode("progressao")}>
            Progressão
          </button>
        </div>
      </div>

      {/* O mesmo palco nos dois estados: o card anima o crescimento e a centralização. */}
      <div
        className="evo-map-preview"
        role={expanded ? undefined : "button"}
        tabIndex={expanded ? undefined : 0}
        aria-label={expanded ? undefined : "Abrir o mapa corporal"}
        onClick={expanded ? undefined : onExpand}
        onKeyDown={
          expanded
            ? undefined
            : (event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onExpand();
                }
              }
        }
      >
        {stage}
      </div>

      <button
        className="evo-view-toggle"
        onClick={() => setView(view === "frente" ? "costas" : "frente")}
      >
        {view === "frente" ? "Frente" : "Costas"} <span>⇄</span>
      </button>

      {expanded && (
        <>
          <button
            type="button"
            className="evo-map-close interactive-press"
            onClick={onCollapse}
            aria-label="Fechar o mapa"
          >
            ✕
          </button>
          <p className="evo-map-hint">
            {selectedInfo
              ? `${muscleGroupLabel[selected!]} · ${selectedInfo.directSets} séries · ${progressLabel[progress.get(selected!)?.state ?? "insuficiente"]}`
              : mode === "volume"
                ? "Toque em um músculo para ver a análise"
                : "Desempenho dos exercícios, não crescimento muscular"}
          </p>
          {legend}
        </>
      )}
    </div>
  );
}
