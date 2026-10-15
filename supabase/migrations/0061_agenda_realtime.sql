-- Agenda em tempo real.
--
-- O app passa a ouvir as mudanças da própria pessoa (RLS continua valendo no
-- Realtime): quando algo muda no Norte, envia ao Google na hora; quando o servidor
-- grava o que veio do Google, a tela se atualiza sem precisar sair e voltar.
-- google_calendar_connections muda a cada sincronização (syncing → idle) e serve de
-- aviso de "terminou de sincronizar" — inclusive quando o Google apagou algo.

do $$
declare
  t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  foreach t in array array['executions', 'agenda_series', 'agenda_series_exceptions', 'google_calendar_connections']
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
