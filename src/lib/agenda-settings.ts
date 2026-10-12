// ---------------------------------------------------------------------------
// Configurações da Agenda. Guardadas em `profiles.agenda_settings` (jsonb) e
// sempre lidas por `parseAgendaSettings`, que descarta o que não faz sentido —
// um valor corrompido nunca chega à interface.
//
// O horário habitual do dia serve para posicionar a tela, sugerir horários e
// destacar a janela: NÃO limita onde um compromisso pode existir. A linha do
// tempo continua mostrando as 24 horas.
// ---------------------------------------------------------------------------

export type AgendaView = "dia" | "semana" | "mes" | "proximos";

export type AgendaSettings = {
  /** Duração de um compromisso novo, em minutos. */
  defaultDurationMin: number;
  /** Início e fim do dia habitual, "HH:MM". */
  dayStart: string;
  dayEnd: string;
  showWeekends: boolean;
  /** Minutos antes do início; null = sem alerta por padrão. */
  defaultAlertMin: number | null;
  defaultView: AgendaView;
  defaultLabelId: string | null;
};

export const DEFAULT_AGENDA_SETTINGS: AgendaSettings = {
  defaultDurationMin: 60,
  dayStart: "07:00",
  dayEnd: "22:00",
  showWeekends: true,
  defaultAlertMin: null,
  defaultView: "dia",
  defaultLabelId: null,
};

export const DURATION_OPTIONS = [15, 30, 45, 60, 90, 120];
export const ALERT_OPTIONS: { minutes: number; label: string }[] = [
  { minutes: 0, label: "No horário" },
  { minutes: 10, label: "10 minutos antes" },
  { minutes: 30, label: "30 minutos antes" },
  { minutes: 60, label: "1 hora antes" },
  { minutes: 1440, label: "1 dia antes" },
];

const HM = /^([01]\d|2[0-3]):[0-5]\d$/;
const VIEWS: AgendaView[] = ["dia", "semana", "mes", "proximos"];

export function parseAgendaSettings(raw: unknown): AgendaSettings {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_AGENDA_SETTINGS;
  const duration = Number(r.defaultDurationMin);
  const alert = r.defaultAlertMin;
  let dayStart = typeof r.dayStart === "string" && HM.test(r.dayStart) ? r.dayStart : d.dayStart;
  let dayEnd = typeof r.dayEnd === "string" && HM.test(r.dayEnd) ? r.dayEnd : d.dayEnd;
  // Janela invertida não ajuda ninguém: volta ao padrão.
  if (dayEnd <= dayStart) {
    dayStart = d.dayStart;
    dayEnd = d.dayEnd;
  }
  return {
    defaultDurationMin:
      Number.isFinite(duration) && duration >= 5 && duration <= 720
        ? Math.round(duration)
        : d.defaultDurationMin,
    dayStart,
    dayEnd,
    showWeekends: typeof r.showWeekends === "boolean" ? r.showWeekends : d.showWeekends,
    defaultAlertMin:
      typeof alert === "number" && alert >= 0 && alert <= 60 * 24 * 14
        ? Math.round(alert)
        : d.defaultAlertMin,
    defaultView: VIEWS.includes(r.defaultView as AgendaView)
      ? (r.defaultView as AgendaView)
      : d.defaultView,
    defaultLabelId: typeof r.defaultLabelId === "string" ? r.defaultLabelId : null,
  };
}

export function alertLabel(minutes: number): string {
  const preset = ALERT_OPTIONS.find((o) => o.minutes === minutes);
  if (preset) return preset.label;
  if (minutes % 1440 === 0) return `${minutes / 1440} dias antes`;
  if (minutes % 60 === 0) return `${minutes / 60} horas antes`;
  return `${minutes} minutos antes`;
}
