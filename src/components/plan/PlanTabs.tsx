export type PlanTab = "planejamento" | "cronograma" | "evolucao";

const tabLabel: Record<PlanTab, string> = {
  planejamento: "Planejamento",
  cronograma: "Cronograma",
  evolucao: "Evolução",
};

/** Sublinha verde de 2px em vez da cápsula preenchida — sem fundo grande por
 * aba, texto ativo em branco, inativo em cinza, divisória discreta embaixo. */
export function PlanTabs({ tab, onChange }: { tab: PlanTab; onChange: (t: PlanTab) => void }) {
  return (
    <div className="flex border-b border-border">
      {(Object.keys(tabLabel) as PlanTab[]).map((t) => (
        <button
          key={t}
          onClick={() => onChange(t)}
          className={`flex h-[52px] flex-1 items-center justify-center border-b-2 text-[13px] font-semibold transition-colors ${
            tab === t
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground"
          }`}
        >
          {tabLabel[t]}
        </button>
      ))}
    </div>
  );
}
