-- Lembretes — avisos pontuais do usuário, independentes de Plano/Etapa/Execução.
-- Espelha reminders-store.ts. RLS já nasce no formato "hardened" da 0013
-- (auth.uid() envolto em select, cacheado uma vez por query pelo planner).

create table reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  text text not null,
  date date not null,
  done boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index reminders_user_id_idx on reminders (user_id);
create index reminders_user_date_idx on reminders (user_id, date);

create trigger reminders_set_updated_at before update on reminders
  for each row execute function set_updated_at();

alter table reminders enable row level security;
create policy reminders_owner_access on reminders
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
