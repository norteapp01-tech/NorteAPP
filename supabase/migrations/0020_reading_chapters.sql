alter table reading_books
  add column if not exists total_chapters int check (total_chapters is null or total_chapters > 0),
  add column if not exists current_chapter int check (current_chapter is null or current_chapter >= 0);
