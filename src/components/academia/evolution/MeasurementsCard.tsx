import { useMemo, useState, type ReactNode } from "react";
import { formatDateShortBR } from "@/lib/goals-store";
import type { BodyWeightEntry } from "@/lib/workout-store";
import type { BodyMeasurement } from "@/lib/workout-cycle-store";
import type { DateRange } from "@/lib/workout-evolution";
import { EmptyNote, ModuleCard } from "./shared";

// ---------------------------------------------------------------------------
// Medidas corporais — só medições reais, com data. Nada é inferido das cargas
// de treino: gordura corporal, ganho muscular e perda localizada não se
// calculam a partir de quanto peso alguém levantou.
//
// O card só aparece quando há registros.
// ---------------------------------------------------------------------------

export function MeasurementsCard({
  bodyWeights,
  measurements,
  range,
  bare = false,
}: {
  bodyWeights: BodyWeightEntry[];
  measurements: BodyMeasurement[];
  range: DateRange;
  /** Dentro de uma gaveta o card vira conteúdo solto: nada de card dentro de
   * card. */
  bare?: boolean;
}) {
  const series = useMemo(() => {
    const out = new Map<
      string,
      { label: string; unit: string; points: { date: string; value: number }[] }
    >();
    const weights = bodyWeights
      .filter((b) => b.date >= range.from && b.date <= range.to)
      .sort((a, b) => a.date.localeCompare(b.date));
    if (weights.length > 0) {
      out.set("peso", {
        label: "Peso corporal",
        unit: "kg",
        points: weights.map((w) => ({ date: w.date, value: w.weight })),
      });
    }
    for (const m of measurements) {
      if (m.measuredAt < range.from || m.measuredAt > range.to) continue;
      const found = out.get(m.label) ?? { label: m.label, unit: m.unit, points: [] };
      found.points.push({ date: m.measuredAt, value: m.value });
      out.set(m.label, found);
    }
    for (const entry of out.values()) entry.points.sort((a, b) => a.date.localeCompare(b.date));
    return [...out.entries()].map(([key, v]) => ({ key, ...v }));
  }, [bodyWeights, measurements, range]);

  const [selected, setSelected] = useState<string>("");
  if (series.length === 0) {
    return bare ? (
      <p className="evo-note">
        Nenhuma medição registrada neste período. Nada aqui é estimado a partir das cargas de
        treino.
      </p>
    ) : null;
  }

  const current = series.find((s) => s.key === selected) ?? series[0];
  const first = current.points[0];
  const last = current.points.at(-1)!;
  const delta =
    current.points.length > 1 ? Math.round((last.value - first.value) * 10) / 10 : undefined;

  const picker =
    series.length > 1 ? (
      <select
        value={current.key}
        onChange={(e) => setSelected(e.target.value)}
        aria-label="Medida"
        className="rounded-md border border-border bg-surface px-1.5 py-1 text-[10px] outline-none focus:border-primary"
      >
        {series.map((s) => (
          <option key={s.key} value={s.key}>
            {s.label}
          </option>
        ))}
      </select>
    ) : undefined;

  const Shell = bare
    ? ({ children }: { children: ReactNode }) => (
        <div>
          {picker && <div className="mb-2 flex justify-end">{picker}</div>}
          {children}
        </div>
      )
    : ({ children }: { children: ReactNode }) => (
        <ModuleCard title="Medidas corporais" action={picker}>
          {children}
        </ModuleCard>
      );

  return (
    <Shell>
      {current.points.length === 1 ? (
        <EmptyNote>
          Um registro no período: {first.value} {current.unit} em {formatDateShortBR(first.date)}.
          Com duas medições dá para mostrar variação.
        </EmptyNote>
      ) : (
        <>
          <div className="flex items-baseline gap-4">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Primeiro</p>
              <p className="font-mono text-lg font-bold tabular-nums">
                {first.value} {current.unit}
              </p>
              <p className="text-[10px] text-muted-foreground">{formatDateShortBR(first.date)}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Último</p>
              <p className="font-mono text-lg font-bold tabular-nums">
                {last.value} {current.unit}
              </p>
              <p className="text-[10px] text-muted-foreground">{formatDateShortBR(last.date)}</p>
            </div>
            {delta !== undefined && (
              <div className="ml-auto text-right">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Variação
                </p>
                {/* Sem cor de bom ou ruim: o app não sabe o objetivo. */}
                <p className="font-mono text-lg font-bold tabular-nums">
                  {delta > 0 ? "+" : ""}
                  {delta} {current.unit}
                </p>
              </div>
            )}
          </div>
          <Line points={current.points} unit={current.unit} />
        </>
      )}

      <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
        Só medições registradas por você, com data. Nada aqui é estimado a partir das cargas de
        treino.
      </p>
    </Shell>
  );
}

function Line({ points, unit }: { points: { date: string; value: number }[]; unit: string }) {
  const values = points.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const W = 300;
  const H = 80;
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="mt-3 h-20 w-full"
      role="img"
      aria-label={points.map((p) => `${formatDateShortBR(p.date)} ${p.value} ${unit}`).join(", ")}
    >
      <polyline
        points={points
          .map(
            (p, i) =>
              `${(i / (points.length - 1)) * W},${H - ((p.value - min) / span) * (H - 16) - 8}`,
          )
          .join(" ")}
        fill="none"
        stroke="var(--color-primary)"
        strokeWidth="2"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
