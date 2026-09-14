import { useState } from "react";
import { ChevronDown, Check, Plus, X } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { type SportModality } from "@/lib/sport-store";
import { formatChangeDistanceM, type RoutePoint } from "@/lib/sport-route-geometry";
import { useSportRoutes, type SportRoute } from "@/lib/sport-routes-data";
import { RouteDrawer } from "./RouteDrawer";
import type { RouteGuidanceMode } from "@/hooks/use-activity-recorder";

export type RouteSelection = { id: string; points: RoutePoint[]; guidanceMode: RouteGuidanceMode };

const EXPLAINER_SEEN_KEY = "norte:esportes:routeGuidanceExplainerSeen";
function hasSeenExplainer(): boolean {
  return typeof window !== "undefined" && window.localStorage.getItem(EXPLAINER_SEEN_KEY) === "1";
}
function markExplainerSeen() {
  window.localStorage.setItem(EXPLAINER_SEEN_KEY, "1");
}

/** Escolher "sem rota" / uma rota salva / desenhar uma nova, e o modo de
 * uso (Livre ou Com avisos de mudança de direção) — controlado pelo pai
 * (mesmo padrão de um <select>), pra `esportes.gravar.tsx` decidir o que
 * passar pra `recorder.start()` sem duplicar estado. */
export function RoutePicker({
  modality,
  value,
  onChange,
}: {
  modality: SportModality;
  value: RouteSelection | null;
  onChange: (selection: RouteSelection | null) => void;
}) {
  const routes = useSportRoutes(modality);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [explainerFor, setExplainerFor] = useState<RouteGuidanceMode | null>(null);

  const selectedRoute = routes.find((r) => r.id === value?.id);

  const chooseRoute = (route: SportRoute | null) => {
    if (!route) {
      onChange(null);
    } else {
      onChange({
        id: route.id,
        points: route.points,
        guidanceMode: value?.guidanceMode ?? "livre",
      });
    }
    setPickerOpen(false);
  };

  const chooseGuidanceMode = (mode: RouteGuidanceMode) => {
    if (!value) return;
    if (mode === "com_avisos" && !hasSeenExplainer()) {
      setExplainerFor(mode);
      return;
    }
    onChange({ ...value, guidanceMode: mode });
  };

  const confirmExplainer = () => {
    markExplainerSeen();
    if (explainerFor && value) onChange({ ...value, guidanceMode: explainerFor });
    setExplainerFor(null);
  };

  if (drawerOpen) {
    return (
      <div className="fixed inset-0 z-50 bg-background">
        <RouteDrawer
          modality={modality}
          onCancel={() => setDrawerOpen(false)}
          onSaved={(route) => {
            setDrawerOpen(false);
            chooseRoute(route);
          }}
        />
      </div>
    );
  }

  return (
    <div>
      <p className="mb-1.5 text-xs font-semibold uppercase text-muted-foreground">Rota</p>
      <button
        onClick={() => setPickerOpen(true)}
        className="flex w-full items-center justify-between rounded-xl border border-border bg-surface-2 px-3 py-2.5 text-sm"
      >
        <span className="font-semibold">
          {selectedRoute ? selectedRoute.title : "Sem rota"}
          {selectedRoute && (
            <span className="ml-1.5 font-normal text-muted-foreground">
              · {formatChangeDistanceM(selectedRoute.distanceM)} aprox.
            </span>
          )}
        </span>
        <ChevronDown className="h-4 w-4 text-muted-foreground" />
      </button>
      {selectedRoute && (
        <p className="mt-1 text-[10px] text-muted-foreground">
          Trajeto desenhado — distância aproximada, não é uma rota real de rua.
        </p>
      )}

      {selectedRoute && (
        <div className="mt-2 flex gap-2">
          {(["livre", "com_avisos"] as RouteGuidanceMode[]).map((mode) => (
            <button
              key={mode}
              onClick={() => chooseGuidanceMode(mode)}
              className={`flex-1 rounded-lg border px-3 py-2 text-xs font-semibold ${
                value?.guidanceMode === mode
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground"
              }`}
            >
              {mode === "livre" ? "Livre" : "Com avisos de mudança"}
            </button>
          ))}
        </div>
      )}

      {pickerOpen && (
        <Modal title="Escolher rota" onClose={() => setPickerOpen(false)}>
          <div className="space-y-2">
            <button
              onClick={() => chooseRoute(null)}
              className="card-surface flex w-full items-center justify-between p-3 text-left hover:border-primary/40"
            >
              <span className="text-sm font-semibold">Sem rota</span>
              {!value && <Check className="h-4 w-4 text-primary" />}
            </button>
            {routes.map((route) => (
              <button
                key={route.id}
                onClick={() => chooseRoute(route)}
                className="card-surface flex w-full items-center justify-between p-3 text-left hover:border-primary/40"
              >
                <span>
                  <span className="block text-sm font-semibold">{route.title}</span>
                  <span className="block text-xs text-muted-foreground">
                    {formatChangeDistanceM(route.distanceM)} aprox. · trajeto desenhado
                  </span>
                </span>
                {value?.id === route.id && <Check className="h-4 w-4 text-primary" />}
              </button>
            ))}
            <button
              onClick={() => {
                setPickerOpen(false);
                setDrawerOpen(true);
              }}
              className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-border p-3 text-sm font-semibold text-primary"
            >
              <Plus className="h-4 w-4" />
              Desenhar nova rota
            </button>
          </div>
        </Modal>
      )}

      {explainerFor && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-6">
          <div className="w-full max-w-xs rounded-2xl bg-surface p-5 text-center">
            <button
              onClick={() => setExplainerFor(null)}
              aria-label="Fechar"
              className="absolute right-4 top-4 text-muted-foreground"
            >
              <X className="h-4 w-4" />
            </button>
            <p className="text-sm font-semibold">Sobre os avisos de mudança</p>
            <p className="mt-2 text-xs text-muted-foreground">
              Os avisos são baseados no desenho que você fez, não em dados reais de rua — não é uma
              navegação por rota real. Você vai ver a distância até onde o desenho muda de direção,
              nunca uma instrução de virar à esquerda ou à direita.
            </p>
            <button
              onClick={confirmExplainer}
              className="mt-4 w-full rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground"
            >
              Entendi
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
