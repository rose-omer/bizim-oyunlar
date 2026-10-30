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

-- PostgREST şema önbelleğini tazele (yeni fonksiyonlar hemen görünsün).
notify pgrst, 'reload schema';
