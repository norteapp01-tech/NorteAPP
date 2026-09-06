import { ChevronLeft, MoreVertical, Info, Link2 } from "lucide-react";
import { CategoryIcon } from "@/components/plan/CategoryIcon";
import { GreenProgressBar } from "@/components/plan/GreenProgressBar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { goalPace, goalProgress, type Goal, type Step, type Execution } from "@/lib/goals-store";

const trackingTypeLabel = {
  etapas: "Por etapas",
  frequencia: "Por frequência",
  numero: "Por número",
} as const;

/** Cabeçalho do detalhe do plano — o rótulo central é `lifeArea` (ex.
 * "CARREIRA"), não `categoryMeta[category].label`: o ícone continua vindo da
 * categoria (lifeArea não tem mapa de ícone próprio), mas o texto precisa
 * bater com a área da vida, que é o dado que a referência visual mostra. */
export function PlanHeader({
  goal,
  allSteps,
  allExecutions,
  hasDetails,
  onBack,
  onShowDetails,
  onLinkAction,
}: {
  goal: Goal;
  allSteps: Step[];
  allExecutions: Execution[];
  hasDetails: boolean;
  onBack: () => void;
  onShowDetails: () => void;
  onLinkAction: () => void;
}) {
  const progress = goalProgress(goal, allSteps, allExecutions);
  const pace = goalPace(goal, allSteps, allExecutions);
  const paceColor =
    pace === "behind" ? "text-danger" : pace === "ahead" ? "text-warning" : "text-primary";

  return (
    <div>
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          aria-label="Voltar para a lista de planos"
          className="-ml-2 flex h-11 w-11 items-center justify-center rounded-full text-foreground hover:bg-surface"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <p className="flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">
          <CategoryIcon category={goal.category} className="h-3.5 w-3.5" />
          {goal.lifeArea}
        </p>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              aria-label="Mais opções do planejamento"
              className="-mr-2 flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground hover:bg-surface hover:text-foreground"
            >
              <MoreVertical className="h-5 w-5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem disabled={!hasDetails} onSelect={onShowDetails} className="gap-2">
              <Info className="h-4 w-4" /> Detalhes do plano
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onLinkAction} className="gap-2">
              <Link2 className="h-4 w-4" /> Vincular ação existente
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="mt-4 flex items-start justify-between gap-3">
        <h1 className="text-[28px] font-bold leading-tight tracking-tight text-balance-tight">
          {goal.title}
        </h1>
        <span className={`mt-1 shrink-0 text-[21px] font-bold ${paceColor}`}>{progress}%</span>
      </div>
      <p className="mt-1 text-[14px] text-muted-foreground">
        {trackingTypeLabel[goal.trackingType]}
        {goal.deadlineLabel ? ` · Prazo ${goal.deadlineLabel}` : ""}
      </p>
      <GreenProgressBar pct={progress} className="mt-3 h-1.5" />
    </div>
  );
}
