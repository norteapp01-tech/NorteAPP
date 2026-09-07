alter table meals
  add column if not exists weekdays int[] not null default array[0, 1, 2, 3, 4, 5, 6];

alter table meals
  add constraint meals_weekdays_valid
  check (
    cardinality(weekdays) > 0
    and weekdays <@ array[0, 1, 2, 3, 4, 5, 6]
  );
