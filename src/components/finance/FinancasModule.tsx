import { useState } from "react";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { currentMonth, monthLabel, addMonths } from "@/lib/finance-store";
import { ResumoTab } from "./ResumoTab";
import { MovimentacoesTab } from "./MovimentacoesTab";
import { ObjetivosTab } from "./ObjetivosTab";
import { PlanejamentoTab } from "./PlanejamentoTab";
import { QuickAddSheet } from "./QuickAddSheet";
import { UnderlineTabs } from "@/components/ui/app-design-system";

type Tab = "resumo" | "movimentacoes" | "planejamento" | "objetivos";
const tabs: { key: Tab; label: string }[] = [
  { key: "resumo", label: "Visão" },
  { key: "movimentacoes", label: "Movimentações" },
  { key: "planejamento", label: "Planejamento" },
  { key: "objetivos", label: "Objetivos" },
];

export function FinancasModule() {
  const [tab, setTab] = useState<Tab>("resumo");
  const [month, setMonth] = useState(currentMonth());
  const [movQuery, setMovQuery] = useState("");
  const [quickAddOpen, setQuickAddOpen] = useState(false);

  const openMovimentacoes = (category = "") => {
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
        <button
          onClick={() => setQuickAddOpen(true)}
          className="flex items-center gap-1 rounded-full border border-primary/50 px-3 py-1.5 text-xs font-semibold text-primary"
        >
          <Plus className="h-3.5 w-3.5" /> Registrar
        </button>
      </div>

      <UnderlineTabs items={tabs} value={tab} onChange={setTab} className="mt-3" />

      <div className="mt-5 pb-24">
        {tab === "resumo" && (
          <ResumoTab
            month={month}
            onOpenMovements={openMovimentacoes}
            onOpenObjetivos={() => setTab("objetivos")}
          />
        )}
        {tab === "movimentacoes" && <MovimentacoesTab month={month} initialQuery={movQuery} />}
        {tab === "planejamento" && <PlanejamentoTab />}
        {tab === "objetivos" && <ObjetivosTab />}
      </div>

      {quickAddOpen && <QuickAddSheet onClose={() => setQuickAddOpen(false)} />}
    </div>
  );
}
