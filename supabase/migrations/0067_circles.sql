-- Private communities. No policy exposes personal habit logs, notes or moods.
begin;
create table public.norte_circles (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  name text not null check(length(trim(name)) between 1 and 80),
  description text not null default '' check(length(description)<=500),
  invite_token uuid not null unique default gen_random_uuid(),
  auto_approve boolean not null default false,
  archived boolean not null default false,
  created_at timestamptz not null default now()
);
create table public.norte_circle_members (
  circle_id uuid not null references public.norte_circles(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  alias text not null check(length(trim(alias)) between 1 and 60),
  status text not null default 'pending' check(status in ('pending','active','removed')),
  muted boolean not null default false,
  joined_at timestamptz not null default now(),
  primary key(circle_id,user_id)
);
create table public.norte_circle_posts (
  id uuid primary key default gen_random_uuid(),
  circle_id uuid not null references public.norte_circles(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  body text not null check(length(trim(body)) between 1 and 2000),
  parent_id uuid references public.norte_circle_posts(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index norte_posts_feed on public.norte_circle_posts(circle_id,created_at desc,id);
create table public.norte_circle_reactions (
  post_id uuid not null references public.norte_circle_posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  primary key(post_id,user_id)
);
create table public.norte_circle_shares (
  circle_id uuid not null references public.norte_circles(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  habit_id uuid not null,
  shared_at timestamptz not null default now(),
  primary key(circle_id,habit_id),
  foreign key(habit_id,user_id) references public.habits(id,user_id) on delete cascade
);
create table public.norte_challenges (
  id uuid primary key default gen_random_uuid(),
  circle_id uuid not null references public.norte_circles(id) on delete cascade,
  title text not null check(length(trim(title)) between 1 and 100),
  mode text not null check(mode in ('cooperative','competitive')),
  unit text not null check(length(trim(unit)) between 1 and 24),
  target numeric not null check(target>0 and target<1e9),
  start_date date not null,
  end_date date not null,
  created_at timestamptz not null default now(),
  check(end_date>=start_date and end_date-start_date<=366)
);
create table public.norte_challenge_members (
  challenge_id uuid not null references public.norte_challenges(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  habit_id uuid not null,
  joined_at timestamptz not null default now(),
  primary key(challenge_id,user_id),
  foreign key(habit_id,user_id) references public.habits(id,user_id) on delete cascade
);
create table public.norte_social_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  circle_id uuid not null references public.norte_circles(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete cascade,
  kind text not null check(kind in ('request','approved','mention','support')),
  body text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index norte_notifications_owner on public.norte_social_notifications(user_id,created_at desc);
create unique index norte_support_daily on public.norte_social_notifications(user_id,circle_id,actor_id,((created_at at time zone 'UTC')::date)) where kind='support';
create table public.norte_circle_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  post_id uuid not null references public.norte_circle_posts(id) on delete cascade,
  reason text not null check(length(trim(reason)) between 1 and 500),
  created_at timestamptz not null default now(),
  unique(user_id,post_id)
);

create function public.norte_circle_access(p_circle uuid, p_owner boolean default false)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.norte_circles c where c.id=p_circle and
    (c.owner_id=auth.uid() or (not p_owner and exists(select 1 from public.norte_circle_members m where m.circle_id=c.id and m.user_id=auth.uid() and m.status='active'))));
$$;
revoke all on function public.norte_circle_access(uuid,boolean) from public,anon;
grant execute on function public.norte_circle_access(uuid,boolean) to authenticated;

do $$ declare t text; begin
 foreach t in array array['norte_circles','norte_circle_members','norte_circle_posts','norte_circle_reactions','norte_circle_shares','norte_challenges','norte_challenge_members','norte_social_notifications','norte_circle_reports'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from anon, authenticated',t);
  execute format('grant select on public.%I to authenticated',t);
 end loop;
end $$;
create policy circles_read on public.norte_circles for select to authenticated using(public.norte_circle_access(id));
create policy members_read on public.norte_circle_members for select to authenticated using(user_id=auth.uid() or (public.norte_circle_access(circle_id) and (status='active' or public.norte_circle_access(circle_id,true))));
create policy posts_read on public.norte_circle_posts for select to authenticated using(public.norte_circle_access(circle_id));
create policy reactions_read on public.norte_circle_reactions for select to authenticated using(exists(select 1 from public.norte_circle_posts p where p.id=post_id and public.norte_circle_access(p.circle_id)));
create policy shares_read on public.norte_circle_shares for select to authenticated using(public.norte_circle_access(circle_id));
create policy challenges_read on public.norte_challenges for select to authenticated using(public.norte_circle_access(circle_id));
create policy entries_read on public.norte_challenge_members for select to authenticated using(exists(select 1 from public.norte_challenges c where c.id=challenge_id and public.norte_circle_access(c.circle_id)));
create policy notices_read on public.norte_social_notifications for select to authenticated using(user_id=auth.uid());
create policy reports_read on public.norte_circle_reports for select to authenticated using(user_id=auth.uid() or exists(select 1 from public.norte_circle_posts p where p.id=post_id and public.norte_circle_access(p.circle_id,true)));

-- Mutations are routed through one permission-checked transaction, never client role fields.
create function public.norte_community_action(p_action text,p_circle uuid default null,p_data jsonb default '{}')
returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); c public.norte_circles; ident uuid; other uuid; target_post public.norte_circle_posts;
 ch public.norte_challenges; h public.habits; member public.norte_circle_members; body text; n integer;
begin
 if u is null then raise exception 'Entre na sua conta.' using errcode='42501'; end if;
 if p_action='create' then
  if (select count(*) from public.norte_circles where owner_id=u and not archived)>=30 then raise exception 'Limite de grupos atingido.'; end if;
  insert into public.norte_circles(owner_id,name,description) values(u,trim(p_data->>'name'),coalesce(p_data->>'description','')) returning * into c;
  insert into public.norte_circle_members(circle_id,user_id,alias,status) values(c.id,u,trim(p_data->>'alias'),'active');
  return jsonb_build_object('id',c.id);
 end if;
 if p_action='join' then
  select * into c from public.norte_circles where invite_token=(p_data->>'token')::uuid and not archived for update;
  if not found then raise exception 'Convite inválido ou encerrado.'; end if;
  select * into member from public.norte_circle_members where circle_id=c.id and user_id=u;
  if member.status='removed' then raise exception 'A entrada neste grupo foi encerrada pelo administrador.'; end if;
  if member.status in ('active','pending') then return jsonb_build_object('id',c.id,'status',member.status); end if;
  if (select count(*) from public.norte_circle_members where circle_id=c.id and status in ('active','pending'))>=100 then raise exception 'O grupo está cheio.'; end if;
  insert into public.norte_circle_members(circle_id,user_id,alias,status) values(c.id,u,trim(p_data->>'alias'),case when c.auto_approve then 'active' else 'pending' end);
  insert into public.norte_social_notifications(user_id,circle_id,actor_id,kind,body) values(c.owner_id,c.id,u,'request','Uma pessoa pediu para entrar em '||c.name);
  return jsonb_build_object('id',c.id,'status',case when c.auto_approve then 'active' else 'pending' end);
 end if;
 if p_action='read_notification' then
  update public.norte_social_notifications set read_at=now() where id=(p_data->>'id')::uuid and user_id=u;
  return '{}';
 end if;
 select * into c from public.norte_circles where id=p_circle for update;
 if not found or not public.norte_circle_access(c.id) then raise exception 'Grupo indisponível.' using errcode='42501'; end if;
 if p_action in ('update','rotate_invite','approve','remove','transfer') and c.owner_id<>u then raise exception 'Apenas o administrador.' using errcode='42501'; end if;
 if p_action='update' then
  update public.norte_circles set name=coalesce(p_data->>'name',name),description=coalesce(p_data->>'description',description),auto_approve=coalesce((p_data->>'auto_approve')::boolean,auto_approve),archived=coalesce((p_data->>'archived')::boolean,archived) where id=c.id;
 elsif p_action='rotate_invite' then
  update public.norte_circles set invite_token=gen_random_uuid() where id=c.id;
 elsif p_action='transfer' then
  other:=(p_data->>'user_id')::uuid;
  if not exists(select 1 from public.norte_circle_members where circle_id=c.id and user_id=other and status='active') then raise exception 'Escolha um participante ativo.'; end if;
  update public.norte_circles set owner_id=other where id=c.id;
 elsif p_action='approve' then
  other:=(p_data->>'user_id')::uuid;
  update public.norte_circle_members set status='active' where circle_id=c.id and user_id=other and status='pending';
  if found then insert into public.norte_social_notifications(user_id,circle_id,actor_id,kind,body) values(other,c.id,u,'approved','Sua entrada em '||c.name||' foi aprovada.'); end if;
 elsif p_action in ('remove','leave') then
  other:=case when p_action='leave' then u else (p_data->>'user_id')::uuid end;
  if other=c.owner_id then raise exception 'Transfira a administração antes de sair.'; end if;
  delete from public.norte_circle_shares where circle_id=c.id and user_id=other;
  delete from public.norte_challenge_members e using public.norte_challenges x where e.challenge_id=x.id and x.circle_id=c.id and e.user_id=other;
  if p_action='leave' then delete from public.norte_circle_members where circle_id=c.id and user_id=u;
  else update public.norte_circle_members set status='removed' where circle_id=c.id and user_id=other; end if;
 elsif p_action='mute' then
  update public.norte_circle_members set muted=coalesce((p_data->>'muted')::boolean,true) where circle_id=c.id and user_id=u;
 elsif p_action='delete_post' then
  delete from public.norte_circle_posts where id=(p_data->>'id')::uuid and circle_id=c.id and (user_id=u or c.owner_id=u);
 elsif p_action='unshare' then
  delete from public.norte_circle_shares where circle_id=c.id and habit_id=(p_data->>'habit_id')::uuid and user_id=u;
 elsif p_action='leave_challenge' then
  delete from public.norte_challenge_members e using public.norte_challenges x where e.challenge_id=x.id and x.circle_id=c.id and e.challenge_id=(p_data->>'id')::uuid and e.user_id=u;
 else
  if c.archived then raise exception 'Este grupo está arquivado.'; end if;
  if p_action='post' then
   body:=trim(p_data->>'body');
   if (select count(*) from public.norte_circle_posts where user_id=u and created_at>now()-interval '1 minute')>=10 then raise exception 'Aguarde um pouco antes de publicar novamente.'; end if;
   if p_data->>'parent_id' is not null and not exists(select 1 from public.norte_circle_posts where id=(p_data->>'parent_id')::uuid and circle_id=c.id and parent_id is null) then raise exception 'Publicação indisponível.'; end if;
   insert into public.norte_circle_posts(circle_id,user_id,body,parent_id) values(c.id,u,body,(p_data->>'parent_id')::uuid) returning id into ident;
   for other in select distinct m.user_id from public.norte_circle_members m where m.circle_id=c.id and m.status='active' and not m.muted and m.user_id<>u and m.user_id::text in (select jsonb_array_elements_text(coalesce(p_data->'mentions','[]'))) loop
    insert into public.norte_social_notifications(user_id,circle_id,actor_id,kind,body) values(other,c.id,u,'mention','Você foi mencionado em '||c.name);
   end loop;
  elsif p_action in ('react','report') then
   select * into target_post from public.norte_circle_posts where id=(p_data->>'id')::uuid and circle_id=c.id;
   if not found then raise exception 'Publicação indisponível.'; end if;
   if p_action='react' then
    delete from public.norte_circle_reactions where post_id=target_post.id and user_id=u;
    if not found then insert into public.norte_circle_reactions(post_id,user_id) values(target_post.id,u); end if;
   else
    insert into public.norte_circle_reports(user_id,post_id,reason) values(u,target_post.id,trim(p_data->>'reason')) on conflict(user_id,post_id) do update set reason=excluded.reason;
   end if;
  elsif p_action='share' then
   select * into h from public.habits where id=(p_data->>'habit_id')::uuid and user_id=u and archived_at is null;
   if not found then raise exception 'Rotina indisponível.'; end if;
   insert into public.norte_circle_shares(circle_id,user_id,habit_id) values(c.id,u,h.id) on conflict do nothing;
  elsif p_action='challenge' then
   if c.owner_id<>u then raise exception 'Apenas o administrador pode criar desafios.'; end if;
   insert into public.norte_challenges(circle_id,title,mode,unit,target,start_date,end_date) values(c.id,trim(p_data->>'title'),p_data->>'mode',trim(p_data->>'unit'),(p_data->>'target')::numeric,(p_data->>'start_date')::date,(p_data->>'end_date')::date) returning id into ident;
  elsif p_action='enroll' then
   select * into ch from public.norte_challenges where id=(p_data->>'id')::uuid and circle_id=c.id;
   if not found or ch.end_date<(now() at time zone 'UTC')::date then raise exception 'Desafio encerrado.'; end if;
   select * into h from public.habits where id=(p_data->>'habit_id')::uuid and user_id=u and archived_at is null and intent='build';
   if not found or lower(trim(coalesce(case when h.measure='duration' then 'min' else h.unit end,'vezes')))<>lower(trim(ch.unit)) then raise exception 'Escolha uma rotina de inclusão com a mesma unidade do desafio.'; end if;
   insert into public.norte_challenge_members(challenge_id,user_id,habit_id) values(ch.id,u,h.id) on conflict(challenge_id,user_id) do nothing;
  elsif p_action='support' then
   other:=(p_data->>'user_id')::uuid;
   if other=u or not exists(select 1 from public.norte_circle_members where circle_id=c.id and user_id=other and status='active' and not muted) then raise exception 'Este participante não está recebendo avisos.'; end if;
   insert into public.norte_social_notifications(user_id,circle_id,actor_id,kind,body) values(other,c.id,u,'support','Alguém do grupo '||c.name||' está torcendo por você.') on conflict do nothing;
  else raise exception 'Ação desconhecida.';
  end if;
 end if;
 return jsonb_build_object('id',ident);
end $$;
revoke all on function public.norte_community_action(text,uuid,jsonb) from public,anon;
grant execute on function public.norte_community_action(text,uuid,jsonb) to authenticated;

-- Explicit shared summaries, never SELECT on another user's private logs.
create function public.norte_circle_progress(p_circle uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if not public.norte_circle_access(p_circle) then raise exception 'Grupo indisponível.' using errcode='42501'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('user_id',s.user_id,'habit_id',s.habit_id,'name',h.name,'unit',case when h.measure='duration' then 'min' else coalesce(h.unit,'vezes') end,'value',
   coalesce((select sum(l.value) from public.habit_logs l where l.habit_id=h.id and l.deleted_at is null and l.status='recorded' and l.local_date>=(now() at time zone 'UTC')::date-6 and l.local_date<=(now() at time zone 'UTC')::date and l.occurred_at>=s.shared_at),0))), '[]') into result
 from public.norte_circle_shares s join public.habits h on h.id=s.habit_id join public.norte_circle_members m on m.circle_id=s.circle_id and m.user_id=s.user_id and m.status='active'
 where s.circle_id=p_circle;
 return result;
end $$;
create function public.norte_challenge_progress(p_challenge uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare ch public.norte_challenges; result jsonb;
begin
 select * into ch from public.norte_challenges where id=p_challenge;
 if not found or not public.norte_circle_access(ch.circle_id) then raise exception 'Desafio indisponível.' using errcode='42501'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('user_id',e.user_id,'alias',m.alias,'value',coalesce((select sum(l.value) from public.habit_logs l where l.habit_id=e.habit_id and l.deleted_at is null and l.status='recorded' and l.local_date between ch.start_date and ch.end_date and l.occurred_at>=e.joined_at),0))), '[]') into result
 from public.norte_challenge_members e join public.norte_circle_members m on m.circle_id=ch.circle_id and m.user_id=e.user_id and m.status='active' where e.challenge_id=ch.id;
 return result;
end $$;
revoke all on function public.norte_circle_progress(uuid),public.norte_challenge_progress(uuid) from public,anon;
grant execute on function public.norte_circle_progress(uuid),public.norte_challenge_progress(uuid) to authenticated;
commit;
