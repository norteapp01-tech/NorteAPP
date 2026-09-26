-- Lembretes ganham hora (e um vínculo opcional a um compromisso) + a tabela
-- que guarda as inscrições de push do navegador, para o agente poder de
-- verdade avisar "1h antes do dentista" com o app fechado.
--
-- `date` continua existindo: lembretes antigos e os sem hora nascida (ex.
-- "lembra de ligar pro médico esta semana") não precisam de precisão de
-- minuto. `remind_at` é o momento exato de disparo — só ele importa para o
-- despachante (Edge Function `dispatch-reminders`). Quando o lembrete nasce
-- amarrado a uma execução (`related_execution_id` + `offset_minutes`), quem
-- resolve `remind_at` é a store no momento da criação, a partir de
-- `executions.agenda_date` + `executions.start_time` — a tabela não recalcula
-- sozinha, então mover o compromisso depois não desloca lembretes já criados
-- (o mesmo princípio de retrato usado em `planned_snapshot`, 0039).

begin;

alter table reminders
  add column remind_at timestamptz,
  add column related_execution_id uuid references executions (id) on delete set null,
  add column offset_minutes int,
  add column notified_at timestamptz;

create index reminders_remind_at_idx on reminders (remind_at) where remind_at is not null;

-- Inscrições de push do navegador (Web Push / VAPID). Uma por dispositivo —
-- por isso o unique em (user_id, endpoint), não em user_id: a mesma pessoa
-- pode ter o celular e o notebook inscritos ao mesmo tempo.
create table push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, endpoint)
);

create index push_subscriptions_user_id_idx on push_subscriptions (user_id);

create trigger push_subscriptions_set_updated_at before update on push_subscriptions
  for each row execute function set_updated_at();

alter table push_subscriptions enable row level security;
create policy push_subscriptions_owner_access on push_subscriptions
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

commit;
