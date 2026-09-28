import { useState } from "react";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { currentMonth, monthLabel, addMonths } from "@/lib/finance-store";
import { ResumoTab } from "./ResumoTab";
import { MovimentacoesTab } from "./MovimentacoesTab";
import { ObjetivosTab } from "./ObjetivosTab";
import { PlanejamentoTab } from "./PlanejamentoTab";
import { QuickAddSheet } from "./QuickAddSheet";
import { UnderlineTabs } from "@/components/ui/app-design-system";
import "./finance.css";

type Tab = "resumo" | "movimentacoes" | "planejamento" | "objetivos";
const tabs: { key: Tab; label: string }[] = [
  { key: "resumo", label: "Visão" },
  { key: "movimentacoes", label: "Registros" },
  { key: "planejamento", label: "Planejar" },
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
    <div className="finance-module">
      <div className="finance-toolbar">
        <div className="finance-month-picker">
          <button
            aria-label="Mês anterior"
            onClick={() => setMonth((m) => addMonths(m, -1))}
            className="interactive-press"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="finance-month-label" title={monthLabel(month)}>
            {new Intl.DateTimeFormat("pt-BR", { month: "short", year: "numeric" })
              .format(new Date(month + "-01T12:00:00"))
              .replace(" de ", " ")}
          </span>
          <button
            aria-label="Próximo mês"
            onClick={() => setMonth((m) => addMonths(m, 1))}
            className="interactive-press"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        <button
          onClick={() => setQuickAddOpen(true)}
          className="finance-register interactive-press"
        >
          <Plus className="h-3.5 w-3.5" /> Registrar
        </button>
      </div>

      <UnderlineTabs items={tabs} value={tab} onChange={setTab} className="finance-tabs" />

      <div className="finance-tab-content">
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
