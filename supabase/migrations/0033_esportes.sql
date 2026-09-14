-- Módulo Esportes (Corrida, Caminhada, Ciclismo).
--
-- Planejamento reaproveita executions/routines (sem motor de recorrência
-- novo): só ganham 3 colunas opcionais pra carregar modalidade e objetivo,
-- copiadas pra cada ocorrência materializada exatamente como o resto dos
-- campos de uma rotina já é hoje. Registro real (o que de fato aconteceu) é
-- tabela nova e separada — mesmo espírito de WorkoutPlan vs. WorkoutSession
-- que a Academia já usa: planejar e registrar nunca são a mesma linha.

alter table executions add column sport_modality text
  check (sport_modality in ('corrida', 'caminhada', 'ciclismo'));
alter table executions add column sport_target_distance_m numeric
  check (sport_target_distance_m is null or sport_target_distance_m > 0);
alter table executions add column sport_target_duration_s integer
  check (sport_target_duration_s is null or sport_target_duration_s > 0);

alter table routines add column sport_modality text
  check (sport_modality in ('corrida', 'caminhada', 'ciclismo'));
alter table routines add column sport_target_distance_m numeric
  check (sport_target_distance_m is null or sport_target_distance_m > 0);
alter table routines add column sport_target_duration_s integer
  check (sport_target_duration_s is null or sport_target_duration_s > 0);

-- ---------------------------------------------------------------------------
-- Atividade registrada (gravada por GPS ou lançada na mão). Pontos e pausas
-- só existem pra atividades gravadas — lançamento manual nunca tem percurso,
-- pra nunca inventar caminho que não foi percorrido.
-- ---------------------------------------------------------------------------
create table sport_activities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  modality text not null check (modality in ('corrida', 'caminhada', 'ciclismo')),
  source text not null default 'gravado' check (source in ('gravado', 'manual')),
  title text not null,
  note text,
  started_at timestamptz not null,
  ended_at timestamptz,
  active_duration_s integer not null default 0 check (active_duration_s >= 0),
  total_duration_s integer not null default 0 check (total_duration_s >= 0),
  distance_m numeric not null default 0 check (distance_m >= 0),
  avg_pace_s_per_km numeric,
  avg_speed_kmh numeric,
  execution_id uuid references executions (id) on delete set null,
  photo_url text,
  privacy_hide_route boolean not null default false,
  privacy_hide_start_end boolean not null default false,
  is_private boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index sport_activities_user_id_idx on sport_activities (user_id);
create index sport_activities_started_at_idx on sport_activities (started_at desc);
create index sport_activities_execution_id_idx on sport_activities (execution_id);

create trigger sport_activities_set_updated_at before update on sport_activities
  for each row execute function set_updated_at();

create table sport_activity_points (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references sport_activities (id) on delete cascade,
  sequence integer not null,
  lat double precision not null,
  lng double precision not null,
  recorded_at timestamptz not null,
  accuracy_m numeric,
  elevation_m numeric,
  unique (activity_id, sequence)
);
create index sport_activity_points_activity_id_idx on sport_activity_points (activity_id);

create table sport_activity_pauses (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references sport_activities (id) on delete cascade,
  paused_at timestamptz not null,
  resumed_at timestamptz
);
create index sport_activity_pauses_activity_id_idx on sport_activity_pauses (activity_id);

-- ---------------------------------------------------------------------------
-- Meta semanal por modalidade — frequência e distância, cada campo opcional,
-- nunca preenchidas automaticamente. No máximo uma meta ativa por
-- usuário+modalidade (índice único parcial).
-- ---------------------------------------------------------------------------
create table sport_weekly_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  modality text not null check (modality in ('corrida', 'caminhada', 'ciclismo')),
  target_sessions integer check (target_sessions is null or target_sessions > 0),
  target_distance_m numeric check (target_distance_m is null or target_distance_m > 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index sport_weekly_goals_active_unique on sport_weekly_goals (user_id, modality)
  where active;

create trigger sport_weekly_goals_set_updated_at before update on sport_weekly_goals
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS — mesmo padrão do resto do projeto desde a 0013 (auth.uid() cacheado
-- pelo planner via subselect). Pontos/pausas não têm user_id direto — checam
-- posse via a atividade dona.
-- ---------------------------------------------------------------------------
alter table sport_activities enable row level security;
alter table sport_activity_points enable row level security;
alter table sport_activity_pauses enable row level security;
alter table sport_weekly_goals enable row level security;

create policy sport_activities_owner on sport_activities for all
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy sport_weekly_goals_owner on sport_weekly_goals for all
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy sport_activity_points_owner on sport_activity_points for all
  using (
    exists (
      select 1 from sport_activities a where a.id = activity_id and a.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from sport_activities a where a.id = activity_id and a.user_id = (select auth.uid())
    )
  );

create policy sport_activity_pauses_owner on sport_activity_pauses for all
  using (
    exists (
      select 1 from sport_activities a where a.id = activity_id and a.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from sport_activities a where a.id = activity_id and a.user_id = (select auth.uid())
    )
  );
