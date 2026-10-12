-- Agenda — Fase 1: rótulos, recorrência, histórico de mudanças, alertas por
-- ocorrência, configurações e metadados externos.
--
-- Só adiciona. Nenhuma coluna ou tabela existente perde dado, e todo
-- compromisso antigo continua válido (sem rótulo, sem série, `source = norte`).
--
-- Decisões:
--  * Série = regra + modelo. As ocorrências são CALCULADAS. Só vira linha em
--    `executions` a ocorrência que foi tocada (concluída, movida, cancelada,
--    editada) ou que entra na janela curta de "hoje/amanhã", para que Hoje,
--    lembretes e o Agente Norte continuem enxergando execuções reais.
--  * `executions.series_id + series_occurrence_date` identificam a ocorrência
--    ORIGINAL da série (a data pela regra), mesmo que ela tenha sido movida. O
--    índice único impede duplicar a mesma ocorrência.
--  * Remover UMA ocorrência = linha em `agenda_series_exceptions`.
--  * Sincronização externa fica em tabela própria (`agenda_external_links`),
--    sem acoplar o domínio a nenhum provedor.

begin;

-- ---------------------------------------------------------------------------
-- Rótulos
-- ---------------------------------------------------------------------------
create table public.agenda_labels (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 40),
  color text not null default '#91f5da' check (color ~ '^#[0-9a-fA-F]{6}$'),
  icon text,
  order_index int not null default 0,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index agenda_labels_user_id_idx on public.agenda_labels (user_id);
create trigger agenda_labels_set_updated_at before update on public.agenda_labels
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- Séries recorrentes
-- ---------------------------------------------------------------------------
create table public.agenda_series (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null,
  category text not null default 'generico',
  label_id uuid references public.agenda_labels (id) on delete set null,
  location text,
  notes text,
  link text,
  rigid boolean not null default false,
  weight task_weight not null default 'leve',
  goal_id uuid references public.goals (id) on delete set null,
  step_id uuid references public.steps (id) on delete set null,
  start_date date not null,
  start_time text,
  end_time text,
  all_day boolean not null default false,
  -- { freq, interval, byWeekday?, byMonthDay?, until?, count? } — ver
  -- src/lib/agenda-recurrence.ts
  rule jsonb not null,
  -- Minutos antes do início: [0, 10, 60, 1440 …]
  alerts jsonb not null default '[]'::jsonb,
  source text not null default 'norte' check (source in ('norte', 'external')),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index agenda_series_user_id_idx on public.agenda_series (user_id);
create trigger agenda_series_set_updated_at before update on public.agenda_series
  for each row execute function set_updated_at();

create table public.agenda_series_exceptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  series_id uuid not null references public.agenda_series (id) on delete cascade,
  occurrence_date date not null,
  kind text not null default 'removed' check (kind in ('removed')),
  created_at timestamptz not null default now(),
  unique (series_id, occurrence_date)
);
create index agenda_series_exceptions_user_id_idx on public.agenda_series_exceptions (user_id);

-- ---------------------------------------------------------------------------
-- Campos novos do compromisso
-- ---------------------------------------------------------------------------
alter table public.executions
  add column label_id uuid references public.agenda_labels (id) on delete set null,
  add column notes text,
  add column link text,
  add column all_day boolean not null default false,
  add column series_id uuid references public.agenda_series (id) on delete set null,
  add column series_occurrence_date date,
  -- true quando a pessoa mexeu nesta ocorrência: edições da série não a sobrescrevem.
  add column series_overridden boolean not null default false,
  add column source text not null default 'norte' check (source in ('norte', 'external'));

create index executions_label_id_idx on public.executions (label_id);
create index executions_series_id_idx on public.executions (series_id);
create unique index executions_series_occurrence_uidx
  on public.executions (series_id, series_occurrence_date)
  where series_id is not null and series_occurrence_date is not null;

-- ---------------------------------------------------------------------------
-- Histórico da Agenda (auditoria; base do futuro Espelho)
--
-- Guarda o horário ANTES e DEPOIS de cada mudança. Duração real não existe
-- aqui: só o que foi planejado.
-- ---------------------------------------------------------------------------
create table public.agenda_changes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  execution_id uuid references public.executions (id) on delete cascade,
  series_id uuid references public.agenda_series (id) on delete set null,
  session_id text,
  at timestamptz not null default now(),
  kind text not null check (
    kind in ('scheduled', 'moved', 'resized', 'completed', 'reopened', 'cancelled', 'removed', 'label_changed')
  ),
  from_date date,
  from_start text,
  from_end text,
  to_date date,
  to_start text,
  to_end text,
  note text
);
create index agenda_changes_user_id_idx on public.agenda_changes (user_id);
create index agenda_changes_execution_id_idx on public.agenda_changes (execution_id);

-- ---------------------------------------------------------------------------
-- Alertas por ocorrência de série
-- ---------------------------------------------------------------------------
alter table public.reminders
  add column related_series_id uuid references public.agenda_series (id) on delete cascade,
  add column related_occurrence_date date;
create index reminders_related_series_idx on public.reminders (related_series_id)
  where related_series_id is not null;

-- ---------------------------------------------------------------------------
-- Configurações da Agenda (duração padrão, janela do dia, visão padrão …)
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column agenda_settings jsonb not null default '{}'::jsonb;

-- ---------------------------------------------------------------------------
-- Sincronização externa (Fase 2). Nada aqui é usado ainda.
--
-- Uma linha liga um compromisso OU uma série do Norte a um evento de um
-- provedor externo qualquer (Google, Apple, Outlook).
-- ---------------------------------------------------------------------------
create table public.agenda_external_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  execution_id uuid references public.executions (id) on delete cascade,
  series_id uuid references public.agenda_series (id) on delete cascade,
  provider text not null,
  external_calendar_id text,
  external_event_id text,
  external_series_id text,
  etag text,
  last_synced_at timestamptz,
  sync_state text not null default 'pending'
    check (sync_state in ('pending', 'synced', 'conflict', 'error', 'detached')),
  origin text not null default 'norte' check (origin in ('norte', 'external')),
  external_label text,
  external_color text,
  access_role text not null default 'write' check (access_role in ('read', 'write')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (execution_id is not null or series_id is not null)
);
create index agenda_external_links_user_id_idx on public.agenda_external_links (user_id);
create unique index agenda_external_links_event_uidx
  on public.agenda_external_links (user_id, provider, external_calendar_id, external_event_id)
  where external_event_id is not null;
create trigger agenda_external_links_set_updated_at before update on public.agenda_external_links
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS: cada pessoa só enxerga e altera o que é dela.
-- ---------------------------------------------------------------------------
alter table public.agenda_labels enable row level security;
alter table public.agenda_series enable row level security;
alter table public.agenda_series_exceptions enable row level security;
alter table public.agenda_changes enable row level security;
alter table public.agenda_external_links enable row level security;

create policy agenda_labels_owner_access on public.agenda_labels
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy agenda_series_owner_access on public.agenda_series
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy agenda_series_exceptions_owner_access on public.agenda_series_exceptions
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy agenda_changes_owner_access on public.agenda_changes
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy agenda_external_links_owner_access on public.agenda_external_links
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- "Recomeçar do zero" precisa limpar também o que esta fase criou.
-- ---------------------------------------------------------------------------
create or replace function public.reset_my_account_content()
returns void language plpgsql security definer set search_path = '' as $$
declare
  account_id uuid := (select auth.uid());
  table_name text;
begin
  if account_id is null then
    raise exception 'Authentication required';
  end if;

  foreach table_name in array array[
    'app_ideas',
    'agenda_external_links', 'agenda_changes', 'agenda_series_exceptions',
    'sport_route_attempts', 'sport_routes', 'sport_activities', 'sport_weekly_goals',
    'workout_set_logs', 'workout_exercise_logs', 'workout_sessions',
    'workout_block_days', 'workout_block_plans', 'workout_cycle_goals',
    'workout_cycle_blocks', 'workout_cycles', 'workout_weekly_assignment',
    'workout_exercises', 'workout_plans', 'workout_body_measurements',
    'workout_body_weights',
    'meal_logs', 'meal_plan_assignments', 'meal_options', 'meals', 'nutrition_goals',
    'reading_activity_log', 'reading_daily_targets', 'reading_sessions',
    'reading_notes', 'reading_plans', 'reading_routines', 'reading_books',
    'prayer_activity_log', 'bible_reading_logs', 'notebook_entries',
    'spiritual_activities', 'prayer_notes', 'prayer_subjects', 'purposes',
    'reading_frequency_pref',
    'goal_contributions', 'financial_goals', 'financial_intentions',
    'savings_goals_monthly', 'category_limits', 'transactions', 'check_ins',
    'agent_inbox_items', 'push_subscriptions', 'reminders',
    'execution_history', 'routine_links', 'executions', 'routines',
    'agenda_series', 'agenda_labels',
    'subtasks', 'steps', 'goals', 'hydration_logs', 'profiles'
  ] loop
    execute format('delete from public.%I where user_id = $1', table_name) using account_id;
  end loop;
end;
$$;

commit;
