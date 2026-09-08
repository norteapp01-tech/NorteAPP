import { UnderlineTabs } from "@/components/ui/app-design-system";

export type PlanTab = "planejamento" | "cronograma" | "evolucao";

const tabLabel: Record<PlanTab, string> = {
  planejamento: "Planejamento",
  cronograma: "Cronograma",
  evolucao: "Evolução",
};

/** Sublinha verde de 2px em vez da cápsula preenchida — sem fundo grande por
 * aba, texto ativo em branco, inativo em cinza, divisória discreta embaixo. */
export function PlanTabs({ tab, onChange }: { tab: PlanTab; onChange: (t: PlanTab) => void }) {
  const items = (Object.keys(tabLabel) as PlanTab[]).map((key) => ({ key, label: tabLabel[key] }));
  return <UnderlineTabs items={items} value={tab} onChange={onChange} />;
}
