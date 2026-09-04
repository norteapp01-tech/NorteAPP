import { useState } from "react";
import { contextualMessage } from "@/lib/verse-of-day";
import { nowDate } from "@/lib/test-clock";
import { HojeTab } from "./HojeTab";
import { JornadaTab } from "./JornadaTab";
import { OracaoTab } from "./OracaoTab";
import { CadernoTab } from "./CadernoTab";
import { LogReadingSheet } from "./LogReadingSheet";

type Tab = "hoje" | "jornada" | "oracao" | "caderno";
const tabs: { key: Tab; label: string }[] = [
  { key: "hoje", label: "Hoje" },
  { key: "jornada", label: "Jornada" },
  { key: "oracao", label: "Oração" },
  { key: "caderno", label: "Caderno" },
];

const todayFormatted = new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "long" }).format(
  nowDate(),
);

export function FeModule() {
  const [tab, setTab] = useState<Tab>("hoje");
  const [logReadingOpen, setLogReadingOpen] = useState(false);

  return (
    <div className="mt-6">
      <p className="text-sm text-muted-foreground">
        {todayFormatted} · {contextualMessage()}
      </p>

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

      <div className="mt-5 pb-10">
        {tab === "hoje" && <HojeTab onOpenLogReading={() => setLogReadingOpen(true)} />}
        {tab === "jornada" && <JornadaTab onOpenLogReading={() => setLogReadingOpen(true)} />}
        {tab === "oracao" && <OracaoTab />}
        {tab === "caderno" && <CadernoTab />}
      </div>

      {logReadingOpen && <LogReadingSheet onClose={() => setLogReadingOpen(false)} />}
    </div>
  );
}
