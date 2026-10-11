import { useLayoutEffect, useState, type CSSProperties, type RefObject } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  ArrowDownToLine,
  Check,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Plus,
  SkipForward,
  X,
} from "lucide-react";
import { NumberField } from "@/components/ui/number-field";
import { InlineError } from "@/components/ui/inline-error";
import { useAsyncAction } from "@/hooks/use-async-action";
import { useGymSession } from "@/lib/gym-session-context";
import {
  completeExerciseLog,
  exerciseCompletionState,
  finishSession,
  logSet,
  regularSetCount,
  restBaseSeconds,
  skipExercise,
  startRest,
  updateSet,
  type PlannedExercise,
} from "@/lib/workout-store";
import { TimerBlock } from "./TimerBlock";

// ---------------------------------------------------------------------------
// Painel rápido — UMA série por vez. A série atual dá lugar à próxima no mesmo
// espaço em vez de empilhar; é o que permite registrar sem ler a tela inteira
// entre um exercício e outro.
//
// Escreve pelas mesmas funções do store que o modal completo usa
// (logSet/updateSet/completeExerciseLog), então os dois são a mesma fonte de
// dados — não existe estado paralelo pra divergir.
// ---------------------------------------------------------------------------

const PANEL_MAX_WIDTH = 380;
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
  // Séries somadas à meta com "Adicionar série", por exercício. A série nova
  // aparece como as outras, com kg e repetições para preencher.
  const [extraByExercise, setExtraByExercise] = useState<Record<string, number>>({});
  const [dropOpen, setDropOpen] = useState(false);
  const [dropDraft, setDropDraft] = useState({ weight: "0", reps: "0" });
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
      const nav = document.querySelector(".norte-voice-dock, .norte-bottom-nav");
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
  const extra = current ? (extraByExercise[current.exerciseId] ?? 0) : 0;
  // Drops não contam como série planejada.
  const setIndex = regularSetCount(log);
  const totalSets = (current?.setsTarget ?? 0) + extra;
  // Com séries somadas ainda por fazer, o exercício não está concluído.
  const completion =
    extra > 0 && setIndex < totalSets ? "parcial" : exerciseCompletionState(log, current);
  const lastRegular = [...doneSets].reverse().find((s) => !s.isDrop);
  const target = current?.setTargets[setIndex] ??
    current?.setTargets.at(-1) ?? {
      reps: current?.repsTarget ?? 0,
      weight: current?.loadTarget ?? 0,
      restSeconds: current?.restSeconds ?? 60,
    };
  const draftKey = `${current?.exerciseId ?? ""}:${setIndex}`;
  // Série além da meta parte do que a pessoa acabou de fazer.
  const beyondPlan = setIndex >= (current?.setTargets.length ?? 0);
  const defaults =
    beyondPlan && lastRegular
      ? { weight: String(lastRegular.weight), reps: String(lastRegular.reps) }
      : { weight: String(target.weight), reps: String(target.reps) };
  const values = draft?.key === draftKey ? draft : defaults;

  const pending = planned.filter(
    (p) =>
      exerciseCompletionState(
        session.exerciseLogs.find((l) => l.exerciseId === p.exerciseId),
        p,
      ) !== "concluido",
  );

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
    setDropOpen(false);
    setDraft(null);
  };

  const confirmSet = () =>
    setAction.run(async () => {
      if (!current) return;
      const weight = parseFloat(values.weight) || 0;
      const reps = parseInt(values.reps, 10) || 0;
      const wasDone = Boolean(log?.done);
      await logSet(session.id, current.exerciseId, weight, reps);
      const isLastPlanned = setIndex + 1 >= totalSets;
      if (isLastPlanned) await completeExerciseLog(session.id, current.exerciseId);
      // Duração da série que acabou de ser concluída — com a escolha temporária
      // deste exercício tendo precedência, se houver uma.
      if (autoRest) {
        await startRest(
          session.id,
          restBaseSeconds(session, current.exerciseId, target.restSeconds),
        );
      }
      // Só depois de tudo gravado: uma falha acima interrompe aqui e mantém os
      // valores digitados na tela, sem avançar.
      setDraft(null);
      // Série extra num exercício que já estava concluído não puxa a pessoa
      // para o próximo: ela escolheu ficar nele.
      if (isLastPlanned && !wasDone) advance(current.exerciseId);
    });

  const addSet = () => {
    if (!current) return;
    setDraft(null);
    setExtraByExercise((m) => ({ ...m, [current.exerciseId]: (m[current.exerciseId] ?? 0) + 1 }));
  };

  const openDrop = () => {
    setDropDraft({
      weight: String(Math.max(0, Math.round((lastRegular?.weight ?? target.weight) * 0.75))),
      reps: String(Math.max(1, Math.round((lastRegular?.reps ?? target.reps) / 2))),
    });
    setDropOpen(true);
  };

  const confirmDrop = () =>
    setAction.run(async () => {
      if (!current) return;
      await logSet(
        session.id,
        current.exerciseId,
        parseFloat(dropDraft.weight) || 0,
        parseInt(dropDraft.reps, 10) || 0,
        { isDrop: true },
      );
      setDropOpen(false);
    });

  const skipCurrent = () =>
    setAction.run(async () => {
      if (!current) return;
      await skipExercise(session.id, current.exerciseId, true);
      setDraft(null);
      advance(current.exerciseId);
    });

  return (
    <section
      role="dialog"
      aria-label="Controle rápido do treino"
      className="academia-quick-panel card-surface pointer-events-auto absolute flex flex-col overflow-hidden shadow-2xl"
      style={style}
    >
      <header className="academia-quick-header flex items-center gap-1 border-b border-border px-3 py-3">
        <button
          onClick={() => step(-1)}
          disabled={planned.length < 2}
          aria-label="Exercício anterior"
          className="interactive-press flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted-foreground disabled:opacity-30"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="min-w-0 flex-1 text-center">
          <p className="truncate text-sm font-semibold">{current?.name ?? "Treino"}</p>
          <p className="text-xs text-muted-foreground">
            {plan ? `Treino ${plan.letter} · ` : ""}
            {planned.length > 0 ? `exercício ${index + 1} de ${planned.length}` : "sem exercícios"}
          </p>
        </div>
        <button
          onClick={() => step(1)}
          disabled={planned.length < 2}
          aria-label="Próximo exercício"
          className="interactive-press flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted-foreground disabled:opacity-30"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
        <button
          onClick={onClose}
          aria-label="Minimizar painel"
          title="Minimizar — o treino continua correndo"
          className="interactive-press flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
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
                  className="interactive-press flex min-h-9 w-full items-center justify-center gap-1 rounded-lg py-1 text-xs text-muted-foreground"
                >
                  <ChevronUp
                    className={`h-3.5 w-3.5 transition-transform ${showDone ? "" : "rotate-180"}`}
                  />
                  {showDone ? "ocultar" : `${doneSets.length} séries registradas`}
                </button>
                {showDone && current && (
                  <ul className="mt-1 space-y-1">
                    {(() => {
                      let regular = 0;
                      return doneSets.map((s) => {
                        const label = s.isDrop ? "Drop" : `Série ${++regular}`;
                        return (
                          <li
                            key={`${s.setIndex}-${s.weight}-${s.reps}`}
                            className="flex items-center gap-1.5 border-b border-border px-2 py-2 last:border-b-0"
                          >
                            <span
                              className={`w-10 shrink-0 text-[10px] ${s.isDrop ? "font-semibold text-warning" : "text-muted-foreground"}`}
                            >
                              {label}
                            </span>
                            {/* Editar usa updateSet: corrige a série existente,
                                não cria outra nem redispara avanço/descanso. */}
                            <NumberField
                              value={s.weight}
                              aria-label={`Peso de ${label}`}
                              onValue={(v) =>
                                void updateSet(session.id, current.exerciseId, s.setIndex, {
                                  weight: v,
                                })
                              }
                              className="w-14 rounded-md border border-border bg-surface px-1.5 py-1 text-right text-xs tabular-nums outline-none focus:border-primary"
                            />
                            <span className="text-[10px] text-muted-foreground">kg</span>
                            <NumberField
                              integer
                              value={s.reps}
                              aria-label={`Repetições de ${label}`}
                              onValue={(v) =>
                                void updateSet(session.id, current.exerciseId, s.setIndex, {
                                  reps: v,
                                })
                              }
                              className="w-12 rounded-md border border-border bg-surface px-1.5 py-1 text-right text-xs tabular-nums outline-none focus:border-primary"
                            />
                            <span className="text-[10px] text-muted-foreground">reps</span>
                            <Check className="ml-auto h-3.5 w-3.5 shrink-0 text-success" />
                          </li>
                        );
                      });
                    })()}
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
                <p className="text-[11px] text-muted-foreground">{setIndex} séries registradas</p>
                <button
                  onClick={addSet}
                  disabled={setAction.pending}
                  className="academia-add-set interactive-press mt-3 inline-flex items-center gap-1 rounded-xl px-4 py-2.5 text-xs font-semibold"
                >
                  <Plus className="h-3.5 w-3.5" /> Adicionar série
                </button>
              </div>
            ) : (
              current && (
                <>
                  <p className="text-center text-base font-semibold tracking-[-0.02em] text-foreground">
                    Série <span className="academia-current-set">{setIndex + 1}</span> de{" "}
                    {Math.max(totalSets, setIndex + 1)}
                  </p>
                  <div className="mt-5 flex items-end justify-center gap-2.5">
                    <label className="flex-1">
                      <span className="mb-1.5 block text-center text-xs text-muted-foreground">
                        Peso (kg)
                      </span>
                      <NumberField
                        value={parseFloat(values.weight) || 0}
                        onValue={(v) =>
                          setDraft({ key: draftKey, weight: String(v), reps: values.reps })
                        }
                        onEmpty={() => setDraft({ key: draftKey, weight: "0", reps: values.reps })}
                        className="academia-quick-number w-full min-w-0 rounded-[22px] border border-border bg-background/55 px-2 py-3.5 text-center font-mono text-2xl font-bold tabular-nums outline-none focus:border-primary"
                      />
                    </label>
                    <label className="flex-1">
                      <span className="mb-1.5 block text-center text-xs text-muted-foreground">
                        Repetições
                      </span>
                      <NumberField
                        integer
                        value={parseInt(values.reps, 10) || 0}
                        onValue={(v) =>
                          setDraft({ key: draftKey, weight: values.weight, reps: String(v) })
                        }
                        onEmpty={() =>
                          setDraft({ key: draftKey, weight: values.weight, reps: "0" })
                        }
                        className="academia-quick-number w-full min-w-0 rounded-[22px] border border-border bg-background/55 px-2 py-3.5 text-center font-mono text-2xl font-bold tabular-nums outline-none focus:border-primary"
                      />
                    </label>
                    <button
                      onClick={confirmSet}
                      disabled={setAction.pending}
                      aria-label={`Registrar série ${setIndex + 1}`}
                      className="interactive-press flex h-[58px] w-[58px] shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-[0_0_0_1px_rgb(145_245_218/0.12)] disabled:opacity-40"
                    >
                      <Check className="h-6 w-6" strokeWidth={3} />
                    </button>
                  </div>
                  {/* Mesma ideia do modal do exercício: dá pra pedir mais uma
                      série desde o começo, sem esperar terminar as planejadas. */}
                  {completion !== "concluido" && (
                    <button
                      onClick={addSet}
                      className="academia-add-set interactive-press mt-3 flex w-full items-center justify-center gap-1 rounded-xl py-2 text-xs font-semibold"
                      title="Soma uma série além da meta"
                    >
                      <Plus className="h-3.5 w-3.5" /> Adicionar série
                    </button>
                  )}
                </>
              )
            )}

            {current && (
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  onClick={dropOpen ? () => setDropOpen(false) : openDrop}
                  disabled={doneSets.length === 0 && !dropOpen}
                  title={doneSets.length === 0 ? "Registre uma série antes do drop" : undefined}
                  className="interactive-press flex min-h-10 items-center justify-center gap-1 rounded-xl border border-border text-xs font-semibold text-muted-foreground hover:border-warning/60 hover:text-warning disabled:opacity-40"
                >
                  <ArrowDownToLine className="h-3.5 w-3.5" /> {dropOpen ? "Cancelar drop" : "Drop"}
                </button>
                <button
                  onClick={skipCurrent}
                  disabled={setAction.pending || doneSets.length > 0}
                  title={doneSets.length > 0 ? "Já tem séries registradas" : "Pular este exercício"}
                  className="interactive-press flex min-h-10 items-center justify-center gap-1 rounded-xl border border-border text-xs font-semibold text-muted-foreground disabled:opacity-40"
                >
                  <SkipForward className="h-3.5 w-3.5" /> Pular exercício
                </button>
              </div>
            )}

            {dropOpen && current && (
              <div className="mt-2 flex items-end justify-center gap-2.5 rounded-2xl border border-warning/40 bg-warning/5 p-3">
                <label className="flex-1">
                  <span className="mb-1 block text-center text-[11px] font-semibold text-warning">
                    Drop · peso (kg)
                  </span>
                  <NumberField
                    value={parseFloat(dropDraft.weight) || 0}
                    onValue={(v) => setDropDraft((d) => ({ ...d, weight: String(v) }))}
                    onEmpty={() => setDropDraft((d) => ({ ...d, weight: "0" }))}
                    className="w-full min-w-0 rounded-xl border border-border bg-background/55 px-2 py-2.5 text-center font-mono text-lg font-bold tabular-nums outline-none focus:border-warning"
                  />
                </label>
                <label className="flex-1">
                  <span className="mb-1 block text-center text-[11px] text-muted-foreground">
                    Repetições
                  </span>
                  <NumberField
                    integer
                    value={parseInt(dropDraft.reps, 10) || 0}
                    onValue={(v) => setDropDraft((d) => ({ ...d, reps: String(v) }))}
                    onEmpty={() => setDropDraft((d) => ({ ...d, reps: "0" }))}
                    className="w-full min-w-0 rounded-xl border border-border bg-background/55 px-2 py-2.5 text-center font-mono text-lg font-bold tabular-nums outline-none focus:border-warning"
                  />
                </label>
                <button
                  onClick={confirmDrop}
                  disabled={setAction.pending}
                  aria-label="Registrar drop"
                  className="interactive-press flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-warning text-background disabled:opacity-40"
                >
                  <Check className="h-5 w-5" strokeWidth={3} />
                </button>
              </div>
            )}

            {setAction.error && (
              <InlineError
                message={setAction.error}
                onRetry={setAction.clearError}
                className="mt-2"
              />
            )}

            <TimerBlock
              session={session}
              face={gym.timerFace}
              onChangeFace={gym.setTimerFace}
              exerciseId={current?.exerciseId}
              configuredRest={target.restSeconds}
              onExpand={() => gym.setFullscreen(true)}
            />

            {pending.length === 0 && (
              <p className="mt-2 rounded-xl border border-success/40 bg-success/10 px-3 py-2 text-center text-xs font-semibold text-success">
                Treino pronto para finalizar
              </p>
            )}
          </>
        )}
      </div>

      {!confirmFinish && (
        <footer className="flex items-center gap-3 border-t border-border px-5 py-4">
          <button
            onClick={() => {
              onClose();
              void navigate({ to: "/sub-agenda/$categoria", params: { categoria: "academia" } });
            }}
            className="interactive-press min-h-12 flex-1 rounded-2xl border border-transparent px-2 py-2 text-xs font-semibold text-muted-foreground hover:border-border hover:text-foreground"
          >
            Abrir treino
          </button>
          <button
            onClick={() => setConfirmFinish(true)}
            className="interactive-press min-h-12 flex-1 rounded-2xl border border-border px-2 py-2 text-xs font-semibold text-foreground hover:border-primary/40"
          >
            Finalizar treino
          </button>
        </footer>
      )}
    </section>
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
