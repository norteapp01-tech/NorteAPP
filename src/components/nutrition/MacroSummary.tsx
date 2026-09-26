import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { macroProgress, type DailyGoals } from "@/lib/nutrition-store";
const rows = [
  { key: "calories", label: "Calorias", unit: "kcal" },
  { key: "protein", label: "Proteína", unit: "g" },
  { key: "carbs", label: "Carboidratos", unit: "g" },
  { key: "fat", label: "Gorduras", unit: "g" },
] as const;
export function MacroSummary({ totals, goals }: { totals: DailyGoals; goals: DailyGoals }) {
  const [open, setOpen] = useState(false);
  const configured = rows.filter(({ key }) => goals[key] > 0);
  const reached = configured.filter(
    ({ key }) => totals[key] >= goals[key] * 0.9 && totals[key] <= goals[key] * 1.1,
  ).length;
  return (
    <section className="nutrition-panel nutrition-goals">
      <button
        className="nutrition-drawer-heading"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-controls="nutrition-daily-goals"
      >
        <h3>Metas de hoje</h3>
        <span>
          {reached} de {configured.length} na faixa
        </span>
        <ChevronDown size={18} style={{ transform: open ? "rotate(180deg)" : undefined }} />
      </button>
      {open && (
        <div id="nutrition-daily-goals">
          {rows.map(({ key, label, unit }) => (
            <div className="nutrition-macro-row" key={key}>
              <span>{label}</span>
              <progress
                aria-label={label}
                max={100}
                value={macroProgress(totals[key], goals[key]).pct}
              />
              <span>
                <strong>{Math.round(totals[key]).toLocaleString("pt-BR")}</strong> /{" "}
                {goals[key].toLocaleString("pt-BR")} <small>{unit}</small>
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
