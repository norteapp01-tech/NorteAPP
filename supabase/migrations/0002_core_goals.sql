-- Núcleo — Objetivo -> Etapa -> Subetapa. Espelha goals-store.ts (Goal/Step/Subtask).

create type goal_kind as enum ('sonho', 'projeto', 'habito');
create type tracking_type as enum ('etapas', 'frequencia', 'numero');
create type task_weight as enum ('leve', 'medio', 'pesado');

create table goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null,
  why text not null default '',
  how text,
  final_outcome text,
  tracking_type tracking_type not null default 'etapas',
  frequency_times_per_week int,
  kind goal_kind not null default 'projeto',
  category text not null,
  life_area text not null,
  deadline_label text not null default '',
  deadline_date date,
  metric_target numeric not null default 0,
  metric_unit text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index goals_user_id_idx on goals (user_id);
create index goals_category_idx on goals (category);
create trigger goals_set_updated_at before update on goals
  for each row execute function set_updated_at();

create table steps (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  goal_id uuid not null references goals (id) on delete cascade,
  title text not null,
  done boolean not null default false,
  due_label text,
  target_date date,
  order_index int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index steps_goal_id_idx on steps (goal_id);
create trigger steps_set_updated_at before update on steps
  for each row execute function set_updated_at();

create table subtasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  step_id uuid not null references steps (id) on delete cascade,
  title text not null,
  done boolean not null default false,
  order_index int not null default 0,
  created_at timestamptz not null default now()
);
create index subtasks_step_id_idx on subtasks (step_id);
