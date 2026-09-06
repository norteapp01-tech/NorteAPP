import { lazy, Suspense, useState } from "react";
import { MapPinned, TrendingUp, MoreVertical } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Modal } from "@/components/ui/modal";
import { ChartSkeleton } from "@/components/ui/chart-skeleton";
import { lifeAreas, lifeAreaColor } from "@/lib/mock-data";
import type { Goal } from "@/lib/goals-store";

const PlanProgressChart = lazy(() =>
  import("@/components/PlanProgressChart").then((m) => ({ default: m.PlanProgressChart })),
);

/**
 * Menu de 3 pontos do cabeçalho da lista de planejamento. Não duplica nada:
 * só reabre, sob demanda, os dois blocos que antes ficavam sempre visíveis no
 * corpo da página ("Áreas da vida" e o gráfico de progresso) — mesmos dados,
 * mesma lógica, só o local de montagem muda.
 */
export function PlanMenuSheet({ goals }: { goals: Goal[] }) {
  const [panel, setPanel] = useState<"areas" | "progresso" | null>(null);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            aria-label="Mais opções do planejamento"
            className="flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground hover:bg-surface hover:text-foreground"
          >
            <MoreVertical className="h-5 w-5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setPanel("areas")} className="gap-2">
            <MapPinned className="h-4 w-4" /> Áreas da vida
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setPanel("progresso")} className="gap-2">
            <TrendingUp className="h-4 w-4" /> Ver progresso
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {panel === "areas" && (
        <Modal onClose={() => setPanel(null)} title="Áreas da vida">
          <div className="grid grid-cols-2 gap-2">
            {lifeAreas.map((area) => (
              <div key={area} className="rounded-xl border border-border bg-surface-2 p-3">
                <span
                  className="text-[10px] font-bold uppercase tracking-[0.15em]"
                  style={{ color: lifeAreaColor[area] }}
                >
                  {area}
                </span>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {goals.filter((g) => g.lifeArea === area).length} planej.
                </p>
              </div>
            ))}
          </div>
        </Modal>
      )}

      {panel === "progresso" && (
        <Modal onClose={() => setPanel(null)} title="Progresso dos planejamentos">
          <Suspense fallback={<ChartSkeleton height={220} />}>
            <PlanProgressChart />
          </Suspense>
        </Modal>
      )}
    </>
  );
}
