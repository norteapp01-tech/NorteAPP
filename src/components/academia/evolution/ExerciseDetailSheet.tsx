import { useMemo, useState } from "react";
import { Modal } from "@/components/ui/modal";
import { formatDateShortBR } from "@/lib/goals-store";
import {
  availableReferences,
  equipmentLabel,
  exerciseChartSeries,
  muscleGroupLabel,
  type ChartMode,
  type ChartPoint,
  type FilteredData,
  type ResolvedSet,
} from "@/lib/workout-evolution";

// ---------------------------------------------------------------------------
// Detalhe de um exercício: gráfico maior, pontos consultáveis por toque e o
// histórico das séries que originaram cada ponto.
//
// Um eixo só por vez. Carga e repetições em eixos diferentes no mesmo gráfico
// dariam a impressão de uma relação que o dado não sustenta. Períodos sem
// registro não são ligados como se fossem medição.
// ---------------------------------------------------------------------------

export function ExerciseDetailSheet({
  lineageId,
  data,
  allSets,
  onClose,
}: {
  lineageId: string;
  data: FilteredData;
  allSets: ResolvedSet[];
  onClose: () => void;
}) {
  const equipmentChoices = [
    ...new Set(data.sets.filter((s) => s.lineageId === lineageId).map((s) => s.equipment)),
  ];
  const [chosenEquipment, setChosenEquipment] = useState<string | null>(null);
  const equipmentIndex = equipmentChoices.findIndex((e) => (e ?? "unknown") === chosenEquipment);
  const equipment = equipmentChoices[equipmentIndex < 0 ? 0 : equipmentIndex];
  const comparableSets = useMemo(
    () => data.sets.filter((s) => s.lineageId === lineageId && s.equipment === equipment),
    [data.sets, lineageId, equipment],
  );
  // Abre no eixo com MAIS sessões comparáveis. Abrir num eixo de um ponto só
  // quando existe outro com vários esconderia a evolução que a pessoa veio ver.
  const bestMode = useMemo<ChartMode>(() => {
    const top = (m: ChartMode) =>
      availableReferences(comparableSets, lineageId, m)[0]?.sessions ?? 0;
    return top("repeticoes") > top("carga") ? "repeticoes" : "carga";
  }, [comparableSets, lineageId]);
  const [mode, setMode] = useState<ChartMode | null>(null);
  const [reference, setReference] = useState<number | null>(null);
  const [openPoint, setOpenPoint] = useState<ChartPoint | null>(null);

  const mine = comparableSets;
  const head = mine[0];
  const effectiveMode = mode ?? bestMode;
  const references = useMemo(
    () => availableReferences(comparableSets, lineageId, effectiveMode),
    [comparableSets, lineageId, effectiveMode],
  );
  const effective = references.some((r) => r.value === reference)
    ? reference!
    : (references[0]?.value ?? null);
  const points = useMemo(
    () =>
      effective !== null
        ? exerciseChartSeries(comparableSets, lineageId, effectiveMode, effective)
        : [],
    [comparableSets, lineageId, effectiveMode, effective],
  );

  if (!head) return null;

  const lifetime = allSets.filter((s) => s.lineageId === lineageId && s.equipment === equipment);
  const recordPoints = lifetime
    .filter(
      (s) =>
        effective !== null &&
        (effectiveMode === "carga" ? s.reps === effective : s.weight === effective),
    )
    .map((s) => ({ date: s.date, value: effectiveMode === "carga" ? s.weight : s.reps }));
  const assisted = equipment === "assistido";
  const record = [...recordPoints].sort((a, b) =>
    assisted && effectiveMode === "carga" ? a.value - b.value : b.value - a.value,
  )[0];
  const sessionCount = new Set(mine.map((s) => s.sessionId)).size;
  const dates = [...new Set(mine.map((s) => s.date))].sort();
  const first = points[0];
  const last = points.at(-1);
  const delta =
    first && last && points.length > 1 ? Math.round((last.value - first.value) * 100) / 100 : null;

  return (
    <Modal onClose={onClose} title={head.name}>
      {equipmentChoices.length > 1 && (
        <select
          aria-label="Equipamento do histórico"
          value={equipment ?? "unknown"}
          onChange={(e) => {
            setChosenEquipment(e.target.value);
            setReference(null);
            setOpenPoint(null);
          }}
          className="mb-3 rounded-lg border border-border bg-surface p-2 text-xs"
        >
          {equipmentChoices.map((e) => (
            <option key={e ?? "unknown"} value={e ?? "unknown"}>
              {e ? equipmentLabel[e] : "Sem equipamento informado"}
            </option>
          ))}
        </select>
      )}
      <p className="text-xs text-muted-foreground">
        {head.muscleGroup ? muscleGroupLabel[head.muscleGroup] : "Não classificado"}
        {head.equipment ? ` · ${equipmentLabel[head.equipment]}` : ""}
      </p>
      <div className="evo-detail-stats">
        <div>
          <span>Frequência</span>
          <strong>{sessionCount} sessões</strong>
          <small>{dates.length} dias no período</small>
        </div>
        <div>
          <span>
            {assisted && effectiveMode === "carga" ? "Menor assistência" : "Melhor registro"}
          </span>
          <strong>
            {record ? `${record.value} ${effectiveMode === "carga" ? "kg" : "reps"}` : "—"}
          </strong>
          <small>
            {record ? `${formatDateShortBR(record.date)} · histórico completo` : "Sem referência"}
          </small>
        </div>
      </div>
      <h3 className="mt-5 text-base font-semibold">Sua progressão</h3>

      <div className="mt-3 flex items-center gap-1.5">
        {(
          [
            ["carga", "Carga"],
            ["repeticoes", "Repetições"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => {
              setMode(key);
              setReference(null);
              setOpenPoint(null);
            }}
            aria-pressed={effectiveMode === key}
            className={`interactive-press rounded-lg px-2.5 py-1 text-[11px] font-semibold ${
              effectiveMode === key ? "bg-primary/15 text-primary" : "text-muted-foreground"
            }`}
          >
            {label}
          </button>
        ))}
        <select
          value={effective ?? ""}
          onChange={(e) => {
            setReference(Number(e.target.value));
            setOpenPoint(null);
          }}
          aria-label={effectiveMode === "carga" ? "Número de repetições" : "Carga"}
          className="ml-auto rounded-md border border-border bg-surface px-2 py-1 text-[11px] outline-none focus:border-primary"
        >
          {references.map((r) => (
            <option key={r.value} value={r.value}>
              {effectiveMode === "carga" ? `${r.value} reps` : `${r.value} kg`} ({r.sessions})
            </option>
          ))}
        </select>
      </div>

      <p className="mt-1 text-[10px] text-muted-foreground">
        {effectiveMode === "carga"
          ? `Carga registrada com exatamente ${effective} repetições.`
          : `Repetições registradas com exatamente ${effective} kg.`}
      </p>
      <p className="mt-2 text-sm font-medium">
        {delta === null
          ? "Mais registros comparáveis mostrarão sua evolução."
          : `${delta > 0 ? "+" : ""}${delta} ${effectiveMode === "carga" ? "kg" : "reps"} · ${points.length} sessões comparáveis`}
      </p>
      <p className="mt-1 text-[11px] text-muted-foreground">
        O melhor registro usa a mesma referência e equipamento, mesmo fora do período. Carga
        assistida não representa força levantada; variações de técnica e amplitude não são medidas.
      </p>

      {points.length === 0 ? (
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          Nenhuma sessão com essa combinação. Escolha outra referência acima.
        </p>
      ) : points.length === 1 ? (
        <div className="mt-3 rounded-lg border border-border bg-surface-2 p-3">
          <p className="text-[11px] font-semibold">Primeiro registro</p>
          <p className="font-mono text-lg font-bold tabular-nums">
            {points[0].value} {effectiveMode === "carga" ? "kg" : "reps"}
          </p>
          <p className="text-[11px] text-muted-foreground">{formatDateShortBR(points[0].date)}</p>
        </div>
      ) : (
        <Chart
          points={points}
          unit={effectiveMode === "carga" ? "kg" : "reps"}
          onSelect={setOpenPoint}
        />
      )}

      {openPoint && (
        <div className="mt-3 rounded-xl border border-primary/30 bg-primary/5 p-3">
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-xs font-bold">{formatDateShortBR(openPoint.date)}</p>
            <button
              onClick={() => setOpenPoint(null)}
              className="interactive-press text-[10px] text-muted-foreground underline"
            >
              fechar
            </button>
          </div>
          <p className="text-[11px] text-muted-foreground">{openPoint.planLabel}</p>
          <ul className="mt-2 space-y-1">
            {mine
              .filter((s) => s.sessionId === openPoint.sessionId)
              .sort((a, b) => a.setIndex - b.setIndex)
              .map((s) => (
                <li
                  key={s.setIndex}
                  className="flex justify-between gap-2 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs"
                >
                  <span className="text-muted-foreground">Série {s.setIndex + 1}</span>
                  <span className="font-mono tabular-nums">
                    {s.weight} kg × {s.reps}
                  </span>
                </li>
              ))}
          </ul>
        </div>
      )}
      <details className="evo-detail-history mt-5">
        <summary className="cursor-pointer py-3 text-sm font-semibold">
          Histórico completo do período · {sessionCount} sessões
        </summary>
        {[...new Set(mine.map((s) => s.sessionId))].reverse().map((id) => {
          const rows = mine
            .filter((s) => s.sessionId === id)
            .sort((a, b) => a.setIndex - b.setIndex);
          return (
            <div key={id} className="border-t border-border py-3">
              <p className="text-xs font-semibold">
                {formatDateShortBR(rows[0].date)} · {rows[0].planLabel}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {rows.map((s) => `${s.weight} kg × ${s.reps} reps`).join(" · ")}
              </p>
            </div>
          );
        })}
      </details>
    </Modal>
  );
}

function Chart({
  points,
  unit,
  onSelect,
}: {
  points: ChartPoint[];
  unit: string;
  onSelect: (p: ChartPoint) => void;
}) {
  const values = points.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const W = 300;
  const H = 150;
  const x = (i: number) => 12 + (i / (points.length - 1)) * (W - 24);
  const y = (v: number) => H - ((v - min) / span) * (H - 26) - 13;

  return (
    <div className="mt-3">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-40 w-full"
        role="group"
        aria-label={`Evolução em ${unit}: ${points.map((p) => `${formatDateShortBR(p.date)} ${p.value}`).join(", ")}`}
      >
        <polyline
          points={points.map((p, i) => `${x(i)},${y(p.value)}`).join(" ")}
          fill="none"
          stroke="var(--color-primary)"
          strokeWidth="2"
          vectorEffect="non-scaling-stroke"
        />
        {points.map((p, i) => (
          <circle
            key={p.sessionId}
            cx={x(i)}
            cy={y(p.value)}
            r="11"
            fill="transparent"
            role="button"
            tabIndex={0}
            aria-label={`${formatDateShortBR(p.date)}: ${p.value} ${unit}`}
            onClick={() => onSelect(p)}
            onKeyDown={(e) => {
              if (e.key !== "Enter" && e.key !== " ") return;
              e.preventDefault();
              onSelect(p);
            }}
            style={{ cursor: "pointer" }}
          />
        ))}
        {points.map((p, i) => (
          <circle
            key={`dot-${p.sessionId}`}
            cx={x(i)}
            cy={y(p.value)}
            r="3.5"
            fill="var(--color-primary)"
            pointerEvents="none"
          />
        ))}
      </svg>
      <div className="flex justify-between text-[9px] text-muted-foreground">
        <span>{formatDateShortBR(points[0].date)}</span>
        <span>
          {min} — {max} {unit}
        </span>
        <span>{formatDateShortBR(points.at(-1)!.date)}</span>
      </div>
      {/* Alternativa em lista: nada importante depende do gráfico. */}
      <details className="mt-3">
        <summary className="cursor-pointer text-xs text-muted-foreground">
          Ver valores do gráfico
        </summary>
        <ul className="mt-2 space-y-0.5">
          {points.map((p) => (
            <li key={`row-${p.sessionId}`}>
              <button
                onClick={() => onSelect(p)}
                className="interactive-press flex w-full items-center justify-between gap-2 rounded-md px-1.5 py-1 text-[11px]"
              >
                <span className="text-muted-foreground">{formatDateShortBR(p.date)}</span>
                <span className="min-w-0 flex-1 truncate text-left text-muted-foreground">
                  {p.planLabel}
                </span>
                <span className="font-mono font-semibold tabular-nums">
                  {p.value} {unit}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}
