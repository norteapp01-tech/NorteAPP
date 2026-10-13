import { createFileRoute, Link } from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  Plus,
  Trash2,
  Play,
  Check,
  Dumbbell,
  BookOpen,
  Salad,
  CalendarClock,
  Layers3,
  Settings2,
  Route as RouteIcon,
  CircleDollarSign,
  HandHeart,
  Footprints,
  ArrowDownToLine,
  SkipForward,
} from "lucide-react";
import { categoryMeta } from "@/lib/mock-data";
import { InlineError } from "@/components/ui/inline-error";
import { useAsyncAction } from "@/hooks/use-async-action";
import { useProfile } from "@/lib/profile-store";
import { formatTime } from "@/lib/format-utils";
import { nowDate, nowMs } from "@/lib/test-clock";
import {
  useGoalsStore,
  createRoutine,
  toggleRoutineActive,
  removeRoutine,
  todayISO,
  toISODate,
  addDays,
  relevantDate,
  formatDateBR,
} from "@/lib/goals-store";
import {
  useWorkoutStore,
  exercisesForPlan,
  todaysPlanId,
  sessionForToday,
  exerciseWeightSeries,
  previousFinishedSession,
  sessionSummary,
  workoutInsights,
  finishedSessionsInRange,
  createPlan,
  removePlan,
  addExercise,
  removeExercise,
  setWeeklyAssignment,
  startSession,
  startRest,
  sessionElapsedSeconds,
  sessionPlanned,
  exerciseCompletionState,
  libraryPlans,
  logSet,
  updateSet,
  removeLastSet,
  completeExerciseLog,
  skipExercise,
  skipSet,
  seriesPosition,
  setSessionPerceivedEffort,
  regularSetCount,
  addBodyWeight,
  currentBodyWeight,
  bodyWeightsByDateDesc,
  type WorkoutPlan,
  type WorkoutSession,
  type Exercise,
  type SetTarget,
  type PlannedExercise,
  type ExerciseComparisonKind,
  type WorkoutPerceivedEffort,
} from "@/lib/workout-store";
import { formatDurationClock } from "@/lib/sport-store";
import { useGymSession } from "@/lib/gym-session-context";
import { recordsForSession, resolveSets } from "@/lib/workout-evolution";
import { DropInputs, suggestDrop, type DropDraft } from "@/components/academia/DropFields";
import { SwipeToSkip } from "@/components/academia/SwipeToSkip";
import { TimerBlock } from "@/components/academia/TimerBlock";
import { PlanExerciseEditor } from "@/components/academia/PlanExerciseEditor";
import { CycleTab } from "@/components/academia/cycle/CycleTab";
import { EvolutionTab } from "@/components/academia/evolution/EvolutionTab";
import {
  activeCycle,
  blocksForCycle,
  plannedSessionsInRange,
  todayProgramming,
  useCycleStore,
  type TodayProgramming,
} from "@/lib/workout-cycle-store";
import { EsportesModule } from "@/components/esportes/EsportesModule";
import { LeituraModule } from "@/components/reading/LeituraModule";
import { AlimentacaoModule } from "@/components/nutrition/AlimentacaoModule";
import { FinancasModule } from "@/components/finance/FinancasModule";
import { FeModule } from "@/components/fe/FeModule";
import { Modal } from "@/components/ui/modal";
import { NumberField } from "@/components/ui/number-field";
import { ChartSkeleton } from "@/components/ui/chart-skeleton";
import { SettingsPanel } from "@/components/settings/SettingsPanel";
import { CategoryIcon } from "@/components/plan/CategoryIcon";
import { AppMenuButton, UnderlineTabs, WeekdaySelector } from "@/components/ui/app-design-system";

// recharts só baixa quando o modal de um exercício realmente abre — Leitura,
// Alimentação, Finanças, Fé e Trabalho (que também passam por este arquivo)
// nunca precisam desse chunk.
const ExerciseEvolutionChart = lazy(() =>
  import("@/components/academia/ExerciseEvolutionChart").then((m) => ({
    default: m.ExerciseEvolutionChart,
  })),
);
import { Card, weekdayLabels } from "@/components/sub-agenda-shared";

export const Route = createFileRoute("/sub-agenda/$categoria")({
  // `aba` e `etapa` existem para o atalho "Ver evolução desta etapa" abrir a
  // Evolução já filtrada — e para o endereço poder ser compartilhado.
  validateSearch: (search: Record<string, unknown>): { aba?: string; etapa?: string } => ({
    aba: typeof search.aba === "string" ? search.aba : undefined,
    etapa: typeof search.etapa === "string" ? search.etapa : undefined,
  }),
  head: () => ({ meta: [{ title: `Sub-agenda — Norte` }] }),
  component: SubAgenda,
});

function SubAgenda() {
  const { categoria } = Route.useParams();
  const meta = categoryMeta[categoria] ?? categoryMeta.generico;
  const [settingsOpen, setSettingsOpen] = useState(false);
  const pageClasses: Record<string, string> = {
    academia: "academia-page",
    esportes: "esportes-page",
    alimentacao: "nutrition-page",
    leitura: "reading-page",
    fe: "faith-page",
    financas: "finance-page",
  };

  return (
    <div className={`norte-page ${pageClasses[categoria] ?? ""}`}>
      <header className="norte-routine-header">
        <Link to="/" className="gap-1 text-xs text-muted-foreground">
          <ChevronLeft className="h-4 w-4" /> Hoje
        </Link>
        <h1>{meta.label}</h1>
        <AppMenuButton
          onClick={() => setSettingsOpen(true)}
          aria-label="Abrir configurações"
          className="norte-local-global-action"
        />
      </header>

      {categoria !== "leitura" &&
        categoria !== "alimentacao" &&
        categoria !== "financas" &&
        categoria !== "fe" &&
        categoria !== "academia" &&
        categoria !== "esportes" && (
          <div className="mt-6">
            <RoutineConfigCard categoria={categoria} />
          </div>
        )}

      {categoria === "academia" && <AcademiaModule />}
      {categoria === "esportes" && <EsportesModule />}
      {categoria === "leitura" && <LeituraModule />}
      {categoria === "alimentacao" && <AlimentacaoModule />}
      {categoria === "financas" && <FinancasModule />}
      {categoria === "fe" && <FeModule />}
      {(categoria === "trabalho" || categoria === "generico") && (
        <GenericoModule categoria={categoria} />
      )}
      {settingsOpen && <SettingsPanel onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}

/** Configuro a rotina -> defino dias/horários -> ela vira agenda de verdade. */
function RoutineConfigCard({ categoria }: { categoria: string }) {
  const routines = useGoalsStore((s) => s.routines.filter((r) => r.category === categoria));
  const profile = useProfile();
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [weekday, setWeekday] = useState(1);
  const [time, setTime] = useState("18:00");

  const save = () => {
    if (!title.trim()) return;
    createRoutine({ category: categoria, title: title.trim(), weekday, time });
    setTitle("");
    setAdding(false);
  };

  return (
    <Card title="Sua rotina">
      {routines.length === 0 && !adding && (
        <p className="text-sm text-muted-foreground">
          Nenhum horário configurado ainda. Defina dia e hora e isso vira agenda de verdade.
        </p>
      )}
      {routines.length > 0 && (
        <ul className="space-y-2">
          {routines.map((r) => (
            <li
              key={r.id}
              className={`flex items-center gap-3 rounded-lg border border-border bg-surface-2 p-3 ${!r.active ? "opacity-50" : ""}`}
            >
              <div className="flex flex-col items-center rounded-md bg-surface px-2 py-1.5 text-center">
                <span className="text-[10px] uppercase text-muted-foreground">
                  {weekdayLabels[r.weekday]}
                </span>
                <span className="font-mono text-xs font-bold">
                  {formatTime(r.time, profile.timeFormat)}
                </span>
              </div>
              <p className="flex-1 truncate text-sm font-medium">{r.title}</p>
              <button
                onClick={() => toggleRoutineActive(r.id, r.active)}
                className={`rounded-full px-2 py-1 text-[10px] font-semibold ${r.active ? "bg-primary/15 text-primary" : "bg-surface text-muted-foreground"}`}
              >
                {r.active ? "ativa" : "pausada"}
              </button>
              <button
                onClick={() => removeRoutine(r.id)}
                className="text-muted-foreground hover:text-danger"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {!adding ? (
        <button
          onClick={() => setAdding(true)}
          className="mt-3 flex w-full items-center justify-center gap-1 rounded-xl border border-dashed border-border py-2.5 text-xs text-muted-foreground hover:border-primary/40 hover:text-primary"
        >
          <Plus className="h-3 w-3" /> configurar horário
        </button>
      ) : (
        <div className="mt-3 space-y-2 rounded-xl border border-border bg-surface-2 p-3">
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Ex: Treino, Leitura, Café da manhã"
            className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
          />
          <div className="flex flex-wrap gap-1.5">
            {weekdayLabels.map((l, i) => (
              <button
                key={l}
                onClick={() => setWeekday(i)}
                className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${weekday === i ? "bg-primary text-primary-foreground" : "border border-border bg-surface text-muted-foreground"}`}
              >
                {l}
              </button>
            ))}
          </div>
          <input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
          />
          <button
            onClick={save}
            className="w-full rounded-lg bg-primary py-2 text-xs font-semibold text-primary-foreground"
          >
            Salvar horário
          </button>
        </div>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Academia — diário de treino: plano semanal, treinos cadastrados, treino de
// hoje (série a série, timer de descanso), resumo ao finalizar, peso corporal.
// ---------------------------------------------------------------------------
function AcademiaModule() {
  const search = Route.useSearch();
  const profile = useProfile();
  const gymRoutines = useGoalsStore((s) =>
    s.routines.filter((r) => r.category === "academia" && r.active),
  );
  const plans = useWorkoutStore((s) => s.plans);
  const exercises = useWorkoutStore((s) => s.exercises);
  const sessions = useWorkoutStore((s) => s.sessions);
  const weeklyAssignment = useWorkoutStore((s) => s.weeklyAssignment);
  const bodyWeights = useWorkoutStore((s) => s.bodyWeights);
  const cycles = useCycleStore((s) => s.cycles);
  const blocks = useCycleStore((s) => s.blocks);
  const blockDays = useCycleStore((s) => s.blockDays);

  const gym = useGymSession();
  const [pickerDay, setPickerDay] = useState<number | null>(null);
  const [openExerciseId, setOpenExerciseId] = useState<string | null>(null);
  const [summarySessionId, setSummarySessionId] = useState<string | null>(null);
  const [showWeightInput, setShowWeightInput] = useState(false);
  const [weightDraft, setWeightDraft] = useState("");
  const [savingWeight, setSavingWeight] = useState(false);
  // `ciclo` continua sendo o identificador interno: o rótulo mudou para
  // "Planejamento", os dados e as rotas não.
  const [activeTab, setActiveTab] = useState<"treino" | "evolucao" | "ciclo">(
    search.aba === "evolucao" ? "evolucao" : search.aba === "planejamento" ? "ciclo" : "treino",
  );
  const [showRoutineConfig, setShowRoutineConfig] = useState(false);
  const startAction = useAsyncAction();

  // Finalizar pelo painel flutuante acontece de qualquer tela; o resumo mora
  // aqui, então o contexto avisa qual sessão abrir assim que a aba carrega.
  useEffect(() => {
    if (!gym.finishedSummaryId) return;
    setSummarySessionId(gym.finishedSummaryId);
    gym.setFinishedSummaryId(null);
  }, [gym]);

  // Qual programação vale hoje. O ciclo ativo tem precedência sobre o "Plano da
  // semana" solto — e a origem é dita em voz alta logo abaixo, porque combinar
  // as duas em silêncio esconderia qual delas está mandando.
  const programming = todayProgramming(
    { cycles, blocks, blockDays },
    weeklyAssignment,
    todayISO(),
    nowDate().getDay(),
  );
  // Só quando um bloco está realmente vigente: fora dos blocos, o ciclo não
  // tem semana pra mostrar e o plano solto volta a ser a única fonte.
  const currentBlockDays = programming.block
    ? blockDays.filter((d) => d.blockId === programming.block!.id)
    : null;
  const todayPlanId = programming.planId;
  const todayPlan = plans.find((p) => p.id === todayPlanId);
  const todayDoneSession = todayPlanId ? sessionForToday(sessions, todayPlanId) : undefined;
  // O treino em andamento pode ser de ontem: uma sessão aberta e esquecida
  // some da tela se a busca for só por hoje, e fica aberta pra sempre.
  const liveSession = gym.session;
  const liveIsToday = liveSession?.date === todayISO();
  const livePlan = plans.find((p) => p.id === liveSession?.planId);
  const livePlanned = liveSession ? sessionPlanned(liveSession, exercises) : [];
  const liveCompletedCount = livePlanned.filter(
    (p) =>
      exerciseCompletionState(
        liveSession?.exerciseLogs.find((l) => l.exerciseId === p.exerciseId),
        p,
      ) === "concluido",
  ).length;
  const todayExercises = todayPlan ? exercisesForPlan(exercises, todayPlan.id) : [];
  const openExercise = exercises.find((e) => e.id === openExerciseId);
  const openPlanned = livePlanned.find((p) => p.exerciseId === openExerciseId);

  const sortedWeights = bodyWeightsByDateDesc(bodyWeights);
  const currentWeight = currentBodyWeight(bodyWeights)?.weight;
  const olderWeight =
    sortedWeights.find((b) => {
      const days = Math.round((nowMs() - new Date(b.date).getTime()) / 86400000);
      return days >= 20;
    }) ?? sortedWeights[sortedWeights.length - 1];
  const weightDelta =
    currentWeight !== undefined && olderWeight
      ? Math.round((currentWeight - olderWeight.weight) * 10) / 10
      : undefined;

  const tabs = (
    <UnderlineTabs
      items={
        [
          { key: "treino", label: "Treino" },
          { key: "evolucao", label: "Evolução" },
          { key: "ciclo", label: "Programa" },
        ] as const
      }
      value={activeTab}
      onChange={setActiveTab}
    />
  );

  if (activeTab === "evolucao") {
    return (
      <div className="mt-6 space-y-5">
        {tabs}
        <EvolutionTab initialStageId={search.etapa} />
      </div>
    );
  }

  if (activeTab === "ciclo") {
    return (
      <div className="mt-6 space-y-5">
        {tabs}
        <CycleTab />
      </div>
    );
  }

  return (
    <div className="academia-training mt-6 space-y-5">
      {tabs}
      <section className="academia-hero-card">
        <div className="academia-hero-copy">
          {liveSession ? (
            <>
              <p className="academia-hero-eyebrow">
                Treino em andamento{liveSession.pausedAt ? " · pausado" : ""}
              </p>
              <h2 className="academia-hero-title">
                {livePlan ? `${livePlan.letter} · ${livePlan.name}` : "Treino em andamento"}
              </h2>
              <p className="academia-hero-subtitle">
                {programming.block?.focus || livePlan?.muscleGroups || "Treino"} ·{" "}
                {formatDurationClock(sessionElapsedSeconds(liveSession))}
              </p>
            </>
          ) : (
            <>
              <p className="academia-hero-eyebrow">Treino de hoje</p>
              <h2 className="academia-hero-title">
                {todayPlan ? `${todayPlan.letter} · ${todayPlan.name}` : "Dia de descanso"}
              </h2>
              {todayPlan && (
                <p className="academia-hero-subtitle">
                  {programming.block?.focus || todayPlan.muscleGroups || "Treino programado"}
                </p>
              )}
            </>
          )}
          <div className="academia-hero-meta">
            <ProgrammingSource programming={programming} />

            {!todayPlan && !liveSession && (
              <p className="text-sm text-muted-foreground">
                {programming.source === "descanso"
                  ? "Descanso programado pelo ciclo."
                  : "Hoje é dia de descanso."}
              </p>
            )}

            {/* Treino em andamento — pode ser o de hoje ou um aberto em outro dia
            e nunca finalizado, que antes sumia da tela sem jeito de retomar. */}
            {liveSession && (
              <>
                {!liveIsToday && (
                  <p className="mb-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-[11px] text-warning">
                    Treino {livePlan ? `${livePlan.letter} ` : ""}de{" "}
                    {formatDateBR(liveSession.date)} ainda está aberto. Retome pra continuar ou
                    finalize pra fechar o registro.
                  </p>
                )}
                <div className="academia-hero-progress-label">
                  <span>
                    {liveCompletedCount} de {livePlanned.length} exercícios concluídos
                  </span>
                </div>
                <div
                  role="progressbar"
                  aria-label="Progresso do treino"
                  aria-valuenow={liveCompletedCount}
                  aria-valuemin={0}
                  aria-valuemax={livePlanned.length}
                  className="academia-hero-progress"
                >
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{
                      width: `${livePlanned.length ? (liveCompletedCount / livePlanned.length) * 100 : 0}%`,
                    }}
                  />
                </div>
                <button
                  onClick={() => gym.setPanelOpen(true)}
                  className="academia-hero-action interactive-press"
                >
                  Abrir controle <ChevronRight className="h-4 w-4" />
                </button>
              </>
            )}

            {/* Sem treino em andamento: a sessão só nasce por um toque explícito em
            "Iniciar treino". Tocar num exercício aqui só mostra o que está
            planejado — não começa nada por acidente. */}
            {!liveSession && todayPlan && todayDoneSession?.status !== "concluido" && (
              <>
                {todayExercises.length === 0 ? (
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    Esse treino ainda não tem exercícios — adicione em "Treinos cadastrados".
                  </p>
                ) : (
                  <button
                    onClick={() =>
                      startAction.run(async () => {
                        await startSession(todayPlan.id);
                        gym.setPanelOpen(true);
                      })
                    }
                    disabled={startAction.pending}
                    className="academia-hero-action interactive-press disabled:opacity-50"
                  >
                    <Play className="h-4 w-4" />
                    {startAction.pending ? "Iniciando…" : "Iniciar treino"}
                  </button>
                )}
                {startAction.error && (
                  <InlineError
                    message={startAction.error}
                    onRetry={startAction.clearError}
                    className="mt-2"
                  />
                )}
              </>
            )}

            {!liveSession && todayDoneSession?.status === "concluido" && (
              <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <Check className="check-enter h-4 w-4 shrink-0 text-success" /> Treino concluído
                hoje —{" "}
                <button
                  onClick={() => setSummarySessionId(todayDoneSession.id)}
                  className="-my-2 rounded px-1 py-2 font-medium text-primary decoration-2 underline decoration-dotted underline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-success"
                >
                  ver resumo
                </button>
              </div>
            )}
          </div>
        </div>
      </section>

      {(liveSession || (todayPlan && todayDoneSession?.status !== "concluido")) && (
        <section className="academia-exercises-section">
          <div className="academia-section-heading">
            <h2>Exercícios</h2>
            <span>
              {liveSession ? liveCompletedCount : 0} de{" "}
              {liveSession ? livePlanned.length : todayExercises.length}
            </span>
          </div>
          <ul className="academia-exercise-list">
            {(liveSession ? livePlanned : todayExercises).map((exercise, exerciseIndex) => {
              const exerciseId = "exerciseId" in exercise ? exercise.exerciseId : exercise.id;
              const planned = "exerciseId" in exercise ? exercise : null;
              const log = liveSession?.exerciseLogs.find((item) => item.exerciseId === exerciseId);
              const state = planned ? exerciseCompletionState(log, planned) : "pendente";
              const next =
                !!liveSession &&
                state !== "concluido" &&
                livePlanned.slice(0, exerciseIndex).every(
                  (prior) =>
                    exerciseCompletionState(
                      liveSession.exerciseLogs.find((item) => item.exerciseId === prior.exerciseId),
                      prior,
                    ) === "concluido",
                );
              const name = "exerciseId" in exercise ? exercise.name : exercise.name;
              const setsTarget =
                "exerciseId" in exercise ? exercise.setsTarget : exercise.setsTarget;
              const loadTarget =
                "exerciseId" in exercise ? exercise.loadTarget : exercise.loadTarget;
              const row = (
                <>
                  <span className="academia-exercise-index">{exerciseIndex + 1}</span>
                  <span
                    className={`academia-exercise-state ${state === "concluido" ? "is-complete" : next ? "is-next" : ""}`}
                  >
                    {state === "concluido" && <Check className="h-4 w-4" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <strong>{name}</strong>
                    <small>
                      {next ? "Próximo · " : ""}
                      {log?.skipped && !log.sets.length
                        ? "Pulado"
                        : `${regularSetCount(log)}/${setsTarget} séries · ${loadTarget} kg`}
                    </small>
                  </span>
                  {exerciseIndex === 0 && state === "concluido" ? (
                    <span className="text-lg text-muted-foreground">•••</span>
                  ) : (
                    <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
                  )}
                </>
              );
              return (
                <li key={exerciseId}>
                  {liveSession ? (
                    <button
                      onClick={() => {
                        gym.select(exerciseId);
                        setOpenExerciseId(exerciseId);
                      }}
                      className="interactive-press"
                    >
                      {row}
                    </button>
                  ) : (
                    <div>{row}</div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section className="academia-week-section">
        <div className="academia-section-heading">
          <h2>Plano da semana</h2>
          <button onClick={() => setShowRoutineConfig(true)} className="interactive-press">
            Horários <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        <div className="academia-week-card">
          {/* Com uma etapa vigente, a semana é a DELA. Continuar mostrando a
              atribuição antiga aqui e a do ciclo no card de hoje colocaria duas
              programações na mesma tela sem dizer qual manda. */}
          <WeekdaySelector
            onSelect={currentBlockDays ? () => setActiveTab("ciclo") : setPickerDay}
            primary={(weekday) => {
              if (currentBlockDays) {
                const day = currentBlockDays.find((d) => d.weekday === weekday);
                return plans.find((p) => p.id === day?.planId)?.letter ?? "—";
              }
              return plans.find((p) => p.id === weeklyAssignment[weekday])?.letter ?? "—";
            }}
            secondary={(weekday) => {
              if (currentBlockDays) {
                return currentBlockDays.find((d) => d.weekday === weekday)?.startTime ?? "—";
              }
              const routine = gymRoutines.find((r) => r.weekday === weekday);
              return routine ? formatTime(routine.time, profile.timeFormat) : "—";
            }}
          />
          {currentBlockDays && programming.block && (
            <button
              onClick={() => setActiveTab("ciclo")}
              className="interactive-press mt-4 flex min-h-11 w-full items-center justify-between gap-2 border-t border-border pt-3 text-left text-xs text-muted-foreground"
            >
              <span>
                Etapa atual ·{" "}
                <strong className="font-semibold text-foreground">{programming.block.name}</strong>
              </span>
              <ChevronRight className="h-4 w-4 shrink-0" />
            </button>
          )}
        </div>
      </section>

      <PlanManagerCard />

      <details className="academia-settings-row group">
        <summary>
          <Settings2 className="h-5 w-5 text-muted-foreground" />
          <div className="flex-1">
            <p className="text-sm font-semibold">Ajustes da academia</p>
            <p className="text-xs text-muted-foreground">Descanso, histórico e preferências</p>
          </div>
          <ChevronRight className="h-5 w-5 text-muted-foreground transition-transform group-open:rotate-90" />
        </summary>
        <div className="academia-settings-content">
          <button onClick={() => setShowRoutineConfig(true)}>Configurar horários</button>
          <div className="academia-weight-row">
            <div>
              <span>Peso corporal</span>
              <strong>{currentWeight !== undefined ? currentWeight.toFixed(1) : "—"} kg</strong>
              {weightDelta !== undefined && olderWeight && (
                <small>
                  {weightDelta > 0 ? "+" : ""}
                  {weightDelta} kg no período
                </small>
              )}
            </div>
            {!showWeightInput ? (
              <button
                onClick={() => {
                  setWeightDraft(currentWeight !== undefined ? String(currentWeight) : "");
                  setShowWeightInput(true);
                }}
                className="interactive-press"
              >
                + registrar
              </button>
            ) : (
              <div className="flex items-center gap-1.5">
                <input
                  autoFocus
                  type="number"
                  step="0.1"
                  value={weightDraft}
                  onChange={(e) => setWeightDraft(e.target.value)}
                  className="w-20 rounded-lg border border-border bg-surface px-2 py-2 text-sm outline-none focus:border-primary"
                />
                <button
                  disabled={savingWeight}
                  onClick={async () => {
                    if (savingWeight) return;
                    const w = parseFloat(weightDraft);
                    setSavingWeight(true);
                    try {
                      if (w > 0) await addBodyWeight(w);
                      setShowWeightInput(false);
                    } finally {
                      setSavingWeight(false);
                    }
                  }}
                  className="rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-60"
                >
                  ok
                </button>
              </div>
            )}
          </div>
        </div>
      </details>

      {pickerDay !== null && (
        <WeekdayPlanPicker
          weekday={pickerDay}
          plans={plans}
          onPick={async (planId) => {
            await setWeeklyAssignment(pickerDay, planId);
            setPickerDay(null);
          }}
          onClose={() => setPickerDay(null)}
        />
      )}
      {openExercise && liveSession && openPlanned && (
        <ExerciseModal
          session={liveSession}
          exercise={openExercise}
          planned={openPlanned}
          onClose={() => setOpenExerciseId(null)}
          onLogged={(restSeconds) => {
            // Mesmo descanso do painel flutuante: um relógio só, no banco,
            // derivado de horário — não um contador local que morria ao sair
            // da tela.
            if (gym.autoRest && restSeconds > 0) void startRest(liveSession.id, restSeconds);
          }}
        />
      )}
      {summarySessionId && (
        <FinishSummaryModal
          sessionId={summarySessionId}
          onClose={() => setSummarySessionId(null)}
        />
      )}
      {showRoutineConfig && (
        <Modal onClose={() => setShowRoutineConfig(false)} title="Horários de treino">
          <RoutineConfigCard categoria="academia" />
        </Modal>
      )}
    </div>
  );
}

/** Diz de onde vem o treino de hoje. Sem isso, com um ciclo ativo e um "Plano
 * da semana" antigo apontando pra outro treino, a tela mostraria um dos dois
 * sem explicar qual — e a outra programação pareceria ter sumido. */
function ProgrammingSource({ programming }: { programming: TodayProgramming }) {
  if (programming.source === "semana") return null;
  if (!programming.cycle) return null;
  const detail = programming.outsideBlocks
    ? "hoje está fora das etapas"
    : programming.block
      ? programming.block.name
      : "";
  return (
    <p className="mb-2 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
      <span className="rounded-full bg-primary/15 px-2 py-0.5 font-semibold text-primary">
        ciclo
      </span>
      <span className="min-w-0">
        {programming.cycle.name}
        {detail ? ` · ${detail}` : ""}
      </span>
    </p>
  );
}

function WeekdayPlanPicker({
  weekday,
  plans,
  onPick,
  onClose,
}: {
  weekday: number;
  plans: WorkoutPlan[];
  onPick: (planId: string | null) => void;
  onClose: () => void;
}) {
  return (
    <Modal onClose={onClose} title={weekdayLabels[weekday]}>
      <div className="space-y-2">
        <button
          onClick={() => onPick(null)}
          className="card-surface w-full p-3 text-left text-sm font-semibold hover:border-primary/40"
        >
          Descanso
        </button>
        {plans.map((p) => (
          <button
            key={p.id}
            onClick={() => onPick(p.id)}
            className="card-surface flex w-full items-center gap-3 p-3 text-left hover:border-primary/40"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-sm font-semibold text-muted-foreground">
              {p.letter}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{p.name}</p>
              <p className="text-[11px] text-muted-foreground">{p.muscleGroups}</p>
            </div>
          </button>
        ))}
      </div>
    </Modal>
  );
}

function PlanManagerCard() {
  const plans = useWorkoutStore((s) => libraryPlans(s.plans));
  const exercises = useWorkoutStore((s) => s.exercises);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showNewPlan, setShowNewPlan] = useState(false);
  const [newPlan, setNewPlan] = useState({ letter: "", name: "" });
  const [creatingPlan, setCreatingPlan] = useState(false);

  return (
    <details className="academia-library-row group">
      <summary>
        <Layers3 className="h-5 w-5 text-muted-foreground" />
        <div className="flex-1">
          <p className="text-sm font-semibold">Treinos cadastrados</p>
          <p className="text-xs text-muted-foreground">
            {plans.length} treinos · {exercises.length} exercícios
          </p>
        </div>
        <ChevronRight className="h-5 w-5 text-muted-foreground transition-transform group-open:rotate-90" />
      </summary>
      <div className="mt-3">
        <div className="space-y-2">
          {plans.map((p) => (
            <div key={p.id} className="rounded-lg border border-border bg-surface-2 p-3">
              <div className="flex w-full items-center gap-3">
                <button
                  onClick={() => setExpandedId(expandedId === p.id ? null : p.id)}
                  className="flex min-w-0 flex-1 items-center gap-3 text-left"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-sm font-semibold text-muted-foreground">
                    {p.letter}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{p.name}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {exercisesForPlan(exercises, p.id).length} exercícios
                    </p>
                  </div>
                  {expandedId === p.id ? (
                    <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                  )}
                </button>
                <button
                  onClick={async () => {
                    await removePlan(p.id);
                  }}
                  className="shrink-0 text-muted-foreground hover:text-danger"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
              {expandedId === p.id && <PlanExerciseEditor planId={p.id} />}
            </div>
          ))}
          {plans.length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhum treino cadastrado ainda.</p>
          )}
        </div>
        {!showNewPlan ? (
          <button
            onClick={() => setShowNewPlan(true)}
            className="mt-3 flex w-full items-center justify-center gap-1 rounded-xl border border-dashed border-border py-2.5 text-xs text-muted-foreground hover:border-primary/40 hover:text-primary"
          >
            <Plus className="h-3 w-3" /> novo treino
          </button>
        ) : (
          <div className="mt-3 space-y-2 rounded-xl border border-border bg-surface-2 p-3">
            <div className="grid grid-cols-[64px_1fr] gap-2">
              <input
                autoFocus
                value={newPlan.letter}
                onChange={(e) =>
                  setNewPlan({ ...newPlan, letter: e.target.value.toUpperCase().slice(0, 2) })
                }
                placeholder="D"
                className="rounded-lg border border-border bg-surface px-2 py-2 text-center text-sm font-bold outline-none focus:border-primary"
              />
              <input
                value={newPlan.name}
                onChange={(e) => setNewPlan({ ...newPlan, name: e.target.value })}
                placeholder="Ex: Ombro + Abdômen"
                className="rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
              />
            </div>
            <button
              disabled={creatingPlan}
              onClick={async () => {
                if (creatingPlan || !newPlan.letter.trim() || !newPlan.name.trim()) return;
                setCreatingPlan(true);
                try {
                  await createPlan({
                    letter: newPlan.letter.trim(),
                    name: newPlan.name.trim(),
                    muscleGroups: "",
                  });
                  setNewPlan({ letter: "", name: "" });
                  setShowNewPlan(false);
                } finally {
                  setCreatingPlan(false);
                }
              }}
              className="w-full rounded-lg bg-primary py-2 text-xs font-semibold text-primary-foreground disabled:opacity-60"
            >
              Criar treino
            </button>
          </div>
        )}
      </div>
    </details>
  );
}

function ExerciseModal({
  session,
  exercise,
  planned,
  onClose,
  onLogged,
}: {
  session: WorkoutSession;
  exercise: Exercise;
  /** Meta gravada quando o treino começou. Editar o exercício no meio do
   * treino não muda o que esta sessão dizia que era a meta. */
  planned: PlannedExercise;
  onClose: () => void;
  onLogged: (restSeconds: number) => void;
}) {
  const gym = useGymSession();
  const sessions = useWorkoutStore((s) => s.sessions);
  const liveSession = sessions.find((s) => s.id === session.id) ?? session;
  const log = liveSession.exerciseLogs.find((l) => l.exerciseId === exercise.id);
  const allSets = log?.sets ?? [];
  const skippedIdx = log?.skippedSets ?? [];
  // Feitas + puladas: pular a série 2 leva direto à 3.
  const position = seriesPosition(log);
  // Séries somadas com "Adicionar série" — só existe depois de terminar a última.
  const [extraRows, setExtraRows] = useState(0);
  const pendingRows = Math.max(0, planned.setsTarget + extraRows - position);
  const finishedAll = pendingRows === 0 && regularSetCount(log) > 0;
  const [draftValues, setDraftValues] = useState<Record<number, { weight: string; reps: string }>>(
    {},
  );
  const lastRegular = [...allSets].reverse().find((s) => !s.isDrop);
  const draftFor = (idx: number) =>
    draftValues[idx] ?? {
      weight: String(planned.setTargets[idx]?.weight ?? lastRegular?.weight ?? planned.loadTarget),
      reps: String(planned.setTargets[idx]?.reps ?? lastRegular?.reps ?? planned.repsTarget),
    };
  const setDraftFor = (idx: number, patch: Partial<{ weight: string; reps: string }>) =>
    setDraftValues((d) => ({ ...d, [idx]: { ...draftFor(idx), ...patch } }));
  // Drop da série em andamento: vai junto com a série, pelo mesmo check.
  const [dropFor, setDropFor] = useState<Record<number, DropDraft | undefined>>({});
  const toggleDrop = (idx: number) =>
    setDropFor((m) => {
      if (m[idx]) return { ...m, [idx]: undefined };
      const d = draftFor(idx);
      return { ...m, [idx]: suggestDrop(parseFloat(d.weight) || 0, parseInt(d.reps, 10) || 0) };
    });
  // Registrar série é o toque mais repetido do app e escrevia sem trava
  // nenhuma: dois toques rápidos gravavam a série duas vezes.
  const setAction = useAsyncAction();
  const registerPlanned = (idx: number) =>
    setAction.run(async () => {
      const d = draftFor(idx);
      const w = parseFloat(d.weight) || 0;
      const r = parseInt(d.reps, 10) || 0;
      const drop = dropFor[idx];
      await logSet(
        liveSession.id,
        exercise.id,
        w,
        r,
        drop
          ? { drop: { weight: parseFloat(drop.weight) || 0, reps: parseInt(drop.reps, 10) || 0 } }
          : {},
      );
      setDropFor((m) => ({ ...m, [idx]: undefined }));
      onLogged(planned.setTargets[idx]?.restSeconds ?? planned.restSeconds);
    });
  const skipNextSet = () =>
    setAction.run(async () => {
      await skipSet(liveSession.id, exercise.id);
      // Pulou a última que faltava: com alguma série feita o exercício termina.
      if (pendingRows <= 1 && regularSetCount(log) > 0)
        await completeExerciseLog(liveSession.id, exercise.id);
    });

  const [showHistory, setShowHistory] = useState(false);
  const series = exerciseWeightSeries(sessions, exercise.planId, exercise.id);
  const skipAction = useAsyncAction();

  return (
    <Modal onClose={onClose} title={exercise.name} panelClassName="academia-exercise-modal">
      <p className="text-sm text-muted-foreground/75">
        Meta: {planned.setsTarget} séries × {planned.repsTarget} reps — {planned.loadTarget} kg
      </p>

      <div className="academia-series-list mt-5 overflow-hidden rounded-[22px] border border-border bg-surface-quiet">
        {(() => {
          type Row =
            | { kind: "set"; index: number; set: (typeof allSets)[number] }
            | { kind: "skipped"; index: number };
          const rows: Row[] = [
            ...allSets.map((set): Row => ({ kind: "set", index: set.setIndex, set })),
            ...skippedIdx.map((index): Row => ({ kind: "skipped", index })),
          ].sort((x, y) => x.index - y.index);
          let regularLabel = 0;
          return rows.map((row, i, arr) => {
            const isLast = i === arr.length - 1;
            if (row.kind === "skipped") {
              regularLabel += 1;
              return (
                <div
                  key={`skip-${row.index}`}
                  className="academia-series-row flex min-h-14 items-center gap-2 border-b border-border px-3 py-2.5 text-muted-foreground last:border-b-0"
                >
                  <span className="w-12 shrink-0 text-[11px]">Série {regularLabel}</span>
                  <span className="text-xs">pulada · zerada</span>
                  {isLast && (
                    <button
                      onClick={() => void removeLastSet(liveSession.id, exercise.id)}
                      aria-label={`Desfazer pulo da série ${regularLabel}`}
                      className="interactive-press ml-auto text-[11px] font-semibold text-primary"
                    >
                      Desfazer
                    </button>
                  )}
                </div>
              );
            }
            const s = row.set;
            const label = s.isDrop ? "Drop" : `Série ${++regularLabel}`;
            return (
              <div
                key={s.setIndex}
                className="academia-series-row border-b border-border px-3 py-2.5 last:border-b-0"
              >
                <div className="flex min-h-10 items-center gap-2">
                  <span className="w-12 shrink-0 text-[11px] text-muted-foreground">{label}</span>
                  <NumberField
                    value={s.weight}
                    onValue={(v) =>
                      void updateSet(liveSession.id, exercise.id, s.setIndex, { weight: v })
                    }
                    aria-label={`Peso de ${label}`}
                    className="academia-series-input w-16 rounded-xl border border-border bg-background/45 px-2 py-2 text-center text-sm tabular-nums outline-none focus:border-primary"
                  />
                  <span className="text-[10px] text-muted-foreground">kg</span>
                  <NumberField
                    integer
                    value={s.reps}
                    onValue={(v) =>
                      void updateSet(liveSession.id, exercise.id, s.setIndex, { reps: v })
                    }
                    aria-label={`Repetições de ${label}`}
                    className="academia-series-input w-14 rounded-xl border border-border bg-background/45 px-2 py-2 text-center text-sm tabular-nums outline-none focus:border-primary"
                  />
                  <span className="text-[10px] text-muted-foreground">reps</span>
                  {isLast ? (
                    <button
                      onClick={() => void removeLastSet(liveSession.id, exercise.id)}
                      aria-label="Desfazer última série"
                      title="Desfazer última série"
                      className="ml-auto flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-success text-success-foreground"
                    >
                      <Check className="check-enter h-3 w-3" strokeWidth={3} />
                    </button>
                  ) : (
                    <span
                      aria-label="Série concluída"
                      className="ml-auto flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-success text-success-foreground"
                    >
                      <Check className="check-enter h-3 w-3" strokeWidth={3} />
                    </span>
                  )}
                </div>
                {s.drop && (
                  <div className="mt-1.5 flex items-center gap-2 pl-3">
                    <span className="w-12 shrink-0 text-[11px] font-semibold text-primary">
                      ↳ Drop
                    </span>
                    <NumberField
                      value={s.drop.weight}
                      onValue={(v) =>
                        void updateSet(liveSession.id, exercise.id, s.setIndex, {
                          drop: { weight: v, reps: s.drop!.reps },
                        })
                      }
                      aria-label={`Peso do drop de ${label}`}
                      className="academia-series-input w-16 rounded-xl border border-border bg-background/45 px-2 py-2 text-center text-sm tabular-nums outline-none focus:border-primary"
                    />
                    <span className="text-[10px] text-muted-foreground">kg</span>
                    <NumberField
                      integer
                      value={s.drop.reps}
                      onValue={(v) =>
                        void updateSet(liveSession.id, exercise.id, s.setIndex, {
                          drop: { weight: s.drop!.weight, reps: v },
                        })
                      }
                      aria-label={`Repetições do drop de ${label}`}
                      className="academia-series-input w-14 rounded-xl border border-border bg-background/45 px-2 py-2 text-center text-sm tabular-nums outline-none focus:border-primary"
                    />
                    <span className="text-[10px] text-muted-foreground">reps</span>
                  </div>
                )}
              </div>
            );
          });
        })()}
        {Array.from({ length: pendingRows }, (_, i) => position + i).map((idx, order) => {
          const d = draftFor(idx);
          const next = order === 0; // só a próxima série dá para pular, na ordem
          const drop = dropFor[idx];
          const row = (
            <div className="academia-series-row border-b border-border px-3 py-2.5 last:border-b-0">
              <div className="flex min-h-10 items-center gap-2">
                <span className="w-12 shrink-0 text-[11px] text-muted-foreground">
                  Série {idx + 1}
                </span>
                <NumberField
                  value={parseFloat(d.weight) || 0}
                  onValue={(v) => setDraftFor(idx, { weight: String(v) })}
                  onEmpty={() => setDraftFor(idx, { weight: "0" })}
                  aria-label={`Peso da série ${idx + 1}`}
                  className="academia-series-input w-16 rounded-xl border border-border bg-background/45 px-2 py-2 text-center text-sm tabular-nums outline-none focus:border-primary"
                />
                <span className="text-[10px] text-muted-foreground">kg</span>
                <NumberField
                  integer
                  value={parseInt(d.reps, 10) || 0}
                  onValue={(v) => setDraftFor(idx, { reps: String(v) })}
                  onEmpty={() => setDraftFor(idx, { reps: "0" })}
                  aria-label={`Repetições da série ${idx + 1}`}
                  className="academia-series-input w-14 rounded-xl border border-border bg-background/45 px-2 py-2 text-center text-sm tabular-nums outline-none focus:border-primary"
                />
                <span className="text-[10px] text-muted-foreground">reps</span>
                <button
                  onClick={() => registerPlanned(idx)}
                  disabled={setAction.pending}
                  aria-label={`Concluir série ${idx + 1}`}
                  title="Concluir série"
                  className="interactive-press ml-auto h-6 w-6 shrink-0 rounded-full border-2 border-muted-foreground/50 hover:border-primary disabled:opacity-40"
                />
              </div>
              <div className="mt-1.5 flex items-center gap-2 pl-14">
                <button
                  type="button"
                  onClick={() => toggleDrop(idx)}
                  aria-pressed={Boolean(drop)}
                  className={`interactive-press inline-flex min-h-8 items-center gap-1 rounded-lg border px-2.5 text-[11px] font-semibold ${
                    drop
                      ? "border-primary/60 bg-primary/10 text-primary"
                      : "border-border text-muted-foreground"
                  }`}
                >
                  <ArrowDownToLine className="h-3 w-3" /> {drop ? "Com drop" : "Drop"}
                </button>
                {next && (
                  <button
                    type="button"
                    onClick={skipNextSet}
                    disabled={setAction.pending}
                    className="interactive-press inline-flex min-h-8 items-center gap-1 rounded-lg border border-border px-2.5 text-[11px] font-semibold text-muted-foreground disabled:opacity-40"
                  >
                    <SkipForward className="h-3 w-3" /> Pular série
                  </button>
                )}
              </div>
              {drop && (
                <DropInputs
                  compact
                  value={drop}
                  onChange={(next2) => setDropFor((m) => ({ ...m, [idx]: next2 }))}
                />
              )}
            </div>
          );
          return next ? (
            <SwipeToSkip key={idx} onSkip={skipNextSet} disabled={setAction.pending}>
              {row}
            </SwipeToSkip>
          ) : (
            <div key={idx}>{row}</div>
          );
        })}
      </div>

      {setAction.error && (
        <InlineError message={setAction.error} onRetry={setAction.clearError} className="mt-2" />
      )}

      {pendingRows > 0 && (
        <p className="mt-2 text-center text-[10px] text-muted-foreground">
          Arraste a próxima série para a esquerda para pular.
        </p>
      )}

      {/* "Adicionar série" só aparece quando a última série foi concluída. */}
      {finishedAll && (
        <button
          onClick={() => setExtraRows((n) => n + 1)}
          className="academia-add-set interactive-press mt-3 flex w-full items-center justify-center gap-1 rounded-xl py-2.5 text-xs font-semibold"
        >
          <Plus className="h-3.5 w-3.5" /> Adicionar série
        </button>
      )}

      {/* Mesmo cronômetro do atalho do Alter: descanso, tempo a mais e treino. */}
      <TimerBlock
        session={liveSession}
        face={gym.timerFace}
        onChangeFace={gym.setTimerFace}
        exerciseId={exercise.id}
        configuredRest={planned.setTargets[position]?.restSeconds ?? planned.restSeconds}
        onExpand={() => gym.setFullscreen(true)}
      />

      <div className="academia-evolution-card mt-5 border border-border bg-surface-quiet p-4">
        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          Evolução de carga
        </p>
        <div className="mt-2">
          <Suspense fallback={<ChartSkeleton height={100} />}>
            <ExerciseEvolutionChart series={series} />
          </Suspense>
        </div>
        {series.length > 0 && (
          <>
            <button
              onClick={() => setShowHistory((v) => !v)}
              className="mt-1 text-[11px] text-primary"
            >
              {showHistory ? "ocultar histórico" : "ver histórico"}
            </button>
            {showHistory && (
              <ul className="mt-2 space-y-1">
                {[...series].reverse().map((p) => (
                  <li
                    key={p.date}
                    className="flex justify-between text-[11px] text-muted-foreground"
                  >
                    <span>{p.date.split("-").reverse().join("/")}</span>
                    <span>{p.maxWeight}kg</span>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>

      <button
        onClick={async () => {
          await completeExerciseLog(liveSession.id, exercise.id);
          onClose();
        }}
        disabled={!log || log.sets.length === 0}
        className="interactive-press mt-5 flex min-h-14 w-full items-center justify-center gap-2 rounded-[20px] bg-primary py-3 text-base font-semibold text-primary-foreground disabled:opacity-40"
      >
        <Check className="h-4 w-4" /> Concluir exercício
      </button>
      <button
        onClick={() =>
          skipAction.run(async () => {
            await skipExercise(liveSession.id, exercise.id, true);
            gym.advance(exercise.id);
            onClose();
          })
        }
        disabled={skipAction.pending}
        className="interactive-press mt-2 flex min-h-12 w-full items-center justify-center gap-2 rounded-[20px] border border-border py-2.5 text-sm font-semibold text-muted-foreground disabled:opacity-40"
      >
        <SkipForward className="h-4 w-4" /> Pular exercício
      </button>
      {skipAction.error && (
        <InlineError message={skipAction.error} onRetry={skipAction.clearError} className="mt-2" />
      )}
    </Modal>
  );
}

function weekRange(iso: string): { from: string; to: string } {
  const date = new Date(`${iso}T12:00:00`);
  const daysSinceMonday = (date.getDay() + 6) % 7;
  const monday = addDays(date, -daysSinceMonday);
  return { from: toISODate(monday), to: toISODate(addDays(monday, 6)) };
}

function durationLabel(minutes: number | undefined): string {
  if (minutes === undefined) return "—";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest > 0 ? `${hours}h ${rest}min` : `${hours}h`;
}

const comparisonMeta: Record<ExerciseComparisonKind, { label: string; className: string }> = {
  evoluiu: { label: "Evoluiu", className: "is-progress" },
  manteve: { label: "Manteve", className: "is-steady" },
  ajustou: { label: "Ajustou", className: "is-adjusted" },
  sem_comparacao: { label: "Sem comparação", className: "is-new" },
};

function FinishSummaryModal({ sessionId, onClose }: { sessionId: string; onClose: () => void }) {
  const sessions = useWorkoutStore((s) => s.sessions);
  const exercises = useWorkoutStore((s) => s.exercises);
  const plans = useWorkoutStore((s) => s.plans);
  const weeklyAssignment = useWorkoutStore((s) => s.weeklyAssignment);
  const cycles = useCycleStore((s) => s.cycles);
  const blocks = useCycleStore((s) => s.blocks);
  const blockDays = useCycleStore((s) => s.blockDays);
  const effortAction = useAsyncAction();
  const session = sessions.find((s) => s.id === sessionId);
  if (!session) return null;

  const plan = plans.find((p) => p.id === session.planId);
  const previous = previousFinishedSession(sessions, session.planId, session.id);
  const summary = sessionSummary(session, previous, exercises, sessions);
  const insights = workoutInsights(session, previous, sessions, summary);
  const records = recordsForSession(resolveSets(sessions, exercises, plans), sessionId);
  const recordNames = new Set(records.map((record) => record.name));
  const range = weekRange(session.date);
  const cycle = activeCycle(cycles);
  const cyclePlannedThisWeek = cycle
    ? plannedSessionsInRange(blocksForCycle(blocks, cycle.id), blockDays, range.from, range.to)
    : 0;
  const plannedThisWeek = cycle
    ? cyclePlannedThisWeek || undefined
    : Object.values(weeklyAssignment).filter(Boolean).length || undefined;
  const doneThisWeek = finishedSessionsInRange(sessions, range.from, range.to).length;
  const recentFrom = toISODate(addDays(new Date(`${session.date}T12:00:00`), -6));
  const recentDone = finishedSessionsInRange(sessions, recentFrom, session.date).length;
  const compared =
    summary.comparisonCounts.evoluiu +
    summary.comparisonCounts.manteve +
    summary.comparisonCounts.ajustou;
  const completionValue = summary.plannedExercises
    ? `${summary.completedExercises} de ${summary.plannedExercises}`
    : String(summary.completedExercises);
  const completedAll =
    summary.plannedExercises > 0 && summary.completedExercises >= summary.plannedExercises;
  const comparisonParts = [
    summary.comparisonCounts.evoluiu > 0 &&
      `${summary.comparisonCounts.evoluiu} ${summary.comparisonCounts.evoluiu === 1 ? "evoluiu" : "evoluíram"}`,
    summary.comparisonCounts.manteve > 0 &&
      `${summary.comparisonCounts.manteve} ${summary.comparisonCounts.manteve === 1 ? "manteve" : "mantiveram"}`,
    summary.comparisonCounts.ajustou > 0 &&
      `${summary.comparisonCounts.ajustou} ${summary.comparisonCounts.ajustou === 1 ? "foi ajustado" : "foram ajustados"}`,
  ].filter(Boolean);
  const headline = completedAll
    ? `Você concluiu todo o treino em ${durationLabel(summary.durationMinutes)}.`
    : summary.plannedExercises > 0
      ? `Você concluiu ${summary.completedExercises} de ${summary.plannedExercises} exercícios em ${durationLabel(summary.durationMinutes)}.`
      : `Treino registrado em ${durationLabel(summary.durationMinutes)}.`;

  const footer = (
    <div className="grid grid-cols-2 gap-2">
      <button
        type="button"
        onClick={onClose}
        className="interactive-press min-h-12 rounded-[18px] border border-border text-sm font-semibold text-muted-foreground"
      >
        Fechar
      </button>
      <Link
        to="/sub-agenda/$categoria"
        params={{ categoria: "academia" }}
        search={{ aba: "evolucao" }}
        onClick={onClose}
        className="interactive-press flex min-h-12 items-center justify-center rounded-[18px] bg-primary px-3 text-center text-sm font-semibold text-primary-foreground"
      >
        Ver evolução completa
      </Link>
    </div>
  );

  return (
    <Modal
      onClose={onClose}
      title="Treino concluído"
      maxWidthClassName="max-w-lg"
      panelClassName="academia-summary-modal"
      footer={footer}
    >
      <div className="academia-summary-intro">
        <p className="academia-summary-kicker">Sessão finalizada</p>
        <h3>{plan ? `Treino ${plan.letter} — ${plan.name}` : (session.planLabel ?? "Treino")}</h3>
        <p>{headline}</p>
      </div>

      <div className="academia-summary-kpis" aria-label="Resumo do treino">
        <div>
          <strong>{completionValue}</strong>
          <span>exercícios</span>
        </div>
        <div>
          <strong>{durationLabel(summary.durationMinutes)}</strong>
          <span>duração ativa</span>
        </div>
        <div>
          <strong>
            {plannedThisWeek !== undefined
              ? `${Math.min(doneThisWeek, plannedThisWeek)} de ${plannedThisWeek}`
              : recentDone}
          </strong>
          <span>{plannedThisWeek !== undefined ? "esta semana" : "últimos 7 dias"}</span>
        </div>
      </div>

      <section className="academia-summary-section">
        <p className="academia-summary-label">Em relação ao último treino</p>
        {previous && compared > 0 ? (
          <>
            <p className="academia-summary-comparison-copy">{comparisonParts.join(" · ")}</p>
            <div
              className="academia-summary-comparison-bar"
              aria-label={comparisonParts.join(", ")}
            >
              {summary.comparisonCounts.evoluiu > 0 && (
                <span className="is-progress" style={{ flex: summary.comparisonCounts.evoluiu }} />
              )}
              {summary.comparisonCounts.manteve > 0 && (
                <span className="is-steady" style={{ flex: summary.comparisonCounts.manteve }} />
              )}
              {summary.comparisonCounts.ajustou > 0 && (
                <span className="is-adjusted" style={{ flex: summary.comparisonCounts.ajustou }} />
              )}
            </div>
          </>
        ) : (
          <p className="academia-summary-empty-comparison">
            {previous
              ? "Não houve séries em condições equivalentes para uma comparação honesta."
              : "Este é o primeiro registro deste treino. A próxima sessão terá comparação."}
          </p>
        )}
        {insights.length > 0 && (
          <div className="academia-summary-insights">
            {insights.map((text) => (
              <p key={text}>{text}</p>
            ))}
          </div>
        )}
      </section>

      <section className="academia-summary-section">
        <p className="academia-summary-label">Por exercício</p>
        <ul className="academia-summary-exercises">
          {summary.exercises.map((exercise) => {
            const meta = comparisonMeta[exercise.comparison.kind];
            const hasRecord = exercise.isPersonalRecord || recordNames.has(exercise.name);
            return (
              <li key={exercise.exerciseId}>
                <div className="academia-summary-exercise-heading">
                  <p>
                    {exercise.name}
                    {hasRecord && <span className="academia-summary-record">Recorde</span>}
                  </p>
                  <span className={`academia-summary-status ${meta.className}`}>{meta.label}</span>
                </div>
                <div className="academia-summary-exercise-detail">
                  <span>
                    {exercise.comparison.detail ??
                      `${exercise.maxWeight} kg × ${exercise.repsAtMaxWeight} repetições`}
                  </span>
                  {exercise.comparison.change && <strong>{exercise.comparison.change}</strong>}
                </div>
              </li>
            );
          })}
          {summary.exercises.length === 0 && (
            <li className="academia-summary-empty-comparison">
              Nenhuma série foi registrada neste treino.
            </li>
          )}
        </ul>
      </section>

      <section className="academia-summary-section academia-summary-effort">
        <p className="academia-summary-label">Como foi hoje?</p>
        <p className="academia-summary-effort-help">
          Sua percepção ajuda o Norte a interpretar manutenção, evolução e recuperação.
        </p>
        <div role="group" aria-label="Percepção do treino">
          {(
            [
              ["leve", "Leve"],
              ["na_medida", "Na medida"],
              ["pesado", "Pesado"],
            ] as const satisfies ReadonlyArray<readonly [WorkoutPerceivedEffort, string]>
          ).map(([value, label]) => (
            <button
              type="button"
              key={value}
              aria-pressed={session.perceivedEffort === value}
              disabled={effortAction.pending}
              onClick={() => effortAction.run(() => setSessionPerceivedEffort(session.id, value))}
            >
              {label}
            </button>
          ))}
        </div>
        {effortAction.error && (
          <InlineError
            message={effortAction.error}
            onRetry={effortAction.clearError}
            className="mt-2"
          />
        )}
      </section>
    </Modal>
  );
}

function GenericoModule({ categoria }: { categoria: string }) {
  const executions = useGoalsStore((s) => s.executions);
  const profile = useProfile();
  const next = executions
    .filter((e) => e.category === categoria && e.status === "planejada")
    .sort((a, b) =>
      (relevantDate(a) + (a.startTime ?? "")).localeCompare(relevantDate(b) + (b.startTime ?? "")),
    )[0];

  return (
    <div className="mt-6 space-y-5">
      <Card quiet title="Próxima sessão">
        {next ? (
          <>
            <p className="text-xs text-muted-foreground">{next.agendaDate ? "Quando" : "Prazo"}</p>
            <p className="text-sm font-semibold">
              {next.agendaDate
                ? `${formatDateBR(next.agendaDate)} · ${formatTime(next.startTime, profile.timeFormat)}`
                : formatDateBR(next.dueDate)}
            </p>
            {next.how && (
              <>
                <p className="mt-3 text-xs text-muted-foreground">Como</p>
                <p className="text-sm">{next.how}</p>
              </>
            )}
            {next.why && (
              <>
                <p className="mt-3 text-xs text-muted-foreground">Por quê</p>
                <p className="text-sm">{next.why}</p>
              </>
            )}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Nada planejado nessa categoria ainda.</p>
        )}
      </Card>
      <Card quiet title="Anotações livres">
        <textarea
          placeholder="Escreva qualquer coisa que importe pra essa categoria..."
          className="min-h-32 w-full resize-none rounded-lg border border-border bg-surface-2 p-3 text-sm outline-none focus:border-primary"
        />
      </Card>
    </div>
  );
}
