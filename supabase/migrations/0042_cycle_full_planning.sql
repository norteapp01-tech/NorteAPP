-- Ciclo de treino como planejamento completo: tipo persistido no próprio
-- planejamento, observações nas fichas, medições corporais, e o vínculo da
-- sessão com o ciclo/etapa que a originou.
--
-- Nada é apagado. As etapas continuam sendo as linhas de `workout_cycle_blocks`
-- que já existiam — só mudam de nome na interface ("bloco" virou "etapa").

begin;

-- ---------------------------------------------------------------------------
-- 1. A especialização mora no planejamento, não na página de origem
-- ---------------------------------------------------------------------------
-- Abrir por Planos precisa reconhecer que aquele planejamento É um ciclo de
-- treino. Deduzir isso de qual tela abriu significaria a mesma linha se
-- comportando de dois jeitos.
create type plan_type as enum ('comum', 'ciclo_treino');
alter table goals add column plan_type plan_type not null default 'comum';

-- Ciclos já criados passam a se identificar como tal.
update goals g
set plan_type = 'ciclo_treino'
from workout_cycles c
where c.goal_id = g.id;

-- ---------------------------------------------------------------------------
-- 2. Observações na ficha
-- ---------------------------------------------------------------------------
alter table workout_plans add column notes text;
alter table workout_exercises add column notes text;

-- ---------------------------------------------------------------------------
-- 3. O plano da semana que existia ANTES do ciclo
-- ---------------------------------------------------------------------------
-- Ativar um ciclo passa a mandar no "Treino de hoje". Sem guardar o que havia
-- antes, encerrar o ciclo deixaria a pessoa sem programação nenhuma e sem como
-- voltar ao que ela mesma tinha montado.
alter table workout_cycles
  add column previous_weekly jsonb
    check (previous_weekly is null or jsonb_typeof(previous_weekly) = 'object'),
  add column activated_at timestamptz;

-- ---------------------------------------------------------------------------
-- 4. A sessão sabe de que ciclo e etapa ela nasceu
-- ---------------------------------------------------------------------------
-- `set null` nos dois: apagar um ciclo não pode levar o histórico de treino
-- junto. O retrato da ficha (`planned_snapshot`, migration 0039) continua sendo
-- o que protege o conteúdo da sessão contra edições futuras.
alter table workout_sessions
  add column cycle_id uuid references workout_cycles (id) on delete set null,
  add column block_id uuid references workout_cycle_blocks (id) on delete set null;
create index workout_sessions_cycle_idx on workout_sessions (cycle_id);

-- Preenche o vínculo das sessões que já existem, quando dá pra saber pelo plano.
update workout_sessions s
set block_id = p.block_id,
    cycle_id = b.cycle_id
from workout_plans p
join workout_cycle_blocks b on b.id = p.block_id
where p.id = s.plan_id and s.block_id is null;

-- ---------------------------------------------------------------------------
-- 5. Metas: título, mais tipos, e o que é medido à mão
-- ---------------------------------------------------------------------------
alter table workout_cycle_goals
  add column title text,
  -- Metas descritivas e medidas corporais não saem de registro automático.
  -- O valor atual é informado, e a interface diz isso em vez de fingir cálculo.
  add column manual_current numeric,
  add column manual_done boolean not null default false,
  -- Séries de referência, ao lado das repetições: "3 séries de 10 com 30kg" é
  -- uma meta diferente de "uma série de 10 com 30kg".
  add column reference_sets int check (reference_sets is null or reference_sets > 0);

update workout_cycle_goals set title = '' where title is null;
alter table workout_cycle_goals alter column title set default '';
alter table workout_cycle_goals alter column title set not null;

alter table workout_cycle_goals drop constraint workout_cycle_goals_kind_check;
alter table workout_cycle_goals add constraint workout_cycle_goals_kind_check
  check (kind in (
    'peso_corporal', 'carga', 'series_reps', 'frequencia', 'medida_corporal', 'descritiva'
  ));

-- Carga e séries/reps continuam exigindo exercício; medida e descritiva, não.
alter table workout_cycle_goals drop constraint workout_cycle_goals_needs_exercise;
alter table workout_cycle_goals add constraint workout_cycle_goals_needs_exercise
  check (kind not in ('carga', 'series_reps') or exercise_lineage_id is not null);

-- ---------------------------------------------------------------------------
-- 6. Medições corporais — com método e data, nunca deduzidas
-- ---------------------------------------------------------------------------
-- Percentual de gordura e circunferências não se calculam a partir do peso.
-- Cada registro guarda de onde veio; sem medição, não há número.
create table workout_body_measurements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  label text not null,
  value numeric not null,
  unit text not null,
  method text,
  measured_at date not null,
  note text,
  created_at timestamptz not null default now()
);
create index workout_body_measurements_user_idx
  on workout_body_measurements (user_id, label, measured_at);

alter table workout_body_measurements enable row level security;
create policy workout_body_measurements_owner_access on workout_body_measurements for all
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

commit;
