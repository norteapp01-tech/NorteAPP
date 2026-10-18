import { toISODate } from "./goals-store";
import { inPeriod, type Period } from "./mirror-analytics";

// ---------------------------------------------------------------------------
// O que foi registrado direto nos módulos (treinos, atividades, leitura).
//
// Treino, corrida e leitura têm tabelas próprias: não passam pela Agenda. Sem
// isto, o Espelho dizia "sem rotinas" para quem treinou e correu a semana
// inteira. Só contagem e totais REAIS — nada estimado.
// ---------------------------------------------------------------------------

export type ModuleActivity = {
  workouts: { count: number; days: number };
  sport: { count: number; distanceM: number; activeSeconds: number };
  reading: { sessions: number; seconds: number; pages: number };
};

export type ModuleInput = {
  workouts: { date: string; status: string }[];
  activities: { startedAt: string; distanceM: number; activeDurationS: number }[];
  readingSessions: {
    startedAt: string;
    status: string;
    durationSeconds?: number;
    pagesRead?: number;
  }[];
  /** Data local de um instante (padrão: a data do aparelho). */
  localDate?: (iso: string) => string;
};

export function moduleActivity(input: ModuleInput, period: Period): ModuleActivity {
  const localDate = input.localDate ?? ((iso: string) => toISODate(new Date(iso)));
  // Só treino concluído conta: sessão em andamento não é treino realizado.
  const workouts = input.workouts.filter(
    (w) => w.status === "concluido" && inPeriod(w.date, period),
  );
  const activities = input.activities.filter((a) => inPeriod(localDate(a.startedAt), period));
  const sessions = input.readingSessions.filter(
    (s) => s.status === "completed" && inPeriod(localDate(s.startedAt), period),
  );
  return {
    workouts: { count: workouts.length, days: new Set(workouts.map((w) => w.date)).size },
    sport: {
      count: activities.length,
      distanceM: activities.reduce((sum, a) => sum + a.distanceM, 0),
      activeSeconds: activities.reduce((sum, a) => sum + a.activeDurationS, 0),
    },
    reading: {
      sessions: sessions.length,
      seconds: sessions.reduce((sum, s) => sum + (s.durationSeconds ?? 0), 0),
      pages: sessions.reduce((sum, s) => sum + (s.pagesRead ?? 0), 0),
    },
  };
}

export function hasModuleActivity(a: ModuleActivity): boolean {
  return a.workouts.count > 0 || a.sport.count > 0 || a.reading.sessions > 0;
}
