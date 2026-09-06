import { formatDateBR, type NextAction } from "@/lib/goals-store";

/** Texto curto de "próxima ação" reaproveitado no card Em foco, nas linhas de
 * Outros planos e no módulo Próxima ação do detalhe — mesma fonte
 * (`nextActionForGoal`), só muda a formatação de exibição por contexto. */
export function nextActionLabel(action: NextAction): string {
  if (action.kind === "execution") return action.execution.title;
  if (action.kind === "step") return action.step.title;
  if (action.kind === "define") return "Definir próxima ação";
  return "Sem próxima ação definida";
}

export function nextActionDeadlineLabel(action: NextAction): string | null {
  if (action.kind === "execution") return `Até ${formatDateBR(action.execution.dueDate)}`;
  if (action.kind === "step" && action.step.targetDate)
    return `Até ${formatDateBR(action.step.targetDate)}`;
  return null;
}
