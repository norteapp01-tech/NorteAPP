-- Academia — Treino -> Exercício -> Sessão (série a série). Espelha workout-store.ts.
-- Quando um treino tem horário agendado, isso vive em `routines`/`executions` do
-- núcleo (categoria 'academia') — workout_weekly_assignment só decide QUAL treino
-- (A/B/C...) é "o de hoje", não cria compromisso na Agenda.

create type workout_session_status as enum ('em_andamento', 'concluido');

create table workout_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  letter text not null,
  name text not null,
  muscle_groups text not null default '',
  order_index int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index workout_plans_user_id_idx on workout_plans (user_id);
create trigger workout_plans_set_updated_at before update on workout_plans
  for each row execute function set_updated_at();

create table workout_exercises (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  plan_id uuid not null references workout_plans (id) on delete cascade,
  name text not null,
  sets_target int not null default 0,
  reps_target int not null default 0,
  load_target numeric not null default 0,
  rest_seconds int not null default 60,
  order_index int not null default 0
);
create index workout_exercises_plan_id_idx on workout_exercises (plan_id);

create table workout_weekly_assignment (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  weekday int not null check (weekday between 0 and 6),
  plan_id uuid references workout_plans (id) on delete set null,
  primary key (user_id, weekday)
);

create table workout_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  plan_id uuid not null references workout_plans (id) on delete cascade,
  date date not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status workout_session_status not null default 'em_andamento'
);
create index workout_sessions_user_id_idx on workout_sessions (user_id);
create index workout_sessions_plan_id_idx on workout_sessions (plan_id);
create index workout_sessions_date_idx on workout_sessions (date);

create table workout_exercise_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  session_id uuid not null references workout_sessions (id) on delete cascade,
  exercise_id uuid not null references workout_exercises (id) on delete cascade,
  done boolean not null default false,
  unique (session_id, exercise_id)
);
create index workout_exercise_logs_session_id_idx on workout_exercise_logs (session_id);

create table workout_set_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  exercise_log_id uuid not null references workout_exercise_logs (id) on delete cascade,
  set_index int not null,
  weight numeric not null default 0,
  reps int not null default 0
);
create index workout_set_logs_exercise_log_id_idx on workout_set_logs (exercise_log_id);

create table workout_body_weights (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  date date not null,
  weight numeric not null
);
create index workout_body_weights_user_id_idx on workout_body_weights (user_id);
