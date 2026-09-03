import { useEffect, useState, type ReactNode } from "react";
import { supabase, ensureSession, hasLinkedAccount } from "@/lib/supabase/client";

type Status = "checking" | "ready" | "needs-login";

/**
 * No boot padrão (nunca fez upgrade pra e-mail/senha), continua 100% silencioso —
 * sessão anônima automática, sem tela nenhuma. Só se ESTE navegador já teve uma
 * conta real vinculada e a sessão sumiu (ex.: logout) é que mostramos um login
 * mínimo, pra não criar uma conta anônima nova e "perder" os dados de verdade.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>("checking");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        if (!cancelled) setStatus("ready");
        return;
      }
      if (hasLinkedAccount()) {
        if (!cancelled) setStatus("needs-login");
        return;
      }
      await ensureSession();
      if (!cancelled) setStatus("ready");
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (status === "checking") return null;
  if (status === "needs-login") return <SignInScreen onSuccess={() => setStatus("ready")} />;
  return <>{children}</>;
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
