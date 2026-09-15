-- Controle de treino em andamento: os dois relógios (sessão e descanso)
-- derivados de timestamps, o exercício selecionado no painel rápido, e o
-- retrato do treino planejado.
--
-- Os relógios guardam INSTANTES, não contadores: o app calcula o decorrido
-- por diferença de horário. Contar ticks de setInterval desviava sempre que
-- a aba ia pro fundo, a tela bloqueava ou a página recarregava.

begin;

alter table workout_sessions
  -- Pausa do treino: `paused_at` marca desde quando está pausado (null =
  -- rodando) e `paused_seconds` acumula o que já foi pausado antes.
  add column paused_at timestamptz,
  add column paused_seconds int not null default 0 check (paused_seconds >= 0),
  -- Descanso entre séries, com a mesma mecânica e independente da pausa do
  -- treino: dá pra pausar o descanso sem pausar o treino e vice-versa.
  add column rest_started_at timestamptz,
  add column rest_total_seconds int check (rest_total_seconds is null or rest_total_seconds > 0),
  add column rest_paused_at timestamptz,
  add column rest_paused_seconds int not null default 0 check (rest_paused_seconds >= 0),
  -- Qual exercício o painel rápido está mostrando — persistido pra reabrir
  -- o app no mesmo lugar em vez de voltar pro primeiro.
  add column selected_exercise_id uuid references workout_exercises (id) on delete set null,
  -- Retrato do treino no instante em que a sessão começou: nome, alvos e
  -- set_targets de cada exercício. Sem isso a sessão lê o exercício VIVO, e
  -- editar a carga hoje muda retroativamente o que todo treino antigo diz
  -- que era a meta.
  add column planned_snapshot jsonb
    check (planned_snapshot is null or jsonb_typeof(planned_snapshot) = 'array');

-- Excluir um exercício apagava, em cascata, todas as séries já registradas
-- dele em todos os treinos passados — o histórico ia junto. Agora a linha de
-- log sobrevive com exercise_id nulo e o nome vem do retrato acima.
alter table workout_exercise_logs
  drop constraint workout_exercise_logs_exercise_id_fkey;
alter table workout_exercise_logs
  alter column exercise_id drop not null;
alter table workout_exercise_logs
  add constraint workout_exercise_logs_exercise_id_fkey
  foreign key (exercise_id) references workout_exercises (id) on delete set null;

-- Conserta o estrago que a falta da constraint abaixo já causou. `logSet`
-- numerava a série nova com `count(*)` das existentes; dois toques rápidos
-- liam a mesma contagem e gravavam as duas no mesmo índice, e o índice
-- seguinte pulava um número. O banco desta conta tinha um exercício com
-- índices 0,0,2,3,4 — cinco séries de verdade, numeradas errado.
--
-- Renumera em sequência, preservando a ordem de registro. NENHUMA linha é
-- apagada: descartar uma das duas no índice 0 seria afirmar que a série não
-- aconteceu, e renumerar não afirma nada que o usuário não tenha registrado.
with renumbered as (
  select id,
         row_number() over (partition by exercise_log_id order by set_index, id) - 1 as new_index
  from workout_set_logs
)
update workout_set_logs sl
set set_index = renumbered.new_index
from renumbered
where renumbered.id = sl.id
  and renumbered.new_index <> sl.set_index;

-- Garantias que o código já assumia mas o banco não impunha:
-- `startSession` desduplica com .maybeSingle() por (plano, dia), e
-- `updateSet` endereça uma série por (exercise_log_id, set_index) com
-- .single(). Sem os índices, uma corrida criava linha duplicada e a leitura
-- passava a estourar.
create unique index workout_sessions_user_plan_date_key
  on workout_sessions (user_id, plan_id, date);
create unique index workout_set_logs_log_set_index_key
  on workout_set_logs (exercise_log_id, set_index);

commit;
