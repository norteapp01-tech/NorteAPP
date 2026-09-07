alter table meal_options
  add column if not exists ingredients jsonb not null default '[]'::jsonb;

alter table meals drop constraint if exists meals_weekdays_valid;
alter table meals
  add constraint meals_weekdays_valid
  check (weekdays <@ array[0, 1, 2, 3, 4, 5, 6]);

create table if not exists meal_plan_assignments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  meal_id uuid not null references meals (id) on delete cascade,
  weekday int not null check (weekday between 0 and 6),
  option_id uuid references meal_options (id) on delete set null,
  time text not null,
  unique (user_id, meal_id, weekday)
);

create index if not exists meal_plan_assignments_user_weekday_idx
  on meal_plan_assignments (user_id, weekday);
