-- Ciclo de treino: blocos com datas reaproveitando o planejamento existente,
-- e metas mensuráveis por ciclo/bloco.
--
-- Decisão central: o ciclo NÃO é um planejamento paralelo. Ele aponta para uma
-- linha de `goals` e cada bloco aponta para uma `steps` daquele goal — então o
-- mesmo ciclo é o planejamento que aparece em Planos, com os dados específicos
-- de academia (treinos, dias, séries) vivendo aqui e ligados por id.
--
-- O que NÃO virou tarefa genérica: série, carga, repetição e registro. Isso é
-- domínio de treino e continua em workout_*. Só o horário do treino vira
-- compromisso na Agenda, e pelo fluxo de rotinas que já existe.

begin;

-- ---------------------------------------------------------------------------
-- 1. Identidade que sobrevive à cópia
-- ---------------------------------------------------------------------------
-- Um ciclo copia o treino A do bloco 1 para o bloco 2 justamente pra poder
-- ajustar um sem mexer no outro. Sem uma identidade estável, "Supino" do bloco
-- 2 é outro exercício qualquer e a curva de evolução recomeça do zero a cada
-- fase — que é exatamente o que o usuário quer acompanhar.
alter table workout_exercises add column lineage_id uuid not null default gen_random_uuid();
create index workout_exercises_lineage_idx on workout_exercises (lineage_id);

alter table workout_plans add column lineage_id uuid not null default gen_random_uuid();
create index workout_plans_lineage_idx on workout_plans (lineage_id);

-- ---------------------------------------------------------------------------
-- 2. O histórico deixa de morrer junto com o treino
-- ---------------------------------------------------------------------------
-- `workout_sessions.plan_id` era `on delete cascade`: apagar um treino apagava
-- TODAS as sessões já registradas dele. O comentário no código afirmava o
-- contrário. Com blocos criando e removendo cópias de treino, isso deixaria de
-- ser um acidente raro e viraria rotina — e reescreveria o passado, que é
-- justamente o que o ciclo não pode fazer.
alter table workout_sessions drop constraint workout_sessions_plan_id_fkey;
alter table workout_sessions alter column plan_id drop not null;
alter table workout_sessions add constraint workout_sessions_plan_id_fkey
  foreign key (plan_id) references workout_plans (id) on delete set null;

-- Identidade do treino guardada na própria sessão: sobrevive à exclusão do
-- plano e atravessa as cópias entre blocos, que é o que permite comparar uma
-- sessão com a anterior do mesmo treino mesmo depois de mudar de fase.
alter table workout_sessions add column plan_lineage_id uuid;
alter table workout_sessions add column plan_label text;
create index workout_sessions_plan_lineage_idx on workout_sessions (plan_lineage_id);

update workout_sessions s
set plan_lineage_id = p.lineage_id,
    plan_label = p.letter || ' · ' || p.name
from workout_plans p
where p.id = s.plan_id and s.plan_lineage_id is null;

-- ---------------------------------------------------------------------------
-- 3. Treino pertence a um bloco, ou à biblioteca
-- ---------------------------------------------------------------------------
-- `block_id` nulo = treino da biblioteca ("Treinos cadastrados"). Não-nulo =
-- cópia que vive dentro de um bloco e só pode ser editada por lá.
--
-- `on delete set null` e não cascade: apagar um bloco devolve os treinos em vez
-- de destruí-los. Quem some da biblioteca é quem tem `archived_at`.
alter table workout_plans
  add column block_id uuid,
  add column source_plan_id uuid references workout_plans (id) on delete set null,
  add column archived_at timestamptz;

-- ---------------------------------------------------------------------------
-- 4. Ciclo e blocos
-- ---------------------------------------------------------------------------
create table workout_cycles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- O planejamento correspondente em Planos. `set null` porque apagar o
  -- planejamento não pode destruir treino e histórico junto.
  goal_id uuid references goals (id) on delete set null,
  name text not null,
  start_date date not null,
  end_date date not null check (end_date >= start_date),
  status text not null default 'rascunho'
    check (status in ('rascunho', 'ativo', 'concluido', 'arquivado')),
  created_at timestamptz not null default now()
);
create index workout_cycles_user_idx on workout_cycles (user_id);
-- Um ciclo ativo por vez: duas programações valendo ao mesmo tempo seria
-- exatamente a combinação silenciosa que não pode acontecer.
create unique index workout_cycles_single_active on workout_cycles (user_id)
  where status = 'ativo';

create table workout_cycle_blocks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  cycle_id uuid not null references workout_cycles (id) on delete cascade,
  -- A etapa equivalente no planejamento. Some sem levar o bloco junto.
  step_id uuid references steps (id) on delete set null,
  name text not null,
  -- Foco é TEXTO escolhido pelo usuário ("resistência"), não uma meta
  -- mensurável — as duas coisas são diferentes e não se misturam.
  focus text,
  muscle_groups text,
  start_date date not null,
  end_date date not null check (end_date >= start_date),
  order_index int not null default 0
);
create index workout_cycle_blocks_cycle_idx on workout_cycle_blocks (cycle_id);

alter table workout_plans add constraint workout_plans_block_id_fkey
  foreign key (block_id) references workout_cycle_blocks (id) on delete set null;
create index workout_plans_block_idx on workout_plans (block_id);

-- Quais treinos pertencem ao bloco, e em que ordem (A, B, C...). Separado da
-- distribuição semanal de propósito: um treino pode estar no bloco antes de ter
-- dia marcado.
create table workout_block_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  block_id uuid not null references workout_cycle_blocks (id) on delete cascade,
  plan_id uuid not null references workout_plans (id) on delete cascade,
  order_index int not null default 0,
  unique (block_id, plan_id)
);
create index workout_block_plans_block_idx on workout_block_plans (block_id);

-- Distribuição pelos dias da semana dentro do bloco. `plan_id` nulo = descanso,
-- que é uma escolha explícita e não a ausência de linha.
create table workout_block_days (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  block_id uuid not null references workout_cycle_blocks (id) on delete cascade,
  weekday int not null check (weekday between 0 and 6),
  plan_id uuid references workout_plans (id) on delete cascade,
  start_time text check (start_time is null or start_time ~ '^[0-2][0-9]:[0-5][0-9]$'),
  unique (block_id, weekday)
);
create index workout_block_days_block_idx on workout_block_days (block_id);

-- ---------------------------------------------------------------------------
-- 5. Metas mensuráveis do ciclo (ou de um bloco)
-- ---------------------------------------------------------------------------
-- Toda meta guarda ponto de partida, alvo e unidade. Carga guarda também as
-- repetições de referência: 80kg×3 e 80kg×10 não são o mesmo resultado, e
-- comparar só o quilo mentiria sobre a evolução.
create table workout_cycle_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  cycle_id uuid not null references workout_cycles (id) on delete cascade,
  block_id uuid references workout_cycle_blocks (id) on delete cascade,
  kind text not null check (kind in ('peso_corporal', 'carga', 'series_reps', 'frequencia')),
  -- Identidade do exercício, não o id de uma cópia: a meta continua valendo
  -- quando o exercício reaparece em outro bloco.
  exercise_lineage_id uuid,
  exercise_label text,
  reference_reps int check (reference_reps is null or reference_reps > 0),
  start_value numeric not null,
  target_value numeric not null,
  unit text not null,
  deadline date,
  created_at timestamptz not null default now(),
  -- Meta de carga ou de séries/reps sem exercício não mede nada.
  constraint workout_cycle_goals_needs_exercise check (
    kind in ('peso_corporal', 'frequencia') or exercise_lineage_id is not null
  )
);
create index workout_cycle_goals_cycle_idx on workout_cycle_goals (cycle_id);

-- ---------------------------------------------------------------------------
-- 6. RLS — padrão da casa
-- ---------------------------------------------------------------------------
alter table workout_cycles enable row level security;
alter table workout_cycle_blocks enable row level security;
alter table workout_block_plans enable row level security;
alter table workout_block_days enable row level security;
alter table workout_cycle_goals enable row level security;

create policy workout_cycles_owner_access on workout_cycles for all
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy workout_cycle_blocks_owner_access on workout_cycle_blocks for all
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy workout_block_plans_owner_access on workout_block_plans for all
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy workout_block_days_owner_access on workout_block_days for all
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy workout_cycle_goals_owner_access on workout_cycle_goals for all
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

commit;
