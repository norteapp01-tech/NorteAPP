-- Storage — só os dois pontos de upload que realmente existem no código hoje:
-- capa de livro (Leitura/AddBookFlow.tsx) e imagem de objetivo (Finanças/NewGoalSheet).
-- Convenção de path: <user_id>/<arquivo> — a policy usa o 1º segmento do path
-- pra garantir que cada usuário só vê/escreve os próprios arquivos.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('book-covers', 'book-covers', true, 5242880, array['image/png', 'image/jpeg', 'image/webp']),
  ('financial-goal-images', 'financial-goal-images', true, 5242880, array['image/png', 'image/jpeg', 'image/webp']);

do $$
declare
  b text;
  buckets text[] := array['book-covers', 'financial-goal-images'];
begin
  foreach b in array buckets loop
    execute format(
      $p$create policy %I on storage.objects for select using (bucket_id = %L)$p$,
      b || '_public_read', b
    );
    execute format(
      $p$create policy %I on storage.objects for insert with check (
        bucket_id = %L and auth.uid()::text = (storage.foldername(name))[1]
      )$p$,
      b || '_owner_insert', b
    );
    execute format(
      $p$create policy %I on storage.objects for update using (
        bucket_id = %L and auth.uid()::text = (storage.foldername(name))[1]
      )$p$,
      b || '_owner_update', b
    );
    execute format(
      $p$create policy %I on storage.objects for delete using (
        bucket_id = %L and auth.uid()::text = (storage.foldername(name))[1]
      )$p$,
      b || '_owner_delete', b
    );
  end loop;
end $$;
