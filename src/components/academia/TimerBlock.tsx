import { useState } from "react";
import { Maximize2, Pause, Play, RotateCcw } from "lucide-react";
import { formatDurationClock } from "@/lib/sport-store";
import {
  DEFAULT_REST_SECONDS,
  MAX_REST_SECONDS,
  pauseRest,
  pauseSession,
  resetRest,
  restBaseSeconds,
  restState,
  type RestStatus,
  resumeRest,
  resumeSession,
  sessionElapsedSeconds,
  setRestOverride,
  startRest,
  type WorkoutSession,
} from "@/lib/workout-store";
import { TimerPrism, type TimerFace } from "./TimerPrism";

// ---------------------------------------------------------------------------
// As duas faces do cronômetro e seus controles.
//
// Descanso e duração do treino ocupam o MESMO espaço, alternados pelo giro.
// Girar é só olhar para o outro lado: nunca pausa, reinicia nem altera tempo.
// ---------------------------------------------------------------------------

const BLOCK_HEIGHT = 74;

/** O mesmo botão, no mesmo lugar, dizendo o que vai fazer AGORA — "Iniciar"
 * num descanso pausado mentiria sobre o que acontece ao tocar. */
function playLabel(status: RestStatus): string {
  if (status === "correndo") return "Pausar descanso";
  if (status === "pausado") return "Continuar descanso";
  if (status === "fim") return "Começar outro descanso";
  return "Iniciar descanso";
}
const QUICK_MINUTES = [1, 2, 3, 5];

export function TimerBlock({
  session,
  face,
  onChangeFace,
  exerciseId,
  configuredRest,
  onExpand,
}: {
  session: WorkoutSession;
  face: TimerFace;
  onChangeFace: (face: TimerFace) => void;
  exerciseId?: string;
  /** Descanso cadastrado para a série atual. */
  configuredRest?: number;
  onExpand: () => void;
}) {
  const [editing, setEditing] = useState(false);

  const base = restBaseSeconds(session, exerciseId, configuredRest);
  const rest = restState(session, base);
  const elapsed = sessionElapsedSeconds(session);

  // Play tem significado diferente em cada estado, mas é sempre o mesmo botão
  // no mesmo lugar — "pronto" e "fim" carregam a duração-base e começam;
  // "pausado" continua de onde parou.
  const playRest = () => {
    if (rest.status === "correndo") return void pauseRest(session);
    if (rest.status === "pausado") return void resumeRest(session);
    return void startRest(session.id, base);
  };

  return (
    <div className="mt-2">
      <div className="mb-1 flex items-center justify-between gap-2">
        <FaceToggle face={face} onChange={onChangeFace} />
        <span className="text-[10px] text-muted-foreground">arraste para virar</span>
      </div>

      <TimerPrism
        face={face}
        onFlip={onChangeFace}
        height={BLOCK_HEIGHT}
        descanso={
          <FaceShell tone={rest.status === "fim" ? "done" : "normal"}>
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Descanso</p>
              <button
                onClick={() => setEditing(true)}
                aria-label={`Ajustar o tempo de descanso, agora ${formatDurationClock(rest.remaining)}`}
                className={`interactive-press -ml-1 rounded px-1 font-mono text-xl font-bold tabular-nums ${rest.status === "fim" ? "text-success" : ""}`}
              >
                {formatDurationClock(rest.remaining)}
              </button>
            </div>
            <div className="ml-auto flex shrink-0 items-center gap-1">
              <IconButton onClick={playRest} label={playLabel(rest.status)}>
                {rest.status === "correndo" ? (
                  <Pause className="h-4 w-4" />
                ) : (
                  <Play className="h-4 w-4" />
                )}
              </IconButton>
              <IconButton
                onClick={() => void resetRest(session.id, base)}
                label={`Reiniciar descanso em ${formatDurationClock(base)}`}
              >
                <RotateCcw className="h-4 w-4" />
              </IconButton>
              <IconButton onClick={onExpand} label="Expandir cronômetro de descanso">
                <Maximize2 className="h-4 w-4" />
              </IconButton>
            </div>
          </FaceShell>
        }
        treino={
          <FaceShell tone="normal">
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Treino</p>
              {/* Sem botão para ajustar: é a duração da sessão, não um tempo
                  configurável. */}
              <p className="font-mono text-xl font-bold tabular-nums">
                {formatDurationClock(elapsed)}
              </p>
            </div>
            <div className="ml-auto flex shrink-0 items-center gap-1">
              <IconButton
                onClick={() =>
                  void (session.pausedAt ? resumeSession(session) : pauseSession(session))
                }
                label={session.pausedAt ? "Retomar treino" : "Pausar treino"}
              >
                {session.pausedAt ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
              </IconButton>
              <IconButton onClick={onExpand} label="Expandir cronômetro do treino">
                <Maximize2 className="h-4 w-4" />
              </IconButton>
            </div>
          </FaceShell>
        }
      />

      {editing && (
        <RestDurationEditor
          current={base}
          onCancel={() => setEditing(false)}
          onStart={async (seconds) => {
            if (exerciseId) await setRestOverride(session, exerciseId, seconds);
            await startRest(session.id, seconds);
            setEditing(false);
          }}
        />
      )}
    </div>
  );
}

function FaceShell({ tone, children }: { tone: "normal" | "done"; children: React.ReactNode }) {
  return (
    <div
      className={`flex h-full items-center gap-2 rounded-xl border px-2.5 ${
        tone === "done" ? "border-success bg-success/10" : "border-border bg-surface-2"
      }`}
    >
      {children}
    </div>
  );
}

function IconButton({
  onClick,
  label,
  children,
}: {
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className="interactive-press flex h-9 w-9 items-center justify-center rounded-lg border border-border text-foreground"
    >
      {children}
    </button>
  );
}

/** Alternativa visível ao gesto — quem não descobre o arrasto, ou não pode
 * fazê-lo, troca de face por aqui. */
function FaceToggle({ face, onChange }: { face: TimerFace; onChange: (f: TimerFace) => void }) {
  return (
    <div
      role="group"
      aria-label="Qual cronômetro mostrar"
      className="flex rounded-lg border border-border p-0.5"
    >
      {(["descanso", "treino"] as const).map((option) => (
        <button
          key={option}
          onClick={() => onChange(option)}
          aria-pressed={face === option}
          className={`interactive-press rounded-md px-2 py-0.5 text-[10px] font-semibold capitalize ${
            face === option ? "bg-primary/15 text-primary" : "text-muted-foreground"
          }`}
        >
          {option}
        </button>
      ))}
    </div>
  );
}

/** Editor ancorado ao cronômetro. Nada muda enquanto ele está só aberto: a
 * contagem em andamento só é tocada ao confirmar em "Iniciar". */
export function RestDurationEditor({
  current,
  onCancel,
  onStart,
}: {
  current: number;
  onCancel: () => void;
  onStart: (seconds: number) => void | Promise<void>;
}) {
  const [minutes, setMinutes] = useState(String(Math.floor(current / 60)));
  const [seconds, setSeconds] = useState(String(current % 60).padStart(2, "0"));

  const total = Math.min(
    MAX_REST_SECONDS,
    (parseInt(minutes, 10) || 0) * 60 + (parseInt(seconds, 10) || 0),
  );
  const valid = total > 0;

  const pick = (m: number) => {
    setMinutes(String(m));
    setSeconds("00");
  };

  return (
    <div
      role="group"
      aria-label="Tempo de descanso"
      className="mt-1.5 rounded-xl border border-border bg-surface p-2.5 shadow-lg"
    >
      <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
        Tempo de descanso
      </p>
      <div className="mt-2 flex gap-1.5">
        {QUICK_MINUTES.map((m) => (
          <button
            key={m}
            onClick={() => pick(m)}
            aria-pressed={total === m * 60}
            className={`interactive-press flex-1 rounded-lg border py-1.5 text-[11px] font-semibold ${
              total === m * 60 ? "border-primary bg-primary/15 text-primary" : "border-border"
            }`}
          >
            {m} min
          </button>
        ))}
      </div>
      <div className="mt-2 flex items-center gap-1.5">
        <label className="flex-1">
          <span className="mb-0.5 block text-[9px] uppercase text-muted-foreground">min</span>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            value={minutes}
            onChange={(e) => setMinutes(e.target.value)}
            className="w-full rounded-md border border-border bg-surface-2 px-2 py-1.5 text-center text-sm tabular-nums outline-none focus:border-primary"
          />
        </label>
        <label className="flex-1">
          <span className="mb-0.5 block text-[9px] uppercase text-muted-foreground">seg</span>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            max={59}
            value={seconds}
            onChange={(e) => setSeconds(e.target.value)}
            className="w-full rounded-md border border-border bg-surface-2 px-2 py-1.5 text-center text-sm tabular-nums outline-none focus:border-primary"
          />
        </label>
      </div>
      {!valid && (
        <p className="mt-1.5 text-[10px] text-danger">
          O descanso precisa de pelo menos 1 segundo.
        </p>
      )}
      <div className="mt-2 flex gap-2">
        <button
          onClick={onCancel}
          className="interactive-press flex-1 rounded-lg border border-border py-2 text-[11px] font-semibold"
        >
          Cancelar
        </button>
        <button
          onClick={() => void onStart(total || DEFAULT_REST_SECONDS)}
          disabled={!valid}
          className="interactive-press flex-1 rounded-lg bg-primary py-2 text-[11px] font-bold text-primary-foreground disabled:opacity-40"
        >
          Iniciar
        </button>
      </div>
    </div>
  );
}
