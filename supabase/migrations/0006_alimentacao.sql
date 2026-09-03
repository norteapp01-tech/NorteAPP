-- Alimentação — Refeição -> Opção -> Registro do dia. Espelha nutrition-store.ts.
-- Sem vínculo com Agenda: no código real, refeições têm horário fixo diário e nunca
-- geraram `routines`/`executions` (ver nota no plano) — replicando o comportamento real.

create type meal_log_source as enum ('option', 'custom');

create table meals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  time text not null,
  name text not null,
  order_index int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index meals_user_id_idx on meals (user_id);
create trigger meals_set_updated_at before update on meals
  for each row execute function set_updated_at();

create table meal_options (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  meal_id uuid not null references meals (id) on delete cascade,
  description text not null,
  protein numeric,
  carbs numeric,
  fat numeric,
  calories numeric
);
create index meal_options_meal_id_idx on meal_options (meal_id);

create table meal_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  meal_id uuid not null references meals (id) on delete cascade,
  date date not null,
  source meal_log_source not null,
  option_id uuid references meal_options (id) on delete set null,
  description text not null,
  protein numeric not null default 0,
  carbs numeric not null default 0,
  fat numeric not null default 0,
  calories numeric not null default 0,
  confirmed_at timestamptz not null default now(),
  unique (meal_id, date)
);
create index meal_logs_date_idx on meal_logs (date);

-- Uma linha por usuário — metas diárias configuradas manualmente.
create table nutrition_goals (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  protein numeric not null default 0,
  carbs numeric not null default 0,
  fat numeric not null default 0,
  calories numeric not null default 0,
  updated_at timestamptz not null default now()
);
create trigger nutrition_goals_set_updated_at before update on nutrition_goals
  for each row execute function set_updated_at();
