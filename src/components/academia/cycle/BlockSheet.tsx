import { useState } from "react";
import { CalendarPlus, ChevronDown, Copy, Layers3, Plus, Trash2 } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { InlineError } from "@/components/ui/inline-error";
import { useAsyncAction } from "@/hooks/use-async-action";
import { weekVisualLabels, weekVisualOrder } from "@/components/sub-agenda-shared";
import { PlanExerciseEditor } from "@/components/academia/PlanExerciseEditor";
import { formatDateShortBR } from "@/lib/goals-store";
import { useGoalsStore } from "@/lib/goals-store";
import { libraryPlans, useWorkoutStore } from "@/lib/workout-store";
import {
  applyRoutinePlan,
  blockDurationDays,
  blocksForCycle,
  copyBlockPrograms,
  copyPlanIntoBlock,
  createPlanInBlock,
  daysOfBlock,
  plansOfBlock,
  removeBlock,
  removePlanFromBlock,
  resizeBlock,
  routinePlanForBlock,
  setBlockDay,
  shiftBlocksFrom,
  updateBlock,
  useCycleStore,
} from "@/lib/workout-cycle-store";
import { BulkExerciseModal } from "./BulkExerciseModal";

// ---------------------------------------------------------------------------
// Detalhe de um bloco: seus treinos, a distribuição pela semana e os ajustes
// de data.
//
// Os treinos daqui são CÓPIAS que pertencem ao bloco. É isso que permite
// ajustar a fase 2 sem tocar na fase 1, no treino em andamento ou no histórico.
// A linhagem do exercício é preservada na cópia, então a evolução continua
// sendo uma curva só.
// ---------------------------------------------------------------------------

export function BlockSheet({ blockId, onClose }: { blockId: string; onClose: () => void }) {
  const blocks = useCycleStore((s) => s.blocks);
  const cycles = useCycleStore((s) => s.cycles);
  const blockPlans = useCycleStore((s) => s.blockPlans);
  const blockDays = useCycleStore((s) => s.blockDays);
  const plans = useWorkoutStore((s) => s.plans);
  const routines = useGoalsStore((s) => s.routines);

  const [addingPlan, setAddingPlan] = useState(false);
  const [openPlanId, setOpenPlanId] = useState<string | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [agendaOpen, setAgendaOpen] = useState(false);
  const action = useAsyncAction();

  const block = blocks.find((b) => b.id === blockId);
  const cycle = cycles.find((c) => c.id === block?.cycleId);
  if (!block || !cycle) return null;

  const siblings = blocksForCycle(blocks, cycle.id);
  const previous = siblings[siblings.findIndex((b) => b.id === block.id) - 1];
  const myPlans = plansOfBlock(blockPlans, plans, block.id);
  const days = daysOfBlock(blockDays, block.id);
  const library = libraryPlans(plans);
  const routineItems = routinePlanForBlock(block, blockDays, plans, routines);

  return (
    <Modal onClose={onClose} title={block.name}>
      <p className="text-[11px] text-muted-foreground">
        {formatDateShortBR(block.startDate)} — {formatDateShortBR(block.endDate)} ·{" "}
        {blockDurationDays(block)} dias
      </p>

      {/* --- identidade do bloco ------------------------------------------ */}
      <div className="mt-4 space-y-2">
        <Field
          label="Nome"
          value={block.name}
          onCommit={(v) => void updateBlock(block.id, { name: v || "Bloco" })}
        />
        <Field
          label="Foco (anotação sua, não é meta)"
          value={block.focus ?? ""}
          placeholder="Ex: resistência"
          onCommit={(v) => void updateBlock(block.id, { focus: v })}
        />
        <Field
          label="Grupos musculares (opcional)"
          value={block.muscleGroups ?? ""}
          placeholder="Ex: costas e bíceps"
          onCommit={(v) => void updateBlock(block.id, { muscleGroups: v })}
        />
        <label className="block">
          <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Duração
          </span>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={1}
              defaultValue={blockDurationDays(block)}
              key={`${block.startDate}-${block.endDate}`}
              onBlur={(e) =>
                action.run(() =>
                  resizeBlock(cycle, blocks, block.id, Math.max(1, Number(e.target.value) || 1)),
                )
              }
              className="w-20 rounded-md border border-border bg-surface px-2 py-1.5 text-right text-xs tabular-nums outline-none focus:border-primary"
            />
            <span className="text-[11px] text-muted-foreground">
              dias — os blocos seguintes se ajustam; os anteriores não se movem
            </span>
          </div>
        </label>
      </div>

      {/* --- treinos do bloco --------------------------------------------- */}
      <section className="mt-6">
        <div className="flex items-baseline justify-between">
          <h3 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            Treinos deste bloco
          </h3>
          {myPlans.length > 1 && (
            <button
              onClick={() => setBulkOpen(true)}
              className="interactive-press text-[11px] font-semibold text-primary"
            >
              + exercício em vários
            </button>
          )}
        </div>

        <ul className="mt-2 space-y-2">
          {myPlans.map((plan) => (
            <li key={plan.id} className="rounded-lg border border-border bg-surface-2 p-2.5">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setOpenPlanId(openPlanId === plan.id ? null : plan.id)}
                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                >
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-xs font-bold text-primary">
                    {plan.letter}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold">{plan.name}</span>
                  <ChevronDown
                    className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${openPlanId === plan.id ? "rotate-180" : ""}`}
                  />
                </button>
                <button
                  onClick={() => action.run(() => removePlanFromBlock(block.id, plan.id))}
                  aria-label={`Tirar ${plan.name} do bloco`}
                  className="shrink-0 text-muted-foreground hover:text-danger"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
              {openPlanId === plan.id && <PlanExerciseEditor planId={plan.id} />}
            </li>
          ))}
        </ul>

        {myPlans.length === 0 && (
          <p className="mt-2 text-[11px] text-muted-foreground">Nenhum treino neste bloco ainda.</p>
        )}

        {!addingPlan ? (
          <button
            onClick={() => setAddingPlan(true)}
            className="interactive-press mt-2 flex w-full items-center justify-center gap-1 rounded-lg border border-dashed border-border py-2 text-[11px] text-muted-foreground hover:border-primary/40 hover:text-primary"
          >
            <Plus className="h-3.5 w-3.5" /> adicionar treino
          </button>
        ) : (
          <AddPlanPanel
            blockId={block.id}
            library={library}
            previousBlockName={previous?.name}
            pending={action.pending}
            onCopyPrevious={
              previous
                ? () =>
                    action.run(async () => {
                      await copyBlockPrograms(previous.id, block.id);
                      setAddingPlan(false);
                    })
                : undefined
            }
            onPick={(planId) =>
              action.run(async () => {
                await copyPlanIntoBlock(block.id, planId);
                setAddingPlan(false);
              })
            }
            onCreate={(input) =>
              action.run(async () => {
                const id = await createPlanInBlock(block.id, input);
                setAddingPlan(false);
                setOpenPlanId(id);
              })
            }
            onCancel={() => setAddingPlan(false)}
          />
        )}
      </section>

      {/* --- distribuição semanal ----------------------------------------- */}
      <section className="mt-6">
        <h3 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
          Dias da semana
        </h3>
        <ul className="mt-2 space-y-1.5">
          {weekVisualOrder.map((weekday, i) => {
            const day = days.find((d) => d.weekday === weekday);
            return (
              <li key={weekday} className="flex items-center gap-2">
                <span className="w-9 shrink-0 text-[11px] font-semibold text-muted-foreground">
                  {weekVisualLabels[i]}
                </span>
                <select
                  value={day?.planId ?? ""}
                  onChange={(e) =>
                    action.run(() =>
                      setBlockDay(block.id, weekday, e.target.value || null, day?.startTime),
                    )
                  }
                  className="min-w-0 flex-1 rounded-md border border-border bg-surface px-2 py-1.5 text-xs outline-none focus:border-primary"
                >
                  <option value="">Descanso</option>
                  {myPlans.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.letter} · {p.name}
                    </option>
                  ))}
                </select>
                <input
                  type="time"
                  value={day?.startTime ?? ""}
                  disabled={!day?.planId}
                  onChange={(e) =>
                    action.run(() =>
                      setBlockDay(block.id, weekday, day?.planId ?? null, e.target.value || null),
                    )
                  }
                  className="w-24 shrink-0 rounded-md border border-border bg-surface px-2 py-1.5 text-xs outline-none focus:border-primary disabled:opacity-40"
                />
              </li>
            );
          })}
        </ul>

        {routineItems.length > 0 && (
          <div className="mt-3 rounded-lg border border-border bg-surface-2 p-2.5">
            <button
              onClick={() => setAgendaOpen((v) => !v)}
              className="interactive-press flex w-full items-center gap-2 text-left"
            >
              <CalendarPlus className="h-4 w-4 shrink-0 text-primary" />
              <span className="min-w-0 flex-1 text-[11px] font-semibold">
                Levar os horários para a Agenda
              </span>
              <ChevronDown
                className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform ${agendaOpen ? "rotate-180" : ""}`}
              />
            </button>
            {agendaOpen && (
              <>
                <ul className="mt-2 space-y-1">
                  {routineItems.map((item) => (
                    <li
                      key={`${item.weekday}-${item.time}`}
                      className="flex items-center justify-between gap-2 text-[11px]"
                    >
                      <span className="min-w-0 truncate">
                        {weekVisualLabels[weekVisualOrder.indexOf(item.weekday)]} · {item.time} ·{" "}
                        {item.title}
                      </span>
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${item.alreadyExists ? "bg-surface text-muted-foreground" : "bg-primary/15 text-primary"}`}
                      >
                        {item.alreadyExists ? "já existe" : "criar"}
                      </span>
                    </li>
                  ))}
                </ul>
                <button
                  onClick={() => action.run(() => applyRoutinePlan(routineItems))}
                  disabled={action.pending || routineItems.every((i) => i.alreadyExists)}
                  className="interactive-press mt-2 w-full rounded-lg bg-primary py-2 text-[11px] font-bold text-primary-foreground disabled:opacity-40"
                >
                  Criar os que faltam
                </button>
                <p className="mt-1.5 text-[10px] leading-relaxed text-muted-foreground">
                  Usa as rotinas da Agenda que já existem. Um dia que já tem treino marcado é
                  mantido como está — nada é duplicado nem sobrescrito.
                </p>
              </>
            )}
          </div>
        )}
      </section>

      {/* --- ajustes de data ---------------------------------------------- */}
      <section className="mt-6">
        <h3 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
          Ajustar datas
        </h3>
        <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
          Faltar um treino não empurra o ciclo sozinho. Se quiser adiar daqui pra frente, é aqui.
        </p>
        <div className="mt-2 flex gap-2">
          {[3, 7].map((days) => (
            <button
              key={days}
              onClick={() => action.run(() => shiftBlocksFrom(cycle, blocks, block.id, days))}
              className="interactive-press flex-1 rounded-lg border border-border py-2 text-[11px] font-semibold"
            >
              adiar {days} dias
            </button>
          ))}
          <button
            onClick={() => action.run(() => shiftBlocksFrom(cycle, blocks, block.id, -7))}
            className="interactive-press flex-1 rounded-lg border border-border py-2 text-[11px] font-semibold"
          >
            antecipar 7
          </button>
        </div>
      </section>

      {action.error && (
        <InlineError message={action.error} onRetry={action.clearError} className="mt-3" />
      )}

      {/* --- remover ------------------------------------------------------ */}
      <div className="mt-6 border-t border-border pt-3">
        {!confirmRemove ? (
          <button
            onClick={() => setConfirmRemove(true)}
            className="interactive-press w-full rounded-lg py-2 text-[11px] font-semibold text-danger"
          >
            Remover bloco
          </button>
        ) : (
          <div className="rounded-lg border border-danger/40 bg-danger/5 p-2.5">
            <p className="text-[11px] leading-relaxed">
              Os treinos deste bloco vão para o arquivo em vez de serem apagados — as sessões já
              registradas continuam intactas no histórico.
            </p>
            <div className="mt-2 flex gap-2">
              <button
                onClick={() => setConfirmRemove(false)}
                className="interactive-press flex-1 rounded-lg border border-border py-2 text-[11px] font-semibold"
              >
                Cancelar
              </button>
              <button
                onClick={() =>
                  action.run(async () => {
                    await removeBlock(block.id);
                    onClose();
                  })
                }
                className="interactive-press flex-1 rounded-lg bg-danger py-2 text-[11px] font-bold text-destructive-foreground"
              >
                Remover
              </button>
            </div>
          </div>
        )}
      </div>

      {bulkOpen && <BulkExerciseModal plans={myPlans} onClose={() => setBulkOpen(false)} />}
    </Modal>
  );
}

/** Campo de texto que grava ao sair — evita uma escrita por tecla digitada. */
function Field({
  label,
  value,
  placeholder,
  onCommit,
}: {
  label: string;
  value: string;
  placeholder?: string;
  onCommit: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <input
        key={value}
        defaultValue={value}
        placeholder={placeholder}
        onBlur={(e) => {
          if (e.target.value !== value) onCommit(e.target.value.trim());
        }}
        className="w-full rounded-md border border-border bg-surface px-2 py-1.5 text-xs outline-none focus:border-primary"
      />
    </label>
  );
}

function AddPlanPanel({
  library,
  previousBlockName,
  pending,
  onCopyPrevious,
  onPick,
  onCreate,
  onCancel,
}: {
  blockId: string;
  library: { id: string; letter: string; name: string }[];
  previousBlockName?: string;
  pending: boolean;
  onCopyPrevious?: () => void;
  onPick: (planId: string) => void;
  onCreate: (input: { letter: string; name: string }) => void;
  onCancel: () => void;
}) {
  const [letter, setLetter] = useState("");
  const [name, setName] = useState("");

  return (
    <div className="mt-2 rounded-lg border border-border bg-surface p-2.5">
      {onCopyPrevious && (
        <button
          onClick={onCopyPrevious}
          disabled={pending}
          className="interactive-press flex w-full items-center gap-2 rounded-md border border-border px-2 py-2 text-left text-[11px] font-semibold disabled:opacity-50"
        >
          <Copy className="h-3.5 w-3.5 shrink-0 text-primary" />
          Copiar os treinos de "{previousBlockName}"
        </button>
      )}

      {library.length > 0 && (
        <>
          <p className="mt-3 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            <Layers3 className="h-3 w-3" /> da biblioteca
          </p>
          <ul className="mt-1.5 space-y-1">
            {library.map((p) => (
              <li key={p.id}>
                <button
                  onClick={() => onPick(p.id)}
                  disabled={pending}
                  className="interactive-press flex w-full items-center gap-2 rounded-md border border-border px-2 py-1.5 text-left text-[11px] disabled:opacity-50"
                >
                  <span className="font-bold text-primary">{p.letter}</span>
                  <span className="min-w-0 flex-1 truncate">{p.name}</span>
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-1.5 text-[10px] leading-relaxed text-muted-foreground">
            Entra como cópia do bloco: editar aqui não altera o treino original nem os outros
            blocos.
          </p>
        </>
      )}

      <p className="mt-3 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
        ou crie um novo
      </p>
      <div className="mt-1.5 flex gap-1.5">
        <input
          value={letter}
          onChange={(e) => setLetter(e.target.value.slice(0, 2).toUpperCase())}
          placeholder="A"
          className="w-12 rounded-md border border-border bg-surface-2 px-2 py-1.5 text-center text-xs outline-none focus:border-primary"
        />
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ex: Ombro e trapézio"
          className="min-w-0 flex-1 rounded-md border border-border bg-surface-2 px-2 py-1.5 text-xs outline-none focus:border-primary"
        />
      </div>
      <div className="mt-2 flex gap-2">
        <button
          onClick={onCancel}
          className="interactive-press flex-1 rounded-md border border-border py-1.5 text-[11px] font-semibold"
        >
          Cancelar
        </button>
        <button
          onClick={() => onCreate({ letter: letter.trim() || "A", name: name.trim() })}
          disabled={pending || !name.trim()}
          className="interactive-press flex-1 rounded-md bg-primary py-1.5 text-[11px] font-bold text-primary-foreground disabled:opacity-40"
        >
          Criar treino
        </button>
      </div>
    </div>
  );
}
