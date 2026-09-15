import { useEffect, useState } from "react";
import { useProfile, updateProfile } from "@/lib/profile-store";
import { supabase, useAuthUser } from "@/lib/supabase/client";

export function ProfileEditor() {
  const profile = useProfile();
  const user = useAuthUser();
  const [name, setName] = useState("");
  const [birth, setBirth] = useState("");
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const avatar = profile.avatarPath
    ? supabase.storage.from("avatars").getPublicUrl(profile.avatarPath).data.publicUrl
    : user?.avatar;
  useEffect(() => {
    if (!dirty) {
      setName(profile.displayName ?? user?.name ?? "");
      setBirth(profile.birthDate ?? "");
    }
  }, [profile.displayName, profile.birthDate, user?.name, dirty]);
  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      await updateProfile({ displayName: name.trim() || null, birthDate: birth || null });
      setDirty(false);
      setMessage("Perfil atualizado.");
    } catch {
      setMessage("Não foi possível salvar. Seus dados preenchidos foram preservados.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={save} className="space-y-5">
      <div className="flex items-center gap-4">
        {avatar ? (
          <img src={avatar} alt="Sua foto" className="h-16 w-16 rounded-full object-cover" />
        ) : (
          <span className="grid h-16 w-16 place-items-center rounded-full bg-surface-2 text-xl">
            {(name || user?.email || "N").slice(0, 1).toUpperCase()}
          </span>
        )}
        <label className="cursor-pointer text-sm text-primary">
          Alterar foto
          <input
            disabled={busy}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={async (event) => {
              const file = event.target.files?.[0];
              if (!file || !user) return;
              if (
                file.size > 5 * 1024 * 1024 ||
                !["image/jpeg", "image/png", "image/webp"].includes(file.type)
              ) {
                setMessage("Escolha uma imagem JPG, PNG ou WebP de até 5 MB.");
                return;
              }
              setBusy(true);
              setMessage("");
              try {
                const path =
                  user.id + "/avatar-" + crypto.randomUUID() + "." + file.type.split("/")[1];
                const { error } = await supabase.storage.from("avatars").upload(path, file);
                if (error) throw error;
                await updateProfile({ avatarPath: path });
                setMessage("Foto atualizada.");
              } catch {
                setMessage("Não foi possível atualizar a foto. Tente novamente.");
              } finally {
                setBusy(false);
              }
            }}
          />
        </label>
      </div>
      <label className="block text-sm">
        Nome
        <input
          required
          maxLength={100}
          value={name}
          onChange={(e) => {
            setDirty(true);
            setName(e.target.value);
          }}
          autoComplete="name"
          className="mt-2 w-full rounded-xl border border-border bg-surface p-3"
        />
      </label>
      <div className="text-sm">
        <p>E-mail da conta</p>
        <p className="mt-2 break-all text-muted-foreground">
          {user?.email ?? "Conta de demonstração"}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Para alterar, acesse Conta e segurança.
        </p>
      </div>
      <label className="block text-sm">
        Data de nascimento <span className="text-muted-foreground">(opcional)</span>
        <input
          type="date"
          max={new Date().toLocaleDateString("en-CA")}
          value={birth}
          onChange={(e) => {
            setDirty(true);
            setBirth(e.target.value);
          }}
          className="mt-2 w-full rounded-xl border border-border bg-surface p-3"
        />
      </label>
      <p role="status" className="text-sm text-muted-foreground">
        {message}
      </p>
      <div className="flex gap-3">
        <button
          disabled={busy || !name.trim()}
          className="interactive-press flex-1 rounded-xl bg-primary p-3 font-semibold text-primary-foreground disabled:opacity-50"
        >
          {busy ? "Salvando…" : "Salvar"}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            setDirty(false);
            setName(profile.displayName ?? user?.name ?? "");
            setBirth(profile.birthDate ?? "");
            setMessage("");
          }}
          className="rounded-xl border border-border px-4 text-sm"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}
