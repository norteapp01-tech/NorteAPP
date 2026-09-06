import {
  Dumbbell,
  BookOpen,
  Salad,
  Wallet,
  HandHeart,
  Briefcase,
  Sparkles,
  type LucideIcon,
} from "lucide-react";

/** Ícone outline (lucide) por categoria — só para as duas telas de planejamento
 * redesenhadas (a spec pede ícones exclusivamente outline, sem emoji, nesses
 * lugares). Não substitui `categoryMeta.emoji`, que continua servindo o resto
 * do app (badges de tarefa, sub-agendas etc.) fora do escopo desta mudança. */
const categoryIconMap: Record<string, LucideIcon> = {
  academia: Dumbbell,
  leitura: BookOpen,
  alimentacao: Salad,
  financas: Wallet,
  fe: HandHeart,
  trabalho: Briefcase,
  generico: Sparkles,
};

export function CategoryIcon({
  category,
  className = "h-4 w-4",
}: {
  category: string;
  className?: string;
}) {
  const Icon = categoryIconMap[category] ?? Sparkles;
  return <Icon className={className} strokeWidth={2} />;
}
