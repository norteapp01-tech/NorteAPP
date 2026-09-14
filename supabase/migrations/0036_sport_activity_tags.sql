-- Tag do tipo de atividade e percepção de esforço — preenchidas no card de
-- finalização, sempre opcionais (nunca inferidas automaticamente).

alter table sport_activities add column activity_type text
  check (activity_type in ('prova', 'longa', 'treino'));
alter table sport_activities add column effort_level text
  check (effort_level in ('leve', 'moderado', 'maximo'));
