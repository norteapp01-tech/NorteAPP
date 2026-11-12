-- Lembretes gerados por rotinas (encadeamento e horários) usam a mesma tabela e
-- o mesmo envio de push, mas não são lembretes que a pessoa escreveu: ficam fora
-- da lista de lembretes, como os alertas da Agenda.
begin;

alter table public.reminders drop constraint if exists reminders_origin_check;
alter table public.reminders
  add constraint reminders_origin_check
  check (origin in ('user', 'agenda_alert', 'habit_chain', 'habit_reminder'));

commit;
