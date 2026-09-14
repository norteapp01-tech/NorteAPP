import { useState } from "react";
import { ChevronDown, Footprints, PersonStanding, Bike, Check } from "lucide-react";
import { UnderlineTabs } from "@/components/ui/app-design-system";
import { Modal } from "@/components/ui/modal";
import { modalityLabel, type SportModality } from "@/lib/sport-store";
import { OverviewTab } from "./OverviewTab";
import { PlanningTab } from "./PlanningTab";
import { HistoryTab } from "./HistoryTab";
import { WeeklyGoalsPanel } from "./WeeklyGoalsPanel";

const MODALITY_STORAGE_KEY = "norte:esportes:modality";
const modalityIcon = { corrida: Footprints, caminhada: PersonStanding, ciclismo: Bike } as const;

function loadLastModality(): SportModality {
  if (typeof window === "undefined") return "corrida";
  const saved = window.localStorage.getItem(MODALITY_STORAGE_KEY);
  return saved === "corrida" || saved === "caminhada" || saved === "ciclismo" ? saved : "corrida";
}

type Tab = "visao_geral" | "planejamento" | "historico";

export function EsportesModule() {
  const [modality, setModality] = useState<SportModality>(loadLastModality);
  const [modalityDrawerOpen, setModalityDrawerOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("visao_geral");

  const selectModality = (m: SportModality) => {
    setModality(m);
    window.localStorage.setItem(MODALITY_STORAGE_KEY, m);
    setModalityDrawerOpen(false);
  };

  const Icon = modalityIcon[modality];

  return (
    <div className="mt-6 space-y-5">
      <div className="flex items-center justify-between">
        <button
          onClick={() => setModalityDrawerOpen(true)}
          className="interactive-press flex items-center gap-1.5 rounded-full border border-border bg-surface-2 px-3 py-1.5 text-sm font-semibold"
        >
          <Icon className="h-4 w-4 text-primary" strokeWidth={1.8} />
          {modalityLabel[modality]}
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
        <button
          onClick={() => setSettingsOpen(true)}
          className="text-xs font-semibold text-muted-foreground hover:text-primary"
        >
          Metas semanais
        </button>
      </div>

      <UnderlineTabs
        items={
          [
            { key: "visao_geral", label: "Visão geral" },
            { key: "planejamento", label: "Planejamento" },
            { key: "historico", label: "Histórico" },
          ] as const
        }
        value={activeTab}
        onChange={setActiveTab}
      />

      {activeTab === "visao_geral" && <OverviewTab modality={modality} />}
      {activeTab === "planejamento" && <PlanningTab modality={modality} />}
      {activeTab === "historico" && <HistoryTab modality={modality} />}

      {modalityDrawerOpen && (
        <Modal title="Modalidade" onClose={() => setModalityDrawerOpen(false)}>
          <div className="space-y-2">
            {(Object.keys(modalityLabel) as SportModality[]).map((m) => {
              const OptIcon = modalityIcon[m];
              return (
                <button
                  key={m}
                  onClick={() => selectModality(m)}
                  className="card-surface flex w-full items-center gap-3 p-3 text-left hover:border-primary/40"
                >
                  <OptIcon className="h-5 w-5 text-primary" strokeWidth={1.8} />
                  <span className="flex-1 text-sm font-semibold">{modalityLabel[m]}</span>
                  {m === modality && <Check className="h-4 w-4 text-primary" />}
                </button>
              );
            })}
          </div>
        </Modal>
      )}

      {settingsOpen && (
        <Modal title="Metas semanais" onClose={() => setSettingsOpen(false)}>
          <WeeklyGoalsPanel />
        </Modal>
      )}
    </div>
  );
}
