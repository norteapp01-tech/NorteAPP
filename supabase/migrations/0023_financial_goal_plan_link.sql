-- Um objetivo financeiro pode, opcionalmente, usar o planejamento global.
-- O dinheiro guardado continua no domínio financeiro; etapas e cronograma
-- continuam no domínio de planos, sem duplicar dados.
alter table public.financial_goals
  add column if not exists plan_id uuid references public.goals(id) on delete set null;

create index if not exists financial_goals_plan_id_idx
  on public.financial_goals(plan_id);
