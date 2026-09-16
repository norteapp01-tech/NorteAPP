import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { InlineError } from "@/components/ui/inline-error";
import { useAsyncAction } from "@/hooks/use-async-action";
import { formatDateShortBR, todayISO } from "@/lib/goals-store";
import { blockRangesFrom, createCycle, type NewBlockInput } from "@/lib/workout-cycle-store";

// ---------------------------------------------------------------------------
// Criação do ciclo — nome, início e os blocos, por edição direta.
//
// Os intervalos são calculados a partir das durações em vez de pedir data de
// início e fim de cada bloco: assim não existe sobreposição nem buraco, e o
// usuário vê o calendário se formar enquanto digita.
// ---------------------------------------------------------------------------

const DEFAULT_BLOCKS: NewBlockInput[] = [
  { name: "Bloco 1", durationDays: 15, focus: "" },
  { name: "Bloco 2", durationDays: 15, focus: "" },
  { name: "Bloco 3", durationDays: 15, focus: "" },
];

export function CycleCreatorModal({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState(todayISO());
  const [blocks, setBlocks] = useState<NewBlockInput[]>(DEFAULT_BLOCKS);
  const action = useAsyncAction();

  const ranges = blockRangesFrom(
    startDate,
    blocks.map((b) => b.durationDays),
  );
  const totalDays = blocks.reduce((sum, b) => sum + Math.max(1, Math.round(b.durationDays)), 0);
  const canSave = name.trim().length > 0 && blocks.length > 0;

  const patchBlock = (index: number, patch: Partial<NewBlockInput>) =>
    setBlocks((list) => list.map((b, i) => (i === index ? { ...b, ...patch } : b)));

  return (
    <Modal
      onClose={onClose}
      title="Novo ciclo de treino"
      footer={
        <div className="space-y-2">
          {action.error && <InlineError message={action.error} onRetry={action.clearError} />}
          <button
            disabled={!canSave || action.pending}
            onClick={() =>
              action.run(async () => {
                await createCycle({
                  name: name.trim(),
                  startDate,
                  blocks: blocks.map((b) => ({
                    ...b,
                    name: b.name.trim() || "Bloco",
                    focus: b.focus?.trim() || undefined,
                  })),
                });
                onClose();
              })
            }
            className="interactive-press w-full rounded-xl bg-primary py-3 text-sm font-bold text-primary-foreground disabled:opacity-40"
          >
            {action.pending ? "Criando…" : "Salvar rascunho"}
          </button>
          <p className="text-center text-[10px] text-muted-foreground">
            O ciclo nasce como rascunho. Ele só passa a valer quando você ativar.
          </p>
        </div>
      }
    >
      <label className="block">
        <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Nome do ciclo
        </span>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ex: Ciclo de 45 dias"
          className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm outline-none focus:border-primary"
        />
      </label>

      <label className="mt-3 block">
        <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Começa em
        </span>
        <input
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value || todayISO())}
          className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm outline-none focus:border-primary"
        />
      </label>

      <div className="mt-5">
        <div className="flex items-baseline justify-between">
          <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            Blocos
          </p>
          <p className="text-[11px] text-muted-foreground">
            {totalDays} dias · termina{" "}
            {ranges.at(-1) ? formatDateShortBR(ranges.at(-1)!.endDate) : "—"}
          </p>
        </div>

        <ul className="mt-2 space-y-2">
          {blocks.map((block, index) => (
            <li key={index} className="rounded-lg border border-border bg-surface-2 p-2.5">
              <div className="flex items-center gap-2">
                <input
                  value={block.name}
                  onChange={(e) => patchBlock(index, { name: e.target.value })}
                  placeholder={`Bloco ${index + 1}`}
                  className="min-w-0 flex-1 rounded-md border border-border bg-surface px-2 py-1.5 text-xs outline-none focus:border-primary"
                />
                <div className="flex shrink-0 items-center gap-1">
                  <input
                    type="number"
                    min={1}
                    value={block.durationDays}
                    onChange={(e) =>
                      patchBlock(index, { durationDays: Math.max(1, Number(e.target.value) || 1) })
                    }
                    className="w-14 rounded-md border border-border bg-surface px-2 py-1.5 text-right text-xs tabular-nums outline-none focus:border-primary"
                  />
                  <span className="text-[10px] text-muted-foreground">dias</span>
                </div>
                <button
                  onClick={() => setBlocks((list) => list.filter((_, i) => i !== index))}
                  disabled={blocks.length === 1}
                  aria-label={`Remover ${block.name || `bloco ${index + 1}`}`}
                  className="shrink-0 text-muted-foreground hover:text-danger disabled:opacity-30"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
              <input
                value={block.focus ?? ""}
                onChange={(e) => patchBlock(index, { focus: e.target.value })}
                placeholder="Foco (ex: resistência) — opcional"
                className="mt-1.5 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-xs outline-none focus:border-primary"
              />
              <p className="mt-1.5 text-[10px] text-muted-foreground">
                {formatDateShortBR(ranges[index].startDate)} —{" "}
                {formatDateShortBR(ranges[index].endDate)}
              </p>
            </li>
          ))}
        </ul>

        <button
          onClick={() =>
            setBlocks((list) => [
              ...list,
              { name: `Bloco ${list.length + 1}`, durationDays: 15, focus: "" },
            ])
          }
          className="interactive-press mt-2 flex w-full items-center justify-center gap-1 rounded-lg border border-dashed border-border py-2 text-[11px] text-muted-foreground hover:border-primary/40 hover:text-primary"
        >
          <Plus className="h-3.5 w-3.5" /> adicionar bloco
        </button>

        <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
          O foco é uma anotação sua. O Norte não prescreve carga nem volume — os treinos de cada
          bloco você monta no passo seguinte.
        </p>
      </div>
    </Modal>
  );
}
