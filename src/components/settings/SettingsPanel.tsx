import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { SidePanel } from "@/components/ui/modal";
import { settingsSections } from "@/routes/configuracoes";

/**
 * Painel de Configurações aberto pelos três pontos na Hoje — lista as 5
 * categorias direto (sem um menu intermediário só com "Configurações"), e ao
 * escolher uma abre uma tela dedicada só daquela seção, com "voltar" pro
 * painel. Fecha com X, clique fora ou Escape, sem tirar o usuário da Hoje.
 */
export function SettingsPanel({ onClose }: { onClose: () => void }) {
  const [sectionKey, setSectionKey] = useState<(typeof settingsSections)[number]["key"] | null>(
    null,
  );

  if (sectionKey) {
    const section = settingsSections.find((s) => s.key === sectionKey);
    if (!section) return null;
    const { Component, label } = section;
    return (
      <SidePanel
        onClose={onClose}
        title={
          <span className="flex items-center gap-2">
            <button
              onClick={() => setSectionKey(null)}
              aria-label="Voltar pro painel de configurações"
              className="-ml-1 rounded-full p-1 text-muted-foreground hover:bg-surface-2 hover:text-foreground"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            {label}
          </span>
        }
      >
        <Component />
      </SidePanel>
    );
  }

  return (
    <SidePanel onClose={onClose} title="Configurações">
      <div className="card-surface divide-y divide-border">
        {settingsSections.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setSectionKey(key)}
            className="flex w-full items-center gap-3 p-3.5 text-left hover:bg-surface-2"
          >
            <Icon className="h-4 w-4 shrink-0 text-primary" />
            <span className="flex-1 text-sm font-medium">{label}</span>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          </button>
        ))}
      </div>
    </SidePanel>
  );
}
