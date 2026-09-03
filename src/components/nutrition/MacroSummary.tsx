import { macroProgress, type DailyGoals } from "@/lib/nutrition-store";

const rows: { key: keyof DailyGoals; label: string; unit: string }[] = [
  { key: "protein", label: "Proteína", unit: "g" },
  { key: "carbs", label: "Carboidratos", unit: "g" },
  { key: "fat", label: "Gorduras", unit: "g" },
  { key: "calories", label: "Calorias", unit: "kcal" },
];

/** "Seu dia" — 4 cards compactos, cada um com uma barra finíssima colada na base, sem gráfico separado. */
export function MacroSummary({ totals, goals }: { totals: DailyGoals; goals: DailyGoals }) {
  return (
    <div>
      <h3 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
        Seu dia
      </h3>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {rows.map(({ key, label, unit }) => {
          const progress = macroProgress(totals[key], goals[key]);
          return (
            <div
              key={key}
              className="relative overflow-hidden rounded-xl border border-border bg-surface-2 p-3"
            >
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
              <p className="mt-1 text-sm font-bold">
                {progress.label}
                <span className="text-[10px] font-normal text-muted-foreground"> {unit}</span>
              </p>
              <div className="absolute inset-x-0 bottom-0 h-0.5 bg-surface">
                <div
                  className="h-full bg-primary transition-all"
                  style={{ width: `${progress.pct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
