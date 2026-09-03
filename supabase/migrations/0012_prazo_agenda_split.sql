-- Separa PRAZO (até quando precisa ser feito, sempre existe) de AGENDA (quando
-- reservei tempo pra fazer, opcional). Antes, date+time representavam os dois
-- conceitos ao mesmo tempo — agora due_date é sempre obrigatório, e
-- agenda_date/start_time/end_time só existem quando a execução foi agendada.

alter table executions rename column date to due_date;
alter table executions rename column time to start_time;
alter table executions add column agenda_date date;
alter table executions add column end_time text;
alter table executions alter column start_time drop not null;

-- Backfill: toda execução existente já representava um compromisso agendado
-- no modelo antigo (date+time sempre andavam juntos) — preserva o comportamento
-- atual pra dados já gravados.
update executions set agenda_date = due_date where agenda_date is null;

create index executions_agenda_date_idx on executions (agenda_date);
