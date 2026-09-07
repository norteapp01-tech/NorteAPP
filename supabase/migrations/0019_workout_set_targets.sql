-- Prescrição independente por série. Os campos legados continuam disponíveis
-- como resumo/fallback para treinos já cadastrados.
alter table workout_exercises
  add column if not exists set_targets jsonb;

alter table workout_exercises
  add constraint workout_exercises_set_targets_array
  check (set_targets is null or jsonb_typeof(set_targets) = 'array');
