-- Observação de uma rotina — hoje só existe em `executions.how` (avulsas).
-- Sem essa coluna, o texto digitado ao "repetir semanalmente" era
-- silenciosamente descartado: a rotina não tinha onde guardá-lo, e cada
-- ocorrência materializada nascia sem observação nenhuma.

alter table routines add column how text;
