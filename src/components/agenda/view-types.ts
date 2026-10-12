import type { AgendaOccurrence } from "@/lib/agenda-occurrences";
import type { AgendaLabel } from "@/lib/agenda-labels-store";
import type { AgendaSettings } from "@/lib/agenda-settings";
import type { TimeFormat, WeekStart } from "@/lib/profile-store";
import type { CommitPatch } from "./Timeline";

/** O que toda visão da Agenda recebe — um só formato para Dia, Semana, Mês e Próximos. */
export type ViewProps = {
  selectedDate: string;
  today: string;
  occurrences: AgendaOccurrence[];
  labelsById: Map<string, AgendaLabel>;
  conflictIds: Set<string>;
  settings: AgendaSettings;
  timeFormat: TimeFormat;
  weekStart: WeekStart;
  nowMinute: number;
  selectedKey: string | null;
  onSelectDate: (date: string) => void;
  onOpen: (occ: AgendaOccurrence) => void;
  onCreate: (date: string, minute: number) => void;
  onCommit: (occ: AgendaOccurrence, patch: CommitPatch) => Promise<void>;
  onDropFit?: (executionId: string, date: string, minute: number) => void;
};
