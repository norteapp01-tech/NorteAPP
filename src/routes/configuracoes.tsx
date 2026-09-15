import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import { SettingsHome } from "@/components/settings/SettingsHome";
export const Route = createFileRoute("/configuracoes")({
  head: () => ({ meta: [{ title: "Configurações — Norte" }] }),
  component: ConfiguracoesScreen,
});
function ConfiguracoesScreen() {
  return (
    <div className="px-5 pt-12 pb-10">
      <Link to="/" className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        <ChevronLeft size={16} /> Hoje
      </Link>
      <h1 className="mt-3 text-3xl font-bold tracking-tight">Configurações</h1>
      <div className="mt-6">
        <SettingsHome />
      </div>
    </div>
  );
}
