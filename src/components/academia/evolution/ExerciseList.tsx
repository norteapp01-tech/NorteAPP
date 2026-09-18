import { useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { equipmentLabel, type PersonalRecord, type ResolvedSet } from "@/lib/workout-evolution";
import {
  PROLONGED_STABILITY_SESSIONS,
  exerciseShares,
  type ExerciseEvolution,
} from "@/lib/workout-explorer";
import { ExerciseAnalysis } from "./ExerciseAnalysis";
import { Disclosure } from "./shared";

// ---------------------------------------------------------------------------
// Lista de exercícios do músculo selecionado.
//
// Só um exercício aberto por vez: dois painéis de gráfico abertos na mesma
// tela viram parede. Trocar de exercício fecha o anterior, e trocar de músculo
// fecha tudo (quem controla isso é a análise do músculo, acima).
//
// A ordenação inicial coloca primeiro o que pede atenção — queda registrada e
// estabilidade prolongada. Isso é priorização de leitura, não diagnóstico:
// "estável" nunca vira "platô".
// ---------------------------------------------------------------------------

type Order = "atencao" | "evolucao" | "treinados" | "recentes";

const ORDER_LABEL: Record<Order, string> = {
  atencao: "Atenção",
  evolucao: "Maior evolução",
  treinados: "Mais treinados",
  recentes: "Mais recentes",
};

const STATUS_LABEL: Record<ExerciseEvolution["status"], string> = {
  progressao: "Em progressão",
  estavel: "Estável",
  queda: "Queda registrada",
  sem_comparacao: "Sem comparação",
};

const needsAttention = (e: ExerciseEvolution) =>
  e.status === "queda" ||
  (e.status === "estavel" && e.stableStreak >= PROLONGED_STABILITY_SESSIONS);

export function ExerciseList({
  evolutions,
  setsOf,
  records,
  openKey,
  onOpenKey,
  open,
  onOpenChange,
}: {
  evolutions: ExerciseEvolution[];
  /** Séries de um exercício (linhagem + equipamento), para a análise interna. */
  setsOf: (key: string) => ResolvedSet[];
  records: PersonalRecord[];
  openKey: string | null;
  onOpenKey: (key: string | null) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [order, setOrder] = useState<Order>("atencao");

  const counts = {
    progressao: evolutions.filter((e) => e.status === "progressao").length,
    estavel: evolutions.filter((e) => e.status === "estavel").length,
    queda: evolutions.filter((e) => e.status === "queda").length,
    sem: evolutions.filter((e) => e.status === "sem_comparacao").length,
  };

  const ordered = useMemo(() => {
    const rank = (e: ExerciseEvolution) =>
      needsAttention(e) ? 0 : e.status === "progressao" ? 1 : e.status === "estavel" ? 2 : 3;
    return [...evolutions].sort((a, b) => {
      if (order === "treinados") return b.sessions.length - a.sessions.length;
      if (order === "recentes") return b.lastDate.localeCompare(a.lastDate);
      if (order === "evolucao") return (b.pct ?? -Infinity) - (a.pct ?? -Infinity);
      return rank(a) - rank(b) || b.sessions.length - a.sessions.length;
    });
  }, [evolutions, order]);

  const summary = [
    counts.progressao > 0 && `${counts.progressao} em progressão`,
    counts.queda > 0 && `${counts.queda} com queda`,
    counts.estavel > 0 && `${counts.estavel} ${counts.estavel === 1 ? "estável" : "estáveis"}`,
    counts.sem > 0 && `${counts.sem} sem comparação`,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <Disclosure
      title={`Exercícios · ${evolutions.length}`}
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) onOpenKey(null);
      }}
    >
      {evolutions.length === 0 ? (
        <p className="evo-note">
          Nenhum exercício deste músculo com séries registradas no período.
        </p>
      ) : (
        <>
          <div className="flex items-center justify-between gap-2">
            <p className="min-w-0 flex-1 text-[11px] text-muted-foreground">{summary}</p>
            <select
              value={order}
              onChange={(e) => setOrder(e.target.value as Order)}
              aria-label="Ordenar exercícios"
            >
              {(Object.keys(ORDER_LABEL) as Order[]).map((key) => (
                <option key={key} value={key}>
                  {ORDER_LABEL[key]}
                </option>
              ))}
            </select>
          </div>

          <ul className="mt-2">
            {ordered.map((evolution) => {
              const expanded = openKey === evolution.key;
              const last = evolution.sessions.at(-1);
              return (
                <li key={evolution.key} className="evo-exercise">
                  <button
                    onClick={() => onOpenKey(expanded ? null : evolution.key)}
                    aria-expanded={expanded}
                    className="evo-exercise-head interactive-press"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{evolution.name}</p>
                      <p className="truncate text-[11px] text-muted-foreground">
                        {evolution.equipment
                          ? equipmentLabel[evolution.equipment]
                          : "Equipamento não informado"}{" "}
                        · {evolution.sessions.length}{" "}
                        {evolution.sessions.length === 1 ? "sessão" : "sessões"}
                        {last ? ` · ${last.weight} kg × ${last.reps}` : ""}
                      </p>
                      <p
                        className="mt-0.5 text-[11px] font-semibold"
                        data-status={evolution.status}
                      >
                        {STATUS_LABEL[evolution.status]}
                        {evolution.pct !== null &&
                          ` · ${evolution.pct > 0 ? "+" : ""}${evolution.pct.toLocaleString(
                            "pt-BR",
                            {
                              maximumFractionDigits: 1,
                            },
                          )}%`}
                      </p>
                    </div>
                    <Spark evolution={evolution} />
                    <ChevronDown
                      size={16}
                      className="shrink-0 text-muted-foreground transition-transform"
                      style={{ transform: expanded ? "rotate(180deg)" : undefined }}
                    />
                  </button>
                  <div className="drawer-collapse" data-open={expanded}>
                    <div inert={!expanded} aria-hidden={!expanded}>
                      {expanded && (
                        <ExerciseAnalysis
                          evolution={evolution}
                          sets={setsOf(evolution.key)}
                          records={records.filter((r) => r.lineageId === evolution.lineageId)}
                        />
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>

          <Disclosure title="Participação por exercício" hint="só séries diretas">
            <Shares evolutions={evolutions} setsOf={setsOf} />
          </Disclosure>
        </>
      )}
    </Disclosure>
  );
}

/** Minigráfico da carga da série representativa. Com menos de dois pontos nada
 * é desenhado: uma reta inventada sugeriria medições que não existem. */
function Spark({ evolution }: { evolution: ExerciseEvolution }) {
  const values = evolution.sessions.map((s) => (s.weight > 0 ? s.weight : s.reps));
  if (values.length < 2) return <span className="w-12 shrink-0" aria-hidden />;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const points = values
    .map((v, i) => `${(i / (values.length - 1)) * 46},${18 - ((v - min) / span) * 14}`)
    .join(" ");
  const stroke =
    evolution.status === "progressao"
      ? "var(--evo-up)"
      : evolution.status === "queda"
        ? "var(--evo-down)"
        : "var(--evo-flat)";
  return (
    <svg viewBox="0 0 46 20" className="h-5 w-12 shrink-0" aria-hidden>
      <polyline
        points={points}
        fill="none"
        stroke={stroke}
        strokeWidth="1.6"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

function Shares({
  evolutions,
  setsOf,
}: {
  evolutions: ExerciseEvolution[];
  setsOf: (key: string) => ResolvedSet[];
}) {
  const shares = useMemo(
    () => exerciseShares(evolutions.flatMap((e) => setsOf(e.key))),
    [evolutions, setsOf],
  );
  if (shares.length === 0) return <p className="evo-note">Sem séries diretas no período.</p>;
  return (
    <>
      <ul className="space-y-1.5">
        {shares.map((share) => (
          <li key={share.key}>
            <div className="flex items-baseline justify-between gap-2 text-[11px]">
              <span className="min-w-0 truncate">{share.name}</span>
              <span className="shrink-0 font-mono tabular-nums text-muted-foreground">
                {share.sets} {share.sets === 1 ? "série" : "séries"} · {share.pct}%
              </span>
            </div>
            <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
              <div
                className="h-full rounded-full bg-primary/70"
                style={{ width: `${share.pct}%` }}
              />
            </div>
          </li>
        ))}
      </ul>
      <p className="evo-note mt-2">
        Distribuição das séries diretas deste músculo. Participação secundária não entra aqui.
      </p>
    </>
  );
}
