// supabase/schema.sql 4–6. bölümler, PGlite ile (gerçek Postgres, bellekte).
// PGlite proje bağımlılığı değil: yoksa test atlanır. Yol: PGLITE_YOLU ya da geliştirme makinesindeki kurulum.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const PGLITE = process.env.PGLITE_YOLU
  || 'C:/Users/koseo/AppData/Local/Temp/pw/node_modules/@electric-sql/pglite/dist/index.js';
const SQL = readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8');

const bolum = (bas, son) => {
  const i = SQL.indexOf(bas);
  const j = son ? SQL.indexOf(son) : SQL.length;
  assert.ok(i >= 0 && j > i, `bölüm bulunamadı: ${bas}`);
  return SQL.slice(i, j).replace(/^notify pgrst.*$/gm, '');
};
const B45 = bolum('-- 4. Çift verisi', '-- 6. Zamanlanmış');
const B6 = bolum('-- 6. Zamanlanmış').replace(/^create extension .*$/gm, '');

const ODA = 'abcdefgh23';
const ODA2 = 'zzzzzzzz22';
const ab = (n, host = 'fcm.googleapis.com/fcm/send') => ({
  endpoint: `https://${host}/uc-${n}`,
  expirationTime: null,
  keys: { p256dh: 'B' + 'x'.repeat(86), auth: 'y'.repeat(22) },
});

async function kur() {
  const { PGlite } = await import(pathToFileURL(PGLITE).href);
  const db = new PGlite();
  // Supabase gibi: roller ve public şemada varsayılan yetkiler (anon'a da execute/tablo yetkisi verir).
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
    alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
    create schema cron;
    create table cron.job (jobid serial primary key, jobname text unique, schedule text, command text);
    create function cron.schedule(p_ad text, p_zaman text, p_komut text) returns bigint language sql as $$
      insert into cron.job (jobname, schedule, command) values (p_ad, p_zaman, p_komut)
      on conflict (jobname) do update set schedule = excluded.schedule, command = excluded.command
      returning jobid $$;
    create schema net;
    create table net.istek (id serial primary key, url text, body jsonb, headers jsonb, zaman int);
    create function net.http_post(url text, body jsonb default '{}', params jsonb default '{}',
      headers jsonb default '{}', timeout_milliseconds int default 5000) returns bigint language sql as $$
      insert into net.istek (url, body, headers, zaman) values (url, body, headers, timeout_milliseconds) returning id $$;
    create schema vault;
    create table vault.decrypted_secrets (name text primary key, decrypted_secret text);
  `);
  await db.exec(B45);
  await db.exec(B45); // tekrar çalıştırmak güvenli olmalı
  await db.exec(B6);
  await db.exec(B6);
  const q = async (s, p) => (await db.query(s, p)).rows;
  const hata = async (s, p) => {
    try { await db.query(s, p); } catch (e) { return e; }
    assert.fail(`hata bekleniyordu: ${s}`);
  };
  return { db, q, hata };
}

const pgliteVar = existsSync(PGLITE);

test('push_kaydet: kayıt, güncelleme, aynı cihazın eski aboneliği, oda başına 10', { skip: !pgliteVar && 'PGlite yok' }, async () => {
  const { q } = await kur();
  const kaydet = (oda, client, sub, ua = null) =>
    q('select public.push_kaydet($1, $2, $3::jsonb, $4) as ok', [oda, client, JSON.stringify(sub), ua]);
  assert.equal((await kaydet(ODA, 'cli-1', ab(1), 'x'.repeat(300)))[0].ok, true);
  let r = await q('select * from public.push_sub');
  assert.equal(r.length, 1);
  assert.equal(r[0].room, ODA);
  assert.equal(r[0].ua.length, 200);
  assert.equal(r[0].fail_count, 0);

  // Aynı adres başka odaya taşınır (cihaz oda değiştirdi).
  await kaydet(ODA2, 'cli-1', ab(1));
  r = await q('select room from public.push_sub');
  assert.deepEqual(r.map((x) => x.room), [ODA2]);

  // Aynı cihaz yeni adres aldı: eskisi silinir.
  await kaydet(ODA2, 'cli-1', ab(2));
  r = await q('select endpoint from public.push_sub');
  assert.deepEqual(r.map((x) => x.endpoint), [ab(2).endpoint]);

  // Oda başına en çok 10: en eski sessizler silinir.
  for (let i = 0; i < 12; i++) {
    await kaydet(ODA, `c${i}`, ab(100 + i));
    await new Promise((r) => setTimeout(r, 3)); // PGlite saati ms çözünürlüklü: sıra kesin olsun
  }
  r = await q('select client from public.push_sub where room = $1 order by client', [ODA]);
  assert.equal(r.length, 10);
  assert.ok(!r.some((x) => x.client === 'c0' || x.client === 'c1'), 'en eski iki abonelik silinmeli');
  assert.equal((await q('select count(*)::int as n from public.push_sub where room = $1', [ODA2]))[0].n, 1);
});

test('push_kaydet / push_sil doğrulama', { skip: !pgliteVar && 'PGlite yok' }, async () => {
  const { q, hata } = await kur();
  const dene = (oda, client, sub) =>
    hata('select public.push_kaydet($1, $2, $3::jsonb)', [oda, client, sub == null ? null : JSON.stringify(sub)]);
  const kotu = [
    ['BAD', 'cli', ab(1)],
    [ODA, 'cli 1', ab(1)],
    [ODA, 'x'.repeat(65), ab(1)],
    [ODA, 'cli', null],
    [ODA, 'cli', [1, 2]],
    [ODA, 'cli', { ...ab(1), endpoint: 'http://fcm.googleapis.com/fcm/send/x' }],
    [ODA, 'cli', { ...ab(1), endpoint: 'https://kotu.example.com/push/x' }],
    [ODA, 'cli', { ...ab(1), endpoint: 'https://fcm.googleapis.com.kotu.com/x' }],
    [ODA, 'cli', { ...ab(1), endpoint: 'https://fcm.googleapis.com/' + 'x'.repeat(1100) }],
    [ODA, 'cli', { ...ab(1), keys: { p256dh: 'kisa', auth: 'y'.repeat(22) } }],
    [ODA, 'cli', { ...ab(1), keys: { p256dh: 'B' + 'x'.repeat(86), auth: 'y y' } }],
    [ODA, 'cli', { endpoint: ab(1).endpoint }],
  ];
  for (const [oda, client, sub] of kotu) {
    const e = await dene(oda, client, sub);
    assert.equal(e.code, '22023', `${e.message} (${JSON.stringify(sub)?.slice(0, 60)})`);
  }
  // Bilinen servisler kabul edilir.
  for (const host of ['updates.push.services.mozilla.com/wpush/v2', 'web.push.apple.com', 'wns2-par02p.notify.windows.com/w']) {
    await q('select public.push_kaydet($1, $2, $3::jsonb)', [ODA, 'c-' + host.length, JSON.stringify(ab(7, host))]);
  }
  assert.equal((await q('select count(*)::int as n from public.push_sub'))[0].n, 3);

  const sil = (e) => q('select public.push_sil($1) as ok', [e]);
  assert.equal((await sil(ab(7, 'web.push.apple.com').endpoint))[0].ok, true);
  assert.equal((await sil(ab(7, 'web.push.apple.com').endpoint))[0].ok, false);
  assert.equal((await hata('select public.push_sil($1)', ['ftp://x'])).code, '22023');
  assert.equal((await hata('select public.push_sil($1)', [null])).code, '22023');
});

test('push_hedef: gönderen hariç, hız sınırı; push_sonuc', { skip: !pgliteVar && 'PGlite yok' }, async () => {
  const { db, q, hata } = await kur();
  const kaydet = (oda, client, n) => q('select public.push_kaydet($1, $2, $3::jsonb)', [oda, client, JSON.stringify(ab(n))]);
  await kaydet(ODA, 'omer', 1);
  await kaydet(ODA, 'gul', 2);
  await kaydet(ODA2, 'baska', 3);
  const hedef = (oda, from) => q('select * from public.push_hedef($1, $2)', [oda, from]);
  assert.deepEqual((await hedef(ODA, 'omer')).map((x) => x.endpoint), [ab(2).endpoint]);
  assert.deepEqual(Object.keys((await hedef(ODA, 'omer'))[0]).sort(), ['auth', 'endpoint', 'p256dh']);
  assert.equal((await hedef(ODA, null)).length, 2);
  assert.equal((await hata('select * from public.push_hedef($1, $2)', ['BAD', null])).code, '22023');
  assert.equal((await hata('select * from public.push_hedef($1, $2)', [ODA, 'a b'])).code, '22023');

  // 3 çağrı yapıldı (geçersizler sayılmaz). 20'ye kadar izin, 21. reddedilir; diğer oda etkilenmez.
  for (let i = 0; i < 17; i++) await hedef(ODA, 'omer');
  const e = await hata('select * from public.push_hedef($1, $2)', [ODA, 'omer']);
  assert.equal(e.code, '54000');
  assert.equal((await hedef(ODA2, null)).length, 1);
  // Genel sınır.
  await db.exec(`update public.push_rate set n = 600 where room = '*'`);
  assert.equal((await hata('select * from public.push_hedef($1, $2)', [ODA2, null])).code, '54000');

  // Eski sayaçlar temizlenir (dakikanın ilk genel çağrısında).
  await db.exec(`insert into public.push_rate values ('eskioda222', now() - interval '3 hours', 5)`);
  await db.exec(`delete from public.push_rate where room = '*'`);
  await hedef(ODA2, null);
  assert.equal((await q(`select count(*)::int as n from public.push_rate where room = 'eskioda222'`))[0].n, 0);

  // Sonuç: ok tazelenir, gone silinir, fail sayılır; 20. düşüşte silinir.
  await q('select public.push_sonuc($1, $2, $3)', [[ab(1).endpoint], [ab(2).endpoint], [ab(3).endpoint]]);
  let r = await q('select endpoint, last_ok_at, fail_count from public.push_sub order by endpoint');
  assert.deepEqual(r.map((x) => [x.endpoint, x.fail_count]), [[ab(1).endpoint, 0], [ab(3).endpoint, 1]]);
  assert.ok(r[0].last_ok_at instanceof Date);
  await db.exec(`update public.push_sub set fail_count = 19 where endpoint = '${ab(3).endpoint}'`);
  await q('select public.push_sonuc($1, $2, $3)', [null, null, [ab(3).endpoint]]);
  assert.equal((await q('select count(*)::int as n from public.push_sub'))[0].n, 1);
});

test('hatirlat_belgeler ve hatirlat_isaretle', { skip: !pgliteVar && 'PGlite yok' }, async () => {
  const { q, hata } = await kur();
  await q('select public.push_kaydet($1, $2, $3::jsonb)', [ODA, 'omer', JSON.stringify(ab(1))]);
  const put = (oda, kind, id, data, del = false) =>
    q('select * from public.doc_put($1, $2, $3, $4::jsonb, null, $5)', [oda, kind, id, JSON.stringify(data), del]);
  await put(ODA, 'gun', 'g1', { baslik: 'X', tarih: '2024-10-30' });
  await put(ODA, 'gun', 'g2', { baslik: 'Silindi' }, true);
  await put(ODA, 'kisi', 'omer', { ad: 'Ömer' });
  await put(ODA, 'cift', 'cift', { baslangic: '2025-01-01' });
  await put(ODA, 'gs', '302-omer', { gun: 302, cevap: 'a' });
  await put(ODA, 'gs', '301-gul', { gun: 301, cevap: 'b' });
  await put(ODA, 'gs', '3020-gul', { gun: 3020, cevap: 'c' });
  await put(ODA, 'mesaj', 'm1', { metin: 'gizli' });
  await put(ODA2, 'gun', 'g9', { baslik: 'Abonesiz oda' });

  const r = await q('select room, kind, id from public.hatirlat_belgeler($1) order by kind, id', [['gun', 'kisi', 'cift']]);
  assert.deepEqual(r.map((x) => `${x.room}/${x.kind}/${x.id}`), [`${ODA}/cift/cift`, `${ODA}/gun/g1`, `${ODA}/kisi/omer`]);
  const gs = await q('select id, data from public.hatirlat_belgeler($1, $2) order by id', [['gs', 'kisi'], 302]);
  assert.deepEqual(gs.map((x) => x.id), ['302-omer', 'omer']);
  assert.equal(gs[0].data.cevap, 'a');
  assert.equal((await q('select * from public.hatirlat_belgeler($1)', [['gs']])).length, 0);

  const isaretle = (oda, gun, slot) => q('select public.hatirlat_isaretle($1, $2, $3) as ok', [oda, gun, slot]);
  assert.equal((await isaretle(ODA, '2026-10-30', 'sabah'))[0].ok, true);
  assert.equal((await isaretle(ODA, '2026-10-30', 'sabah'))[0].ok, false);
  assert.equal((await isaretle(ODA, '2026-10-30', 'aksam'))[0].ok, true);
  assert.equal((await isaretle(ODA, '2026-12-30', 'sabah'))[0].ok, true);
  assert.equal((await q('select count(*)::int as n from public.push_gonderim'))[0].n, 1, '40 günden eski kayıtlar silinir');
  assert.equal((await hata('select public.hatirlat_isaretle($1, $2, $3)', [ODA, '2026-10-30', 'gece'])).code, '22023');
});

test('yetkiler: anon yalnız push_kaydet/push_sil; tablolar kapalı; sunucu RPC yalnız service_role', { skip: !pgliteVar && 'PGlite yok' }, async () => {
  const { db, q, hata } = await kur();
  await db.exec('set role anon');
  await q('select public.push_kaydet($1, $2, $3::jsonb)', [ODA, 'omer', JSON.stringify(ab(1))]);
  await q('select public.push_sil($1)', [ab(9).endpoint]);
  for (const s of [
    'select * from public.push_sub',
    'select * from public.push_rate',
    'select * from public.push_gonderim',
    `select * from public.push_hedef('${ODA}', null)`,
    'select public.push_sonuc(null, null, null)',
    'select * from public.push_abonelikler()',
    `select * from public.hatirlat_belgeler(array['gun'])`,
    `select public.hatirlat_isaretle('${ODA}', '2026-10-30', 'sabah')`,
    `select public.hatirlat_cagir('sabah')`,
  ]) {
    const e = await hata(s);
    assert.equal(e.code, '42501', `${s}: ${e.message}`);
  }
  await db.exec('reset role; set role service_role');
  assert.equal((await q('select * from public.push_abonelikler()')).length, 1);
  assert.equal((await q(`select * from public.push_hedef('${ODA}', 'baska')`)).length, 1);
  await db.exec('reset role');
});

test('6. bölüm: adlı cron işleri çoğalmaz; komut Edge Function\'ı vault anahtarıyla çağırır', { skip: !pgliteVar && 'PGlite yok' }, async () => {
  const { db, q, hata } = await kur();
  const isler = await q('select jobname, schedule, command from cron.job order by jobname');
  assert.deepEqual(isler.map((j) => [j.jobname, j.schedule]), [['biz-hatirlat-aksam', '0 17 * * *'], ['biz-hatirlat-sabah', '0 6 * * *']]);

  // Anahtar yoksa istek atılmaz.
  await db.exec(isler[1].command);
  assert.equal((await q('select count(*)::int as n from net.istek'))[0].n, 0);

  await db.exec(`insert into vault.decrypted_secrets values ('hatirlat_anahtar', 'deneme-anahtar')`);
  for (const j of isler) await db.exec(j.command);
  const r = await q('select url, body, headers, zaman from net.istek order by id');
  assert.equal(r.length, 2);
  assert.equal(r[0].url, 'https://blgtlflryxknyalutugw.supabase.co/functions/v1/hatirlat');
  assert.deepEqual(r.map((x) => x.body.slot), ['aksam', 'sabah']);
  assert.equal(r[0].headers['x-hatirlat-anahtar'], 'deneme-anahtar');
  assert.equal(r[0].headers['Content-Type'], 'application/json');
  assert.equal(r[0].zaman, 60000);

  await db.exec(`insert into vault.decrypted_secrets values ('project_url', 'https://ornek.supabase.co')`);
  await db.exec(isler[1].command);
  assert.equal((await q('select url from net.istek order by id desc limit 1'))[0].url, 'https://ornek.supabase.co/functions/v1/hatirlat');
  assert.equal((await hata(`select public.hatirlat_cagir('gece')`)).code, '22023');
});
