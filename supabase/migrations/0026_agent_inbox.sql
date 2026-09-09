-- Caixa Norte — captura universal do Agente Norte: qualquer frase que ainda não
-- pertence claramente a um domínio (ideia, pendência, promessa, "lembrar depois")
-- entra aqui sem forçar classificação na hora. Revisão/organização acontece depois,
-- nunca no momento da captura. Mesmo padrão de RLS "hardened" da 0013/0015.

create table agent_inbox_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  content text not null,
  source text not null default 'agente' check (source in ('agente', 'app')),
  resolved boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index agent_inbox_items_user_id_idx on agent_inbox_items (user_id);
create index agent_inbox_items_user_pending_idx on agent_inbox_items (user_id, resolved);

create trigger agent_inbox_items_set_updated_at before update on agent_inbox_items
  for each row execute function set_updated_at();

alter table agent_inbox_items enable row level security;
create policy agent_inbox_items_owner_access on agent_inbox_items
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
