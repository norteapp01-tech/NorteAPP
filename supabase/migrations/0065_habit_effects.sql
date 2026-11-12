-- Efeitos de rotinas: encadeamento sem duplicar, lembretes por horário, troca
-- atômica de lembretes, encerramento atômico do timer, sincronização de módulos
-- que também propaga edições, e preferências de rotinas (horário silencioso).
-- Aditiva: não remove nem reescreve dados existentes.

begin;

-- 1) Identidade dos lembretes gerados por rotinas ----------------------------
alter table public.reminders
  add column if not exists habit_chain_id uuid references public.habit_chains (id) on delete cascade,
  add column if not exists source_log_id uuid references public.habit_logs (id) on delete cascade,
  add column if not exists habit_reminder_id uuid references public.habit_reminders (id) on delete cascade;

-- Mesma origem + mesmo encadeamento + mesma data de destino = um lembrete só.
create unique index if not exists reminders_chain_event_uidx
  on public.reminders (habit_chain_id, source_log_id, habit_occurrence_date)
  where origin = 'habit_chain' and habit_chain_id is not null and source_log_id is not null;
-- Um lembrete por configuração e ocorrência.
create unique index if not exists reminders_habit_reminder_uidx
  on public.reminders (habit_reminder_id, habit_occurrence_date)
  where origin = 'habit_reminder' and habit_reminder_id is not null;

-- 2) Troca atômica dos lembretes de uma rotina -------------------------------
create or replace function public.set_habit_reminders(p_habit uuid, p_items jsonb)
returns setof public.habit_reminders
language plpgsql security invoker set search_path = public as $$
begin
  if jsonb_typeof(p_items) <> 'array' then
    raise exception 'p_items deve ser uma lista';
  end if;
  if not exists (select 1 from public.habits where id = p_habit and user_id = auth.uid()) then
    raise exception 'Rotina não encontrada';
  end if;
  -- Tudo numa transação: se qualquer item for inválido, nada muda.
  delete from public.habit_reminders where habit_id = p_habit and user_id = auth.uid();
  return query
    insert into public.habit_reminders (habit_id, time, weekdays, enabled)
    select p_habit, i ->> 'time',
           coalesce(array(select jsonb_array_elements_text(i -> 'weekdays'))::integer[], '{0,1,2,3,4,5,6}'),
           coalesce((i ->> 'enabled')::boolean, true)
    from jsonb_array_elements(p_items) i
    returning *;
end;
$$;

-- 3) Cancelar o que um registro gerou (desfazer/editar) ----------------------
-- Devolve quantos lembretes pendentes saíram e quantos JÁ tinham sido entregues
-- (esses não têm como ser "desenviados").
create or replace function public.cancel_habit_effects(p_log uuid)
returns table (cancelled integer, already_sent integer)
language plpgsql security invoker set search_path = public as $$
declare c integer; s integer;
begin
  select count(*) into s from public.reminders
   where source_log_id = p_log and user_id = auth.uid() and notified_at is not null;
  with d as (
    delete from public.reminders
     where source_log_id = p_log and user_id = auth.uid() and notified_at is null
    returning 1)
  select count(*) into c from d;
  return query select c, s;
end;
$$;

-- 4) Encerrar o timer e gravar o registro numa única transação ---------------
create or replace function public.finish_habit_timer(
  p_timer uuid, p_revision integer, p_date date, p_value numeric, p_duration integer,
  p_time_zone text default null, p_occurred_at timestamptz default now()
) returns public.habit_logs
language plpgsql security invoker set search_path = public as $$
declare t public.habit_timers; l public.habit_logs;
begin
  select * into t from public.habit_timers where id = p_timer and user_id = auth.uid() for update;
  if not found then
    -- Já encerrado (outro aparelho ou repetição): devolve o registro que ele gerou.
    select * into l from public.habit_logs
     where user_id = auth.uid() and idempotency_key = 'timer:' || p_timer;
    if found then return l; end if;
    raise exception 'timer_not_found' using errcode = 'P0002';
  end if;
  if t.revision <> p_revision then
    raise exception 'timer_changed' using errcode = '40001';
  end if;
  l := public.log_habit(t.habit_id, p_date, 'recorded', p_value, p_duration, '', null, null, '{}',
                        'timer', null, 'timer:' || p_timer, p_time_zone, p_occurred_at);
  delete from public.habit_timers where id = p_timer;
  return l;
end;
$$;

-- 5) Módulos: devolve os registros (para os mesmos efeitos do registro manual)
--    e propaga edição da origem (valor/data) em vez de ignorar.
create or replace function public.sync_module_habits(
  p_module text, p_ref text, p_date date, p_metrics jsonb, p_time_zone text default null
) returns setof public.habit_logs
language plpgsql security invoker set search_path = public as $$
declare h record; amount numeric;
begin
  for h in
    select id, module_metric from public.habits
    where user_id = auth.uid() and module = p_module and archived_at is null
  loop
    amount := coalesce((p_metrics ->> h.module_metric)::numeric, 0);
    if amount <= 0 then
      -- a origem foi editada para zero: o registro derivado sai
      update public.habit_logs set deleted_at = now()
       where habit_id = h.id and source_ref = p_module || ':' || p_ref and deleted_at is null;
      continue;
    end if;
    return query
      insert into public.habit_logs (habit_id, local_date, status, value, duration_seconds, source, source_ref, time_zone)
      values (h.id, p_date, 'recorded', amount,
              case when h.module_metric = 'minutes' then round(amount * 60)::integer else null end,
              'module', p_module || ':' || p_ref, p_time_zone)
      on conflict (habit_id, source_ref) where source_ref is not null and deleted_at is null
      do update set value = excluded.value, local_date = excluded.local_date,
                    duration_seconds = excluded.duration_seconds
      returning *;
  end loop;
end;
$$;

-- 6) Preferências de rotinas --------------------------------------------------
create table if not exists public.habit_settings (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  quiet_start text check (quiet_start is null or quiet_start ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  quiet_end text check (quiet_end is null or quiet_end ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  -- {"morning":["05:00","12:00"],"afternoon":["12:00","18:00"],"evening":["18:00","23:59"]}
  day_parts jsonb check (day_parts is null or jsonb_typeof(day_parts) = 'object'),
  briefing_time text check (briefing_time is null or briefing_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  closing_time text check (closing_time is null or closing_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  updated_at timestamptz not null default now()
);
create trigger habit_settings_set_updated_at before update on public.habit_settings
  for each row execute function public.set_updated_at();
alter table public.habit_settings enable row level security;
revoke all on public.habit_settings from anon;
grant select, insert, update, delete on public.habit_settings to authenticated;
create policy habit_settings_owner on public.habit_settings for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

grant execute on function public.set_habit_reminders(uuid, jsonb) to authenticated;
grant execute on function public.cancel_habit_effects(uuid) to authenticated;
grant execute on function public.finish_habit_timer(uuid, integer, date, numeric, integer, text, timestamptz) to authenticated;
grant execute on function public.sync_module_habits(text, text, date, jsonb, text) to authenticated;
revoke execute on function public.set_habit_reminders(uuid, jsonb) from anon, public;
revoke execute on function public.cancel_habit_effects(uuid) from anon, public;
revoke execute on function public.finish_habit_timer(uuid, integer, date, numeric, integer, text, timestamptz) from anon, public;
revoke execute on function public.sync_module_habits(text, text, date, jsonb, text) from anon, public;

commit;
