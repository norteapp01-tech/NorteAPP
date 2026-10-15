import { createClient, type FunctionRegion } from "@supabase/supabase-js";
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

/** Região do banco. As Edge Functions rodam aqui (e não na borda mais próxima da
 * pessoa): cada consulta ao banco deixa de atravessar o continente. Medido: uma
 * sincronização com o Google caiu de ~8,6 s para ~2,7 s. */
export const FUNCTIONS_REGION = "us-east-2" as FunctionRegion;

let bootstrapped: Promise<string> | null = null;

// ---------------------------------------------------------------------------
// Proteção contra perda silenciosa de dados.
//
// Se a renovação do token falhar (ex.: refresh token já usado em outra aba, ou
// recusado pelo servidor), o supabase-js apaga a sessão local. Antes, o próximo
// ensureSession() criava OUTRO usuário anônimo sem avisar — e a pessoa via o app
// vazio. Agora guardamos uma cópia da sessão; sem sessão, tentamos recuperá-la, e
// só criamos um usuário novo quando não existe nenhum usuário anterior neste
// aparelho (primeiro uso) ou quando a pessoa escolhe começar do zero.
// ---------------------------------------------------------------------------
const BACKUP_KEY = "norte-session-backup";
type SessionBackup = { userId: string; refreshToken: string };

/** A sessão anterior existe mas não pôde ser recuperada: a UI pergunta à pessoa. */
export class SessionLostError extends Error {
  constructor() {
    super("Sua sessão neste aparelho expirou e não pôde ser recuperada.");
    this.name = "SessionLostError";
  }
}

function readBackup(): SessionBackup | null {
  try {
    const raw = localStorage.getItem(BACKUP_KEY);
    const v = raw ? JSON.parse(raw) : null;
    return v?.userId && v?.refreshToken ? v : null;
  } catch {
    return null;
  }
}
function writeBackup(userId: string, refreshToken: string) {
  try {
    localStorage.setItem(BACKUP_KEY, JSON.stringify({ userId, refreshToken }));
  } catch {
    /* sem storage: sem proteção extra, mas o app segue funcionando */
  }
}
export function clearSessionBackup() {
  try {
    localStorage.removeItem(BACKUP_KEY);
  } catch {
    /* nada a limpar */
  }
}

/** Saída pedida pela própria pessoa (sair, excluir conta): não é perda de sessão. */
let intentionalSignOut = false;
export function markIntentionalSignOut() {
  intentionalSignOut = true;
  clearSessionBackup();
}

type LostListener = () => void;
const lostListeners = new Set<LostListener>();
/** Avisa quando a sessão cai sem a pessoa ter pedido (para o AuthGate reagir). */
export function onSessionLost(fn: LostListener) {
  lostListeners.add(fn);
  return () => {
    lostListeners.delete(fn);
  };
}

if (typeof window !== "undefined") {
  supabase.auth.onAuthStateChange((event, session) => {
    if (session?.user.id && session.refresh_token) {
      intentionalSignOut = false;
      writeBackup(session.user.id, session.refresh_token);
      return;
    }
    if (event === "SIGNED_OUT") {
      bootstrapped = null;
      if (!intentionalSignOut && readBackup()) lostListeners.forEach((fn) => fn());
    }
  });
}

const isNetworkError = (e: unknown) => {
  const err = e as { name?: string; status?: number; message?: string } | null;
  return (
    !err ||
    err.name === "AuthRetryableFetchError" ||
    err.status === 0 ||
    (typeof err.status === "number" && err.status >= 500) ||
    /fetch|network|timeout/i.test(err.message ?? "")
  );
};

/** Tenta recuperar a sessão anterior a partir da cópia guardada. */
async function recoverFromBackup(backup: SessionBackup): Promise<string> {
  const { data, error } = await supabase.auth.refreshSession({
    refresh_token: backup.refreshToken,
  });
  if (data.session?.user.id === backup.userId) return backup.userId;
  if (error && isNetworkError(error))
    throw new Error(`Sem conexão para recuperar a sessão: ${error.message}`);
  // A sessão recuperada é de outra pessoa (não deveria acontecer) ou o token foi recusado.
  if (data.session) await supabase.auth.signOut({ scope: "local" });
  throw new SessionLostError();
}

/** Primarily called by tests and the "start fresh" choice. */
async function createAnonymousSession(): Promise<string> {
  const { data, error } = await supabase.auth.signInAnonymously();
  if (error || !data.session) {
    throw new Error(`Falha ao iniciar sessão anônima do Supabase: ${error?.message}`);
  }
  return data.session.user.id;
}

/** Preenche o cache de `ensureSession()` quando quem chama já resolveu a sessão
 * (ex.: `AuthGate` no warm-start) — evita que cada `useSupabaseUserId()` filho
 * dispare seu próprio `getSession()` redundante e enxergue `userId` undefined
 * por um instante a mais do que o necessário. */
export function primeSession(userId: string) {
  if (!bootstrapped) bootstrapped = Promise.resolve(userId);
}

/** Garante uma sessão ativa e devolve o user_id. Só cria um usuário anônimo novo no
 * primeiro uso do aparelho; se já houve uma sessão aqui, recupera-a ou lança
 * SessionLostError (nunca troca de usuário em silêncio). Falhas são refeitas na
 * próxima chamada. */
export function ensureSession(): Promise<string> {
  if (!bootstrapped) {
    bootstrapped = (async () => {
      try {
        const { data: existing } = await supabase.auth.getSession();
        if (existing.session?.user.id) return existing.session.user.id;
        const backup = readBackup();
        if (backup) return await recoverFromBackup(backup);
        return await createAnonymousSession();
      } catch (err) {
        bootstrapped = null;
        throw err;
      }
    })();
  }
  return bootstrapped;
}

/** Escolha explícita da pessoa depois de uma sessão perdida: começa um uso novo. */
export async function startFreshSession(): Promise<string> {
  clearSessionBackup();
  try {
    await supabase.auth.signOut({ scope: "local" });
  } catch {
    /* já não havia sessão */
  }
  bootstrapped = createAnonymousSession();
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
      if (session?.user.id) bootstrapped = Promise.resolve(session.user.id);
      if (!cancelled) setUserId(session?.user.id);
    });
    const attempt = () => {
      ensureSession().then(
        (id) => {
          if (!cancelled) setUserId(id);
        },
        (err) => {
          // ensureSession() já zera o cache interno em caso de erro (ver comentário
          // acima) — sem este retry, uma falha transitória de rede deixava este hook
          // parado em `undefined` para sempre, mesmo depois da rede voltar.
          // Sessão perdida não se resolve sozinha: o AuthGate pergunta à pessoa.
          if (!cancelled && !(err instanceof SessionLostError))
            retryTimer = setTimeout(attempt, 3000);
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
  markIntentionalSignOut();
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
