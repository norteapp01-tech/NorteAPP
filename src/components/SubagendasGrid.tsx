import { Link } from "@tanstack/react-router";
import {
  Dumbbell,
  BookOpen,
  Salad,
  Wallet,
  HandHeart,
  Footprints,
  type LucideIcon,
  ChevronRight,
} from "lucide-react";
import { categoryMeta } from "@/lib/mock-data";

/** Categorias que representam módulos pessoais de rotina — Trabalho e Geral continuam
 * existindo no domínio (tarefas/planos/registros podem usá-las), só não aparecem aqui
 * como "módulo dedicado" nessa faixa. */
const routineCategories = ["academia", "esportes", "leitura", "alimentacao", "financas", "fe"];

/** Ícones lucide (consistentes com o resto do app) só pra essa faixa compacta — o
 * emoji de categoryMeta continua sendo a fonte usada em badges/cards em outras telas,
 * não é substituído, só não é o ideal pra um círculo de ícone pequeno e uniforme. */
const routineIcons: Record<string, LucideIcon> = {
  academia: Dumbbell,
  esportes: Footprints,
  leitura: BookOpen,
  alimentacao: Salad,
  financas: Wallet,
  fe: HandHeart,
};

const routineVisuals: Record<string, { image?: string; detail: string }> = {
  academia: { image: "/images/home/routine-academia.jpg", detail: "Treino de hoje" },
  leitura: { image: "/images/home/routine-leitura.jpg", detail: "Continuar leitura" },
  alimentacao: { image: "/images/home/routine-alimentacao.jpg", detail: "Refeições de hoje" },
  esportes: { detail: "Visão geral" },
  financas: { detail: "Resumo do mês" },
  fe: { detail: "Seu espaço" },
};

/** Faixa horizontal de sub-agendas ("Minha rotina") — usada na Hoje. Fonte única, não duplicar. */
export function SubagendasGrid() {
  return (
    <div className="routine-rail -mx-5 overflow-x-auto px-5 no-scrollbar">
      <div className="flex min-w-max gap-3 pb-1">
        {Object.entries(categoryMeta)
          .filter(([key]) => routineCategories.includes(key))
          .map(([key, m]) => {
            const Icon = routineIcons[key];
            const visual = routineVisuals[key];
            return (
              <Link
                key={key}
                to="/sub-agenda/$categoria"
                params={{ categoria: key }}
                className={`routine-card interactive-press relative h-[154px] w-[232px] shrink-0 overflow-hidden text-left ${visual?.image ? "routine-card-image" : "routine-card-plain"}`}
              >
                {visual?.image && (
                  <img
                    src={visual.image}
                    alt=""
                    className="absolute inset-0 h-full w-full object-cover"
                  />
                )}
                <span className="routine-card-shade absolute inset-0" aria-hidden="true" />
                {!visual?.image && Icon && (
                  <Icon
                    className="absolute right-5 top-5 h-16 w-16 text-foreground/10"
                    strokeWidth={1.1}
                  />
                )}
                <span className="absolute inset-x-0 bottom-0 flex items-end gap-3 p-4">
                  <span className="min-w-0 flex-1">
                    <strong className="block text-[17px] font-semibold tracking-[-0.02em] text-white">
                      {m.label}
                    </strong>
                    <small className="mt-0.5 block truncate text-xs text-white/65">
                      {visual?.detail}
                    </small>
                  </span>
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-white/20 bg-black/25 text-white backdrop-blur-sm">
                    <ChevronRight className="h-4 w-4" />
                  </span>
                </span>
              </Link>
            );
          })}
      </div>
    </div>
  );
}
