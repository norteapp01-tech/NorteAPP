import { useLayoutEffect, useState, type CSSProperties, type RefObject } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Maximize2,
  Minus,
  Pause,
  Play,
  Plus,
  X,
} from "lucide-react";
import { InlineError } from "@/components/ui/inline-error";
import { useAsyncAction } from "@/hooks/use-async-action";
import { useGymSession } from "@/lib/gym-session-context";
import { formatDurationClock } from "@/lib/sport-store";
import {
  adjustRest,
  clearRest,
  completeExerciseLog,
  exerciseCompletionState,
  finishSession,
  isRestRunning,
  logSet,
  pauseRest,
  pauseSession,
  restRemainingSeconds,
  resumeRest,
  resumeSession,
  sessionElapsedSeconds,
  startRest,
  updateSet,
  type PlannedExercise,
} from "@/lib/workout-store";

// ---------------------------------------------------------------------------
// Painel rápido — UMA série por vez. A série atual dá lugar à próxima no mesmo
// espaço em vez de empilhar; é o que permite registrar sem ler a tela inteira
// entre um exercício e outro.
//
// Escreve pelas mesmas funções do store que o modal completo usa
// (logSet/updateSet/completeExerciseLog), então os dois são a mesma fonte de
// dados — não existe estado paralelo pra divergir.
// ---------------------------------------------------------------------------

const PANEL_MAX_WIDTH = 340;
const EDGE = 8;

export function QuickSetPanel({
  anchor,
  bubbleSize,
  containerRef,
  onClose,
}: {
  anchor: { x: number; y: number };
  bubbleSize: number;
  containerRef: RefObject<HTMLDivElement | null>;
  onClose: () => void;
}) {
  const gym = useGymSession();
  const { session, plan, planned, selectedExerciseId, select, advance, autoRest } = gym;
  const navigate = useNavigate();
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [navHeight, setNavHeight] = useState(0);
  const [draft, setDraft] = useState<{ key: string; weight: string; reps: string } | null>(null);
  const [showDone, setShowDone] = useState(false);
  const [confirmFinish, setConfirmFinish] = useState(false);
  const setAction = useAsyncAction();
  const finishAction = useAsyncAction();

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => {
      setRect(el.getBoundingClientRect());
      // Medido, não chutado: o rodapé não existe na tela de gravação do
      // Esportes, e um valor fixo sobraria justamente onde há espaço.
      const nav = document.querySelector(".norte-bottom-nav");
      setNavHeight(nav ? nav.getBoundingClientRect().height : 0);
    };
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("orientationchange", measure);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("orientationchange", measure);
    };
  }, [containerRef]);

  if (!session) return null;

  const index = planned.findIndex((p) => p.exerciseId === selectedExerciseId);
  const current: PlannedExercise | undefined = planned[index] ?? planned[0];
  const log = session.exerciseLogs.find((l) => l.exerciseId === current?.exerciseId);
  const doneSets = log?.sets ?? [];
  const completion = exerciseCompletionState(log, current);
  const setIndex = doneSets.length;
  const target = current?.setTargets[setIndex] ??
    current?.setTargets.at(-1) ?? {
      reps: current?.repsTarget ?? 0,
      weight: current?.loadTarget ?? 0,
      restSeconds: current?.restSeconds ?? 60,
    };
  const draftKey = `${current?.exerciseId ?? ""}:${setIndex}`;
  const values =
    draft?.key === draftKey ? draft : { weight: String(target.weight), reps: String(target.reps) };

  const pending = planned.filter(
    (p) =>
      exerciseCompletionState(
        session.exerciseLogs.find((l) => l.exerciseId === p.exerciseId),
        p,
      ) !== "concluido",
  );
  const rest = restRemainingSeconds(session);
  const elapsed = sessionElapsedSeconds(session);

  // Ancora perto da bolha e escolhe o lado com espaço. A bolha pode ter sido
  // solta em qualquer canto, então alinhar pela borda dela não basta: o
  // resultado é preso dentro do container nas duas direções, senão um painel
  // de 340px ancorado no meio-esquerda sai pela direita da tela.
  const width = rect ? Math.min(PANEL_MAX_WIDTH, rect.width - EDGE * 2) : PANEL_MAX_WIDTH;
  const toRight = rect ? anchor.x + bubbleSize / 2 > rect.width / 2 : true;
  const preferredLeft = toRight ? anchor.x + bubbleSize - width : anchor.x;
  const left = rect
    ? Math.min(Math.max(EDGE, preferredLeft), Math.max(EDGE, rect.width - width - EDGE))
    : EDGE;
  // Abre pro lado com mais espaço, não pela metade da tela em que a bolha
  // caiu: com a bolha perto do meio, as duas metades dão respostas iguais e
  // uma delas não tem altura pra nada. A faixa da navegação conta como
  // ocupada — abrir por cima dela escondia o rodapé do próprio painel.
  const roomBelow = rect ? rect.height - (anchor.y + bubbleSize + EDGE) - EDGE - navHeight : 0;
  const roomAbove = rect ? anchor.y - EDGE * 2 : 0;
  const below = roomBelow >= roomAbove;
  // A altura máxima é o espaço que existe nesse lado — é o que faz o painel
  // rolar em vez de vazar quando as séries já feitas são expandidas.
  const available = rect ? (below ? roomBelow : roomAbove) : undefined;
  const style: CSSProperties = {
    width,
    left,
    maxHeight: available !== undefined ? Math.max(160, available) : undefined,
    ...(below
      ? { top: anchor.y + bubbleSize + EDGE }
      : { bottom: Math.max(EDGE, (rect?.height ?? 0) - anchor.y + EDGE) }),
  };

  const step = (delta: number) => {
    if (planned.length === 0) return;
    // Navega por TODOS os exercícios, inclusive os já concluídos — trocar de
    // exercício nunca conclui, cancela nem apaga nada.
    const next = planned[(index + delta + planned.length) % planned.length];
    select(next.exerciseId);
    setShowDone(false);
  };

  const confirmSet = () =>
    setAction.run(async () => {
      if (!current) return;
      const weight = parseFloat(values.weight) || 0;
      const reps = parseInt(values.reps, 10) || 0;
      await logSet(session.id, current.exerciseId, weight, reps);
      const isLastPlanned = setIndex + 1 >= current.setsTarget;
      if (isLastPlanned) await completeExerciseLog(session.id, current.exerciseId);
      if (autoRest && target.restSeconds > 0) await startRest(session.id, target.restSeconds);
      // Só depois de tudo gravado: uma falha acima interrompe aqui e mantém os
      // valores digitados na tela, sem avançar.
      setDraft(null);
      if (isLastPlanned) advance(current.exerciseId);
    });

  const addExtraSet = () =>
    setAction.run(async () => {
      if (!current) return;
      const weight = parseFloat(values.weight) || 0;
      const reps = parseInt(values.reps, 10) || 0;
      await logSet(session.id, current.exerciseId, weight, reps);
      setDraft(null);
    });

  return (
    <section
      role="dialog"
      aria-label="Controle rápido do treino"
      className="card-surface pointer-events-auto absolute flex flex-col overflow-hidden shadow-2xl"
      style={style}
    >
      <header className="flex items-center gap-1 border-b border-border px-2 py-2">
        <button
          onClick={() => step(-1)}
          disabled={planned.length < 2}
          aria-label="Exercício anterior"
          className="interactive-press flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground disabled:opacity-30"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="min-w-0 flex-1 text-center">
          <p className="truncate text-sm font-bold">{current?.name ?? "Treino"}</p>
          <p className="text-[10px] text-muted-foreground">
            {plan ? `${plan.letter} · ` : ""}
            {planned.length > 0 ? `${index + 1} de ${planned.length}` : "sem exercícios"}
          </p>
        </div>
        <button
          onClick={() => step(1)}
          disabled={planned.length < 2}
          aria-label="Próximo exercício"
          className="interactive-press flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground disabled:opacity-30"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
        <button
          onClick={onClose}
          aria-label="Minimizar painel"
          title="Minimizar — o treino continua correndo"
          className="interactive-press flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        {confirmFinish ? (
          <FinishConfirmation
            partial={planned.filter((p) => {
              const state = exerciseCompletionState(
                session.exerciseLogs.find((l) => l.exerciseId === p.exerciseId),
                p,
              );
              return state !== "concluido";
            })}
            logs={session.exerciseLogs}
            pending={finishAction.pending}
            error={finishAction.error}
            onCancel={() => setConfirmFinish(false)}
            onConfirm={() =>
              finishAction.run(async () => {
                const id = session.id;
                await finishSession(id);
                gym.setFinishedSummaryId(id);
                onClose();
                await navigate({ to: "/sub-agenda/$categoria", params: { categoria: "academia" } });
              })
            }
          />
        ) : (
          <>
            {doneSets.length > 0 && (
              <div className="mb-2">
                <button
                  onClick={() => setShowDone((v) => !v)}
                  aria-expanded={showDone}
                  className="interactive-press flex w-full items-center justify-center gap-1 rounded-lg py-1 text-[11px] text-muted-foreground"
                >
                  <ChevronUp
                    className={`h-3.5 w-3.5 transition-transform ${showDone ? "" : "rotate-180"}`}
                  />
                  {showDone ? "ocultar" : `${doneSets.length} séries registradas`}
                </button>
                {showDone && current && (
                  <ul className="mt-1 space-y-1">
                    {doneSets.map((s) => (
                      <li
                        key={`${s.setIndex}-${s.weight}-${s.reps}`}
                        className="flex items-center gap-1.5 rounded-lg border border-success/30 bg-success/5 px-2 py-1"
                      >
                        <span className="w-10 shrink-0 text-[10px] text-muted-foreground">
                          Série {s.setIndex + 1}
                        </span>
                        {/* Editar usa updateSet: corrige a série existente, não
                            cria outra nem redispara avanço/descanso. */}
                        <input
                          type="number"
                          inputMode="decimal"
                          defaultValue={s.weight}
                          aria-label={`Peso da série ${s.setIndex + 1}`}
                          onBlur={(e) =>
                            void updateSet(session.id, current.exerciseId, s.setIndex, {
                              weight: parseFloat(e.target.value) || 0,
                            })
                          }
                          className="w-14 rounded-md border border-border bg-surface px-1.5 py-1 text-right text-xs tabular-nums outline-none focus:border-primary"
                        />
                        <span className="text-[10px] text-muted-foreground">kg</span>
                        <input
                          type="number"
                          inputMode="numeric"
                          defaultValue={s.reps}
                          aria-label={`Repetições da série ${s.setIndex + 1}`}
                          onBlur={(e) =>
                            void updateSet(session.id, current.exerciseId, s.setIndex, {
                              reps: parseInt(e.target.value, 10) || 0,
                            })
                          }
                          className="w-12 rounded-md border border-border bg-surface px-1.5 py-1 text-right text-xs tabular-nums outline-none focus:border-primary"
                        />
                        <span className="text-[10px] text-muted-foreground">reps</span>
                        <Check className="ml-auto h-3.5 w-3.5 shrink-0 text-success" />
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {!current && (
              <p className="py-4 text-center text-xs text-muted-foreground">
                Esse treino não tem exercícios cadastrados.
              </p>
            )}

            {current && completion === "concluido" ? (
              <div className="py-2 text-center">
                <Check className="check-enter mx-auto h-7 w-7 text-success" strokeWidth={2.5} />
                <p className="mt-1.5 text-sm font-semibold">Exercício concluído</p>
                <p className="text-[11px] text-muted-foreground">
                  {doneSets.length} séries registradas
                </p>
                <button
                  onClick={addExtraSet}
                  disabled={setAction.pending}
                  className="interactive-press mt-3 inline-flex items-center gap-1 rounded-lg border border-dashed border-border px-3 py-2 text-xs text-muted-foreground disabled:opacity-40"
                >
                  <Plus className="h-3.5 w-3.5" /> Adicionar série
                </button>
              </div>
            ) : (
              current && (
                <>
                  <p className="text-center text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Série {setIndex + 1} de {Math.max(current.setsTarget, setIndex + 1)}
                  </p>
                  <div className="mt-2 flex items-end justify-center gap-2">
                    <label className="flex-1">
                      <span className="mb-1 block text-center text-[10px] text-muted-foreground">
                        peso (kg)
                      </span>
                      <input
                        type="number"
                        inputMode="decimal"
                        value={values.weight}
                        onChange={(e) =>
                          setDraft({ key: draftKey, weight: e.target.value, reps: values.reps })
                        }
                        className="w-full rounded-xl border border-border bg-surface px-2 py-2.5 text-center font-mono text-lg font-bold tabular-nums outline-none focus:border-primary"
                      />
                    </label>
                    <label className="flex-1">
                      <span className="mb-1 block text-center text-[10px] text-muted-foreground">
                        reps
                      </span>
                      <input
                        type="number"
                        inputMode="numeric"
                        value={values.reps}
                        onChange={(e) =>
                          setDraft({ key: draftKey, weight: values.weight, reps: e.target.value })
                        }
                        className="w-full rounded-xl border border-border bg-surface px-2 py-2.5 text-center font-mono text-lg font-bold tabular-nums outline-none focus:border-primary"
                      />
                    </label>
                    <button
                      onClick={confirmSet}
                      disabled={setAction.pending}
                      aria-label={`Registrar série ${setIndex + 1}`}
                      className="interactive-press flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground disabled:opacity-40"
                    >
                      <Check className="h-6 w-6" strokeWidth={3} />
                    </button>
                  </div>
                </>
              )
            )}

            {setAction.error && (
              <InlineError
                message={setAction.error}
                onRetry={setAction.clearError}
                className="mt-2"
              />
            )}

            <RestRow
              rest={rest}
              running={isRestRunning(session)}
              onStart={() => void startRest(session.id, target.restSeconds || 60)}
              onPause={() => void pauseRest(session)}
              onResume={() => void resumeRest(session)}
              onAdjust={(delta) => void adjustRest(session, delta)}
              onClear={() => void clearRest(session.id)}
            />

            <div className="mt-2 flex items-center justify-between gap-2 rounded-xl border border-border bg-surface-2 px-2.5 py-2">
              <div className="min-w-0">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Treino</p>
                <p className="font-mono text-base font-bold tabular-nums">
                  {formatDurationClock(elapsed)}
                </p>
              </div>
              <button
                onClick={() =>
                  void (session.pausedAt ? resumeSession(session) : pauseSession(session))
                }
                className="interactive-press flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-[11px] font-semibold"
              >
                {session.pausedAt ? (
                  <>
                    <Play className="h-3.5 w-3.5" /> Retomar
                  </>
                ) : (
                  <>
                    <Pause className="h-3.5 w-3.5" /> Pausar
                  </>
                )}
              </button>
            </div>

            {pending.length === 0 && (
              <p className="mt-2 rounded-xl border border-success/40 bg-success/10 px-3 py-2 text-center text-xs font-semibold text-success">
                Treino pronto para finalizar
              </p>
            )}
          </>
        )}
      </div>

      {!confirmFinish && (
        <footer className="flex items-center gap-1 border-t border-border px-2 py-1.5">
          <button
            onClick={() => {
              onClose();
              void navigate({ to: "/sub-agenda/$categoria", params: { categoria: "academia" } });
            }}
            className="interactive-press flex-1 rounded-lg px-2 py-1.5 text-[11px] font-semibold text-muted-foreground"
          >
            Abrir treino
          </button>
          <button
            onClick={() => gym.setFullscreen(true)}
            aria-label="Expandir cronômetro"
            className="interactive-press flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground"
          >
            <Maximize2 className="h-4 w-4" />
          </button>
          <button
            onClick={() => setConfirmFinish(true)}
            className="interactive-press flex-1 rounded-lg bg-primary px-2 py-1.5 text-[11px] font-bold text-primary-foreground"
          >
            Finalizar treino
          </button>
        </footer>
      )}
    </section>
  );
}

function RestRow({
  rest,
  running,
  onStart,
  onPause,
  onResume,
  onAdjust,
  onClear,
}: {
  rest: number | null;
  running: boolean;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onAdjust: (delta: number) => void;
  onClear: () => void;
}) {
  if (rest === null) {
    return (
      <button
        onClick={onStart}
        className="interactive-press mt-2 w-full rounded-xl border border-dashed border-border py-2 text-[11px] text-muted-foreground"
      >
        Iniciar descanso
      </button>
    );
  }
  const over = rest <= 0;
  return (
    <div
      className={`mt-2 flex items-center gap-1.5 rounded-xl border px-2.5 py-2 ${over ? "border-success bg-success/10" : "border-border bg-surface-2"}`}
    >
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Descanso</p>
        <p
          className={`font-mono text-base font-bold tabular-nums ${over ? "text-success" : ""}`}
          aria-live="off"
        >
          {formatDurationClock(rest)}
        </p>
      </div>
      <div className="ml-auto flex items-center gap-1">
        <button
          onClick={() => onAdjust(-15)}
          aria-label="Menos 15 segundos de descanso"
          className="interactive-press flex h-7 w-7 items-center justify-center rounded-lg border border-border"
        >
          <Minus className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={() => onAdjust(15)}
          aria-label="Mais 15 segundos de descanso"
          className="interactive-press flex h-7 w-7 items-center justify-center rounded-lg border border-border"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={running ? onPause : onResume}
          aria-label={running ? "Pausar descanso" : "Continuar descanso"}
          className="interactive-press flex h-7 w-7 items-center justify-center rounded-lg border border-border"
        >
          {running ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
        </button>
        {/* Zerar mexe SÓ no descanso — nenhuma série registrada é tocada. */}
        <button
          onClick={onClear}
          className="interactive-press rounded-lg border border-border px-2 py-1 text-[10px] font-semibold"
        >
          zerar
        </button>
      </div>
    </div>
  );
}

function FinishConfirmation({
  partial,
  logs,
  pending,
  error,
  onCancel,
  onConfirm,
}: {
  partial: PlannedExercise[];
  logs: { exerciseId: string | null; sets: unknown[]; done: boolean }[];
  pending: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div>
      <p className="text-sm font-bold">Finalizar treino?</p>
      {partial.length === 0 ? (
        <p className="mt-1 text-xs text-muted-foreground">Todos os exercícios estão concluídos.</p>
      ) : (
        <>
          <p className="mt-1 text-xs text-muted-foreground">
            Finalizar não marca nada como feito. Fica assim no histórico:
          </p>
          <ul className="mt-2 space-y-1">
            {partial.map((p) => {
              const sets = logs.find((l) => l.exerciseId === p.exerciseId)?.sets.length ?? 0;
              return (
                <li key={p.exerciseId} className="flex items-center justify-between gap-2 text-xs">
                  <span className="min-w-0 truncate">{p.name}</span>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${sets > 0 ? "bg-warning/15 text-warning" : "bg-surface-2 text-muted-foreground"}`}
                  >
                    {sets > 0 ? `parcial · ${sets}/${p.setsTarget}` : "não realizado"}
                  </span>
                </li>
              );
            })}
          </ul>
        </>
      )}
      {error && <InlineError message={error} className="mt-2" />}
      <div className="mt-3 flex gap-2">
        <button
          onClick={onCancel}
          className="interactive-press flex-1 rounded-xl border border-border py-2 text-xs font-semibold"
        >
          Voltar
        </button>
        <button
          onClick={onConfirm}
          disabled={pending}
          className="interactive-press flex-1 rounded-xl bg-primary py-2 text-xs font-bold text-primary-foreground disabled:opacity-50"
        >
          {pending ? "Finalizando…" : "Finalizar"}
        </button>
      </div>
    </div>
  );
}
