-- Foto opcional de atividade de Esportes — mesmo padrão do bucket "avatars"
-- (0011): pasta por usuário, dono lê/escreve/apaga só a própria pasta.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('sport-photos', 'sport-photos', true, 5242880, array['image/png', 'image/jpeg', 'image/webp']);

create policy sport_photos_public_read on storage.objects for select using (bucket_id = 'sport-photos');
create policy sport_photos_owner_insert on storage.objects for insert
  with check (bucket_id = 'sport-photos' and auth.uid()::text = (storage.foldername(name))[1]);
create policy sport_photos_owner_update on storage.objects for update
  using (bucket_id = 'sport-photos' and auth.uid()::text = (storage.foldername(name))[1]);
create policy sport_photos_owner_delete on storage.objects for delete
  using (bucket_id = 'sport-photos' and auth.uid()::text = (storage.foldername(name))[1]);
