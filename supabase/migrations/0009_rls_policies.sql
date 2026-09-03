-- RLS — cada tabela só é legível/gravável pelo próprio dono (auth.uid() = user_id).
-- Aplicado via loop pra garantir a mesma política em todas as 38 tabelas sem repetição
-- manual (e sem esquecer nenhuma tabela nova que passar a existir no futuro).

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
    'bible_reading_logs', 'reading_frequency_pref', 'notebook_entries', 'prayer_activity_log'
  ];
begin
  foreach t in array tables loop
    execute format('alter table %I enable row level security', t);
    execute format(
      'create policy %I on %I for all using (auth.uid() = user_id) with check (auth.uid() = user_id)',
      t || '_owner_access', t
    );
  end loop;
end $$;
