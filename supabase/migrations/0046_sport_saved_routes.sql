-- Rotas salvas a partir de uma corrida real, e as tentativas de cada rota.
--
-- Até aqui `sport_routes` guardava só DESENHO no mapa (0035): traço sem tempo,
-- feito para guiar uma gravação futura. Agora a mesma tabela também recebe o
-- percurso de uma atividade já gravada — é a mesma coisa do ponto de vista de
-- quem usa ("minha rota do parque"), e criar uma segunda tabela paralela faria
-- o app ter dois conceitos de rota que o usuário nunca distinguiu.
--
-- O que separa as duas origens é `source_activity_id`: nulo = desenhada,
-- preenchido = salva de uma gravação.
--
-- `sport_activities.route_id` continua sendo a INTENÇÃO (de qual rota a
-- gravação partiu). `sport_route_attempts` é o FATO (quais atividades contam
-- como tentativa daquela rota, e por quê). Manter os dois separados é o que
-- permite dizer "esta corrida parece a rota X" sem já tê-la vinculado.

begin;

alter table sport_routes
  add column source_activity_id uuid references sport_activities (id) on delete set null,
  -- Início e fim guardados à parte do traço: a comparação de rotas precisa
  -- deles em toda consulta, e varrer o jsonb de pontos para achar as pontas
  -- ficaria caro à medida que o histórico cresce.
  add column start_lat double precision,
  add column start_lng double precision,
  add column end_lat double precision,
  add column end_lng double precision,
  add column updated_at timestamptz not null default now();

create index sport_routes_user_modality_idx on sport_routes (user_id, modality);

-- Uma atividade é tentativa de no máximo UMA rota: sem isso, uma confirmação
-- duplicada criaria duas tentativas e a rota passaria a contar a mesma corrida
-- duas vezes nos recordes.
create table sport_route_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  route_id uuid not null references sport_routes (id) on delete cascade,
  activity_id uuid not null references sport_activities (id) on delete cascade,
  -- Como o vínculo nasceu. 'sugerida' nunca é gravado sem confirmação: existe
  -- para registrar que a proposta partiu do app, não da pessoa.
  link_source text not null default 'confirmada'
    check (link_source in ('iniciada', 'confirmada', 'sugerida')),
  linked_at timestamptz not null default now(),
  unique (activity_id)
);

create index sport_route_attempts_route_idx on sport_route_attempts (route_id);

alter table sport_route_attempts enable row level security;

create policy sport_route_attempts_owner on sport_route_attempts for all
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- Backfill honesto: atividades que JÁ apontam para uma rota viraram tentativas
-- com origem 'iniciada', porque foi exatamente isso que aconteceu — a gravação
-- partiu daquela rota. Nada é adivinhado por proximidade aqui.
insert into sport_route_attempts (user_id, route_id, activity_id, link_source, linked_at)
select a.user_id, a.route_id, a.id, 'iniciada', a.created_at
from sport_activities a
where a.route_id is not null
on conflict (activity_id) do nothing;

commit;
