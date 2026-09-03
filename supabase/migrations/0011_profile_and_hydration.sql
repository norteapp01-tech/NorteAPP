-- Perfil (Perfil + Preferências + Notificações, 1 linha por usuário) e Hidratação.

create table profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  birth_date date,
  avatar_path text,
  water_goal_ml int not null default 2000,
  time_format text not null default '24h' check (time_format in ('24h', '12h')),
  week_start text not null default 'monday' check (week_start in ('monday', 'sunday')),
  notify_agenda boolean not null default true,
  notify_plans boolean not null default true,
  notify_routines boolean not null default true,
  notify_reminders boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger profiles_set_updated_at before update on profiles
  for each row execute function set_updated_at();

create table hydration_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  date date not null,
  amount_ml int not null check (amount_ml > 0),
  logged_at timestamptz not null default now()
);
create index hydration_logs_user_date_idx on hydration_logs (user_id, date);

alter table profiles enable row level security;
create policy profiles_owner_access on profiles
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table hydration_logs enable row level security;
create policy hydration_logs_owner_access on hydration_logs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 5242880, array['image/png', 'image/jpeg', 'image/webp']);

create policy avatars_public_read on storage.objects for select using (bucket_id = 'avatars');
create policy avatars_owner_insert on storage.objects for insert
  with check (bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]);
create policy avatars_owner_update on storage.objects for update
  using (bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]);
create policy avatars_owner_delete on storage.objects for delete
  using (bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]);
