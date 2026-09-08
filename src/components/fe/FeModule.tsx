import { useState } from "react";
import { HojeTab } from "./HojeTab";
import { OracaoTab } from "./OracaoTab";
import { CadernoTab } from "./CadernoTab";
import { UnderlineTabs } from "@/components/ui/app-design-system";

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
      <UnderlineTabs items={tabs} value={tab} onChange={setTab} className="mt-4" />
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
