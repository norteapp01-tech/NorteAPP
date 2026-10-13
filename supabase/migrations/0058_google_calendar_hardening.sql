-- Google Agenda — robustez operacional da sincronização.
--
--  * falhas de envio deixam de sumir silenciosamente depois de cinco tentativas;
--  * a conexão expõe um resumo seguro das pendências para a interface;
--  * o cron guarda um cursor para não favorecer sempre as primeiras pessoas;
--  * alterações em exceções de recorrência também entram na fila.

begin;

alter table public.google_calendar_connections
  add column pending_sync_errors integer not null default 0,
  add column last_push_error text;

alter table public.agenda_sync_outbox
  add column next_attempt_at timestamptz,
  add column failed_at timestamptz;

create index agenda_sync_outbox_retry_idx
  on public.agenda_sync_outbox (user_id, next_attempt_at, created_at);

alter table public.google_sync_internal
  add column cron_cursor uuid references public.google_calendar_connections (id) on delete set null;

-- Substitui a versão da Fase 2 para que uma nova mudança local também reative
-- um item que estava em espera por falha anterior.
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
  else
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
      do update set
        snapshot = excluded.snapshot,
        created_at = now(),
        attempts = 0,
        last_error = null,
        next_attempt_at = null,
        failed_at = null;
    end if;
    return old;
  end if;

  insert into public.agenda_sync_outbox (user_id, entity_type, entity_id, op)
  values (v_uid, v_kind, v_entity, 'upsert')
  on conflict (entity_type, entity_id, op)
  do update set
    created_at = now(),
    attempts = 0,
    last_error = null,
    next_attempt_at = null,
    failed_at = null;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists agenda_series_exceptions_outbox on public.agenda_series_exceptions;
create trigger agenda_series_exceptions_outbox
  after insert or update or delete on public.agenda_series_exceptions
  for each row execute function public.agenda_outbox_enqueue();

commit;
