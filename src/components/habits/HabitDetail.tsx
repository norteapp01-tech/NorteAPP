import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Archive, ArchiveRestore, Copy, Pause, Pencil, Plus, Timer, Trash2 } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { NumberField } from "@/components/ui/number-field";
import { InlineError } from "@/components/ui/inline-error";
import { todayISO } from "@/lib/goals-store";
import { addDaysISO } from "@/lib/agenda-intervals";
import {
  endState,
  feelingCounts,
  heatmap,
  motivesOfSkips,
  series,
  streaks,
  summarize,
  versionAt,
  type EvalContext,
  type Outcome,
} from "@/lib/habits/engine";
import {
  LOGS_KEY,
  addChain,
  archiveHabit,
  deleteHabit,
  duplicateHabit,
  editLog,
  fetchAllLogs,
  removeChain,
  undoLog,
} from "@/lib/habits/store";
import { useSupabaseUserId } from "@/lib/supabase/client";
import { formatAmount } from "@/lib/habits/units";
import { formatClock } from "@/lib/habits/timer";
import type { Chain, GoalPeriod, Habit, HabitLog } from "@/lib/habits/types";
import {
  OUTCOME_LABEL,
  WEEKDAY_ABBR,
  goalText,
  periodBounds,
  scheduleText,
} from "@/lib/habits/format";
import { OutcomeMark } from "./HabitRow";
import { MiniColumns } from "@/components/mirror/charts";

type Range = "30d" | "90d" | "1y";
const RANGE_LABEL: Record<Range, string> = { "30d": "30 dias", "90d": "3 meses", "1y": "1 ano" };

const SOURCE_LABEL: Record<HabitLog["source"], string> = {
  manual: "Manual",
  timer: "Timer",
  module: "Módulo",
  import: "Importado",
  agent: "Norte",
};

const fmtDate = (iso: string) => iso.split("-").reverse().join("/");

export function HabitDetail({
  habit,
  habits,
  chains,
  ctx,
  onClose,
  onEdit,
  onQuick,
  onTimer,
  onPause,
}: {
  habit: Habit;
  habits: Habit[];
  chains: Chain[];
  ctx: EvalContext;
  onClose: () => void;
  onEdit: () => void;
  onQuick: () => void;
  onTimer: () => void;
  onPause: () => void;
}) {
  const userId = useSupabaseUserId();
  const [range, setRange] = useState<Range>("30d");
  const [shown, setShown] = useState(20);
  const [editing, setEditing] = useState<HabitLog | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const q = useQuery({
    queryKey: [...LOGS_KEY, "full", habit.id],
    queryFn: () => fetchAllLogs(habit.id),
    enabled: !!userId,
  });
  const logs = q.data ?? [];
  const today = ctx.today;
  const version = versionAt(habit, today) ?? habit.versions[habit.versions.length - 1];
  const { from, to } = periodBounds(range, today);
  const start = from < habit.startDate ? habit.startDate : from;

  const data = useMemo(() => {
    const days = Math.max(1, Math.round((Date.parse(to) - Date.parse(start)) / 86_400_000) + 1);
    const prevTo = addDaysISO(start, -1);
    const prevFrom = addDaysISO(prevTo, -(days - 1));
    const now = summarize(ctx, habit, logs, start, to);
    const before =
      prevTo >= habit.startDate
        ? summarize(
            ctx,
            habit,
            logs,
            prevFrom < habit.startDate ? habit.startDate : prevFrom,
            prevTo,
          )
        : null;
    const gran: GoalPeriod = range === "30d" ? "day" : range === "90d" ? "week" : "month";
    return {
      now,
      before,
      cells: heatmap(ctx, habit, logs, start, to),
      bars: series(ctx, habit, logs, gran, start, to),
      gran,
      streak: streaks(ctx, habit, logs),
      end: endState(ctx, habit, logs),
      skips: motivesOfSkips(logs.filter((l) => l.localDate >= start && l.localDate <= to)),
      feelings: feelingCounts(logs.filter((l) => l.localDate >= start && l.localDate <= to)),
    };
  }, [ctx, habit, logs, start, to, range]);

  const unit = habit.measure === "duration" ? "min" : habit.unit;
  const history = useMemo(
    () =>
      [...logs].sort((a, b) =>
        a.localDate === b.localDate
          ? a.occurredAt < b.occurredAt
            ? 1
            : -1
          : a.localDate < b.localDate
            ? 1
            : -1,
      ),
    [logs],
  );
  const t = data.now.totals;
  const count = (o: Outcome) => t[o] ?? 0;
  // Só compara quando o período anterior tem base (3+ dias avaliados); senão é ruído.
  const judged = (s: typeof data.now | null) =>
    s
      ? (s.totals.completed ?? 0) +
        (s.totals.partial ?? 0) +
        (s.totals.missed ?? 0) +
        (s.totals.none ?? 0) +
        (s.totals.exceeded ?? 0) +
        (s.totals.unconfirmed ?? 0)
      : 0;
  const deltaPts =
    data.before &&
    judged(data.before) >= 3 &&
    data.before.consistency !== null &&
    data.now.consistency !== null
      ? Math.round((data.now.consistency - data.before.consistency) * 100)
      : null;
  const pct = (v: number | null) => (v === null ? "—" : `${Math.round(v * 100)}%`);

  const guard = async (fn: () => Promise<unknown>) => {
    setActionError(null);
    try {
      await fn();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Não foi possível concluir.");
    }
  };

  const myChains = chains.filter((c) => c.baseHabitId === habit.id);

  return (
    <Modal onClose={onClose} title={habit.name} panelClassName="habit-detail">
      <div className="space-y-6">
        <section aria-label="Resumo" className="space-y-1">
          <p className="text-sm text-muted-foreground">
            {goalText(habit, version)} · {scheduleText(version)}
            {habit.area ? ` · ${habit.area}` : ""}
          </p>
          {habit.archivedAt && (
            <p className="text-xs font-semibold text-muted-foreground">
              Arquivada — o histórico continua aqui.
            </p>
          )}
          <div className="flex flex-wrap gap-2 pt-2">
            {!habit.archivedAt && (
              <button onClick={onQuick} className="habit-pill habit-pill-primary interactive-press">
                <Plus className="h-4 w-4" /> Registrar
              </button>
            )}
            {!habit.archivedAt && habit.measure === "duration" && (
              <button onClick={onTimer} className="habit-pill interactive-press">
                <Timer className="h-4 w-4" /> Timer
              </button>
            )}
            <button onClick={onEdit} className="habit-pill interactive-press">
              <Pencil className="h-4 w-4" /> Editar
            </button>
            {!habit.archivedAt && (
              <button onClick={onPause} className="habit-pill interactive-press">
                <Pause className="h-4 w-4" /> Pausar
              </button>
            )}
          </div>
        </section>

        <div role="tablist" aria-label="Período" className="flex gap-2">
          {(Object.keys(RANGE_LABEL) as Range[]).map((r) => (
            <button
              key={r}
              role="tab"
              aria-selected={range === r}
              onClick={() => setRange(r)}
              className={`interactive-press min-h-10 rounded-full border px-4 text-xs font-semibold ${
                range === r
                  ? "border-primary/60 bg-primary/15 text-primary"
                  : "border-border text-muted-foreground"
              }`}
            >
              {RANGE_LABEL[r]}
            </button>
          ))}
        </div>

        {q.isLoading ? (
          <div
            className="card-surface h-32 animate-pulse"
            role="status"
            aria-label="Carregando histórico"
          />
        ) : q.isError ? (
          <div role="alert" className="card-surface p-4 text-sm">
            Não consegui carregar o histórico.{" "}
            <button onClick={() => void q.refetch()} className="font-semibold text-primary">
              Tentar de novo
            </button>
          </div>
        ) : (
          <>
            <section className="card-surface p-4" aria-label="Meta e realizado">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                Meta × realizado · {RANGE_LABEL[range]}
              </p>
              {data.now.consistency === null ? (
                <p className="mt-2 text-sm text-muted-foreground">
                  {count("paused") > 0 && data.now.sessions === 0
                    ? "Período em pausa — nada a avaliar."
                    : "Ainda sem dados suficientes neste período."}
                </p>
              ) : (
                <>
                  <p className="mt-1 text-3xl font-bold tabular-nums">
                    {pct(data.now.consistency)}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {count("completed")}{" "}
                    {count("completed") === 1 ? "dia cumprido" : "dias cumpridos"} de{" "}
                    {count("completed") +
                      count("partial") +
                      count("missed") +
                      count("none") +
                      count("exceeded") +
                      count("unconfirmed")}{" "}
                    avaliados
                    {deltaPts !== null && (
                      <>
                        {" · "}
                        <span className={deltaPts < 0 ? "text-warning" : "text-primary"}>
                          {deltaPts > 0 ? "+" : ""}
                          {deltaPts} {Math.abs(deltaPts) === 1 ? "ponto" : "pontos"} vs. período
                          anterior
                        </span>
                      </>
                    )}
                  </p>
                </>
              )}
              <dl className="mt-4 grid grid-cols-3 gap-3 border-t border-border pt-3 text-center">
                <Stat
                  label="Total"
                  value={
                    habit.measure === "binary"
                      ? String(data.now.activeDays)
                      : formatAmount(data.now.value, unit)
                  }
                />
                <Stat
                  label="Média/dia ativo"
                  value={
                    data.now.average === null
                      ? "—"
                      : habit.measure === "binary"
                        ? "—"
                        : formatAmount(data.now.average, unit)
                  }
                />
                <Stat label="Registros" value={String(data.now.sessions)} />
              </dl>
              {data.now.durationSeconds > 0 && (
                <p className="mt-3 text-xs text-muted-foreground">
                  Tempo medido (timer e registros com duração):{" "}
                  {formatClock(data.now.durationSeconds)}. Só entra o que foi medido de verdade.
                </p>
              )}
              <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
                {count("skipped")} puladas · {count("missed")} não realizadas · {count("paused")} em
                pausa · {count("none") + count("unconfirmed")} sem registro. Pausas e dias pulados
                ficam fora da conta; dia sem registro não vira falha.
              </p>
            </section>

            <section aria-label="Calendário">
              <h3 className="norte-section-title">Dias</h3>
              <Heat cells={data.cells} />
              <p className="mt-2 text-[11px] text-muted-foreground">
                {data.cells.length} dias · {count("completed")} cumpridos · {count("partial")}{" "}
                parciais · {count("none")} sem registro.
              </p>
            </section>

            <section aria-label="Gráfico">
              <h3 className="norte-section-title">
                Total por {data.gran === "day" ? "dia" : data.gran === "week" ? "semana" : "mês"}
              </h3>
              <div className="mt-3">
                <MiniColumns
                  label={`Total por ${data.gran === "day" ? "dia" : data.gran === "week" ? "semana" : "mês"}`}
                  items={(() => {
                    const maxV = Math.max(
                      1,
                      ...data.bars.map((b) => b.value),
                      ...data.bars.map((b) => b.goal),
                    );
                    return data.bars.slice(-14).map((b) => ({
                      key: b.start,
                      label: data.gran === "month" ? b.start.slice(5, 7) : b.start.slice(8, 10),
                      value: b.value > 0 ? b.value / maxV : b.start <= today ? 0 : null,
                    }));
                  })()}
                />
              </div>
              <details className="mt-2">
                <summary className="cursor-pointer text-xs text-muted-foreground">
                  Ver os números
                </summary>
                <ul className="mt-2 space-y-1 text-xs">
                  {data.bars
                    .slice(-14)
                    .reverse()
                    .map((b) => (
                      <li
                        key={b.start}
                        className="flex justify-between border-b border-border/60 py-1"
                      >
                        <span>
                          {data.gran === "day"
                            ? fmtDate(b.start)
                            : `${fmtDate(b.start)} – ${fmtDate(b.end)}`}
                        </span>
                        <b className="tabular-nums">{formatAmount(b.value, unit)}</b>
                      </li>
                    ))}
                </ul>
              </details>
            </section>

            {(data.streak.best > 0 || data.end) && (
              <section
                className="card-surface divide-y divide-border px-4"
                aria-label="Sequência e encerramento"
              >
                {data.streak.best > 0 && (
                  <div className="py-3">
                    <p className="text-sm">
                      Sequência atual <b>{data.streak.current}</b> · melhor{" "}
                      <b>{data.streak.best}</b>
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      Só informação: pular ou pausar não quebra, e interromper nunca apaga o
                      histórico.
                    </p>
                  </div>
                )}
                {data.end && (
                  <div className="py-3">
                    <p className="text-sm">
                      Encerramento: {data.end.detail}
                      {data.end.ended ? " — alcançado." : ""}
                    </p>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2">
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{ width: `${Math.round(data.end.progress * 100)}%` }}
                      />
                    </div>
                    {data.end.ended && !habit.archivedAt && (
                      <div className="mt-2 flex gap-2">
                        <button
                          onClick={() => void guard(() => archiveHabit(habit.id))}
                          className="habit-pill interactive-press"
                        >
                          Arquivar
                        </button>
                        <button onClick={onEdit} className="habit-pill interactive-press">
                          Continuar e ajustar
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </section>
            )}

            {(data.skips.length > 0 || data.feelings.answered > 0) && (
              <section className="card-surface space-y-3 p-4" aria-label="Contexto">
                {data.skips.length > 0 && (
                  <div>
                    <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                      Motivos informados ao pular
                    </p>
                    <p className="mt-1 text-sm">
                      {data.skips.map((s) => `${s.reason} (${s.count})`).join(" · ")}
                    </p>
                  </div>
                )}
                {data.feelings.answered > 0 && (
                  <div>
                    <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                      Como foi, segundo você
                    </p>
                    <p className="mt-1 text-sm">
                      {data.feelings.leve} leve · {data.feelings.neutro} neutro ·{" "}
                      {data.feelings.pesado} pesado
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      Só entra o que você respondeu.
                    </p>
                  </div>
                )}
              </section>
            )}
          </>
        )}

        <section aria-label="Encadeamento">
          <h3 className="norte-section-title">Depois desta rotina</h3>
          <ChainEditor habit={habit} habits={habits} chains={myChains} onError={setActionError} />
        </section>

        <section aria-label="Histórico">
          <h3 className="norte-section-title">Histórico</h3>
          {history.length === 0 ? (
            <p className="py-3 text-sm text-muted-foreground">Nenhum registro ainda.</p>
          ) : (
            <ul className="mt-2 divide-y divide-border rounded-xl border border-border">
              {history.slice(0, shown).map((l) => (
                <li key={l.id} className="flex items-start gap-3 px-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm">
                      <b className="tabular-nums">{fmtDate(l.localDate)}</b>{" "}
                      {l.status === "recorded"
                        ? formatAmount(l.value, unit)
                        : l.status === "skipped"
                          ? "Pulada"
                          : l.status === "missed"
                            ? "Não realizada"
                            : "Dia fechado"}
                      {l.reason ? ` · ${l.reason}` : ""}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {SOURCE_LABEL[l.source]}
                      {l.durationSeconds ? ` · ${formatClock(l.durationSeconds)}` : ""}
                      {l.feeling ? ` · ${l.feeling}` : ""}
                      {l.note ? ` · ${l.note}` : ""}
                    </p>
                  </div>
                  {l.status === "recorded" && (
                    <button
                      onClick={() => setEditing(l)}
                      aria-label={`Editar registro de ${fmtDate(l.localDate)}`}
                      className="habit-icon-btn interactive-press"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                  )}
                  <button
                    onClick={() => void guard(() => undoLog(l.id))}
                    aria-label={`Apagar registro de ${fmtDate(l.localDate)}`}
                    className="habit-icon-btn interactive-press"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {history.length > shown && (
            <button
              onClick={() => setShown((n) => n + 20)}
              className="interactive-press mt-2 min-h-11 w-full rounded-xl border border-border text-sm font-semibold"
            >
              Mostrar mais ({history.length - shown})
            </button>
          )}
        </section>

        {actionError && <InlineError message={actionError} />}

        <section
          className="flex flex-wrap gap-2 border-t border-border pt-4"
          aria-label="Gerenciar"
        >
          <button
            onClick={() => void guard(() => duplicateHabit(habit))}
            className="habit-pill interactive-press"
          >
            <Copy className="h-4 w-4" /> Duplicar
          </button>
          <button
            onClick={() => void guard(() => archiveHabit(habit.id, !habit.archivedAt))}
            className="habit-pill interactive-press"
          >
            {habit.archivedAt ? (
              <ArchiveRestore className="h-4 w-4" />
            ) : (
              <Archive className="h-4 w-4" />
            )}{" "}
            {habit.archivedAt ? "Restaurar" : "Arquivar"}
          </button>
          {confirmDelete ? (
            <>
              <button
                onClick={() =>
                  void guard(async () => {
                    await deleteHabit(habit.id);
                    onClose();
                  })
                }
                className="habit-pill habit-pill-danger interactive-press"
              >
                Apagar tudo, inclusive o histórico
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                className="habit-pill interactive-press"
              >
                Cancelar
              </button>
            </>
          ) : (
            <button
              onClick={() => setConfirmDelete(true)}
              className="habit-pill habit-pill-danger interactive-press"
            >
              <Trash2 className="h-4 w-4" /> Excluir
            </button>
          )}
        </section>
        <p className="text-[11px] text-muted-foreground">
          Arquivar guarda o histórico e para os lembretes. Excluir apaga tudo e não dá para
          desfazer.
        </p>
      </div>

      {editing && <LogEditor log={editing} unit={unit} onClose={() => setEditing(null)} />}
    </Modal>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dd className="text-lg font-bold tabular-nums">{value}</dd>
      <dt className="text-[11px] text-muted-foreground">{label}</dt>
    </div>
  );
}

function Heat({ cells }: { cells: { date: string; outcome: Outcome; value: number }[] }) {
  // Colunas = semanas começando no primeiro dia mostrado; leitura por linhas de 7.
  const rows: (typeof cells)[] = [];
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
  return (
    <div className="mt-3 space-y-1.5" role="img" aria-label={`Calendário de ${cells.length} dias`}>
      {rows.map((row, i) => (
        <div key={i} className="flex gap-1.5">
          {row.map((c) => (
            <span
              key={c.date}
              title={`${fmtDate(c.date)} — ${OUTCOME_LABEL[c.outcome]}`}
              className="heat-cell"
              data-outcome={c.outcome}
            >
              <OutcomeMark outcome={c.outcome} size={16} />
              <i className="sr-only">
                {fmtDate(c.date)}: {OUTCOME_LABEL[c.outcome]}
              </i>
            </span>
          ))}
        </div>
      ))}
      <div className="flex flex-wrap gap-x-3 gap-y-1 pt-1 text-[10px] text-muted-foreground">
        {(["completed", "partial", "skipped", "missed", "paused", "none"] as Outcome[]).map((o) => (
          <span key={o} className="inline-flex items-center gap-1">
            <OutcomeMark outcome={o} size={11} /> {OUTCOME_LABEL[o]}
          </span>
        ))}
      </div>
    </div>
  );
}

function LogEditor({ log, unit, onClose }: { log: HabitLog; unit?: string; onClose: () => void }) {
  const [value, setValue] = useState<number | null>(log.value);
  const [note, setNote] = useState(log.note);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  return (
    <Modal
      onClose={onClose}
      title={`Registro de ${fmtDate(log.localDate)}`}
      footer={
        <button
          disabled={saving || value === null}
          onClick={async () => {
            if (value === null) return;
            setSaving(true);
            setError(null);
            try {
              await editLog(log.id, { value, note });
              onClose();
            } catch (e) {
              setError(e instanceof Error ? e.message : "Não foi possível salvar.");
              setSaving(false);
            }
          }}
          className="interactive-press min-h-12 w-full rounded-xl bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-40"
        >
          {saving ? "Salvando…" : "Salvar"}
        </button>
      }
    >
      <div className="space-y-4">
        <label className="block text-[11px] uppercase tracking-wider text-muted-foreground">
          Valor{unit ? ` (${unit})` : ""}
          <NumberField
            value={log.value}
            onValue={(v) => setValue(v)}
            onEmpty={() => setValue(null)}
            aria-label="Valor"
            className="mt-1 min-h-12 w-full rounded-xl border border-border bg-surface px-3 text-center text-lg font-semibold normal-case tracking-normal text-foreground"
          />
        </label>
        <label className="block text-[11px] uppercase tracking-wider text-muted-foreground">
          Nota
          <textarea
            value={note}
            maxLength={2000}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            className="mt-1 w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm normal-case tracking-normal text-foreground"
          />
        </label>
        {log.source !== "manual" && (
          <p className="text-[11px] text-muted-foreground">
            Este registro veio de {SOURCE_LABEL[log.source].toLowerCase()}; editar muda só aqui.
          </p>
        )}
        {error && <InlineError message={error} />}
      </div>
    </Modal>
  );
}

function ChainEditor({
  habit,
  habits,
  chains,
  onError,
}: {
  habit: Habit;
  habits: Habit[];
  chains: Chain[];
  onError: (m: string | null) => void;
}) {
  const others = habits.filter((h) => h.id !== habit.id && !h.archivedAt);
  const [target, setTarget] = useState(others[0]?.id ?? "");
  const [trigger, setTrigger] = useState<Chain["trigger"]>("done");
  const [delay, setDelay] = useState(0);
  const [adding, setAdding] = useState(false);
  const TRIGGER: Record<Chain["trigger"], string> = {
    done: "for feita",
    skipped: "for pulada",
    missed: "não for realizada",
  };
  return (
    <div className="mt-2 space-y-2">
      {chains.map((c) => {
        const t = habits.find((h) => h.id === c.targetHabitId);
        return (
          <div
            key={c.id}
            className="flex items-center gap-2 rounded-xl border border-border px-3 py-2.5 text-sm"
          >
            <span className="min-w-0 flex-1">
              Quando {TRIGGER[c.trigger]}, lembrar de <b>{t?.name ?? "—"}</b>
              {c.delayMinutes > 0 ? ` após ${c.delayMinutes} min` : " logo em seguida"}.
            </span>
            <button
              onClick={() => void removeChain(c.id)}
              aria-label="Remover encadeamento"
              className="habit-icon-btn interactive-press"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        );
      })}
      {others.length === 0 ? (
        <p className="text-xs text-muted-foreground">Crie outra rotina para encadear.</p>
      ) : adding ? (
        <div className="space-y-2 rounded-xl border border-border p-3">
          <div role="radiogroup" aria-label="Quando" className="flex flex-wrap gap-2">
            {(Object.keys(TRIGGER) as Chain["trigger"][]).map((k) => (
              <button
                key={k}
                role="radio"
                aria-checked={trigger === k}
                onClick={() => setTrigger(k)}
                className={`interactive-press min-h-10 rounded-full border px-3 text-xs font-semibold ${
                  trigger === k
                    ? "border-primary/60 bg-primary/15 text-primary"
                    : "border-border text-muted-foreground"
                }`}
              >
                Se {TRIGGER[k]}
              </button>
            ))}
          </div>
          <select
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            aria-label="Lembrar de"
            className="min-h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm"
          >
            {others.map((h) => (
              <option key={h.id} value={h.id}>
                {h.name}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-2 text-sm">
            Depois de
            <NumberField
              integer
              value={delay}
              onValue={(v) => setDelay(Math.min(1440, Math.max(0, v)))}
              aria-label="Minutos de espera"
              className="min-h-11 w-20 rounded-xl border border-border bg-surface px-3 text-center"
            />
            min
          </label>
          <div className="flex gap-2">
            <button
              onClick={async () => {
                onError(null);
                try {
                  await addChain({ base: habit.id, target, trigger, delayMinutes: delay });
                  setAdding(false);
                } catch (e) {
                  onError(e instanceof Error ? e.message : "Não foi possível encadear.");
                }
              }}
              className="habit-pill habit-pill-primary interactive-press"
            >
              Salvar
            </button>
            <button onClick={() => setAdding(false)} className="habit-pill interactive-press">
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="interactive-press inline-flex min-h-10 items-center gap-1 text-xs font-semibold text-primary"
        >
          <Plus className="h-3.5 w-3.5" /> Lembrar de outra rotina depois desta
        </button>
      )}
      <p className="text-[11px] text-muted-foreground">
        O lembrete respeita pausas e não se repete se o mesmo registro for feito de novo.
      </p>
    </div>
  );
}

export { WEEKDAY_ABBR };
