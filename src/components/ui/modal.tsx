import type { ReactNode } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Modal centralizado padrão do app — substitui os bottom sheets presos ao
 * rodapé/esquerda que existiam espalhados por Leitura/Academia/Alimentação/Fé/
 * Finanças/Hidratação. Construído sobre @radix-ui/react-dialog, que já resolve
 * de graça: portal (posição nunca é afetada pelo container pai), Escape,
 * clique fora, bloqueio de scroll da página, foco inicial + trap de Tab, e
 * `aria-modal`/`role="dialog"`.
 *
 * Os componentes que usam isso continuam montando/desmontando via
 * `{condicao && <Algo onClose={...} />}` (mesmo padrão de sempre) — por isso
 * `open` fica sempre true enquanto o componente existe; fechar = o pai tirar
 * o componente da árvore. `onClose` é chamado tanto por Escape/clique fora/X
 * quanto deve ser chamado manualmente pelos botões de ação do próprio conteúdo.
 */
export function Modal({
  onClose,
  title,
  children,
  footer,
  maxWidthClassName = "max-w-md",
  panelClassName,
  initialFocusRef,
  zIndexClassName = "z-50",
}: {
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  /** Rodapé fixo (fora da área com rolagem) — ex.: botão "Salvar" fixo embaixo. */
  footer?: ReactNode;
  maxWidthClassName?: string;
  panelClassName?: string;
  initialFocusRef?: React.RefObject<HTMLElement | null>;
  /** Só pra empilhar sobre outro overlay full-screen (ex.: Modo Leitura) — padrão z-50. */
  zIndexClassName?: string;
}) {
  return (
    <DialogPrimitive.Root
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className={cn(
            "fixed inset-0 bg-background/85 backdrop-blur-sm data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0",
            zIndexClassName,
          )}
        />
        <DialogPrimitive.Content
          onOpenAutoFocus={(e) => {
            if (initialFocusRef?.current) {
              e.preventDefault();
              initialFocusRef.current.focus();
            }
          }}
          className={cn(
            "card-surface fixed left-1/2 top-1/2 flex max-h-[85dvh] w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-3xl p-5 shadow-2xl outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95",
            zIndexClassName,
            maxWidthClassName,
            panelClassName,
          )}
        >
          <div className="flex shrink-0 items-center justify-between gap-3">
            <DialogPrimitive.Title className="text-lg font-bold text-balance-tight">
              {title}
            </DialogPrimitive.Title>
            <DialogPrimitive.Close
              aria-label="Fechar"
              className="-m-2 shrink-0 rounded-full p-2 text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
            >
              <X className="h-5 w-5" />
            </DialogPrimitive.Close>
          </div>
          <div className="mt-3 min-h-0 flex-1 overflow-y-auto">{children}</div>
          {footer && <div className="mt-4 shrink-0">{footer}</div>}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/**
 * Painel lateral (sidebar sobreposta) — usado pelo painel de Configurações.
 * Mesma base de acessibilidade do Modal, mas encostado na borda direita da
 * tela em vez de centralizado.
 */
export function SidePanel({
  onClose,
  title,
  children,
  widthClassName = "max-w-sm",
}: {
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  widthClassName?: string;
}) {
  return (
    <DialogPrimitive.Root
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-background/85 backdrop-blur-sm data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0" />
        <DialogPrimitive.Content
          className={cn(
            "card-surface fixed inset-y-0 right-0 z-50 flex h-full w-[calc(100%-2.5rem)] flex-col rounded-l-3xl rounded-r-none border-r-0 p-5 shadow-2xl outline-none data-[state=open]:animate-in data-[state=open]:slide-in-from-right data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right",
            widthClassName,
          )}
        >
          <div className="flex shrink-0 items-center justify-between gap-3">
            <DialogPrimitive.Title className="text-lg font-bold text-balance-tight">
              {title}
            </DialogPrimitive.Title>
            <DialogPrimitive.Close
              aria-label="Fechar"
              className="-m-2 shrink-0 rounded-full p-2 text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
            >
              <X className="h-5 w-5" />
            </DialogPrimitive.Close>
          </div>
          <div className="mt-3 min-h-0 flex-1 overflow-y-auto">{children}</div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
