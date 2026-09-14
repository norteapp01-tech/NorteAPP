import { useEffect, useState } from "react";
import { ArrowLeft, Check, Compass, Mail } from "lucide-react";
import { NorteChat } from "./NorteChat";
import { AuthGate } from "./AuthGate";
import { supabase } from "@/lib/supabase/client";
import { Drawer, DrawerContent, DrawerTitle, DrawerDescription } from "./ui/drawer";
import "./signup-sheet.css";

const field = "w-full rounded-xl border border-border bg-surface px-4 py-3 text-sm";
const action =
  "w-full rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-50";

export function OnboardingFlow({ onBack }: { onBack: () => void }) {
  const [account, setAccount] = useState(false);
  const [payment, setPayment] = useState(false);
  const [manual, setManual] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function finishIfVerified() {
    const { data, error: authError } = await supabase.auth.getUser();
    if (authError) throw authError;
    if (!data.user || data.user.is_anonymous || !data.user.email_confirmed_at) return false;
    const social = data.user.identities?.some((identity) =>
      ["google", "apple"].includes(identity.provider),
    );
    if (!social && !data.user.user_metadata.onboarding_password_set) {
      setManual(true);
      setVerifying(true);
      setAccount(true);
      return false;
    }
    // Preserve the anonymous identity and its plans instead of creating a second account.
    localStorage.setItem("norte_has_account", "1");
    sessionStorage.setItem("norte-onboarding-stage", "payment");
    setAccount(false);
    setPayment(true);
    return true;
  }

  useEffect(() => {
    const stage = sessionStorage.getItem("norte-onboarding-stage");
    if (stage === "account" || stage === "payment") {
      setAccount(true);
      void finishIfVerified().catch(() =>
        setError("Não foi possível verificar sua conta. Tente novamente."),
      );
    }
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "USER_UPDATED") {
        // Run outside the Supabase auth callback lock.
        window.setTimeout(() => {
          if (
            ["account", "payment"].includes(sessionStorage.getItem("norte-onboarding-stage") || "")
          ) {
            void finishIfVerified().catch(() => {});
          }
        }, 0);
      }
    });
    return () => data.subscription.unsubscribe();
  }, []);

  function openAccount() {
    sessionStorage.setItem("norte-onboarding-stage", "account");
    setAccount(true);
    void finishIfVerified().catch(() => {});
  }

  async function oauth(provider: "google" | "apple") {
    setBusy(true);
    setError("");
    try {
      sessionStorage.setItem("norte-onboarding-stage", "account");
      const { error: linkError } = await supabase.auth.linkIdentity({
        provider,
        options: { redirectTo: `${window.location.origin}/?onboarding=account` },
      });
      if (linkError) throw linkError;
    } catch {
      setError(
        "Não foi possível conectar esse provedor. Tente novamente ou crie sua conta com e-mail.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function register(event: React.FormEvent) {
    event.preventDefault();
    if (password.length < 8 || password !== confirmPassword) {
      setError("Use pelo menos 8 caracteres e confirme a mesma senha nos dois campos.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const { error: updateError } = await supabase.auth.updateUser(
        { email: email.trim(), data: { full_name: name.trim() } },
        { emailRedirectTo: `${window.location.origin}/?onboarding=account` },
      );
      if (updateError) throw updateError;
      setVerifying(true);
      setNotice(
        "Enviamos um link para seu e-mail. Confirme o endereço e volte aqui para concluir seu cadastro.",
      );
    } catch {
      setError("Não foi possível cadastrar esse e-mail. Confira o endereço ou use outra conta.");
    } finally {
      setBusy(false);
    }
  }

  async function savePassword(event: React.FormEvent) {
    event.preventDefault();
    if (password.length < 8 || password !== confirmPassword) {
      setError("Use pelo menos 8 caracteres e confirme a mesma senha nos dois campos.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const { data, error: readError } = await supabase.auth.getUser();
      if (readError) throw readError;
      if (!data.user?.email_confirmed_at || data.user.is_anonymous) {
        setError("Confirme primeiro o link enviado ao seu e-mail.");
        return;
      }
      const { error: passwordError } = await supabase.auth.updateUser({
        password,
        data: { onboarding_password_set: true },
      });
      if (passwordError) throw passwordError;
      setPassword("");
      setConfirmPassword("");
      await finishIfVerified();
    } catch {
      setError("Não foi possível salvar sua senha. Tente novamente.");
    } finally {
      setBusy(false);
    }
  }

  if (payment)
    return (
      <main className="flex min-h-svh flex-col px-6 py-8">
        <button
          className="mb-10 flex min-h-11 items-center gap-2 self-start text-sm text-muted-foreground"
          onClick={() => {
            setPayment(false);
            setAccount(false);
          }}
        >
          <ArrowLeft size={18} /> Sua conversa
        </button>
        <Compass className="mb-6 text-primary" size={30} />
        <p className="text-xs uppercase tracking-[.2em] text-muted-foreground">NORTE</p>
        <h1 className="mt-3 text-3xl font-bold tracking-tight">
          Seu próximo passo,
          <br />
          com um Norte.
        </h1>
        <p className="mt-4 text-sm text-muted-foreground">
          Sua conta está criada. Este será o próximo passo para continuar com o Norte.
        </p>
        <section className="my-8 rounded-3xl border border-border bg-surface p-6">
          <p className="text-sm font-semibold text-primary">Assinatura Norte</p>
          <h2 className="my-5 text-2xl font-semibold">Plano em preparação</h2>
          <p className="mb-6 text-sm text-muted-foreground">
            O valor e as condições serão apresentados aqui antes de qualquer contratação.
          </p>
          {[
            "Conversa com o Norte",
            "Planos e rotina no mesmo lugar",
            "Acompanhamento do seu dia",
          ].map((text) => (
            <p key={text} className="mt-4 flex items-center gap-3 text-sm">
              <Check size={17} className="text-primary" />
              {text}
            </p>
          ))}
        </section>
        <button disabled className={action}>
          Pagamento em breve
        </button>
        <p className="mt-4 text-center text-xs text-muted-foreground">
          Nenhuma cobrança será feita nesta etapa.
        </p>
      </main>
    );

  return (
    <>
      <AuthGate>
        <NorteChat demo onBack={onBack} onDemoComplete={openAccount} />
      </AuthGate>
      <Drawer
        open={account}
        onOpenChange={setAccount}
        shouldScaleBackground={false}
        dismissible={false}
      >
        <DrawerContent className="signup-sheet" onEscapeKeyDown={(event) => event.preventDefault()}>
          <div className="signup-sheet-body">
            <Compass className="signup-sheet-mark text-primary" size={32} />
            <DrawerTitle className="signup-sheet-title">Crie sua conta para continuar.</DrawerTitle>
            <DrawerDescription className="signup-sheet-description">
              Crie sua conta para salvar o que você começou e continuar com o Norte.
            </DrawerDescription>
            {!manual ? (
              <div className="signup-sheet-options">
                <button
                  disabled={busy}
                  className="signup-provider signup-google"
                  onClick={() => oauth("google")}
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
                  <span>Continuar com Google</span>
                </button>
                <button
                  disabled={busy}
                  className="signup-provider signup-apple"
                  onClick={() => oauth("apple")}
                >
                  <svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M17.05 12.54c.03 3.14 2.75 4.18 2.78 4.2-.02.07-.43 1.49-1.43 2.96-.87 1.27-1.78 2.54-3.2 2.57-1.4.04-1.85-.83-3.45-.83-1.6 0-2.1.8-3.43.86-1.38.05-2.43-1.38-3.31-2.65-1.8-2.6-3.17-7.35-1.32-10.56a5.13 5.13 0 0 1 4.33-2.63c1.35-.03 2.63.92 3.45.92.83 0 2.37-1.14 3.99-.97.67.03 2.57.27 3.78 2.04-.1.06-2.25 1.31-2.23 4.09ZM14.43 4.7c.73-.89 1.22-2.13 1.08-3.36-1.05.04-2.33.7-3.08 1.59-.67.77-1.26 2.02-1.1 3.22 1.17.09 2.37-.6 3.1-1.45Z" />
                  </svg>
                  <span>Continuar com Apple</span>
                </button>
                <div className="signup-sheet-divider">
                  <span />
                  ou
                  <span />
                </div>
                <button
                  disabled={busy}
                  className="signup-provider signup-email"
                  onClick={() => setManual(true)}
                >
                  <Mail size={23} /> <span>Criar conta com e-mail</span>
                </button>
              </div>
            ) : !verifying ? (
              <form onSubmit={register} className="space-y-3">
                <label className="block text-sm">
                  Nome
                  <input
                    autoComplete="name"
                    required
                    maxLength={100}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className={`${field} mt-1`}
                  />
                </label>
                <label className="block text-sm">
                  E-mail
                  <input
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className={`${field} mt-1`}
                  />
                </label>
                <label className="block text-sm">
                  Senha
                  <input
                    type="password"
                    required
                    minLength={8}
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={`${field} mt-1`}
                  />
                </label>
                <label className="block text-sm">
                  Confirmar senha
                  <input
                    type="password"
                    required
                    minLength={8}
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className={`${field} mt-1`}
                  />
                </label>
                <p className="text-xs text-muted-foreground">Use pelo menos 8 caracteres.</p>
                <button disabled={busy || !name.trim()} className={action}>
                  {busy ? "Criando…" : "Criar minha conta"}
                </button>
              </form>
            ) : (
              <form onSubmit={savePassword} className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  {notice || "Confirme seu e-mail e escolha sua senha."}
                </p>
                <label className="block text-sm">
                  Senha
                  <input
                    type="password"
                    required
                    minLength={8}
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={`${field} mt-1`}
                  />
                </label>
                <p className="text-xs text-muted-foreground">Use pelo menos 8 caracteres.</p>
                <label className="block text-sm">
                  Confirmar senha
                  <input
                    type="password"
                    required
                    minLength={8}
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className={`${field} mt-1`}
                  />
                </label>
                <button disabled={busy} className={action}>
                  {busy ? "Verificando…" : "Concluir minha conta"}
                </button>
              </form>
            )}
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            {manual && (
              <button
                disabled={busy}
                className="signup-sheet-return"
                onClick={() => {
                  setManual(false);
                  setError("");
                }}
              >
                Voltar
              </button>
            )}
          </div>
        </DrawerContent>
      </Drawer>
    </>
  );
}
