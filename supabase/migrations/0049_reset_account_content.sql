-- Wipes personal app content while retaining auth and the subscription/billing ledger.
-- Explicit table allowlist prevents future administrative or billing tables from
-- accidentally being erased by a broad metadata-driven reset.
create or replace function public.reset_my_account_content()
returns void language plpgsql security definer set search_path = '' as $$
declare
  account_id uuid := (select auth.uid());
  table_name text;
begin
  if account_id is null then
    raise exception 'Authentication required';
  end if;

  foreach table_name in array array[
    'sport_route_attempts', 'sport_routes', 'sport_activities', 'sport_weekly_goals',
    'workout_set_logs', 'workout_exercise_logs', 'workout_sessions',
    'workout_block_days', 'workout_block_plans', 'workout_cycle_goals',
    'workout_cycle_blocks', 'workout_cycles', 'workout_weekly_assignment',
    'workout_exercises', 'workout_plans', 'workout_body_measurements',
    'workout_body_weights',
    'meal_logs', 'meal_plan_assignments', 'meal_options', 'meals', 'nutrition_goals',
    'reading_activity_log', 'reading_daily_targets', 'reading_sessions',
    'reading_notes', 'reading_plans', 'reading_routines', 'reading_books',
    'prayer_activity_log', 'bible_reading_logs', 'notebook_entries',
    'spiritual_activities', 'prayer_notes', 'prayer_subjects', 'purposes',
    'reading_frequency_pref',
    'goal_contributions', 'financial_goals', 'financial_intentions',
    'savings_goals_monthly', 'category_limits', 'transactions', 'check_ins',
    'agent_inbox_items', 'push_subscriptions', 'reminders',
    'execution_history', 'routine_links', 'executions', 'routines',
    'subtasks', 'steps', 'goals', 'hydration_logs', 'profiles'
  ] loop
    execute format('delete from public.%I where user_id = $1', table_name) using account_id;
  end loop;
end;
$$;

revoke all on function public.reset_my_account_content() from public, anon;
grant execute on function public.reset_my_account_content() to authenticated;
