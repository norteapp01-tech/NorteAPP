import { chartTheme } from "@/components/ui/norte-chart-theme";
import { ProgressRing } from "@/components/ui/progress-ring";
import { useMemo, useRef, useState } from "react";
import {
  ArrowUpRight,
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Info,
} from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  ReferenceLine,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { nutritionAnalysis, nutritionMetrics, averageNutrient } from "@/lib/nutrition-analytics";
import type { NutritionState } from "@/lib/nutrition-store";
import { nowDate } from "@/lib/test-clock";
import { Modal } from "@/components/ui/modal";

export function NutritionAnalysis({ state }: { state: NutritionState }) {
  const [days, setDays] = useState(30);
  const [index, setIndex] = useState(0);
  const [details, setDetails] = useState(false);
  const [help, setHelp] = useState(false);
  const start = useRef<number | null>(null);
  const scroll = useRef<HTMLDivElement>(null);
  const data = useMemo(() => nutritionAnalysis(state, days, nowDate()), [state, days]);
  const metric = nutritionMetrics[index];
  const goal = state.goals[metric.key];
  const average = averageNutrient(data.points, metric.key);
  const change = (direction: number) => setIndex((i) => (i + direction + 4) % 4);
  const points = data.points.map((p) => ({ date: p.date, value: p.totals?.[metric.key] ?? null }));
  return (
    <div className="nutrition-analysis">
      <div>
        <h2>Sua análise</h2>
        <p>Entenda seus padrões, sem complicação.</p>
      </div>
      <div className="norte-segmented" aria-label="Período da análise">
        {[7, 30, 90].map((n) => (
          <button
            key={n}
            aria-pressed={days === n}
            onClick={() => {
              setDays(n);
              scroll.current?.scrollTo({ left: 0 });
            }}
          >
            {n === 90 ? "3 meses" : n + " dias"}
          </button>
        ))}
      </div>
      <section className="nutrition-panel">
        <div className="nutrition-section-heading">
          <h3>Consistência</h3>
          <button aria-label="Como a consistência é calculada" onClick={() => setHelp(true)}>
            <Info size={16} />
          </button>
        </div>
        <div className="nutrition-consistency">
          <ProgressRing value={data.current.pct} label="Consistência alimentar" size={100}>
            <strong>{data.current.pct === null ? "—" : data.current.pct + "%"}</strong>
          </ProgressRing>
          <div>
            <strong>
              {data.current.matched} de {data.current.recorded} dias
            </strong>
            <p>dentro das metas</p>
            <small className="nutrition-comparison">
              {data.delta !== null ? (
                <>
                  <ArrowUpRight size={16} />
                  {data.delta > 0 ? "+" : ""}
                  {data.delta} p.p. <span>vs. período anterior</span>
                </>
              ) : (
                "Comparação disponível com mais registros"
              )}
            </small>
          </div>
        </div>
      </section>
      <section className="nutrition-panel nutrition-chart-panel">
        <div className="nutrition-section-heading">
          <h3>Metas ao longo do tempo</h3>
          <div
            className="nutrition-flip-controls"
            onTouchStart={(e) => {
              start.current = e.touches[0].clientY;
            }}
            onTouchEnd={(e) => {
              if (
                start.current !== null &&
                Math.abs(e.changedTouches[0].clientY - start.current) > 25
              )
                change(e.changedTouches[0].clientY < start.current ? 1 : -1);
              start.current = null;
            }}
          >
            <div>
              <button aria-label="Nutriente anterior" onClick={() => change(-1)}>
                <ChevronUp size={18} />
              </button>
              <button aria-label="Próximo nutriente" onClick={() => change(1)}>
                <ChevronDown size={18} />
              </button>
            </div>
            <span>
              Deslize
              <br />
              para trocar
            </span>
          </div>
        </div>
        <div className="nutrition-chart-meta">
          <select
            aria-label="Nutriente"
            value={index}
            onChange={(e) => setIndex(Number(e.target.value))}
          >
            {nutritionMetrics.map((m, i) => (
              <option key={m.key} value={i}>
                {m.label}
              </option>
            ))}
          </select>
          <span>
            Média {average ?? "—"} {metric.unit} · Meta {goal || "—"} {metric.unit}
          </span>
        </div>
        <div
          className="nutrition-chart-scroll"
          ref={scroll}
          tabIndex={0}
          aria-label="Gráfico diário, role horizontalmente para explorar"
        >
          <div
            key={metric.key}
            className="nutrition-chart-face"
            style={{ width: `max(100%, ${days * 24}px)`, height: 190 }}
          >
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={points} margin={{ top: 20, right: 24, bottom: 4, left: -18 }}>
                <CartesianGrid
                  stroke="var(--nutrition-border)"
                  vertical={false}
                  strokeDasharray="3 5"
                />
                <XAxis
                  dataKey="date"
                  tickFormatter={(v) => format(parseISO(v), "d MMM", { locale: ptBR })}
                  minTickGap={40}
                  tick={chartTheme.tick}
                  tickLine={false}
                />
                <YAxis
                  domain={[0, (max: number) => Math.max(max, goal) * 1.25 || 100]}
                  tick={chartTheme.tick}
                  tickLine={false}
                  axisLine={false}
                />
                {goal > 0 && (
                  <ReferenceLine
                    y={goal}
                    stroke="var(--nutrition-text)"
                    strokeDasharray="5 5"
                    label={{
                      value: `Meta ${goal} ${metric.unit}`,
                      fill: "var(--nutrition-text)",
                      fontSize: 10,
                      position: "insideTopRight",
                    }}
                  />
                )}
                <Tooltip
                  labelFormatter={(v) =>
                    format(parseISO(String(v)), "d 'de' MMMM", { locale: ptBR })
                  }
                  formatter={(v) => [`${v} ${metric.unit}`, metric.label]}
                  contentStyle={chartTheme.tooltip}
                />
                <Line
                  type="linear"
                  dataKey="value"
                  stroke="var(--nutrition-green)"
                  strokeWidth={2}
                  dot={chartTheme.dot}
                  activeDot={chartTheme.activeDot}
                  connectNulls={false}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
        {average === null && (
          <p className="nutrition-empty">Registre suas refeições para acompanhar suas metas.</p>
        )}
        <div className="nutrition-scroll-controls">
          <button
            aria-label="Ver dias anteriores"
            onClick={() => scroll.current?.scrollBy({ left: -240, behavior: "smooth" })}
          >
            <ChevronLeft size={16} />
          </button>
          <span />
          <button
            aria-label="Ver próximos dias"
            onClick={() => scroll.current?.scrollBy({ left: 240, behavior: "smooth" })}
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </section>
      <section>
        <h3>Regularidade das refeições</h3>
        <p>Percentual das refeições planejadas que você registrou.</p>
        <div className="nutrition-regularity">
          {data.meals.map((m) => (
            <div key={m.id}>
              <span>{m.name}</span>
              <progress max={100} value={m.pct ?? 0} aria-label={m.name} />
              <span>{m.pct === null ? "—" : m.pct + "%"}</span>
            </div>
          ))}
        </div>
        {!data.meals.length && (
          <p className="nutrition-empty">Adicione refeições ao seu plano para começar.</p>
        )}
        <button className="nutrition-detail-link" onClick={() => setDetails(true)}>
          Ver detalhes →
        </button>
      </section>
      {help && (
        <Modal title="Sobre a análise" onClose={() => setHelp(false)}>
          <p className="text-sm text-muted-foreground">
            Consistência considera dias encerrados com registros e todas as metas configuradas entre
            90% e 110% do valor atual. Dias sem registro não significam consumo zero. As metas
            atuais são a referência, pois versões anteriores não estão disponíveis. Esta faixa é uma
            regra de visualização, não uma avaliação nutricional.
          </p>
        </Modal>
      )}
      {details && (
        <Modal title="Regularidade das refeições" onClose={() => setDetails(false)}>
          <p className="mb-4 text-sm text-muted-foreground">
            Calculado com os dias da semana do plano atual, desde o primeiro registro. Hoje ainda
            não entra na comparação. Alterações antigas do plano não estão disponíveis; ausência de
            registro não comprova que você pulou a refeição.
          </p>
          {data.meals.map((m) => (
            <div key={m.id} className="flex justify-between border-b border-border py-3 text-sm">
              <span>{m.name}</span>
              <span>
                {m.completed} / {m.planned} previstas
              </span>
            </div>
          ))}
        </Modal>
      )}
    </div>
  );
}
