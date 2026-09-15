-- Reestruturação do Norte Admin: RBAC real no banco (não só menu escondido),
-- papel "relacionamento" (era sucesso_cliente), e as tabelas/funções que dão
-- suporte a Clientes (tendência), Produto (adoção por domínio), Financeiro
-- (orçamento e fechamento de mês) e Relatórios (snapshot versionado).

-- ---------------------------------------------------------------------------
-- Papel: sucesso_cliente -> relacionamento (alinha com a nova aba)
-- ---------------------------------------------------------------------------
alter table admin_memberships drop constraint admin_memberships_role_check;
update admin_memberships set role = 'relacionamento' where role = 'sucesso_cliente';
alter table admin_memberships add constraint admin_memberships_role_check
  check (role in ('owner', 'financeiro', 'relacionamento', 'marketing', 'produto', 'engenharia', 'auditor'));

-- ---------------------------------------------------------------------------
-- RBAC real: has_admin_role(papéis[]) — is_admin() continua existindo pra
-- "é admin de algum tipo"; isso aqui é "é admin com um destes papéis
-- específicos". Mesmo padrão security definer de is_admin()/admin_list_users.
-- ---------------------------------------------------------------------------
create or replace function has_admin_role(allowed_roles text[])
returns boolean
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select exists (
    select 1 from admin_memberships m
    where m.user_id = auth.uid()
      and m.status = 'active'
      and m.role = any(allowed_roles)
  );
$$;
revoke all on function has_admin_role(text[]) from public;
grant execute on function has_admin_role(text[]) to authenticated;

-- ---------------------------------------------------------------------------
-- Aperta RLS de is_admin() genérico pra has_admin_role([...]) nas tabelas
-- sensíveis. Financeiro e economia de IA: só quem de fato mexe com isso.
-- Campanhas/cupons: só quem cuida de relacionamento com cliente.
-- admin_memberships: só owner concede/edita acesso administrativo — hoje
-- qualquer admin podia, é permissivo demais.
-- ---------------------------------------------------------------------------
drop policy admin_memberships_admin_write on admin_memberships;
create policy admin_memberships_admin_write on admin_memberships
  for insert with check (has_admin_role(array['owner']));
drop policy admin_memberships_admin_update on admin_memberships;
create policy admin_memberships_admin_update on admin_memberships
  for update using (has_admin_role(array['owner'])) with check (has_admin_role(array['owner']));

drop policy company_accounts_admin_all on company_accounts;
create policy company_accounts_admin_all on company_accounts for all
  using (has_admin_role(array['owner', 'financeiro', 'produto', 'engenharia']))
  with check (has_admin_role(array['owner', 'financeiro', 'produto', 'engenharia']));

drop policy vendors_admin_all on vendors;
create policy vendors_admin_all on vendors for all
  using (has_admin_role(array['owner', 'financeiro', 'produto', 'engenharia']))
  with check (has_admin_role(array['owner', 'financeiro', 'produto', 'engenharia']));

drop policy cost_centers_admin_all on cost_centers;
create policy cost_centers_admin_all on cost_centers for all
  using (has_admin_role(array['owner', 'financeiro', 'produto', 'engenharia']))
  with check (has_admin_role(array['owner', 'financeiro', 'produto', 'engenharia']));

drop policy expense_entries_admin_all on expense_entries;
create policy expense_entries_admin_all on expense_entries for all
  using (has_admin_role(array['owner', 'financeiro', 'produto', 'engenharia']))
  with check (has_admin_role(array['owner', 'financeiro', 'produto', 'engenharia']));

drop policy receivable_entries_admin_all on receivable_entries;
create policy receivable_entries_admin_all on receivable_entries for all
  using (has_admin_role(array['owner', 'financeiro', 'produto', 'engenharia']))
  with check (has_admin_role(array['owner', 'financeiro', 'produto', 'engenharia']));

drop policy payroll_entries_admin_all on payroll_entries;
create policy payroll_entries_admin_all on payroll_entries for all
  using (has_admin_role(array['owner', 'financeiro', 'produto', 'engenharia']))
  with check (has_admin_role(array['owner', 'financeiro', 'produto', 'engenharia']));

drop policy ai_attempts_admin_read on ai_attempts;
create policy ai_attempts_admin_read on ai_attempts
  for select using (has_admin_role(array['owner', 'financeiro', 'produto', 'engenharia']));

drop policy ai_usage_components_admin_read on ai_usage_components;
create policy ai_usage_components_admin_read on ai_usage_components
  for select using (has_admin_role(array['owner', 'financeiro', 'produto', 'engenharia']));

drop policy model_price_versions_admin_all on model_price_versions;
create policy model_price_versions_admin_all on model_price_versions for all
  using (has_admin_role(array['owner', 'financeiro', 'produto', 'engenharia']))
  with check (has_admin_role(array['owner', 'financeiro', 'produto', 'engenharia']));

drop policy campaigns_admin_all on campaigns;
create policy campaigns_admin_all on campaigns for all
  using (has_admin_role(array['owner', 'relacionamento', 'marketing']))
  with check (has_admin_role(array['owner', 'relacionamento', 'marketing']));

drop policy coupons_admin_all on coupons;
create policy coupons_admin_all on coupons for all
  using (has_admin_role(array['owner', 'relacionamento', 'marketing']))
  with check (has_admin_role(array['owner', 'relacionamento', 'marketing']));

-- ---------------------------------------------------------------------------
-- Tendência de uso por cliente — mesma ideia de admin_customer_activity, mas
-- contando eventos em duas janelas (0-14d e 15-28d) numa passada só, sem N+1
-- por cliente. Alimenta a coluna "tendência" em Clientes.
-- ---------------------------------------------------------------------------
create or replace function admin_customer_activity_windowed()
returns table (customer_id uuid, auth_user_id uuid, recent_count bigint, prior_count bigint)
language plpgsql
security definer
set search_path = public, pg_temp
stable
as $$
begin
  if not is_admin() then
    return;
  end if;
  return query
  select
    c.id,
    c.auth_user_id,
    (
      (select count(*) from goals g where g.user_id = c.auth_user_id and g.created_at >= now() - interval '14 days') +
      (select count(*) from executions e where e.user_id = c.auth_user_id and e.created_at >= now() - interval '14 days') +
      (select count(*) from transactions t where t.user_id = c.auth_user_id and t.created_at >= now() - interval '14 days') +
      (select count(*) from workout_sessions w where w.user_id = c.auth_user_id and w.started_at >= now() - interval '14 days') +
      (select count(*) from reading_sessions r where r.user_id = c.auth_user_id and r.started_at >= now() - interval '14 days') +
      (select count(*) from hydration_logs h where h.user_id = c.auth_user_id and h.logged_at >= now() - interval '14 days') +
      (select count(*) from ai_attempts a where a.user_id = c.auth_user_id and a.created_at >= now() - interval '14 days')
    )::bigint,
    (
      (select count(*) from goals g where g.user_id = c.auth_user_id and g.created_at >= now() - interval '28 days' and g.created_at < now() - interval '14 days') +
      (select count(*) from executions e where e.user_id = c.auth_user_id and e.created_at >= now() - interval '28 days' and e.created_at < now() - interval '14 days') +
      (select count(*) from transactions t where t.user_id = c.auth_user_id and t.created_at >= now() - interval '28 days' and t.created_at < now() - interval '14 days') +
      (select count(*) from workout_sessions w where w.user_id = c.auth_user_id and w.started_at >= now() - interval '28 days' and w.started_at < now() - interval '14 days') +
      (select count(*) from reading_sessions r where r.user_id = c.auth_user_id and r.started_at >= now() - interval '28 days' and r.started_at < now() - interval '14 days') +
      (select count(*) from hydration_logs h where h.user_id = c.auth_user_id and h.logged_at >= now() - interval '28 days' and h.logged_at < now() - interval '14 days') +
      (select count(*) from ai_attempts a where a.user_id = c.auth_user_id and a.created_at >= now() - interval '28 days' and a.created_at < now() - interval '14 days')
    )::bigint
  from customers c;
end;
$$;
revoke all on function admin_customer_activity_windowed() from public;
grant execute on function admin_customer_activity_windowed() to authenticated;

-- ---------------------------------------------------------------------------
-- Adoção por domínio do app, agregada pra toda a base — alimenta Produto e
-- experiência. Proxy honesto (timestamps de CRUD), não é funil de eventos
-- granulares — isso fica marcado na UI, não aqui.
-- ---------------------------------------------------------------------------
create or replace function admin_feature_adoption()
returns table (
  feature text,
  customers_with_usage bigint,
  total_events bigint,
  recent_28d bigint,
  prior_28d bigint
)
language plpgsql
security definer
set search_path = public, pg_temp
stable
as $$
begin
  if not is_admin() then
    return;
  end if;
  return query
  select 'planejamento'::text, count(distinct g.user_id), count(*),
    count(*) filter (where g.created_at >= now() - interval '28 days'),
    count(*) filter (where g.created_at >= now() - interval '56 days' and g.created_at < now() - interval '28 days')
  from goals g
  union all
  select 'agenda', count(distinct e.user_id), count(*),
    count(*) filter (where e.created_at >= now() - interval '28 days'),
    count(*) filter (where e.created_at >= now() - interval '56 days' and e.created_at < now() - interval '28 days')
  from executions e
  union all
  select 'financas', count(distinct t.user_id), count(*),
    count(*) filter (where t.created_at >= now() - interval '28 days'),
    count(*) filter (where t.created_at >= now() - interval '56 days' and t.created_at < now() - interval '28 days')
  from transactions t
  union all
  select 'treino', count(distinct w.user_id), count(*),
    count(*) filter (where w.started_at >= now() - interval '28 days'),
    count(*) filter (where w.started_at >= now() - interval '56 days' and w.started_at < now() - interval '28 days')
  from workout_sessions w
  union all
  select 'leitura', count(distinct r.user_id), count(*),
    count(*) filter (where r.started_at >= now() - interval '28 days'),
    count(*) filter (where r.started_at >= now() - interval '56 days' and r.started_at < now() - interval '28 days')
  from reading_sessions r
  union all
  select 'agua', count(distinct h.user_id), count(*),
    count(*) filter (where h.logged_at >= now() - interval '28 days'),
    count(*) filter (where h.logged_at >= now() - interval '56 days' and h.logged_at < now() - interval '28 days')
  from hydration_logs h
  union all
  select 'agente_ia', count(distinct a.user_id), count(*),
    count(*) filter (where a.created_at >= now() - interval '28 days'),
    count(*) filter (where a.created_at >= now() - interval '56 days' and a.created_at < now() - interval '28 days')
  from ai_attempts a;
end;
$$;
revoke all on function admin_feature_adoption() from public;
grant execute on function admin_feature_adoption() to authenticated;

-- ---------------------------------------------------------------------------
-- Notas de relacionamento por cliente
-- ---------------------------------------------------------------------------
create table customer_notes (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers (id) on delete cascade,
  author_user_id uuid references auth.users (id),
  body text not null,
  created_at timestamptz not null default now()
);
create index customer_notes_customer_id_idx on customer_notes (customer_id, created_at desc);
alter table customer_notes enable row level security;
create policy customer_notes_admin_all on customer_notes for all using (is_admin()) with check (is_admin());

-- ---------------------------------------------------------------------------
-- Orçamento planejado por categoria/mês (Financeiro > Planejamento)
-- ---------------------------------------------------------------------------
create table expense_budgets (
  id uuid primary key default gen_random_uuid(),
  category text not null check (
    category in ('infraestrutura', 'ia', 'servicos', 'marketing', 'ferramentas', 'contabilidade', 'geral')
  ),
  budget_month date not null,
  planned_amount numeric(14, 2) not null check (planned_amount >= 0),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (category, budget_month)
);
create trigger expense_budgets_set_updated_at before update on expense_budgets
  for each row execute function set_updated_at();
alter table expense_budgets enable row level security;
create policy expense_budgets_admin_all on expense_budgets for all
  using (has_admin_role(array['owner', 'financeiro', 'produto', 'engenharia']))
  with check (has_admin_role(array['owner', 'financeiro', 'produto', 'engenharia']));

-- ---------------------------------------------------------------------------
-- Fechamento de mês (Financeiro > Conciliação e fechamento)
-- ---------------------------------------------------------------------------
create table finance_period_closings (
  id uuid primary key default gen_random_uuid(),
  period_month date not null unique,
  closed_by uuid references auth.users (id),
  closed_at timestamptz not null default now(),
  note text
);
alter table finance_period_closings enable row level security;
create policy finance_period_closings_admin_all on finance_period_closings for all
  using (has_admin_role(array['owner', 'financeiro', 'produto', 'engenharia']))
  with check (has_admin_role(array['owner', 'financeiro', 'produto', 'engenharia']));

-- ---------------------------------------------------------------------------
-- Relatório mensal versionado. Fechado é imutável de verdade (trigger),
-- reprocessar cria uma linha nova em vez de sobrescrever.
-- ---------------------------------------------------------------------------
create table report_snapshots (
  id uuid primary key default gen_random_uuid(),
  period_start date not null,
  period_end date not null,
  definition_version text not null default 'v1',
  status text not null default 'draft' check (status in ('draft', 'closed')),
  data jsonb not null,
  comment text,
  generated_by uuid references auth.users (id),
  generated_at timestamptz not null default now()
);
create index report_snapshots_period_idx on report_snapshots (period_start desc);
alter table report_snapshots enable row level security;
create policy report_snapshots_admin_all on report_snapshots for all using (is_admin()) with check (is_admin());

create or replace function prevent_closed_report_update()
returns trigger
language plpgsql
as $$
begin
  if old.status = 'closed' then
    raise exception 'report_snapshots: relatório % está fechado — gere uma nova versão em vez de editar.', old.id;
  end if;
  return new;
end;
$$;
create trigger report_snapshots_immutable before update on report_snapshots
  for each row execute function prevent_closed_report_update();
