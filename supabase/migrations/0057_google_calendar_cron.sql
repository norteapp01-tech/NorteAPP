-- Verificação periódica do Google Agenda.
--
-- A cada 5 minutos o banco chama a função `google-calendar-cron`, que
-- sincroniza as conexões ativas (cobre webhooks perdidos e renova canais).
-- O segredo da chamada vive só em `google_sync_internal`; a função o confere
-- contra a mesma linha. Se ninguém tem o Google conectado, não há chamada.

create extension if not exists pg_net;
create extension if not exists pg_cron;

create or replace function public.google_sync_cron_tick()
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_secret text;
begin
  if not exists (
    select 1 from public.google_calendar_connections c where c.status = 'active'
  ) then
    return;
  end if;
  select cron_secret into v_secret from public.google_sync_internal limit 1;
  perform net.http_post(
    url := 'https://yorlxyoixeeqlcjrwasf.supabase.co/functions/v1/google-calendar-cron',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', v_secret),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
end;
$$;

revoke all on function public.google_sync_cron_tick() from public, anon, authenticated;

select cron.unschedule('google-calendar-sync')
where exists (select 1 from cron.job where jobname = 'google-calendar-sync');
select cron.schedule('google-calendar-sync', '*/5 * * * *', $$select public.google_sync_cron_tick()$$);
