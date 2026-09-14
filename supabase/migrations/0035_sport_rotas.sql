-- Rotas desenhadas pelo usuário (Esportes) — um desenho no mapa, não uma
-- gravação real: sem timestamp/precisão por ponto, por isso não reaproveita
-- sport_activity_points nem o tipo GeoPoint (que dependem de tempo real pra
-- checar velocidade plausível — não faz sentido pra um traço desenhado).

create table sport_routes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  modality text not null check (modality in ('corrida', 'caminhada', 'ciclismo')),
  title text not null,
  points jsonb not null,
  distance_m numeric not null default 0 check (distance_m >= 0),
  created_at timestamptz not null default now()
);

alter table sport_activities add column route_id uuid references sport_routes (id) on delete set null;

alter table sport_routes enable row level security;

create policy sport_routes_owner on sport_routes for all
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
