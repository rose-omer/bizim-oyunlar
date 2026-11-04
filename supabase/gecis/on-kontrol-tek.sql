-- Faz 0, şemadan önce: on-kontrol.sql'in 1, 2, 3. sorguları tek sonuçta (SQL Editor yalnız son sonucu gösterir). YALNIZ OKUR.
select jsonb_pretty(jsonb_build_object(
  'kova', (select jsonb_agg(jsonb_build_object('public', b.public, 'sinir', b.file_size_limit))
           from storage.buckets as b where b.id = 'photos'),
  'politikalar', (select coalesce(jsonb_agg(p.policyname), '[]'::jsonb)
                  from pg_catalog.pg_policies as p where p.schemaname = 'storage' and p.tablename = 'objects'),
  'odalar', (select coalesce(jsonb_agg(jsonb_build_object('dosya', o.dosya, 'mb', o.mb) order by o.mb desc), '[]'::jsonb)
             from (select count(*) as dosya, round(sum((x.metadata ->> 'size')::numeric) / 1048576, 1) as mb
                   from storage.objects as x where x.bucket_id = 'photos' group by split_part(x.name, '/', 1)) as o),
  'bicim_disi_dosya', (select coalesce(jsonb_agg(x.name), '[]'::jsonb)
                       from storage.objects as x
                       where x.bucket_id = 'photos' and x.name !~ '^[a-z2-9]{10}/[0-9a-f-]{36}\.(jpg|webp|webm|m4a)$')
)) as sonuc;
