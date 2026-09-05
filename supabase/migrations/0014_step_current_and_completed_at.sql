-- Etapa atual (só uma por planejamento, garantida por índice único parcial) e
-- data real de conclusão da etapa (alimenta a linha de evolução na aba Evolução
-- do detalhe do plano — sem isso não dá pra reconstruir progresso histórico
-- honesto pra planejamentos rastreados "por etapas").

alter table steps add column completed_at timestamptz;
alter table steps add column is_current boolean not null default false;

create unique index steps_one_current_per_goal on steps (goal_id) where is_current;
