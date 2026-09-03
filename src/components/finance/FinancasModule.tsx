import { useState } from "react";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { currentMonth, monthLabel, addMonths } from "@/lib/finance-store";
import { ResumoTab } from "./ResumoTab";
import { MovimentacoesTab } from "./MovimentacoesTab";
import { PlanejamentoTab } from "./PlanejamentoTab";
import { ObjetivosTab } from "./ObjetivosTab";
import { QuickAddSheet } from "./QuickAddSheet";

type Tab = "resumo" | "movimentacoes" | "planejamento" | "objetivos";
const tabs: { key: Tab; label: string }[] = [
  { key: "resumo", label: "Resumo" },
  { key: "movimentacoes", label: "Movimentações" },
  { key: "planejamento", label: "Planejamento" },
  { key: "objetivos", label: "Objetivos" },
];

export function FinancasModule() {
  const [tab, setTab] = useState<Tab>("resumo");
  const [month, setMonth] = useState(currentMonth());
  const [movQuery, setMovQuery] = useState("");
  const [quickAddOpen, setQuickAddOpen] = useState(false);

  const openCategoryInMovimentacoes = (category: string) => {
    setMovQuery(category);
    setTab("movimentacoes");
  };

  return (
    <div className="relative mt-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setMonth((m) => addMonths(m, -1))}
            className="text-muted-foreground"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="min-w-24 text-center text-xs font-semibold capitalize">
            {monthLabel(month)}
          </span>
          <button
            onClick={() => setMonth((m) => addMonths(m, 1))}
            className="text-muted-foreground"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="mt-3 flex gap-1.5 overflow-x-auto">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold ${tab === t.key ? "bg-primary text-primary-foreground" : "bg-surface-2 text-muted-foreground"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-5 pb-24">
        {tab === "resumo" && (
          <ResumoTab
            month={month}
            onOpenCategory={openCategoryInMovimentacoes}
            onOpenObjetivos={() => setTab("objetivos")}
          />
        )}
        {tab === "movimentacoes" && <MovimentacoesTab initialQuery={movQuery} />}
        {tab === "planejamento" && <PlanejamentoTab month={month} />}
        {tab === "objetivos" && <ObjetivosTab />}
      </div>

      <button
        onClick={() => setQuickAddOpen(true)}
        className="fixed bottom-24 right-5 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-[0_8px_28px_-8px_oklch(0.82_0.18_145/0.55)]"
      >
        <Plus className="h-6 w-6" />
      </button>

      {quickAddOpen && <QuickAddSheet onClose={() => setQuickAddOpen(false)} />}
    </div>
  );
}
