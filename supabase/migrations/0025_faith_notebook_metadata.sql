-- Metadados opcionais para organizar alvos de oração e o caderno de Fé.
alter table public.prayer_subjects
  add column if not exists category text;

alter table public.notebook_entries
  add column if not exists title text,
  add column if not exists tags text[] not null default '{}';

create index if not exists notebook_entries_tags_idx
  on public.notebook_entries using gin(tags);
