-- Geçiş ön kontrolü. YALNIZ OKUR; hiçbir şey değiştirmez. SQL Editor'de sırayla çalıştır.

-- 1. Kovanın durumu ve anon yükleme politikası.
select id, public, file_size_limit from storage.buckets where id = 'photos';
select policyname, cmd from pg_catalog.pg_policies where schemaname = 'storage' and tablename = 'objects';

-- 2. Oda başına kullanım (sınır: oda 800 MB ve 5000 dosya, genel 950 MB). Sınırın üstündeyse yükleme durur; önce sınırı konuş.
select split_part(name, '/', 1) as oda, count(*) as dosya,
       pg_size_pretty(sum((metadata ->> 'size')::bigint)) as boyut
from storage.objects where bucket_id = 'photos' group by 1 order by sum((metadata ->> 'size')::bigint) desc;

-- 3. İmzalanamayacak dosyalar (yol biçimi dışı). Sonuç boş olmalı; doluysa bu dosyalar kapanışta açılmaz.
select name from storage.objects
where bucket_id = 'photos' and name !~ '^[a-z2-9]{10}/[0-9a-f-]{36}\.(jpg|webp|webm|m4a)$';

-- 4. Başka odanın dosyasını anan belgeler. Sonuç boş olmalı; doluysa o fotoğraf kapanışta açılmaz.
select d.room, d.kind, d.id, y as yol
from public.room_doc as d, lateral public.medya_yollari(d.data) as y
where y not like d.room || '/%';

-- 5. Belgede anılıp kovada olmayan dosyalar (bilgi: zaten kırık olanlar).
select d.room, d.kind, d.id, y as yol
from public.room_doc as d, lateral public.medya_yollari(d.data) as y
where not exists (select 1 from storage.objects as o where o.bucket_id = 'photos' and o.name = y);

-- 6. Cihazlar ve imzalı yolu kullanıp kullanmadıkları. Kapanıştan önce onaylı her cihazda medya_gorulme dolu olmalı
--    (yedek-pc-* dahil: gece yedeği yaması uygulanmadıysa boş kalır).
select room, cihaz, ad, durum, son_gorulme, medya_gorulme from public.oda_cihaz order by room, olusturma;

-- 7. Temizlik ilk çalışınca kalıcı silinecekler: 30 günden uzun süredir çöpte duran belgeler.
select room, kind, count(*) as belge, min(updated_at) as en_eski
from public.room_doc
where deleted and data <> '{}'::jsonb and updated_at < now() - interval '30 days'
group by 1, 2 order by 1, 2;

-- 8. Silme kuyruğu ve taşınacak belge sayısı.
select count(*) as kuyruk from public.medya_silinecek;
select count(*) as eski_adresli_belge from public.room_doc
where data::text ~ '/storage/v1/object/public/photos/';
