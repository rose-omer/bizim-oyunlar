-- adres-tasi.sql'i geri alır: taşınan alanlar eski adrese döner. Yalnız taşımadan beri değişmemiş kayıtlar
-- (data, kova: çevrimi dışında aynı). Sonradan yazılan belgeye dokunulmaz; o belge kova: ile de okunur.
update public.room_doc as d
set data = y.data
from public.medya_tasima_yedek as y
where d.room = y.room and d.kind = y.kind and d.id = y.id
  and pg_catalog.regexp_replace(y.data::text,
        'https://[a-z0-9.-]+/storage/v1/object/public/photos/([a-z2-9]{10}/[0-9a-f-]{36}\.(?:jpg|webp|webm|m4a))', 'kova:\1', 'g')::jsonb = d.data;
