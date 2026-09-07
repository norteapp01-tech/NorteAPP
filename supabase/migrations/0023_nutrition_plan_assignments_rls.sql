-- meal_plan_assignments foi criada em 0022, depois da migration geral de RLS
-- (0009/0013) — ficou sem `enable row level security` e sem política, então
-- qualquer usuário autenticado conseguia ler/gravar atribuições de qualquer
-- outro usuário. Mesmo padrão de dono já usado em todas as outras ~40
-- tabelas (inclusive `(select auth.uid())`, recomendação de performance do
-- linter do Supabase já aplicada em 0013).

alter table meal_plan_assignments enable row level security;

drop policy if exists meal_plan_assignments_owner_access on meal_plan_assignments;

create policy meal_plan_assignments_owner_access
on meal_plan_assignments
for all
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
