import { Minimize2, Pause, Play, Minus, Plus } from "lucide-react";
import { useGymSession } from "@/lib/gym-session-context";
import { formatDurationClock } from "@/lib/sport-store";
import {
  adjustRest,
  clearRest,
  exerciseCompletionState,
  isRestRunning,
  pauseRest,
  pauseSession,
  restRemainingSeconds,
  resumeRest,
  resumeSession,
  sessionElapsedSeconds,
  startRest,
} from "@/lib/workout-store";

// ---------------------------------------------------------------------------
// Cronômetro em tela cheia — os MESMOS dados do painel compacto, só maiores.
// Recolher não reinicia nada: os dois relógios vivem no banco, derivados de
// horários, então a tela é só uma leitura deles.
//
// Sem promessa de alerta quando o descanso acaba com o app em segundo plano:
// o navegador não garante execução nem som nessa situação.
// ---------------------------------------------------------------------------

export function FullscreenTimer() {
  const gym = useGymSession();
  const { session, plan, planned, selectedExerciseId, setFullscreen } = gym;
  if (!session) return null;

  const elapsed = sessionElapsedSeconds(session);
  const rest = restRemainingSeconds(session);
  const restOver = rest !== null && rest <= 0;
  const current = planned.find((p) => p.exerciseId === selectedExerciseId);
  const log = session.exerciseLogs.find((l) => l.exerciseId === current?.exerciseId);
  const completion = exerciseCompletionState(log, current);
  const restRunning = isRestRunning(session);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background px-6 pb-10 pt-12">
      <div className="flex items-center justify-between">
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
            {plan ? `Treino ${plan.letter} · ${plan.name}` : "Treino"}
          </p>
          {current && (
            <p className="mt-0.5 truncate text-sm font-semibold">
              {current.name} · {log?.sets.length ?? 0}/{current.setsTarget} séries
              {completion === "concluido" && " · concluído"}
            </p>
          )}
        </div>
        <button
          onClick={() => setFullscreen(false)}
          aria-label="Recolher cronômetro"
          className="interactive-press flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border"
        >
          <Minimize2 className="h-4 w-4" />
        </button>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center gap-10">
        <div className="text-center">
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
            Duração do treino
          </p>
          <p className="mt-1 font-mono text-6xl font-bold tabular-nums">
            {formatDurationClock(elapsed)}
          </p>
          <button
            onClick={() => void (session.pausedAt ? resumeSession(session) : pauseSession(session))}
            className="interactive-press mt-4 inline-flex items-center gap-2 rounded-xl border border-border px-5 py-2.5 text-sm font-semibold"
          >
            {session.pausedAt ? (
              <>
                <Play className="h-4 w-4" /> Retomar treino
              </>
            ) : (
              <>
                <Pause className="h-4 w-4" /> Pausar treino
              </>
            )}
          </button>
          {session.pausedAt && (
            <p className="mt-2 text-[11px] text-warning">
              Treino pausado — o tempo não está correndo.
            </p>
          )}
        </div>

        <div className="w-full max-w-xs text-center">
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
            Descanso
          </p>
          {rest === null ? (
            <button
              onClick={() => void startRest(session.id, current?.restSeconds || 60)}
              className="interactive-press mt-2 w-full rounded-xl border border-dashed border-border py-3 text-sm text-muted-foreground"
            >
              Iniciar descanso
            </button>
          ) : (
            <>
              <p
                className={`mt-1 font-mono text-5xl font-bold tabular-nums ${restOver ? "text-success" : ""}`}
              >
                {formatDurationClock(rest)}
              </p>
              <div className="mt-4 flex items-center justify-center gap-2">
                <button
                  onClick={() => void adjustRest(session, -15)}
                  aria-label="Menos 15 segundos"
                  className="interactive-press flex h-11 w-11 items-center justify-center rounded-xl border border-border"
                >
                  <Minus className="h-4 w-4" />
                </button>
                <button
                  onClick={() => void (restRunning ? pauseRest(session) : resumeRest(session))}
                  className="interactive-press flex items-center gap-2 rounded-xl border border-border px-5 py-3 text-sm font-semibold"
                >
                  {restRunning ? (
                    <>
                      <Pause className="h-4 w-4" /> Pausar
                    </>
                  ) : (
                    <>
                      <Play className="h-4 w-4" /> Continuar
                    </>
                  )}
                </button>
                <button
                  onClick={() => void adjustRest(session, 15)}
                  aria-label="Mais 15 segundos"
                  className="interactive-press flex h-11 w-11 items-center justify-center rounded-xl border border-border"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
              <button
                onClick={() => void clearRest(session.id)}
                className="interactive-press mt-3 text-xs font-semibold text-muted-foreground underline"
              >
                Zerar descanso
              </button>
            </>
          )}
        </div>
      </div>

      <p className="text-center text-[11px] text-muted-foreground">
        Mantenha o Norte aberto — o aviso de fim de descanso não toca com o app em segundo plano.
      </p>
    </div>
  );
}
