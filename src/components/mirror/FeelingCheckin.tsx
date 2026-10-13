import { useState } from "react";
import { setExecutionFeeling, type Feeling } from "@/lib/goals-store";

const OPTIONS: { value: Feeling; label: string }[] = [
  { value: "leve", label: "Leve" },
  { value: "neutro", label: "Neutro" },
  { value: "pesado", label: "Pesado" },
];

/** "Como foi?" — três toques, sempre opcional. Tocar de novo na resposta a apaga. */
export function FeelingCheckin({
  executionId,
  value,
  compact,
}: {
  executionId: string;
  value?: Feeling;
  compact?: boolean;
}) {
  const [pending, setPending] = useState<Feeling | null | undefined>(undefined);
  const [failed, setFailed] = useState(false);
  const shown = pending === undefined ? value : (pending ?? undefined);

  const choose = async (next: Feeling) => {
    const target = shown === next ? null : next;
    setPending(target);
    setFailed(false);
    try {
      await setExecutionFeeling(executionId, target);
    } catch {
      setPending(undefined);
      setFailed(true);
    }
  };

  return (
    <div role="group" aria-label="Como foi?" className="flex items-center gap-2">
      {!compact && <span className="text-xs text-muted-foreground">Como foi?</span>}
      <div className="flex gap-1.5">
        {OPTIONS.map((o) => (
          <button
            key={o.value}
            type="button"
            aria-pressed={shown === o.value}
            onClick={() => void choose(o.value)}
            className={`interactive-press min-h-8 rounded-full border px-3 text-xs font-semibold ${
              shown === o.value
                ? "border-primary/60 bg-primary/15 text-primary"
                : "border-border text-muted-foreground"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
      {failed && <span className="text-[11px] text-danger">Não salvou. Tente de novo.</span>}
    </div>
  );
}
