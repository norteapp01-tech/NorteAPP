-- Feedback enviado em Configurações > Ideias para o Norte.
-- A pessoa autenticada (inclusive por Anonymous Auth) pode apenas inserir
-- suas próprias ideias. A leitura administrativa usa o painel/service_role.
begin;

create table public.app_ideas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null check (kind in ('melhoria', 'novidade')),
  message text not null check (char_length(btrim(message)) between 10 and 2000),
  created_at timestamptz not null default now()
);

create index app_ideas_created_at_idx on public.app_ideas (created_at desc);
create index app_ideas_user_id_idx on public.app_ideas (user_id);

alter table public.app_ideas enable row level security;
revoke all on table public.app_ideas from anon, authenticated;
grant insert on table public.app_ideas to authenticated;

create policy app_ideas_insert_own on public.app_ideas
  for insert to authenticated
  with check (user_id = (select auth.uid()));

-- Mantém a promessa de "começar do zero" do reset da conta. Ideias já
-- enviadas deixam de estar associadas à pessoa também após esse reset.
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
    'app_ideas',
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

commit;
