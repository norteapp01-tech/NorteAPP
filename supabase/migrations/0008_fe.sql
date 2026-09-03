-- Fé — Oração, Propósitos, Jornada Bíblica e Caderno. Espelha fe-store.ts.
-- Atividades agendáveis (Momento com Deus, Oração, Leitura, Culto, Célula,
-- Discipulado, Serviço, Propósito) usam routine_links pra apontar pra `routines`
-- do núcleo, mesmo mecanismo de reading_routines — nunca duplicam a Agenda.

create type prayer_subject_status as enum ('em_oracao', 'quero_agradecer', 'encerrada');
create type notebook_entry_type as enum
  ('deus_falou', 'oracao', 'gratidao', 'versiculo', 'aprendizado', 'testemunho', 'livre');
create type spiritual_activity_kind as enum
  ('momento', 'oracao', 'leitura', 'culto', 'celula', 'discipulado', 'servico', 'proposito');
create type reading_frequency as enum ('none', '2x', '3x', '5x', 'daily');

create table prayer_subjects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null,
  description text not null default '',
  status prayer_subject_status not null default 'em_oracao',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index prayer_subjects_user_id_idx on prayer_subjects (user_id);
create trigger prayer_subjects_set_updated_at before update on prayer_subjects
  for each row execute function set_updated_at();

create table prayer_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  subject_id uuid not null references prayer_subjects (id) on delete cascade,
  text text not null,
  created_at timestamptz not null default now()
);
create index prayer_notes_subject_id_idx on prayer_notes (subject_id);

-- purpose.spiritual_activity_id é a única direção usada (SpiritualActivity nunca
-- referencia o Purpose de volta na prática, então evitamos a FK circular).
create table spiritual_activities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind spiritual_activity_kind not null,
  title text not null,
  time text not null,
  duration_minutes int,
  created_at timestamptz not null default now()
);
create index spiritual_activities_user_id_idx on spiritual_activities (user_id);

create table purposes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null,
  intention text not null,
  why text,
  start_date date,
  end_date date,
  spiritual_activity_id uuid references spiritual_activities (id) on delete set null,
  archived boolean not null default false,
  created_at timestamptz not null default now()
);
create index purposes_user_id_idx on purposes (user_id);

create table bible_reading_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  book text not null,
  chapter int not null,
  verse_range text,
  date date not null,
  reflection text,
  created_at timestamptz not null default now()
);
create index bible_reading_logs_user_id_idx on bible_reading_logs (user_id);
create index bible_reading_logs_date_idx on bible_reading_logs (date);

-- Uma linha por usuário.
create table reading_frequency_pref (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  frequency reading_frequency not null default 'none'
);

create table notebook_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  type notebook_entry_type not null,
  content text not null default '',
  verse_reference text,
  verse_text text,
  context text,
  last_resurfaced_at timestamptz,
  resurface_count int not null default 0,
  created_at timestamptz not null default now()
);
create index notebook_entries_user_id_idx on notebook_entries (user_id);
create index notebook_entries_type_idx on notebook_entries (type);

create table prayer_activity_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  date date not null,
  unique (user_id, date)
);
