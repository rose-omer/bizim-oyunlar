-- Bizim Oyunlar — Supabase şeması
--
-- Kullanım: Supabase Dashboard > SQL Editor > New query.
-- Bu dosyanın TAMAMINI yapıştır ve "Run" düğmesine bas.
-- Tekrar çalıştırmak güvenlidir (idempotent): var olan tablo, fonksiyon ve politikalar güncellenir.
--
-- İçerik:
--   1. game_log tablosu (RLS açık, politika yok: doğrudan erişim kapalı)
--   2. RPC: log_game, room_stats, ping (security definer; anon çağırabilir)
--   3. Depolama: herkese açık 'photos' kovası; anon yalnız yükleyebilir (listeleme yok)
--   4. Çift verisi: room_doc tablosu + RPC doc_put, doc_list, doc_page (js/core/veri.js)

-- ---------------------------------------------------------------------------
-- 1. Oyun kaydı
-- ---------------------------------------------------------------------------
create table if not exists public.game_log (
  id bigint generated always as identity primary key,
  room text not null,
  game text not null,
  result jsonb,
  created_at timestamptz not null default now()
);

create index if not exists game_log_room_created_at_idx
  on public.game_log (room, created_at desc);

alter table public.game_log enable row level security;
revoke all on table public.game_log from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. RPC fonksiyonları
-- ---------------------------------------------------------------------------
create or replace function public.log_game(p_room text, p_game text, p_result jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_room is null or p_room !~ '^[a-z2-9]{10}$' then
    raise exception 'log_game: gecersiz oda' using errcode = '22023';
  end if;
  if p_game is null or p_game !~ '^[a-z]{2,20}$' then
    raise exception 'log_game: gecersiz oyun' using errcode = '22023';
  end if;
  if coalesce(pg_catalog.pg_column_size(p_result), 0) > 1024 then
    raise exception 'log_game: sonuc cok buyuk' using errcode = '22023';
  end if;
  -- Hız sınırı: oda başına son bir saatte en fazla 30 kayıt (game_log_room_created_at_idx kullanılır).
  if (select count(*) from public.game_log as g
      where g.room = p_room and g.created_at > pg_catalog.now() - interval '1 hour') >= 30 then
    raise exception 'log_game: cok fazla kayit' using errcode = '54000';
  end if;
  insert into public.game_log (room, game, result) values (p_room, p_game, p_result);
end;
$$;

create or replace function public.room_stats(p_room text)
returns table (game text, played bigint, last_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select g.game, count(*)::bigint, max(g.created_at)
  from public.game_log as g
  where g.room = p_room
  group by g.game
  order by max(g.created_at) desc;
$$;

create or replace function public.ping()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select 'ok'::text;
$$;

revoke execute on function public.log_game(text, text, jsonb) from public;
revoke execute on function public.room_stats(text) from public;
revoke execute on function public.ping() from public;

grant execute on function public.log_game(text, text, jsonb) to anon, authenticated;
grant execute on function public.room_stats(text) to anon, authenticated;
grant execute on function public.ping() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Fotoğraf kovası
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', true, 5242880, array['image/jpeg', 'image/webp', 'image/png'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Yalnız yükleme. SELECT politikası yok: herkese açık URL çalışır, listeleme çalışmaz.
-- Yol js/core/storage.js uploadPhoto ile aynı: `<oda>/<uuid>.jpg` (odasız yükleme yok).
drop policy if exists "photos_insert_anon" on storage.objects;
create policy "photos_insert_anon"
  on storage.objects
  for insert
  to anon, authenticated
  with check (bucket_id = 'photos' and name ~ '^[a-z2-9]{10}/[0-9a-f-]{36}\.jpg$');

-- ---------------------------------------------------------------------------
-- 4. Çift verisi (js/core/veri.js): oda başına belgeler
-- ---------------------------------------------------------------------------
-- Belge = (oda, tür, id) → data jsonb. Son yazan kazanır. Silme iz bırakır (deleted = true, data = {}).
create table if not exists public.room_doc (
  room text not null,
  kind text not null,
  id text not null,
  data jsonb not null default '{}'::jsonb,
  author text,
  deleted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (room, kind, id)
);

create index if not exists room_doc_sync_idx on public.room_doc (room, kind, updated_at);
create index if not exists room_doc_page_idx on public.room_doc (room, kind, created_at desc);

alter table public.room_doc enable row level security;
revoke all on table public.room_doc from anon, authenticated;

-- Yazma sayacı (saatlik): oda başına ve genel ('*').
create table if not exists public.room_rate (
  room text not null,
  bucket timestamptz not null,
  n integer not null default 0,
  primary key (room, bucket)
);

alter table public.room_rate enable row level security;
revoke all on table public.room_rate from anon, authenticated;

create or replace function public.doc_put(
  p_room text, p_kind text, p_id text, p_data jsonb, p_author text, p_deleted boolean default false)
returns table (id text, data jsonb, author text, deleted boolean, created_at timestamptz, updated_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_hour timestamptz := pg_catalog.date_trunc('hour', pg_catalog.now());
  v_n integer;
  v_all integer;
  v_data jsonb := case when coalesce(p_deleted, false) then '{}'::jsonb else p_data end;
begin
  if p_room is null or p_room !~ '^[a-z2-9]{10}$' then
    raise exception 'doc_put: gecersiz oda' using errcode = '22023';
  end if;
  if p_kind is null or p_kind !~ '^[a-z]{2,20}$' then
    raise exception 'doc_put: gecersiz tur' using errcode = '22023';
  end if;
  if p_id is null or p_id !~ '^[A-Za-z0-9_-]{1,64}$' then
    raise exception 'doc_put: gecersiz id' using errcode = '22023';
  end if;
  if p_author is not null and p_author !~ '^[A-Za-z0-9_-]{1,64}$' then
    raise exception 'doc_put: gecersiz yazar' using errcode = '22023';
  end if;
  if v_data is null or pg_catalog.jsonb_typeof(v_data) <> 'object' then
    raise exception 'doc_put: gecersiz veri' using errcode = '22023';
  end if;
  if pg_catalog.octet_length(v_data::text) > 32768 then
    raise exception 'doc_put: veri cok buyuk' using errcode = '22023';
  end if;

  -- Hız sınırı: oda başına saatte 2000, toplam saatte 50000 yazma.
  insert into public.room_rate as r (room, bucket, n) values (p_room, v_hour, 1)
    on conflict (room, bucket) do update set n = r.n + 1
    returning r.n into v_n;
  if v_n > 2000 then
    raise exception 'doc_put: cok fazla yazma' using errcode = '54000';
  end if;
  insert into public.room_rate as r (room, bucket, n) values ('*', v_hour, 1)
    on conflict (room, bucket) do update set n = r.n + 1
    returning r.n into v_all;
  if v_all > 50000 then
    raise exception 'doc_put: cok fazla yazma' using errcode = '54000';
  end if;
  if v_n = 1 then
    delete from public.room_rate as r where r.room = p_room and r.bucket < v_hour - interval '1 day';
  end if;
  if v_all = 1 then
    delete from public.room_rate as r where r.room = '*' and r.bucket < v_hour - interval '1 day';
  end if;

  return query
  insert into public.room_doc as d (room, kind, id, data, author, deleted, created_at, updated_at)
  values (p_room, p_kind, p_id, v_data, p_author, coalesce(p_deleted, false), pg_catalog.now(), pg_catalog.clock_timestamp())
  on conflict (room, kind, id) do update
    set data = excluded.data,
        author = excluded.author,
        deleted = excluded.deleted,
        updated_at = pg_catalog.clock_timestamp()
  returning d.id, d.data, d.author, d.deleted, d.created_at, d.updated_at;
end;
$$;

-- p_since sonrası değişenler (silinenler dahil), eskiden yeniye.
create or replace function public.doc_list(
  p_room text, p_kind text, p_since timestamptz default null, p_limit integer default 500)
returns table (id text, data jsonb, author text, deleted boolean, created_at timestamptz, updated_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select d.id, d.data, d.author, d.deleted, d.created_at, d.updated_at
  from public.room_doc as d
  where d.room = p_room and d.kind = p_kind and (p_since is null or d.updated_at > p_since)
  order by d.updated_at asc
  limit least(greatest(coalesce(p_limit, 500), 1), 1000);
$$;

-- p_before (created_at) öncesi silinmemiş belgeler, yeniden eskiye (sohbet geçmişi).
create or replace function public.doc_page(
  p_room text, p_kind text, p_before timestamptz default null, p_limit integer default 50)
returns table (id text, data jsonb, author text, deleted boolean, created_at timestamptz, updated_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select d.id, d.data, d.author, d.deleted, d.created_at, d.updated_at
  from public.room_doc as d
  where d.room = p_room and d.kind = p_kind and not d.deleted
    and (p_before is null or d.created_at < p_before)
  order by d.created_at desc
  limit least(greatest(coalesce(p_limit, 50), 1), 200);
$$;

revoke execute on function public.doc_put(text, text, text, jsonb, text, boolean) from public;
revoke execute on function public.doc_list(text, text, timestamptz, integer) from public;
revoke execute on function public.doc_page(text, text, timestamptz, integer) from public;

grant execute on function public.doc_put(text, text, text, jsonb, text, boolean) to anon, authenticated;
grant execute on function public.doc_list(text, text, timestamptz, integer) to anon, authenticated;
grant execute on function public.doc_page(text, text, timestamptz, integer) to anon, authenticated;

-- PostgREST şema önbelleğini tazele (yeni fonksiyonlar hemen görünsün).
notify pgrst, 'reload schema';
