import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Undo2, X } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { scopeLabels, type EditScope } from "@/lib/agenda-recurrence";
import type { Result } from "@/lib/agenda-series-store";

// ---------------------------------------------------------------------------
// Feedback da Agenda: desfazer depois de uma ação importante e a pergunta de
// escopo ("só esta / esta e as próximas / toda a série").
// ---------------------------------------------------------------------------

const TOAST_MS = 7000;

type Toast = { id: number; message: string; undo?: () => Promise<void>; error?: boolean };
type ScopeRequest = {
  verb: string;
  allowThis: boolean;
  resolve: (scope: EditScope | null) => void;
};

type FeedbackApi = {
  /** Roda a ação e mostra "Desfazer" quando ela devolve como desfazer. */
  run: (message: string, action: () => Promise<Result | void>) => Promise<boolean>;
  askScope: (verb: string, options?: { allowThis?: boolean }) => Promise<EditScope | null>;
  notify: (message: string) => void;
  /** Aviso de erro (borda vermelha), sem ação de desfazer. */
  notifyError: (message: string) => void;
};

const FeedbackContext = createContext<FeedbackApi | null>(null);

export function useAgendaFeedback(): FeedbackApi {
  const ctx = useContext(FeedbackContext);
  if (!ctx) throw new Error("useAgendaFeedback precisa estar dentro de AgendaFeedbackProvider.");
  return ctx;
}

export function AgendaFeedbackProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<Toast | null>(null);
  const [scope, setScope] = useState<ScopeRequest | null>(null);
  const counter = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback((next: Omit<Toast, "id">) => {
    if (timer.current) clearTimeout(timer.current);
    const id = ++counter.current;
    setToast({ id, ...next });
    timer.current = setTimeout(() => setToast((t) => (t?.id === id ? null : t)), TOAST_MS);
  }, []);

  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  const run = useCallback<FeedbackApi["run"]>(
    async (message, action) => {
      try {
        const result = await action();
        show({ message, undo: result ? result.undo : undefined });
        return true;
      } catch (error) {
        show({
          message: error instanceof Error ? error.message : "Não foi possível concluir.",
          error: true,
        });
        return false;
      }
    },
    [show],
  );

  const askScope = useCallback<FeedbackApi["askScope"]>(
    (verb, options) =>
      new Promise((resolve) => setScope({ verb, allowThis: options?.allowThis ?? true, resolve })),
    [],
  );

  const notify = useCallback((message: string) => show({ message }), [show]);
  const notifyError = useCallback((message: string) => show({ message, error: true }), [show]);

  const api = useMemo(
    () => ({ run, askScope, notify, notifyError }),
    [run, askScope, notify, notifyError],
  );

  return (
    <FeedbackContext.Provider value={api}>
      {children}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="agenda-toast"
          data-error={toast.error ? "true" : undefined}
        >
          <span className="min-w-0 flex-1 text-sm">{toast.message}</span>
          {toast.undo && (
            <button
              type="button"
              onClick={async () => {
                const undo = toast.undo!;
                setToast(null);
                try {
                  await undo();
                } catch {
                  show({ message: "Não foi possível desfazer.", error: true });
                }
              }}
              className="interactive-press flex min-h-9 shrink-0 items-center gap-1 rounded-full px-3 text-sm font-semibold text-primary"
            >
              <Undo2 className="h-3.5 w-3.5" /> Desfazer
            </button>
          )}
          <button
            type="button"
            onClick={() => setToast(null)}
            aria-label="Fechar aviso"
            className="flex h-9 w-9 shrink-0 items-center justify-center text-muted-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
      {scope && (
        <Modal
          onClose={() => {
            scope.resolve(null);
            setScope(null);
          }}
          title="Este compromisso se repete"
        >
          <p className="text-sm text-muted-foreground">O que você quer {scope.verb}?</p>
          <div className="mt-4 space-y-2">
            {(["this", "following", "all"] as EditScope[])
              .filter((option) => option !== "this" || scope.allowThis)
              .map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => {
                    scope.resolve(option);
                    setScope(null);
                  }}
                  className="card-surface-quiet interactive-press flex min-h-12 w-full items-center px-4 text-left text-sm font-medium"
                >
                  {scopeLabels[option]}
                </button>
              ))}
          </div>
        </Modal>
      )}
    </FeedbackContext.Provider>
  );
}
