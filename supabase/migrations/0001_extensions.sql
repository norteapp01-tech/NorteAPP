-- Extensões base + trigger genérica de updated_at, reaproveitada por toda tabela do projeto.
create extension if not exists pgcrypto;

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
