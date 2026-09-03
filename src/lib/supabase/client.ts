import { createClient } from "@supabase/supabase-js";
import { useEffect, useState } from "react";

// Norte é single-user, sem tela de login. A sessão é criada via Anonymous Auth do
// Supabase — um auth.uid() real e estável, persistido pelo próprio supabase-js em
// localStorage, sem nenhuma UI nova. RLS em todas as tabelas usa esse auth.uid()
// como dono dos dados. A anon key é segura para expor no client por design — é o
// papel dela; a senha do Postgres e a service_role nunca entram aqui.

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error(
    "Supabase não configurado — defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY no .env (veja .env.example).",
  );
}

export const supabase = createClient(url, anonKey, {
  auth: { persistSession: true, autoRefreshToken: true },
});

let bootstrapped: Promise<string> | null = null;

/** Garante uma sessão anônima ativa e devolve o user_id — chamar uma vez no boot do app. */
export function ensureSession(): Promise<string> {
  if (!bootstrapped) {
    bootstrapped = (async () => {
      const { data: existing } = await supabase.auth.getSession();
      if (existing.session?.user.id) return existing.session.user.id;

      const { data, error } = await supabase.auth.signInAnonymously();
      if (error || !data.session) {
        throw new Error(`Falha ao iniciar sessão anônima do Supabase: ${error?.message}`);
      }
      return data.session.user.id;
    })();
  }
  return bootstrapped;
}

/** userId undefined = ainda autenticando; toda query de domínio usa isso em `enabled`. */
export function useSupabaseUserId(): string | undefined {
  const [userId, setUserId] = useState<string | undefined>(undefined);
  useEffect(() => {
    let cancelled = false;
    ensureSession().then((id) => {
      if (!cancelled) setUserId(id);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return userId;
}

// ---------------------------------------------------------------------------
// Conta — upgrade de sessão anônima pra e-mail/senha (mesmo auth.uid(), dados
// preservados), troca de e-mail/senha e logout. Nada disso cria um sistema de
// login paralelo — é só a API padrão do Supabase Auth.
// ---------------------------------------------------------------------------
const HAS_ACCOUNT_KEY = "norte_has_account";

function markHasAccount() {
  try {
    localStorage.setItem(HAS_ACCOUNT_KEY, "1");
  } catch {
    // localStorage indisponível (modo privado etc.) — segue sem persistir a flag.
  }
}

/** true só depois que a sessão anônima já foi promovida a e-mail/senha alguma vez neste navegador. */
export function hasLinkedAccount(): boolean {
  try {
    return localStorage.getItem(HAS_ACCOUNT_KEY) === "1";
  } catch {
    return false;
  }
}

/** Promove a sessão anônima atual pra uma conta permanente — mesmo auth.uid(), dados preservados. */
export async function upgradeToEmailAccount(email: string, password: string) {
  const { error } = await supabase.auth.updateUser({ email, password });
  if (error) throw new Error(error.message);
  markHasAccount();
}

export async function changeEmail(email: string) {
  const { error } = await supabase.auth.updateUser({ email });
  if (error) throw new Error(error.message);
}

export async function changePassword(password: string) {
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw new Error(error.message);
}

export async function signOutNorte() {
  await supabase.auth.signOut();
  bootstrapped = null;
}

export type AuthUser = { email: string | null; isAnonymous: boolean };

export function useAuthUser(): AuthUser | undefined {
  const [user, setUser] = useState<AuthUser | undefined>(undefined);
  useEffect(() => {
    let mounted = true;
    supabase.auth.getUser().then(({ data }) => {
      if (mounted && data.user) {
        setUser({ email: data.user.email ?? null, isAnonymous: !!data.user.is_anonymous });
      }
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      setUser(
        session?.user
          ? { email: session.user.email ?? null, isAnonymous: !!session.user.is_anonymous }
          : undefined,
      );
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);
  return user;
}
