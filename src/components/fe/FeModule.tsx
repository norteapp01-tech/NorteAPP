import { useState } from "react";
import { HojeTab } from "./HojeTab";
import { OracaoTab } from "./OracaoTab";
import { CadernoTab } from "./CadernoTab";

type Tab = "presenca" | "oracoes" | "caderno";
const tabs: { key: Tab; label: string }[] = [
  { key: "presenca", label: "Presença" },
  { key: "oracoes", label: "Orações" },
  { key: "caderno", label: "Caderno" },
];

export function FeModule() {
  const [tab, setTab] = useState<Tab>("presenca");
  return (
    <div className="mt-6">
      <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
        Um espaço para lembrar, buscar e agradecer.
      </p>
      <div className="mt-4 grid grid-cols-3 rounded-2xl border border-border bg-surface p-1">
        {tabs.map((item) => (
          <button
            key={item.key}
            onClick={() => setTab(item.key)}
            className={`rounded-xl py-2.5 text-xs font-semibold transition-colors ${tab === item.key ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="mt-6 pb-12">
        {tab === "presenca" && (
          <HojeTab
            onOpenPrayer={() => setTab("oracoes")}
            onOpenNotebook={() => setTab("caderno")}
          />
        )}
        {tab === "oracoes" && <OracaoTab />}
        {tab === "caderno" && <CadernoTab />}
      </div>
    </div>
  );
}
