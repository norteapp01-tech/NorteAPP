import { Link } from "@tanstack/react-router";
import { categoryMeta } from "@/lib/mock-data";

/** Grade de sub-agendas — usada na Linha do tempo e na Hoje. Fonte única, não duplicar. */
export function SubagendasGrid() {
  return (
    <div className="grid grid-cols-2 gap-3">
      {Object.entries(categoryMeta).map(([key, m]) => (
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
