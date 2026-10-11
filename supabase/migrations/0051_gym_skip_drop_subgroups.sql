-- Melhorias da Academia: pular exercício, drop set e subgrupos musculares.
-- Só adiciona: nenhum dado existente é alterado.

-- Exercício pulado fica registrado como pulado (e não some como "não feito").
alter table workout_exercise_logs
  add column if not exists skipped boolean not null default false;

-- Drop set: a série extra feita logo depois de soltar o peso. Não conta como
-- série planejada.
alter table workout_set_logs
  add column if not exists is_drop boolean not null default false;

-- Subgrupos. Os valores antigos (peito, costas, ombros, triceps…) continuam
-- valendo como "geral" — nada é reclassificado por adivinhação.
alter type muscle_group add value if not exists 'peito_superior';
alter type muscle_group add value if not exists 'peito_medio';
alter type muscle_group add value if not exists 'peito_inferior';
alter type muscle_group add value if not exists 'dorsais';
alter type muscle_group add value if not exists 'costas_meio';
alter type muscle_group add value if not exists 'trapezio';
alter type muscle_group add value if not exists 'lombar';
alter type muscle_group add value if not exists 'ombro_anterior';
alter type muscle_group add value if not exists 'ombro_lateral';
alter type muscle_group add value if not exists 'ombro_posterior';
alter type muscle_group add value if not exists 'triceps_longa';
alter type muscle_group add value if not exists 'triceps_lateral';
alter type muscle_group add value if not exists 'triceps_medial';
alter type muscle_group add value if not exists 'adutores';
