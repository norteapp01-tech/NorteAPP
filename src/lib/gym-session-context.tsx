import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  openSession,
  selectExercise,
  sessionPlanned,
  nextPendingExerciseId,
  useWorkoutStore,
  type PlannedExercise,
  type WorkoutPlan,
  type WorkoutSession,
} from "./workout-store";

// ---------------------------------------------------------------------------
// Estado do treino em andamento, montado uma vez na raiz do app — é isso que
// faz a bolha e o painel sobreviverem a navegar pra Agenda, Hoje ou qualquer
// outra tela. Mesma arquitetura de `sport-recorder-context.tsx`.
//
// O que é dado (séries, tempos) vem sempre do store; aqui só vive o que é
// interface: painel aberto, cronômetro em tela cheia, exercício selecionado e
// o tique de 1s que redesenha os relógios.
// ---------------------------------------------------------------------------

const AUTO_REST_KEY = "norte:academia:autoRest";

type GymSessionValue = {
  session: WorkoutSession | undefined;
  plan: WorkoutPlan | undefined;
  planned: PlannedExercise[];
  selectedExerciseId: string | null;
  select: (exerciseId: string) => void;
  /** Vai pro próximo pendente dando a volta; fica onde está se não houver. */
  advance: (fromExerciseId: string) => string | null;
  panelOpen: boolean;
  setPanelOpen: (open: boolean) => void;
  fullscreen: boolean;
  setFullscreen: (open: boolean) => void;
  autoRest: boolean;
  setAutoRest: (on: boolean) => void;
  /** Sessão recém-finalizada cujo resumo a aba Academia ainda deve abrir —
   * finalizar pelo painel acontece de qualquer tela, e o resumo mora lá. */
  finishedSummaryId: string | null;
  setFinishedSummaryId: (id: string | null) => void;
};

const GymSessionContext = createContext<GymSessionValue | null>(null);

function readAutoRest(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(AUTO_REST_KEY) !== "off";
  } catch {
    return true;
  }
}

export function GymSessionProvider({ children }: { children: ReactNode }) {
  const sessions = useWorkoutStore((s) => s.sessions);
  const plans = useWorkoutStore((s) => s.plans);
  const exercises = useWorkoutStore((s) => s.exercises);

  const session = useMemo(() => openSession(sessions), [sessions]);
  const plan = plans.find((p) => p.id === session?.planId);
  const planned = useMemo(
    () => (session ? sessionPlanned(session, exercises) : []),
    [session, exercises],
  );

  const [panelOpen, setPanelOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [autoRest, setAutoRestState] = useState(readAutoRest);
  const [localSelection, setLocalSelection] = useState<string | null>(null);
  const [finishedSummaryId, setFinishedSummaryId] = useState<string | null>(null);
  const [, setTick] = useState(0);

  // Um tique por segundo só enquanto há treino aberto. Ele não CONTA o tempo —
  // os dois relógios são calculados por diferença de horários no store; isto
  // apenas redesenha. Por isso voltar de segundo plano mostra o valor certo.
  useEffect(() => {
    if (!session) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [session]);

  // Treino que acabou (ou foi finalizado de outra tela) fecha painel e tela
  // cheia — senão sobrariam abertos sobre uma sessão que não existe mais.
  useEffect(() => {
    if (!session) {
      setPanelOpen(false);
      setFullscreen(false);
      setLocalSelection(null);
    }
  }, [session]);

  const setAutoRest = useCallback((on: boolean) => {
    setAutoRestState(on);
    try {
      window.localStorage.setItem(AUTO_REST_KEY, on ? "on" : "off");
    } catch {
      /* Sem storage: a preferência vale só nesta sessão. */
    }
  }, []);

  const fallbackSelection =
    planned.find((p) => {
      const log = session?.exerciseLogs.find((l) => l.exerciseId === p.exerciseId);
      return !log?.done;
    })?.exerciseId ??
    planned[0]?.exerciseId ??
    null;
  const selectedExerciseId =
    localSelection && planned.some((p) => p.exerciseId === localSelection)
      ? localSelection
      : (session?.selectedExerciseId ?? fallbackSelection);

  const select = useCallback(
    (exerciseId: string) => {
      setLocalSelection(exerciseId);
      if (session) void selectExercise(session.id, exerciseId);
    },
    [session],
  );

  const advance = useCallback(
    (fromExerciseId: string) => {
      if (!session) return null;
      const next = nextPendingExerciseId(planned, session.exerciseLogs, fromExerciseId);
      if (next) select(next);
      return next;
    },
    [session, planned, select],
  );

  const value: GymSessionValue = {
    session,
    plan,
    planned,
    selectedExerciseId,
    select,
    advance,
    panelOpen,
    setPanelOpen,
    fullscreen,
    setFullscreen,
    autoRest,
    setAutoRest,
    finishedSummaryId,
    setFinishedSummaryId,
  };

  return <GymSessionContext.Provider value={value}>{children}</GymSessionContext.Provider>;
}

export function useGymSession(): GymSessionValue {
  const ctx = useContext(GymSessionContext);
  if (!ctx) throw new Error("useGymSession precisa estar dentro de <GymSessionProvider>.");
  return ctx;
}
