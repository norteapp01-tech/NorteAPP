-- Percepção subjetiva ao concluir o treino.
--
-- Peso e repetições não dizem se a sessão pareceu leve, adequada ou pesada.
-- Guardar essa resposta permite interpretar manutenção e deload sem chamar
-- automaticamente uma redução de desempenho de "piora".

begin;

alter table workout_sessions
  add column perceived_effort text
    check (perceived_effort is null or perceived_effort in ('leve', 'na_medida', 'pesado'));

commit;
