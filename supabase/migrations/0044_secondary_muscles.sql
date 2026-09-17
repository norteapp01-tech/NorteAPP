-- Músculos secundários do exercício.
--
-- O grupo PRINCIPAL (migration 0043) é o que recebe a série. Os secundários
-- participam, mas somar a série inteira em cada um inflaria o total: cinco
-- séries de supino virariam quinze séries entre peito, ombro e tríceps, e a
-- soma dos grupos deixaria de bater com as séries realmente registradas.
--
-- Por isso são guardados separados e apresentados como PARTICIPAÇÃO, nunca
-- somados ao volume direto. Vazio é o padrão; nada é adivinhado.

begin;

alter table workout_exercises
  add column secondary_muscles muscle_group[] not null default '{}';

commit;
