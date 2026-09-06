import { useState } from "react";
import { ChevronDown, ChevronUp, Calendar } from "lucide-react";
import { formatDateShortBR, type Execution, type Step } from "@/lib/goals-store";

/** Ações que ainda não têm intervalo planejado — ficam fora do painel visual
 * (não inventamos uma duração pra elas) até o usuário definir um período
 * tocando aqui. Recolhida por padrão; some inteiramente se não houver nenhuma. */
export function UnscheduledDrawer({
  executions,
  steps,
  onOpen,
}: {
  executions: Execution[];
  steps: Step[];
  onOpen: (e: Execution) => void;
}) {
  const [open, setOpen] = useState(false);
  if (executions.length === 0) return null;

  return (
    <div className="mt-4 rounded-2xl border border-border bg-surface p-3">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between"
      >
        <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
          Ações sem data · {executions.length}
        </span>
        {open ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        )}
      </button>
      {open && (
        <div className="mt-2.5 space-y-1.5">
          {executions.map((e) => {
            const step = steps.find((s) => s.id === e.stepId);
            return (
              <button
                key={e.id}
                onClick={() => onOpen(e)}
                className="flex w-full items-center gap-2.5 rounded-lg border border-border bg-surface-2 p-2.5 text-left hover:border-primary/40"
              >
                <Calendar className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium">{e.title}</p>
                  <p className="truncate text-[10px] text-muted-foreground">
                    {step ? step.title : "Sem etapa"} · Até {formatDateShortBR(e.dueDate)}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
