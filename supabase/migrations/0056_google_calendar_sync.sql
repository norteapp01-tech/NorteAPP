-- Agenda — Fase 2: integração bidirecional com o Google Agenda.
--
-- Princípios
--  * Tokens do Google NUNCA chegam ao navegador: ficam criptografados (AES-GCM,
--    feita na Edge Function) em tabela SEM nenhuma policy — só a service role lê.
--  * O navegador só LÊ o que precisa para desenhar a tela (conta, agendas,
--    estado, conflitos). Toda escrita passa por Edge Functions.
--  * `agenda_external_links` liga cada evento/série do Norte a um evento do
--    Google, guardando etag e um hash do último conteúdo sincronizado. É o hash
--    que impede ciclos (eco do que o próprio Norte enviou) e detecta conflito.
--  * Mudanças locais viram linhas em `agenda_sync_outbox` por trigger; quem
--    envia ao Google é a Edge Function (por webhook, por cron e sob demanda).
--  * Agenda somente leitura do Google é espelhada no Norte e protegida contra
--    edição inclusive no banco.

begin;

-- ---------------------------------------------------------------------------
-- Conexão com a conta Google (uma por pessoa)
-- ---------------------------------------------------------------------------
create table public.google_calendar_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique default auth.uid() references auth.users (id) on delete cascade,
  google_account_id text not null,
  google_email text not null,
  status text not null default 'active'
    check (status in ('active', 'needs_reauth', 'revoked', 'error')),
  sync_state text not null default 'idle' check (sync_state in ('idle', 'syncing', 'error')),
  -- Fuso em que as datas "ingênuas" do Norte são lidas (o do perfil, ou o do aparelho).
  time_zone text not null default 'America/Sao_Paulo',
  -- Rotinas do Norte (academia, esportes…) só vão ao Google se a pessoa pedir.
  push_routines boolean not null default false,
  scopes text[] not null default '{}',
  last_sync_at timestamptz,
  last_error text,
  last_error_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger google_calendar_connections_set_updated_at
  before update on public.google_calendar_connections
  for each row execute function set_updated_at();

-- Tokens: criptografados e isolados. Sem policy = ninguém além da service role.
create table public.google_calendar_tokens (
  connection_id uuid primary key references public.google_calendar_connections (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  access_token_enc text not null,
  refresh_token_enc text,
  expires_at timestamptz,
  updated_at timestamptz not null default now()
);

-- Estados do OAuth (anti-CSRF): cada `state` vale uma vez e expira.
create table public.google_oauth_states (
  nonce text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  app_origin text not null,
  created_at timestamptz not null default now(),
  used_at timestamptz
);

-- Depois do consentimento, os tokens esperam aqui até o navegador da MESMA
-- pessoa, já autenticado no Norte, confirmar com o bilhete (ticket).
create table public.google_oauth_pending (
  ticket text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  google_account_id text not null,
  google_email text not null,
  scopes text[] not null default '{}',
  access_token_enc text not null,
  refresh_token_enc text,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Agendas do Google
-- ---------------------------------------------------------------------------
create table public.google_calendars (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references public.google_calendar_connections (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  google_calendar_id text not null,
  summary text not null,
  description text,
  time_zone text,
  background_color text,
  foreground_color text,
  access_role text not null check (access_role in ('owner', 'writer', 'reader', 'freeBusyReader')),
  is_primary boolean not null default false,
  selected boolean not null default false,
  -- Onde nascem os eventos criados no Norte. No máximo uma por conexão.
  push_new_events boolean not null default false,
  sync_status text not null default 'idle'
    check (sync_status in ('idle', 'syncing', 'error', 'needs_full_sync')),
  last_synced_at timestamptz,
  last_error text,
  webhook_status text not null default 'off' check (webhook_status in ('off', 'active', 'unavailable')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (connection_id, google_calendar_id)
);
create index google_calendars_user_id_idx on public.google_calendars (user_id);
create unique index google_calendars_one_push_target_uidx
  on public.google_calendars (connection_id) where push_new_events;
create trigger google_calendars_set_updated_at before update on public.google_calendars
  for each row execute function set_updated_at();

-- O `syncToken` é opaco e só serve ao servidor.
create table public.google_calendar_sync_state (
  calendar_id uuid primary key references public.google_calendars (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  sync_token text,
  full_sync_at timestamptz,
  updated_at timestamptz not null default now()
);

-- Canais de webhook (push notifications do Google). Guardamos só o HASH do
-- token de verificação; o valor em claro só existe no cabeçalho de cada chamada.
create table public.google_calendar_channels (
  id text primary key,
  calendar_id uuid not null references public.google_calendars (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  resource_id text,
  token_hash text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  stopped_at timestamptz
);
create index google_calendar_channels_calendar_idx on public.google_calendar_channels (calendar_id);

-- Histórico de execuções da sincronização (diagnóstico e erros visíveis).
create table public.google_calendar_sync_runs (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references public.google_calendar_connections (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  trigger text not null check (trigger in ('initial', 'manual', 'webhook', 'cron', 'push')),
  status text not null default 'running' check (status in ('running', 'ok', 'error')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  stats jsonb not null default '{}'::jsonb,
  error text
);
create index google_calendar_sync_runs_conn_idx
  on public.google_calendar_sync_runs (connection_id, started_at desc);

-- ---------------------------------------------------------------------------
-- Vínculos Norte ↔ Google (tabela criada na Fase 1, agora completa)
-- ---------------------------------------------------------------------------
alter table public.agenda_external_links
  add column connection_id uuid references public.google_calendar_connections (id) on delete cascade,
  add column calendar_id uuid references public.google_calendars (id) on delete cascade,
  -- event = compromisso simples; series = mestre recorrente; instance = exceção de uma série
  add column kind text not null default 'event' check (kind in ('event', 'series', 'instance')),
  -- Qual sessão do compromisso este evento representa (um compromisso do Norte pode ter várias).
  add column session_key text,
  -- Instância: início ORIGINAL da ocorrência na série (data ou data-hora).
  add column original_start text,
  -- Hash do último conteúdo em que os dois lados concordaram.
  add column synced_hash text,
  add column remote_snapshot jsonb,
  add column local_snapshot jsonb,
  add column conflict_at timestamptz,
  add column remote_deleted boolean not null default false,
  add column last_error text,
  -- Evento que vem de agenda somente leitura ou que o Norte não consegue representar por inteiro.
  add column read_only_reason text;

create unique index agenda_external_links_local_uidx
  on public.agenda_external_links (execution_id, coalesce(session_key, ''), calendar_id)
  where execution_id is not null;
create unique index agenda_external_links_series_uidx
  on public.agenda_external_links (series_id, calendar_id)
  where series_id is not null and kind = 'series';
create index agenda_external_links_calendar_idx on public.agenda_external_links (calendar_id);
create index agenda_external_links_conflict_idx
  on public.agenda_external_links (user_id) where sync_state = 'conflict';

-- ---------------------------------------------------------------------------
-- Fila de saída: mudanças do Norte a enviar ao Google
-- ---------------------------------------------------------------------------
create table public.agenda_sync_outbox (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  entity_type text not null check (entity_type in ('execution', 'series')),
  entity_id uuid not null,
  op text not null check (op in ('upsert', 'delete')),
  -- Para `delete`: os vínculos que existiam (a linha local já não existe).
  snapshot jsonb,
  attempts int not null default 0,
  last_error text,
  created_at timestamptz not null default now()
);
create unique index agenda_sync_outbox_entity_uidx
  on public.agenda_sync_outbox (entity_type, entity_id, op);
create index agenda_sync_outbox_user_idx on public.agenda_sync_outbox (user_id, created_at);

-- Segredo do cron, só no banco: a função de cron o confere contra esta linha.
create table public.google_sync_internal (
  singleton boolean primary key default true check (singleton),
  cron_secret text not null default encode(gen_random_bytes(24), 'hex')
);
insert into public.google_sync_internal default values;

-- ---------------------------------------------------------------------------
-- Triggers: o que muda no Norte entra na fila (só para quem conectou o Google)
-- ---------------------------------------------------------------------------
create or replace function public.agenda_outbox_enqueue()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid;
  v_kind text;
  v_entity uuid;
  v_links jsonb;
begin
  if tg_table_name = 'executions' then
    v_kind := 'execution';
    v_entity := case when tg_op = 'DELETE' then old.id else new.id end;
    v_uid := case when tg_op = 'DELETE' then old.user_id else new.user_id end;
  elsif tg_table_name = 'agenda_series' then
    v_kind := 'series';
    v_entity := case when tg_op = 'DELETE' then old.id else new.id end;
    v_uid := case when tg_op = 'DELETE' then old.user_id else new.user_id end;
  else -- agenda_series_exceptions: mudar uma exceção muda a série mestre
    v_kind := 'series';
    v_entity := case when tg_op = 'DELETE' then old.series_id else new.series_id end;
    v_uid := case when tg_op = 'DELETE' then old.user_id else new.user_id end;
  end if;

  if not exists (
    select 1 from public.google_calendar_connections c
    where c.user_id = v_uid and c.status = 'active'
  ) then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if tg_op = 'DELETE' and tg_table_name <> 'agenda_series_exceptions' then
    select coalesce(jsonb_agg(to_jsonb(l)), '[]'::jsonb) into v_links
    from public.agenda_external_links l
    where (v_kind = 'execution' and l.execution_id = old.id)
       or (v_kind = 'series' and l.series_id = old.id);
    if jsonb_array_length(v_links) > 0 then
      insert into public.agenda_sync_outbox (user_id, entity_type, entity_id, op, snapshot)
      values (v_uid, v_kind, v_entity, 'delete', v_links)
      on conflict (entity_type, entity_id, op)
      do update set snapshot = excluded.snapshot, created_at = now(), attempts = 0;
    end if;
    return old;
  end if;

  insert into public.agenda_sync_outbox (user_id, entity_type, entity_id, op)
  values (v_uid, v_kind, v_entity, 'upsert')
  on conflict (entity_type, entity_id, op)
  do update set created_at = now(), attempts = 0, last_error = null;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger executions_outbox_upsert after insert or update on public.executions
  for each row execute function public.agenda_outbox_enqueue();
create trigger executions_outbox_delete before delete on public.executions
  for each row execute function public.agenda_outbox_enqueue();
create trigger agenda_series_outbox_upsert after insert or update on public.agenda_series
  for each row execute function public.agenda_outbox_enqueue();
create trigger agenda_series_outbox_delete before delete on public.agenda_series
  for each row execute function public.agenda_outbox_enqueue();
create trigger agenda_series_exceptions_outbox after insert or delete on public.agenda_series_exceptions
  for each row execute function public.agenda_outbox_enqueue();

-- ---------------------------------------------------------------------------
-- Agenda somente leitura: ninguém além do servidor altera ou apaga
-- ---------------------------------------------------------------------------
create or replace function public.agenda_guard_read_only()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  blocked boolean;
begin
  if coalesce(auth.role(), current_user) in ('service_role', 'postgres', 'supabase_admin') then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  select exists (
    select 1 from public.agenda_external_links l
    where l.read_only_reason is not null
      and ((tg_table_name = 'executions' and l.execution_id = old.id)
        or (tg_table_name = 'agenda_series' and l.series_id = old.id))
  ) or exists (
    select 1 from public.agenda_external_links l
    where l.access_role = 'read'
      and ((tg_table_name = 'executions' and l.execution_id = old.id)
        or (tg_table_name = 'agenda_series' and l.series_id = old.id))
  ) into blocked;
  if blocked then
    raise exception 'Este evento vem de uma agenda do Google somente leitura e não pode ser alterado no Norte.'
      using errcode = '42501';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger executions_read_only_guard before update or delete on public.executions
  for each row execute function public.agenda_guard_read_only();
create trigger agenda_series_read_only_guard before update or delete on public.agenda_series
  for each row execute function public.agenda_guard_read_only();

-- ---------------------------------------------------------------------------
-- RLS e permissões: o navegador só lê; segredos e fila ficam só no servidor.
-- ---------------------------------------------------------------------------
alter table public.google_calendar_connections enable row level security;
alter table public.google_calendar_tokens enable row level security;
alter table public.google_oauth_states enable row level security;
alter table public.google_oauth_pending enable row level security;
alter table public.google_calendars enable row level security;
alter table public.google_calendar_sync_state enable row level security;
alter table public.google_calendar_channels enable row level security;
alter table public.google_calendar_sync_runs enable row level security;
alter table public.agenda_sync_outbox enable row level security;
alter table public.google_sync_internal enable row level security;

revoke all on table
  public.google_calendar_connections,
  public.google_calendar_tokens,
  public.google_oauth_states,
  public.google_oauth_pending,
  public.google_calendars,
  public.google_calendar_sync_state,
  public.google_calendar_channels,
  public.google_calendar_sync_runs,
  public.agenda_sync_outbox,
  public.google_sync_internal
from anon, authenticated;

-- Vínculos: a Fase 1 deixou uma policy "for all". Agora só leitura para a pessoa.
drop policy if exists agenda_external_links_owner_access on public.agenda_external_links;
revoke insert, update, delete on table public.agenda_external_links from anon, authenticated;

grant select on table public.google_calendar_connections to authenticated;
grant select on table public.google_calendars to authenticated;
grant select on table public.google_calendar_sync_runs to authenticated;
grant select on table public.agenda_external_links to authenticated;

create policy google_calendar_connections_owner_read on public.google_calendar_connections
  for select to authenticated using ((select auth.uid()) = user_id);
create policy google_calendars_owner_read on public.google_calendars
  for select to authenticated using ((select auth.uid()) = user_id);
create policy google_calendar_sync_runs_owner_read on public.google_calendar_sync_runs
  for select to authenticated using ((select auth.uid()) = user_id);
create policy agenda_external_links_owner_read on public.agenda_external_links
  for select to authenticated using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- "Recomeçar do zero" também precisa limpar o que a integração criou.
-- (Os tokens saem junto, em cascata, com a conexão.)
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
