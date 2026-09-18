import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatDateShortBR } from "@/lib/goals-store";
import type { SessionPerformance } from "@/lib/workout-explorer";

// ---------------------------------------------------------------------------
// Carga e repetições no mesmo gráfico, em escalas declaradas.
//
// Barra = carga da série representativa da sessão. Linha = repetições DAQUELA
// mesma série. As duas grandezas não são comparáveis entre si, por isso cada
// uma tem seu eixo, rotulado com a unidade — duas linhas soltas sugeririam uma
// relação que o dado não sustenta.
//
// Cada ponto é uma sessão registrada. Sessão sem registro não vira ponto: não
// existe interpolação aqui.
// ---------------------------------------------------------------------------

export function LoadRepsChart({
  sessions,
  showEstimate,
}: {
  sessions: SessionPerformance[];
  /** Só quando a fórmula se aplica a todas as sessões mostradas. */
  showEstimate: boolean;
}) {
  const rows = sessions.map((s) => ({
    date: s.date,
    carga: s.weight,
    reps: s.reps,
    estimated: s.estimated,
    planLabel: s.planLabel,
  }));

  return (
    <div>
      <div className="h-[190px] w-full min-w-0">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={rows} margin={{ top: 8, right: 4, bottom: 0, left: -18 }}>
            <CartesianGrid stroke="var(--evo-line)" vertical={false} />
            <XAxis
              dataKey="date"
              tickFormatter={(d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`}
              tick={{ fontSize: 9, fill: "var(--evo-axis)" }}
              minTickGap={18}
            />
            <YAxis
              yAxisId="carga"
              tick={{ fontSize: 9, fill: "var(--evo-axis)" }}
              label={{
                value: "kg",
                position: "insideTopLeft",
                fontSize: 9,
                fill: "var(--evo-axis)",
                offset: 2,
              }}
            />
            <YAxis
              yAxisId="reps"
              orientation="right"
              tick={{ fontSize: 9, fill: "var(--evo-axis)" }}
              width={30}
              label={{
                value: "reps",
                position: "insideTopRight",
                fontSize: 9,
                fill: "var(--evo-axis)",
                offset: 2,
              }}
            />
            <Tooltip
              cursor={{ fill: "var(--evo-line)", fillOpacity: 0.35 }}
              contentStyle={{
                background: "var(--evo-panel)",
                border: "1px solid var(--evo-line)",
                borderRadius: 10,
                fontSize: 12,
              }}
              labelFormatter={(d) => formatDateShortBR(String(d))}
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                const row = payload[0].payload as (typeof rows)[number];
                return (
                  <div className="evo-tooltip">
                    <p className="font-bold">{formatDateShortBR(String(label))}</p>
                    <p className="font-mono tabular-nums">
                      {row.carga} kg × {row.reps} {row.reps === 1 ? "repetição" : "repetições"}
                    </p>
                    {showEstimate && row.estimated !== null && (
                      <p className="text-muted-foreground">
                        Força estimada: {row.estimated.toLocaleString("pt-BR")} kg
                      </p>
                    )}
                    <p className="text-muted-foreground">{row.planLabel}</p>
                  </div>
                );
              }}
            />
            <Legend
              verticalAlign="top"
              height={22}
              iconSize={9}
              wrapperStyle={{ fontSize: 10, color: "var(--evo-axis)" }}
            />
            <Bar
              yAxisId="carga"
              dataKey="carga"
              name="Carga (kg)"
              fill="var(--evo-accent)"
              fillOpacity={0.55}
              radius={[3, 3, 0, 0]}
              isAnimationActive={false}
            />
            <Line
              yAxisId="reps"
              dataKey="reps"
              name="Repetições"
              stroke="var(--evo-reps)"
              strokeWidth={2}
              dot={{ r: 3, fill: "var(--evo-reps)" }}
              activeDot={{ r: 5 }}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Alternativa em lista: nada importante depende de enxergar o gráfico. */}
      <ul className="evo-chart-rows" aria-label="Sessões do gráfico">
        {rows.map((row) => (
          <li key={`${row.date}-${row.carga}-${row.reps}`}>
            <span className="text-muted-foreground">{formatDateShortBR(row.date)}</span>
            <span className="font-mono tabular-nums">
              {row.carga} kg × {row.reps}
            </span>
            {showEstimate && row.estimated !== null && (
              <span className="text-muted-foreground">est. {row.estimated} kg</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
