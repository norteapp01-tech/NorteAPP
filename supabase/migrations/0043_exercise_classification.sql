-- Classificação estruturada do exercício: grupo muscular principal e
-- equipamento/variante.
--
-- Hoje o grupo muscular existe só como texto livre na FICHA do treino
-- ("Peito e tríceps"). Isso não dá para somar: distribuir as séries entre os
-- dois grupos seria suposição, e é exatamente o que não pode acontecer.
--
-- Nada é preenchido por adivinhação. Exercício sem classificação fica nulo e
-- aparece como "Não classificado" — um rótulo honesto vale mais do que um
-- palpite que o usuário não sabe que foi dado.

begin;

-- Catálogo determinístico. Não é lista de tudo que existe no corpo: é a
-- granularidade em que dá para somar séries sem inventar estímulo.
create type muscle_group as enum (
  'peito',
  'costas',
  'ombros',
  'biceps',
  'triceps',
  'antebraco',
  'quadriceps',
  'posteriores',
  'gluteos',
  'panturrilhas',
  'abdomen',
  'corpo_inteiro',
  'cardio'
);

-- Equipamento importa para COMPARABILIDADE: 40kg no supino com barra e 40kg
-- por halter não são a mesma carga, e trocar de aparelho quebra a curva. Por
-- isso ele entra na chave de comparação, não só como rótulo.
create type exercise_equipment as enum (
  'barra',
  'halteres',
  'maquina',
  'cabo',
  'peso_corporal',
  'assistido',
  'kettlebell',
  'elastico',
  'outro'
);

alter table workout_exercises
  add column muscle_group muscle_group,
  add column equipment exercise_equipment;

create index workout_exercises_muscle_group_idx on workout_exercises (muscle_group);

commit;
