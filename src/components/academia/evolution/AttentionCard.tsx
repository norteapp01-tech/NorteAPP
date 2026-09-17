import { ArrowRight, CircleAlert, CircleCheck, Info } from "lucide-react";
import type { AttentionPoint } from "@/lib/workout-evolution";
import { EmptyNote, ModuleCard } from "./shared";

// ---------------------------------------------------------------------------
// "Pontos de atenção" — no máximo três observações, todas calculadas a partir
// dos registros por regras transparentes. Nenhuma chamada de IA, nenhuma frase
// gerada a cada abertura.
//
// Cada observação leva à sua origem. Músculo sem registro nenhum não vira
// problema: só entra quando já foi treinado e ficou muito tempo parado.
// ---------------------------------------------------------------------------

const icon = {
  bom: CircleCheck,
  alerta: CircleAlert,
  neutro: Info,
};

const tone = {
  bom: "text-success",
  alerta: "text-warning",
  neutro: "text-muted-foreground",
};

export function AttentionCard({
  points,
  onOpen,
  onReviewNext,
  reviewLabel,
}: {
  points: AttentionPoint[];
  onOpen: (point: AttentionPoint) => void;
  onReviewNext?: () => void;
  reviewLabel?: string;
}) {
  return (
    <ModuleCard title="Pontos de atenção">
      {points.length === 0 ? (
        <EmptyNote>
          Sem observações verificáveis neste período. Isso não significa que algo esteja errado —
          significa que os registros ainda não sustentam uma conclusão.
        </EmptyNote>
      ) : (
        <ul className="space-y-1.5">
          {points.map((point) => {
            const Icon = icon[point.tone];
            return (
              <li key={point.id}>
                <button
                  onClick={() => onOpen(point)}
                  className="interactive-press flex w-full items-start gap-2 py-1.5 text-left"
                >
                  <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${tone[point.tone]}`} />
                  <span className="min-w-0 flex-1 text-xs leading-relaxed">{point.text}</span>
                  <ArrowRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {onReviewNext && (
        <button onClick={onReviewNext} className="evo-outline interactive-press mt-3">
          {reviewLabel ?? "Revisar próximo treino"}
        </button>
      )}
    </ModuleCard>
  );
}
