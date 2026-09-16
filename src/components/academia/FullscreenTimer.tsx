import { useState } from "react";
import { Minimize2, Pause, Play, RotateCcw, SlidersHorizontal } from "lucide-react";
import { useGymSession } from "@/lib/gym-session-context";
import { formatDurationClock } from "@/lib/sport-store";
import {
  exerciseCompletionState,
  pauseRest,
  pauseSession,
  resetRest,
  restBaseSeconds,
  restState,
  resumeRest,
  resumeSession,
  sessionElapsedSeconds,
  setRestOverride,
  startRest,
} from "@/lib/workout-store";
import { RestDurationEditor } from "./TimerBlock";

// ---------------------------------------------------------------------------
// Cronômetro em tela cheia — o MESMO que estiver à mostra no painel compacto,
// só maior. Não é um segundo temporizador: lê o mesmo estado, então expandir,
// recolher ou virar a face não perde tempo nem reinicia contagem.
//
// Sem promessa de alerta quando o descanso acaba com o app em segundo plano:
// o navegador não garante execução nem som nessa situação.
// ---------------------------------------------------------------------------

export function FullscreenTimer() {
  const gym = useGymSession();
  const { session, plan, planned, selectedExerciseId, timerFace, setFullscreen } = gym;
  const [editing, setEditing] = useState(false);
  if (!session) return null;

  const current = planned.find((p) => p.exerciseId === selectedExerciseId);
  const log = session.exerciseLogs.find((l) => l.exerciseId === current?.exerciseId);
  const completion = exerciseCompletionState(log, current);
  const setIndex = log?.sets.length ?? 0;
  const configured = current?.setTargets[setIndex]?.restSeconds ?? current?.restSeconds;
  const base = restBaseSeconds(session, current?.exerciseId, configured);
  const rest = restState(session, base);
  const elapsed = sessionElapsedSeconds(session);

  const playRest = () => {
    if (rest.status === "correndo") return void pauseRest(session);
    if (rest.status === "pausado") return void resumeRest(session);
    return void startRest(session.id, base);
  };

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

      <div className="flex flex-1 flex-col items-center justify-center">
        {timerFace === "descanso" ? (
          <div className="w-full max-w-xs text-center">
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
              Descanso
            </p>
            <p
              className={`mt-1 font-mono text-7xl font-bold tabular-nums ${rest.status === "fim" ? "text-success" : ""}`}
            >
              {formatDurationClock(rest.remaining)}
            </p>
            <div className="mt-6 flex items-center justify-center gap-2">
              <button
                onClick={() => void resetRest(session.id, base)}
                aria-label={`Reiniciar descanso em ${formatDurationClock(base)}`}
                className="interactive-press flex h-12 w-12 items-center justify-center rounded-xl border border-border"
              >
                <RotateCcw className="h-5 w-5" />
              </button>
              <button
                onClick={playRest}
                className="interactive-press flex items-center gap-2 rounded-xl border border-border px-6 py-3.5 text-sm font-semibold"
              >
                {rest.status === "correndo" ? (
                  <>
                    <Pause className="h-4 w-4" /> Pausar
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4" />{" "}
                    {rest.status === "pausado" ? "Continuar" : "Iniciar"}
                  </>
                )}
              </button>
              <button
                onClick={() => setEditing((v) => !v)}
                aria-label="Ajustar tempo de descanso"
                aria-expanded={editing}
                className="interactive-press flex h-12 w-12 items-center justify-center rounded-xl border border-border"
              >
                <SlidersHorizontal className="h-5 w-5" />
              </button>
            </div>
            {editing && (
              <div className="mt-3 text-left">
                <RestDurationEditor
                  current={base}
                  onCancel={() => setEditing(false)}
                  onStart={async (seconds) => {
                    if (current) await setRestOverride(session, current.exerciseId, seconds);
                    await startRest(session.id, seconds);
                    setEditing(false);
                  }}
                />
              </div>
            )}
          </div>
        ) : (
          <div className="text-center">
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
              Duração do treino
            </p>
            <p className="mt-1 font-mono text-7xl font-bold tabular-nums">
              {formatDurationClock(elapsed)}
            </p>
            <button
              onClick={() =>
                void (session.pausedAt ? resumeSession(session) : pauseSession(session))
              }
              className="interactive-press mt-6 inline-flex items-center gap-2 rounded-xl border border-border px-6 py-3.5 text-sm font-semibold"
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
        )}
      </div>

      <p className="text-center text-[11px] text-muted-foreground">
        Mantenha o Norte aberto — o aviso de fim de descanso não toca com o app em segundo plano.
      </p>
    </div>
  );
}
