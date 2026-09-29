import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type AnimationEvent,
  type ReactNode,
} from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { ChevronLeft, X } from "lucide-react";
import { cn } from "@/lib/utils";

/** Fecha em duas etapas.
 *
 * Antes, `open` era fixo em `true` e o pai removia o componente da árvore no
 * mesmo instante do `onClose` — então `data-[state=closed]` nunca chegava a
 * ser aplicado e toda a animação de saída declarada nas classes era código
 * morto: o modal sumia de uma vez, sem acabamento.
 *
 * Agora o `open` é interno: fechar coloca em `false` (o Radix aplica o
 * estado fechado e roda a animação) e só no fim avisamos o pai pra
 * desmontar. Os ~40 call sites continuam com `{condicao && <Modal/>}`.
 *
 * Duas salvaguardas, porque "o modal não fecha" seria pior que não ter
 * animação: `animationend` pode não disparar (ambiente sem as animações
 * carregadas), então há um tempo-limite; e a regra de redução de movimento
 * usa duração 1ms em vez de `none`, justamente pra que o evento continue
 * acontecendo. */
const EXIT_FALLBACK_MS = 400;

function useExitBeforeUnmount(onClose: () => void) {
  const [open, setOpen] = useState(true);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const requestClose = useCallback(() => {
    setOpen((wasOpen) => {
      if (!wasOpen) return wasOpen;
      timer.current = setTimeout(onClose, EXIT_FALLBACK_MS);
      return false;
    });
  }, [onClose]);

  const onAnimationEnd = useCallback(
    (event: AnimationEvent<HTMLElement>) => {
      if (open || event.target !== event.currentTarget) return;
      if (timer.current) clearTimeout(timer.current);
      onClose();
    },
    [open, onClose],
  );

  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  return { open, requestClose, onAnimationEnd };
}

/**
 * Modal centralizado padrão do app — substitui os bottom sheets presos ao
 * rodapé/esquerda que existiam espalhados por Leitura/Academia/Alimentação/Fé/
 * Finanças/Hidratação. Construído sobre @radix-ui/react-dialog, que já resolve
 * de graça: portal (posição nunca é afetada pelo container pai), Escape,
 * clique fora, bloqueio de scroll da página, foco inicial + trap de Tab, e
 * `aria-modal`/`role="dialog"`.
 *
 * Os componentes que usam isso continuam montando/desmontando via
 * `{condicao && <Algo onClose={...} />}` (mesmo padrão de sempre) — o estado
 * de aberto é interno (ver `useExitBeforeUnmount`), e `onClose` só é chamado
 * depois que a animação de saída termina, pra o pai desmontar aí. `onClose`
 * chega por Escape/clique fora/X e também deve ser chamado pelos botões de
 * ação do próprio conteúdo.
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
  const { open, requestClose, onAnimationEnd } = useExitBeforeUnmount(onClose);

  return (
    <DialogPrimitive.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) requestClose();
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
          onAnimationEnd={onAnimationEnd}
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
 * Tela cheia sobreposta — para conteúdo que é uma PÁGINA, não um diálogo
 * curto: histórico completo, por exemplo.
 *
 * Mesma base do Modal (Radix Dialog), então Escape, trava de rolagem do fundo,
 * foco inicial e trap de Tab vêm de graça e se comportam igual ao resto do app.
 * O que muda é só a moldura: ocupa a tela inteira, respeita a safe area e traz
 * um cabeçalho com voltar, título e uma ação opcional à direita.
 */
export function FullScreenSheet({
  onClose,
  title,
  action,
  children,
}: {
  onClose: () => void;
  title: ReactNode;
  /** Ação à direita do cabeçalho (ex.: registrar manualmente). */
  action?: ReactNode;
  children: ReactNode;
}) {
  const { open, requestClose, onAnimationEnd } = useExitBeforeUnmount(onClose);

  return (
    <DialogPrimitive.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) requestClose();
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-background data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0" />
        <DialogPrimitive.Content
          onAnimationEnd={onAnimationEnd}
          className="fixed inset-0 z-50 flex flex-col bg-background outline-none duration-(--dur-state) data-[state=open]:animate-in data-[state=open]:slide-in-from-bottom data-[state=closed]:animate-out data-[state=closed]:slide-out-to-bottom"
          style={{
            paddingTop: "env(safe-area-inset-top)",
            paddingBottom: "env(safe-area-inset-bottom)",
          }}
        >
          <div className="flex shrink-0 items-center gap-2 px-4 py-3">
            <DialogPrimitive.Close
              aria-label="Voltar"
              className="-m-2 shrink-0 rounded-full p-2 text-foreground transition-colors hover:bg-surface-2"
            >
              <ChevronLeft className="h-6 w-6" />
            </DialogPrimitive.Close>
            <DialogPrimitive.Title className="min-w-0 flex-1 truncate text-lg font-bold">
              {title}
            </DialogPrimitive.Title>
            {action}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-8">
            {children}
          </div>
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
  const { open, requestClose, onAnimationEnd } = useExitBeforeUnmount(onClose);

  return (
    <DialogPrimitive.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) requestClose();
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-background/85 backdrop-blur-sm data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0" />
        <DialogPrimitive.Content
          onAnimationEnd={onAnimationEnd}
          className={cn(
            "card-surface fixed inset-y-0 right-0 z-50 flex h-full w-[calc(100%-2.5rem)] flex-col rounded-l-3xl rounded-r-none border-r-0 p-5 shadow-2xl outline-none duration-(--dur-state) data-[state=open]:animate-in data-[state=open]:slide-in-from-right data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right",
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
