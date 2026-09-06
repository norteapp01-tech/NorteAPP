-- Intervalo planejado no Cronograma (aba Gantt) — terceiro conceito de tempo,
-- distinto do PRAZO (due_date, sempre existiu) e da AGENDA (agenda_date/
-- start_time/end_time, compromisso específico). Nullable e sem backfill: uma
-- ação antiga que só tem prazo não ganha uma duração inventada — ela some
-- em "Ações sem data" até o usuário definir um período de verdade.
alter table executions add column planned_start_date date;
alter table executions add column planned_end_date date;
