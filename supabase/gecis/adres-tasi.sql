-- İsteğe bağlı son adım: belgelerdeki eski adresleri 'kova:' biçimine çevirir. Okuma iki biçimi de bilir; acele yok.
-- Önce özgün değerler ayrı tabloya alınır. Geri alma: adres-geri.sql. Sonuç 0 olana dek son satırı yeniden çalıştır.
create table if not exists public.medya_tasima_yedek (
  room text not null, kind text not null, id text not null, data jsonb not null, alindi timestamptz not null default now(),
  primary key (room, kind, id)
);
alter table public.medya_tasima_yedek enable row level security;
revoke all on table public.medya_tasima_yedek from anon, authenticated;

insert into public.medya_tasima_yedek (room, kind, id, data)
select d.room, d.kind, d.id, d.data from public.room_doc as d
where d.data::text ~ '/storage/v1/object/public/photos/'
on conflict (room, kind, id) do nothing;

select public.medya_tasi(5000);
