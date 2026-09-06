import { useState } from "react";
import { Check, ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react";
import { ActionRow } from "@/components/plan/ActionRow";
import {
  formatDateShortBR,
  removeStep,
  toggleStep,
  type Execution,
  type Goal,
  type Step,
} from "@/lib/goals-store";

type StageState = "done" | "current" | "future";

/**
 * Card recolhível de UMA etapa dentro do "Caminho do plano" — controlado por
 * `isOpen`/`onToggle` (o pai garante que só uma fique aberta por vez).
 * Checkbox só chama `toggleStep`; as ações dentro chamam suas próprias
 * mutations via `ActionRow`, sem duplicar lógica aqui.
 */
export function StageAccordion({
  step,
  goal,
  executions,
  index,
  state,
  isOpen,
  onToggle,
  flashId,
  execRefs,
  nextActionId,
  onCreateAction,
}: {
  step: Step;
  goal: Goal;
  executions: Execution[];
  index: number;
  state: StageState;
  isOpen: boolean;
  onToggle: () => void;
  flashId: string | null;
  execRefs: React.MutableRefObject<Record<string, HTMLElement | null>>;
  nextActionId: string | null;
  onCreateAction: () => void;
}) {
  const [toggling, setToggling] = useState(false);
  const [pendingConfirm, setPendingConfirm] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const doneCount = executions.filter((e) => e.status === "concluida").length;
  const pendingExecs = executions.filter(
    (e) => e.status !== "concluida" && e.status !== "cancelada",
  );

  const doToggle = async () => {
    setToggling(true);
    try {
      await toggleStep(step.id, step.done);
      setPendingConfirm(false);
    } finally {
      setToggling(false);
    }
  };

  const onCheckboxClick = () => {
    if (step.done) {
      void doToggle();
      return;
    }
    if (pendingExecs.length > 0) {
      setPendingConfirm(true);
      return;
    }
    void doToggle();
  };

  return (
    <div className={`card-surface p-4 ${state === "current" ? "border-l-2 border-l-primary" : ""}`}>
      <div className="flex items-start gap-3">
        <button
          disabled={toggling}
          onClick={onCheckboxClick}
          aria-label={step.done ? "Reabrir etapa" : "Concluir etapa"}
          className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border disabled:opacity-60 ${step.done ? "border-primary bg-primary text-primary-foreground" : "border-border bg-surface-2"}`}
        >
          {step.done && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
        </button>
        <button className="min-w-0 flex-1 text-left" onClick={onToggle}>
          <p
            className={`text-[11px] font-bold uppercase tracking-wider ${state === "current" ? "text-primary" : "text-muted-foreground"}`}
          >
            {state === "current" ? "Etapa atual" : `Etapa ${index + 1}`}
          </p>
          <p
            className={`mt-0.5 text-[16px] font-semibold leading-snug ${step.done ? "text-muted-foreground line-through" : ""}`}
          >
            {step.title}
          </p>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            {doneCount} de {executions.length} ações
            {state === "current" && step.targetDate
              ? ` · Até ${formatDateShortBR(step.targetDate)}`
              : ""}
          </p>
        </button>
        <div className="flex shrink-0 items-center gap-2">
          {!confirmRemove ? (
            <button
              onClick={() => setConfirmRemove(true)}
              aria-label="Excluir etapa"
              className="flex h-8 w-8 items-center justify-center text-muted-foreground hover:text-danger"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          ) : (
            <div className="flex items-center gap-1">
              <button
                onClick={() => removeStep(step.id)}
                className="rounded-md bg-danger px-1.5 py-1 text-[10px] font-semibold text-white"
              >
                excluir
              </button>
              <button
                onClick={() => setConfirmRemove(false)}
                className="text-[10px] text-muted-foreground"
              >
                cancelar
              </button>
            </div>
          )}
          <button
            onClick={onToggle}
            aria-label={isOpen ? "Recolher etapa" : "Expandir etapa"}
            className="flex h-8 w-8 items-center justify-center text-muted-foreground hover:text-foreground"
          >
            {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {pendingConfirm && (
        <div className="mt-2.5 rounded-lg border border-warning/30 bg-warning/10 p-2.5">
          <p className="text-[11px] text-foreground">
            Esta etapa ainda tem {pendingExecs.length} ações pendentes. O que prefere?
          </p>
          <div className="mt-1.5 flex gap-1.5">
            <button
              onClick={() => setPendingConfirm(false)}
              className="rounded-lg border border-border bg-surface px-2.5 py-1.5 text-[11px] font-semibold"
            >
              Voltar e concluir as ações
            </button>
            <button
              disabled={toggling}
              onClick={doToggle}
              className="rounded-lg bg-warning px-2.5 py-1.5 text-[11px] font-semibold text-background disabled:opacity-50"
            >
              Concluir mesmo assim
            </button>
          </div>
        </div>
      )}

      {isOpen && (
        <div className="animate-in fade-in slide-in-from-top-1 duration-200 motion-reduce:animate-none">
          <div className="mt-3 space-y-2.5 border-t border-border pt-3">
            {executions.length === 0 && (
              <div className="py-1">
                <p className="text-[13px] text-muted-foreground">
                  O que precisa acontecer para concluir esta etapa?
                </p>
                <button
                  onClick={onCreateAction}
                  className="mt-2 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground"
                >
                  Criar primeira ação
                </button>
              </div>
            )}

            {executions.length > 0 && (
              <div className="relative space-y-2 pl-4">
                <div className="absolute bottom-2 left-0 top-2 w-px bg-border" aria-hidden />
                {executions.map((e) => (
                  <div key={e.id} className="relative">
                    <div className="absolute -left-4 top-4 h-px w-3 bg-border" aria-hidden />
                    <div
                      ref={(el) => {
                        execRefs.current[e.id] = el;
                      }}
                    >
                      <ActionRow
                        e={e}
                        allExecutions={executions}
                        highlighted={flashId === e.id}
                        isNext={e.id === nextActionId}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {executions.length > 0 && (
              <button
                onClick={onCreateAction}
                className="flex min-h-11 w-full items-center gap-1.5 border-t border-border pt-3 text-[13px] font-semibold text-primary"
              >
                <Plus className="h-3.5 w-3.5" /> Nova ação
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
