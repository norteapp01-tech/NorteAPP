import { useState } from "react";
import { ProfileEditor } from "@/components/settings/ProfileEditor";
import { SubscriptionSection } from "@/components/settings/SubscriptionSection";
import {
  User,
  ShieldCheck,
  SlidersHorizontal,
  Bell,
  Lock,
  CreditCard,
  CircleHelp,
} from "lucide-react";
import { useProfile, updateProfile, type TimeFormat, type WeekStart } from "@/lib/profile-store";
import {
  supabase,
  useAuthUser,
  upgradeToEmailAccount,
  changeEmail,
  changePassword,
} from "@/lib/supabase/client";

function SectionHeader({ icon: Icon, title }: { icon: typeof User; title: string }) {
  return (
    <div className="flex items-center gap-2">
      <Icon className="h-4 w-4 text-primary" />
      <h2 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
        {title}
      </h2>
    </div>
  );
}

/** Metadados compartilhados com o painel de Configurações (aberto pelos três pontos na Hoje)
 * — cada seção abaixo também é usada isolada lá, numa tela dedicada por categoria. */
export const settingsSections = [
  { key: "perfil", label: "Meu perfil", icon: User, Component: ProfileEditor },
  {
    key: "assinatura",
    label: "Assinatura e cobranças",
    icon: CreditCard,
    Component: SubscriptionSection,
  },
  { key: "conta", label: "Conta e segurança", icon: ShieldCheck, Component: AccountSection },
  {
    key: "preferencias",
    label: "Preferências",
    icon: SlidersHorizontal,
    Component: PreferencesSection,
  },
  { key: "notificacoes", label: "Notificações", icon: Bell, Component: NotificationsSection },
  { key: "privacidade", label: "Dados e privacidade", icon: Lock, Component: DataPrivacySection },
  { key: "ajuda", label: "Ajuda e suporte", icon: CircleHelp, Component: HelpSection },
] as const;

function Row({ label, value, onClick }: { label: string; value?: string; onClick?: () => void }) {
  const content = (
    <div className="flex items-center justify-between p-3.5">
      <span className="text-sm">{label}</span>
      {value !== undefined && <span className="text-sm text-muted-foreground">{value}</span>}
    </div>
  );
  if (!onClick) return content;
  return (
    <button onClick={onClick} className="w-full text-left hover:bg-surface-2">
      {content}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Perfil
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Conta e segurança
// ---------------------------------------------------------------------------
function AccountSection() {
  const user = useAuthUser();
  const [mode, setMode] = useState<"none" | "upgrade" | "email" | "password">("none");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState("");

  const isAnonymous = user?.isAnonymous ?? true;

  const submitUpgrade = async () => {
    setBusy(true);
    setError(null);
    try {
      await upgradeToEmailAccount(email, password);
      setPassword("");
      setSuccess(
        "Cadastro enviado. Confira seu e-mail para concluir a confirmação, se solicitada.",
      );
      setMode("none");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível concluir.");
    } finally {
      setBusy(false);
    }
  };

  const submitEmail = async () => {
    setBusy(true);
    setError(null);
    try {
      await changeEmail(email);
      setSuccess("Solicitação enviada. Confira sua caixa de entrada para confirmar a alteração.");
      setMode("none");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível concluir.");
    } finally {
      setBusy(false);
    }
  };

  const submitPassword = async () => {
    setBusy(true);
    setError(null);
    try {
      await changePassword(password);
      setSuccess("Senha atualizada.");
      setMode("none");
      setPassword("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível concluir.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section>
      <SectionHeader icon={ShieldCheck} title="Conta e segurança" />
      {success && (
        <p role="status" className="mt-3 text-sm text-primary">
          {success}
        </p>
      )}
      <div className="mt-2 card-surface divide-y divide-border">
        {isAnonymous ? (
          <div className="p-3.5">
            <p className="text-sm">Nenhum e-mail cadastrado</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Adicione um e-mail e senha pra proteger seus dados e poder entrar de outro
              dispositivo.
            </p>
            {mode !== "upgrade" ? (
              <button
                onClick={() => setMode("upgrade")}
                className="mt-2 text-xs font-semibold text-primary"
              >
                adicionar e-mail e senha
              </button>
            ) : (
              <div className="mt-2 space-y-2">
                <input
                  type="email"
                  placeholder="E-mail"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-primary"
                />
                <input
                  type="password"
                  placeholder="Senha"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-primary"
                />
                {error && <p className="text-xs text-danger">{error}</p>}
                <div className="flex gap-2">
                  <button
                    onClick={submitUpgrade}
                    disabled={busy || !email || !password}
                    className="rounded-lg bg-primary px-4 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-40"
                  >
                    Salvar
                  </button>
                  <button onClick={() => setMode("none")} className="text-xs text-muted-foreground">
                    cancelar
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <>
            <Row label="E-mail" value={user?.email ?? ""} />
            <Row
              label="Verificação"
              value={user?.verified ? "E-mail confirmado" : "Confirmação pendente"}
            />
            <Row
              label="Formas de acesso"
              value={user?.providers
                .map((p) => ({ google: "Google", apple: "Apple", email: "E-mail" })[p] ?? p)
                .join(", ")}
            />
            {mode !== "email" ? (
              <Row label="Alterar e-mail" onClick={() => setMode("email")} />
            ) : (
              <div className="space-y-2 p-3.5">
                <input
                  type="email"
                  placeholder="Novo e-mail"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-primary"
                />
                {error && <p className="text-xs text-danger">{error}</p>}
                <div className="flex gap-2">
                  <button
                    onClick={submitEmail}
                    disabled={busy || !email}
                    className="rounded-lg bg-primary px-4 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-40"
                  >
                    Salvar
                  </button>
                  <button onClick={() => setMode("none")} className="text-xs text-muted-foreground">
                    cancelar
                  </button>
                </div>
              </div>
            )}
            {mode !== "password" ? (
              <Row
                label={
                  user?.providers.includes("email") ? "Alterar senha" : "Criar senha de acesso"
                }
                onClick={() => setMode("password")}
              />
            ) : (
              <div className="space-y-2 p-3.5">
                <input
                  type="password"
                  placeholder="Nova senha"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-primary"
                />
                {error && <p className="text-xs text-danger">{error}</p>}
                <div className="flex gap-2">
                  <button
                    onClick={submitPassword}
                    disabled={busy || password.length < 8}
                    className="rounded-lg bg-primary px-4 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-40"
                  >
                    Salvar
                  </button>
                  <button onClick={() => setMode("none")} className="text-xs text-muted-foreground">
                    cancelar
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}

function DeleteAccountConfirm({
  confirmText,
  setConfirmText,
  onCancel,
}: {
  confirmText: string;
  setConfirmText: (v: string) => void;
  onCancel: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirmDelete = async () => {
    setBusy(true);
    setError(null);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      const { error: fnError } = await supabase.functions.invoke("delete-account", {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (fnError) throw new Error(fnError.message);
      window.location.href = "/";
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível excluir a conta.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2">
      <p className="text-xs text-danger">
        Isso apaga permanentemente sua conta e todos os seus dados. Não tem como desfazer.
      </p>
      <p className="text-xs text-muted-foreground">
        Digite <span className="font-semibold text-foreground">excluir</span> para confirmar.
      </p>
      <input
        value={confirmText}
        onChange={(e) => setConfirmText(e.target.value)}
        className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-danger"
      />
      {error && <p className="text-xs text-danger">{error}</p>}
      <div className="flex gap-2">
        <button
          onClick={confirmDelete}
          disabled={busy || confirmText.trim().toLowerCase() !== "excluir"}
          className="rounded-lg bg-danger px-4 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
        >
          Excluir permanentemente
        </button>
        <button onClick={onCancel} className="text-xs text-muted-foreground">
          cancelar
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Preferências
// ---------------------------------------------------------------------------
const waterGoalOptions = [2000, 2500, 3000];
const timeFormatOptions: { value: TimeFormat; label: string }[] = [
  { value: "24h", label: "24 horas" },
  { value: "12h", label: "12 horas" },
];
const weekStartOptions: { value: WeekStart; label: string }[] = [
  { value: "monday", label: "Segunda-feira" },
  { value: "sunday", label: "Domingo" },
];

function PreferencesSection() {
  const profile = useProfile();

  return (
    <section>
      <SectionHeader icon={SlidersHorizontal} title="Preferências" />
      <div className="mt-2 card-surface p-3.5">
        <p className="text-sm">Meta diária de água</p>
        <div className="mt-2 flex gap-1.5">
          {waterGoalOptions.map((ml) => (
            <button
              key={ml}
              onClick={() => updateProfile({ waterGoalMl: ml })}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold ${profile.waterGoalMl === ml ? "bg-primary text-primary-foreground" : "bg-surface-2 text-muted-foreground"}`}
            >
              {(ml / 1000).toFixed(1)} L
            </button>
          ))}
        </div>
      </div>

      <div className="mt-2 card-surface p-3.5">
        <p className="text-sm">Formato de horário</p>
        <div className="mt-2 flex gap-1.5">
          {timeFormatOptions.map((o) => (
            <button
              key={o.value}
              onClick={() => updateProfile({ timeFormat: o.value })}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold ${profile.timeFormat === o.value ? "bg-primary text-primary-foreground" : "bg-surface-2 text-muted-foreground"}`}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-2 card-surface p-3.5">
        <p className="text-sm">Primeiro dia da semana</p>
        <div className="mt-2 flex gap-1.5">
          {weekStartOptions.map((o) => (
            <button
              key={o.value}
              onClick={() => updateProfile({ weekStart: o.value })}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold ${profile.weekStart === o.value ? "bg-primary text-primary-foreground" : "bg-surface-2 text-muted-foreground"}`}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Notificações
// ---------------------------------------------------------------------------
const notifRows: {
  key: "notifyAgenda" | "notifyPlans" | "notifyRoutines" | "notifyReminders";
  label: string;
}[] = [
  { key: "notifyAgenda", label: "Agenda e compromissos" },
  { key: "notifyPlans", label: "Planos e etapas" },
  { key: "notifyRoutines", label: "Rotinas/subagendas" },
  { key: "notifyReminders", label: "Lembretes importantes" },
];

function NotificationsSection() {
  const profile = useProfile();

  return (
    <section>
      <SectionHeader icon={Bell} title="Notificações" />
      <p className="mt-1 text-[11px] text-muted-foreground">
        Push ainda não está implementado — estas preferências já ficam salvas pra quando estiver.
      </p>
      <div className="mt-2 card-surface divide-y divide-border">
        {notifRows.map((r) => (
          <div key={r.key} className="flex items-center justify-between p-3.5">
            <span className="text-sm">{r.label}</span>
            <button
              onClick={() => updateProfile({ [r.key]: !profile[r.key] })}
              className={`h-6 w-10 shrink-0 rounded-full transition-colors ${profile[r.key] ? "bg-primary" : "bg-surface-2"}`}
            >
              <span
                className={`block h-5 w-5 rounded-full bg-background transition-transform ${profile[r.key] ? "translate-x-[18px]" : "translate-x-0.5"}`}
              />
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Dados e privacidade
// ---------------------------------------------------------------------------
function DataPrivacySection() {
  const [deleting, setDeleting] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  return (
    <section>
      <SectionHeader icon={Lock} title="Dados e privacidade" />
      <div className="mt-2 card-surface p-3.5 text-xs text-muted-foreground">
        <p>
          Seus dados (planos, execuções, registros das sub-agendas, hidratação e perfil) ficam
          vinculados só à sua conta, protegidos por autenticação e por políticas de acesso que
          restringem o acesso conforme as permissões da sua conta.
        </p>
        <p className="mt-2">
          Excluir a conta é diferente de sair ou cancelar a renovação. Verifique sua assinatura
          antes de excluir a conta.
        </p>
        {deleting ? (
          <DeleteAccountConfirm
            confirmText={confirmText}
            setConfirmText={setConfirmText}
            onCancel={() => setDeleting(false)}
          />
        ) : (
          <button className="mt-4 text-danger" onClick={() => setDeleting(true)}>
            Excluir minha conta
          </button>
        )}
      </div>
    </section>
  );
}

function HelpSection() {
  return (
    <div className="space-y-4 text-sm text-muted-foreground">
      <p>
        Em Assinatura e cobranças você consulta seu plano e os pagamentos registrados. Compras
        feitas pelas lojas são gerenciadas na App Store ou no Google Play.
      </p>
      <p>Sair da conta não cancela sua assinatura nem apaga seus dados salvos.</p>
      <p>O canal de atendimento do Norte ainda não foi disponibilizado.</p>
    </div>
  );
}
