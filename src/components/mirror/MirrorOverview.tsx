import { ProgressRing } from "@/components/ui/progress-ring";
import { categoryMeta } from "@/lib/mock-data";
import type { AgendaAnalysis, Comparison } from "@/lib/mirror-analytics";
import { nextWeekAction, type Insight } from "@/lib/mirror-insights";
import { ActionButton, InsightCard } from "./InsightCard";
import { FeelingCheckin } from "./FeelingCheckin";
import { NEUTRALS, ShareBar, pct } from "./charts";
import type { AgendaOccurrence } from "@/lib/agenda-occurrences";

export const groupName = (key: string, name: string) =>
  categoryMeta[key]?.label ?? (key === "generico" ? "Geral" : name);

export function MirrorOverview({
  current,
  comparison,
  insights,
  recentUnanswered,
  historyMissing,
  scope,
  onSeeAgenda,
}: {
  current: AgendaAnalysis;
  comparison: Comparison;
  insights: Insight[];
  recentUnanswered: AgendaOccurrence[];
  historyMissing: boolean;
  scope: string;
  onSeeAgenda: () => void;
}) {
  const a = current;
  const decided = a.done + a.missed;
  const main = insights.find((i) => i.id !== "poucos-dados");
  const next = nextWeekAction(insights);
  const labelled = a.byLabel.filter((g) => g.key !== "__none");
  const groups = (labelled.length ? labelled : a.byCategory).filter((g) => g.minutes > 0);
  const parts = groups.slice(0, 5).map((g, i) => ({
    key: g.key,
    share: g.share,
    name: groupName(g.key, g.name),
    color: g.color ?? NEUTRALS[i % NEUTRALS.length],
  }));
  const rest = groups.slice(5).reduce((s, g) => s + g.share, 0);
  if (rest > 0.005) parts.push({ key: "rest", share: rest, name: "Outros", color: "#4a5560" });

  return (
    <div className="space-y-4">
      <section className="card-surface-featured p-5" aria-label="Resumo da agenda">
        <p className="text-[11px] font-semibold uppercase tracking-[.16em] text-muted-foreground">
          Como você está vivendo sua agenda
        </p>
        {a.sufficiency === "none" ? (
          <p className="mt-4 text-sm text-muted-foreground">Sem dados {scope}.</p>
        ) : (
          <>
            <div className="mt-4 flex items-center gap-5">
              <ProgressRing
                value={a.rate === null ? null : Math.round(a.rate * 100)}
                label={`Taxa de realização ${scope}`}
                size={96}
              >
                <strong>{a.rate === null ? "—" : pct(a.rate)}</strong>
              </ProgressRing>
              <div className="min-w-0">
                <p className="text-lg font-bold leading-snug">
                  {decided > 0
                    ? `${a.done} de ${decided} compromissos realizados`
                    : "Nada para medir ainda"}
                </p>
                {comparison.rateDelta !== null && (
                  <p
                    className={`mt-1.5 text-sm font-semibold ${comparison.rateDelta < 0 ? "text-warning" : "text-primary"}`}
                  >
                    {comparison.rateDelta > 0 ? "+" : ""}
                    {comparison.rateDelta}{" "}
                    {Math.abs(comparison.rateDelta) === 1 ? "ponto" : "pontos"} vs. período anterior
                  </p>
                )}
                {a.sufficiency === "low" && (
                  <p className="mt-1.5 text-xs text-muted-foreground">Poucos dados</p>
                )}
              </div>
            </div>
            <dl className="mt-5 grid grid-cols-3 gap-3 border-t border-border pt-4 text-center">
              <Stat label="Não realizados" value={a.missed} />
              <Stat label="Cancelados" value={a.cancelled} />
              <Stat label="Reagendamentos" value={historyMissing ? "—" : a.reschedules} />
            </dl>
          </>
        )}
      </section>

      {historyMissing && (
        <p
          role="status"
          className="rounded-xl border border-border px-4 py-3 text-xs text-muted-foreground"
        >
          Não consegui carregar o histórico de mudanças de horário. O restante está correto; os
          reagendamentos ficam de fora por enquanto.
        </p>
      )}

      {main ? (
        <InsightCard insight={main} featured />
      ) : a.sufficiency === "low" ? (
        <section className="card-surface p-5">
          <p className="text-sm text-muted-foreground">{insights[0]?.text}</p>
        </section>
      ) : null}

      {next && next.insight.id !== main?.id && (
        <section className="card-surface p-5">
          <p className="text-[11px] font-semibold uppercase tracking-[.16em] text-muted-foreground">
            Para a próxima semana
          </p>
          <p className="mt-2 text-sm">{next.insight.text}</p>
          <ActionButton action={next.action} className="mt-3" />
        </section>
      )}

      {parts.length > 0 && (
        <section className="card-surface p-5">
          <div className="flex items-end justify-between gap-3">
            <h2 className="norte-section-title">Equilíbrio do tempo</h2>
            <button type="button" onClick={onSeeAgenda} className="text-xs text-primary">
              Ver detalhes
            </button>
          </div>
          <div className="mt-4">
            <ShareBar parts={parts} label="Distribuição do tempo planejado" />
          </div>
          <ul className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2">
            {parts.map((p) => (
              <li key={p.key} className="flex items-center gap-2 text-xs">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: p.color }} />
                <span className="min-w-0 flex-1 truncate">{p.name}</span>
                <b className="tabular-nums">{pct(p.share)}</b>
              </li>
            ))}
          </ul>
        </section>
      )}

      {(a.split.commitments.done + a.split.commitments.missed > 0 ||
        a.split.routines.done + a.split.routines.missed > 0) && (
        <section className="card-surface grid grid-cols-2 divide-x divide-border">
          <Split title="Compromissos" s={a.split.commitments} />
          <Split title="Rotinas" s={a.split.routines} />
        </section>
      )}

      {recentUnanswered.length > 0 && (
        <section className="card-surface p-5">
          <h2 className="norte-section-title">Como foram?</h2>
          <ul className="mt-3 divide-y divide-border">
            {recentUnanswered.map((o) => (
              <li key={o.key} className="py-3">
                <p className="truncate text-sm font-medium">{o.title}</p>
                <div className="mt-2">
                  <FeelingCheckin executionId={o.executionId!} compact />
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div>
      <dd className="text-xl font-bold tabular-nums">{value}</dd>
      <dt className="mt-0.5 text-[11px] text-muted-foreground">{label}</dt>
    </div>
  );
}

function Split({ title, s }: { title: string; s: { done: number; missed: number } }) {
  const n = s.done + s.missed;
  return (
    <div className="p-4">
      <p className="text-xs text-muted-foreground">{title}</p>
      <p className="mt-1 text-xl font-bold tabular-nums">{n ? pct(s.done / n) : "—"}</p>
      <p className="text-[11px] text-muted-foreground">
        {n ? `${s.done} de ${n} realizados` : "sem registros"}
      </p>
    </div>
  );
}
