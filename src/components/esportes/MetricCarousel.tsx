import { useEffect, useRef, useState } from "react";
import { ChevronUp, ChevronDown } from "lucide-react";
import { formatDateShortBR } from "@/lib/goals-store";
import {
  METRIC_FACES,
  faceDataState,
  formatPaceDelta,
  metricFaceLabel,
  paceDelta,
  rotateFace,
  type MetricFace,
  type WeeklyMetrics,
} from "@/lib/sport-analytics";
import {
  formatDurationClock,
  formatPace,
  formatSpeedKmh,
  type SportModality,
} from "@/lib/sport-store";

// ---------------------------------------------------------------------------
// Carrossel de análise — um prisma retangular com três faces.
//
// O gesto vertical compete com a rolagem da página, então ele NÃO é capturado
// no gráfico inteiro: só na faixa lateral, que é visível, tem `touch-action:
// none` e traz setas e indicadores. Fora dela a página rola como sempre.
//
// A mesma troca também acontece por seta, por clique no indicador, por clique
// no título e por teclado — o gesto é um atalho, nunca o único caminho.
// ---------------------------------------------------------------------------

const HINT_KEY = "norte:esportes:carrosselHintVisto";
/** Deslocamento mínimo para virar a face: abaixo disso é toque, não arrasto. */
const DRAG_THRESHOLD_PX = 28;

export function MetricCarousel({
  series,
  modality,
  weeks,
}: {
  series: WeeklyMetrics[];
  modality: SportModality;
  weeks: number;
}) {
  const [face, setFace] = useState<MetricFace>("ritmo");
  const [hintVisible, setHintVisible] = useState(false);
  const railRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ startY: number; committed: boolean; captured: boolean } | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setHintVisible(window.localStorage.getItem(HINT_KEY) !== "1");
  }, []);

  const change = (next: MetricFace) => {
    setFace(next);
    if (hintVisible) {
      setHintVisible(false);
      window.localStorage.setItem(HINT_KEY, "1");
    }
  };

  const step = (direction: 1 | -1) => change(rotateFace(face, direction));

  // A captura do ponteiro só acontece DEPOIS do limiar de arrasto. Capturar
  // já no `pointerdown` redirecionava todos os eventos seguintes para a faixa
  // e o `click` nunca chegava às setas que vivem dentro dela — as setas
  // simplesmente não funcionavam.
  const onPointerDown = (e: React.PointerEvent) => {
    drag.current = { startY: e.clientY, committed: false, captured: false };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const state = drag.current;
    if (!state || state.committed) return;
    const dy = e.clientY - state.startY;
    if (Math.abs(dy) < DRAG_THRESHOLD_PX) return;
    if (!state.captured) {
      railRef.current?.setPointerCapture(e.pointerId);
      state.captured = true;
    }
    // Arrastar para CIMA avança para a próxima métrica.
    state.committed = true;
    step(dy < 0 ? 1 : -1);
  };
  const endDrag = (e: React.PointerEvent) => {
    if (drag.current?.captured) railRef.current?.releasePointerCapture(e.pointerId);
    drag.current = null;
  };

  const index = METRIC_FACES.indexOf(face);

  return (
    <div>
      {/* Nomes das faces vizinhas, acima e abaixo: é o que torna visível que
          existe algo antes e depois sem precisar do gesto para descobrir. */}
      <button onClick={() => step(-1)} aria-hidden tabIndex={-1} className="sp-prism-peek">
        {metricFaceLabel(rotateFace(face, -1), modality)}
      </button>

      <div className="flex items-stretch gap-1">
        <div className="sp-prism">
          <div
            className="sp-prism-stage"
            style={{ transform: `translateZ(-49px) rotateX(${index * 120}deg)` }}
          >
            {METRIC_FACES.map((key, i) => (
              <div
                key={key}
                className="sp-prism-face"
                data-active={key === face}
                // 170px de altura → raio = 170 / (2·tan60°) ≈ 49px.
                style={{ transform: `rotateX(${-i * 120}deg) translateZ(49px)` }}
                aria-hidden={key !== face}
                inert={key !== face}
              >
                <Face
                  face={key}
                  series={series}
                  modality={modality}
                  weeks={weeks}
                  onTitleClick={() => step(1)}
                />
              </div>
            ))}
          </div>
        </div>

        {/* Faixa de controle — o gesto vive aqui. */}
        <div
          ref={railRef}
          className="sp-prism-rail"
          role="group"
          aria-label="Trocar a análise"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          <button
            onClick={() => step(-1)}
            aria-label="Análise anterior"
            className="interactive-press"
          >
            <ChevronUp size={20} />
          </button>
          <div className="sp-prism-dots" role="tablist" aria-orientation="vertical">
            {METRIC_FACES.map((key) => (
              <button
                key={key}
                role="tab"
                aria-current={key === face}
                aria-selected={key === face}
                aria-label={metricFaceLabel(key, modality)}
                onClick={() => change(key)}
              />
            ))}
          </div>
          <button
            onClick={() => step(1)}
            aria-label="Próxima análise"
            className="interactive-press"
          >
            <ChevronDown size={20} />
          </button>
        </div>
      </div>

      <button onClick={() => step(1)} aria-hidden tabIndex={-1} className="sp-prism-peek">
        {metricFaceLabel(rotateFace(face, 1), modality)}
      </button>

      <p className="mt-1 text-center text-[11px]" style={{ color: "var(--sp-muted)" }}>
        {hintVisible ? "Deslize para trocar a análise" : " "}
      </p>
      {/* O leitor de tela precisa saber que a face mudou, não só vê-la girar. */}
      <p className="sr-only" role="status">
        Análise atual: {metricFaceLabel(face, modality)}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Uma face
// ---------------------------------------------------------------------------

function Face({
  face,
  series,
  modality,
  weeks,
  onTitleClick,
}: {
  face: MetricFace;
  series: WeeklyMetrics[];
  modality: SportModality;
  weeks: number;
  onTitleClick: () => void;
}) {
  const [picked, setPicked] = useState<number | null>(null);
  const state = faceDataState(series, face);
  const isPace = face === "ritmo";
  const isSpeed = isPace && modality === "ciclismo";

  const valueOf = (w: WeeklyMetrics): number | null => {
    if (face === "frequencia") return w.sessions;
    if (face === "volume") return w.distanceM > 0 ? w.distanceM / 1000 : null;
    return isSpeed ? w.speedKmh : w.paceSPerKm;
  };

  const last = [...series].reverse().find((w) => valueOf(w) !== null);
  const headline =
    last === undefined
      ? "—"
      : isSpeed
        ? formatSpeedKmh(last.speedKmh)
        : isPace
          ? formatPace(last.paceSPerKm)
          : face === "volume"
            ? `${(last.distanceM / 1000).toFixed(1)} km`
            : `${last.sessions} ${last.sessions === 1 ? "atividade" : "atividades"}`;

  const sub =
    isPace && !isSpeed
      ? formatPaceDelta(paceDelta(series))
      : face === "volume"
        ? "na última semana"
        : "na última semana";

  const chosen = picked !== null ? series[picked] : null;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-start justify-between gap-2">
        <button
          onClick={onTitleClick}
          className="interactive-press text-left text-[15px] font-semibold"
          style={{ color: "var(--sp-title)" }}
        >
          {metricFaceLabel(face, modality)}
        </button>
        <div className="text-right">
          <p className="sp-metric-value">{headline}</p>
          {sub && (
            <p className="text-[11px]" style={{ color: "var(--sp-muted)" }}>
              {sub}
            </p>
          )}
        </div>
      </div>

      {state === "sem_atividades" ? (
        <Note>
          Nenhuma atividade registrada nas últimas {weeks} semanas. O gráfico aparece assim que
          houver registro.
        </Note>
      ) : state === "dados_insuficientes" ? (
        <Note>
          Uma semana com registro. Com duas dá para comparar — por enquanto o número acima é o que
          existe.
        </Note>
      ) : (
        <>
          <Chart
            series={series}
            valueOf={valueOf}
            invert={isPace && !isSpeed}
            face={face}
            picked={picked}
            onPick={setPicked}
          />
          <p
            className="mt-1 min-h-[22px] text-[10px] leading-snug"
            style={{ color: "var(--sp-muted)" }}
          >
            {chosen ? describeWeek(chosen, face, modality) : "Toque num ponto para ver a semana."}
          </p>
        </>
      )}
    </div>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-4 flex-1 text-[12px] leading-relaxed" style={{ color: "var(--sp-muted)" }}>
      {children}
    </p>
  );
}

function describeWeek(w: WeeklyMetrics, face: MetricFace, modality: SportModality): string {
  const period = `${formatDateShortBR(w.weekStartIso)} a ${formatDateShortBR(w.weekEndIso)}`;
  const count = `${w.sessions} ${w.sessions === 1 ? "atividade" : "atividades"}`;
  if (face === "frequencia") {
    return w.sessions === 0
      ? `${period}: nenhuma atividade.`
      : `${period}: ${count} — ${w.dates.map((d) => formatDateShortBR(d)).join(", ")}.`;
  }
  const km = `${(w.distanceM / 1000).toFixed(1)} km`;
  const time = formatDurationClock(w.activeDurationS);
  if (face === "volume") return `${period}: ${km} em ${count}, ${time} no total.`;
  const speed = modality === "ciclismo" ? formatSpeedKmh(w.speedKmh) : formatPace(w.paceSPerKm);
  return `${period}: ${speed} · ${count} · ${km} · ${time}.`;
}

// ---------------------------------------------------------------------------
// Gráfico de linha — mínimo de propósito: sem grade cheia, sem legenda
// redundante, sem eixo pesado.
// ---------------------------------------------------------------------------

const W = 280;
const H = 82;
const PAD_LEFT = 34;
const PAD_BOTTOM = 17;
const PAD_TOP = 7;
/** Folga à direita para o último rótulo do eixo caber inteiro. */
const PAD_RIGHT = 20;

function Chart({
  series,
  valueOf,
  invert,
  face,
  picked,
  onPick,
}: {
  series: WeeklyMetrics[];
  valueOf: (w: WeeklyMetrics) => number | null;
  /** No ritmo, menor é melhor: o eixo é invertido para o mais rápido ficar em
   * cima. Sem isso o gráfico se lê ao contrário. */
  invert: boolean;
  face: MetricFace;
  picked: number | null;
  onPick: (i: number | null) => void;
}) {
  const points = series
    .map((w, i) => ({ i, w, v: valueOf(w) }))
    .filter((p): p is { i: number; w: WeeklyMetrics; v: number } => p.v !== null);
  if (points.length < 2) return null;

  const values = points.map((p) => p.v);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || Math.max(1, max * 0.1);
  const plotH = H - PAD_BOTTOM - PAD_TOP;

  const x = (i: number) =>
    PAD_LEFT + (series.length === 1 ? 0 : (i / (series.length - 1)) * (W - PAD_LEFT - PAD_RIGHT));
  const y = (v: number) => {
    const t = (v - min) / span;
    return PAD_TOP + (invert ? t : 1 - t) * plotH;
  };

  const axisLabel = (v: number) =>
    face === "ritmo"
      ? `${Math.floor(v / 60)}:${String(Math.round(v % 60)).padStart(2, "0")}`
      : face === "volume"
        ? String(Math.round(v))
        : String(Math.round(v));

  // Três referências em valores REDONDOS. Marcar "6:03" e "6:17" só porque
  // foram os extremos exatos dos dados faz o eixo parecer ruído.
  const ticks = niceTicks(min, max, face);

  return (
    <svg
      data-norte-chart="line"
      viewBox={`0 0 ${W} ${H}`}
      className="sp-chart mt-2 w-full"
      role="img"
      aria-label={`${face}: ${points.map((p) => `${formatDateShortBR(p.w.weekStartIso)} ${axisLabel(p.v)}`).join(", ")}`}
    >
      {invert && (
        <text x={PAD_LEFT} y={6} textAnchor="start">
          mais rápido ↑
        </text>
      )}
      {ticks.map((t, i) => (
        <g key={i}>
          <line className="sp-grid-line" x1={PAD_LEFT} y1={y(t)} x2={W - PAD_RIGHT} y2={y(t)} />
          <text x={PAD_LEFT - 5} y={y(t) + 3} textAnchor="end">
            {axisLabel(t)}
          </text>
        </g>
      ))}

      <polyline
        data-series="true"
        points={points.map((p) => `${x(p.i)},${y(p.v)}`).join(" ")}
        fill="none"
        stroke={face === "frequencia" ? "var(--sp-title)" : "var(--sp-accent)"}
        strokeWidth={2}
        strokeOpacity={face === "volume" ? 0.8 : 1}
        vectorEffect="non-scaling-stroke"
      />

      {points.map((p) => (
        <g key={p.i}>
          <line className="sp-guide" x1={x(p.i)} y1={y(p.v)} x2={x(p.i)} y2={H - PAD_BOTTOM} />
          {/* Alvo de toque generoso, invisível: o ponto desenhado tem 5px. */}
          <circle
            className="sp-dot"
            cx={x(p.i)}
            cy={y(p.v)}
            r="14"
            fill="transparent"
            role="button"
            tabIndex={0}
            aria-label={`Semana de ${formatDateShortBR(p.w.weekStartIso)}`}
            aria-pressed={picked === p.i}
            style={{ cursor: "pointer" }}
            onClick={() => onPick(picked === p.i ? null : p.i)}
            onKeyDown={(e) => {
              if (e.key !== "Enter" && e.key !== " ") return;
              e.preventDefault();
              onPick(picked === p.i ? null : p.i);
            }}
          />
          <circle
            cx={x(p.i)}
            cy={y(p.v)}
            r={picked === p.i ? 6 : 5}
            fill={face === "frequencia" ? "var(--sp-title)" : "var(--sp-accent)"}
            stroke="var(--sp-card)"
            strokeWidth="2"
            pointerEvents="none"
          />
        </g>
      ))}

      {series.map((w, i) => (
        <text key={w.weekStartIso} x={x(i)} y={H - 5} textAnchor="middle">
          {shortWeekLabel(w.weekStartIso)}
        </text>
      ))}
    </svg>
  );
}

/** Três marcas legíveis cobrindo os dados: minuto cheio no ritmo, inteiro nas
 * demais. Sempre contêm o intervalo, nunca cortam um ponto fora do gráfico. */
function niceTicks(min: number, max: number, face: MetricFace): number[] {
  const stepSize = face === "ritmo" ? 60 : Math.max(1, Math.ceil((max - min) / 2));
  const lo = Math.floor(min / stepSize) * stepSize;
  const hi = Math.ceil(max / stepSize) * stepSize;
  if (hi === lo) return [lo];
  const mid = (lo + hi) / 2;
  return hi - lo <= stepSize ? [lo, hi] : [lo, mid, hi];
}

const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

function shortWeekLabel(iso: string): string {
  return `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1]}`;
}
