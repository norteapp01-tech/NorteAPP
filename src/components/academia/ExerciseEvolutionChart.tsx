import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { TrendingUp } from "lucide-react";

type Point = { date: string; maxWeight: number };

function shortDate(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}

function TooltipCard({ active, payload }: { active?: boolean; payload?: { payload: Point }[] }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="card-surface px-2.5 py-1.5 text-[11px] shadow-lg">
      <p className="font-semibold">{p.maxWeight}kg</p>
      <p className="text-muted-foreground">{shortDate(p.date)}</p>
    </div>
  );
}

/** Evolução de carga do exercício — só dados reais (sessões concluídas com série registrada). */
export function ExerciseEvolutionChart({ series }: { series: Point[] }) {
  if (series.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border p-4 text-center">
        <TrendingUp className="mx-auto h-5 w-5 text-muted-foreground/60" />
        <p className="mt-1.5 text-xs text-muted-foreground">
          Sua evolução de carga aparece aqui depois da primeira sessão concluída.
        </p>
      </div>
    );
  }

  return (
    <div className="h-36 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={series} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
          <XAxis
            dataKey="date"
            tickFormatter={shortDate}
            tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
            axisLine={{ stroke: "var(--border)" }}
            tickLine={false}
            minTickGap={20}
          />
          <YAxis
            tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
            axisLine={false}
            tickLine={false}
            width={32}
            domain={["dataMin - 2", "dataMax + 2"]}
          />
          <Tooltip content={<TooltipCard />} cursor={{ stroke: "var(--border)" }} />
          <Line
            type="monotone"
            dataKey="maxWeight"
            stroke="var(--primary)"
            strokeWidth={2}
            dot={{ r: 3, fill: "var(--primary)", strokeWidth: 0 }}
            activeDot={{ r: 4 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
