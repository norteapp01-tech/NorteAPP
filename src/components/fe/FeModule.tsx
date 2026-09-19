import { useState } from "react";
import { FaithRecords } from "./FaithRecords";
import { OracaoTab } from "./OracaoTab";
import { JornadaTab } from "./JornadaTab";
import { LogReadingSheet } from "./LogReadingSheet";
import "./faith.css";
import { UnderlineTabs } from "@/components/ui/app-design-system";

type Tab = "registros" | "oracoes" | "biblia";
const tabs: { key: Tab; label: string }[] = [
  { key: "registros", label: "Registros" },
  { key: "oracoes", label: "Orações" },
  { key: "biblia", label: "Bíblia" },
];

export function FeModule() {
  const [tab, setTab] = useState<Tab>("registros");
  const [reading, setReading] = useState(false);
  return (
    <div className="faith-module mt-6">
      <UnderlineTabs items={tabs} value={tab} onChange={setTab} />
      <div className="mt-6 pb-12">
        {tab === "registros" && <FaithRecords onOpenPrayer={() => setTab("oracoes")} />}
        {tab === "oracoes" && <OracaoTab />}
        {tab === "biblia" && <JornadaTab onOpenLogReading={() => setReading(true)} />}
        {reading && <LogReadingSheet onClose={() => setReading(false)} />}
      </div>
    </div>
  );
}
