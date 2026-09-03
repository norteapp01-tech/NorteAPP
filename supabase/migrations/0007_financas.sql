-- Finanças — diário financeiro + planejamento + objetivos. Espelha finance-store.ts.
-- Aporte a objetivo NUNCA vira transaction (é alocação, não gasto) — goal_contributions
-- é uma tabela própria, exatamente como contributeToGoal() já garante em memória.

create type transaction_type as enum ('expense', 'income');
create type transaction_recurrence as enum ('none', 'monthly');
create type check_in_answer as enum ('consegui', 'mais_ou_menos', 'nao_consegui');

create table transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  type transaction_type not null,
  amount numeric not null,
  description text not null,
  category text not null,
  date date not null,
  is_fixed boolean not null default false,
  recurrence transaction_recurrence not null default 'none',
  payment_method text,
  note text,
  created_at timestamptz not null default now()
);
create index transactions_user_id_idx on transactions (user_id);
create index transactions_date_idx on transactions (date);
create index transactions_category_idx on transactions (category);

create table savings_goals_monthly (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  month text not null,
  target_amount numeric not null default 0,
  unique (user_id, month)
);

create table category_limits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  category text not null,
  limit_amount numeric not null
);
create index category_limits_user_id_idx on category_limits (user_id);

create table financial_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  target_amount numeric not null,
  saved_amount numeric not null default 0,
  deadline date,
  image_url text,
  image_path text,
  created_at timestamptz not null default now()
);
create index financial_goals_user_id_idx on financial_goals (user_id);

create table goal_contributions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  goal_id uuid not null references financial_goals (id) on delete cascade,
  amount numeric not null,
  date date not null,
  note text,
  created_at timestamptz not null default now()
);
create index goal_contributions_goal_id_idx on goal_contributions (goal_id);

create table financial_intentions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  text text not null,
  created_at timestamptz not null default now()
);
create index financial_intentions_user_id_idx on financial_intentions (user_id);

create table check_ins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  week_start date not null,
  question text not null,
  answer check_in_answer,
  note text,
  responded_at timestamptz
);
create index check_ins_user_id_idx on check_ins (user_id);
