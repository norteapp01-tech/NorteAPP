-- Corrige um bug real: `customer_activity` (0029) usava security_invoker=true,
-- então RLS de goals/executions/etc. filtrava tudo pelo próprio admin —
-- "última atividade" só aparecia pra própria conta do admin, nunca pros
-- clientes de verdade. Substitui por funções security definer (mesmo padrão
-- de admin_list_users, 0030): rodam com privilégio do dono, mas só retornam
-- linha quando is_admin() é verdadeiro pra quem chama.

drop view if exists customer_activity;

create or replace function admin_customer_activity()
returns table (
  customer_id uuid,
  auth_user_id uuid,
  signed_up_at timestamptz,
  last_activity_at timestamptz
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
  select
    c.id,
    c.auth_user_id,
    c.created_at,
    greatest(
      coalesce((select max(g.created_at) from goals g where g.user_id = c.auth_user_id), 'epoch'::timestamptz),
      coalesce((select max(e.created_at) from executions e where e.user_id = c.auth_user_id), 'epoch'::timestamptz),
      coalesce((select max(t.created_at) from transactions t where t.user_id = c.auth_user_id), 'epoch'::timestamptz),
      coalesce((select max(w.started_at) from workout_sessions w where w.user_id = c.auth_user_id), 'epoch'::timestamptz),
      coalesce((select max(r.started_at) from reading_sessions r where r.user_id = c.auth_user_id), 'epoch'::timestamptz),
      coalesce((select max(h.logged_at) from hydration_logs h where h.user_id = c.auth_user_id), 'epoch'::timestamptz),
      coalesce((select max(a.created_at) from ai_attempts a where a.user_id = c.auth_user_id), 'epoch'::timestamptz)
    )
  from customers c;
end;
$$;
revoke all on function admin_customer_activity() from public;
grant execute on function admin_customer_activity() to authenticated;

-- Drill-down por cliente: quanto ele usa cada domínio do app (não só "última
-- atividade" global). É o que alimenta "quais abas o cliente mais usa" no
-- CRM.
create or replace function admin_customer_feature_usage(p_auth_user_id uuid)
returns table (feature text, event_count bigint, last_used_at timestamptz)
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
  select 'planejamento'::text, count(*), max(g.created_at) from goals g where g.user_id = p_auth_user_id
  union all
  select 'agenda', count(*), max(e.created_at) from executions e where e.user_id = p_auth_user_id
  union all
  select 'financas', count(*), max(t.created_at) from transactions t where t.user_id = p_auth_user_id
  union all
  select 'treino', count(*), max(w.started_at) from workout_sessions w where w.user_id = p_auth_user_id
  union all
  select 'leitura', count(*), max(r.started_at) from reading_sessions r where r.user_id = p_auth_user_id
  union all
  select 'agua', count(*), max(h.logged_at) from hydration_logs h where h.user_id = p_auth_user_id
  union all
  select 'agente_ia', count(*), max(a.created_at) from ai_attempts a where a.user_id = p_auth_user_id;
end;
$$;
revoke all on function admin_customer_feature_usage(uuid) from public;
grant execute on function admin_customer_feature_usage(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Admin consegue gerenciar outros admins (conceder/editar papel) — hoje só
-- dava pra ler a própria linha. Necessário pro fluxo "criar login de
-- funcionário/administrador" pela UI.
-- ---------------------------------------------------------------------------
create policy admin_memberships_admin_write on admin_memberships
  for insert with check (is_admin());
create policy admin_memberships_admin_update on admin_memberships
  for update using (is_admin()) with check (is_admin());

-- ---------------------------------------------------------------------------
-- Despesas recorrentes: liga a postagem de um mês à sua "origem" — o próprio
-- lançamento marcado como recorrente funciona como template; postagens
-- seguintes referenciam ele. Evita duplicar lançamento no mesmo mês.
-- ---------------------------------------------------------------------------
alter table expense_entries add column recurring_origin_id uuid references expense_entries (id);

-- ---------------------------------------------------------------------------
-- Cupons — definição pura (código, desconto, validade, limite de uso).
-- Nenhum motor de resgate ligado a cobrança ainda: não existe gateway de
-- pagamento/assinatura no sistema, então "vezes resgatado" não é rastreado
-- aqui — seria inventar um número. Cadastro fica pronto pra quando a
-- cobrança existir.
-- ---------------------------------------------------------------------------
create table coupons (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  discount_type text not null check (discount_type in ('fixo', 'percentual')),
  discount_value numeric(10, 2) not null check (discount_value > 0),
  expires_at date,
  usage_limit integer check (usage_limit is null or usage_limit > 0),
  per_customer_limit integer not null default 1 check (per_customer_limit > 0),
  active boolean not null default true,
  note text,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger coupons_set_updated_at before update on coupons
  for each row execute function set_updated_at();

alter table coupons enable row level security;
create policy coupons_admin_all on coupons for all using (is_admin()) with check (is_admin());
