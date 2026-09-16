-- Escolha temporária de descanso, por exercício, válida só dentro da sessão.
--
-- Ajustar o descanso pelo cronômetro não pode reescrever a ficha do treino: a
-- pessoa que hoje quer 3 minutos no supino não está redefinindo o supino para
-- sempre. A escolha vive na sessão e morre com ela.
--
-- Mapa `{ "<exercise_id>": <segundos> }`. Sem entrada, vale o descanso
-- cadastrado para aquela série do exercício.

begin;

alter table workout_sessions
  add column rest_overrides jsonb not null default '{}'::jsonb
    check (jsonb_typeof(rest_overrides) = 'object');

commit;
