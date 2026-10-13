-- Drop anexado à série e série pulada.
--
-- Antes, o drop era uma linha própria (`is_drop`) e parecia uma segunda série.
-- Agora a série pode carregar o drop que a pessoa fez logo depois dela
-- (`drop_weight`/`drop_reps`): um único registro, um único check.
-- Uma série pulada de propósito (`skipped`) ocupa o lugar dela na sequência,
-- mas não conta como série feita, volume nem carga.
-- As linhas antigas com `is_drop = true` continuam válidas e legíveis.

alter table public.workout_set_logs
  add column if not exists drop_weight numeric,
  add column if not exists drop_reps integer,
  add column if not exists skipped boolean not null default false;
