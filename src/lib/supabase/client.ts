import { createClient } from "@supabase/supabase-js";
import { useEffect, useState } from "react";
import { queryClient } from "../query-client";
import { setAppTimeZone } from "../app-time-zone";

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

/** Preenche o cache de `ensureSession()` quando quem chama já resolveu a sessão
 * (ex.: `AuthGate` no warm-start) — evita que cada `useSupabaseUserId()` filho
 * dispare seu próprio `getSession()` redundante e enxergue `userId` undefined
 * por um instante a mais do que o necessário. */
export function primeSession(userId: string) {
  if (!bootstrapped) bootstrapped = Promise.resolve(userId);
}

/** Garante uma sessão anônima ativa e devolve o user_id — chamar uma vez no boot do app.
 * Se falhar (rede indisponível, Supabase fora do ar), a próxima chamada tenta de novo —
 * sem isso, uma falha transitória "grudava" pra sempre e nenhum "tentar novamente"
 * funcionava, mesmo com a rede já restabelecida. */
export function ensureSession(): Promise<string> {
  if (!bootstrapped) {
    bootstrapped = (async () => {
      try {
        const { data: existing } = await supabase.auth.getSession();
        if (existing.session?.user.id) return existing.session.user.id;

        const { data, error } = await supabase.auth.signInAnonymously();
        if (error || !data.session) {
          throw new Error(`Falha ao iniciar sessão anônima do Supabase: ${error?.message}`);
        }
        return data.session.user.id;
      } catch (err) {
        bootstrapped = null;
        throw err;
      }
    })();
  }
  return bootstrapped;
}

/** Access token da sessão atual, pra chamadas de servidor que precisam saber
 * quem está pedindo (ex.: registrar consumo de IA em nome da própria pessoa,
 * sem service_role). undefined se ainda não há sessão. */
export async function getAccessToken(): Promise<string | undefined> {
  await ensureSession();
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token;
}

/** userId undefined = ainda autenticando; toda query de domínio usa isso em `enabled`. */
export function useSupabaseUserId(): string | undefined {
  const [userId, setUserId] = useState<string | undefined>(undefined);
  useEffect(() => {
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      bootstrapped = session?.user.id ? Promise.resolve(session.user.id) : null;
      if (!cancelled) setUserId(session?.user.id);
    });
    const attempt = () => {
      ensureSession().then(
        (id) => {
          if (!cancelled) setUserId(id);
        },
        () => {
          // ensureSession() já zera o cache interno em caso de erro (ver comentário
          // acima) — sem este retry, uma falha transitória de rede deixava este hook
          // parado em `undefined` para sempre, mesmo depois da rede voltar.
          if (!cancelled) retryTimer = setTimeout(attempt, 3000);
        },
      );
    };
    attempt();
    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
      listener.subscription.unsubscribe();
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
  const { error } = await supabase.auth.signOut({ scope: "local" });
  if (error) throw error;
  bootstrapped = null;
  await queryClient.cancelQueries();
  queryClient.clear();
  setAppTimeZone(null);
  for (const storage of [localStorage, sessionStorage]) {
    Object.keys(storage)
      .filter(
        (key) =>
          key.startsWith("norte-chat:") ||
          key.startsWith("norte-demo-replies:") ||
          key === "norte-onboarding-stage" ||
          key === "norte-welcome-entered",
      )
      .forEach((key) => storage.removeItem(key));
  }
}

export type AuthUser = {
  id: string;
  email: string | null;
  isAnonymous: boolean;
  name: string | null;
  avatar: string | null;
  verified: boolean;
  providers: string[];
};
function authProfile(user: import("@supabase/supabase-js").User): AuthUser {
  return {
    id: user.id,
    email: user.email ?? null,
    isAnonymous: !!user.is_anonymous,
    name: user.user_metadata?.full_name ?? user.user_metadata?.name ?? null,
    avatar: user.user_metadata?.avatar_url ?? null,
    verified: !!user.email_confirmed_at,
    providers: user.identities?.map((identity) => identity.provider) ?? [],
  };
}

export function useAuthUser(): AuthUser | undefined {
  const [user, setUser] = useState<AuthUser | undefined>(undefined);
  useEffect(() => {
    let mounted = true;
    supabase.auth.getUser().then(({ data }) => {
      if (mounted && data.user) {
        setUser(authProfile(data.user));
      }
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      setUser(session?.user ? authProfile(session.user) : undefined);
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);
  return user;
}
