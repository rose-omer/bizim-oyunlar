-- kova-kapat.sql'i geri alır: eski adresler ve eski yükleme yolu yeniden çalışır. Etkisi saniyeler içindedir.
update storage.buckets set public = true where id = 'photos';
drop policy if exists "photos_insert_anon" on storage.objects;
create policy "photos_insert_anon"
  on storage.objects
  for insert
  to anon, authenticated
  with check (bucket_id = 'photos' and name ~ '^[a-z2-9]{10}/[0-9a-f-]{36}\.(jpg|webp|webm|m4a)$');
