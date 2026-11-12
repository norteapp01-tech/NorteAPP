-- Scoped, expiring keys for personal HTTP automations (e.g. iOS Shortcuts).
-- Only hashes persist. Never exposes personal notes or accepts an owner from input.
begin;
create table public.norte_automation_keys (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
 name text not null check(length(trim(name)) between 1 and 60),
 token_hash text not null unique,
 habit_id uuid not null,
 can_log boolean not null default false,
 expires_at timestamptz not null default now()+interval '90 days',
 revoked_at timestamptz,
 created_at timestamptz not null default now(),
 last_used_at timestamptz,
 minute_start timestamptz not null default now(),
 minute_count integer not null default 0,
 foreign key(habit_id,user_id) references public.habits(id,user_id) on delete cascade
);
alter table public.norte_automation_keys enable row level security;
revoke all on public.norte_automation_keys from public,anon,authenticated;
grant select(id,user_id,name,habit_id,can_log,expires_at,revoked_at,created_at,last_used_at) on public.norte_automation_keys to authenticated;
create policy automation_owner on public.norte_automation_keys for select to authenticated using(user_id=auth.uid());

create function public.norte_manage_automation(p_action text,p_data jsonb default '{}')
returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); token text; key_id uuid;
begin
 if u is null then raise exception 'Entre na sua conta.' using errcode='42501'; end if;
 if p_action='revoke' then
  update public.norte_automation_keys set revoked_at=now() where id=(p_data->>'id')::uuid and user_id=u;
  return '{}';
 elsif p_action='create' then
  perform pg_advisory_xact_lock(hashtextextended(u::text,42));
  if (select count(*) from public.norte_automation_keys where user_id=u and revoked_at is null and expires_at>now())>=20 then raise exception 'Revogue uma chave antes de criar outra.'; end if;
  if not exists(select 1 from public.habits where id=(p_data->>'habit_id')::uuid and user_id=u and archived_at is null) then raise exception 'Rotina indisponível.'; end if;
  token:='norte_'||replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-','');
  insert into public.norte_automation_keys(user_id,name,token_hash,habit_id,can_log)
   values(u,trim(p_data->>'name'),encode(sha256(convert_to(token,'UTF8')),'hex'),(p_data->>'habit_id')::uuid,coalesce((p_data->>'can_log')::boolean,false)) returning id into key_id;
  return jsonb_build_object('id',key_id,'token',token,'expires_at',now()+interval '90 days');
 end if;
 raise exception 'Ação desconhecida.';
end $$;
revoke all on function public.norte_manage_automation(text,jsonb) from public,anon;
grant execute on function public.norte_manage_automation(text,jsonb) to authenticated;

create function public.norte_habit_automation(p_token text,p_action text,p_data jsonb default '{}')
returns jsonb language plpgsql security definer set search_path='' as $$
declare k public.norte_automation_keys; h public.habits; result jsonb; recorded public.habit_logs;
 zone text:=coalesce(p_data->>'time_zone','UTC'); day date; request_key text;
 old_sub text:=current_setting('request.jwt.claim.sub',true);
begin
 if length(p_token)<>70 then raise exception 'Chave inválida.' using errcode='42501'; end if;
 select * into k from public.norte_automation_keys where token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex') and revoked_at is null and expires_at>now() for update;
 if not found then raise exception 'Chave inválida ou expirada.' using errcode='42501'; end if;
 if k.minute_start>now()-interval '1 minute' and k.minute_count>=60 then raise exception 'Limite de requisições. Aguarde um minuto.' using errcode='PT429'; end if;
 update public.norte_automation_keys set last_used_at=now(),minute_count=case when minute_start<=now()-interval '1 minute' then 1 else minute_count+1 end,minute_start=case when minute_start<=now()-interval '1 minute' then now() else minute_start end where id=k.id;
 select * into h from public.habits where id=k.habit_id and user_id=k.user_id and archived_at is null;
 if not found then raise exception 'Rotina indisponível.'; end if;
 if p_action='read' then
  return jsonb_build_object('id',h.id,'name',h.name,'measure',h.measure,'unit',h.unit);
 elsif p_action='log' then
  if not k.can_log then raise exception 'Esta chave permite apenas consulta.' using errcode='42501'; end if;
  if not exists(select 1 from pg_timezone_names where name=zone) then raise exception 'Fuso inválido.'; end if;
  day:=coalesce((p_data->>'date')::date,(now() at time zone zone)::date);
  if day>(now() at time zone zone)::date then raise exception 'Não é possível registrar uma data futura.'; end if;
  request_key:=p_data->>'request_id';
  if request_key is null or request_key!~'^[A-Za-z0-9_-]{1,40}$' then raise exception 'Envie request_id único por registro (até 40 caracteres).'; end if;
  perform set_config('request.jwt.claim.sub',k.user_id::text,true);
  recorded:=public.log_habit(p_habit=>h.id,p_date=>day,p_value=>(p_data->>'value')::numeric,
    p_duration=>case when h.measure='duration' then round((p_data->>'value')::numeric*60)::integer else null end,
    p_source=>'import',p_source_ref=>'api:'||k.id||':'||request_key,p_idempotency_key=>'api:'||k.id||':'||request_key,p_time_zone=>zone);
  perform set_config('request.jwt.claim.sub',coalesce(old_sub,''),true);
  result:=jsonb_build_object('id',recorded.id,'date',recorded.local_date,'value',recorded.value,'deleted',recorded.deleted_at is not null);
  return result;
 end if;
 raise exception 'Ação desconhecida.';
end $$;
revoke all on function public.norte_habit_automation(text,text,jsonb) from public;
grant execute on function public.norte_habit_automation(text,text,jsonb) to anon,authenticated;
commit;
