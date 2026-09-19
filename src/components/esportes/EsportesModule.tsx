import { useState } from "react";
import {
  ChevronDown,
  Footprints,
  PersonStanding,
  Bike,
  Check,
  Moon,
  Sun,
  Map as MapIcon,
  Satellite,
  Layers,
  Settings,
} from "lucide-react";
import { UnderlineTabs } from "@/components/ui/app-design-system";
import { Modal } from "@/components/ui/modal";
import {
  loadMapStyle,
  saveMapStyle,
  mapStyleLabel,
  modalityLabel,
  type MapStyle,
  type SportModality,
} from "@/lib/sport-store";
import { OverviewTab } from "./OverviewTab";
import { PlanningTab } from "./PlanningTab";
import { WeeklyGoalsPanel } from "./WeeklyGoalsPanel";

const MODALITY_STORAGE_KEY = "norte:esportes:modality";
const modalityIcon = { corrida: Footprints, caminhada: PersonStanding, ciclismo: Bike } as const;

function loadLastModality(): SportModality {
  if (typeof window === "undefined") return "corrida";
  const saved = window.localStorage.getItem(MODALITY_STORAGE_KEY);
  return saved === "corrida" || saved === "caminhada" || saved === "ciclismo" ? saved : "corrida";
}

/** O histórico saiu das abas: agora abre em tela cheia por "Ver todas", na
 * Visão geral. Sobraram as duas visões que de fato competem pela atenção. */
type Tab = "visao_geral" | "planejamento";

const mapStyleIcon = {
  escuro: Moon,
  claro: Sun,
  padrao: MapIcon,
  satelite: Satellite,
  hibrido: Layers,
} as const;

export function EsportesModule() {
  const [modality, setModality] = useState<SportModality>(loadLastModality);
  const [modalityDrawerOpen, setModalityDrawerOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("visao_geral");
  const [mapStyle, setMapStyle] = useState<MapStyle>(loadMapStyle);

  const selectMapStyle = (style: MapStyle) => {
    setMapStyle(style);
    saveMapStyle(style);
  };

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
          aria-label="Configurações da modalidade"
          className="interactive-press flex h-10 w-10 items-center justify-center rounded-full border border-border bg-surface-2 text-muted-foreground hover:text-primary"
        >
          <Settings className="h-[18px] w-[18px]" strokeWidth={1.8} />
        </button>
      </div>

      <UnderlineTabs
        items={
          [
            { key: "visao_geral", label: "Visão geral" },
            { key: "planejamento", label: "Planejamento" },
          ] as const
        }
        value={activeTab}
        onChange={setActiveTab}
      />

      {activeTab === "visao_geral" && (
        <OverviewTab modality={modality} onOpenPlanning={() => setActiveTab("planejamento")} />
      )}
      {activeTab === "planejamento" && <PlanningTab modality={modality} />}

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
        <Modal title="Configurações" onClose={() => setSettingsOpen(false)}>
          <div className="space-y-5">
            <div>
              <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
                Estilo do mapa na gravação
              </p>
              <div className="grid grid-cols-2 gap-2">
                {(Object.keys(mapStyleLabel) as MapStyle[]).map((style) => {
                  const StyleIcon = mapStyleIcon[style];
                  return (
                    <button
                      key={style}
                      onClick={() => selectMapStyle(style)}
                      className={`flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-semibold ${
                        mapStyle === style
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border text-muted-foreground"
                      }`}
                    >
                      <StyleIcon className="h-4 w-4" strokeWidth={1.8} />
                      {mapStyleLabel[style]}
                      {mapStyle === style && <Check className="h-3.5 w-3.5" />}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
                Metas semanais
              </p>
              <WeeklyGoalsPanel />
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
