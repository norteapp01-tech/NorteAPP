-- Hardening a partir de `supabase db advisors` (achados reais, verificados contra
-- o banco de staging antes de aplicar aqui — não são suposições):
--
-- 1) SECURITY — function_search_path_mutable: set_updated_at() não fixava
--    search_path, deixando a resolução de nomes dependente do search_path de quem
--    chama a função (risco de shadowing se alguém criar objetos em outro schema
--    antes no path). Fixamos com `set search_path = public, pg_temp`.
--
-- 2) PERFORMANCE — auth_rls_initplan: todas as ~40 políticas RLS (padrão
--    `auth.uid() = user_id`) reavaliavam auth.uid() linha a linha. Envolver em
--    `(select auth.uid())` deixa o planner cachear o valor uma vez por query —
--    mesmo controle de acesso, mais rápido em tabelas grandes. Recomendação
--    oficial do linter do Supabase, não uma mudança de comportamento.

alter function set_updated_at() set search_path = public, pg_temp;

do $$
declare
  t text;
  tables text[] := array[
    'goals', 'steps', 'subtasks',
    'routines', 'executions', 'execution_history', 'routine_links',
    'workout_plans', 'workout_exercises', 'workout_weekly_assignment',
    'workout_sessions', 'workout_exercise_logs', 'workout_set_logs', 'workout_body_weights',
    'reading_books', 'reading_sessions', 'reading_notes', 'reading_plans',
    'reading_routines', 'reading_daily_targets', 'reading_activity_log',
    'meals', 'meal_options', 'meal_logs', 'nutrition_goals',
    'transactions', 'savings_goals_monthly', 'category_limits',
    'financial_goals', 'goal_contributions', 'financial_intentions', 'check_ins',
    'prayer_subjects', 'prayer_notes', 'spiritual_activities', 'purposes',
    'bible_reading_logs', 'reading_frequency_pref', 'notebook_entries', 'prayer_activity_log',
    'profiles', 'hydration_logs'
  ];
begin
  foreach t in array tables loop
    execute format('drop policy if exists %I on %I', t || '_owner_access', t);
    execute format(
      'create policy %I on %I for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)',
      t || '_owner_access', t
    );
  end loop;
end $$;
