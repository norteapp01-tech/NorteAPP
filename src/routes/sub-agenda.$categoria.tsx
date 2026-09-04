import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  Plus,
  Trash2,
  Play,
  Pause,
  RotateCcw,
  Check,
  X,
} from "lucide-react";
import { categoryMeta } from "@/lib/mock-data";
import { useProfile } from "@/lib/profile-store";
import { formatTime } from "@/lib/format-utils";
import { nowMs } from "@/lib/test-clock";
import {
  useGoalsStore,
  createRoutine,
  toggleRoutineActive,
  removeRoutine,
  todayISO,
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
  createPlan,
  removePlan,
  addExercise,
  removeExercise,
  reorderExercise,
  setWeeklyAssignment,
  startSession,
  logSet,
  updateSet,
  completeExerciseLog,
  finishSession,
  addBodyWeight,
  currentBodyWeight,
  bodyWeightsByDateDesc,
  type WorkoutPlan,
  type WorkoutSession,
  type Exercise,
} from "@/lib/workout-store";
import { LeituraModule } from "@/components/reading/LeituraModule";
import { AlimentacaoModule } from "@/components/nutrition/AlimentacaoModule";
import { FinancasModule } from "@/components/finance/FinancasModule";
import { FeModule } from "@/components/fe/FeModule";
import { Modal } from "@/components/ui/modal";
import { ExerciseEvolutionChart } from "@/components/academia/ExerciseEvolutionChart";
import {
  Card,
  weekdayLabels,
  weekVisualLabels,
  weekVisualOrder,
} from "@/components/sub-agenda-shared";

export const Route = createFileRoute("/sub-agenda/$categoria")({
  head: () => ({ meta: [{ title: `Sub-agenda — Norte` }] }),
  component: SubAgenda,
});

function SubAgenda() {
  const { categoria } = Route.useParams();
  const meta = categoryMeta[categoria] ?? categoryMeta.generico;

  return (
    <div className="px-5 pt-12">
      <Link to="/" className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        <ChevronLeft className="h-4 w-4" /> Hoje
      </Link>
      <header className="mt-3">
        <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
          Sub-agenda · {meta.label}
        </p>
        <h1 className="mt-1 flex items-center gap-3 text-3xl font-bold">
          <span className="text-4xl">{meta.emoji}</span>
          {meta.label}
        </h1>
      </header>

      {categoria !== "leitura" &&
        categoria !== "alimentacao" &&
        categoria !== "financas" &&
        categoria !== "fe" && (
          <div className="mt-6">
            <RoutineConfigCard categoria={categoria} />
          </div>
        )}

      {categoria === "academia" && <AcademiaModule />}
      {categoria === "leitura" && <LeituraModule />}
      {categoria === "alimentacao" && <AlimentacaoModule />}
      {categoria === "financas" && <FinancasModule />}
      {categoria === "fe" && <FeModule />}
      {(categoria === "trabalho" || categoria === "generico") && (
        <GenericoModule categoria={categoria} />
      )}
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
type RestState = { secondsLeft: number; total: number; running: boolean };

function AcademiaModule() {
  const plans = useWorkoutStore((s) => s.plans);
  const exercises = useWorkoutStore((s) => s.exercises);
  const sessions = useWorkoutStore((s) => s.sessions);
  const weeklyAssignment = useWorkoutStore((s) => s.weeklyAssignment);
  const bodyWeights = useWorkoutStore((s) => s.bodyWeights);

  const [pickerDay, setPickerDay] = useState<number | null>(null);
  const [openExerciseId, setOpenExerciseId] = useState<string | null>(null);
  const [summarySessionId, setSummarySessionId] = useState<string | null>(null);
  const [rest, setRest] = useState<RestState | null>(null);
  const [showWeightInput, setShowWeightInput] = useState(false);
  const [weightDraft, setWeightDraft] = useState("");
  const [startingSession, setStartingSession] = useState(false);
  const [finishingSession, setFinishingSession] = useState(false);

  useEffect(() => {
    if (!rest || !rest.running || rest.secondsLeft <= 0) return;
    const t = setTimeout(
      () => setRest((r) => (r ? { ...r, secondsLeft: r.secondsLeft - 1 } : r)),
      1000,
    );
    return () => clearTimeout(t);
  }, [rest]);

  const todayPlanId = todaysPlanId(weeklyAssignment);
  const todayPlan = plans.find((p) => p.id === todayPlanId);
  const todaySession = todayPlanId ? sessionForToday(sessions, todayPlanId) : undefined;
  const todayExercises = todayPlan ? exercisesForPlan(exercises, todayPlan.id) : [];
  const openExercise = exercises.find((e) => e.id === openExerciseId);

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

  return (
    <div className="mt-6 space-y-5">
      <Card title="Plano da semana">
        <div className="grid grid-cols-7 gap-1.5">
          {weekVisualOrder.map((weekday, i) => {
            const plan = plans.find((p) => p.id === weeklyAssignment[weekday]);
            return (
              <button
                key={weekday}
                onClick={() => setPickerDay(weekday)}
                className="rounded-lg bg-surface-2 p-2 text-center hover:bg-surface"
              >
                <p className="text-[10px] text-muted-foreground">{weekVisualLabels[i]}</p>
                <p className="mt-1 text-lg font-bold">{plan ? plan.letter : "—"}</p>
              </button>
            );
          })}
        </div>
      </Card>

      <Card
        title={
          todayPlan ? `Treino de hoje — ${todayPlan.letter} · ${todayPlan.name}` : "Treino de hoje"
        }
      >
        {!todayPlan && <p className="text-sm text-muted-foreground">Hoje é dia de descanso.</p>}

        {todayPlan && !todaySession && (
          <>
            <p className="text-xs text-muted-foreground">{todayExercises.length} exercícios</p>
            <ul className="mt-2.5 space-y-2">
              {todayExercises.map((ex) => (
                <li key={ex.id}>
                  <button
                    disabled={startingSession}
                    onClick={async () => {
                      if (startingSession) return;
                      setStartingSession(true);
                      try {
                        await startSession(todayPlan.id);
                        setOpenExerciseId(ex.id);
                      } finally {
                        setStartingSession(false);
                      }
                    }}
                    className="flex w-full items-center justify-between gap-2 rounded-lg border border-border bg-surface-2 p-3 text-left transition-colors hover:border-primary/40 disabled:opacity-60"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{ex.name}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {ex.setsTarget}x{ex.repsTarget} · {ex.loadTarget}kg
                      </p>
                    </div>
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                  </button>
                </li>
              ))}
            </ul>
            {todayExercises.length === 0 && (
              <p className="mt-2 text-[11px] text-muted-foreground">
                Esse treino ainda não tem exercícios — adicione em "Treinos cadastrados".
              </p>
            )}
          </>
        )}

        {todayPlan && todaySession && todaySession.status === "em_andamento" && (
          <>
            <p className="text-xs font-semibold text-primary">
              {todaySession.exerciseLogs.filter((l) => l.done).length} de{" "}
              {todaySession.exerciseLogs.length} exercícios concluídos
            </p>
            <ul className="mt-2.5 space-y-2">
              {todayExercises.map((ex) => {
                const log = todaySession.exerciseLogs.find((l) => l.exerciseId === ex.id);
                return (
                  <li key={ex.id}>
                    <button
                      onClick={() => setOpenExerciseId(ex.id)}
                      className={`flex w-full items-center justify-between gap-2 rounded-lg border p-3 text-left transition-colors ${log?.done ? "border-success/40 bg-success/10" : "border-border bg-surface-2 hover:border-primary/40"}`}
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">{ex.name}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {log?.sets.length ?? 0}/{ex.setsTarget} séries · meta {ex.loadTarget}kg
                        </p>
                      </div>
                      {log?.done ? (
                        <Check className="h-4 w-4 shrink-0 text-success" />
                      ) : (
                        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
            <button
              onClick={async () => {
                if (finishingSession) return;
                setFinishingSession(true);
                try {
                  await finishSession(todaySession.id);
                  setSummarySessionId(todaySession.id);
                } finally {
                  setFinishingSession(false);
                }
              }}
              disabled={
                finishingSession || todaySession.exerciseLogs.every((l) => l.sets.length === 0)
              }
              className="mt-3 w-full rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground disabled:opacity-40"
            >
              {finishingSession ? "Finalizando…" : "Finalizar treino"}
            </button>
          </>
        )}

        {todayPlan && todaySession && todaySession.status === "concluido" && (
          <button
            onClick={() => setSummarySessionId(todaySession.id)}
            className="flex items-center gap-1.5 text-sm text-success"
          >
            <Check className="h-4 w-4" /> Treino concluído hoje — ver resumo
          </button>
        )}
      </Card>

      <PlanManagerCard />

      <Card title="Peso corporal">
        <div className="flex items-end justify-between">
          <div>
            <p className="font-mono text-3xl font-bold">
              {currentWeight !== undefined ? currentWeight.toFixed(1) : "—"}
              <span className="text-base text-muted-foreground">kg</span>
            </p>
            {weightDelta !== undefined && olderWeight && (
              <p
                className={`text-[11px] ${weightDelta <= 0 ? "text-success" : "text-muted-foreground"}`}
              >
                {weightDelta > 0 ? "+" : ""}
                {weightDelta}kg em{" "}
                {Math.max(
                  1,
                  Math.round((nowMs() - new Date(olderWeight.date).getTime()) / 86400000),
                )}{" "}
                dias
              </p>
            )}
          </div>
          {!showWeightInput ? (
            <button
              onClick={() => {
                setWeightDraft(currentWeight !== undefined ? String(currentWeight) : "");
                setShowWeightInput(true);
              }}
              className="rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground"
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
                onClick={async () => {
                  const w = parseFloat(weightDraft);
                  setShowWeightInput(false);
                  if (w > 0) await addBodyWeight(w);
                }}
                className="rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground"
              >
                ok
              </button>
            </div>
          )}
        </div>
      </Card>

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
      {openExercise && todaySession && (
        <ExerciseModal
          session={todaySession}
          exercise={openExercise}
          onClose={() => setOpenExerciseId(null)}
          onLogged={(restSeconds) =>
            setRest({ secondsLeft: restSeconds, total: restSeconds, running: true })
          }
        />
      )}
      {summarySessionId && (
        <FinishSummaryModal
          sessionId={summarySessionId}
          onClose={() => setSummarySessionId(null)}
        />
      )}
      {rest && <RestTimerPill rest={rest} setRest={setRest} />}
    </div>
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
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-sm font-bold text-primary">
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
  const plans = useWorkoutStore((s) => [...s.plans].sort((a, b) => a.order - b.order));
  const exercises = useWorkoutStore((s) => s.exercises);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showNewPlan, setShowNewPlan] = useState(false);
  const [newPlan, setNewPlan] = useState({ letter: "", name: "", muscleGroups: "" });

  return (
    <Card title="Treinos cadastrados">
      <div className="space-y-2">
        {plans.map((p) => (
          <div key={p.id} className="rounded-lg border border-border bg-surface-2 p-3">
            <div className="flex w-full items-center gap-3">
              <button
                onClick={() => setExpandedId(expandedId === p.id ? null : p.id)}
                className="flex min-w-0 flex-1 items-center gap-3 text-left"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-sm font-bold text-primary">
                  {p.letter}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{p.name}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {p.muscleGroups} · {exercisesForPlan(exercises, p.id).length} exercícios
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
          <input
            value={newPlan.muscleGroups}
            onChange={(e) => setNewPlan({ ...newPlan, muscleGroups: e.target.value })}
            placeholder="Grupos musculares"
            className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
          />
          <button
            onClick={async () => {
              if (!newPlan.letter.trim() || !newPlan.name.trim()) return;
              await createPlan({
                letter: newPlan.letter.trim(),
                name: newPlan.name.trim(),
                muscleGroups: newPlan.muscleGroups.trim(),
              });
              setNewPlan({ letter: "", name: "", muscleGroups: "" });
              setShowNewPlan(false);
            }}
            className="w-full rounded-lg bg-primary py-2 text-xs font-semibold text-primary-foreground"
          >
            Criar treino
          </button>
        </div>
      )}
    </Card>
  );
}

function PlanExerciseEditor({ planId }: { planId: string }) {
  const exercises = useWorkoutStore((s) => exercisesForPlan(s.exercises, planId));
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({
    name: "",
    setsTarget: "4",
    repsTarget: "10",
    loadTarget: "20",
    restSeconds: "90",
  });

  return (
    <div className="mt-3 space-y-1.5 border-t border-border pt-3">
      {exercises.map((ex, i) => (
        <div key={ex.id} className="flex items-center gap-2 rounded-lg bg-surface p-2">
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-semibold">{ex.name}</p>
            <p className="text-[10px] text-muted-foreground">
              {ex.setsTarget}x{ex.repsTarget} · {ex.loadTarget}kg · desc. {ex.restSeconds}s
            </p>
          </div>
          <button
            disabled={i === 0}
            onClick={async () => {
              await reorderExercise(ex.id, "up", exercises);
            }}
            className="text-muted-foreground hover:text-primary disabled:opacity-30"
          >
            <ChevronUp className="h-3.5 w-3.5" />
          </button>
          <button
            disabled={i === exercises.length - 1}
            onClick={async () => {
              await reorderExercise(ex.id, "down", exercises);
            }}
            className="text-muted-foreground hover:text-primary disabled:opacity-30"
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={async () => {
              await removeExercise(ex.id);
            }}
            className="text-muted-foreground hover:text-danger"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
      {!showAdd ? (
        <button
          onClick={() => setShowAdd(true)}
          className="flex w-full items-center justify-center gap-1 rounded-lg border border-dashed border-border py-2 text-[11px] text-muted-foreground hover:border-primary/40 hover:text-primary"
        >
          <Plus className="h-3 w-3" /> exercício
        </button>
      ) : (
        <div className="space-y-1.5 rounded-lg border border-border bg-surface p-2">
          <input
            autoFocus
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Nome do exercício"
            className="w-full rounded-md border border-border bg-surface-2 px-2 py-1.5 text-xs outline-none focus:border-primary"
          />
          <div className="grid grid-cols-3 gap-1.5">
            <NumField
              label="séries"
              value={form.setsTarget}
              onChange={(v) => setForm({ ...form, setsTarget: v })}
            />
            <NumField
              label="reps"
              value={form.repsTarget}
              onChange={(v) => setForm({ ...form, repsTarget: v })}
            />
            <NumField
              label="kg"
              value={form.loadTarget}
              onChange={(v) => setForm({ ...form, loadTarget: v })}
            />
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] text-muted-foreground">descanso</span>
            {["60", "90", "120", "180"].map((s) => (
              <button
                key={s}
                onClick={() => setForm({ ...form, restSeconds: s })}
                className={`rounded-full px-2 py-1 text-[10px] font-semibold ${form.restSeconds === s ? "bg-primary text-primary-foreground" : "border border-border text-muted-foreground"}`}
              >
                {s}s
              </button>
            ))}
          </div>
          <button
            onClick={async () => {
              if (!form.name.trim()) return;
              await addExercise(planId, {
                name: form.name.trim(),
                setsTarget: parseInt(form.setsTarget, 10) || 1,
                repsTarget: parseInt(form.repsTarget, 10) || 1,
                loadTarget: parseFloat(form.loadTarget) || 0,
                restSeconds: parseInt(form.restSeconds, 10) || 60,
              });
              setForm({
                name: "",
                setsTarget: "4",
                repsTarget: "10",
                loadTarget: "20",
                restSeconds: "90",
              });
              setShowAdd(false);
            }}
            className="w-full rounded-md bg-primary py-1.5 text-[11px] font-semibold text-primary-foreground"
          >
            Adicionar
          </button>
        </div>
      )}
    </div>
  );
}

function NumField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-0.5 block text-[9px] uppercase text-muted-foreground">{label}</span>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-border bg-surface-2 px-2 py-1 text-xs outline-none focus:border-primary"
      />
    </label>
  );
}

function ExerciseModal({
  session,
  exercise,
  onClose,
  onLogged,
}: {
  session: WorkoutSession;
  exercise: Exercise;
  onClose: () => void;
  onLogged: (restSeconds: number) => void;
}) {
  const sessions = useWorkoutStore((s) => s.sessions);
  const liveSession = sessions.find((s) => s.id === session.id) ?? session;
  const log = liveSession.exerciseLogs.find((l) => l.exerciseId === exercise.id);
  const registeredCount = log?.sets.length ?? 0;
  const plannedRemaining = Math.max(0, exercise.setsTarget - registeredCount);
  const [draftValues, setDraftValues] = useState<Record<number, { weight: string; reps: string }>>(
    {},
  );
  const draftFor = (idx: number) =>
    draftValues[idx] ?? { weight: String(exercise.loadTarget), reps: String(exercise.repsTarget) };
  const setDraftFor = (idx: number, patch: Partial<{ weight: string; reps: string }>) =>
    setDraftValues((d) => ({ ...d, [idx]: { ...draftFor(idx), ...patch } }));
  const registerPlanned = async (idx: number) => {
    const d = draftFor(idx);
    const w = parseFloat(d.weight) || 0;
    const r = parseInt(d.reps, 10) || 0;
    await logSet(liveSession.id, exercise.id, w, r);
    onLogged(exercise.restSeconds);
  };

  const [extraWeight, setExtraWeight] = useState(String(exercise.loadTarget));
  const [extraReps, setExtraReps] = useState(String(exercise.repsTarget));
  const [showHistory, setShowHistory] = useState(false);
  const series = exerciseWeightSeries(sessions, exercise.planId, exercise.id);

  const addExtraSet = async () => {
    const w = parseFloat(extraWeight) || 0;
    const r = parseInt(extraReps, 10) || 0;
    await logSet(liveSession.id, exercise.id, w, r);
    onLogged(exercise.restSeconds);
  };

  return (
    <Modal onClose={onClose} title={exercise.name}>
      <p className="text-xs text-muted-foreground/70">
        Meta: {exercise.setsTarget} séries × {exercise.repsTarget} reps — {exercise.loadTarget} kg
      </p>

      <div className="mt-4 space-y-1.5">
        {(log?.sets ?? []).map((s) => (
          <div
            key={s.setIndex}
            className="flex items-center gap-2 rounded-lg border border-border bg-surface-2 p-2"
          >
            <span className="w-14 shrink-0 text-[11px] text-muted-foreground">
              Série {s.setIndex + 1}
            </span>
            <input
              type="number"
              value={s.weight}
              onChange={(e) =>
                void updateSet(liveSession.id, exercise.id, s.setIndex, {
                  weight: parseFloat(e.target.value) || 0,
                })
              }
              className="w-16 rounded-md border border-border bg-surface px-2 py-1 text-right text-xs outline-none focus:border-primary"
            />
            <span className="text-[10px] text-muted-foreground">kg</span>
            <input
              type="number"
              value={s.reps}
              onChange={(e) =>
                void updateSet(liveSession.id, exercise.id, s.setIndex, {
                  reps: parseInt(e.target.value, 10) || 0,
                })
              }
              className="w-14 rounded-md border border-border bg-surface px-2 py-1 text-right text-xs outline-none focus:border-primary"
            />
            <span className="text-[10px] text-muted-foreground">reps</span>
          </div>
        ))}
      </div>

      {plannedRemaining > 0 && (
        <div className="mt-1.5 space-y-1.5">
          {Array.from({ length: plannedRemaining }, (_, i) => registeredCount + i).map((idx) => {
            const d = draftFor(idx);
            return (
              <div
                key={idx}
                className="flex items-center gap-2 rounded-lg border border-dashed border-primary/40 bg-primary/5 p-2"
              >
                <span className="w-14 shrink-0 text-[11px] text-muted-foreground">
                  Série {idx + 1}
                </span>
                <input
                  type="number"
                  value={d.weight}
                  onChange={(e) => setDraftFor(idx, { weight: e.target.value })}
                  className="w-16 rounded-md border border-border bg-surface px-2 py-1 text-right text-xs outline-none focus:border-primary"
                />
                <span className="text-[10px] text-muted-foreground">kg</span>
                <input
                  type="number"
                  value={d.reps}
                  onChange={(e) => setDraftFor(idx, { reps: e.target.value })}
                  className="w-14 rounded-md border border-border bg-surface px-2 py-1 text-right text-xs outline-none focus:border-primary"
                />
                <span className="text-[10px] text-muted-foreground">reps</span>
                <button
                  onClick={() => registerPlanned(idx)}
                  className="ml-auto rounded-lg bg-primary p-1.5 text-primary-foreground"
                  title="Registrar série"
                >
                  <Check className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {plannedRemaining === 0 && (
        <div className="mt-3 flex items-center gap-2 rounded-lg border border-dashed border-border p-2">
          <span className="w-14 shrink-0 text-[11px] text-muted-foreground">
            Série {registeredCount + 1}
          </span>
          <input
            type="number"
            value={extraWeight}
            onChange={(e) => setExtraWeight(e.target.value)}
            className="w-16 rounded-md border border-border bg-surface px-2 py-1 text-right text-xs outline-none focus:border-primary"
          />
          <span className="text-[10px] text-muted-foreground">kg</span>
          <input
            type="number"
            value={extraReps}
            onChange={(e) => setExtraReps(e.target.value)}
            className="w-14 rounded-md border border-border bg-surface px-2 py-1 text-right text-xs outline-none focus:border-primary"
          />
          <span className="text-[10px] text-muted-foreground">reps</span>
          <button
            onClick={addExtraSet}
            className="ml-auto rounded-lg bg-primary p-1.5 text-primary-foreground"
            title="Adicionar série extra"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      <div className="mt-5">
        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          Evolução de carga
        </p>
        <div className="mt-2">
          <ExerciseEvolutionChart series={series} />
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
        className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground disabled:opacity-40"
      >
        <Check className="h-4 w-4" /> Concluir exercício
      </button>
    </Modal>
  );
}

function FinishSummaryModal({ sessionId, onClose }: { sessionId: string; onClose: () => void }) {
  const sessions = useWorkoutStore((s) => s.sessions);
  const exercises = useWorkoutStore((s) => s.exercises);
  const plans = useWorkoutStore((s) => s.plans);
  const session = sessions.find((s) => s.id === sessionId);
  if (!session) return null;
  const plan = plans.find((p) => p.id === session.planId);
  const previous = previousFinishedSession(sessions, session.planId, session.id);
  const summary = sessionSummary(session, previous, exercises);

  return (
    <Modal onClose={onClose} title="Treino concluído">
      <h3 className="text-xl font-bold">
        {plan ? `Treino ${plan.letter} — ${plan.name}` : "Treino"}
      </h3>
      <div className="mt-4 grid grid-cols-2 gap-2 text-center">
        <div className="rounded-xl bg-success/10 p-3">
          <p className="text-xl font-bold text-success">{summary.completedExercises}</p>
          <p className="text-[10px] uppercase text-muted-foreground">exercícios concluídos</p>
        </div>
        <div className="rounded-xl bg-primary/10 p-3">
          <p className="text-xl font-bold text-primary">{summary.totalSets}</p>
          <p className="text-[10px] uppercase text-muted-foreground">séries realizadas</p>
        </div>
      </div>
      <ul className="mt-4 space-y-2">
        {summary.exercises.map((e) => (
          <li
            key={e.exerciseId}
            className="flex items-center justify-between gap-2 rounded-lg border border-border bg-surface-2 p-3"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{e.name}</p>
              <p className="text-[11px] text-muted-foreground">
                {e.maxWeight}kg × {e.repsAtMaxWeight} reps · meta {e.targetWeight}kg ×{" "}
                {e.targetReps}
              </p>
            </div>
            {e.deltaWeightVsPrevious !== undefined && e.deltaWeightVsPrevious !== 0 && (
              <span
                className={`shrink-0 text-xs font-bold ${e.deltaWeightVsPrevious > 0 ? "text-success" : "text-danger"}`}
              >
                {e.deltaWeightVsPrevious > 0 ? "+" : ""}
                {e.deltaWeightVsPrevious}kg
              </span>
            )}
          </li>
        ))}
        {summary.exercises.length === 0 && (
          <p className="text-sm text-muted-foreground">Nenhuma série registrada nesse treino.</p>
        )}
      </ul>
      <button
        onClick={onClose}
        className="mt-5 w-full rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground"
      >
        Fechar
      </button>
    </Modal>
  );
}

const restPresets = [60, 90, 120, 180];

function RestTimerPill({
  rest,
  setRest,
}: {
  rest: RestState;
  setRest: React.Dispatch<React.SetStateAction<RestState | null>>;
}) {
  const done = rest.secondsLeft <= 0;
  const mm = String(Math.floor(rest.secondsLeft / 60)).padStart(2, "0");
  const ss = String(rest.secondsLeft % 60).padStart(2, "0");

  const cycleTime = () =>
    setRest((r) => {
      if (!r) return r;
      const idx = restPresets.indexOf(r.total);
      const next = restPresets[(idx + 1) % restPresets.length] ?? restPresets[0];
      return { secondsLeft: next, total: next, running: true };
    });

  return (
    <div className="fixed bottom-24 left-1/2 z-40 flex -translate-x-1/2 items-center gap-3 rounded-full border border-border bg-background/95 px-4 py-2 shadow-lg backdrop-blur-xl">
      {done ? (
        <>
          <span className="text-xs font-semibold text-success">Descanso concluído</span>
          <button
            onClick={() => setRest(null)}
            aria-label="Fechar aviso de descanso"
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </>
      ) : (
        <>
          <span className="text-[10px] uppercase text-muted-foreground">Descanso</span>
          <button onClick={cycleTime} className="font-mono text-sm font-bold text-primary">
            {mm}:{ss}
          </button>
          <button
            onClick={() => setRest((r) => (r ? { ...r, running: !r.running } : r))}
            className="text-muted-foreground hover:text-foreground"
          >
            {rest.running ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
          </button>
          <button
            onClick={() => setRest((r) => (r ? { ...r, secondsLeft: 0 } : r))}
            className="text-[10px] font-semibold text-muted-foreground hover:text-primary"
          >
            pular
          </button>
          <button
            onClick={() => setRest((r) => (r ? { ...r, secondsLeft: r.total } : r))}
            className="text-muted-foreground hover:text-foreground"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
        </>
      )}
    </div>
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
      <Card title="Próxima sessão">
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
      <Card title="Anotações livres">
        <textarea
          placeholder="Escreva qualquer coisa que importe pra essa categoria..."
          className="min-h-32 w-full resize-none rounded-lg border border-border bg-surface-2 p-3 text-sm outline-none focus:border-primary"
        />
      </Card>
    </div>
  );
}
