-- Alertas de compromisso reutilizam a tabela `reminders` (mesma infraestrutura
-- de push), mas não são "lembretes" que a pessoa escreveu: não devem aparecer
-- como itens no cartão de lembretes. `origin` separa os dois.
alter table public.reminders
  add column origin text not null default 'user' check (origin in ('user', 'agenda_alert'));

create index reminders_origin_idx on public.reminders (origin) where origin <> 'user';
