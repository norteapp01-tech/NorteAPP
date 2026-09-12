import { useEffect, useState } from "react";
import { ArrowLeft, Check, Compass, Mail } from "lucide-react";
import { NorteChat } from "./NorteChat";
import { AuthGate } from "./AuthGate";
import { supabase } from "@/lib/supabase/client";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "./ui/dialog";

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
        "Enviamos um link para seu e-mail. Confirme o endereço e volte aqui para definir sua senha.",
      );
    } catch {
      setError("Não foi possível cadastrar esse e-mail. Confira o endereço ou use outra conta.");
    } finally {
      setBusy(false);
    }
  }

  async function savePassword(event: React.FormEvent) {
    event.preventDefault();
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
      <Dialog open={account} onOpenChange={setAccount}>
        <DialogContent className="max-h-[90dvh] max-w-sm overflow-y-auto rounded-3xl">
          <Compass className="text-primary" size={28} />
          <DialogTitle className="text-2xl">Guarde seu próximo passo.</DialogTitle>
          <DialogDescription>
            Crie sua conta para continuar com esta conversa e os planos que começou.
          </DialogDescription>
          {!manual ? (
            <div className="space-y-3">
              <button disabled={busy} className={field} onClick={() => oauth("google")}>
                Continuar com Google
              </button>
              <button disabled={busy} className={field} onClick={() => oauth("apple")}>
                Continuar com Apple
              </button>
              <button
                disabled={busy}
                className={`${field} flex items-center justify-center gap-2`}
                onClick={() => setManual(true)}
              >
                <Mail size={17} /> Criar com e-mail
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
              <button disabled={busy || !name.trim()} className={action}>
                {busy ? "Enviando…" : "Confirmar meu e-mail"}
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
          <button
            className="min-h-11 text-sm text-muted-foreground"
            onClick={() => setAccount(false)}
          >
            Voltar à conversa
          </button>
        </DialogContent>
      </Dialog>
    </>
  );
}
