import { useState } from "react";
import { Compass, ChevronRight } from "lucide-react";
import { Modal } from "@/components/ui/modal";

/**
 * Entrada compacta pra "Orientações para meu plano" — nesta V1 não existe
 * motor de sugestões nenhum, então não fabrico um contador (badge com um
 * número inventado seria dado mockado). O toque só explica o que vem a
 * seguir, sem iniciar perguntas nem alterar nada.
 */
export function GuidanceEntry() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex h-16 w-full items-center gap-3 rounded-2xl px-1 text-left"
      >
        <Compass className="h-5 w-5 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold leading-snug">Orientações para meu plano</p>
          <p className="text-[12px] text-muted-foreground">
            Em breve, ajuda pra dividir etapas e organizar prazos
          </p>
        </div>
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
      </button>

      {open && (
        <Modal onClose={() => setOpen(false)} title="Orientações para meu plano">
          <p className="text-sm text-balance-tight text-muted-foreground">
            Em breve, o Norte ajudará você a dividir etapas, definir ações e organizar prazos.
          </p>
          <button
            onClick={() => setOpen(false)}
            className="mt-4 w-full rounded-xl bg-primary py-2.5 text-sm font-semibold text-primary-foreground"
          >
            Entendi
          </button>
        </Modal>
      )}
    </>
  );
}
