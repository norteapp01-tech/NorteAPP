import { useEffect, useState } from "react";

// ---------------------------------------------------------------------------
// Quais formas de entrada o projeto realmente aceita.
//
// O botão "Entrar com Apple" levava a uma página de erro em JSON quando o
// provedor não estava ligado no Supabase. Agora o app pergunta (a rota de
// configurações do Auth é pública) e só mostra o que funciona. Na dúvida —
// sem rede, sem resposta — esconde: melhor faltar um botão do que abrir um beco.
// ---------------------------------------------------------------------------

export type AuthProvider = "google" | "apple";

let pending: Promise<Record<string, boolean>> | null = null;

export function loadEnabledProviders(): Promise<Record<string, boolean>> {
  if (pending) return pending;
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  pending = (async () => {
    if (!url || !key) return {};
    try {
      const response = await fetch(`${url}/auth/v1/settings`, { headers: { apikey: key } });
      if (!response.ok) return {};
      const body = (await response.json()) as { external?: Record<string, boolean> };
      return body.external ?? {};
    } catch {
      return {};
    }
  })();
  // Falhou? Tenta de novo da próxima vez em vez de lembrar do erro para sempre.
  void pending.then((result) => {
    if (Object.keys(result).length === 0) pending = null;
  });
  return pending;
}

export function useProviderEnabled(provider: AuthProvider): boolean {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    let alive = true;
    void loadEnabledProviders().then((providers) => {
      if (alive) setEnabled(Boolean(providers[provider]));
    });
    return () => {
      alive = false;
    };
  }, [provider]);
  return enabled;
}
