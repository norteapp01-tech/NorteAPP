import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import type { Period } from "@/lib/mirror-analytics";
import { mirrorHabits } from "@/lib/habits/mirror";
import { useHabitLogs, useHabitsCore } from "@/lib/habits/store";
import { useProfile } from "@/lib/profile-store";
import { todayISO } from "@/lib/goals-store";
import { plural } from "@/lib/format-utils";
import { BarRow, Disclosure } from "./charts";

const pct = (v: number | null) => (v === null ? "—" : `${Math.round(v * 100)}%`);

/** O que o conjunto de rotinas (hábitos) mostra no período do Espelho. */
export function HabitsMirror({ period, scope }: { period: Period; scope: string }) {
  const core = useHabitsCore();
  const profile = useProfile();
  const logs = useHabitLogs(period.from, period.to);
  const today = todayISO();
  const weekStart: 0 | 1 = profile.weekStart === "sunday" ? 0 : 1;
  const mirror = useMemo(
    () =>
      mirrorHabits(
        { today, weekStart, pauses: core.pauses },
        core.habits,
        logs.logs,
        period.from,
        period.to,
      ),
    [core.habits, core.pauses, logs.logs, period.from, period.to, today, weekStart],
  );

  if (core.loading || logs.loading)
    return (
      <div
        className="card-surface h-28 animate-pulse"
        role="status"
        aria-label="Carregando rotinas"
      />
    );
  if (core.error || logs.error)
    return (
      <section className="card-surface p-4 text-sm" role="alert">
        Não consegui carregar as rotinas.{" "}
        <button
          className="font-semibold text-primary"
          onClick={() => {
            core.retry();
            logs.retry();
          }}
        >
          Tentar de novo
        </button>
      </section>
    );
  if (core.habits.length === 0)
    return (
      <section className="card-surface p-4">
        <h2 className="norte-section-title">Suas rotinas</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Quando você criar rotinas, o Espelho mostra aqui como elas andam.
        </p>
        <Link
          to="/rotinas"
          className="norte-hit mt-3 inline-block text-sm font-semibold text-primary"
        >
          Criar uma rotina →
        </Link>
      </section>
    );

  return (
    <section aria-label="Suas rotinas">
      <div className="flex items-end justify-between">
        <h2 className="norte-section-title">Suas rotinas</h2>
        <Link to="/rotinas" className="norte-hit text-xs text-muted-foreground">
          Abrir <ChevronRight className="inline h-3.5 w-3.5" />
        </Link>
      </div>
      <div className="card-surface mt-3 p-4">
        {!mirror.sufficient ? (
          <p className="text-sm text-muted-foreground">
            Ainda há poucos dias avaliados {scope} para falar em padrão ({mirror.judged} de 4
            necessários). Os registros já estão guardados.
          </p>
        ) : (
          <>
            <p className="text-3xl font-bold tabular-nums">{pct(mirror.consistency)}</p>
            <p className="text-sm text-muted-foreground">
              {mirror.completed} de {mirror.judged}{" "}
              {plural(mirror.judged, "dia avaliado cumprido", "dias avaliados cumpridos")} {scope}
            </p>
            <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
              {mirror.noRecordDays} sem registro (não contam como falha de caráter, só como ausência
              de informação) · {mirror.pausedDays}{" "}
              {plural(mirror.pausedDays, "dia em pausa", "dias em pausa")} fora da conta.
            </p>
          </>
        )}
      </div>

      {mirror.sufficient && (
        <div className="card-surface mt-3 divide-y divide-border px-4">
          <Disclosure
            title="Por área"
            subtitle={`${mirror.byArea.length} ${plural(mirror.byArea.length, "área", "áreas")}`}
            defaultOpen
          >
            {mirror.byArea.map((a) => (
              <BarRow
                key={a.area}
                name={a.area}
                value={pct(a.consistency)}
                fraction={a.consistency ?? 0}
                detail={`${a.completed} de ${a.judged} dias avaliados · ${a.habits} ${plural(a.habits, "rotina", "rotinas")}`}
              />
            ))}
          </Disclosure>
          {mirror.steady.length > 0 && (
            <Disclosure title="Mais regulares" subtitle="Rotinas com 4+ dias avaliados">
              {mirror.steady.map((r) => (
                <BarRow
                  key={r.habit.id}
                  name={r.habit.name}
                  value={pct(r.summary.consistency)}
                  fraction={r.summary.consistency ?? 0}
                  detail={`${r.completed} de ${r.judged} dias avaliados`}
                />
              ))}
            </Disclosure>
          )}
          {mirror.needsAttention.length > 0 && (
            <Disclosure
              title="Para ajustar"
              subtitle="Abaixo de 50% — talvez a meta ou o horário peçam revisão"
            >
              {mirror.needsAttention.map((r) => (
                <div key={r.habit.id} className="py-2">
                  <BarRow
                    name={r.habit.name}
                    value={pct(r.summary.consistency)}
                    fraction={r.summary.consistency ?? 0}
                    detail={`${r.completed} de ${r.judged} dias avaliados · ${r.none} sem registro`}
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Ideias: reduzir a meta, mudar o horário ou pausar. É uma sugestão, não um
                    veredito.
                  </p>
                </div>
              ))}
            </Disclosure>
          )}
          {mirror.feelings.answered > 0 && (
            <Disclosure
              title="Como foi, segundo você"
              subtitle={`${mirror.feelings.answered} ${plural(mirror.feelings.answered, "resposta", "respostas")}`}
            >
              <p className="text-sm">
                {mirror.feelings.leve} leve · {mirror.feelings.neutro} neutro ·{" "}
                {mirror.feelings.pesado} pesado
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Só entra o que você respondeu.
              </p>
            </Disclosure>
          )}
        </div>
      )}
    </section>
  );
}
