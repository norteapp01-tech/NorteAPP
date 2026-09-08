-- Extras escolhidos no ajuste de energia do dia. O mood_date já delimita a
-- validade diária; ao escolher um novo estado em outro dia, o app substitui a lista.
alter table public.profiles
  add column if not exists mood_extra_execution_ids jsonb not null default '[]'::jsonb;

alter table public.profiles
  add constraint profiles_mood_extra_execution_ids_array
  check (jsonb_typeof(mood_extra_execution_ids) = 'array');
