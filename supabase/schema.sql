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
--   4. Çift verisi: room_doc tablosu + RPC doc_put, doc_patch, doc_list, doc_page (js/core/veri.js)
--   5. Anlık bildirim: push_sub + RPC push_kaydet, push_sil (Edge Function'lar için sunucu RPC'leri)
--   6. Zamanlanmış hatırlatmalar: pg_cron + pg_net → functions/hatirlat
--   7. Cihaz üyeliği ve yetki: oda, oda_cihaz, oda_davet + RPC oda_katil, oda_durum, cihaz_*, davet_olustur,
--      kurtarma_olustur, doc_ice_aktar. 2., 4. ve 5. bölümdeki RPC'ler yetkiyi oda_yetki ile denetler.
--
-- Canlıya geçiş sırası: (1) bu dosya, (2) bildir Edge Function'ı yeniden yüklenir, (3) istemci yayınlanır.

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
-- Kimlik parametreleri (p_cihaz, p_anahtar) sonda ve isteğe bağlı: eski istemcinin adlı argümanları yeni imzaya uyar.
-- Eski imza kaldırılır; aynı adlı iki imza PostgREST'te belirsizlik yaratır. Yetki: 7. bölüm oda_yetki.
drop function if exists public.log_game(text, text, jsonb);
drop function if exists public.room_stats(text);

create or replace function public.log_game(
  p_room text, p_game text, p_result jsonb, p_cihaz text default null, p_anahtar text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.oda_yetki('log_game', p_room, p_cihaz, p_anahtar);
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

-- plpgsql ve volatile: oda_yetki yetki hatası verir ve son_gorulme yazar (PostgREST stable fonksiyonu
-- salt okunur işlemde çalıştırır).
create or replace function public.room_stats(p_room text, p_cihaz text default null, p_anahtar text default null)
returns table (game text, played bigint, last_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  perform public.oda_yetki('room_stats', p_room, p_cihaz, p_anahtar);
  return query
  select g.game, count(*)::bigint, max(g.created_at)
  from public.game_log as g
  where g.room = p_room
  group by g.game
  order by max(g.created_at) desc;
end;
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

revoke execute on function public.log_game(text, text, jsonb, text, text) from public;
revoke execute on function public.room_stats(text, text, text) from public;
revoke execute on function public.ping() from public;

grant execute on function public.log_game(text, text, jsonb, text, text) to anon, authenticated;
grant execute on function public.room_stats(text, text, text) to anon, authenticated;
grant execute on function public.ping() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Fotoğraf kovası (fotoğraf + sesli mesaj)
-- ---------------------------------------------------------------------------
-- Fotoğraf: JPEG ya da WebP. Sesli mesaj: audio/webm (Chrome/Android), audio/mp4 (iPhone Safari); en çok 2 MB (istemci denetler).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', true, 5242880, array['image/jpeg', 'image/webp', 'image/png', 'audio/webm', 'audio/mp4'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Yalnız yükleme. SELECT politikası yok: herkese açık URL çalışır, listeleme çalışmaz.
-- Yol js/core/storage.js uploadPhoto / uploadAudio ile aynı: `<oda>/<uuid>.jpg|webp|webm|m4a` (odasız yükleme yok).
drop policy if exists "photos_insert_anon" on storage.objects;
create policy "photos_insert_anon"
  on storage.objects
  for insert
  to anon, authenticated
  with check (bucket_id = 'photos' and name ~ '^[a-z2-9]{10}/[0-9a-f-]{36}\.(jpg|webp|webm|m4a)$');

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

-- Yazılan bayt sayacı (günlük, UTC): oda başına ve genel ('*'). bytes = yazılan data'nın JSON metin uzunluğu.
create table if not exists public.room_byte (
  room text not null,
  day date not null,
  bytes bigint not null default 0,
  primary key (room, day)
);

alter table public.room_byte enable row level security;
revoke all on table public.room_byte from anon, authenticated;

-- doc_put ve doc_patch'in ortak sınırı. Yazma sayısı: oda başına saatte 2000, genel saatte 20000.
-- Bayt bütçesi: oda başına günde 30 MB, genel günde 150 MB. Aşılırsa '<p_fn>: cok fazla yazma' (54000);
-- hata işlemi geri aldığından reddedilen yazma sayaçlara eklenmez. Saatin ilk genel yazması eski kayıtları siler.
create or replace function public.doc_sinir(p_fn text, p_room text, p_bytes integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hour timestamptz := pg_catalog.date_trunc('hour', pg_catalog.now());
  v_day date := (pg_catalog.now() at time zone 'UTC')::date;
  v_n integer;
  v_all integer;
  v_b bigint;
  v_b_all bigint;
begin
  insert into public.room_rate as r (room, bucket, n) values (p_room, v_hour, 1)
    on conflict (room, bucket) do update set n = r.n + 1
    returning r.n into v_n;
  insert into public.room_rate as r (room, bucket, n) values ('*', v_hour, 1)
    on conflict (room, bucket) do update set n = r.n + 1
    returning r.n into v_all;
  insert into public.room_byte as b (room, day, bytes) values (p_room, v_day, p_bytes)
    on conflict (room, day) do update set bytes = b.bytes + excluded.bytes
    returning b.bytes into v_b;
  insert into public.room_byte as b (room, day, bytes) values ('*', v_day, p_bytes)
    on conflict (room, day) do update set bytes = b.bytes + excluded.bytes
    returning b.bytes into v_b_all;
  if v_n > 2000 or v_all > 20000 or v_b > 31457280 or v_b_all > 157286400 then
    raise exception '%: cok fazla yazma', p_fn using errcode = '54000';
  end if;
  if v_all = 1 then
    delete from public.room_rate as r where r.bucket < v_hour - interval '2 days';
    delete from public.room_byte as b where b.day < v_day - 2;
  end if;
end;
$$;

revoke execute on function public.doc_sinir(text, text, integer) from public, anon, authenticated;

-- Kimlik parametreleri (p_cihaz, p_anahtar) sonda ve isteğe bağlı; eski imzalar kaldırılır (bkz. 2. bölüm).
drop function if exists public.doc_put(text, text, text, jsonb, text, boolean);
drop function if exists public.doc_list(text, text, timestamptz, integer);
drop function if exists public.doc_page(text, text, timestamptz, integer);
drop function if exists public.doc_patch(text, text, text, jsonb, text);

create or replace function public.doc_put(
  p_room text, p_kind text, p_id text, p_data jsonb, p_author text, p_deleted boolean default false,
  p_cihaz text default null, p_anahtar text default null)
returns table (id text, data jsonb, author text, deleted boolean, created_at timestamptz, updated_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_data jsonb := case when coalesce(p_deleted, false) then '{}'::jsonb else p_data end;
begin
  perform public.oda_yetki('doc_put', p_room, p_cihaz, p_anahtar);
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

  perform public.doc_sinir('doc_put', p_room, pg_catalog.octet_length(v_data::text));

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
-- doc_list ve doc_page plpgsql ve volatile: bkz. room_stats.
create or replace function public.doc_list(
  p_room text, p_kind text, p_since timestamptz default null, p_limit integer default 500,
  p_cihaz text default null, p_anahtar text default null)
returns table (id text, data jsonb, author text, deleted boolean, created_at timestamptz, updated_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  perform public.oda_yetki('doc_list', p_room, p_cihaz, p_anahtar);
  return query
  select d.id, d.data, d.author, d.deleted, d.created_at, d.updated_at
  from public.room_doc as d
  where d.room = p_room and d.kind = p_kind and (p_since is null or d.updated_at > p_since)
  order by d.updated_at asc
  limit least(greatest(coalesce(p_limit, 500), 1), 1000);
end;
$$;

-- p_before (created_at) öncesi silinmemiş belgeler, yeniden eskiye (sohbet geçmişi).
create or replace function public.doc_page(
  p_room text, p_kind text, p_before timestamptz default null, p_limit integer default 50,
  p_cihaz text default null, p_anahtar text default null)
returns table (id text, data jsonb, author text, deleted boolean, created_at timestamptz, updated_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  perform public.oda_yetki('doc_page', p_room, p_cihaz, p_anahtar);
  return query
  select d.id, d.data, d.author, d.deleted, d.created_at, d.updated_at
  from public.room_doc as d
  where d.room = p_room and d.kind = p_kind and not d.deleted
    and (p_before is null or d.created_at < p_before)
  order by d.created_at desc
  limit least(greatest(coalesce(p_limit, 50), 1), 200);
end;
$$;

revoke execute on function public.doc_put(text, text, text, jsonb, text, boolean, text, text) from public;
revoke execute on function public.doc_list(text, text, timestamptz, integer, text, text) from public;
revoke execute on function public.doc_page(text, text, timestamptz, integer, text, text) from public;

grant execute on function public.doc_put(text, text, text, jsonb, text, boolean, text, text) to anon, authenticated;
grant execute on function public.doc_list(text, text, timestamptz, integer, text, text) to anon, authenticated;
grant execute on function public.doc_page(text, text, timestamptz, integer, text, text) to anon, authenticated;

-- Alan düzeyinde birleştirme: iki kişi aynı belgeye aynı anda farklı alan yazınca biri kaybolmasın.
-- p_patch üst düzey anahtarları tek tek yazar; 'ana.alt' iç içe tek alanı yazar; değer null ise alanı siler.
-- Satır kilitlenir (for update): eşzamanlı birleştirmeler sırayla uygulanır. Belge yoksa {} üstüne kurulur.
create or replace function public.doc_patch(
  p_room text, p_kind text, p_id text, p_patch jsonb, p_author text,
  p_cihaz text default null, p_anahtar text default null)
returns table (id text, data jsonb, author text, deleted boolean, created_at timestamptz, updated_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_cur jsonb;
  v_del boolean;
  v_key text;
  v_val jsonb;
  v_path text[];
begin
  perform public.oda_yetki('doc_patch', p_room, p_cihaz, p_anahtar);
  if p_room is null or p_room !~ '^[a-z2-9]{10}$' then
    raise exception 'doc_patch: gecersiz oda' using errcode = '22023';
  end if;
  if p_kind is null or p_kind !~ '^[a-z]{2,20}$' then
    raise exception 'doc_patch: gecersiz tur' using errcode = '22023';
  end if;
  if p_id is null or p_id !~ '^[A-Za-z0-9_-]{1,64}$' then
    raise exception 'doc_patch: gecersiz id' using errcode = '22023';
  end if;
  if p_author is not null and p_author !~ '^[A-Za-z0-9_-]{1,64}$' then
    raise exception 'doc_patch: gecersiz yazar' using errcode = '22023';
  end if;
  if p_patch is null or pg_catalog.jsonb_typeof(p_patch) <> 'object' then
    raise exception 'doc_patch: gecersiz veri' using errcode = '22023';
  end if;
  if pg_catalog.octet_length(p_patch::text) > 32768 then
    raise exception 'doc_patch: veri cok buyuk' using errcode = '22023';
  end if;

  select d.data, d.deleted into v_cur, v_del
  from public.room_doc as d
  where d.room = p_room and d.kind = p_kind and d.id = p_id
  for update;
  if v_cur is null or coalesce(v_del, false) then
    v_cur := '{}'::jsonb;
  end if;

  for v_key, v_val in select e.key, e.value from pg_catalog.jsonb_each(p_patch) as e loop
    v_path := pg_catalog.string_to_array(v_key, '.');
    if pg_catalog.array_length(v_path, 1) > 2 or v_key = '' or v_key like '%..%' or v_key like '.%' or v_key like '%.' then
      raise exception 'doc_patch: gecersiz alan' using errcode = '22023';
    end if;
    if pg_catalog.array_length(v_path, 1) = 2 then
      if pg_catalog.jsonb_typeof(v_cur -> v_path[1]) is distinct from 'object' then
        v_cur := v_cur || pg_catalog.jsonb_build_object(v_path[1], '{}'::jsonb);
      end if;
      if v_val = 'null'::jsonb then
        v_cur := v_cur #- v_path;
      else
        v_cur := pg_catalog.jsonb_set(v_cur, v_path, v_val, true);
      end if;
    elsif v_val = 'null'::jsonb then
      v_cur := v_cur - v_key;
    else
      v_cur := v_cur || pg_catalog.jsonb_build_object(v_key, v_val);
    end if;
  end loop;

  if pg_catalog.octet_length(v_cur::text) > 32768 then
    raise exception 'doc_patch: veri cok buyuk' using errcode = '22023';
  end if;

  -- Bayt bütçesi yazılan tam belgeyi sayar (yama değil).
  perform public.doc_sinir('doc_patch', p_room, pg_catalog.octet_length(v_cur::text));

  return query
  insert into public.room_doc as d (room, kind, id, data, author, deleted, created_at, updated_at)
  values (p_room, p_kind, p_id, v_cur, p_author, false, pg_catalog.now(), pg_catalog.clock_timestamp())
  on conflict (room, kind, id) do update
    set data = excluded.data,
        author = excluded.author,
        deleted = false,
        updated_at = pg_catalog.clock_timestamp()
  returning d.id, d.data, d.author, d.deleted, d.created_at, d.updated_at;
end;
$$;

revoke execute on function public.doc_patch(text, text, text, jsonb, text, text, text) from public;
grant execute on function public.doc_patch(text, text, text, jsonb, text, text, text) to anon, authenticated;

-- PostgREST şema önbelleğini tazele (yeni fonksiyonlar hemen görünsün).
notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- 5. Anlık bildirim (Web Push): push_sub tablosu + RPC (js/core/bildirim.js, functions/bildir, functions/hatirlat)
-- ---------------------------------------------------------------------------
-- Abonelik = tarayıcının push adresi (endpoint) + şifreleme anahtarları. Bir cihaz (client) odada tek abonelik tutar.
create table if not exists public.push_sub (
  endpoint text primary key,
  room text not null,
  client text not null,
  p256dh text not null,
  auth text not null,
  ua text,
  created_at timestamptz not null default now(),
  last_ok_at timestamptz,
  fail_count integer not null default 0
);

create index if not exists push_sub_room_idx on public.push_sub (room);

-- Kayıt cihaz anahtarıyla mı yapıldı (7. bölüm). Koruma altındaki odada yalnız doğrulanmış kayıt sayılır:
-- geçişte oda kodunu bilen biri kimliksiz olarak başka bir cihaz adına abone olamasın.
alter table public.push_sub add column if not exists dogrulandi boolean not null default false;

alter table public.push_sub enable row level security;
revoke all on table public.push_sub from anon, authenticated;

-- Bildirim hız sayacı (dakikalık): oda başına ve genel ('*'). Yalnız push_hedef yazar.
create table if not exists public.push_rate (
  room text not null,
  bucket timestamptz not null,
  n integer not null default 0,
  primary key (room, bucket)
);

alter table public.push_rate enable row level security;
revoke all on table public.push_rate from anon, authenticated;

-- Abonelik kaydı sayacı (saatlik): oda başına ve genel ('*'). Yalnız push_kaydet yazar.
create table if not exists public.push_kayit_rate (
  room text not null,
  bucket timestamptz not null,
  n integer not null default 0,
  primary key (room, bucket)
);

alter table public.push_kayit_rate enable row level security;
revoke all on table public.push_kayit_rate from anon, authenticated;

-- Günlük hatırlatma kaydı: bir oda aynı gün aynı vakitte (sabah/akşam) iki kez hatırlatma almaz.
create table if not exists public.push_gonderim (
  room text not null,
  gun date not null,
  slot text not null,
  created_at timestamptz not null default now(),
  primary key (room, gun, slot)
);

alter table public.push_gonderim enable row level security;
revoke all on table public.push_gonderim from anon, authenticated;

-- Aboneliği kaydet ya da güncelle. p_sub = PushSubscription.toJSON(): { endpoint, keys: { p256dh, auth } }.
-- Yalnız bilinen push servislerinin https adresleri kabul edilir (Edge Function başka adrese istek atmasın).
-- Sınır: oda başına saatte 20, genel saatte 300 kayıt.
-- Yetki: p_anahtar verilmişse (p_client, p_anahtar) cihaz kimliğidir; yoksa kimliksiz (eski istemci, 7. bölüm).
drop function if exists public.push_kaydet(text, text, jsonb, text);
drop function if exists public.push_hedef(text, text);

create or replace function public.push_kaydet(
  p_room text, p_client text, p_sub jsonb, p_ua text default null, p_anahtar text default null)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_endpoint text;
  v_p256dh text;
  v_auth text;
  v_saat timestamptz := pg_catalog.date_trunc('hour', pg_catalog.now());
  v_n integer;
  v_all integer;
begin
  perform public.oda_yetki('push_kaydet', p_room, case when p_anahtar is not null then p_client end, p_anahtar);
  if p_room is null or p_room !~ '^[a-z2-9]{10}$' then
    raise exception 'push_kaydet: gecersiz oda' using errcode = '22023';
  end if;
  if p_client is null or p_client !~ '^[A-Za-z0-9_-]{1,64}$' then
    raise exception 'push_kaydet: gecersiz istemci' using errcode = '22023';
  end if;
  if p_sub is null or pg_catalog.jsonb_typeof(p_sub) <> 'object' then
    raise exception 'push_kaydet: gecersiz abonelik' using errcode = '22023';
  end if;
  v_endpoint := p_sub ->> 'endpoint';
  v_p256dh := p_sub #>> '{keys,p256dh}';
  v_auth := p_sub #>> '{keys,auth}';
  if v_endpoint is null or pg_catalog.length(v_endpoint) > 1024
     or v_endpoint !~ '^https://(fcm\.googleapis\.com|android\.googleapis\.com|updates\.push\.services\.mozilla\.com|[a-z0-9-]+\.push\.services\.mozilla\.com|web\.push\.apple\.com|[a-z0-9.-]+\.push\.apple\.com|[a-z0-9.-]+\.notify\.windows\.com)/[^[:space:]]+$' then
    raise exception 'push_kaydet: gecersiz adres' using errcode = '22023';
  end if;
  if v_p256dh is null or v_p256dh !~ '^[A-Za-z0-9_+/-]{86,88}={0,2}$' then
    raise exception 'push_kaydet: gecersiz anahtar' using errcode = '22023';
  end if;
  if v_auth is null or v_auth !~ '^[A-Za-z0-9_+/-]{22,24}={0,2}$' then
    raise exception 'push_kaydet: gecersiz anahtar' using errcode = '22023';
  end if;

  insert into public.push_kayit_rate as r (room, bucket, n) values (p_room, v_saat, 1)
    on conflict (room, bucket) do update set n = r.n + 1
    returning r.n into v_n;
  insert into public.push_kayit_rate as r (room, bucket, n) values ('*', v_saat, 1)
    on conflict (room, bucket) do update set n = r.n + 1
    returning r.n into v_all;
  if v_n > 20 or v_all > 300 then
    raise exception 'push_kaydet: cok fazla kayit' using errcode = '54000';
  end if;
  if v_all = 1 then
    delete from public.push_kayit_rate as r where r.bucket < v_saat - interval '1 day';
  end if;

  insert into public.push_sub as s (endpoint, room, client, p256dh, auth, ua, created_at, dogrulandi)
  values (v_endpoint, p_room, p_client, v_p256dh, v_auth, pg_catalog.left(p_ua, 200), pg_catalog.clock_timestamp(),
    p_anahtar is not null)
  on conflict (endpoint) do update
    set room = excluded.room,
        client = excluded.client,
        p256dh = excluded.p256dh,
        auth = excluded.auth,
        ua = excluded.ua,
        dogrulandi = excluded.dogrulandi,
        last_ok_at = pg_catalog.clock_timestamp(),
        fail_count = 0;

  -- Aynı cihazın eski aboneliği: tarayıcı yeni adres verdiyse eskisi artık çalışmaz.
  delete from public.push_sub as s
  where s.room = p_room and s.client = p_client and s.endpoint <> v_endpoint;

  -- Oda başına en çok 10 abonelik: fazlası en uzun süredir sessiz olanlardan silinir.
  delete from public.push_sub as s
  where s.endpoint in (
    select x.endpoint from public.push_sub as x
    where x.room = p_room
    order by x.endpoint = v_endpoint desc, coalesce(x.last_ok_at, x.created_at) desc, x.created_at desc
    offset 10);
  return true;
end;
$$;

create or replace function public.push_sil(p_endpoint text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_endpoint is null or pg_catalog.length(p_endpoint) > 1024 or p_endpoint !~ '^https://' then
    raise exception 'push_sil: gecersiz adres' using errcode = '22023';
  end if;
  delete from public.push_sub as s where s.endpoint = p_endpoint;
  return found;
end;
$$;

-- Edge Function 'bildir': hız sınırını sayar, odadaki diğer cihazların aboneliklerini döner.
-- Sınır: oda başına dakikada 20, toplam dakikada 600 bildirim isteği. Aboneliği olmayan oda sayılmaz (boş döner).
-- Yetki: p_anahtar verilmişse (p_from, p_anahtar) gönderen cihazın kimliğidir (bkz. push_kaydet).
-- Koruma altındaki odada yalnız onaylı cihazların abonelikleri hedeftir (push_sayilir).
create or replace function public.push_hedef(p_room text, p_from text, p_anahtar text default null)
returns table (endpoint text, p256dh text, auth text)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_dk timestamptz := pg_catalog.date_trunc('minute', pg_catalog.now());
  v_n integer;
  v_all integer;
begin
  perform public.oda_yetki('push_hedef', p_room, case when p_anahtar is not null then p_from end, p_anahtar);
  if p_room is null or p_room !~ '^[a-z2-9]{10}$' then
    raise exception 'push_hedef: gecersiz oda' using errcode = '22023';
  end if;
  if p_from is not null and p_from !~ '^[A-Za-z0-9_-]{1,64}$' then
    raise exception 'push_hedef: gecersiz gonderen' using errcode = '22023';
  end if;
  if not exists (select 1 from public.push_sub as s where s.room = p_room) then
    return;
  end if;

  insert into public.push_rate as r (room, bucket, n) values (p_room, v_dk, 1)
    on conflict (room, bucket) do update set n = r.n + 1
    returning r.n into v_n;
  if v_n > 20 then
    raise exception 'push_hedef: cok fazla bildirim' using errcode = '54000';
  end if;
  insert into public.push_rate as r (room, bucket, n) values ('*', v_dk, 1)
    on conflict (room, bucket) do update set n = r.n + 1
    returning r.n into v_all;
  if v_all > 600 then
    raise exception 'push_hedef: cok fazla bildirim' using errcode = '54000';
  end if;
  if v_all = 1 then
    delete from public.push_rate as r where r.bucket < v_dk - interval '1 hour';
  end if;

  return query
  select s.endpoint, s.p256dh, s.auth
  from public.push_sub as s
  where s.room = p_room and (p_from is null or s.client <> p_from)
    and public.push_sayilir(s.room, s.client, s.dogrulandi);
end;
$$;

-- Gönderim sonucu: başarılılar tazelenir, 404/410 dönenler silinir, 20 kez üst üste düşen silinir.
create or replace function public.push_sonuc(p_ok text[], p_gone text[], p_fail text[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.push_sub as s set last_ok_at = pg_catalog.now(), fail_count = 0
  where s.endpoint = any (coalesce(p_ok, '{}'::text[]));
  delete from public.push_sub as s
  where s.endpoint = any (coalesce(p_gone, '{}'::text[]));
  update public.push_sub as s set fail_count = s.fail_count + 1
  where s.endpoint = any (coalesce(p_fail, '{}'::text[]));
  delete from public.push_sub as s
  where s.endpoint = any (coalesce(p_fail, '{}'::text[])) and s.fail_count >= 20;
end;
$$;

-- 'hatirlat' RPC'leri sayfalı (PostgREST en çok 1000 satır döner): imleçten sonraki en çok p_limit satır.
-- Eski imzalar (sayfasız, tek oda) kaldırılır; aynı adlı iki imza PostgREST'te belirsizlik yaratır.
drop function if exists public.push_abonelikler();
drop function if exists public.hatirlat_belgeler(text[], integer);
drop function if exists public.hatirlat_isaretle(text, date, text);

-- Edge Function 'hatirlat': abonelikler, endpoint sırasıyla. p_after = önceki sayfanın son endpoint'i.
-- Koruma altındaki odada yalnız onaylı cihazların abonelikleri sayılır (push_sayilir).
-- push_abonelikler ve hatirlat_belgeler plpgsql: 7. bölümdeki push_sayilir çalışma anında çözülür.
create or replace function public.push_abonelikler(p_after text default null, p_limit integer default 500)
returns table (room text, client text, endpoint text, p256dh text, auth text)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  return query
  select s.room, s.client, s.endpoint, s.p256dh, s.auth
  from public.push_sub as s
  where (p_after is null or s.endpoint > p_after)
    and public.push_sayilir(s.room, s.client, s.dogrulandi)
  order by s.endpoint
  limit least(greatest(coalesce(p_limit, 500), 1), 1000);
end;
$$;

-- Edge Function 'hatirlat': sayılan aboneliği olan odaların belgeleri. 'gs' yalnız p_gs_gun gününün cevapları.
-- Sıra (room, kind, id) = birincil anahtar. p_after = önceki sayfanın son satırı: array[room, kind, id].
create or replace function public.hatirlat_belgeler(
  p_kinds text[], p_gs_gun integer default null, p_after text[] default null, p_limit integer default 500)
returns table (room text, kind text, id text, data jsonb)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  return query
  select d.room, d.kind, d.id, d.data
  from public.room_doc as d
  where d.kind = any (p_kinds)
    and not d.deleted
    and d.room in (select s.room from public.push_sub as s where public.push_sayilir(s.room, s.client, s.dogrulandi))
    and (d.kind <> 'gs' or (p_gs_gun is not null and d.id like (p_gs_gun::text || '-%')))
    and (p_after is null or (d.room, d.kind, d.id) > (p_after[1], p_after[2], p_after[3]))
  order by d.room, d.kind, d.id
  limit least(greatest(coalesce(p_limit, 500), 1), 1000);
end;
$$;

-- Edge Function 'hatirlat': odaları bugün için toplu işaretler. -> ilk kez işaretlenen odalar (gönderilecekler).
-- Dizi döner (satır değil): PostgREST satır sınırına takılmaz.
create or replace function public.hatirlat_isaretle(p_rooms text[], p_gun date, p_slot text)
returns text[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_yeni text[];
begin
  if p_rooms is null or p_gun is null or p_slot is null or p_slot not in ('sabah', 'aksam')
     or exists (select 1 from pg_catalog.unnest(p_rooms) as o(room) where o.room is null or o.room !~ '^[a-z2-9]{10}$') then
    raise exception 'hatirlat_isaretle: gecersiz girdi' using errcode = '22023';
  end if;
  with eklenen as (
    insert into public.push_gonderim as g (room, gun, slot)
    select distinct o.room, p_gun, p_slot from pg_catalog.unnest(p_rooms) as o(room)
    on conflict do nothing
    returning g.room
  )
  select coalesce(pg_catalog.array_agg(e.room order by e.room), '{}'::text[]) into v_yeni from eklenen as e;
  if pg_catalog.cardinality(v_yeni) > 0 then
    delete from public.push_gonderim as g where g.gun < p_gun - 40;
  end if;
  return v_yeni;
end;
$$;

revoke execute on function public.push_kaydet(text, text, jsonb, text, text) from public;
revoke execute on function public.push_sil(text) from public;
grant execute on function public.push_kaydet(text, text, jsonb, text, text) to anon, authenticated;
grant execute on function public.push_sil(text) to anon, authenticated;

-- Aşağıdakiler yalnız Edge Function'lar içindir (service_role). Supabase varsayılan olarak anon'a da
-- execute verir; bu yüzden anon ve authenticated'dan açıkça geri alınır.
revoke execute on function public.push_hedef(text, text, text) from public, anon, authenticated;
revoke execute on function public.push_sonuc(text[], text[], text[]) from public, anon, authenticated;
revoke execute on function public.push_abonelikler(text, integer) from public, anon, authenticated;
revoke execute on function public.hatirlat_belgeler(text[], integer, text[], integer) from public, anon, authenticated;
revoke execute on function public.hatirlat_isaretle(text[], date, text) from public, anon, authenticated;
grant execute on function public.push_hedef(text, text, text) to service_role;
grant execute on function public.push_sonuc(text[], text[], text[]) to service_role;
grant execute on function public.push_abonelikler(text, integer) to service_role;
grant execute on function public.hatirlat_belgeler(text[], integer, text[], integer) to service_role;
grant execute on function public.hatirlat_isaretle(text[], date, text) to service_role;

notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- 6. Zamanlanmış hatırlatmalar: pg_cron + pg_net → Edge Function 'hatirlat'
-- ---------------------------------------------------------------------------
-- Her gün 09:00 (özel günler, doğum günleri, kilometre taşları) ve 20:00 (günün sorusu) Türkiye saati.
-- pg_cron saati UTC'dir. Türkiye yıl boyu UTC+3: 09:00 → 06:00 UTC, 20:00 → 17:00 UTC.
-- Bu işler Supabase'i her gün iki kez çalıştırır (hareketsizlikten durmaya karşı da yardımcı olur).
--
-- Bir kez, elle (değeri depoya YAZMA): SQL Editor'de
--   select vault.create_secret('<uzun rastgele anahtar>', 'hatirlat_anahtar');
-- Aynı değer Edge Function secret'ı olarak: npx supabase secrets set HATIRLAT_ANAHTAR=<aynı değer>
-- İsteğe bağlı: select vault.create_secret('https://<ref>.supabase.co', 'project_url');
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

-- Edge Function'ı çağırır. Yalnız postgres (cron işi) çalıştırır; anon çağıramaz.
create or replace function public.hatirlat_cagir(p_slot text)
returns bigint
language plpgsql
set search_path = ''
as $$
declare
  v_url text;
  v_anahtar text;
begin
  if p_slot is null or p_slot not in ('sabah', 'aksam') then
    raise exception 'hatirlat_cagir: gecersiz vakit' using errcode = '22023';
  end if;
  select s.decrypted_secret into v_url from vault.decrypted_secrets as s where s.name = 'project_url';
  select s.decrypted_secret into v_anahtar from vault.decrypted_secrets as s where s.name = 'hatirlat_anahtar';
  if v_anahtar is null or v_anahtar = '' then
    raise warning 'hatirlat_cagir: vault icinde hatirlat_anahtar yok';
    return null;
  end if;
  return net.http_post(
    url := coalesce(v_url, 'https://blgtlflryxknyalutugw.supabase.co') || '/functions/v1/hatirlat',
    body := pg_catalog.jsonb_build_object('slot', p_slot),
    headers := pg_catalog.jsonb_build_object('Content-Type', 'application/json', 'x-hatirlat-anahtar', v_anahtar),
    timeout_milliseconds := 60000
  );
end;
$$;

revoke execute on function public.hatirlat_cagir(text) from public, anon, authenticated;

-- Adlı işler: aynı adla yeniden zamanlamak işi günceller, çoğaltmaz (dosya tekrar çalıştırılabilir).
select cron.schedule('biz-hatirlat-sabah', '0 6 * * *', $cron$select public.hatirlat_cagir('sabah')$cron$);
select cron.schedule('biz-hatirlat-aksam', '0 17 * * *', $cron$select public.hatirlat_cagir('aksam')$cron$);

-- ---------------------------------------------------------------------------
-- 7. Cihaz üyeliği ve yetki: oda kodu tek başına veriye erişim vermez
-- ---------------------------------------------------------------------------
-- Cihaz = istemcinin clientId'si. Her cihaz gizli bir anahtar tutar (32 bayt, base64url, 43 karakter);
-- sunucu yalnız sha256 özetini saklar. Kimlik = (p_cihaz, p_anahtar); ikisi de null = kimliksiz (eski istemci).
-- Koruma (oda.zorunlu): bu andan sonra kimliksiz çağrı reddedilir. Yeni oda: ilk katılmada başlar.
-- Eski oda (belge ya da oyun kaydı var): 3 gün geçiş. Bir cihaz çıkarılınca: hemen.
-- Geçersiz kimlik (yanlış anahtar, onaysız cihaz) koruma öncesinde de reddedilir.
-- Gerçek zamanlı kanal: koruma öncesi oda kodu (eski istemcilerle uyum), sonrası gizli 'kanal' (çıkarmada yenilenir).
-- Hata kodları: biçim 22023, hız ya da sınır 54000, yetki 42501.
-- Bu bölümün tabloları ve yardımcıları 2., 4. ve 5. bölümün plpgsql fonksiyonlarınca çalışma anında kullanılır.

create table if not exists public.oda (
  room text primary key,
  kanal text not null,
  zorunlu timestamptz not null,
  olusturma timestamptz not null default now(),
  kurtarma_ozet bytea,
  kurtarma_olusturan text
);

alter table public.oda enable row level security;
revoke all on table public.oda from anon, authenticated;

create table if not exists public.oda_cihaz (
  room text not null,
  cihaz text not null,
  anahtar_ozet bytea not null,
  ad text,
  durum text not null check (durum in ('onayli', 'bekliyor', 'reddedildi')),
  olusturma timestamptz not null default now(),
  son_gorulme timestamptz,
  onaylayan text,
  primary key (room, cihaz)
);

alter table public.oda_cihaz enable row level security;
revoke all on table public.oda_cihaz from anon, authenticated;

-- Davet: yalnız kodun özeti saklanır. 7 gün geçerli, tek kullanımlık.
create table if not exists public.oda_davet (
  ozet bytea primary key,
  room text not null,
  olusturan text not null,
  son timestamptz not null,
  kullanildi timestamptz
);

create index if not exists oda_davet_room_idx on public.oda_davet (room);

alter table public.oda_davet enable row level security;
revoke all on table public.oda_davet from anon, authenticated;

-- Katılma denemesi sayacı (saatlik): oda başına ve genel ('*'). Yalnız oda_katil yazar.
create table if not exists public.oda_katil_rate (
  room text not null,
  bucket timestamptz not null,
  n integer not null default 0,
  primary key (room, bucket)
);

alter table public.oda_katil_rate enable row level security;
revoke all on table public.oda_katil_rate from anon, authenticated;

-- Yardımcılar (anon ve authenticated çağıramaz) -------------------------------

-- Gizli değerin özeti: sha256(UTF-8). Anahtar, davet ve kurtarma kodu için.
create or replace function public.oda_ozet(p text)
returns bytea
language sql
stable
set search_path = ''
as $$
  select pg_catalog.sha256(pg_catalog.convert_to(p, 'UTF8'));
$$;

-- p_n (1–32) karakterlik rastgele dizi. Kaynak gen_random_uuid (güçlü rastgelelik); sha256 iki uuid'in
-- 244 rastgele bitini 32 düzgün bayta yayar. Alfabe 16 ya da 32 karakter: 256'yı böler, mod yanlılığı olmaz.
create or replace function public.oda_rastgele(p_alfabe text, p_n integer)
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_bayt bytea := pg_catalog.sha256(
    pg_catalog.uuid_send(pg_catalog.gen_random_uuid()) || pg_catalog.uuid_send(pg_catalog.gen_random_uuid()));
  v_m integer := pg_catalog.length(p_alfabe);
  v_out text := '';
begin
  if p_n is null or p_n < 1 or p_n > 32 or v_m is null or v_m not in (16, 32) then
    raise exception 'oda_rastgele: gecersiz girdi' using errcode = '22023';
  end if;
  for i in 0 .. p_n - 1 loop
    v_out := v_out || pg_catalog.substr(p_alfabe, pg_catalog.get_byte(v_bayt, i) % v_m + 1, 1);
  end loop;
  return v_out;
end;
$$;

-- oda_katil ve oda_durum yanıtı: { durum, kanal, zorunlu (ISO, UTC), ilk }.
-- kanal yalnız onaylıda dolu: koruma öncesi oda kodu, sonrası gizli kanal.
create or replace function public.oda_cevap(p_durum text, p_room text, p_kanal text, p_zorunlu timestamptz, p_ilk boolean)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select pg_catalog.jsonb_build_object(
    'durum', p_durum,
    'kanal', case when p_durum <> 'onayli' then null when pg_catalog.now() < p_zorunlu then p_room else p_kanal end,
    'zorunlu', pg_catalog.to_char(p_zorunlu at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'ilk', coalesce(p_ilk, false));
$$;

-- oda_katil ve oda_durum girdisi: oda, cihaz ve anahtar zorunlu; bozuksa 22023.
create or replace function public.oda_bicim(p_fn text, p_room text, p_cihaz text, p_anahtar text)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if p_room is null or p_room !~ '^[a-z2-9]{10}$' then
    raise exception '%: gecersiz oda', p_fn using errcode = '22023';
  end if;
  if p_cihaz is null or p_cihaz !~ '^[A-Za-z0-9_-]{1,64}$' then
    raise exception '%: gecersiz cihaz', p_fn using errcode = '22023';
  end if;
  if p_anahtar is null or p_anahtar !~ '^[A-Za-z0-9_-]{43}$' then
    raise exception '%: gecersiz anahtar', p_fn using errcode = '22023';
  end if;
end;
$$;

-- Abonelik sayılır mı: oda korumasızsa (satır yok ya da geçişte) her abonelik; koruma altında yalnız onaylı
-- cihazın anahtarıyla yaptığı kayıt (push_sub.dogrulandi).
create or replace function public.push_sayilir(p_room text, p_client text, p_dogrulandi boolean)
returns boolean
language sql
stable
set search_path = ''
as $$
  select not exists (select 1 from public.oda as o where o.room = p_room and o.zorunlu <= pg_catalog.now())
    or (coalesce(p_dogrulandi, false)
        and exists (select 1 from public.oda_cihaz as c
                    where c.room = p_room and c.cihaz = p_client and c.durum = 'onayli'));
$$;

-- Var olan RPC'lerin yetkisi (2., 4., 5. bölüm). Kimliksiz (ikisi null): oda satırı yoksa ya da koruma
-- başlamadıysa geçer. Kimlikli: biçim doğru, cihaz onaylı ve anahtar özeti eşit olmalı (koruma öncesinde de).
-- Geçerse son_gorulme en çok 10 dakikada bir yazılır. Değilse '<p_fn>: yetki yok' (42501).
-- Cihaz satırı 'for key share' ile kilitlenir: cihaz_cikar (delete) süren isteğin bitmesini bekler; böylece
-- çıkarılan cihazın o an yazdığı davet ya da belge çıkarmadan sonra kalmaz. son_gorulme güncellemesiyle çakışmaz.
create or replace function public.oda_yetki(p_fn text, p_room text, p_cihaz text, p_anahtar text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_zorunlu timestamptz;
  v_ozet bytea;
  v_durum text;
  v_son timestamptz;
begin
  if p_cihaz is null and p_anahtar is null then
    select o.zorunlu into v_zorunlu from public.oda as o where o.room = p_room;
    if v_zorunlu is null or pg_catalog.now() < v_zorunlu then
      return;
    end if;
  elsif p_cihaz ~ '^[A-Za-z0-9_-]{1,64}$' and p_anahtar ~ '^[A-Za-z0-9_-]{43}$' then
    select c.anahtar_ozet, c.durum, c.son_gorulme into v_ozet, v_durum, v_son
    from public.oda_cihaz as c
    where c.room = p_room and c.cihaz = p_cihaz
    for key share of c;
    if v_durum = 'onayli' and v_ozet = public.oda_ozet(p_anahtar) then
      if v_son is null or v_son < pg_catalog.now() - interval '10 minutes' then
        update public.oda_cihaz as c set son_gorulme = pg_catalog.now()
        where c.room = p_room and c.cihaz = p_cihaz;
      end if;
      return;
    end if;
  end if;
  raise exception '%: yetki yok', p_fn using errcode = '42501';
end;
$$;

-- Cihaz yönetimi ve geri yükleme: kimlik her zaman zorunlu (koruma öncesinde de).
create or replace function public.oda_yetki_kimlikli(p_fn text, p_room text, p_cihaz text, p_anahtar text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_cihaz is null or p_anahtar is null then
    raise exception '%: yetki yok', p_fn using errcode = '42501';
  end if;
  perform public.oda_yetki(p_fn, p_room, p_cihaz, p_anahtar);
end;
$$;

revoke execute on function public.oda_ozet(text) from public, anon, authenticated;
revoke execute on function public.oda_rastgele(text, integer) from public, anon, authenticated;
revoke execute on function public.oda_cevap(text, text, text, timestamptz, boolean) from public, anon, authenticated;
revoke execute on function public.oda_bicim(text, text, text, text) from public, anon, authenticated;
revoke execute on function public.push_sayilir(text, text, boolean) from public, anon, authenticated;
revoke execute on function public.oda_yetki(text, text, text, text) from public, anon, authenticated;
revoke execute on function public.oda_yetki_kimlikli(text, text, text, text) from public, anon, authenticated;

-- RPC'ler (anon çağırır) --------------------------------------------------------
-- Kilit sırası her yerde oda → oda_cihaz (kilitlenme olmasın): odayı değiştirenler önce oda satırını kilitler.

-- Odaya katıl. Onay yolları (ilk tutan):
--   a. kurucu: odada onaylı cihaz ve belge yok (ilk = true)
--   b. geçiş: yalnız koruma başlamadan (now() < zorunlu); oda satırından önce yazılmış 'kisi' belgesinin id'si
--      bu cihaz. Yazarlık (author) sayılmaz: son yazandır, oda kodunu bilen değiştirebilir. Çıkarma korumayı
--      hemen başlattığından çıkarılan cihaz bu yolla dönemez.
--   c. geçerli davet (aynı oda, süresi geçmemiş, kullanılmamış; harcanır)
--   d. geçerli kurtarma kodu (harcanır)
-- Hiçbiri tutmazsa yeni satır 'bekliyor'; var olan 'reddedildi' satırı reddedildi kalır.
-- Aynı cihaz farklı anahtarla gelirse 'cakisma' (satıra dokunulmaz). Çakışmayı yalnız geçerli kurtarma kodu
-- çözer (davet çözmez: başkasının kimliğini ele geçirmeye yol açar): satır yeni anahtara geçer ve onaylanır,
-- kod harcanır. Eski anahtarın sahibi her şeyi kaybeder: push abonelikleri ve davetleri silinir, kanal yenilenir.
-- Hız: onaylı cihazın girişi dışındaki denemeler, oda başına saatte 30. Genel: saatte 1000 yeni oda.
-- Sınır: odada en çok 8 onaylı; onaylı + bekleyen en çok 20 satır (aşılırsa 54000; harcanan davet geri alınır).
-- Temizlik: 30 gündür görülmeyen bekleyen ve reddedilen satırlar her katılma denemesinde; 7 günden eski
-- sahipsiz odalar (onaylı cihaz, belge ve oyun kaydı yok) saatin ilk yeni odasında silinir.
create or replace function public.oda_katil(
  p_room text, p_cihaz text, p_anahtar text,
  p_ad text default null, p_davet text default null, p_kurtarma text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ozet bytea;
  v_ad text := nullif(pg_catalog.left(pg_catalog.btrim(p_ad), 60), '');
  v_oda public.oda;
  v_c public.oda_cihaz;
  v_var boolean;
  v_yol text;
  v_durum text;
  v_onaylayan text;
  v_saat timestamptz := pg_catalog.date_trunc('hour', pg_catalog.now());
  v_n integer;
  v_all integer;
  v_kurtarma boolean;
begin
  perform public.oda_bicim('oda_katil', p_room, p_cihaz, p_anahtar);
  if pg_catalog.length(p_davet) > 64 or pg_catalog.length(p_kurtarma) > 64 then
    raise exception 'oda_katil: gecersiz kod' using errcode = '22023';
  end if;
  v_ozet := public.oda_ozet(p_anahtar);

  -- Oda satırı ilk katılmada oluşur ve kilitlenir (eşzamanlı iki kurucu olmaz).
  select * into v_oda from public.oda as o where o.room = p_room for update;
  if not found then
    -- Genel sınır yalnız yeni oda oluşturmayı sayar: var olan odaya katılma başkalarınca engellenemez.
    insert into public.oda_katil_rate as r (room, bucket, n) values ('*', v_saat, 1)
      on conflict (room, bucket) do update set n = r.n + 1
      returning r.n into v_all;
    if v_all > 1000 then
      raise exception 'oda_katil: cok fazla deneme' using errcode = '54000';
    end if;
    if v_all = 1 then
      delete from public.oda_katil_rate as r where r.bucket < v_saat - interval '1 day';
      with sahipsiz as (
        delete from public.oda as o
        where o.olusturma < pg_catalog.now() - interval '7 days'
          and not exists (select 1 from public.oda_cihaz as c where c.room = o.room and c.durum = 'onayli')
          and not exists (select 1 from public.room_doc as d where d.room = o.room)
          and not exists (select 1 from public.game_log as g where g.room = o.room)
        returning o.room
      ), cihazlar as (
        delete from public.oda_cihaz as c where c.room in (select s.room from sahipsiz as s)
      )
      delete from public.oda_davet as v where v.room in (select s.room from sahipsiz as s);
    end if;
    insert into public.oda (room, kanal, zorunlu)
    values (p_room, public.oda_rastgele('0123456789abcdef', 32),
      case when exists (select 1 from public.room_doc as d where d.room = p_room)
             or exists (select 1 from public.game_log as g where g.room = p_room)
           then pg_catalog.now() + interval '3 days'
           else pg_catalog.now() end)
    on conflict (room) do nothing;
    select * into v_oda from public.oda as o where o.room = p_room for update;
  end if;

  select * into v_c from public.oda_cihaz as c where c.room = p_room and c.cihaz = p_cihaz for update;
  v_var := found;

  -- Onaylı cihazın girişi: ad ve son görülme tazelenir; hız sınırına sayılmaz (her sayfa açılışında çağrılır).
  if v_var and v_c.anahtar_ozet = v_ozet and v_c.durum = 'onayli' then
    update public.oda_cihaz as c set ad = coalesce(v_ad, c.ad), son_gorulme = pg_catalog.now()
    where c.room = p_room and c.cihaz = p_cihaz;
    return public.oda_cevap('onayli', p_room, v_oda.kanal, v_oda.zorunlu, false);
  end if;

  -- Hata işlemi geri aldığından reddedilen deneme sayaca eklenmez.
  insert into public.oda_katil_rate as r (room, bucket, n) values (p_room, v_saat, 1)
    on conflict (room, bucket) do update set n = r.n + 1
    returning r.n into v_n;
  if v_n > 30 then
    raise exception 'oda_katil: cok fazla deneme' using errcode = '54000';
  end if;

  v_kurtarma := coalesce(p_kurtarma is not null and v_oda.kurtarma_ozet
    = public.oda_ozet(pg_catalog.upper(pg_catalog.replace(pg_catalog.btrim(p_kurtarma), '-', ''))), false);

  if v_var and v_c.anahtar_ozet <> v_ozet then
    if not v_kurtarma then
      return public.oda_cevap('cakisma', p_room, v_oda.kanal, v_oda.zorunlu, false);
    end if;
    -- Kurtarma koduyla çakışma çözülür: satır yeni anahtara geçer; eski anahtarın sahibi her şeyi kaybeder.
    if v_c.durum <> 'onayli'
       and (select count(*) from public.oda_cihaz as c where c.room = p_room and c.durum = 'onayli') >= 8 then
      raise exception 'oda_katil: cok fazla cihaz' using errcode = '54000';
    end if;
    update public.oda as o
    set kurtarma_ozet = null, kurtarma_olusturan = null, kanal = public.oda_rastgele('0123456789abcdef', 32)
    where o.room = p_room
    returning o.* into v_oda;
    delete from public.push_sub as s where s.room = p_room and s.client = p_cihaz;
    delete from public.oda_davet as v where v.room = p_room and v.olusturan = p_cihaz;
    update public.oda_cihaz as c
    set anahtar_ozet = v_ozet, durum = 'onayli', onaylayan = null, ad = coalesce(v_ad, c.ad),
        son_gorulme = pg_catalog.now()
    where c.room = p_room and c.cihaz = p_cihaz;
    return public.oda_cevap('onayli', p_room, v_oda.kanal, v_oda.zorunlu, false);
  end if;

  -- 30 gündür görülmeyen bekleyen ve reddedilen satırlar (bu cihazınki hariç) silinir.
  delete from public.oda_cihaz as c
  where c.room = p_room and c.cihaz <> p_cihaz and c.durum <> 'onayli'
    and coalesce(c.son_gorulme, c.olusturma) < pg_catalog.now() - interval '30 days';

  if not exists (select 1 from public.oda_cihaz as c where c.room = p_room and c.durum = 'onayli')
     and not exists (select 1 from public.room_doc as d where d.room = p_room) then
    v_yol := 'kurucu';
  elsif pg_catalog.now() < v_oda.zorunlu
        and exists (select 1 from public.room_doc as d
                    where d.room = p_room and d.kind = 'kisi' and d.id = p_cihaz
                      and d.created_at < v_oda.olusturma) then
    v_yol := 'gecis';
  end if;
  if v_yol is null and p_davet is not null then
    update public.oda_davet as v set kullanildi = pg_catalog.now()
    where v.ozet = public.oda_ozet(p_davet) and v.room = p_room
      and v.son > pg_catalog.now() and v.kullanildi is null
    returning v.olusturan into v_onaylayan;
    if found then
      v_yol := 'davet';
    end if;
  end if;
  if v_yol is null and v_kurtarma then
    update public.oda as o set kurtarma_ozet = null, kurtarma_olusturan = null where o.room = p_room;
    v_yol := 'kurtarma';
  end if;

  v_durum := case when v_yol is not null then 'onayli' when v_var then v_c.durum else 'bekliyor' end;
  if v_durum = 'onayli'
     and (select count(*) from public.oda_cihaz as c where c.room = p_room and c.durum = 'onayli') >= 8 then
    raise exception 'oda_katil: cok fazla cihaz' using errcode = '54000';
  end if;
  if v_var then
    update public.oda_cihaz as c
    set durum = v_durum,
        onaylayan = case when v_yol is not null then v_onaylayan else c.onaylayan end,
        ad = coalesce(v_ad, c.ad),
        son_gorulme = pg_catalog.now()
    where c.room = p_room and c.cihaz = p_cihaz;
  else
    if (select count(*) from public.oda_cihaz as c
        where c.room = p_room and c.durum in ('onayli', 'bekliyor')) >= 20 then
      raise exception 'oda_katil: cok fazla cihaz' using errcode = '54000';
    end if;
    insert into public.oda_cihaz (room, cihaz, anahtar_ozet, ad, durum, son_gorulme, onaylayan)
    values (p_room, p_cihaz, v_ozet, v_ad, v_durum, pg_catalog.now(), v_onaylayan);
  end if;
  return public.oda_cevap(v_durum, p_room, v_oda.kanal, v_oda.zorunlu, v_yol = 'kurucu');
end;
$$;

-- Bu cihazın durumu (onay bekleyen ekran 5 sn'de bir sorar). Hiçbir şey değiştirmez; yalnız son_gorulme
-- (en çok 10 dakikada bir). Oda ya da cihaz satırı yoksa 'yok' (ör. cihaz çıkarıldı).
create or replace function public.oda_durum(p_room text, p_cihaz text, p_anahtar text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_oda public.oda;
  v_c public.oda_cihaz;
begin
  perform public.oda_bicim('oda_durum', p_room, p_cihaz, p_anahtar);
  select * into v_oda from public.oda as o where o.room = p_room;
  if not found then
    return public.oda_cevap('yok', p_room, null, null, false);
  end if;
  select * into v_c from public.oda_cihaz as c where c.room = p_room and c.cihaz = p_cihaz;
  if not found then
    return public.oda_cevap('yok', p_room, v_oda.kanal, v_oda.zorunlu, false);
  end if;
  if v_c.anahtar_ozet <> public.oda_ozet(p_anahtar) then
    return public.oda_cevap('cakisma', p_room, v_oda.kanal, v_oda.zorunlu, false);
  end if;
  if v_c.son_gorulme is null or v_c.son_gorulme < pg_catalog.now() - interval '10 minutes' then
    update public.oda_cihaz as c set son_gorulme = pg_catalog.now()
    where c.room = p_room and c.cihaz = p_cihaz;
  end if;
  return public.oda_cevap(v_c.durum, p_room, v_oda.kanal, v_oda.zorunlu, false);
end;
$$;

-- Odanın cihazları, katılma sırasıyla. Çağıran onaylı olmalı.
create or replace function public.cihaz_listele(p_room text, p_cihaz text, p_anahtar text)
returns table (cihaz text, ad text, durum text, olusturma timestamptz, son_gorulme timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  perform public.oda_yetki_kimlikli('cihaz_listele', p_room, p_cihaz, p_anahtar);
  return query
  select c.cihaz, c.ad, c.durum, c.olusturma, c.son_gorulme
  from public.oda_cihaz as c
  where c.room = p_room
  order by c.olusturma, c.cihaz;
end;
$$;

-- Bekleyen ya da reddedilen cihazı onaylar. -> değişti mi. En çok 8 onaylı (54000).
create or replace function public.cihaz_onayla(p_room text, p_cihaz text, p_anahtar text, p_hedef text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform 1 from public.oda as o where o.room = p_room for update;
  perform public.oda_yetki_kimlikli('cihaz_onayla', p_room, p_cihaz, p_anahtar);
  if p_hedef is null or p_hedef !~ '^[A-Za-z0-9_-]{1,64}$' then
    raise exception 'cihaz_onayla: gecersiz hedef' using errcode = '22023';
  end if;
  if not exists (select 1 from public.oda_cihaz as c
                 where c.room = p_room and c.cihaz = p_hedef and c.durum in ('bekliyor', 'reddedildi')) then
    return false;
  end if;
  if (select count(*) from public.oda_cihaz as c where c.room = p_room and c.durum = 'onayli') >= 8 then
    raise exception 'cihaz_onayla: cok fazla cihaz' using errcode = '54000';
  end if;
  update public.oda_cihaz as c set durum = 'onayli', onaylayan = p_cihaz
  where c.room = p_room and c.cihaz = p_hedef;
  return true;
end;
$$;

-- Bekleyen cihazı reddeder. -> değişti mi.
create or replace function public.cihaz_reddet(p_room text, p_cihaz text, p_anahtar text, p_hedef text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.oda_yetki_kimlikli('cihaz_reddet', p_room, p_cihaz, p_anahtar);
  if p_hedef is null or p_hedef !~ '^[A-Za-z0-9_-]{1,64}$' then
    raise exception 'cihaz_reddet: gecersiz hedef' using errcode = '22023';
  end if;
  update public.oda_cihaz as c set durum = 'reddedildi'
  where c.room = p_room and c.cihaz = p_hedef and c.durum = 'bekliyor';
  return found;
end;
$$;

-- Cihazı odadan çıkarır (kendini de). Push abonelikleri, kullanılmamış davetleri ve oluşturduğu kurtarma kodu
-- silinir, kanal yenilenir, koruma hemen başlar. -> silindi mi.
create or replace function public.cihaz_cikar(p_room text, p_cihaz text, p_anahtar text, p_hedef text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform 1 from public.oda as o where o.room = p_room for update;
  perform public.oda_yetki_kimlikli('cihaz_cikar', p_room, p_cihaz, p_anahtar);
  if p_hedef is null or p_hedef !~ '^[A-Za-z0-9_-]{1,64}$' then
    raise exception 'cihaz_cikar: gecersiz hedef' using errcode = '22023';
  end if;
  delete from public.oda_cihaz as c where c.room = p_room and c.cihaz = p_hedef;
  if not found then
    return false;
  end if;
  delete from public.push_sub as s where s.room = p_room and s.client = p_hedef;
  delete from public.oda_davet as v where v.room = p_room and v.olusturan = p_hedef;
  update public.oda as o
  set kanal = public.oda_rastgele('0123456789abcdef', 32),
      zorunlu = least(o.zorunlu, pg_catalog.now()),
      kurtarma_ozet = case when o.kurtarma_olusturan = p_hedef then null else o.kurtarma_ozet end,
      kurtarma_olusturan = case when o.kurtarma_olusturan = p_hedef then null else o.kurtarma_olusturan end
  where o.room = p_room;
  return true;
end;
$$;

-- Davet kodu: 32 karakter [a-z2-9] (l, o, 0, 1 yok), 7 gün, tek kullanım. Odada en çok 5 geçerli davet:
-- fazlası en eskiden silinir; kullanılmış ve süresi geçmişler de temizlenir.
create or replace function public.davet_olustur(p_room text, p_cihaz text, p_anahtar text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_kod text;
begin
  perform public.oda_yetki_kimlikli('davet_olustur', p_room, p_cihaz, p_anahtar);
  v_kod := public.oda_rastgele('abcdefghijkmnpqrstuvwxyz23456789', 32);
  delete from public.oda_davet as v
  where v.room = p_room and (v.kullanildi is not null or v.son <= pg_catalog.now());
  insert into public.oda_davet (ozet, room, olusturan, son)
  values (public.oda_ozet(v_kod), p_room, p_cihaz, pg_catalog.clock_timestamp() + interval '7 days');
  delete from public.oda_davet as v
  where v.ozet in (select x.ozet from public.oda_davet as x where x.room = p_room order by x.son desc offset 5);
  return v_kod;
end;
$$;

-- Kurtarma kodu: 16 karakter (I, O, 0, 1 yok), 'ABCD-EFGH-JKLM-NPQR'. Yalnız özeti (tiresiz) saklanır;
-- yenisi eskisini geçersiz yapar. Oluşturan cihaz çıkarılınca kod silinir (cihaz_cikar).
create or replace function public.kurtarma_olustur(p_room text, p_cihaz text, p_anahtar text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_kod text;
begin
  perform 1 from public.oda as o where o.room = p_room for update;
  perform public.oda_yetki_kimlikli('kurtarma_olustur', p_room, p_cihaz, p_anahtar);
  v_kod := public.oda_rastgele('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 16);
  update public.oda as o set kurtarma_ozet = public.oda_ozet(v_kod), kurtarma_olusturan = p_cihaz
  where o.room = p_room;
  return pg_catalog.concat_ws('-', pg_catalog.substr(v_kod, 1, 4), pg_catalog.substr(v_kod, 5, 4),
    pg_catalog.substr(v_kod, 9, 4), pg_catalog.substr(v_kod, 13, 4));
end;
$$;

-- Yedekten geri yükleme. p_belgeler = en çok 200 belge: { kind, id, data, author?, deleted?, created_at?, updated_at? }
-- (doc_put biçim kuralları). Kurallar:
--   - Satır yoksa eklenir (created_at yedekten, yoksa şimdi; gelecekteki created_at şimdiye çekilir).
--   - Var olan satır silinmişse yedekteki canlı kopya geri yazılır (geri yükleme silinenleri getirir).
--   - Var olan canlı satıra yalnız yedekteki updated_at daha yeniyse yazılır.
--   - Yedekteki silinmiş kopya var olan satırı değiştirmez.
-- Yazılan satırın updated_at'i yazma anıdır (clock_timestamp): diğer cihazların artımlı eşitlemesi
-- (updated_at > since) görsün; aynı yedek ikinci kez yüklenince hiçbir şey yazılmaz.
-- Biri bozuksa hiçbiri yazılmaz (22023). Sınır (doc_sinir) bir kez, yazılan bayt kadar. -> yazılan satır sayısı.
create or replace function public.doc_ice_aktar(p_room text, p_cihaz text, p_anahtar text, p_belgeler jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_e jsonb;
  v_i integer := 0;
  v_kind text;
  v_id text;
  v_author text;
  v_del boolean;
  v_data jsonb;
  v_c timestamptz;
  v_u timestamptz;
  v_simdi timestamptz := pg_catalog.now();
  v_bayt integer := 0;
  v_yazilan integer := 0;
begin
  perform public.oda_yetki_kimlikli('doc_ice_aktar', p_room, p_cihaz, p_anahtar);
  if p_belgeler is null or pg_catalog.jsonb_typeof(p_belgeler) <> 'array'
     or pg_catalog.jsonb_array_length(p_belgeler) > 200 then
    raise exception 'doc_ice_aktar: gecersiz liste' using errcode = '22023';
  end if;

  for v_e in select e.value from pg_catalog.jsonb_array_elements(p_belgeler) as e loop
    v_i := v_i + 1;
    if pg_catalog.jsonb_typeof(v_e) <> 'object' then
      raise exception 'doc_ice_aktar: gecersiz belge (%)', v_i using errcode = '22023';
    end if;
    v_kind := v_e ->> 'kind';
    v_id := v_e ->> 'id';
    v_author := v_e ->> 'author';
    if v_kind is null or v_kind !~ '^[a-z]{2,20}$' or v_id is null or v_id !~ '^[A-Za-z0-9_-]{1,64}$'
       or (v_author is not null and v_author !~ '^[A-Za-z0-9_-]{1,64}$')
       or coalesce(pg_catalog.jsonb_typeof(v_e -> 'deleted'), 'null') not in ('boolean', 'null') then
      raise exception 'doc_ice_aktar: gecersiz belge (%)', v_i using errcode = '22023';
    end if;
    v_del := coalesce((v_e ->> 'deleted')::boolean, false);
    v_data := case when v_del then '{}'::jsonb else v_e -> 'data' end;
    if v_data is null or pg_catalog.jsonb_typeof(v_data) <> 'object' then
      raise exception 'doc_ice_aktar: gecersiz veri (%)', v_i using errcode = '22023';
    end if;
    if pg_catalog.octet_length(v_data::text) > 32768 then
      raise exception 'doc_ice_aktar: veri cok buyuk (%)', v_i using errcode = '22023';
    end if;
    begin
      if (v_e ->> 'created_at') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}[T ][0-9]{2}:[0-9]{2}'
         or (v_e ->> 'updated_at') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}[T ][0-9]{2}:[0-9]{2}' then
        raise exception 'bicim';
      end if;
      v_c := (v_e ->> 'created_at')::timestamptz;
      v_u := (v_e ->> 'updated_at')::timestamptz;
    exception when others then
      raise exception 'doc_ice_aktar: gecersiz zaman (%)', v_i using errcode = '22023';
    end;
    if v_c > v_simdi then
      v_c := v_simdi;
    end if;

    insert into public.room_doc as d (room, kind, id, data, author, deleted, created_at, updated_at)
    values (p_room, v_kind, v_id, v_data, v_author, v_del, coalesce(v_c, v_simdi), pg_catalog.clock_timestamp())
    on conflict (room, kind, id) do update
      set data = excluded.data,
          author = excluded.author,
          deleted = false,
          updated_at = pg_catalog.clock_timestamp()
      where not v_del and (d.deleted or v_u > d.updated_at);
    if found then
      v_yazilan := v_yazilan + 1;
      v_bayt := v_bayt + pg_catalog.octet_length(v_data::text);
    end if;
  end loop;

  perform public.doc_sinir('doc_ice_aktar', p_room, v_bayt);
  return v_yazilan;
end;
$$;

revoke execute on function public.oda_katil(text, text, text, text, text, text) from public;
revoke execute on function public.oda_durum(text, text, text) from public;
revoke execute on function public.cihaz_listele(text, text, text) from public;
revoke execute on function public.cihaz_onayla(text, text, text, text) from public;
revoke execute on function public.cihaz_reddet(text, text, text, text) from public;
revoke execute on function public.cihaz_cikar(text, text, text, text) from public;
revoke execute on function public.davet_olustur(text, text, text) from public;
revoke execute on function public.kurtarma_olustur(text, text, text) from public;
revoke execute on function public.doc_ice_aktar(text, text, text, jsonb) from public;

grant execute on function public.oda_katil(text, text, text, text, text, text) to anon, authenticated;
grant execute on function public.oda_durum(text, text, text) to anon, authenticated;
grant execute on function public.cihaz_listele(text, text, text) to anon, authenticated;
grant execute on function public.cihaz_onayla(text, text, text, text) to anon, authenticated;
grant execute on function public.cihaz_reddet(text, text, text, text) to anon, authenticated;
grant execute on function public.cihaz_cikar(text, text, text, text) to anon, authenticated;
grant execute on function public.davet_olustur(text, text, text) to anon, authenticated;
grant execute on function public.kurtarma_olustur(text, text, text) to anon, authenticated;
grant execute on function public.doc_ice_aktar(text, text, text, jsonb) to anon, authenticated;

notify pgrst, 'reload schema';
