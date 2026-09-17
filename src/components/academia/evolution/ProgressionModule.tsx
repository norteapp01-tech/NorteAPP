import { useEffect, useMemo, useState } from "react";
import { HelpCircle, Pin, Search, TrendingUp } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { formatDateShortBR } from "@/lib/goals-store";
import {
  availableReferences,
  equipmentLabel,
  exerciseChartSeries,
  exercisesInData,
  loadProgressions,
  MIN_SESSIONS_FOR_PROGRESSION,
  type ChartMode,
  type ChartPoint,
  type FilteredData,
  type ResolvedSet,
} from "@/lib/workout-evolution";
import { ModuleCard, EmptyNote } from "./shared";

// ---------------------------------------------------------------------------
// "Sua evolução nos exercícios" — o módulo de maior destaque.
//
// A lista mostra progressão de CARGA REGISTRADA sob um critério estreito. A
// ordem por percentual é variação relativa da carga, nada mais: não é ranking
// de força nem de músculo "melhor".
//
// Um gráfico só, embaixo, que a lista alimenta ao toque. Três gráficos
// simultâneos dariam a impressão de comparar coisas que não se comparam.
// ---------------------------------------------------------------------------

const PINNED_KEY = "norte:academia:pinnedExercises";
const MAX_PINNED = 3;

function readPinned(): string[] {
  try {
    const raw = window.localStorage.getItem(PINNED_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.slice(0, MAX_PINNED) : [];
  } catch {
    return [];
  }
}

export function ProgressionModule({ data }: { data: FilteredData }) {
  const [pinned, setPinned] = useState<string[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [mode, setMode] = useState<ChartMode>("carga");
  const [reference, setReference] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [showCriteria, setShowCriteria] = useState(false);
  const [openPoint, setOpenPoint] = useState<ChartPoint | null>(null);

  useEffect(() => setPinned(readPinned()), []);

  const progressions = useMemo(() => loadProgressions(data.sets), [data.sets]);
  const available = useMemo(() => exercisesInData(data.sets), [data.sets]);

  // Abre no exercício fixado que exista nos dados; senão, no de registro mais
  // recente. Nunca num exercício que o filtro atual não contém.
  const effective =
    available.find((e) => e.lineageId === selected)?.lineageId ??
    pinned.find((id) => available.some((e) => e.lineageId === id)) ??
    available[0]?.lineageId ??
    "";

  const references = useMemo(
    () => (effective ? availableReferences(data.sets, effective, mode) : []),
    [data.sets, effective, mode],
  );
  const effectiveReference = references.some((r) => r.value === reference)
    ? reference!
    : (references[0]?.value ?? null);

  const points = useMemo(
    () =>
      effective && effectiveReference !== null
        ? exerciseChartSeries(data.sets, effective, mode, effectiveReference)
        : [],
    [data.sets, effective, mode, effectiveReference],
  );

  const togglePin = (lineageId: string) => {
    setPinned((current) => {
      const next = current.includes(lineageId)
        ? current.filter((id) => id !== lineageId)
        : [...current, lineageId].slice(-MAX_PINNED);
      try {
        window.localStorage.setItem(PINNED_KEY, JSON.stringify(next));
      } catch {
        /* Sem storage: a fixação vale só nesta visita. */
      }
      return next;
    });
  };

  const currentName = available.find((e) => e.lineageId === effective)?.name ?? "";
  const filteredOptions = available.filter((e) =>
    e.name.toLowerCase().includes(search.trim().toLowerCase()),
  );

  return (
    <ModuleCard
      title="Sua evolução nos exercícios"
      action={
        <button
          onClick={() => setShowCriteria(true)}
          aria-label="Como esta lista é calculada"
          className="interactive-press flex items-center gap-1 text-[10px] font-semibold text-muted-foreground"
        >
          <HelpCircle className="h-3.5 w-3.5" /> critério
        </button>
      }
    >
      <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
        Maiores progressões de carga
      </p>

      {progressions.length === 0 ? (
        <EmptyNote>
          Nenhum exercício tem registros comparáveis suficientes neste período. São necessárias{" "}
          {MIN_SESSIONS_FOR_PROGRESSION} sessões com o mesmo exercício, o mesmo equipamento e o
          mesmo número de repetições.
        </EmptyNote>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {progressions.map((p) => (
            <li key={`${p.lineageId}-${p.reps}`}>
              <button
                onClick={() => {
                  setSelected(p.lineageId);
                  setMode("carga");
                  setReference(p.reps);
                }}
                className={`interactive-press w-full rounded-lg border p-2.5 text-left ${
                  p.lineageId === effective
                    ? "border-primary/50 bg-primary/10"
                    : "border-border bg-surface-2"
                }`}
              >
                <p className="truncate text-sm font-semibold">
                  {p.name}
                  <span className="font-normal text-muted-foreground">
                    {" · "}
                    {p.reps} repetições
                    {p.equipment ? ` · ${equipmentLabel[p.equipment]}` : ""}
                  </span>
                </p>
                <p className="mt-0.5 font-mono text-[13px] tabular-nums">
                  {p.firstWeight} → {p.lastWeight} kg
                  <span className="text-success">
                    {" · +"}
                    {p.deltaKg} kg
                    {p.deltaPct !== undefined ? ` · +${p.deltaPct}%` : ""}
                  </span>
                  <span className="text-muted-foreground"> · {p.sessionCount} sessões</span>
                </p>
                <p className="text-[10px] text-muted-foreground">
                  {formatDateShortBR(p.firstDate)} — {formatDateShortBR(p.lastDate)}
                </p>
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* ---- gráfico único ---------------------------------------------- */}
      <div className="mt-5 border-t border-border pt-4">
        <div className="flex items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={currentName || "Buscar exercício"}
              aria-label="Buscar exercício"
              className="w-full rounded-lg border border-border bg-surface py-2 pl-7 pr-2 text-xs outline-none focus:border-primary"
            />
          </div>
          {effective && (
            <button
              onClick={() => togglePin(effective)}
              aria-label={pinned.includes(effective) ? "Desafixar exercício" : "Fixar exercício"}
              aria-pressed={pinned.includes(effective)}
              className={`interactive-press flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border ${
                pinned.includes(effective)
                  ? "border-primary bg-primary/15 text-primary"
                  : "border-border text-muted-foreground"
              }`}
            >
              <Pin className="h-4 w-4" />
            </button>
          )}
        </div>

        {search.trim() !== "" && (
          <ul className="mt-1.5 max-h-40 space-y-1 overflow-y-auto">
            {filteredOptions.map((option) => (
              <li key={option.lineageId}>
                <button
                  onClick={() => {
                    setSelected(option.lineageId);
                    setReference(null);
                    setSearch("");
                  }}
                  className="interactive-press flex w-full items-center justify-between gap-2 rounded-md border border-border px-2 py-1.5 text-left text-[11px]"
                >
                  <span className="min-w-0 truncate">{option.name}</span>
                  <span className="shrink-0 text-muted-foreground">{option.sessions} sessões</span>
                </button>
              </li>
            ))}
            {filteredOptions.length === 0 && (
              <li className="px-2 py-1.5 text-[11px] text-muted-foreground">
                Nenhum exercício com registros no período e filtros atuais.
              </li>
            )}
          </ul>
        )}

        {!effective ? (
          <EmptyNote>
            Nenhum exercício com séries registradas neste período. Registre um treino para começar a
            acompanhar.
          </EmptyNote>
        ) : (
          <>
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
                  }}
                  aria-pressed={mode === key}
                  className={`interactive-press rounded-lg px-2 py-1 text-[10px] font-semibold ${
                    mode === key ? "bg-primary/15 text-primary" : "text-muted-foreground"
                  }`}
                >
                  {label}
                </button>
              ))}
              <select
                value={effectiveReference ?? ""}
                onChange={(e) => setReference(Number(e.target.value))}
                aria-label={mode === "carga" ? "Número de repetições" : "Carga"}
                className="ml-auto min-w-0 rounded-md border border-border bg-surface px-2 py-1 text-[11px] outline-none focus:border-primary"
              >
                {references.map((r) => (
                  <option key={r.value} value={r.value}>
                    {mode === "carga" ? `${r.value} reps` : `${r.value} kg`} ({r.sessions})
                  </option>
                ))}
              </select>
            </div>
            <p className="mt-1 text-[10px] text-muted-foreground">
              {mode === "carga"
                ? `Carga registrada com exatamente ${effectiveReference} repetições.`
                : `Repetições registradas com exatamente ${effectiveReference} kg.`}
            </p>

            <Chart
              points={points}
              unit={mode === "carga" ? "kg" : "reps"}
              onSelectPoint={setOpenPoint}
            />
          </>
        )}
      </div>

      {showCriteria && (
        <Modal onClose={() => setShowCriteria(false)} title="Como a lista é calculada">
          <ul className="space-y-2 text-sm leading-relaxed text-muted-foreground">
            <li>• Mesmo exercício e mesmo equipamento — trocar de aparelho começa outra série.</li>
            <li>• Só séries com o mesmo número de repetições se comparam.</li>
            <li>
              • São necessárias pelo menos {MIN_SESSIONS_FOR_PROGRESSION} sessões com registros
              comparáveis no período.
            </li>
            <li>
              • Em cada sessão vale a melhor carga naquela referência; comparamos a primeira com a
              última sessão elegível.
            </li>
            <li>
              • Exercícios assistidos ou sem carga externa ficam fora — reduzir assistência é
              progresso, mas não é aumento de kg.
            </li>
          </ul>
          <p className="mt-3 text-sm leading-relaxed">
            O percentual é a variação relativa da carga registrada. Não compara força entre
            exercícios diferentes, e não mede crescimento muscular nem esforço.
          </p>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Um exercício sem dados suficientes continua acessível na busca abaixo — ele só não entra
            no ranking.
          </p>
        </Modal>
      )}

      {openPoint && (
        <PointDrawer point={openPoint} sets={data.sets} onClose={() => setOpenPoint(null)} />
      )}
    </ModuleCard>
  );
}

/** Linha simples com pontos tocáveis. Sem hover: tudo o que importa abre por
 * toque, e a lista da gaveta é a alternativa acessível ao gráfico. */
function Chart({
  points,
  unit,
  onSelectPoint,
}: {
  points: ChartPoint[];
  unit: string;
  onSelectPoint: (point: ChartPoint) => void;
}) {
  if (points.length === 0) {
    return (
      <EmptyNote>
        Nenhuma sessão com essa combinação de carga e repetições. Escolha outra referência ou
        registre um treino com ela.
      </EmptyNote>
    );
  }
  if (points.length === 1) {
    return (
      <div className="mt-3 rounded-lg border border-border bg-surface-2 p-3">
        <p className="text-[11px] font-semibold">Primeiro registro</p>
        <button
          onClick={() => onSelectPoint(points[0])}
          className="interactive-press mt-1 font-mono text-lg font-bold tabular-nums"
        >
          {points[0].value} {unit}
        </button>
        <p className="text-[11px] text-muted-foreground">
          {formatDateShortBR(points[0].date)} · toque para ver as séries
        </p>
      </div>
    );
  }

  const values = points.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const height = 120;
  const width = 300;
  const x = (i: number) => (i / (points.length - 1)) * width;
  const y = (v: number) => height - ((v - min) / span) * (height - 20) - 10;

  return (
    <div className="mt-3">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-32 w-full"
        role="img"
        aria-label={`Evolução em ${unit}: ${points.map((p) => `${formatDateShortBR(p.date)} ${p.value}`).join(", ")}`}
      >
        <polyline
          points={points.map((p, i) => `${x(i)},${y(p.value)}`).join(" ")}
          fill="none"
          stroke="var(--primary)"
          strokeWidth="2"
          vectorEffect="non-scaling-stroke"
        />
        {points.map((p, i) => (
          <circle
            key={p.sessionId}
            cx={x(i)}
            cy={y(p.value)}
            r="9"
            fill="var(--primary)"
            fillOpacity="0.001"
            stroke="none"
            onClick={() => onSelectPoint(p)}
            style={{ cursor: "pointer" }}
          />
        ))}
        {points.map((p, i) => (
          <circle
            key={`dot-${p.sessionId}`}
            cx={x(i)}
            cy={y(p.value)}
            r="3"
            fill="var(--primary)"
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
      {/* Alternativa acessível: a mesma série em lista tocável. */}
      <ul className="mt-2 space-y-1">
        {points.map((p) => (
          <li key={`row-${p.sessionId}`}>
            <button
              onClick={() => onSelectPoint(p)}
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
    </div>
  );
}

/** Todas as séries daquela sessão para aquele exercício — a evidência do
 * ponto, não um resumo dela. */
function PointDrawer({
  point,
  sets,
  onClose,
}: {
  point: ChartPoint;
  sets: ResolvedSet[];
  onClose: () => void;
}) {
  const rows = sets
    .filter((s) => s.sessionId === point.sessionId)
    .sort((a, b) => a.name.localeCompare(b.name) || a.setIndex - b.setIndex);
  const name = rows[0]?.name ?? "Exercício";

  return (
    <Modal onClose={onClose} title={formatDateShortBR(point.date)}>
      <p className="text-xs text-muted-foreground">
        {point.planLabel} · {name}
      </p>
      <ul className="mt-3 space-y-1">
        {rows.map((s) => (
          <li
            key={`${s.exerciseId}-${s.setIndex}`}
            className="flex items-center justify-between gap-2 rounded-lg border border-border bg-surface-2 px-2.5 py-2 text-xs"
          >
            <span className="text-muted-foreground">
              {s.name} · série {s.setIndex + 1}
            </span>
            <span className="font-mono font-semibold tabular-nums">
              {s.weight} kg × {s.reps}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-3 flex items-start gap-1.5 text-[11px] leading-relaxed text-muted-foreground">
        <TrendingUp className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        Estes são os registros que formam este ponto. A sessão completa fica no histórico da
        Academia.
      </p>
    </Modal>
  );
}
