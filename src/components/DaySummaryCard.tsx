import { useState } from "react";
import { ChevronRight, Lightbulb, Moon, PieChart, RefreshCcw } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Modal } from "@/components/ui/modal";

export type DayInsight = { detail: string; action?: string } | undefined;

/** Card recolhido "Resumo do dia" — reúne Insight do dia, Reorganizar e Fechar o dia
 * num único módulo, em vez das três seções soltas que existiam antes na Hoje. Não
 * duplica lógica nenhuma: os dois botões só abrem o EndOfDayModal já existente
 * (via callbacks recebidos do TodayScreen), e o insight é o mesmo insightsComputed(). */
export function DaySummaryCard({
  insight,
  pendingCount,
  onReorganize,
  onCloseDay,
}: {
  insight: DayInsight;
  pendingCount: number;
  onReorganize: () => void;
  onCloseDay: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="card-surface mt-5 flex min-h-16 w-full items-center gap-4 p-4 text-left hover:border-primary/40"
      >
        <PieChart className="h-6 w-6 shrink-0 text-primary" strokeWidth={1.75} />
        <div className="min-w-0 flex-1">
          <p className="text-base font-medium">Resumo do dia</p>
          <p className="text-[11px] text-muted-foreground">Insight, reorganizar e fechar o dia</p>
        </div>
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
      </button>

      {open && (
        <Modal onClose={() => setOpen(false)} title="Resumo do dia">
          <div className="space-y-3">
            {insight && (
              <section className="card-surface flex items-start gap-3 border-primary/40 bg-primary/5 p-4">
                <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-primary">
                    Insight do dia
                  </p>
                  <p className="mt-1 text-sm font-medium text-balance-tight">{insight.detail}</p>
                  {insight.action && (
                    <Link
                      to="/dashboard"
                      onClick={() => setOpen(false)}
                      className="mt-2 inline-block text-xs font-semibold text-primary"
                    >
                      {insight.action} →
                    </Link>
                  )}
                </div>
              </section>
            )}

            <button
              onClick={() => {
                setOpen(false);
                onReorganize();
              }}
              className="card-surface flex w-full items-center gap-2.5 p-4 text-left transition-colors hover:border-primary/50"
            >
              <RefreshCcw className="h-4 w-4 text-primary" />
              <div className="min-w-0">
                <p className="text-sm font-semibold">Reorganizar meu dia</p>
                <p className="text-[11px] text-muted-foreground">Seu dia mudou? Ajuste agora.</p>
              </div>
            </button>

            <button
              onClick={() => {
                setOpen(false);
                onCloseDay();
              }}
              className="card-surface flex w-full items-center gap-2.5 p-4 text-left transition-colors hover:border-primary/50"
            >
              <Moon className="h-4 w-4 text-warning" />
              <div className="min-w-0">
                <p className="text-sm font-semibold">Fechar o dia</p>
                <p className="text-[11px] text-muted-foreground">{pendingCount} pendentes.</p>
              </div>
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
