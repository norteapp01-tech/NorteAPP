import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, type ChangeEvent } from "react";
import { ChevronLeft, User, ShieldCheck, SlidersHorizontal, Bell, Lock } from "lucide-react";
import {
  useProfile,
  updateProfile,
  ageFromBirthDate,
  type TimeFormat,
  type WeekStart,
} from "@/lib/profile-store";
import {
  supabase,
  useAuthUser,
  upgradeToEmailAccount,
  changeEmail,
  changePassword,
  signOutNorte,
} from "@/lib/supabase/client";

export const Route = createFileRoute("/configuracoes")({
  head: () => ({ meta: [{ title: "Configurações — Norte" }] }),
  component: ConfiguracoesScreen,
});

function ConfiguracoesScreen() {
  return (
    <div className="px-5 pt-12 pb-10">
      <Link to="/" className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        <ChevronLeft className="h-4 w-4" /> hoje
      </Link>
      <h1 className="mt-3 text-3xl font-bold tracking-tight">Configurações</h1>

      <div className="mt-6 space-y-6">
        <ProfileSection />
        <AccountSection />
        <PreferencesSection />
        <NotificationsSection />
        <DataPrivacySection />
      </div>
    </div>
  );
}

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
function ProfileSection() {
  const profile = useProfile();
  const [editingName, setEditingName] = useState(false);
  const [name, setName] = useState(profile.displayName ?? "");
  const [editingBirth, setEditingBirth] = useState(false);
  const [birth, setBirth] = useState(profile.birthDate ?? "");
  const [uploading, setUploading] = useState(false);

  const age = ageFromBirthDate(profile.birthDate);
  const avatarUrl = profile.avatarPath
    ? supabase.storage.from("avatars").getPublicUrl(profile.avatarPath).data.publicUrl
    : null;

  const onAvatarFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) return;
      const ext = file.name.split(".").pop() ?? "jpg";
      const path = `${userId}/avatar.${ext}`;
      const { error } = await supabase.storage.from("avatars").upload(path, file, { upsert: true });
      if (!error) await updateProfile({ avatarPath: path });
    } finally {
      setUploading(false);
    }
  };

  return (
    <section>
      <SectionHeader icon={User} title="Perfil" />
      <div className="mt-2 card-surface divide-y divide-border">
        <div className="flex items-center gap-3 p-3.5">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface-2">
            {avatarUrl ? (
              <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <User className="h-6 w-6 text-muted-foreground" />
            )}
          </div>
          <label className="cursor-pointer text-xs font-semibold text-primary">
            {uploading ? "enviando..." : "trocar foto"}
            <input type="file" accept="image/*" onChange={onAvatarFile} className="hidden" />
          </label>
        </div>

        {!editingName ? (
          <Row
            label="Nome"
            value={profile.displayName ?? "não definido"}
            onClick={() => setEditingName(true)}
          />
        ) : (
          <div className="flex items-center gap-2 p-3.5">
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-primary"
            />
            <button
              onClick={async () => {
                await updateProfile({ displayName: name.trim() || null });
                setEditingName(false);
              }}
              className="shrink-0 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground"
            >
              salvar
            </button>
          </div>
        )}

        {!editingBirth ? (
          <Row
            label="Data de nascimento"
            value={
              profile.birthDate ? profile.birthDate.split("-").reverse().join("/") : "não definida"
            }
            onClick={() => setEditingBirth(true)}
          />
        ) : (
          <div className="flex items-center gap-2 p-3.5">
            <input
              type="date"
              autoFocus
              value={birth}
              onChange={(e) => setBirth(e.target.value)}
              className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-primary"
            />
            <button
              onClick={async () => {
                await updateProfile({ birthDate: birth || null });
                setEditingBirth(false);
              }}
              className="shrink-0 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground"
            >
              salvar
            </button>
          </div>
        )}

        <Row label="Idade" value={age !== null ? `${age} anos` : "—"} />
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Conta e segurança
// ---------------------------------------------------------------------------
function AccountSection() {
  const user = useAuthUser();
  const [mode, setMode] = useState<"none" | "upgrade" | "email" | "password" | "delete">("none");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);

  const isAnonymous = user?.isAnonymous ?? true;

  const submitUpgrade = async () => {
    setBusy(true);
    setError(null);
    try {
      await upgradeToEmailAccount(email, password);
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
      setMode("none");
      setPassword("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível concluir.");
    } finally {
      setBusy(false);
    }
  };

  const logout = async () => {
    await signOutNorte();
    window.location.href = "/";
  };

  return (
    <section>
      <SectionHeader icon={ShieldCheck} title="Conta e segurança" />
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
              <Row label="Alterar senha" onClick={() => setMode("password")} />
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
                    disabled={busy || password.length < 6}
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

        <div className="p-3.5">
          {isAnonymous && (
            <p className="mb-2 text-[11px] text-warning">
              Sem e-mail cadastrado, sair da conta apaga o acesso aos seus dados neste dispositivo.
            </p>
          )}
          <button onClick={logout} className="text-sm font-semibold text-danger">
            Sair da conta
          </button>
        </div>

        <div className="p-3.5">
          {mode !== "delete" ? (
            <button onClick={() => setMode("delete")} className="text-xs text-muted-foreground">
              Excluir minha conta
            </button>
          ) : (
            <DeleteAccountConfirm
              confirmText={confirmText}
              setConfirmText={setConfirmText}
              onCancel={() => setMode("none")}
            />
          )}
        </div>
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
  return (
    <section>
      <SectionHeader icon={Lock} title="Dados e privacidade" />
      <div className="mt-2 card-surface p-3.5 text-xs text-muted-foreground">
        <p>
          Seus dados (planos, execuções, registros das sub-agendas, hidratação e perfil) ficam
          vinculados só à sua conta, protegidos por autenticação e por políticas de acesso que
          garantem que ninguém além de você lê ou grava neles.
        </p>
        <p className="mt-2">Pra apagar tudo, use "Excluir minha conta" em Conta e segurança.</p>
      </div>
    </section>
  );
}
