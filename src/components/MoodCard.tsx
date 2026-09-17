import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, SmilePlus } from "lucide-react";

// ---------------------------------------------------------------------------
// "Como você está?" — card recolhido que abre como gaveta no próprio lugar.
//
// Ficava como uma fileira fixa de emojis no topo da Hoje, ocupando a posição
// mais nobre da página para uma ação opcional. Aqui ele só se abre quando a
// pessoa quer registrar, e o emoji escolhido volta discreto para o card
// fechado em vez de virar destaque permanente.
//
// A persistência continua sendo a do perfil (`moodDate`/`moodValue`): este
// componente só apresenta, não guarda uma segunda cópia do estado.
// ---------------------------------------------------------------------------

/** Tempo que a gaveta fica aberta mostrando "salvo" antes de recolher. */
const COLLAPSE_DELAY_MS = 500;

export type MoodOption = { v: string; emoji: string; label: string };

export function MoodCard({
  options,
  value,
  saving,
  onPick,
}: {
  options: readonly MoodOption[];
  /** Humor já registrado para hoje, ou null. */
  value: string | null;
  saving: boolean;
  onPick: (value: string) => Promise<void> | void;
}) {
  const [open, setOpen] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  const registered = options.find((o) => o.v === value);

  const choose = async (option: MoodOption) => {
    await onPick(option.v);
    setJustSaved(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setOpen(false);
      setJustSaved(false);
    }, COLLAPSE_DELAY_MS);
  };

  return (
    <section className="card-surface mt-5 overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex min-h-16 w-full items-center gap-4 p-4 text-left hover:border-primary/40"
      >
        <SmilePlus className="h-6 w-6 shrink-0 text-primary" strokeWidth={1.75} />
        <div className="min-w-0 flex-1">
          <p className="text-base font-medium">Como você está?</p>
          <p className="text-[11px] text-muted-foreground">Registre como está se sentindo hoje</p>
        </div>
        {/* Indicação discreta do que já foi registrado — some do destaque, mas
            não esconde que o dia já tem resposta. */}
        {registered && !open && (
          <span className="shrink-0 text-[11px] text-muted-foreground">
            <span className="mr-1 opacity-80">{registered.emoji}</span>
            {registered.label}
          </span>
        )}
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {/* Gaveta: abre no próprio card, sem modal nem nova página. */}
      <div className="drawer-collapse" data-open={open}>
        <div inert={!open} aria-hidden={!open}>
          <div className="px-4 pb-4">
            <div className="flex items-center justify-between gap-2">
              {options.map((option) => {
                const selected = value === option.v;
                return (
                  <button
                    key={option.v}
                    onClick={() => void choose(option)}
                    disabled={saving}
                    aria-pressed={selected}
                    aria-label={option.label}
                    tabIndex={open ? 0 : -1}
                    className={`mood-control interactive-press flex h-12 flex-1 items-center justify-center rounded-xl border disabled:opacity-60 ${
                      selected
                        ? "border-primary bg-primary/10"
                        : "border-border bg-surface/80 hover:border-muted-foreground"
                    }`}
                  >
                    <span className={`text-xl ${selected ? "" : "opacity-70"}`}>
                      {option.emoji}
                    </span>
                  </button>
                );
              })}
            </div>
            <p
              role="status"
              className={`mt-2 flex items-center gap-1 text-[11px] text-success transition-opacity ${justSaved ? "opacity-100" : "opacity-0"}`}
            >
              <Check className="h-3.5 w-3.5" /> Registrado
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
