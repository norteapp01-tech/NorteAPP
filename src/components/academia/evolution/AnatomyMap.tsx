import { useId, useState } from "react";
import type { MuscleGroup } from "@/lib/workout-store";
import { muscleGroupLabel, type MuscleStimulus } from "@/lib/workout-evolution";
import { progressLabel, type muscleProgress } from "@/lib/workout-map";
type Region = { group: MuscleGroup; label: string; d: string };
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
  selected,
  onSelect,
  progress,
}: {
  stimulus: MuscleStimulus[];
  selected: MuscleGroup | null;
  onSelect: (g: MuscleGroup | null) => void;
  progress: ReturnType<typeof muscleProgress>;
}) {
  const [view, setView] = useState<"frente" | "costas">("frente");
  const [mode, setMode] = useState<"volume" | "progressao">("volume");
  const id = useId().replace(/:/g, "");
  const max = Math.max(1, ...stimulus.map((s) => s.directSets));
  return (
    <div>
      <div className="evo-map-controls">
        <div className="evo-tabs" role="group" aria-label="Análise do mapa">
          <button aria-pressed={mode === "volume"} onClick={() => setMode("volume")}>
            Volume
          </button>
          <button aria-pressed={mode === "progressao"} onClick={() => setMode("progressao")}>
            Progressão
          </button>
        </div>
        <div className="evo-tabs" role="group" aria-label="Vista do corpo">
          {(["frente", "costas"] as const).map((v) => (
            <button key={v} aria-pressed={view === v} onClick={() => setView(v)}>
              {v === "frente" ? "Frente" : "Costas"}
            </button>
          ))}
        </div>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        {mode === "volume"
          ? "Onde você concentrou suas séries."
          : "Desempenho dos exercícios, não crescimento muscular."}
      </p>
      <div className="evo-body-stage">
        <svg viewBox="10 0 610 1220" role="group" aria-label={`Mapa muscular: ${view}`}>
          <defs>
            <clipPath id={id}>
              <rect width="627" height="1254" />
            </clipPath>
          </defs>
          <image
            clipPath={`url(#${id})`}
            href="/images/academia/anatomy-atlas.png"
            x={view === "frente" ? 0 : -627}
            width="1254"
            height="1254"
            pointerEvents="none"
          />
          {(view === "frente" ? FRONT : BACK).flatMap((r, i) =>
            [false, true].map((mirror) => {
              const count = stimulus.find((s) => s.group === r.group)?.directSets ?? 0;
              const state = progress.get(r.group)?.state ?? "insuficiente";
              const known = mode === "volume" ? count > 0 : state !== "insuficiente";
              const color =
                mode === "progressao"
                  ? COLORS[state]
                  : !count
                    ? COLORS.insuficiente
                    : count / max > 0.72
                      ? "#efba5b"
                      : count / max > 0.35
                        ? "#80e780"
                        : "#63b4dd";
              const active = selected === r.group;
              return (
                <path
                  key={`${i}-${mirror}`}
                  d={r.d}
                  transform={
                    mirror ? `translate(${view === "frente" ? 660 : 590} 0) scale(-1 1)` : undefined
                  }
                  fill={color}
                  fillOpacity={known ? 0.48 : 0.05}
                  stroke={active ? "#fff" : color}
                  strokeOpacity={active ? 1 : 0.65}
                  strokeWidth={active ? 2.5 : 1.2}
                  role="button"
                  tabIndex={0}
                  aria-pressed={active}
                  aria-label={`${r.label}, ${mirror ? "direita" : "esquerda"}: ${mode === "volume" ? `${count} séries do grupo ${muscleGroupLabel[r.group]}` : progressLabel[state]}`}
                  onClick={() => onSelect(active ? null : r.group)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onSelect(active ? null : r.group);
                    }
                  }}
                  style={{ cursor: "pointer" }}
                >
                  <title>
                    {r.label} · dados de {muscleGroupLabel[r.group]}
                  </title>
                </path>
              );
            }),
          )}
        </svg>
      </div>
      <div className="evo-map-legend" aria-label="Legenda do mapa">
        {(mode === "volume"
          ? [
              ["#63b4dd", "Menos"],
              ["#80e780", "Intermediário"],
              ["#efba5b", "Mais"],
              ["#63717d", "Sem registro"],
            ]
          : Object.entries(COLORS).map(([k, c]) => [c, progressLabel[k as keyof typeof COLORS]])
        ).map(([c, l]) => (
          <span key={l}>
            <i style={{ background: c }} />
            {l}
          </span>
        ))}
      </div>
      <select
        className="mt-4 w-full"
        aria-label="Selecionar músculo"
        value={selected ?? ""}
        onChange={(e) => onSelect((e.target.value || null) as MuscleGroup | null)}
      >
        <option value="">Todos os músculos</option>
        {Object.entries(muscleGroupLabel).map(([g, l]) => (
          <option key={g} value={g}>
            {l}
          </option>
        ))}
      </select>
      <details className="evo-map-method">
        <summary>Como ler este mapa</summary>
        <p>
          {mode === "volume"
            ? "Cores relativas ao grupo com mais séries diretas no período. Não indicam recuperação nem estímulo fisiológico medido."
            : "Cada exercício exige ao menos três sessões comparáveis. Usamos a referência mais frequente de carga ou repetições; resultados divergentes aparecem como mistos. Técnica e amplitude não são medidas pelo app."}{" "}
          As divisões mostram a anatomia; os dados continuam por grupo muscular. Trapézio, lombar e
          dorsais usam o grupo Costas, sem atribuir isolamento a cada região.
        </p>
      </details>
    </div>
  );
}
