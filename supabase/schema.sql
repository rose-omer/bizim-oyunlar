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
-- Sınır: oda başına dakikada 20, toplam dakikada 600 bildirim isteği.
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

-- Edge Function 'hatirlat': tüm abonelikler.
create or replace function public.push_abonelikler()
returns table (room text, client text, endpoint text, p256dh text, auth text)
language sql
stable
security definer
set search_path = ''
as $$
  select s.room, s.client, s.endpoint, s.p256dh, s.auth
  from public.push_sub as s
  order by s.room;
$$;

-- Edge Function 'hatirlat': aboneliği olan odaların belgeleri. 'gs' yalnız p_gs_gun gününün cevapları.
create or replace function public.hatirlat_belgeler(p_kinds text[], p_gs_gun integer default null)
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
    and d.room in (select s.room from public.push_sub as s)
    and (d.kind <> 'gs' or (p_gs_gun is not null and d.id like (p_gs_gun::text || '-%')));
$$;

-- Edge Function 'hatirlat': odayı bugün için işaretler. İlk kez işaretlendiyse true (gönder), yoksa false.
create or replace function public.hatirlat_isaretle(p_room text, p_gun date, p_slot text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_room is null or p_room !~ '^[a-z2-9]{10}$' or p_gun is null or p_slot is null
     or p_slot not in ('sabah', 'aksam') then
    raise exception 'hatirlat_isaretle: gecersiz girdi' using errcode = '22023';
  end if;
  insert into public.push_gonderim (room, gun, slot) values (p_room, p_gun, p_slot)
    on conflict do nothing;
  if not found then
    return false;
  end if;
  delete from public.push_gonderim as g where g.gun < p_gun - 40;
  return true;
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
revoke execute on function public.push_abonelikler() from public, anon, authenticated;
revoke execute on function public.hatirlat_belgeler(text[], integer) from public, anon, authenticated;
revoke execute on function public.hatirlat_isaretle(text, date, text) from public, anon, authenticated;
grant execute on function public.push_hedef(text, text) to service_role;
grant execute on function public.push_sonuc(text[], text[], text[]) to service_role;
grant execute on function public.push_abonelikler() to service_role;
grant execute on function public.hatirlat_belgeler(text[], integer) to service_role;
grant execute on function public.hatirlat_isaretle(text, date, text) to service_role;

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
