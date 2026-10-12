import { useEffect, useMemo, useState } from "react";
import { useGoalsStore, todayISO, nowHM } from "@/lib/goals-store";
import { useAgendaSeries, materializeUpcoming } from "@/lib/agenda-series-store";
import { useAgendaLabels } from "@/lib/agenda-labels-store";
import { useAgendaAlerts } from "@/lib/agenda-alerts";
import { useProfile } from "@/lib/profile-store";
import { buildOccurrences, type AgendaOccurrence, type Clock } from "@/lib/agenda-occurrences";
import { nowDate } from "@/lib/test-clock";

/** Relógio da Agenda: muda a cada minuto, o que basta para que "planejada"
 * vire "perdida" no momento certo sem redesenhar a cada segundo. */
export function useAgendaClock(): Clock {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, []);
  return { date: todayISO(), hm: nowHM() };
}

/** Ocorrências do período + tudo o que a tela precisa para desenhá-las. */
export function useAgendaData(range: { from: string; to: string }) {
  const executions = useGoalsStore((s) => s.executions);
  const goals = useGoalsStore((s) => s.goals);
  const steps = useGoalsStore((s) => s.steps);
  const { series, exceptions } = useAgendaSeries();
  const labels = useAgendaLabels();
  const alerts = useAgendaAlerts();
  const profile = useProfile();
  const clock = useAgendaClock();

  const occurrences = useMemo<AgendaOccurrence[]>(
    () =>
      buildOccurrences({
        executions,
        series,
        exceptions,
        from: range.from,
        to: range.to,
        now: clock,
      }),
    // `clock.hm` entra de propósito: muda o estado planejada → perdida.
    [executions, series, exceptions, range.from, range.to, clock.date, clock.hm], // eslint-disable-line react-hooks/exhaustive-deps
  );

  return {
    occurrences,
    executions,
    goals,
    steps,
    series,
    exceptions,
    labels,
    alerts,
    settings: profile.agendaSettings,
    profile,
    clock,
    nowMinute: nowDate().getHours() * 60 + nowDate().getMinutes(),
  };
}

/** Transforma em compromissos reais as ocorrências de hoje/amanhã das séries,
 * uma vez por montagem e quando o dia vira. */
export function useSeriesMaterialization() {
  const { date } = useAgendaClock();
  useEffect(() => {
    void materializeUpcoming().catch(() => {
      /* Tenta de novo na próxima abertura; a regra continua mostrando a ocorrência. */
    });
  }, [date]);
}
