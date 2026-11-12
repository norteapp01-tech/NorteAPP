import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InlineError } from "@/components/ui/inline-error";
import { supabase } from "@/lib/supabase/client";
import { useHabitsCore } from "@/lib/habits/store";

type Key = {
  id: string;
  name: string;
  habit_id: string;
  can_log: boolean;
  expires_at: string;
  revoked_at: string | null;
};
export function HabitAutomations() {
  const { habits } = useHabitsCore();
  const [keys, setKeys] = useState<Key[]>([]);
  const [name, setName] = useState("");
  const [habit, setHabit] = useState("");
  const [write, setWrite] = useState(false);
  const [token, setToken] = useState("");
  const [tokenCanLog, setTokenCanLog] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function reload() {
    const result = await supabase
      .from("norte_automation_keys")
      .select("id,name,habit_id,can_log,expires_at,revoked_at")
      .is("revoked_at", null)
      .order("created_at", { ascending: false });
    if (result.error) throw new Error(result.error.message);
    setKeys(result.data as Key[]);
  }
  useEffect(() => {
    void reload().catch(() => setError("Não foi possível carregar as automações."));
  }, []);
  async function run(fn: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível concluir.");
    } finally {
      setBusy(false);
    }
  }
  const url = `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/rpc/norte_habit_automation`;
  return (
    <section className="space-y-3">
      <h3 className="font-semibold">Atalhos e automações HTTP</h3>
      {error && <InlineError message={error} />}
      {keys.map((k) => (
        <div className="rounded-xl border p-3 space-y-2" key={k.id}>
          <strong>{k.name}</strong>
          <p className="text-xs text-muted-foreground">
            {k.can_log ? "Registrar e consultar" : "Só consulta"} · até{" "}
            {new Date(k.expires_at).toLocaleDateString("pt-BR")}
          </p>
          <Button
            variant="outline"
            disabled={busy}
            onClick={() =>
              run(async () => {
                const r = await supabase.rpc("norte_manage_automation", {
                  p_action: "revoke",
                  p_data: { id: k.id },
                });
                if (r.error) throw new Error(r.error.message);
                setToken("");
                await reload();
                setMessage("Chave revogada.");
              })
            }
          >
            Revogar
          </Button>
        </div>
      ))}
      <details>
        <summary className="min-h-11 py-3">Criar chave de acesso</summary>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              const r = await supabase.rpc("norte_manage_automation", {
                p_action: "create",
                p_data: { name, habit_id: habit, can_log: write },
              });
              if (r.error) throw new Error(r.error.message);
              setToken((r.data as { token: string }).token);
              setTokenCanLog(write);
              await reload();
            });
          }}
        >
          <label className="block text-sm">
            Nome
            <Input
              required
              maxLength={60}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Atalho de leitura"
            />
          </label>
          <label className="block text-sm">
            Rotina permitida
            <select
              required
              className="mt-1 min-h-11 w-full rounded-xl border bg-background p-2"
              value={habit}
              onChange={(e) => setHabit(e.target.value)}
            >
              <option value="">Escolher rotina</option>
              {habits
                .filter((h) => !h.archivedAt)
                .map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.name}
                  </option>
                ))}
            </select>
          </label>
          <label className="flex min-h-11 gap-2 items-center text-sm">
            <input type="checkbox" checked={write} onChange={(e) => setWrite(e.target.checked)} />
            Permitir registrar valores
          </label>
          <Button disabled={busy || !habit}>Criar chave · 90 dias</Button>
        </form>
      </details>
      {token && (
        <div className="space-y-3 rounded-xl border p-3">
          <p className="text-sm">Chave criada. Ela será mostrada apenas agora.</p>
          <Input readOnly type="password" aria-label="Chave de automação" value={token} />
          <Button
            variant="outline"
            onClick={() =>
              run(async () => {
                await navigator.clipboard.writeText(token);
                setMessage("Chave copiada.");
              })
            }
          >
            Copiar chave
          </Button>
          <Button
            variant="outline"
            onClick={() =>
              run(async () => {
                await navigator.clipboard.writeText(
                  JSON.stringify(
                    {
                      url,
                      method: "POST",
                      headers: {
                        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
                        "Content-Type": "application/json",
                      },
                      body: {
                        p_token: token,
                        p_action: tokenCanLog ? "log" : "read",
                        p_data: tokenCanLog
                          ? {
                              request_id: crypto.randomUUID(),
                              value: 1,
                              time_zone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                            }
                          : {},
                      },
                    },
                    null,
                    2,
                  ),
                );
                setMessage("Exemplo copiado.");
              })
            }
          >
            Copiar exemplo HTTP
          </Button>
        </div>
      )}
      <details className="text-sm text-muted-foreground">
        <summary className="min-h-11 py-3">Usar no Atalhos do iPhone</summary>
        <ol className="list-decimal space-y-2 pl-5">
          <li>Crie uma chave para a rotina desejada e copie o exemplo HTTP.</li>
          <li>
            No Atalhos, adicione “Obter Conteúdo de URL”. Use a URL, POST, os cabeçalhos e o corpo
            JSON do exemplo.
          </li>
          <li>
            Para registrar, ajuste value na unidade da rotina (minutos para duração). Gere um UUID
            em request_id a cada novo registro. Reuse esse ID apenas para repetir uma tentativa.
          </li>
          <li>
            Execute o atalho. Depois você pode associá-lo a uma automação NFC no próprio Atalhos.
          </li>
        </ol>
        <p className="mt-2">
          A chave dá acesso apenas à rotina escolhida. Revogue-a se deixar de usar a automação.
        </p>
      </details>
      <p role="status" className="text-sm text-primary">
        {message}
      </p>
    </section>
  );
}
