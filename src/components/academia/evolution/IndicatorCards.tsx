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
            <div className="grid grid-cols-2 gap-3">
              <Metric value={`${frequency.percent}%`} label="cumprido" />
              <Metric value={`${frequency.done}/${frequency.planned}`} label="treinos" />
              {frequency.extra > 0 && (
                <p className="col-span-2 text-xs font-semibold text-primary">
                  +{frequency.extra} extra{frequency.extra === 1 ? "" : "s"}
                </p>
              )}
            </div>
          ) : (
            <Metric value={String(frequency.done)} label="treinos" />
          )}
        </Modal>
      )}

      {open === "volume" && (
        <Modal onClose={() => setOpen(null)} title="Volume registrado">
          <div className="grid grid-cols-2 gap-3">
            <Metric value={formatKg(volume.kg)} label="volume" />
            <Metric value={String(volume.sets)} label="séries" />
          </div>
          {comparison && (
            <p className="mt-3 text-xs text-muted-foreground">
              {formatDateShortBR(comparison.from)}–{formatDateShortBR(comparison.to)}
            </p>
          )}
        </Modal>
      )}

      {open === "grupo" && (
        <Modal onClose={() => setOpen(null)} title="Grupo em destaque">
          {top ? (
            <div>
              <p className="text-xl font-bold">{top.label}</p>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <Metric value={String(top.directSets)} label="séries" />
                <Metric value={String(top.sessions)} label="sessões" />
              </div>
              {top.lastDate && (
                <p className="mt-3 text-xs text-muted-foreground">
                  Última: {formatDateShortBR(top.lastDate)}
                </p>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Sem dados no período.</p>
          )}
        </Modal>
      )}
    </>
  );
}

function Metric({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-2xl border border-border bg-surface-quiet p-4">
      <strong className="block font-mono text-2xl tabular-nums">{value}</strong>
      <span className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</span>
    </div>
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
