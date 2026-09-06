import { ganttScaleLabel, type GanttScale } from "@/lib/goals-store";

/** Não filtra nem apaga ações — só muda a escala da linha do tempo. Mesmo
 * padrão visual de pill usado no resto do app (ex. filtros de planejamento). */
export function ScaleSelector({
  scale,
  onChange,
}: {
  scale: GanttScale;
  onChange: (s: GanttScale) => void;
}) {
  return (
    <div className="mt-5 -mx-5 overflow-x-auto px-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <div
        className="flex gap-1 rounded-2xl border border-border bg-surface p-1"
        style={{ width: "max-content", minWidth: "100%" }}
      >
        {(Object.keys(ganttScaleLabel) as GanttScale[]).map((s) => (
          <button
            key={s}
            onClick={() => onChange(s)}
            className={`min-h-10 flex-1 rounded-xl px-4 py-2 text-xs font-semibold transition-colors ${
              scale === s ? "bg-primary text-primary-foreground" : "text-muted-foreground"
            }`}
          >
            {ganttScaleLabel[s]}
          </button>
        ))}
      </div>
    </div>
  );
}
