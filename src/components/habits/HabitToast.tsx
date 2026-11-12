import { createPortal } from "react-dom";
import { X } from "lucide-react";

export type ToastState = { message: string; undo?: () => Promise<unknown>; error?: boolean } | null;

/** Aviso com "Desfazer". Vai para o <body>: dentro da página, a animação de
 * entrada (transform) faria o `position: fixed` ficar preso ao conteúdo. */
export function HabitToast({
  toast,
  onClose,
  onUndoError,
}: {
  toast: ToastState;
  onClose: () => void;
  onUndoError: (message: string) => void;
}) {
  if (!toast || typeof document === "undefined") return null;
  return createPortal(
    <div
      role={toast.error ? "alert" : "status"}
      className={`habit-toast ${toast.error ? "is-error" : ""}`}
    >
      <span className="min-w-0 flex-1">{toast.message}</span>
      {toast.undo && (
        <button
          onClick={async () => {
            const undo = toast.undo;
            onClose();
            try {
              const report = (await undo?.()) as { alreadySent?: number } | undefined;
              if (report?.alreadySent)
                onUndoError("Desfeito. Um lembrete que já foi enviado não pode ser recolhido.");
            } catch (e) {
              onUndoError(e instanceof Error ? e.message : "Não foi possível desfazer.");
            }
          }}
          className="min-h-11 px-2 font-semibold text-primary"
        >
          Desfazer
        </button>
      )}
      <button
        onClick={onClose}
        aria-label="Fechar aviso"
        className="grid h-11 w-11 place-items-center"
      >
        <X className="h-4 w-4" />
      </button>
    </div>,
    document.body,
  );
}
