-- Check-in opcional "Como foi?" depois de um compromisso ou rotina.
--
-- Concluir não diz se a pessoa gostou: este campo guarda o que ELA disse, e só
-- quando quis dizer. Nunca é obrigatório e nunca é inferido.
-- A coluna herda a RLS de `executions` (cada pessoa só enxerga e altera as suas).

alter table public.executions
  add column if not exists feeling text
    check (feeling is null or feeling in ('leve', 'neutro', 'pesado')),
  add column if not exists feeling_at timestamptz;
