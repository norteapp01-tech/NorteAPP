import { useState } from "react";
import { CalendarPlus, ChevronDown, ChevronUp, Copy, Layers3, Plus, Trash2 } from "lucide-react";
import { InlineError } from "@/components/ui/inline-error";
import { useAsyncAction } from "@/hooks/use-async-action";
import { weekVisualLabels, weekVisualOrder } from "@/components/sub-agenda-shared";
import { PlanExerciseEditor } from "@/components/academia/PlanExerciseEditor";
import { formatDateShortBR, useGoalsStore } from "@/lib/goals-store";
import { libraryPlans, useWorkoutStore } from "@/lib/workout-store";
import {
  applyRoutinePlan,
  blockDurationDays,
  copyBlockPrograms,
  copyPlanIntoBlock,
  createPlanInBlock,
  daysOfBlock,
  plansOfBlock,
  removeBlock,
  removePlanFromBlock,
  resizeBlock,
  routinePlanForBlock,
  stageState,
  stagesShiftedBy,
  updateBlock,
  useCycleStore,
  type CycleBlock,
  type WorkoutCycle,
  type GoalEvaluation,
} from "@/lib/workout-cycle-store";
import { StageWeek } from "./StageWeek";
import { CycleGoalsCard } from "./CycleGoalsCard";
import { BulkExerciseModal } from "./BulkExerciseModal";

// ---------------------------------------------------------------------------
// Uma etapa do ciclo, no formato de card recolhível do Planejamento.
//
// Os treinos daqui são CÓPIAS que pertencem à etapa: montar a etapa 2 a partir
// da 1 e depois mexer nela não pode alterar a etapa 1, o treino em andamento
// nem as sessões já registradas. A letra (A, B, C) é rótulo dentro da etapa,
// não identificador global — dois "A" de etapas diferentes são treinos
// diferentes.
// ---------------------------------------------------------------------------

export function StageCard({
  cycle,
  block,
  index,
  isOpen,
  onToggle,
  evaluations,
}: {
  evaluations: GoalEvaluation[];
  cycle: WorkoutCycle;
  block: CycleBlock;
  index: number;
  isOpen: boolean;
  onToggle: () => void;
}) {
  const blocks = useCycleStore((s) => s.blocks);
  const blockPlans = useCycleStore((s) => s.blockPlans);
  const blockDays = useCycleStore((s) => s.blockDays);
  const plans = useWorkoutStore((s) => s.plans);
  const exercises = useWorkoutStore((s) => s.exercises);
  const routines = useGoalsStore((s) => s.routines);

  const [addingPlan, setAddingPlan] = useState(false);
  const [openPlanId, setOpenPlanId] = useState<string | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [durationDraft, setDurationDraft] = useState<number | null>(null);
  const [agendaOpen, setAgendaOpen] = useState(false);
  const action = useAsyncAction();

  const state = stageState(block, blockPlans);
  const myPlans = plansOfBlock(blockPlans, plans, block.id);
  const days = daysOfBlock(blockDays, block.id);
  const siblings = blocksForCycleSafe(blocks, cycle.id);
  const previous = siblings[siblings.findIndex((b) => b.id === block.id) - 1];
  const others = siblings.filter((b) => b.id !== block.id);
  const routineItems = routinePlanForBlock(block, blockDays, plans, routines);
  const shifted = durationDraft !== null ? stagesShiftedBy(blocks, cycle.id, block.id) : [];

  return (
    <div className={`card-surface p-4 ${state === "vigente" ? "border-l-2 border-l-primary" : ""}`}>
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className="mt-0.5 h-6 w-6 shrink-0 rounded-full border border-border bg-surface-2"
        />
        <button className="min-w-0 flex-1 text-left" onClick={onToggle} aria-expanded={isOpen}>
          <p
            className={`text-[11px] font-bold uppercase tracking-wider ${state === "vigente" ? "text-primary" : "text-muted-foreground"}`}
          >
            {state === "vigente" ? "Etapa atual" : `Etapa ${index + 1}`}
          </p>
          <p className="mt-0.5 text-[16px] font-semibold leading-snug">{block.name}</p>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            {myPlans.length} {myPlans.length === 1 ? "treino" : "treinos"} · Até{" "}
            {formatDateShortBR(block.endDate)}
          </p>
        </button>
        <div className="flex shrink-0 items-center gap-1">
          {!confirmRemove ? (
            <button
              onClick={() => setConfirmRemove(true)}
              aria-label={`Excluir ${block.name}`}
              className="flex h-8 w-8 items-center justify-center text-muted-foreground hover:text-danger"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          ) : (
            <div className="flex items-center gap-1">
              <button
                onClick={() =>
                  action.run(async () => {
                    await removeBlock(block.id);
                    setConfirmRemove(false);
                  })
                }
                className="rounded-md bg-danger px-1.5 py-1 text-[10px] font-semibold text-white"
              >
                excluir
              </button>
              <button
                onClick={() => setConfirmRemove(false)}
                className="text-[10px] text-muted-foreground"
              >
                cancelar
              </button>
            </div>
          )}
          <button
            onClick={onToggle}
            aria-label={isOpen ? "Recolher etapa" : "Expandir etapa"}
            className="flex h-8 w-8 items-center justify-center text-muted-foreground hover:text-foreground"
          >
            {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {confirmRemove && (
        <p className="mt-2 rounded-lg border border-danger/40 bg-danger/5 p-2 text-[11px] leading-relaxed">
          Os treinos desta etapa vão para o arquivo em vez de serem apagados — as sessões já
          registradas continuam intactas.
        </p>
      )}

      {isOpen && (
        <div className="mt-3 space-y-5 border-t border-border pt-3 animate-in fade-in slide-in-from-top-1">
          {/* --- treinos --------------------------------------------------- */}
          <section>
            <div className="flex flex-wrap items-baseline justify-end gap-2">
              {myPlans.length > 1 && (
                <button
                  onClick={() => setBulkOpen(true)}
                  className="interactive-press text-[11px] font-semibold text-primary"
                >
                  + exercício em vários
                </button>
              )}
            </div>

            <ul className="relative mt-3 space-y-2 border-l border-border pl-4">
              {myPlans.map((plan) => (
                <li
                  key={plan.id}
                  className="relative rounded-2xl border border-border bg-surface-2 p-3"
                >
                  <span aria-hidden className="absolute -left-4 top-6 h-px w-4 bg-border" />
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setOpenPlanId(openPlanId === plan.id ? null : plan.id)}
                      aria-expanded={openPlanId === plan.id}
                      className="flex min-w-0 flex-1 items-center gap-2 text-left"
                    >
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-border text-[11px] font-semibold text-muted-foreground">
                        {plan.letter}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium">{plan.name}</span>
                        <span className="mt-0.5 block text-[13px] text-muted-foreground">
                          {exercises.filter((exercise) => exercise.planId === plan.id).length}{" "}
                          {exercises.filter((exercise) => exercise.planId === plan.id).length === 1
                            ? "exercício"
                            : "exercícios"}
                        </span>
                      </span>
                      <ChevronDown
                        className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${openPlanId === plan.id ? "rotate-180" : ""}`}
                      />
                    </button>
                    <button
                      onClick={() => action.run(() => removePlanFromBlock(block.id, plan.id))}
                      aria-label={`Tirar ${plan.name} da etapa`}
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
              <p className="text-[13px] text-muted-foreground">
                Quais treinos você quer fazer nesta etapa?
              </p>
            )}

            {!addingPlan ? (
              <div className="mt-3 border-t border-border pt-2">
                <button
                  onClick={() => setAddingPlan(true)}
                  className="interactive-press flex min-h-11 items-center gap-1.5 text-sm font-semibold text-primary"
                >
                  <Plus className="h-4 w-4" /> Novo treino
                </button>
              </div>
            ) : (
              <AddPlanPanel
                library={libraryPlans(plans)}
                otherStages={others}
                previousName={previous?.name}
                pending={action.pending}
                onCopyStage={(fromId) =>
                  action.run(async () => {
                    await copyBlockPrograms(fromId, block.id);
                    setAddingPlan(false);
                  })
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

          <details className="group border-t border-border pt-3">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-sm font-medium">
              Metas da etapa{" "}
              <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" />
            </summary>
            <div className="mt-3">
              <CycleGoalsCard
                cycle={cycle}
                blocks={siblings}
                block={block}
                evaluations={evaluations.filter((ev) => ev.goal.blockId === block.id)}
              />
            </div>
          </details>

          {/* --- distribuição semanal -------------------------------------- */}
          <details className="group border-t border-border pt-3">
            <summary className="flex cursor-pointer list-none items-center gap-2">
              <h3 className="flex-1 text-[13px] font-medium text-muted-foreground">
                Dias da semana
              </h3>
              <span className="text-[11px] text-muted-foreground">
                {days.filter((d) => d.planId).length}{" "}
                {days.filter((d) => d.planId).length === 1 ? "dia" : "dias"}
              </span>
              <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" />
            </summary>
            <StageWeek blockId={block.id} days={days} plans={myPlans} />

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
                            {weekVisualLabels[weekVisualOrder.indexOf(item.weekday)]} · {item.time}{" "}
                            · {item.title}
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
                      Um dia que já tem rotina de academia é mantido como está — nada é duplicado
                      nem sobrescrito.
                    </p>
                  </>
                )}
              </div>
            )}
          </details>

          {/* --- identidade e duração ------------------------------------- */}
          <details className="group">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-[13px] text-muted-foreground">
              Editar nome, foco e duração
              <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" />
            </summary>
            <div className="mt-3 space-y-3">
              <p className="text-[13px] text-muted-foreground">
                {formatDateShortBR(block.startDate)} — {formatDateShortBR(block.endDate)} ·{" "}
                {blockDurationDays(block)} dias
              </p>
              <Field
                label="Nome"
                value={block.name}
                onCommit={(v) => void updateBlock(block.id, { name: v || "Etapa" })}
              />
              <Field
                label="Foco (anotação sua, não é meta)"
                value={block.focus ?? ""}
                placeholder="Ex: resistência"
                onCommit={(v) => void updateBlock(block.id, { focus: v })}
              />
              <div>
                <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Duração
                </span>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    value={durationDraft ?? blockDurationDays(block)}
                    onChange={(e) => setDurationDraft(Math.max(1, Number(e.target.value) || 1))}
                    className="w-20 rounded-md border border-border bg-surface px-2 py-1.5 text-right text-xs tabular-nums outline-none focus:border-primary"
                  />
                  <span className="text-[11px] text-muted-foreground">dias</span>
                </div>
                {/* A mudança só acontece depois de a pessoa ver o que vai se
                  mover — data futura é calendário de quem se organizou. */}
                {durationDraft !== null && durationDraft !== blockDurationDays(block) && (
                  <div className="mt-2 rounded-lg border border-warning/30 bg-warning/10 p-2.5">
                    <p className="text-[11px] leading-relaxed">
                      {shifted.length === 0
                        ? "Nenhuma etapa seguinte será deslocada."
                        : `Serão deslocadas: ${shifted.map((b) => b.name).join(", ")}. As anteriores e o histórico ficam onde estão.`}
                    </p>
                    <div className="mt-2 flex gap-2">
                      <button
                        onClick={() => setDurationDraft(null)}
                        className="interactive-press flex-1 rounded-lg border border-border py-1.5 text-[11px] font-semibold"
                      >
                        Cancelar
                      </button>
                      <button
                        onClick={() =>
                          action.run(async () => {
                            await resizeBlock(cycle, blocks, block.id, durationDraft);
                            setDurationDraft(null);
                          })
                        }
                        className="interactive-press flex-1 rounded-lg bg-primary py-1.5 text-[11px] font-bold text-primary-foreground"
                      >
                        Aplicar
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </details>

          {action.error && <InlineError message={action.error} onRetry={action.clearError} />}
        </div>
      )}

      {bulkOpen && <BulkExerciseModal plans={myPlans} onClose={() => setBulkOpen(false)} />}
    </div>
  );
}

function blocksForCycleSafe(blocks: CycleBlock[], cycleId: string): CycleBlock[] {
  return blocks.filter((b) => b.cycleId === cycleId).sort((a, b) => a.order - b.order);
}

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
  otherStages,
  previousName,
  pending,
  onCopyStage,
  onPick,
  onCreate,
  onCancel,
}: {
  library: { id: string; letter: string; name: string }[];
  otherStages: CycleBlock[];
  previousName?: string;
  pending: boolean;
  onCopyStage: (fromBlockId: string) => void;
  onPick: (planId: string) => void;
  onCreate: (input: { letter: string; name: string }) => void;
  onCancel: () => void;
}) {
  const [letter, setLetter] = useState("");
  const [name, setName] = useState("");

  return (
    <div className="mt-2 rounded-lg border border-border bg-surface p-2.5">
      {otherStages.length > 0 && (
        <>
          <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            <Copy className="h-3 w-3" /> copiar de outra etapa
          </p>
          <ul className="mt-1.5 space-y-1">
            {otherStages.map((stage) => (
              <li key={stage.id}>
                <button
                  onClick={() => onCopyStage(stage.id)}
                  disabled={pending}
                  className="interactive-press flex w-full items-center gap-2 rounded-md border border-border px-2 py-1.5 text-left text-[11px] disabled:opacity-50"
                >
                  <span className="min-w-0 flex-1 truncate">{stage.name}</span>
                  {stage.name === previousName && (
                    <span className="shrink-0 text-[9px] text-muted-foreground">anterior</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {library.length > 0 && (
        <>
          <p className="mt-3 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            <Layers3 className="h-3 w-3" /> treino cadastrado
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
          aria-label="Letra do treino"
          className="w-12 rounded-md border border-border bg-surface-2 px-2 py-1.5 text-center text-xs outline-none focus:border-primary"
        />
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ex: Ombro e trapézio"
          aria-label="Nome do treino"
          className="min-w-0 flex-1 rounded-md border border-border bg-surface-2 px-2 py-1.5 text-xs outline-none focus:border-primary"
        />
      </div>
      <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">
        A letra é só um rótulo dentro desta etapa — o "A" daqui não é o "A" das outras.
      </p>
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
