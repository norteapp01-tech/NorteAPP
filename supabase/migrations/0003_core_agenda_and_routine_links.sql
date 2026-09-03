-- Agenda — Rotina -> Execução -> Histórico. Espelha goals-store.ts (Routine/Execution).
-- Toda subagenda com horário (Academia, Leitura, Fé) referencia ESTA execução —
-- nunca guarda uma cópia própria (ver routine_links mais abaixo).

create type execution_status as enum ('planejada', 'concluida', 'perdida', 'reagendada', 'cancelada');

create table routines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  category text not null,
  title text not null,
  weekday int not null check (weekday between 0 and 6),
  time text not null,
  weight task_weight not null default 'leve',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index routines_user_id_idx on routines (user_id);
create index routines_category_idx on routines (category);
create trigger routines_set_updated_at before update on routines
  for each row execute function set_updated_at();

create table executions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null,
  date date not null,
  time text not null,
  category text not null,
  location text,
  rigid boolean not null default false,
  weight task_weight not null default 'leve',
  how text,
  why text,
  status execution_status not null default 'planejada',
  goal_id uuid references goals (id) on delete set null,
  step_id uuid references steps (id) on delete set null,
  rescheduled_from_id uuid references executions (id) on delete set null,
  routine_id uuid references routines (id) on delete set null,
  created_at timestamptz not null default now()
);
create index executions_user_id_idx on executions (user_id);
create index executions_date_idx on executions (date);
create index executions_category_idx on executions (category);
create index executions_goal_id_idx on executions (goal_id);
create index executions_routine_id_idx on executions (routine_id);

-- Append-only: nunca é atualizado por UPDATE do app, só INSERT — preserva a cadeia
-- perdida -> reagendada -> nova exatamente como pushHistory() já faz em memória.
create table execution_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  execution_id uuid not null references executions (id) on delete cascade,
  at timestamptz not null default now(),
  from_status execution_status not null,
  to_status execution_status not null,
  note text
);
create index execution_history_execution_id_idx on execution_history (execution_id);

-- Uma entidade de subagenda (ReadingRoutine, SpiritualActivity) pode gerar N `routines`
-- do núcleo, uma por dia da semana escolhido — este join table registra esse vínculo
-- sem duplicar a modelagem em cada subagenda.
create type routine_link_source as enum ('reading_routine', 'spiritual_activity');

create table routine_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  source_type routine_link_source not null,
  source_id uuid not null,
  weekday int not null check (weekday between 0 and 6),
  core_routine_id uuid not null references routines (id) on delete cascade
);
create index routine_links_source_idx on routine_links (source_type, source_id);
create index routine_links_core_routine_id_idx on routine_links (core_routine_id);
