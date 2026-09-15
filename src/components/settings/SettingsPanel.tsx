import { SidePanel } from "@/components/ui/modal";
import { SettingsHome } from "./SettingsHome";

export function SettingsPanel({ onClose }: { onClose: () => void }) {
  return (
    <SidePanel onClose={onClose} title="Configurações">
      <SettingsHome />
    </SidePanel>
  );
}
