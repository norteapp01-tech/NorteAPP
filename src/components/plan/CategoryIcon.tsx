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

/** Ícone outline oficial por categoria, usado em toda a interface. */
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
