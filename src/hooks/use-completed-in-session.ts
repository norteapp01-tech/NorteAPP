import { useRef } from "react";

/** Verdadeiro só quando o valor virou `true` enquanto este componente estava
 * montado — nunca quando ele já nasce concluído.
 *
 * `check-enter` usa `animation: ... both`, então tocava de novo a cada
 * montagem: refetch depois de salvar, reabrir a tela, rolar uma lista longa.
 * Quem já tinha concluído a tarefa ontem via o "pop" de novo hoje ao abrir o
 * app. Com isto, a animação marca o momento da conclusão, não a renderização. */
export function useCompletedInSession(done: boolean): boolean {
  const previous = useRef(done);
  const happened = useRef(false);
  if (!previous.current && done) happened.current = true;
  if (!done) happened.current = false;
  previous.current = done;
  return happened.current;
}
