-- Norte Admin — Etapa 0 (fundamentos): identidade administrativa, auditoria e o
-- ledger real de consumo de IA. Escopo desta migration: só o que não depende de
-- nenhuma credencial externa ainda não confirmada (gateway de cobrança, provedor
-- de mensageria) — essas partes ficam para uma etapa seguinte, propositalmente.
--
-- is_admin() é o único jeito de conceder acesso administrativo: nunca por e-mail
-- fixo no código nem por campo de perfil editável pelo usuário comum (regra
-- explícita do documento de arquitetura). A tabela precisa existir antes da
-- função, porque funções `language sql` são validadas contra o catálogo já
-- na criação (diferente de plpgsql, que só resolve nomes em tempo de execução).

-- ---------------------------------------------------------------------------
-- Identidade administrativa
-- ---------------------------------------------------------------------------

create table admin_memberships (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role text not null check (
    role in ('owner', 'financeiro', 'sucesso_cliente', 'marketing', 'produto', 'engenharia', 'auditor')
  ),
  status text not null default 'active' check (status in ('active', 'suspended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger admin_memberships_set_updated_at before update on admin_memberships
  for each row execute function set_updated_at();

create or replace function is_admin()
returns boolean
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select exists (
    select 1 from admin_memberships m
    where m.user_id = (select auth.uid()) and m.status = 'active'
  );
$$;

alter table admin_memberships enable row level security;
-- Só admin ativo lê a lista de membros; ninguém se autopromove por aqui — escrita
-- fica restrita ao service role (console/servidor), não a este RLS de leitura.
create policy admin_memberships_admin_read on admin_memberships
  for select using (is_admin());

-- ---------------------------------------------------------------------------
-- Clientes (visão administrativa) — espelha auth.users automaticamente, nunca
-- exige o app criar isso na mão. E-mail não é chave; auth_user_id é.
-- ---------------------------------------------------------------------------

create table customers (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table customers enable row level security;
create policy customers_admin_read on customers
  for select using (is_admin());

create or replace function sync_customer_from_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into customers (auth_user_id) values (new.id)
  on conflict (auth_user_id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created_sync_customer
  after insert on auth.users
  for each row execute function sync_customer_from_auth_user();

-- Retrocompatibilidade: usuários que já existiam antes desta migration.
insert into customers (auth_user_id)
select id from auth.users
on conflict (auth_user_id) do nothing;

-- ---------------------------------------------------------------------------
-- Auditoria — toda ação administrativa relevante registra ator, alvo e motivo.
-- ---------------------------------------------------------------------------

create table audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users (id),
  action text not null,
  target text,
  reason text,
  changes jsonb,
  origin text,
  correlation_id text,
  created_at timestamptz not null default now()
);

create index audit_logs_created_at_idx on audit_logs (created_at desc);

alter table audit_logs enable row level security;
create policy audit_logs_admin_read on audit_logs
  for select using (is_admin());
-- Qualquer usuário autenticado pode inserir sua própria linha de auditoria
-- (o servidor grava em nome de quem agiu); ninguém edita ou apaga depois.
create policy audit_logs_self_insert on audit_logs
  for insert with check ((select auth.uid()) = actor_user_id);

-- ---------------------------------------------------------------------------
-- Economia da IA — trilha real por tentativa. Resolve a lacuna concreta:
-- agentStep hoje descarta usage/custo da resposta da OpenAI.
-- ---------------------------------------------------------------------------

create table ai_attempts (
  id uuid primary key default gen_random_uuid(),
  request_id text not null unique,
  user_id uuid not null references auth.users (id) on delete cascade,
  feature text not null check (feature in ('agent_chat', 'transcription')),
  provider text not null default 'openai',
  model text not null,
  status text not null check (status in ('succeeded', 'failed', 'pending')),
  started_at timestamptz not null,
  finished_at timestamptz,
  latency_ms integer,
  environment text not null default 'production',
  error_message text,
  created_at timestamptz not null default now()
);

create index ai_attempts_user_id_idx on ai_attempts (user_id);
create index ai_attempts_created_at_idx on ai_attempts (created_at desc);

alter table ai_attempts enable row level security;
create policy ai_attempts_admin_read on ai_attempts
  for select using (is_admin());
create policy ai_attempts_self_insert on ai_attempts
  for insert with check ((select auth.uid()) = user_id);

create table ai_usage_components (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references ai_attempts (id) on delete cascade,
  unit text not null,
  quantity numeric not null,
  cost_usd numeric(14, 8),
  created_at timestamptz not null default now()
);

create index ai_usage_components_attempt_id_idx on ai_usage_components (attempt_id);

alter table ai_usage_components enable row level security;
create policy ai_usage_components_admin_read on ai_usage_components
  for select using (is_admin());
-- Escrita segue o dono da tentativa (o servidor grava com o token da própria
-- pessoa, do jeito que o resto do app já faz — sem service_role em lugar nenhum).
create policy ai_usage_components_owner_insert on ai_usage_components
  for insert with check (
    exists (
      select 1 from ai_attempts a
      where a.id = attempt_id and a.user_id = (select auth.uid())
    )
  );

create table model_price_versions (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  model text not null,
  unit text not null,
  price_per_unit_usd numeric(14, 8) not null,
  unit_size numeric not null default 1000000,
  effective_from timestamptz not null default now(),
  effective_to timestamptz,
  created_at timestamptz not null default now()
);

create index model_price_versions_lookup_idx on model_price_versions (provider, model, unit, effective_from desc);

alter table model_price_versions enable row level security;
create policy model_price_versions_admin_all on model_price_versions
  for all using (is_admin()) with check (is_admin());

-- Nenhum preço é semeado aqui de propósito — o documento de arquitetura é
-- explícito: não inventar dado real de tarifa. Cadastrar em /admin/ia depois de
-- confirmar os valores vigentes no painel do provedor.
