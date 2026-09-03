-- Leitura — Livro -> Sessão / Nota / Plano / Rotina. Espelha reading-store.ts.

create type book_status as enum ('reading', 'want_to_read', 'completed', 'paused');
create type book_format as enum ('physical', 'ebook', 'audiobook');
create type progress_mode as enum ('pages', 'percentage', 'time');
create type metadata_provider as enum ('google_books', 'open_library', 'manual');
create type reading_session_status as enum ('active', 'completed');
create type reading_note_type as enum ('quote', 'insight', 'note');
create type reading_plan_type as enum ('deadline', 'daily_target');
create type target_unit as enum ('pages', 'percentage', 'seconds');
create type adjustment_status as enum ('none', 'pending', 'redistributed', 'moved', 'kept');

create table reading_books (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null,
  authors text[] not null default '{}',
  cover_url text,
  cover_path text,
  isbn text,
  external_id text,
  metadata_provider metadata_provider,
  format book_format not null default 'physical',
  progress_mode progress_mode not null default 'pages',
  status book_status not null default 'reading',
  total_pages int,
  current_page int,
  total_seconds int,
  current_seconds int,
  current_percentage numeric,
  rating int check (rating between 1 and 5),
  main_takeaway text,
  personal_reflection text,
  started_at date,
  completed_at timestamptz,
  paused_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index reading_books_user_id_idx on reading_books (user_id);
create index reading_books_status_idx on reading_books (status);
create trigger reading_books_set_updated_at before update on reading_books
  for each row execute function set_updated_at();

create table reading_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  book_id uuid not null references reading_books (id) on delete cascade,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  paused_duration_seconds int not null default 0,
  duration_seconds int,
  start_page int,
  end_page int,
  pages_read int,
  start_percentage numeric,
  end_percentage numeric,
  percentage_read numeric,
  start_progress_seconds int,
  end_progress_seconds int,
  progress_seconds int,
  status reading_session_status not null default 'active',
  paused_since timestamptz
);
create index reading_sessions_book_id_idx on reading_sessions (book_id);
create index reading_sessions_user_status_idx on reading_sessions (user_id, status);

create table reading_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  book_id uuid not null references reading_books (id) on delete cascade,
  session_id uuid references reading_sessions (id) on delete set null,
  type reading_note_type not null,
  content text not null default '',
  tags text[] not null default '{}',
  page_number int,
  percentage numeric,
  timestamp_seconds int,
  last_resurfaced_at timestamptz,
  resurface_count int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index reading_notes_book_id_idx on reading_notes (book_id);
create trigger reading_notes_set_updated_at before update on reading_notes
  for each row execute function set_updated_at();

create table reading_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  book_id uuid not null references reading_books (id) on delete cascade,
  type reading_plan_type not null,
  deadline date,
  target_pages int,
  target_percentage numeric,
  target_seconds int,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index reading_plans_book_id_idx on reading_plans (book_id);
create trigger reading_plans_set_updated_at before update on reading_plans
  for each row execute function set_updated_at();

create table reading_routines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  book_id uuid references reading_books (id) on delete cascade,
  time text not null,
  desired_duration_minutes int,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index reading_routines_book_id_idx on reading_routines (book_id);

create table reading_daily_targets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  book_id uuid not null references reading_books (id) on delete cascade,
  date date not null,
  planned_amount numeric not null default 0,
  completed_amount numeric not null default 0,
  unit target_unit not null,
  adjustment_status adjustment_status not null default 'none',
  unique (book_id, date)
);
create index reading_daily_targets_book_id_idx on reading_daily_targets (book_id);

-- Alimenta getReadingStreak() — mesmo papel do activityDates[] em memória hoje.
create table reading_activity_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  date date not null,
  unique (user_id, date)
);
