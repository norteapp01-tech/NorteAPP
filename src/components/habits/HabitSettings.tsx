import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/modal";
import { InlineError } from "@/components/ui/inline-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { HabitAutomations } from "./HabitAutomations";
import {
  DEFAULT_PREFERENCES,
  loadHabitPreferences,
  saveHabitPreferences,
  exportHabitData,
  type HabitPreferences,
} from "@/lib/habits/preferences";
import {
  flushHabitOutbox,
  pendingOutbox,
  pendingHabitOperations,
  subscribeOutbox,
  useHabitsCore,
} from "@/lib/habits/store";

export function HabitSettings({ onClose }: { onClose: () => void }) {
  const [settings, setSettings] = useState(DEFAULT_PREFERENCES);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(pendingOutbox);
  const { habits } = useHabitsCore();
  useEffect(() => {
    let active = true;
    loadHabitPreferences()
      .then((v) => {
        if (active) {
          setSettings(v);
          setReady(true);
        }
      })
      .catch(() => active && setError("Não foi possível carregar as preferências."));
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => subscribeOutbox(() => setPending(pendingOutbox())), []);
  async function act(fn: () => Promise<void>) {
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
  const field = (key: keyof HabitPreferences, label: string) => (
    <label className="block text-sm">
      {label}
      <div className="mt-1 flex gap-2">
        <Input
          type="time"
          value={settings[key] ?? ""}
          onChange={(e) => setSettings({ ...settings, [key]: e.target.value || null })}
        />
        <Button
          variant="ghost"
          onClick={() => setSettings({ ...settings, [key]: null })}
          aria-label={`Desativar ${label}`}
        >
          Limpar
        </Button>
      </div>
    </label>
  );
  return (
    <Modal title="Preferências das rotinas" onClose={onClose}>
      <div className="space-y-5">
        {error && <InlineError message={error} />}
        {!ready ? (
          <p role="status">Carregando…</p>
        ) : (
          <>
            <fieldset className="space-y-3">
              <legend className="mb-2 font-semibold">Horário silencioso</legend>
              {field("quiet_start", "Início")}
              {field("quiet_end", "Fim")}
            </fieldset>
            <Button
              disabled={busy}
              className="w-full"
              onClick={() =>
                act(async () => {
                  await saveHabitPreferences(settings);
                  setMessage("Preferências salvas.");
                })
              }
            >
              Salvar
            </Button>
          </>
        )}
        <section className="border-t pt-4 space-y-3">
          <h3 className="font-semibold">Seus dados</h3>
          <p className="text-sm text-muted-foreground" role="status">
            {pending ? `${pending} sincronizações pendentes` : "Tudo sincronizado"}
          </p>
          {pendingHabitOperations()
            .filter((op) => op.kind === "manual")
            .map((op) => (
              <div key={op.ref} className="rounded-xl border p-3 text-sm">
                <strong>
                  {habits.find((h) => h.id === op.input.habitId)?.name ?? "Registro de rotina"}
                </strong>
                <p>
                  {op.input.date} · {op.input.value ?? 0} · aguardando envio
                </p>
                {op.lastError && <p className="text-xs text-muted-foreground">{op.lastError}</p>}
              </div>
            ))}
          <Button
            variant="outline"
            disabled={busy || !pending}
            onClick={() =>
              act(async () => {
                const r = await flushHabitOutbox({ includeStalled: true });
                setPending(r.pending);
                setMessage(
                  r.pending
                    ? `${r.pending} ainda pendentes. Tente quando a conexão voltar.`
                    : "Sincronização concluída.",
                );
              })
            }
          >
            Tentar sincronizar
          </Button>
          <Button
            variant="outline"
            disabled={busy}
            onClick={() =>
              act(async () => {
                const data = await exportHabitData();
                const url = URL.createObjectURL(
                  new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
                );
                const a = document.createElement("a");
                a.href = url;
                a.download = `norte-rotinas-${new Date().toISOString().slice(0, 10)}.json`;
                a.click();
                setTimeout(() => URL.revokeObjectURL(url), 1000);
                setMessage("Exportação preparada.");
              })
            }
          >
            Exportar minhas rotinas
          </Button>
        </section>
        <p role="status" className="text-sm text-primary">
          {message}
        </p>
        <details className="border-t pt-3">
          <summary className="min-h-11 py-3">Atalhos e integrações</summary>
          <HabitAutomations />
        </details>
      </div>
    </Modal>
  );
}
