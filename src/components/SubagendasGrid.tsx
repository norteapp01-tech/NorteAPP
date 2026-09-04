import { Link } from "@tanstack/react-router";
import { categoryMeta } from "@/lib/mock-data";

/** Categorias que representam módulos pessoais de rotina — Trabalho e Geral continuam
 * existindo no domínio (tarefas/planos/registros podem usá-las), só não aparecem aqui
 * como "módulo dedicado" nessa grade. */
const routineCategories = ["academia", "leitura", "alimentacao", "financas", "fe"];

/** Grade de sub-agendas ("Minha rotina") — usada na Hoje. Fonte única, não duplicar. */
export function SubagendasGrid() {
  return (
    <div className="grid grid-cols-2 gap-3">
      {Object.entries(categoryMeta)
        .filter(([key]) => routineCategories.includes(key))
        .map(([key, m]) => (
          <Link
            key={key}
            to="/sub-agenda/$categoria"
            params={{ categoria: key }}
            className="card-surface p-4 hover:border-primary/40"
          >
            <div className="text-2xl">{m.emoji}</div>
            <p className="mt-2 font-semibold">{m.label}</p>
            <p className="text-[11px] text-muted-foreground">módulo dedicado</p>
          </Link>
        ))}
    </div>
  );
}
