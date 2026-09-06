import { Link } from "@tanstack/react-router";
import { Dumbbell, BookOpen, Salad, Wallet, HandHeart, type LucideIcon } from "lucide-react";
import { categoryMeta } from "@/lib/mock-data";

/** Categorias que representam módulos pessoais de rotina — Trabalho e Geral continuam
 * existindo no domínio (tarefas/planos/registros podem usá-las), só não aparecem aqui
 * como "módulo dedicado" nessa faixa. */
const routineCategories = ["academia", "leitura", "alimentacao", "financas", "fe"];

/** Ícones lucide (consistentes com o resto do app) só pra essa faixa compacta — o
 * emoji de categoryMeta continua sendo a fonte usada em badges/cards em outras telas,
 * não é substituído, só não é o ideal pra um círculo de ícone pequeno e uniforme. */
const routineIcons: Record<string, LucideIcon> = {
  academia: Dumbbell,
  leitura: BookOpen,
  alimentacao: Salad,
  financas: Wallet,
  fe: HandHeart,
};

/** Faixa horizontal de sub-agendas ("Minha rotina") — usada na Hoje. Fonte única, não duplicar. */
export function SubagendasGrid() {
  return (
    <div className="-mx-5 overflow-x-auto px-5">
      <div className="flex gap-3" style={{ width: "max-content" }}>
        {Object.entries(categoryMeta)
          .filter(([key]) => routineCategories.includes(key))
          .map(([key, m]) => {
            const Icon = routineIcons[key];
            return (
              <Link
                key={key}
                to="/sub-agenda/$categoria"
                params={{ categoria: key }}
                className="flex w-[72px] shrink-0 flex-col items-center gap-2 rounded-xl py-1 text-center hover:bg-surface"
              >
                <span className="flex h-14 w-14 items-center justify-center rounded-full border border-border bg-surface-2 text-primary">
                  {Icon && <Icon className="h-6 w-6" strokeWidth={1.75} />}
                </span>
                <span className="text-[11px] font-medium leading-tight text-foreground">
                  {m.label}
                </span>
              </Link>
            );
          })}
      </div>
    </div>
  );
}
