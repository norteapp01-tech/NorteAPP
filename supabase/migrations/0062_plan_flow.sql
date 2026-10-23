-- Fluxo de execução dos planos: o estado do trabalho é separado do estado da
-- Agenda. Uma ação pode estar "em andamento" ou "bloqueada" sem inventar um
-- novo estado de calendário, e pode depender de outra ação do mesmo plano.

alter table public.executions
  add column if not exists plan_work_status text not null default 'next'
    check (plan_work_status in ('next', 'in_progress', 'blocked')),
  add column if not exists blocked_reason text,
  add column if not exists depends_on_execution_id uuid
    references public.executions (id) on delete set null,
  add column if not exists work_started_at timestamptz,
  add column if not exists last_progress_at timestamptz,
  add column if not exists reschedule_count integer not null default 0
    check (reschedule_count >= 0);

create index if not exists executions_dependency_idx
  on public.executions (depends_on_execution_id)
  where depends_on_execution_id is not null;

-- Impede dependências entre pessoas/planos e também ciclos (A -> B -> A).
-- Assim a integridade não depende apenas da interface do aplicativo.
create or replace function public.validate_execution_dependency()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  dependency_user uuid;
  dependency_goal uuid;
  cycle_found boolean;
begin
  if new.depends_on_execution_id is null then
    return new;
  end if;

  if new.depends_on_execution_id = new.id then
    raise exception 'Uma ação não pode depender dela mesma.';
  end if;

  select user_id, goal_id
    into dependency_user, dependency_goal
  from public.executions
  where id = new.depends_on_execution_id;

  if dependency_user is distinct from new.user_id
     or dependency_goal is null
     or dependency_goal is distinct from new.goal_id then
    raise exception 'A dependência deve pertencer ao mesmo plano.';
  end if;

  with recursive dependency_chain(id, depends_on_id) as (
    select e.id, e.depends_on_execution_id
    from public.executions e
    where e.id = new.depends_on_execution_id
    union all
    select e.id, e.depends_on_execution_id
    from public.executions e
    join dependency_chain chain on e.id = chain.depends_on_id
    where chain.depends_on_id is not null
  )
  select exists(select 1 from dependency_chain where id = new.id)
    into cycle_found;

  if cycle_found then
    raise exception 'Essa dependência criaria um ciclo no plano.';
  end if;

  return new;
end;
$$;

drop trigger if exists executions_validate_dependency on public.executions;
create trigger executions_validate_dependency
  before insert or update of depends_on_execution_id, goal_id, user_id
  on public.executions
  for each row execute function public.validate_execution_dependency();
