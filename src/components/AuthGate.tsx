import { useEffect, useState, type ReactNode } from "react";
import { RefreshCcw, WifiOff, AlertTriangle } from "lucide-react";
import { supabase, ensureSession, hasLinkedAccount } from "@/lib/supabase/client";

type Status = "checking" | "ready" | "needs-login" | "connection-error";

/**
 * No boot padrão (nunca fez upgrade pra e-mail/senha), continua 100% silencioso —
 * sessão anônima automática, sem tela nenhuma. Só se ESTE navegador já teve uma
 * conta real vinculada e a sessão sumiu (ex.: logout) é que mostramos um login
 * mínimo, pra não criar uma conta anônima nova e "perder" os dados de verdade.
 *
 * Se a criação/verificação de sessão falhar (rede indisponível, Supabase fora do
 * ar), nunca deixamos a tela em branco pra sempre — mostramos um estado de erro
 * explícito com "Tentar novamente" (que reexecuta o boot de verdade, já que
 * `ensureSession()` agora reseta seu cache interno quando falha).
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>("checking");
  const [errorMessage, setErrorMessage] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setStatus("checking");
    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (cancelled) return;
        if (data.session) {
          setStatus("ready");
          return;
        }
        if (hasLinkedAccount()) {
          setStatus("needs-login");
          return;
        }
        await ensureSession();
        if (!cancelled) setStatus("ready");
      } catch (err) {
        if (cancelled) return;
        setErrorMessage(err instanceof Error ? err.message : "Falha desconhecida.");
        setStatus("connection-error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  if (status === "checking") return <BootScreen />;
  if (status === "connection-error") {
    return (
      <ConnectionErrorScreen message={errorMessage} onRetry={() => setAttempt((a) => a + 1)} />
    );
  }
  if (status === "needs-login") return <SignInScreen onSuccess={() => setStatus("ready")} />;
  return <>{children}</>;
}

/** Sutil, sem "pulo" de layout — evita tela branca perceptível em conexões lentas
 * sem competir visualmente com o app real quando a checagem é instantânea. */
function BootScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="h-6 w-6 animate-pulse rounded-full bg-primary/40" aria-hidden="true" />
      <span className="sr-only">Carregando…</span>
    </div>
  );
}

function ConnectionErrorScreen({ message, onRetry }: { message: string; onRetry: () => void }) {
  const offline = typeof navigator !== "undefined" && !navigator.onLine;
  return (
    <div
      role="alert"
      className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-6 text-center"
    >
      {offline ? (
        <WifiOff className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
      ) : (
        <AlertTriangle className="h-8 w-8 text-warning" aria-hidden="true" />
      )}
      <div>
        <h1 className="text-lg font-bold">
          {offline ? "Sem conexão com a internet" : "Não foi possível conectar"}
        </h1>
        <p className="mt-1 max-w-xs text-sm text-muted-foreground">
          {offline
            ? "Verifique sua internet e tente de novo. Seus dados continuam salvos com segurança."
            : "Não deu pra confirmar sua sessão agora. Isso costuma ser temporário."}
        </p>
        {!offline && message && (
          <p className="mt-2 text-[11px] text-muted-foreground/70">{message}</p>
        )}
      </div>
      <button
        onClick={onRetry}
        className="flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground"
      >
        <RefreshCcw className="h-4 w-4" /> Tentar novamente
      </button>
    </div>
  );
}

function SignInScreen({ onSuccess }: { onSuccess: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setLoading(true);
    setError(null);
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (signInError) {
      setError("E-mail ou senha incorretos.");
      return;
    }
    onSuccess();
  };

  return (
    <div className="flex min-h-screen flex-col justify-center px-6">
      <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Norte</p>
      <h1 className="mt-1 text-2xl font-bold">Entrar na sua conta</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Este dispositivo já teve uma conta vinculada. Entre pra recuperar seus dados.
      </p>

      <div className="mt-6 space-y-3">
        <label className="block">
          <span className="mb-0.5 block text-[10px] uppercase text-muted-foreground">E-mail</span>
          <input
            type="email"
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-primary"
          />
        </label>
        <label className="block">
          <span className="mb-0.5 block text-[10px] uppercase text-muted-foreground">Senha</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-primary"
          />
        </label>
        {error && <p className="text-xs text-danger">{error}</p>}
        <button
          onClick={submit}
          disabled={loading || !email || !password}
          className="w-full rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground disabled:opacity-40"
        >
          Entrar
        </button>
      </div>
    </div>
  );
}
