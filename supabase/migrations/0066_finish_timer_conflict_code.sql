-- Corrige 0065: SQLSTATE 40001 (serialization_failure) faz o PostgREST tentar de
-- novo e a chamada termina em 504. Conflito de revisão agora usa PT409 (HTTP 409).
begin;

create or replace function public.finish_habit_timer(
  p_timer uuid, p_revision integer, p_date date, p_value numeric, p_duration integer,
  p_time_zone text default null, p_occurred_at timestamptz default now()
) returns public.habit_logs
language plpgsql security invoker set search_path = public as $$
declare t public.habit_timers; l public.habit_logs;
begin
  select * into t from public.habit_timers where id = p_timer and user_id = auth.uid() for update;
  if not found then
    select * into l from public.habit_logs
     where user_id = auth.uid() and idempotency_key = 'timer:' || p_timer;
    if found then return l; end if;
    raise exception 'timer_not_found' using errcode = 'PT404';
  end if;
  if t.revision <> p_revision then
    raise exception 'timer_changed' using errcode = 'PT409';
  end if;
  l := public.log_habit(t.habit_id, p_date, 'recorded', p_value, p_duration, '', null, null, '{}',
                        'timer', null, 'timer:' || p_timer, p_time_zone, p_occurred_at);
  delete from public.habit_timers where id = p_timer;
  return l;
end;
$$;

commit;
