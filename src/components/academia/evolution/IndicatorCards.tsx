import { useState } from "react";
import { Modal } from "@/components/ui/modal";
import { formatDateShortBR } from "@/lib/goals-store";
import type {
  DateRange,
  FilteredData,
  Frequency,
  MuscleStimulus,
  Volume,
} from "@/lib/workout-evolution";

// ---------------------------------------------------------------------------
// Os três indicadores do topo. Cada um explica seus critérios ao toque — um
// número sem regra declarada não dá para conferir.
// ---------------------------------------------------------------------------

type Which = "frequencia" | "volume" | "grupo";

export function IndicatorCards({
  frequency,
  volume,
  top,
  comparison,
  data,
}: {
  frequency: Frequency;
  volume: Volume;
  top?: MuscleStimulus;
  comparison?: DateRange;
  data: FilteredData;
}) {
  const [open, setOpen] = useState<Which | null>(null);

  return (
    <>
      <div className="grid grid-cols-3 gap-2">
        <Card
          label="Frequência"
          value={frequency.percent !== undefined ? `${frequency.percent}%` : String(frequency.done)}
          hint={
            frequency.planned !== undefined
              ? `${frequency.done} de ${frequency.planned} treinos`
              : `${frequency.done} treinos realizados`
          }
          onClick={() => setOpen("frequencia")}
        />
        <Card
          label="Volume registrado"
          value={formatKg(volume.kg)}
          hint={
            volume.deltaKg !== undefined
              ? `${volume.deltaKg >= 0 ? "+" : ""}${formatKg(volume.deltaKg)} vs. anterior`
              : "sem comparação"
          }
          tone={volume.deltaKg !== undefined && volume.deltaKg > 0 ? "good" : undefined}
          onClick={() => setOpen("volume")}
        />
        <Card
          label="Grupo em destaque"
          value={top ? top.label : "—"}
          hint={top ? `${top.directSets} séries diretas` : "sem séries classificadas"}
          onClick={() => setOpen("grupo")}
        />
      </div>

      {open === "frequencia" && (
        <Modal onClose={() => setOpen(null)} title="Frequência">
          {frequency.planned !== undefined ? (
            <>
              <p className="text-sm leading-relaxed">
                {frequency.done} de {frequency.planned} treinos programados no período, ou{" "}
                {frequency.percent}%.
              </p>
              {frequency.extra > 0 && (
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  Você fez ainda {frequency.extra} treino(s) além do programado. Eles aparecem
                  separados e não elevam o cumprimento acima de 100%.
                </p>
              )}
              <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
                O denominador vem dos dias marcados nas etapas do programa, cujas datas são fixas.
                Mudar a ficha da semana hoje não reescreve o que estava previsto no passado.
              </p>
            </>
          ) : (
            <>
              <p className="text-sm leading-relaxed">
                {frequency.done} treinos realizados no período.
              </p>
              <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
                {frequency.reason} Um percentual exigiria saber o que estava programado naquelas
                datas, e a atribuição semanal atual não guarda esse histórico.
              </p>
            </>
          )}
        </Modal>
      )}

      {open === "volume" && (
        <Modal onClose={() => setOpen(null)} title="Volume registrado">
          <p className="text-sm leading-relaxed">
            Soma de carga × repetições de {volume.sets} séries concluídas.
          </p>
          {volume.excludedSets > 0 && (
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              {volume.excludedSets} séries ficaram de fora por não terem carga externa comparável
              (peso corporal, assistido ou sem carga). Somá-las produziria um número sem
              significado.
            </p>
          )}
          {comparison && (
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Comparado com {formatDateShortBR(comparison.from)} —{" "}
              {formatDateShortBR(comparison.to)}, o mesmo escopo de filtros.
            </p>
          )}
          <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
            Volume maior não prova ganho de força: ele também sobe quando houve mais sessões ou
            exercícios diferentes no período.
          </p>
        </Modal>
      )}

      {open === "grupo" && (
        <Modal onClose={() => setOpen(null)} title="Grupo em destaque">
          {top ? (
            <>
              <p className="text-sm leading-relaxed">
                {top.label} recebeu {top.directSets} séries diretas em {top.sessions}{" "}
                {top.sessions === 1 ? "sessão" : "sessões"}
                {top.lastDate ? `, a última em ${formatDateShortBR(top.lastDate)}` : ""}.
              </p>
              {top.assistedSets > 0 && (
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  Participou ainda como músculo secundário em {top.assistedSets} séries, contadas à
                  parte.
                </p>
              )}
            </>
          ) : (
            <p className="text-sm leading-relaxed">
              Nenhuma série com grupo muscular definido no período.
            </p>
          )}
          <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
            É o grupo com mais séries registradas — não significa músculo mais forte, favorito nem
            mais desenvolvido.
          </p>
          <p className="mt-2 text-[11px] text-muted-foreground">
            Baseado em {data.sets.length} séries no período.
          </p>
        </Modal>
      )}
    </>
  );
}

function Card({
  label,
  value,
  hint,
  tone,
  onClick,
}: {
  label: string;
  value: string;
  hint: string;
  tone?: "good";
  onClick: () => void;
}) {
  return (
    <button onClick={onClick} className="card-surface interactive-press p-2.5 text-left">
      <p className="text-[9px] font-bold uppercase leading-tight tracking-wider text-muted-foreground">
        {label}
      </p>
      <p
        className={`mt-1 truncate font-mono text-xl font-bold tabular-nums ${tone === "good" ? "text-success" : ""}`}
      >
        {value}
      </p>
      <p className="text-[9px] leading-tight text-muted-foreground">{hint}</p>
    </button>
  );
}

function formatKg(kg: number): string {
  if (Math.abs(kg) >= 1000) return `${(kg / 1000).toFixed(1).replace(".", ",")} t`;
  return `${kg} kg`;
}
