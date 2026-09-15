-- Norte Admin — financeiro empresarial, atividade real de cliente (pra
-- retenção) e campanhas. Continua no mesmo repositório de migrations porque o
-- banco é UMA fonte de verdade só, mesmo com o admin rodando como projeto
-- separado do app. Nunca reaproveita `transactions`/`goals` etc: aquelas são
-- finanças e dados PESSOAIS dos usuários, isso aqui é a empresa.

-- ---------------------------------------------------------------------------
-- Financeiro da empresa
-- ---------------------------------------------------------------------------

create table company_accounts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null default 'banco' check (kind in ('banco', 'caixa', 'outro')),
  currency text not null default 'BRL',
  created_at timestamptz not null default now()
);

create table vendors (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  document text,
  created_at timestamptz not null default now()
);

create table cost_centers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table expense_entries (
  id uuid primary key default gen_random_uuid(),
  description text not null,
  category text not null check (
    category in ('infraestrutura', 'ia', 'servicos', 'marketing', 'ferramentas', 'contabilidade', 'geral')
  ),
  amount numeric(14, 2) not null check (amount >= 0),
  currency text not null default 'BRL',
  vendor_id uuid references vendors (id),
  cost_center_id uuid references cost_centers (id),
  account_id uuid references company_accounts (id),
  competence_date date not null,
  due_date date,
  paid_date date,
  status text not null default 'pendente' check (status in ('pendente', 'pago', 'atrasado', 'cancelado')),
  recurrence text not null default 'nenhuma' check (recurrence in ('nenhuma', 'mensal')),
  note text,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index expense_entries_competence_idx on expense_entries (competence_date desc);

create trigger expense_entries_set_updated_at before update on expense_entries
  for each row execute function set_updated_at();

create table receivable_entries (
  id uuid primary key default gen_random_uuid(),
  description text not null,
  source text not null default 'assinatura' check (source in ('assinatura', 'avulso', 'outro')),
  amount numeric(14, 2) not null check (amount >= 0),
  currency text not null default 'BRL',
  account_id uuid references company_accounts (id),
  competence_date date not null,
  received_date date,
  status text not null default 'pendente' check (status in ('pendente', 'recebido', 'cancelado')),
  note text,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index receivable_entries_competence_idx on receivable_entries (competence_date desc);

create trigger receivable_entries_set_updated_at before update on receivable_entries
  for each row execute function set_updated_at();

create table payroll_entries (
  id uuid primary key default gen_random_uuid(),
  person_name text not null,
  role text,
  kind text not null default 'clt' check (kind in ('clt', 'pj', 'prestador')),
  gross_amount numeric(14, 2) not null check (gross_amount >= 0),
  charges_amount numeric(14, 2) not null default 0,
  benefits_amount numeric(14, 2) not null default 0,
  competence_date date not null,
  paid_date date,
  status text not null default 'pendente' check (status in ('pendente', 'pago')),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index payroll_entries_competence_idx on payroll_entries (competence_date desc);

create trigger payroll_entries_set_updated_at before update on payroll_entries
  for each row execute function set_updated_at();

-- RLS: financeiro da empresa é admin-only, sempre — nunca aparece pro usuário
-- comum, nunca é lido por engano junto das finanças pessoais dele.
alter table company_accounts enable row level security;
alter table vendors enable row level security;
alter table cost_centers enable row level security;
alter table expense_entries enable row level security;
alter table receivable_entries enable row level security;
alter table payroll_entries enable row level security;

create policy company_accounts_admin_all on company_accounts for all using (is_admin()) with check (is_admin());
create policy vendors_admin_all on vendors for all using (is_admin()) with check (is_admin());
create policy cost_centers_admin_all on cost_centers for all using (is_admin()) with check (is_admin());
create policy expense_entries_admin_all on expense_entries for all using (is_admin()) with check (is_admin());
create policy receivable_entries_admin_all on receivable_entries for all using (is_admin()) with check (is_admin());
create policy payroll_entries_admin_all on payroll_entries for all using (is_admin()) with check (is_admin());

-- ---------------------------------------------------------------------------
-- Atividade real do cliente — proxy honesto pra retenção, sem inventar
-- probabilidade de cancelamento. Agrega o último `created_at` real entre os
-- domínios do app (nenhuma tabela nova de evento ainda — isso é o "Etapa 1"
-- completo do roadmap do documento, fica pra depois). Sempre "dados
-- insuficientes" nunca vira risco zero: ausência de linha = nunca teve
-- atividade nenhuma, não é o mesmo que "baixo risco".
-- ---------------------------------------------------------------------------

create or replace view customer_activity
with (security_invoker = true) as
select
  c.id as customer_id,
  c.auth_user_id,
  c.created_at as signed_up_at,
  greatest(
    coalesce((select max(g.created_at) from goals g where g.user_id = c.auth_user_id), 'epoch'::timestamptz),
    coalesce((select max(e.created_at) from executions e where e.user_id = c.auth_user_id), 'epoch'::timestamptz),
    coalesce((select max(t.created_at) from transactions t where t.user_id = c.auth_user_id), 'epoch'::timestamptz),
    coalesce((select max(w.started_at) from workout_sessions w where w.user_id = c.auth_user_id), 'epoch'::timestamptz),
    coalesce((select max(r.started_at) from reading_sessions r where r.user_id = c.auth_user_id), 'epoch'::timestamptz),
    coalesce((select max(h.logged_at) from hydration_logs h where h.user_id = c.auth_user_id), 'epoch'::timestamptz),
    coalesce((select max(a.created_at) from ai_attempts a where a.user_id = c.auth_user_id), 'epoch'::timestamptz)
  ) as last_activity_at
from customers c;

-- ---------------------------------------------------------------------------
-- Campanhas — CRUD real. Disparo de verdade depende de um provedor de
-- mensageria ainda não conectado (nenhum aqui) — status "enviando"/"enviada"
-- só existe quando um adaptador real processar a fila, nunca simulado.
-- ---------------------------------------------------------------------------

create table campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  objective text,
  segment text not null default 'todos' check (segment in ('todos', 'inativos_7d', 'inativos_14d', 'inativos_30d', 'novos_7d')),
  channel text not null default 'email' check (channel in ('email', 'in_app')),
  subject text,
  message text not null,
  status text not null default 'rascunho' check (status in ('rascunho', 'pronta', 'agendada', 'ativa', 'pausada', 'concluida', 'falhou')),
  scheduled_for timestamptz,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger campaigns_set_updated_at before update on campaigns
  for each row execute function set_updated_at();

alter table campaigns enable row level security;
create policy campaigns_admin_all on campaigns for all using (is_admin()) with check (is_admin());
