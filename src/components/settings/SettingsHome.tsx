import { useState } from "react";
import { ChevronLeft, ChevronRight, LogOut } from "lucide-react";
import { settingsSections } from "./settings-sections";
import { useProfile } from "@/lib/profile-store";
import { useAuthUser, signOutNorte } from "@/lib/supabase/client";
import { loadRecordingState } from "@/lib/sport-recording-db";

export function SettingsHome() {
  const [section, setSection] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const user = useAuthUser();
  const profile = useProfile();
  const selected = settingsSections.find((item) => item.key === section);
  if (selected)
    return (
      <div className="space-y-5">
        <button
          onClick={() => setSection(null)}
          className="interactive-press flex min-h-11 items-center gap-2 text-sm text-muted-foreground"
        >
          <ChevronLeft size={18} /> Configurações
        </button>
        <h2 className="text-xl font-bold">{selected.label}</h2>
        <selected.Component />
      </div>
    );
  return (
    <div className="space-y-6">
      <button
        onClick={() => setSection("perfil")}
        className="interactive-press flex w-full items-center gap-3 rounded-2xl border border-border bg-surface p-4 text-left"
      >
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-primary/10 text-lg text-primary">
          {(profile.displayName ?? user?.name ?? user?.email ?? "N").slice(0, 1).toUpperCase()}
        </span>
        <span className="min-w-0 flex-1">
          <strong className="block truncate">
            {profile.displayName ?? user?.name ?? "Minha conta"}
          </strong>
          <span className="block break-all text-xs text-muted-foreground">
            {user?.email ?? "Conta de demonstração"}
          </span>
          <span className="mt-1 block text-xs text-primary">Ver meu perfil</span>
        </span>
        <ChevronRight size={18} />
      </button>
      <div className="card-surface divide-y divide-border">
        {settingsSections.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setSection(key)}
            className="interactive-press flex min-h-14 w-full items-center gap-3 p-3.5 text-left"
          >
            <Icon size={18} className="text-primary" />
            <span className="flex-1 text-sm">{label}</span>
            <ChevronRight size={16} className="text-muted-foreground" />
          </button>
        ))}
      </div>
      <div className="border-t border-border pt-4">
        {user?.isAnonymous && (
          <p className="mb-3 text-xs text-muted-foreground">
            Você está em uma conta de demonstração. Cadastre um e-mail em Conta e segurança antes de
            sair para preservar seu acesso.
          </p>
        )}
        <button
          disabled={busy || user?.isAnonymous}
          className="interactive-press flex min-h-11 items-center gap-3 text-sm text-muted-foreground disabled:opacity-50"
          onClick={async () => {
            setBusy(true);
            setError("");
            try {
              const pending = await loadRecordingState();
              if (pending) {
                setError(
                  "Existe uma atividade esportiva não finalizada. Volte a Esportes e salve sua atividade antes de sair.",
                );
                return;
              }
              await signOutNorte();
              window.location.replace("/");
            } catch {
              setError("Não foi possível sair com segurança. Tente novamente.");
            } finally {
              setBusy(false);
            }
          }}
        >
          <LogOut size={18} />
          {busy ? "Saindo…" : "Sair da conta"}
        </button>
        {error && (
          <p role="alert" className="mt-2 text-sm text-danger">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
