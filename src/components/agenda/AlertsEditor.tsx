import { useEffect, useState } from "react";
import { Bell, BellOff } from "lucide-react";
import { ALERT_OPTIONS, alertLabel } from "@/lib/agenda-settings";
import { NumberField } from "@/components/ui/number-field";
import { hasPushSubscription } from "@/lib/reminders-store";
import { isPushSupported, pushPermission, registerPush } from "@/lib/push-notifications";
import "./agenda-ui.css";

type PushState = "checking" | "active" | "denied" | "off" | "unsupported";

/** Estado REAL das notificações do aparelho — sem prometer um aviso que o
 * navegador pode não entregar. */
function usePushState(): [PushState, () => Promise<string | null>] {
  const [state, setState] = useState<PushState>("checking");
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!isPushSupported()) return alive && setState("unsupported");
      const permission = pushPermission();
      if (permission === "denied") return alive && setState("denied");
      if (permission !== "granted") return alive && setState("off");
      const subscribed = await hasPushSubscription().catch(() => false);
      if (alive) setState(subscribed ? "active" : "off");
    })();
    return () => {
      alive = false;
    };
  }, []);
  const enable = async () => {
    const result = await registerPush();
    setState(result.ok ? "active" : pushPermission() === "denied" ? "denied" : "off");
    return result.ok ? null : (result.reason ?? "Não foi possível ativar.");
  };
  return [state, enable];
}

const PUSH_TEXT: Record<Exclude<PushState, "checking" | "active">, string> = {
  unsupported: "Este navegador não recebe notificações. O alerta fica registrado, mas não chega.",
  denied:
    "As notificações estão bloqueadas neste aparelho. O alerta fica registrado, mas só chega se você liberar nas configurações do navegador.",
  off: "As notificações deste aparelho ainda não estão ativas. Sem ativar, o alerta fica registrado mas não chega.",
};

/** Zero, um ou vários alertas por compromisso. */
export function AlertsEditor({
  value,
  onChange,
}: {
  value: number[];
  onChange: (alerts: number[]) => void;
}) {
  const [push, enable] = usePushState();
  const [custom, setCustom] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const presets = ALERT_OPTIONS.map((o) => o.minutes);
  const customValues = value.filter((v) => !presets.includes(v));

  const toggle = (minutes: number) =>
    onChange(
      value.includes(minutes)
        ? value.filter((v) => v !== minutes)
        : [...value, minutes].sort((a, b) => a - b),
    );

  return (
    <div className="space-y-3">
      <div className="agenda-chips" role="group" aria-label="Alertas">
        {ALERT_OPTIONS.map((option) => (
          <button
            key={option.minutes}
            type="button"
            aria-pressed={value.includes(option.minutes)}
            className="agenda-chip"
            onClick={() => toggle(option.minutes)}
          >
            {option.label}
          </button>
        ))}
        {customValues.map((minutes) => (
          <button
            key={minutes}
            type="button"
            aria-pressed
            className="agenda-chip"
            onClick={() => toggle(minutes)}
            aria-label={`Remover alerta: ${alertLabel(minutes)}`}
          >
            {alertLabel(minutes)} ×
          </button>
        ))}
        <button
          type="button"
          className="agenda-chip"
          aria-expanded={custom !== null}
          onClick={() => setCustom((c) => (c === null ? 15 : null))}
        >
          Personalizado
        </button>
      </div>

      {custom !== null && (
        <div className="flex items-center gap-2 text-sm">
          <NumberField
            integer
            value={custom}
            min={0}
            aria-label="Minutos antes"
            onValue={(n) => setCustom(Math.max(0, n))}
            className="w-20 rounded-lg border border-border bg-surface px-2 py-2 text-center text-sm outline-none focus:border-primary"
          />
          <span>minutos antes</span>
          <button
            type="button"
            onClick={() => {
              if (!value.includes(custom)) toggle(custom);
              setCustom(null);
            }}
            className="interactive-press ml-auto min-h-10 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground"
          >
            Adicionar
          </button>
        </div>
      )}

      {value.length > 0 && push !== "checking" && push !== "active" && (
        <div className="flex items-start gap-2 rounded-xl border border-warning/40 bg-warning/5 p-3 text-xs">
          <BellOff className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          <div>
            <p>{PUSH_TEXT[push]}</p>
            {push === "off" && (
              <button
                type="button"
                onClick={async () => setError(await enable())}
                className="mt-2 min-h-9 font-semibold text-primary"
              >
                Ativar notificações neste aparelho
              </button>
            )}
            {error && <p className="mt-1 text-danger">{error}</p>}
          </div>
        </div>
      )}
      {value.length > 0 && push === "active" && (
        <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Bell className="h-3.5 w-3.5 text-success" /> Notificações ativas neste aparelho.
        </p>
      )}
    </div>
  );
}
