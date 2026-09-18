import { useId, useState } from "react";
import type { MuscleGroup } from "@/lib/workout-store";
import { muscleGroupLabel, type MuscleStimulus } from "@/lib/workout-evolution";
type Region = { group: MuscleGroup; d: string };
// Atlas coordinates: visible muscle and hit target share the same path.
const FRONT: Region[] = [
  {
    group: "peito",
    d: "M219 248 Q256 219 324 245 L322 329 Q266 359 235 320 Z M337 245 Q393 219 434 252 L422 321 Q385 355 338 329 Z",
  },
  {
    group: "ombros",
    d: "M169 264 Q183 221 231 217 L242 237 Q207 255 203 290 L164 318 Z M424 222 Q479 211 491 267 L498 317 L457 292 Q452 256 424 242 Z",
  },
  {
    group: "biceps",
    d: "M163 311 Q187 294 203 295 Q203 349 181 402 L148 424 Q141 379 163 311 Z M461 297 Q486 300 498 326 L514 420 L484 402 Q459 348 461 297 Z",
  },
  {
    group: "antebraco",
    d: "M148 430 L177 410 Q175 465 110 555 L82 548 Z M490 411 L514 429 L574 549 L549 558 Q499 484 490 411 Z",
  },
  { group: "abdomen", d: "M292 338 Q325 326 367 338 L378 460 Q354 497 333 525 Q302 494 285 460 Z" },
  {
    group: "quadriceps",
    d: "M242 496 Q268 471 310 506 L300 666 Q297 740 271 776 L234 763 Q194 651 242 496 Z M355 508 Q397 470 422 501 Q466 639 427 766 L390 778 Q364 733 359 666 Z",
  },
  {
    group: "panturrilhas",
    d: "M224 814 L273 820 Q288 912 250 1038 L224 1052 Q194 934 224 814 Z M391 820 L433 813 Q461 921 438 1050 L411 1035 Q374 921 391 820 Z",
  },
];
const BACK: Region[] = [
  {
    group: "costas",
    d: "M201 242 L256 206 L292 241 L330 207 L387 243 L409 324 Q373 425 313 480 L294 443 L274 480 Q215 427 185 324 Z",
  },
  {
    group: "ombros",
    d: "M141 267 Q149 219 194 216 L211 240 Q178 263 179 292 L136 321 Z M380 218 Q432 215 447 264 L455 321 L412 296 Q411 262 381 241 Z",
  },
  {
    group: "triceps",
    d: "M137 318 Q158 294 179 301 Q176 365 154 410 L123 432 Q114 370 137 318 Z M414 300 Q442 300 455 326 L470 430 L438 409 Q414 356 414 300 Z",
  },
  {
    group: "antebraco",
    d: "M120 432 L154 413 Q143 479 80 554 L55 547 Z M439 412 L473 429 L540 549 L511 559 Q451 480 439 412 Z",
  },
  {
    group: "gluteos",
    d: "M218 497 Q253 476 293 532 L289 609 Q244 643 208 612 Z M298 531 Q344 475 378 499 L389 613 Q350 642 300 607 Z",
  },
  {
    group: "posteriores",
    d: "M207 623 Q252 649 285 621 Q280 729 255 800 L216 808 Q190 705 207 623 Z M305 622 Q353 649 386 625 Q406 719 375 808 L333 800 Q310 721 305 622 Z",
  },
  {
    group: "panturrilhas",
    d: "M216 815 L259 818 Q289 900 249 985 L222 1019 Q193 925 216 815 Z M332 818 L375 815 Q403 921 374 1019 L347 985 Q307 902 332 818 Z",
  },
];
export function BodyMap({
  stimulus,
  selected,
  onSelect,
}: {
  stimulus: MuscleStimulus[];
  selected: MuscleGroup | null;
  onSelect: (g: MuscleGroup | null) => void;
}) {
  const [view, setView] = useState<"frente" | "costas">("frente");
  const id = useId().replace(/:/g, "");
  const max = Math.max(1, ...stimulus.map((s) => s.directSets));
  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] text-muted-foreground">Toque em um músculo para analisar.</p>
        <div className="evo-tabs shrink-0">
          {(["frente", "costas"] as const).map((v) => (
            <button
              key={v}
              style={{ minHeight: 32, fontSize: 11, padding: "0 10px" }}
              aria-pressed={view === v}
              onClick={() => setView(v)}
            >
              {v === "frente" ? "Frente" : "Costas"}
            </button>
          ))}
        </div>
      </div>
      <div className="evo-body-stage overflow-hidden rounded-xl bg-black mt-2">
        <svg viewBox="40 0 547 1050" role="group" aria-label={`Mapa muscular: ${view}`}>
          <defs>
            <clipPath id={`body-clip-${id}`}>
              <rect x="0" y="0" width="627" height="1254" />
            </clipPath>
            <filter id={`glow-${id}`} x="-25%" y="-25%" width="150%" height="150%">
              <feGaussianBlur stdDeviation="6" />
            </filter>
          </defs>
          <image
            clipPath={`url(#body-clip-${id})`}
            href="/images/academia/anatomy-atlas.png"
            x={view === "frente" ? 0 : -627}
            y="0"
            width="1254"
            height="1254"
            pointerEvents="none"
          />
          {(view === "frente" ? FRONT : BACK).map((r, i) => {
            const count = stimulus.find((s) => s.group === r.group)?.directSets ?? 0;
            const color =
              count === 0
                ? "#44647d"
                : count / max > 0.72
                  ? "#ffac24"
                  : count / max > 0.35
                    ? "#00db87"
                    : "#189ee2";
            const active = selected === r.group;
            return (
              <g key={`${view}-${i}`}>
                {count > 0 && (
                  <path
                    d={r.d}
                    fill={color}
                    opacity=".48"
                    filter={`url(#glow-${id})`}
                    pointerEvents="none"
                  />
                )}
                <path
                  d={r.d}
                  fill={color}
                  fillOpacity={count ? 0.48 : 0.04}
                  stroke={active ? "#fff" : color}
                  strokeOpacity={active ? 1 : count ? 0.7 : 0}
                  strokeWidth={active ? 3 : 1}
                  style={{ mixBlendMode: "screen", cursor: "pointer" }}
                  role="button"
                  tabIndex={0}
                  aria-pressed={active}
                  aria-label={`${muscleGroupLabel[r.group]}: ${count} séries diretas`}
                  onClick={() => onSelect(active ? null : r.group)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onSelect(active ? null : r.group);
                    }
                  }}
                />
              </g>
            );
          })}
        </svg>
        <div className="evo-legend">
          <span>
            <i style={{ background: "#189ee2" }} />
            Menos séries
          </span>
          <span>
            <i style={{ background: "#00db87" }} />
            Intermediário
          </span>
          <span>
            <i style={{ background: "#ffac24" }} />
            Mais séries
          </span>
        </div>
      </div>
      <select
        className="mt-2 w-full"
        aria-label="Selecionar músculo"
        value={selected ?? ""}
        onChange={(e) => onSelect((e.target.value || null) as MuscleGroup | null)}
      >
        <option value="">Selecionar músculo</option>
        {Object.entries(muscleGroupLabel).map(([g, l]) => (
          <option key={g} value={g}>
            {l}
          </option>
        ))}
      </select>
      <p className="mt-2 text-center text-[10px] text-muted-foreground">
        Séries diretas no período · cinza: sem registros.
      </p>
    </div>
  );
}
