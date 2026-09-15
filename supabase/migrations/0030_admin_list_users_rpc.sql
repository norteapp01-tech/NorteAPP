-- auth.users não é exposto pelo PostgREST (só o schema public é). O CRM do
-- Norte Admin precisa de e-mail/provedor pra mostrar a lista de clientes —
-- essa function expõe só os campos necessários, só pra admin, nunca a tabela
-- inteira.

create or replace function admin_list_users()
returns table (id uuid, email text, is_anonymous boolean, provider text, created_at timestamptz)
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select
    u.id,
    u.email,
    u.is_anonymous,
    (u.raw_app_meta_data->>'provider') as provider,
    u.created_at
  from auth.users u
  where is_admin();
$$;

revoke all on function admin_list_users() from public;
grant execute on function admin_list_users() to authenticated;
