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

create or replace function public.doc_put(
  p_room text, p_kind text, p_id text, p_data jsonb, p_author text, p_deleted boolean default false)
returns table (id text, data jsonb, author text, deleted boolean, created_at timestamptz, updated_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
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

-- Alan düzeyinde birleştirme: iki kişi aynı belgeye aynı anda farklı alan yazınca biri kaybolmasın.
-- p_patch üst düzey anahtarları tek tek yazar; 'ana.alt' iç içe tek alanı yazar; değer null ise alanı siler.
-- Satır kilitlenir (for update): eşzamanlı birleştirmeler sırayla uygulanır. Belge yoksa {} üstüne kurulur.
create or replace function public.doc_patch(
  p_room text, p_kind text, p_id text, p_patch jsonb, p_author text)
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

revoke execute on function public.doc_patch(text, text, text, jsonb, text) from public;
grant execute on function public.doc_patch(text, text, text, jsonb, text) to anon, authenticated;

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
create or replace function public.push_kaydet(p_room text, p_client text, p_sub jsonb, p_ua text default null)
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

  insert into public.push_sub as s (endpoint, room, client, p256dh, auth, ua, created_at)
  values (v_endpoint, p_room, p_client, v_p256dh, v_auth, pg_catalog.left(p_ua, 200), pg_catalog.clock_timestamp())
  on conflict (endpoint) do update
    set room = excluded.room,
        client = excluded.client,
        p256dh = excluded.p256dh,
        auth = excluded.auth,
        ua = excluded.ua,
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
create or replace function public.push_hedef(p_room text, p_from text)
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
  where s.room = p_room and (p_from is null or s.client <> p_from);
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
create or replace function public.push_abonelikler(p_after text default null, p_limit integer default 500)
returns table (room text, client text, endpoint text, p256dh text, auth text)
language sql
stable
security definer
set search_path = ''
as $$
  select s.room, s.client, s.endpoint, s.p256dh, s.auth
  from public.push_sub as s
  where p_after is null or s.endpoint > p_after
  order by s.endpoint
  limit least(greatest(coalesce(p_limit, 500), 1), 1000);
$$;

-- hatirlat_belgeler 7. bölümde: FCM belirteci olan odaları da kapsar (fcm_sub orada tanımlı).

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

revoke execute on function public.push_kaydet(text, text, jsonb, text) from public;
revoke execute on function public.push_sil(text) from public;
grant execute on function public.push_kaydet(text, text, jsonb, text) to anon, authenticated;
grant execute on function public.push_sil(text) to anon, authenticated;

-- Aşağıdakiler yalnız Edge Function'lar içindir (service_role). Supabase varsayılan olarak anon'a da
-- execute verir; bu yüzden anon ve authenticated'dan açıkça geri alınır.
revoke execute on function public.push_hedef(text, text) from public, anon, authenticated;
revoke execute on function public.push_sonuc(text[], text[], text[]) from public, anon, authenticated;
revoke execute on function public.push_abonelikler(text, integer) from public, anon, authenticated;
revoke execute on function public.hatirlat_isaretle(text[], date, text) from public, anon, authenticated;
grant execute on function public.push_hedef(text, text) to service_role;
grant execute on function public.push_sonuc(text[], text[], text[]) to service_role;
grant execute on function public.push_abonelikler(text, integer) to service_role;
grant execute on function public.hatirlat_isaretle(text[], date, text) to service_role;

notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- 6. Zamanlanmış hatırlatmalar: pg_cron + pg_net → Edge Function 'hatirlat'
-- ---------------------------------------------------------------------------
-- Her gün 09:00 (özel günler, doğum günleri, kilometre taşları) ve 20:00 (günün sorusu) Türkiye saati.
-- pg_cron saati UTC'dir. Türkiye yıl boyu UTC+3: 09:00 → 06:00 UTC, 20:00 → 17:00 UTC.
-- Bu işler Supabase'i her gün iki kez çalıştırır (hareketsizlikten durmaya karşı da yardımcı olur).
--
-- Hatırlatma anahtarı (cron → Edge Function) vault'ta 'hatirlat_anahtar' adıyla durur; aşağıdaki blok yoksa
-- rastgele üretir, varsa dokunmaz. Edge Function onu RPC hatirlat_anahtar ile okur (5 dk önbellek);
-- HATIRLAT_ANAHTAR secret'ı yalnız yedektir. Değer hiçbir yere elle yazılmaz. Yenilemek için SQL Editor'de:
--   select vault.update_secret((select id from vault.secrets where name = 'hatirlat_anahtar'),
--     encode(extensions.gen_random_bytes(32), 'hex'));
-- İsteğe bağlı: select vault.create_secret('https://<ref>.supabase.co', 'project_url');
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
create extension if not exists pgcrypto with schema extensions;

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'hatirlat_anahtar') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'hatirlat_anahtar');
  end if;
end
$$;

-- Edge Function 'hatirlat' beklediği anahtarı buradan okur. Yalnız service_role çağırır.
create or replace function public.hatirlat_anahtar()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select s.decrypted_secret from vault.decrypted_secrets as s where s.name = 'hatirlat_anahtar' limit 1;
$$;

revoke execute on function public.hatirlat_anahtar() from public, anon, authenticated;
grant execute on function public.hatirlat_anahtar() to service_role;

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
-- 7. Anlık bildirim (FCM, Android uygulaması): fcm_sub tablosu + RPC (js/core/mobil.js, functions/bildir, functions/hatirlat)
-- ---------------------------------------------------------------------------
-- Android uygulamasının WebView'ı Web Push desteklemez; uygulama Firebase Cloud Messaging belirteci (token) kaydeder.
-- Edge Function'lar FCM HTTP v1 ile gönderir (secret FCM_SERVICE_ACCOUNT). Bir cihaz (client) odada tek belirteç tutar.
create table if not exists public.fcm_sub (
  token text primary key,
  room text not null,
  client text not null,
  created_at timestamptz not null default now(),
  last_ok_at timestamptz,
  fail_count integer not null default 0
);

create index if not exists fcm_sub_room_idx on public.fcm_sub (room);

alter table public.fcm_sub enable row level security;
revoke all on table public.fcm_sub from anon, authenticated;

-- Belirteci kaydet ya da güncelle. Belirteç: [A-Za-z0-9_:-], 20–4096 karakter.
-- Sınır push_kaydet ile ortak sayaç (push_kayit_rate): oda başına saatte 20, genel saatte 300 kayıt.
create or replace function public.fcm_kaydet(p_room text, p_client text, p_token text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_saat timestamptz := pg_catalog.date_trunc('hour', pg_catalog.now());
  v_n integer;
  v_all integer;
begin
  if p_room is null or p_room !~ '^[a-z2-9]{10}$' then
    raise exception 'fcm_kaydet: gecersiz oda' using errcode = '22023';
  end if;
  if p_client is null or p_client !~ '^[A-Za-z0-9_-]{1,64}$' then
    raise exception 'fcm_kaydet: gecersiz istemci' using errcode = '22023';
  end if;
  -- Postgres düzenli ifadesinde tekrar sınırı en çok 255: uzunluk ayrıca denetlenir.
  if p_token is null or pg_catalog.length(p_token) not between 20 and 4096 or p_token !~ '^[A-Za-z0-9_:-]+$' then
    raise exception 'fcm_kaydet: gecersiz belirtec' using errcode = '22023';
  end if;

  insert into public.push_kayit_rate as r (room, bucket, n) values (p_room, v_saat, 1)
    on conflict (room, bucket) do update set n = r.n + 1
    returning r.n into v_n;
  insert into public.push_kayit_rate as r (room, bucket, n) values ('*', v_saat, 1)
    on conflict (room, bucket) do update set n = r.n + 1
    returning r.n into v_all;
  if v_n > 20 or v_all > 300 then
    raise exception 'fcm_kaydet: cok fazla kayit' using errcode = '54000';
  end if;
  if v_all = 1 then
    delete from public.push_kayit_rate as r where r.bucket < v_saat - interval '1 day';
  end if;

  insert into public.fcm_sub as f (token, room, client, created_at)
  values (p_token, p_room, p_client, pg_catalog.clock_timestamp())
  on conflict (token) do update
    set room = excluded.room,
        client = excluded.client,
        last_ok_at = pg_catalog.clock_timestamp(),
        fail_count = 0;

  -- Aynı cihazın eski belirteci: FCM yenisini verdiyse eskisi artık çalışmaz.
  delete from public.fcm_sub as f
  where f.room = p_room and f.client = p_client and f.token <> p_token;

  -- Oda başına en çok 10 belirteç: fazlası en uzun süredir sessiz olanlardan silinir.
  delete from public.fcm_sub as f
  where f.token in (
    select x.token from public.fcm_sub as x
    where x.room = p_room
    order by x.token = p_token desc, coalesce(x.last_ok_at, x.created_at) desc, x.created_at desc
    offset 10);
  return true;
end;
$$;

create or replace function public.fcm_sil(p_token text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_token is null or pg_catalog.length(p_token) not between 20 and 4096 or p_token !~ '^[A-Za-z0-9_:-]+$' then
    raise exception 'fcm_sil: gecersiz belirtec' using errcode = '22023';
  end if;
  delete from public.fcm_sub as f where f.token = p_token;
  return found;
end;
$$;

-- Edge Function 'bildir': hız sınırını sayar, odadaki diğer cihazların FCM belirteçlerini döner.
-- Sayaç push_rate tablosunda ayrı anahtarlarla ('fcm:<oda>', 'fcm:*'); sınırlar push_hedef ile aynı:
-- oda başına dakikada 20, toplam dakikada 600. Belirteci olmayan oda sayılmaz (boş döner).
create or replace function public.fcm_hedef(p_room text, p_from text)
returns table (token text)
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
  if p_room is null or p_room !~ '^[a-z2-9]{10}$' then
    raise exception 'fcm_hedef: gecersiz oda' using errcode = '22023';
  end if;
  if p_from is not null and p_from !~ '^[A-Za-z0-9_-]{1,64}$' then
    raise exception 'fcm_hedef: gecersiz gonderen' using errcode = '22023';
  end if;
  if not exists (select 1 from public.fcm_sub as f where f.room = p_room) then
    return;
  end if;

  insert into public.push_rate as r (room, bucket, n) values ('fcm:' || p_room, v_dk, 1)
    on conflict (room, bucket) do update set n = r.n + 1
    returning r.n into v_n;
  if v_n > 20 then
    raise exception 'fcm_hedef: cok fazla bildirim' using errcode = '54000';
  end if;
  insert into public.push_rate as r (room, bucket, n) values ('fcm:*', v_dk, 1)
    on conflict (room, bucket) do update set n = r.n + 1
    returning r.n into v_all;
  if v_all > 600 then
    raise exception 'fcm_hedef: cok fazla bildirim' using errcode = '54000';
  end if;
  if v_all = 1 then
    delete from public.push_rate as r where r.bucket < v_dk - interval '1 hour';
  end if;

  return query
  select f.token
  from public.fcm_sub as f
  where f.room = p_room and (p_from is null or f.client <> p_from);
end;
$$;

-- Gönderim sonucu: başarılılar tazelenir, geçersiz belirteçler (UNREGISTERED vb.) silinir, 20 kez üst üste düşen silinir.
create or replace function public.fcm_sonuc(p_ok text[], p_gone text[], p_fail text[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.fcm_sub as f set last_ok_at = pg_catalog.now(), fail_count = 0
  where f.token = any (coalesce(p_ok, '{}'::text[]));
  delete from public.fcm_sub as f
  where f.token = any (coalesce(p_gone, '{}'::text[]));
  update public.fcm_sub as f set fail_count = f.fail_count + 1
  where f.token = any (coalesce(p_fail, '{}'::text[]));
  delete from public.fcm_sub as f
  where f.token = any (coalesce(p_fail, '{}'::text[])) and f.fail_count >= 20;
end;
$$;

-- Edge Function 'hatirlat': belirteçler, token sırasıyla sayfalı. p_after = önceki sayfanın son belirteci.
create or replace function public.fcm_abonelikler(p_after text default null, p_limit integer default 500)
returns table (room text, client text, token text)
language sql
stable
security definer
set search_path = ''
as $$
  select f.room, f.client, f.token
  from public.fcm_sub as f
  where p_after is null or f.token > p_after
  order by f.token
  limit least(greatest(coalesce(p_limit, 500), 1), 1000);
$$;

-- Edge Function 'hatirlat': Web Push aboneliği ya da FCM belirteci olan odaların belgeleri.
-- 'gs' yalnız p_gs_gun gününün cevapları. Sıra (room, kind, id) = birincil anahtar.
-- p_after = önceki sayfanın son satırı: array[room, kind, id].
create or replace function public.hatirlat_belgeler(
  p_kinds text[], p_gs_gun integer default null, p_after text[] default null, p_limit integer default 500)
returns table (room text, kind text, id text, data jsonb)
language sql
stable
security definer
set search_path = ''
as $$
  select d.room, d.kind, d.id, d.data
  from public.room_doc as d
  where d.kind = any (p_kinds)
    and not d.deleted
    and d.room in (select s.room from public.push_sub as s union select f.room from public.fcm_sub as f)
    and (d.kind <> 'gs' or (p_gs_gun is not null and d.id like (p_gs_gun::text || '-%')))
    and (p_after is null or (d.room, d.kind, d.id) > (p_after[1], p_after[2], p_after[3]))
  order by d.room, d.kind, d.id
  limit least(greatest(coalesce(p_limit, 500), 1), 1000);
$$;

revoke execute on function public.fcm_kaydet(text, text, text) from public;
revoke execute on function public.fcm_sil(text) from public;
grant execute on function public.fcm_kaydet(text, text, text) to anon, authenticated;
grant execute on function public.fcm_sil(text) to anon, authenticated;

-- Aşağıdakiler yalnız Edge Function'lar içindir (service_role).
revoke execute on function public.fcm_hedef(text, text) from public, anon, authenticated;
revoke execute on function public.fcm_sonuc(text[], text[], text[]) from public, anon, authenticated;
revoke execute on function public.fcm_abonelikler(text, integer) from public, anon, authenticated;
revoke execute on function public.hatirlat_belgeler(text[], integer, text[], integer) from public, anon, authenticated;
grant execute on function public.fcm_hedef(text, text) to service_role;
grant execute on function public.fcm_sonuc(text[], text[], text[]) to service_role;
grant execute on function public.fcm_abonelikler(text, integer) to service_role;
grant execute on function public.hatirlat_belgeler(text[], integer, text[], integer) to service_role;

notify pgrst, 'reload schema';
