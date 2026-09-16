import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { CalendarRange, ChevronDown, ChevronRight, Plus, Route as RouteIcon } from "lucide-react";
import { Card } from "@/components/sub-agenda-shared";
import { InlineError } from "@/components/ui/inline-error";
import { useAsyncAction } from "@/hooks/use-async-action";
import { formatDateShortBR, todayISO } from "@/lib/goals-store";
import { useWorkoutStore } from "@/lib/workout-store";
import {
  activateCycle,
  blockOn,
  blocksForCycle,
  blockDurationDays,
  cycleProgress,
  daysOfBlock,
  draftCycles,
  evaluateCycleGoal,
  nextBlockAfter,
  pastCycles,
  plansOfBlock,
  setCycleStatus,
  useCycleStore,
  activeCycle as selectActiveCycle,
  type CycleBlock,
  type WorkoutCycle,
} from "@/lib/workout-cycle-store";
import { CycleCreatorModal } from "./CycleCreatorModal";
import { BlockSheet } from "./BlockSheet";
import { CycleGoalsCard } from "./CycleGoalsCard";

// ---------------------------------------------------------------------------
// Aba "Ciclo de treino" — o ciclo ativo, seus blocos e as metas.
//
// Três números que NÃO se somam num só: tempo transcorrido, treinos realizados
// versus programados, e metas atingidas. Uma barra única esconderia justamente
// a diferença entre "o prazo andou" e "eu cumpri o planejamento".
// ---------------------------------------------------------------------------

export function CycleTab() {
  const cycles = useCycleStore((s) => s.cycles);
  const blocks = useCycleStore((s) => s.blocks);
  const blockDays = useCycleStore((s) => s.blockDays);
  const blockPlans = useCycleStore((s) => s.blockPlans);
  const cycleGoals = useCycleStore((s) => s.cycleGoals);
  const plans = useWorkoutStore((s) => s.plans);
  const exercises = useWorkoutStore((s) => s.exercises);
  const sessions = useWorkoutStore((s) => s.sessions);
  const bodyWeights = useWorkoutStore((s) => s.bodyWeights);

  const [creating, setCreating] = useState(false);
  const [openBlockId, setOpenBlockId] = useState<string | null>(null);
  const [showPast, setShowPast] = useState(false);
  const activateAction = useAsyncAction();

  const active = selectActiveCycle(cycles);
  const drafts = draftCycles(cycles);
  const past = pastCycles(cycles);
  const today = todayISO();

  if (!active && drafts.length === 0 && past.length === 0) {
    return (
      <>
        <section className="card-surface p-5">
          <RouteIcon className="h-7 w-7 text-primary" strokeWidth={1.8} />
          <h2 className="mt-4 text-lg font-bold">Seu ciclo de treino</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Um ciclo divide um período em blocos com datas — cada bloco com seus próprios treinos.
            Mudar um bloco futuro não mexe no que já foi feito.
          </p>
          <button
            onClick={() => setCreating(true)}
            className="interactive-press mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-bold text-primary-foreground"
          >
            <Plus className="h-4 w-4" /> Criar ciclo
          </button>
        </section>
        {creating && <CycleCreatorModal onClose={() => setCreating(false)} />}
      </>
    );
  }

  const cycleBlocks = active ? blocksForCycle(blocks, active.id) : [];
  const current = active ? blockOn(cycleBlocks, today) : undefined;
  const upcoming = active ? nextBlockAfter(cycleBlocks, today) : undefined;
  const goalsOfCycle = active ? cycleGoals.filter((g) => g.cycleId === active.id) : [];
  const evaluations = active
    ? goalsOfCycle.map((g) =>
        evaluateCycleGoal(g, {
          cycle: active,
          blocks: cycleBlocks,
          blockDays,
          sessions,
          exercises,
          bodyWeights,
        }),
      )
    : [];
  const progress = active
    ? cycleProgress(active, cycleBlocks, blockDays, sessions, evaluations, today)
    : null;

  return (
    <div className="space-y-5">
      {active && progress && (
        <>
          <Card title="Ciclo ativo">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-base font-bold">{active.name}</p>
                <p className="text-[11px] text-muted-foreground">
                  {formatDateShortBR(active.startDate)} — {formatDateShortBR(active.endDate)} ·{" "}
                  {progress.totalDays} dias
                </p>
              </div>
              {active.goalId && (
                <Link
                  to="/objetivo/$id"
                  params={{ id: active.goalId }}
                  className="interactive-press shrink-0 rounded-lg border border-border px-2.5 py-1.5 text-[11px] font-semibold text-muted-foreground"
                >
                  Ver em Planos
                </Link>
              )}
            </div>

            <div className="mt-3 rounded-xl border border-primary/30 bg-primary/5 p-3">
              {current ? (
                <>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-primary">
                    Bloco atual
                  </p>
                  <p className="mt-0.5 text-sm font-semibold">{current.name}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {formatDateShortBR(current.startDate)} — {formatDateShortBR(current.endDate)}
                    {current.focus ? ` · foco: ${current.focus}` : ""}
                  </p>
                </>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Hoje está fora dos blocos deste ciclo — nenhuma programação do ciclo está valendo.
                </p>
              )}
              {upcoming && (
                <p className="mt-2 border-t border-border pt-2 text-[11px] text-muted-foreground">
                  Próxima mudança: <span className="font-semibold">{upcoming.name}</span> em{" "}
                  {formatDateShortBR(upcoming.startDate)}
                </p>
              )}
            </div>

            <ProgressRow progress={progress} />
          </Card>

          <Card title="Cronograma dos blocos">
            <ul className="space-y-2">
              {cycleBlocks.map((block) => (
                <li key={block.id}>
                  <BlockRow
                    block={block}
                    isCurrent={block.id === current?.id}
                    isPast={block.endDate < today}
                    planCount={plansOfBlock(blockPlans, plans, block.id).length}
                    dayCount={daysOfBlock(blockDays, block.id).filter((d) => d.planId).length}
                    onOpen={() => setOpenBlockId(block.id)}
                  />
                </li>
              ))}
            </ul>
            {cycleBlocks.length === 0 && (
              <p className="text-xs text-muted-foreground">Este ciclo ainda não tem blocos.</p>
            )}
          </Card>

          <CycleGoalsCard cycle={active} blocks={cycleBlocks} evaluations={evaluations} />
        </>
      )}

      {drafts.length > 0 && (
        <Card title="Rascunhos">
          <ul className="space-y-2">
            {drafts.map((cycle) => (
              <li key={cycle.id}>
                <DraftRow
                  cycle={cycle}
                  blocks={blocksForCycle(blocks, cycle.id)}
                  pending={activateAction.pending}
                  onOpenBlock={setOpenBlockId}
                  onActivate={() => activateAction.run(() => activateCycle(cycle.id))}
                />
              </li>
            ))}
          </ul>
          {activateAction.error && (
            <InlineError
              message={activateAction.error}
              onRetry={activateAction.clearError}
              className="mt-2"
            />
          )}
        </Card>
      )}

      {!active && drafts.length === 0 && (
        <Card title="Nenhum ciclo ativo">
          <p className="text-sm text-muted-foreground">
            Sem ciclo ativo, o treino de hoje segue o "Plano da semana".
          </p>
        </Card>
      )}

      <button
        onClick={() => setCreating(true)}
        className="interactive-press flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border py-3 text-xs font-semibold text-muted-foreground hover:border-primary/40 hover:text-primary"
      >
        <Plus className="h-4 w-4" /> Novo ciclo
      </button>

      {past.length > 0 && (
        <details className="group border-t border-border pt-3" open={showPast}>
          <summary
            onClick={(e) => {
              e.preventDefault();
              setShowPast((v) => !v);
            }}
            className="flex cursor-pointer list-none items-center gap-3"
          >
            <CalendarRange className="h-5 w-5 text-muted-foreground" />
            <div className="flex-1">
              <p className="text-sm font-semibold">Ciclos anteriores</p>
              <p className="text-xs text-muted-foreground">{past.length} encerrados</p>
            </div>
            <ChevronDown
              className={`h-4 w-4 text-muted-foreground transition-transform ${showPast ? "rotate-180" : ""}`}
            />
          </summary>
          {showPast && (
            <ul className="mt-3 space-y-2">
              {past.map((cycle) => (
                <li
                  key={cycle.id}
                  className="flex items-center justify-between gap-2 rounded-lg border border-border bg-surface-2 p-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{cycle.name}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {formatDateShortBR(cycle.startDate)} — {formatDateShortBR(cycle.endDate)}
                    </p>
                  </div>
                  {cycle.status === "concluido" && (
                    <button
                      onClick={() => void setCycleStatus(cycle.id, "arquivado")}
                      className="interactive-press shrink-0 text-[11px] text-muted-foreground underline"
                    >
                      arquivar
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </details>
      )}

      {creating && <CycleCreatorModal onClose={() => setCreating(false)} />}
      {openBlockId && <BlockSheet blockId={openBlockId} onClose={() => setOpenBlockId(null)} />}
    </div>
  );
}

/** Os três indicadores lado a lado, cada um com o seu denominador. */
function ProgressRow({ progress }: { progress: ReturnType<typeof cycleProgress> }) {
  const adherence =
    progress.plannedSessions > 0
      ? Math.round((progress.doneSessions / progress.plannedSessions) * 100)
      : null;
  return (
    <div className="mt-3 grid grid-cols-3 gap-2">
      <Indicator
        label="Tempo"
        value={`${progress.elapsedDays}/${progress.totalDays}`}
        hint="dias corridos"
      />
      <Indicator
        label="Treinos"
        value={`${progress.doneSessions}/${progress.plannedSessions}`}
        hint={adherence !== null ? `${adherence}% do programado` : "nada programado ainda"}
        tone={adherence !== null && adherence >= 80 ? "good" : undefined}
      />
      <Indicator
        label="Metas"
        value={progress.goalsTotal > 0 ? `${progress.goalsReached}/${progress.goalsTotal}` : "—"}
        hint={progress.goalsTotal > 0 ? "atingidas" : "sem metas"}
      />
    </div>
  );
}

function Indicator({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint: string;
  tone?: "good";
}) {
  return (
    <div className="rounded-xl border border-border bg-surface-2 p-2.5 text-center">
      <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p
        className={`mt-0.5 font-mono text-base font-bold tabular-nums ${tone === "good" ? "text-success" : ""}`}
      >
        {value}
      </p>
      <p className="text-[9px] leading-tight text-muted-foreground">{hint}</p>
    </div>
  );
}

function BlockRow({
  block,
  isCurrent,
  isPast,
  planCount,
  dayCount,
  onOpen,
}: {
  block: CycleBlock;
  isCurrent: boolean;
  isPast: boolean;
  planCount: number;
  dayCount: number;
  onOpen: () => void;
}) {
  return (
    <button
      onClick={onOpen}
      className={`flex w-full items-center justify-between gap-2 rounded-lg border p-3 text-left transition-colors ${
        isCurrent
          ? "border-primary/50 bg-primary/10"
          : isPast
            ? "border-border bg-surface-2 opacity-70"
            : "border-border bg-surface-2 hover:border-primary/40"
      }`}
    >
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold">
          {block.name}
          {isCurrent && <span className="ml-2 text-[10px] font-bold text-primary">agora</span>}
        </p>
        <p className="text-[11px] text-muted-foreground">
          {formatDateShortBR(block.startDate)} — {formatDateShortBR(block.endDate)} ·{" "}
          {blockDurationDays(block)} dias
        </p>
        <p className="text-[11px] text-muted-foreground">
          {planCount} treinos · {dayCount} dias na semana
          {block.focus ? ` · ${block.focus}` : ""}
        </p>
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
    </button>
  );
}

function DraftRow({
  cycle,
  blocks,
  pending,
  onOpenBlock,
  onActivate,
}: {
  cycle: WorkoutCycle;
  blocks: CycleBlock[];
  pending: boolean;
  onOpenBlock: (id: string) => void;
  onActivate: () => void;
}) {
  const blockPlans = useCycleStore((s) => s.blockPlans);
  const ready =
    blocks.length > 0 && blocks.some((b) => blockPlans.some((bp) => bp.blockId === b.id));
  return (
    <div className="rounded-lg border border-border bg-surface-2 p-3">
      <p className="text-sm font-semibold">{cycle.name}</p>
      <p className="text-[11px] text-muted-foreground">
        {formatDateShortBR(cycle.startDate)} — {formatDateShortBR(cycle.endDate)} · {blocks.length}{" "}
        blocos
      </p>
      <ul className="mt-2 space-y-1">
        {blocks.map((b) => (
          <li key={b.id}>
            <button
              onClick={() => onOpenBlock(b.id)}
              className="interactive-press flex w-full items-center justify-between gap-2 rounded-md border border-border bg-surface px-2 py-1.5 text-left text-[11px]"
            >
              <span className="truncate">{b.name}</span>
              <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            </button>
          </li>
        ))}
      </ul>
      <button
        onClick={onActivate}
        disabled={pending || !ready}
        className="interactive-press mt-3 w-full rounded-xl bg-primary py-2.5 text-xs font-bold text-primary-foreground disabled:opacity-40"
      >
        {pending ? "Ativando…" : "Ativar ciclo"}
      </button>
      {!ready && (
        <p className="mt-1.5 text-center text-[10px] text-muted-foreground">
          Adicione ao menos um treino a um bloco antes de ativar.
        </p>
      )}
    </div>
  );
}
