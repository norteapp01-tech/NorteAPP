-- Rotinas e hábitos: motor unificado.
--
-- Decisões de modelo (ver docs/habits-implementation-status.md):
--  * `habits` guarda a identidade da rotina; meta e frequência vivem em
--    `habit_versions` (uma linha por mudança, vale a partir de `effective_from`).
--    Mudar a meta hoje nunca reescreve março.
--  * `habit_logs` guarda EVENTOS (várias sessões por dia, duração real, origem,
--    referência externa, nota, sensação, checklist). Desfazer é `deleted_at`.
--  * Idempotência no banco: chave de idempotência e (hábito, origem, referência)
--    únicas — a mesma corrida importada duas vezes não soma duas vezes.
--  * Pausa por hábito, por área ou global, com intervalo de datas.
--  * Timer por timestamps (`habit_timers`): o relógio nunca depende de um
--    setInterval em segundo plano.
--  * Encadeamento, lembretes, reflexões. Compartilhamento e integrações
--    externas NÃO estão aqui (dependem de infraestrutura/credenciais).
-- Toda tabela tem RLS por dono e chaves estrangeiras compostas (id, user_id)
-- para que ninguém consiga apontar para a rotina de outra pessoa.

begin;

-- ---------------------------------------------------------------------------
-- habits
-- ---------------------------------------------------------------------------
create table public.habits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  icon text check (icon is null or char_length(icon) <= 40),
  color text check (color is null or color ~ '^#[0-9a-fA-F]{6}$'),
  area text check (area is null or char_length(btrim(area)) between 1 and 40),
  intent text not null default 'build' check (intent in ('build', 'limit', 'quit')),
  measure text not null default 'binary' check (measure in ('binary', 'count', 'quantity', 'duration')),
  unit text check (unit is null or char_length(btrim(unit)) between 1 and 24),
  start_date date not null default current_date check (start_date >= date '2000-01-01'),
  -- {"type":"date","date":"2026-12-31"} | {"type":"completions","count":30} | {"type":"total","amount":500}
  end_condition jsonb check (end_condition is null or jsonb_typeof(end_condition) = 'object'),
  goal_id uuid references public.goals (id) on delete set null,
  step_id uuid references public.steps (id) on delete set null,
  label_id uuid references public.agenda_labels (id) on delete set null,
  category text check (category is null or char_length(category) <= 40),
  -- Módulo que alimenta esta rotina sozinho (sem somar duas vezes).
  module text check (module is null or module in ('academia', 'esportes', 'leitura', 'agua')),
  module_metric text check (module_metric is null or module_metric in ('sessions', 'minutes', 'pages', 'km', 'ml')),
  position integer not null default 0,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  check ((module is null) = (module_metric is null))
);
create index habits_user_idx on public.habits (user_id) where archived_at is null;
create index habits_module_idx on public.habits (user_id, module) where module is not null and archived_at is null;

create trigger habits_set_updated_at before update on public.habits
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- habit_versions: meta + frequência com vigência
-- ---------------------------------------------------------------------------
create table public.habit_versions (
  id uuid primary key default gen_random_uuid(),
  habit_id uuid not null,
  user_id uuid not null default auth.uid(),
  effective_from date not null check (effective_from >= date '2000-01-01'),
  goal_value numeric not null default 1 check (goal_value >= 0 and goal_value < 1000000000),
  goal_period text not null default 'day' check (goal_period in ('day', 'week', 'month', 'year')),
  -- {"type":"daily"} | {"type":"weekdays","weekdays":[1,3,5]} | {"type":"monthdays","days":[1,15]} | {"type":"interval","every":2}
  schedule jsonb not null default '{"type":"daily"}'::jsonb check (jsonb_typeof(schedule) = 'object'),
  -- Meta flexível: vale no período inteiro, sem dia fixo.
  flexible boolean not null default false,
  times_of_day text[] not null default '{}' check (times_of_day <@ array['morning', 'afternoon', 'evening']::text[]),
  -- [{"id":"a1","title":"Alongar"}]
  checklist jsonb not null default '[]'::jsonb check (jsonb_typeof(checklist) = 'array' and jsonb_array_length(checklist) <= 30),
  created_at timestamptz not null default now(),
  foreign key (habit_id, user_id) references public.habits (id, user_id) on delete cascade,
  unique (habit_id, effective_from)
);
create index habit_versions_habit_idx on public.habit_versions (habit_id, effective_from);

create or replace function public.validate_habit_version()
returns trigger language plpgsql set search_path = public as $$
declare
  kind text := new.schedule ->> 'type';
  item jsonb;
  n integer;
begin
  if kind is null or kind not in ('daily', 'weekdays', 'monthdays', 'interval') then
    raise exception 'Frequência inválida.';
  end if;
  if kind = 'weekdays' then
    if jsonb_typeof(new.schedule -> 'weekdays') is distinct from 'array'
       or jsonb_array_length(new.schedule -> 'weekdays') not between 1 and 7 then
      raise exception 'Escolha de 1 a 7 dias da semana.';
    end if;
    for item in select * from jsonb_array_elements(new.schedule -> 'weekdays') loop
      if jsonb_typeof(item) <> 'number' or (item #>> '{}')::numeric not between 0 and 6
         or (item #>> '{}')::numeric <> trunc((item #>> '{}')::numeric) then
        raise exception 'Dia da semana inválido.';
      end if;
    end loop;
  elsif kind = 'monthdays' then
    if jsonb_typeof(new.schedule -> 'days') is distinct from 'array'
       or jsonb_array_length(new.schedule -> 'days') not between 1 and 31 then
      raise exception 'Escolha de 1 a 31 dias do mês.';
    end if;
    for item in select * from jsonb_array_elements(new.schedule -> 'days') loop
      if jsonb_typeof(item) <> 'number' or (item #>> '{}')::numeric not between 1 and 31
         or (item #>> '{}')::numeric <> trunc((item #>> '{}')::numeric) then
        raise exception 'Dia do mês inválido.';
      end if;
    end loop;
  elsif kind = 'interval' then
    if jsonb_typeof(new.schedule -> 'every') <> 'number' then
      raise exception 'Intervalo inválido.';
    end if;
    n := (new.schedule ->> 'every')::numeric;
    if n not between 1 and 365 then
      raise exception 'O intervalo deve ficar entre 1 e 365 dias.';
    end if;
  end if;
  for item in select * from jsonb_array_elements(new.checklist) loop
    if jsonb_typeof(item) <> 'object' or coalesce(char_length(btrim(item ->> 'title')), 0) not between 1 and 120
       or coalesce(char_length(item ->> 'id'), 0) not between 1 and 40 then
      raise exception 'Item de checklist inválido.';
    end if;
  end loop;
  return new;
end;
$$;
create trigger habit_versions_validate before insert or update on public.habit_versions
  for each row execute function public.validate_habit_version();

-- ---------------------------------------------------------------------------
-- habit_logs: eventos
-- ---------------------------------------------------------------------------
create table public.habit_logs (
  id uuid primary key default gen_random_uuid(),
  habit_id uuid not null,
  user_id uuid not null default auth.uid(),
  local_date date not null check (local_date >= date '2000-01-01'),
  occurred_at timestamptz not null default now(),
  time_zone text check (time_zone is null or char_length(time_zone) <= 64),
  -- recorded: contribui para a meta · skipped: pulado de propósito · missed: "não realizei"
  -- confirmed: a pessoa fechou o dia numa meta de redução (sem isso, zero não prova nada)
  status text not null default 'recorded' check (status in ('recorded', 'skipped', 'missed', 'confirmed')),
  value numeric not null default 0 check (value >= 0 and value < 1000000000),
  duration_seconds integer check (duration_seconds is null or duration_seconds between 0 and 172800),
  note text not null default '' check (char_length(note) <= 2000),
  reason text check (reason is null or char_length(reason) <= 60),
  feeling text check (feeling is null or feeling in ('leve', 'neutro', 'pesado')),
  checks text[] not null default '{}' check (cardinality(checks) <= 30),
  source text not null default 'manual' check (source in ('manual', 'timer', 'module', 'import', 'agent')),
  source_ref text check (source_ref is null or char_length(source_ref) <= 200),
  idempotency_key text check (idempotency_key is null or char_length(idempotency_key) <= 100),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (habit_id, user_id) references public.habits (id, user_id) on delete cascade,
  check (status = 'recorded' or value = 0)
);
create unique index habit_logs_idempotency_uidx on public.habit_logs (user_id, idempotency_key)
  where idempotency_key is not null;
create unique index habit_logs_source_uidx on public.habit_logs (habit_id, source_ref)
  where source_ref is not null and deleted_at is null;
-- No máximo UM "pulado/não realizado/confirmado" por hábito e dia.
create unique index habit_logs_day_state_uidx on public.habit_logs (habit_id, local_date)
  where status <> 'recorded' and deleted_at is null;
create index habit_logs_habit_date_idx on public.habit_logs (habit_id, local_date) where deleted_at is null;
create index habit_logs_user_date_idx on public.habit_logs (user_id, local_date) where deleted_at is null;

create trigger habit_logs_set_updated_at before update on public.habit_logs
  for each row execute function public.set_updated_at();

create or replace function public.validate_habit_log()
returns trigger language plpgsql set search_path = public as $$
declare
  h record;
begin
  select intent, measure into h from public.habits where id = new.habit_id and user_id = new.user_id;
  if not found then
    raise exception 'Rotina não encontrada.';
  end if;
  -- Não registra o futuro (com 2 dias de folga para fusos à frente de UTC).
  if new.local_date > ((now() at time zone 'utc')::date + 2) then
    raise exception 'Não é possível registrar uma data futura.';
  end if;
  if new.status = 'recorded' and new.value = 0 and h.intent = 'build' then
    raise exception 'Informe um valor maior que zero.';
  end if;
  if new.status = 'confirmed' and h.intent = 'build' then
    raise exception 'Confirmar o dia só se aplica a rotinas de redução.';
  end if;
  return new;
end;
$$;
create trigger habit_logs_validate before insert or update of habit_id, local_date, status, value
  on public.habit_logs for each row execute function public.validate_habit_log();

-- ---------------------------------------------------------------------------
-- habit_pauses
-- ---------------------------------------------------------------------------
create table public.habit_pauses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  scope text not null check (scope in ('habit', 'area', 'global')),
  habit_id uuid,
  area text check (area is null or char_length(btrim(area)) between 1 and 40),
  start_date date not null,
  end_date date,
  reason text check (reason is null or char_length(reason) <= 200),
  created_at timestamptz not null default now(),
  foreign key (habit_id, user_id) references public.habits (id, user_id) on delete cascade,
  check (
    (scope = 'habit' and habit_id is not null and area is null)
    or (scope = 'area' and area is not null and habit_id is null)
    or (scope = 'global' and habit_id is null and area is null)
  ),
  check (end_date is null or end_date >= start_date)
);
create index habit_pauses_user_idx on public.habit_pauses (user_id, start_date);

-- ---------------------------------------------------------------------------
-- habit_timers: uma sessão ativa por pessoa, tudo por timestamps
-- ---------------------------------------------------------------------------
create table public.habit_timers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  habit_id uuid not null,
  mode text not null check (mode in ('stopwatch', 'countdown', 'pomodoro')),
  state text not null default 'running' check (state in ('running', 'paused')),
  -- Início do trecho em andamento; o decorrido é accumulated_seconds + (agora - started_at).
  started_at timestamptz not null default now(),
  accumulated_seconds integer not null default 0 check (accumulated_seconds between 0 and 172800),
  target_seconds integer check (target_seconds is null or target_seconds between 1 and 86400),
  -- {"focus":1500,"short":300,"long":900,"cycles":4}
  pomodoro jsonb check (pomodoro is null or jsonb_typeof(pomodoro) = 'object'),
  device_id text check (device_id is null or char_length(device_id) <= 64),
  revision integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (habit_id, user_id) references public.habits (id, user_id) on delete cascade,
  unique (user_id)
);
create trigger habit_timers_set_updated_at before update on public.habit_timers
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- habit_chains: "Quando A for [feita|pulada|não realizada], lembre de B"
-- ---------------------------------------------------------------------------
create table public.habit_chains (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  base_habit_id uuid not null,
  target_habit_id uuid not null,
  trigger_status text not null default 'done' check (trigger_status in ('done', 'skipped', 'missed')),
  delay_minutes integer not null default 0 check (delay_minutes between 0 and 1440),
  created_at timestamptz not null default now(),
  foreign key (base_habit_id, user_id) references public.habits (id, user_id) on delete cascade,
  foreign key (target_habit_id, user_id) references public.habits (id, user_id) on delete cascade,
  check (base_habit_id <> target_habit_id),
  unique (base_habit_id, target_habit_id, trigger_status)
);

-- Impede ciclos A -> B -> A (a integridade não depende só da interface).
create or replace function public.validate_habit_chain()
returns trigger language plpgsql set search_path = public as $$
declare
  cycle_found boolean;
begin
  with recursive reach(id) as (
    select c.target_habit_id from public.habit_chains c
    where c.base_habit_id = new.target_habit_id and c.user_id = new.user_id
    union
    select c.target_habit_id from public.habit_chains c join reach r on c.base_habit_id = r.id
    where c.user_id = new.user_id
  )
  select exists (select 1 from reach where id = new.base_habit_id) into cycle_found;
  if cycle_found then
    raise exception 'Esse encadeamento criaria um ciclo.';
  end if;
  return new;
end;
$$;
create trigger habit_chains_validate before insert or update on public.habit_chains
  for each row execute function public.validate_habit_chain();

-- ---------------------------------------------------------------------------
-- habit_reminders (definição) e vínculo com a tabela de lembretes existente
-- ---------------------------------------------------------------------------
create table public.habit_reminders (
  id uuid primary key default gen_random_uuid(),
  habit_id uuid not null,
  user_id uuid not null default auth.uid(),
  time text not null check (time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  weekdays integer[] not null default '{0,1,2,3,4,5,6}' check (weekdays <@ array[0, 1, 2, 3, 4, 5, 6] and cardinality(weekdays) >= 1),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  foreign key (habit_id, user_id) references public.habits (id, user_id) on delete cascade
);
create index habit_reminders_habit_idx on public.habit_reminders (habit_id);

alter table public.reminders
  add column if not exists related_habit_id uuid references public.habits (id) on delete cascade,
  add column if not exists habit_occurrence_date date;
create unique index if not exists reminders_habit_instance_uidx
  on public.reminders (user_id, related_habit_id, remind_at) where related_habit_id is not null;

-- ---------------------------------------------------------------------------
-- habit_reflections
-- ---------------------------------------------------------------------------
create table public.habit_reflections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  local_date date not null check (local_date >= date '2000-01-01'),
  habit_id uuid,
  mood text check (mood is null or mood in ('muito_bem', 'bem', 'neutro', 'dificil', 'muito_dificil')),
  note text not null default '' check (char_length(note) <= 4000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (habit_id, user_id) references public.habits (id, user_id) on delete cascade,
  check (mood is not null or char_length(btrim(note)) > 0)
);
create index habit_reflections_user_date_idx on public.habit_reflections (user_id, local_date desc);
create trigger habit_reflections_set_updated_at before update on public.habit_reflections
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['habits', 'habit_versions', 'habit_logs', 'habit_pauses', 'habit_timers',
                           'habit_chains', 'habit_reminders', 'habit_reflections']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('create policy %I on public.%I for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))',
                   t || '_owner', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- RPC: registrar com idempotência (a mesma tentativa repetida devolve o mesmo registro)
-- ---------------------------------------------------------------------------
create or replace function public.log_habit(
  p_habit uuid,
  p_date date,
  p_status text default 'recorded',
  p_value numeric default 0,
  p_duration integer default null,
  p_note text default '',
  p_reason text default null,
  p_feeling text default null,
  p_checks text[] default '{}',
  p_source text default 'manual',
  p_source_ref text default null,
  p_idempotency_key text default null,
  p_time_zone text default null,
  p_occurred_at timestamptz default now()
) returns public.habit_logs
language plpgsql security invoker set search_path = public as $$
declare
  existing public.habit_logs;
  created public.habit_logs;
begin
  if p_idempotency_key is not null then
    select * into existing from public.habit_logs
    where user_id = auth.uid() and idempotency_key = p_idempotency_key;
    if found then return existing; end if;
  end if;
  if p_source_ref is not null then
    select * into existing from public.habit_logs
    where habit_id = p_habit and source_ref = p_source_ref and deleted_at is null;
    if found then return existing; end if;
  end if;
  -- Registrar valor num dia "pulado/não realizado" substitui esse estado.
  if p_status = 'recorded' then
    update public.habit_logs set deleted_at = now()
    where habit_id = p_habit and local_date = p_date and status in ('skipped', 'missed')
      and deleted_at is null and user_id = auth.uid();
  else
    update public.habit_logs set deleted_at = now()
    where habit_id = p_habit and local_date = p_date and status <> 'recorded'
      and deleted_at is null and user_id = auth.uid();
  end if;
  insert into public.habit_logs (habit_id, local_date, status, value, duration_seconds, note, reason, feeling,
                                 checks, source, source_ref, idempotency_key, time_zone, occurred_at)
  values (p_habit, p_date, p_status, p_value, p_duration, coalesce(p_note, ''), p_reason, p_feeling,
          coalesce(p_checks, '{}'), p_source, p_source_ref, p_idempotency_key, p_time_zone, p_occurred_at)
  returning * into created;
  return created;
end;
$$;

-- Adaptador de módulo: Academia/Esportes/Leitura/Água alimentam as rotinas
-- vinculadas, uma única vez por referência.
create or replace function public.log_habits_from_module(
  p_module text,
  p_ref text,
  p_date date,
  p_metrics jsonb,
  p_time_zone text default null
) returns integer
language plpgsql security invoker set search_path = public as $$
declare
  h record;
  amount numeric;
  total integer := 0;
begin
  for h in
    select id, module_metric from public.habits
    where user_id = auth.uid() and module = p_module and archived_at is null
  loop
    amount := coalesce((p_metrics ->> h.module_metric)::numeric, 0);
    continue when amount <= 0;
    insert into public.habit_logs (habit_id, local_date, status, value, duration_seconds, source, source_ref, time_zone)
    values (h.id, p_date, 'recorded', amount,
            case when h.module_metric = 'minutes' then round(amount * 60)::integer else null end,
            'module', p_module || ':' || p_ref, p_time_zone)
    on conflict (habit_id, source_ref) where source_ref is not null and deleted_at is null do nothing;
    if found then total := total + 1; end if;
  end loop;
  return total;
end;
$$;

grant execute on function public.log_habit(uuid, date, text, numeric, integer, text, text, text, text[], text, text, text, text, timestamptz) to authenticated;
grant execute on function public.log_habits_from_module(text, text, date, jsonb, text) to authenticated;
revoke execute on function public.log_habit(uuid, date, text, numeric, integer, text, text, text, text[], text, text, text, text, timestamptz) from anon, public;
revoke execute on function public.log_habits_from_module(text, text, date, jsonb, text) from anon, public;

-- "Recomeçar do zero" também apaga as rotinas (e, em cascata, o que depende delas).
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
    'agenda_sync_outbox', 'google_oauth_pending', 'google_oauth_states',
    'google_calendar_connections',
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
    'agent_inbox_items', 'push_subscriptions',
    'habit_reflections', 'habit_chains', 'habit_reminders', 'habit_timers', 'habit_pauses',
    'habit_logs', 'habit_versions', 'habits',
    'reminders',
    'execution_history', 'routine_links', 'executions', 'routines',
    'agenda_series', 'agenda_labels',
    'subtasks', 'steps', 'goals', 'hydration_logs', 'profiles'
  ] loop
    execute format('delete from public.%I where user_id = $1', table_name) using account_id;
  end loop;
end;
$$;

commit;
