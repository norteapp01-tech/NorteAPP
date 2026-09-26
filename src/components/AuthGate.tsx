import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { AlertTriangle, RefreshCcw, WifiOff } from "lucide-react";
import { supabase, ensureSession, hasLinkedAccount, primeSession } from "@/lib/supabase/client";
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from "./ui/drawer";
import "./signup-sheet.css";
import { DawnMark } from "./ui/app-design-system";

type Status = "checking" | "ready" | "needs-login" | "connection-error";
type Provider = "google" | "apple";
type LoginView = "login" | "forgot" | "sent" | "new-password";

/** Keep returning accounts out of a fresh anonymous session when their session expires. */
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
          primeSession(data.session.user.id);
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

const field =
  "mt-1 w-full rounded-xl border border-border bg-surface px-4 py-3 text-sm outline-none focus:border-primary";
const action =
  "w-full rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-50";

function rememberAccount() {
  try {
    localStorage.setItem("norte_has_account", "1");
  } catch {
    /* Storage may be unavailable. */
  }
}

export function SignInScreen({
  onSuccess,
  subtitle = "Entre para continuar de onde parou.",
  onBack,
  recovery = false,
  showBackdrop = true,
}: {
  onSuccess: () => void;
  subtitle?: string;
  onBack?: () => void;
  recovery?: boolean;
  showBackdrop?: boolean;
}) {
  const [view, setView] = useState<LoginView>(recovery ? "new-password" : "login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submitLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (signInError) throw signInError;
      rememberAccount();
      onSuccess();
    } catch {
      setError("Não foi possível entrar. Confira seu e-mail e sua senha.");
    } finally {
      setLoading(false);
    }
  }

  async function sendRecovery(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/?auth=recovery`,
      });
      if (resetError) throw resetError;
      setView("sent");
    } catch {
      setError("Não foi possível enviar o link agora. Tente novamente em instantes.");
    } finally {
      setLoading(false);
    }
  }

  async function saveNewPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (password.length < 8 || password !== confirmPassword) {
      setError("Use pelo menos 8 caracteres e repita a mesma senha.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { data, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !data.session || data.session.user.is_anonymous) {
        setError("Este link expirou ou já foi usado. Solicite outro em 'Esqueci minha senha'.");
        return;
      }
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;
      rememberAccount();
      onSuccess();
    } catch {
      setError("Não foi possível trocar a senha. Solicite um novo link e tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  async function signInWithProvider(provider: Provider) {
    setLoading(true);
    setError(null);
    try {
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo: `${window.location.origin}/?auth=login` },
      });
      if (oauthError) throw oauthError;
    } catch {
      setError(
        `Não foi possível abrir o login ${provider === "apple" ? "da Apple" : "do Google"}. Tente novamente.`,
      );
      setLoading(false);
    }
  }

  const title =
    view === "login"
      ? "Entre na sua conta."
      : view === "forgot"
        ? "Recupere sua senha."
        : view === "sent"
          ? "Confira seu e-mail."
          : "Escolha uma nova senha.";
  const description =
    view === "login"
      ? subtitle
      : view === "forgot"
        ? "Enviaremos um link para você voltar à sua conta."
        : view === "sent"
          ? "Se houver uma conta com este e-mail, você receberá um link para criar uma nova senha."
          : "Use pelo menos 8 caracteres para proteger sua conta.";

  return (
    <>
      {showBackdrop && <div className="min-h-svh bg-background" aria-hidden="true" />}
      <Drawer
        open
        onOpenChange={(open) => {
          if (!open) onBack?.();
        }}
        shouldScaleBackground={false}
        dismissible={Boolean(onBack) && !recovery}
      >
        <DrawerContent className="signup-sheet">
          <div className="signup-sheet-body">
            <div className="signup-sheet-mark text-primary" aria-hidden="true">
              <DawnMark compact />
            </div>
            <DrawerTitle className="signup-sheet-title">{title}</DrawerTitle>
            <DrawerDescription className="signup-sheet-description">
              {description}
            </DrawerDescription>

            {view === "login" && (
              <>
                <form onSubmit={submitLogin} className="space-y-3">
                  <label className="block text-sm">
                    E-mail
                    <input
                      type="email"
                      autoComplete="email"
                      required
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      className={field}
                    />
                  </label>
                  <label className="block text-sm">
                    Senha
                    <input
                      type="password"
                      autoComplete="current-password"
                      required
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      className={field}
                    />
                  </label>
                  <button
                    type="button"
                    className="signup-forgot-link"
                    onClick={() => {
                      setError(null);
                      setView("forgot");
                    }}
                  >
                    Esqueci minha senha
                  </button>
                  <button
                    type="submit"
                    disabled={loading || !email.trim() || !password}
                    className={action}
                  >
                    {loading ? "Entrando…" : "Entrar"}
                  </button>
                </form>
                <div className="signup-sheet-divider">
                  <span />
                  ou
                  <span />
                </div>
                <div className="signup-sheet-options">
                  <button
                    type="button"
                    disabled={loading}
                    className="signup-provider signup-google"
                    onClick={() => void signInWithProvider("google")}
                  >
                    <svg aria-hidden="true" viewBox="0 0 24 24">
                      <path
                        fill="#4285F4"
                        d="M21.6 12.23c0-.71-.06-1.39-.18-2.05H12v3.88h5.38a4.6 4.6 0 0 1-2 3.02v2.51h3.25c1.9-1.75 2.97-4.33 2.97-7.36Z"
                      />
                      <path
                        fill="#34A853"
                        d="M12 22c2.7 0 4.96-.9 6.61-2.41l-3.25-2.51c-.9.6-2.05.96-3.36.96-2.6 0-4.81-1.76-5.6-4.12H3.04v2.59A10 10 0 0 0 12 22Z"
                      />
                      <path
                        fill="#FBBC05"
                        d="M6.4 13.92a6 6 0 0 1 0-3.84V7.49H3.04a10 10 0 0 0 0 9.02l3.36-2.59Z"
                      />
                      <path
                        fill="#EA4335"
                        d="M12 5.96c1.47 0 2.79.5 3.82 1.49l2.87-2.87A9.6 9.6 0 0 0 12 2a10 10 0 0 0-8.96 5.49l3.36 2.59C7.19 7.72 9.4 5.96 12 5.96Z"
                      />
                    </svg>
                    <span>Entrar com Google</span>
                  </button>
                  <button
                    type="button"
                    disabled={loading}
                    className="signup-provider signup-apple"
                    onClick={() => void signInWithProvider("apple")}
                  >
                    <svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M17.05 12.54c.03 3.14 2.75 4.18 2.78 4.2-.02.07-.43 1.49-1.43 2.96-.87 1.27-1.78 2.54-3.2 2.57-1.4.04-1.85-.83-3.45-.83-1.6 0-2.1.8-3.43.86-1.38.05-2.43-1.38-3.31-2.65-1.8-2.6-3.17-7.35-1.32-10.56a5.13 5.13 0 0 1 4.33-2.63c1.35-.03 2.63.92 3.45.92.83 0 2.37-1.14 3.99-.97.67.03 2.57.27 3.78 2.04-.1.06-2.25 1.31-2.23 4.09ZM14.43 4.7c.73-.89 1.22-2.13 1.08-3.36-1.05.04-2.33.7-3.08 1.59-.67.77-1.26 2.02-1.1 3.22 1.17.09 2.37-.6 3.1-1.45Z" />
                    </svg>
                    <span>Entrar com Apple</span>
                  </button>
                </div>
              </>
            )}

            {view === "forgot" && (
              <form onSubmit={sendRecovery} className="space-y-4">
                <label className="block text-sm">
                  E-mail
                  <input
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    className={field}
                  />
                </label>
                <button type="submit" disabled={loading || !email.trim()} className={action}>
                  {loading ? "Enviando…" : "Enviar link de recuperação"}
                </button>
              </form>
            )}

            {view === "sent" && (
              <button
                type="button"
                className={action}
                onClick={() => {
                  setView("login");
                  setError(null);
                }}
              >
                Voltar para o login
              </button>
            )}

            {view === "new-password" && (
              <form onSubmit={saveNewPassword} className="space-y-3">
                <label className="block text-sm">
                  Nova senha
                  <input
                    type="password"
                    autoComplete="new-password"
                    minLength={8}
                    required
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    className={field}
                  />
                </label>
                <label className="block text-sm">
                  Confirmar nova senha
                  <input
                    type="password"
                    autoComplete="new-password"
                    minLength={8}
                    required
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    className={field}
                  />
                </label>
                <button
                  type="submit"
                  disabled={loading || !password || !confirmPassword}
                  className={action}
                >
                  {loading ? "Salvando…" : "Salvar nova senha"}
                </button>
                <button
                  type="button"
                  className="signup-forgot-link"
                  onClick={() => {
                    setView("forgot");
                    setError(null);
                  }}
                >
                  Pedir outro link
                </button>
              </form>
            )}

            {error && (
              <p role="alert" className="mt-4 text-sm text-destructive">
                {error}
              </p>
            )}
            {onBack && view !== "login" && view !== "new-password" && (
              <button
                type="button"
                className="signup-sheet-return"
                onClick={() => {
                  setView("login");
                  setError(null);
                }}
              >
                Voltar
              </button>
            )}
            {onBack && view === "login" && (
              <button type="button" className="signup-sheet-return" onClick={onBack}>
                Voltar
              </button>
            )}
          </div>
        </DrawerContent>
      </Drawer>
    </>
  );
}
