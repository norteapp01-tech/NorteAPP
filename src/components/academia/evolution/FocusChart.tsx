import type { MuscleGroup } from "@/lib/workout-store";
import {
  BAND_END,
  BAND_START,
  focusSummary,
  type FocusStatus,
  type FocusTrend,
  type MuscleFocus,
} from "@/lib/workout-focus";

// ---------------------------------------------------------------------------
// "Foco por músculo" — substitui a contagem crua de séries.
//
// Cada linha é um músculo comparado com a PRÓPRIA faixa de referência semanal.
// A faixa ocupa a mesma posição em todas as linhas, então dá para ver de relance
// quem está abaixo, na faixa ou acima — e, ao lado, se o músculo está evoluindo
// ou estagnado nos exercícios.
// ---------------------------------------------------------------------------

const STATUS: Record<FocusStatus, { label: string; color: string }> = {
  sem_registro: { label: "Sem registro", color: "var(--muted-foreground)" },
  abaixo: { label: "Pouco foco", color: "#e8b56a" },
  na_faixa: { label: "Na faixa", color: "var(--color-primary)" },
  acima: { label: "Muito foco", color: "#9ec5ff" },
};

const TREND: Record<FocusTrend, { label: string; icon: string; tone: string }> = {
  evoluindo: { label: "Evoluindo", icon: "↗", tone: "text-primary" },
  estagnado: { label: "Estagnado", icon: "→", tone: "text-[#e8b56a]" },
  caindo: { label: "Caindo", icon: "↘", tone: "text-[#e8b56a]" },
  misto: { label: "Misto", icon: "↕", tone: "text-muted-foreground" },
  sem_dados: { label: "Sem comparação", icon: "·", tone: "text-muted-foreground" },
};

const fmt = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
const names = (rows: MuscleFocus[]) => rows.map((r) => r.label.replace(/ \(.*\)/, "")).join(", ");

export function FocusChart({
  rows,
  selected,
  onSelect,
}: {
  rows: MuscleFocus[];
  selected: MuscleGroup | null;
  onSelect: (group: MuscleGroup | null) => void;
}) {
  if (rows.every((r) => r.status === "sem_registro")) {
    return (
      <p className="text-sm leading-relaxed text-muted-foreground">
        Nenhuma série classificada por músculo neste período. Classifique os exercícios na ficha do
        treino para ver onde está o seu foco.
      </p>
    );
  }
  const s = focusSummary(rows);

  return (
    <div className="evo-focus">
      {/* A leitura, em palavras */}
      <div className="evo-focus-summary">
        {s.mostFocus.length > 0 && (
          <p>
            <b style={{ color: s.mostFocus[0].status === "acima" ? STATUS.acima.color : STATUS.na_faixa.color }}>
              {s.mostFocus[0].status === "acima" ? "Muito foco" : "Na faixa"}
            </b>
            <span>{names(s.mostFocus)}</span>
          </p>
        )}
        {s.lowFocus.length > 0 && (
          <p>
            <b style={{ color: STATUS.abaixo.color }}>Pouco foco</b>
            <span>{names(s.lowFocus)}</span>
          </p>
        )}
        {s.untrained.length > 0 && (
          <p>
            <b className="text-muted-foreground">Sem registro</b>
            <span>{names(s.untrained)}</span>
          </p>
        )}
        {s.evolving.length > 0 && (
          <p>
            <b className="text-primary">Evoluindo</b>
            <span>{s.evolving.length > 4 ? `${s.evolving.length} músculos` : names(s.evolving)}</span>
          </p>
        )}
        {s.stalled.length > 0 && (
          <p>
            <b style={{ color: "#e8b56a" }}>Estagnados</b>
            <span>{names(s.stalled)}</span>
          </p>
        )}
      </div>

      {/* Escala comum: a faixa de cada músculo fica no mesmo lugar */}
      <div className="evo-focus-scale" aria-hidden="true">
        <span style={{ left: 0 }}>pouco</span>
        <span style={{ left: `${((BAND_START + BAND_END) / 2) * 100}%`, transform: "translateX(-50%)" }}>
          faixa ideal
        </span>
        <span style={{ right: 0 }}>muito</span>
      </div>

      <ul className="evo-focus-list">
        {rows.map((r) => {
          const active = selected === r.group;
          const st = STATUS[r.status];
          const tr = TREND[r.trend];
          return (
            <li key={r.group}>
              <button
                type="button"
                aria-pressed={active}
                onClick={() => onSelect(active ? null : r.group)}
                className={`evo-focus-row interactive-press ${active ? "is-active" : ""}`}
                aria-label={`${r.label}: ${fmt(r.weekly)} séries por semana, faixa ${r.range.min} a ${r.range.max}, ${st.label}, ${tr.label}`}
              >
                <div className="evo-focus-head">
                  <span className="evo-focus-name">{r.label.replace(/ \(.*\)/, "")}</span>
                  <span className={`evo-focus-trend ${tr.tone}`}>
                    {tr.icon} {tr.label}
                  </span>
                </div>
                <div className="evo-focus-track">
                  <i
                    className="evo-focus-band"
                    style={{ left: `${BAND_START * 100}%`, width: `${(BAND_END - BAND_START) * 100}%` }}
                  />
                  <i
                    className="evo-focus-fill"
                    style={{ width: `${Math.max(r.position * 100, r.weekly > 0 ? 2 : 0)}%`, background: st.color }}
                  />
                </div>
                <div className="evo-focus-meta">
                  <span>
                    <b>{fmt(r.weekly)}</b> séries/sem · faixa {r.range.min}–{r.range.max}
                  </span>
                  <span style={{ color: st.color }}>
                    {st.label}
                    {r.weeklyDelta !== undefined && r.weeklyDelta !== 0 && (
                      <em className="text-muted-foreground">
                        {" "}
                        · {r.weeklyDelta > 0 ? "+" : ""}
                        {fmt(r.weeklyDelta)}
                      </em>
                    )}
                  </span>
                </div>
              </button>
            </li>
          );
        })}
      </ul>

      <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
        Séries por semana de cada músculo (as diretas, mais meia série quando ele trabalha como
        secundário), comparadas com uma faixa de referência geral para hipertrofia própria de cada
        músculo. “Evoluindo” e “estagnado” vêm da carga e das repetições dos seus exercícios; a
        variação compara com o período anterior. Serve para comparar o foco — não é prescrição.
      </p>
    </div>
  );
}
