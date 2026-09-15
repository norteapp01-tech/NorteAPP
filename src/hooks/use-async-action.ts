import { useCallback, useRef, useState } from "react";

/** Guarda + estado de erro pra qualquer ação que escreve no servidor.
 *
 * Existia em três formas ligeiramente diferentes espalhadas pelo app
 * (`ActionRow.run`, o `if (finishingSession) return` da Academia, o
 * `savingMood` do Hoje) e faltava justamente nos toques mais repetidos —
 * concluir tarefa, registrar série, salvar refeição — onde um toque duplo
 * rápido disparava duas escritas.
 *
 * A trava é um ref (síncrona), não estado: dois toques no mesmo frame não
 * enxergariam a atualização de estado a tempo. */
export function useAsyncAction() {
  const lock = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async (fn: () => Promise<unknown>) => {
    if (lock.current) return;
    lock.current = true;
    setPending(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível salvar.");
    } finally {
      lock.current = false;
      setPending(false);
    }
  }, []);

  const clearError = useCallback(() => setError(null), []);

  return { run, pending, error, clearError };
}
