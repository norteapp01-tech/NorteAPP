-- Uma ação do planejamento pode receber várias reservas de trabalho na Agenda.
-- Mantemos agenda_date/start_time/end_time por compatibilidade com registros antigos.
alter table executions
  add column agenda_sessions jsonb not null default '[]'::jsonb;

alter table executions
  add constraint executions_agenda_sessions_array
  check (jsonb_typeof(agenda_sessions) = 'array');
