-- Kovayı kapatır: herkese açık okuma ve anon yükleme biter. Geri alma: kova-ac.sql.
-- Yalnız ön kontrol temizse ve onaylı her cihaz imzalı yola geçtiyse çalıştır.
update storage.buckets set public = false where id = 'photos';
drop policy if exists "photos_insert_anon" on storage.objects;
