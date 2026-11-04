// supabase/schema.sql: kimliksiz oda reddi (madde 5), kova ayarı, medya yetkisi ve sınırları (7, 8),
// kalıcı silme kuyruğu (9), çöp temizliği ve odayı silme (10). PGlite: sunucu-pglite.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { kur, ATLA, ODA, ODA2 } from './sunucu-pglite.mjs';

const K = (h) => h.repeat(43);
const omer = { id: 'omer', k: K('a') };
const gul = { id: 'gul', k: K('b') };
const pc = { id: 'yedek-pc-abc', k: K('c') };
const U1 = '0f8e2a1c-1b2d-4c3e-8f9a-0123456789ab';
const U2 = '1f8e2a1c-1b2d-4c3e-8f9a-0123456789ab';
const genel = (y) => `https://x.supabase.co/storage/v1/object/public/photos/${y}`;
const yol = (u, uz = 'webp', oda = ODA) => `${oda}/${u}.${uz}`;

const katil = async (q, c, oda = ODA) => (await q('select public.oda_katil($1, $2, $3) as r', [oda, c.id, c.k]))[0].r;
const ikiCihaz = async (q) => {
  assert.equal((await katil(q, omer)).durum, 'onayli');
  await katil(q, gul);
  await q('select public.cihaz_onayla($1, $2, $3, $4)', [ODA, omer.id, omer.k, gul.id]);
};
const belge = (q, id, data, sil = false, c = omer) => q(
  'select * from public.doc_put($1, $2, $3, $4::jsonb, $5, $6, $7, $8)', [ODA, 'ani', id, JSON.stringify(data), c.id, sil, c.id, c.k]);
const dosya = (q, name, size = 1000, bucket = 'photos') => q(
  'insert into storage.objects (bucket_id, name, metadata) values ($1, $2, $3::jsonb)', [bucket, name, JSON.stringify({ size })]);
const kuyruk = async (q) => (await q('select yol from public.medya_silinecek order by yol')).map((r) => r.yol);

// ---------- Madde 5 ----------

test('oda_yetki: oda satırı yoksa kimliksiz çağrı 42501; satırı olan geçiş odasında geçer', ATLA, async () => {
  const { q, hata } = await kur();
  for (const [ad, sql, p] of [
    ['doc_list', 'select * from public.doc_list($1, $2)', [ODA, 'liste']],
    ['doc_page', 'select * from public.doc_page($1, $2)', [ODA, 'liste']],
    ['room_stats', 'select * from public.room_stats($1)', [ODA]],
    ['doc_put', `select * from public.doc_put($1, 'liste', 'a', '{}'::jsonb, null)`, [ODA]],
  ]) {
    const e = await hata(sql, p);
    assert.equal(e.code, '42501', ad);
    assert.equal(e.message, `${ad}: yetki yok`);
  }
  // Eski oda: satır oda_katil ile açılır, 3 gün kimliksiz sürer.
  await q(`insert into public.room_doc (room, kind, id, data) values ($1, 'kisi', 'omer', '{}')`, [ODA]);
  await q(`update public.room_doc set created_at = now() - interval '1 day'`);
  assert.equal((await katil(q, omer)).durum, 'onayli');
  assert.equal((await q('select * from public.doc_list($1, $2)', [ODA, 'kisi'])).length, 1);
});

test('oda_yetki: bozuk oda kodu 22023 (kimliksiz ya da kimlikli)', ATLA, async () => {
  const { hata } = await kur();
  assert.equal((await hata('select * from public.doc_list($1, $2)', ['../x', 'liste'])).code, '22023');
  assert.equal((await hata('select * from public.doc_list($1, $2, null, 10, $3, $4)', ['kisa', 'liste', omer.id, omer.k])).code, '22023');
});

test('oda_katil: yeni odada ilk giriş bozulmaz; kurucu onaylı, sonra kimlikli okuma geçer', ATLA, async () => {
  const { q } = await kur();
  const r = await katil(q, omer);
  assert.deepEqual([r.durum, r.ilk], ['onayli', true]);
  assert.deepEqual(await q('select * from public.doc_list($1, $2, null, 10, $3, $4)', [ODA, 'liste', omer.id, omer.k]), []);
});

// ---------- Kova ----------

test('kova: yeni kurulum özel; var olan kovanın public değeri ve politikası şemayla değişmez', ATLA, async () => {
  const { q } = await kur();
  const [b] = await q(`select public, file_size_limit::int as boyut from storage.buckets where id = 'photos'`);
  assert.deepEqual(b, { public: false, boyut: 5242880 });
  assert.equal((await q(`select 1 from pg_catalog.pg_policies where schemaname = 'storage'`)).length, 0, 'yeni kurulumda anon yükleme yok');

  // Canlı: açık kova + eski politika. Şema üstüne kurulunca ikisi de kalır.
  const canli = await kur({ once: `
    insert into storage.buckets (id, name, public, file_size_limit) values ('photos', 'photos', true, 1);
    create policy "photos_insert_anon" on storage.objects for insert to anon, authenticated with check (bucket_id = 'photos');
  ` });
  const [c] = await canli.q(`select public, file_size_limit::int as boyut from storage.buckets where id = 'photos'`);
  assert.deepEqual(c, { public: true, boyut: 5242880 });
  assert.deepEqual((await canli.q(`select policyname from pg_catalog.pg_policies where schemaname = 'storage'`)).map((x) => x.policyname), ['photos_insert_anon']);
});

// ---------- Yetki ve sınır ----------

test('medya_imza_izni: onaylı cihaz geçer ve görülme yazılır; bekleyen, yabancı ve kimliksiz 42501; yalnız service_role', ATLA, async () => {
  const { db, q, hata } = await kur();
  await katil(q, omer);
  await katil(q, gul); // bekliyor
  await q('select public.medya_imza_izni($1, $2, $3)', [ODA, omer.id, omer.k]);
  const [s] = await q(`select medya_gorulme from public.oda_cihaz where cihaz = 'omer'`);
  assert.ok(s.medya_gorulme);
  assert.equal((await hata('select public.medya_imza_izni($1, $2, $3)', [ODA, gul.id, gul.k])).code, '42501');
  assert.equal((await hata('select public.medya_imza_izni($1, $2, $3)', [ODA, 'yok', K('d')])).code, '42501');
  assert.equal((await hata('select public.medya_imza_izni($1, null, null)', [ODA])).code, '42501');
  assert.equal((await hata('select public.medya_imza_izni($1, $2, $3)', [ODA2, omer.id, omer.k])).code, '42501', 'başka oda');
  await db.exec('set role anon');
  assert.equal((await hata('select public.medya_imza_izni($1, $2, $3)', [ODA, omer.id, omer.k])).code, '42501');
  assert.equal((await hata('select public.medya_yukleme_izni($1, $2, $3, 1, $4)', [ODA, omer.id, omer.k, 'foto'])).code, '42501');
  assert.equal((await hata('select public.medya_silindi($1)', [[]])).code, '42501');
  assert.equal((await hata('select public.medya_tasi()')).code, '42501');
  assert.equal((await hata('select public.cop_temizle()')).code, '42501');
  await db.exec('reset role');
});

test('medya_yukleme_izni: ses 2 MB, foto 5 MB; oda ve genel sınır; saatlik dosya sınırı', ATLA, async () => {
  const { q, hata } = await kur();
  await katil(q, omer);
  const izin = (bayt, tur, c = omer, oda = ODA) => ['select public.medya_yukleme_izni($1, $2, $3, $4, $5)', [oda, c.id, c.k, bayt, tur]];
  await q(...izin(2 * 1024 * 1024, 'ses'));
  await q(...izin(5 * 1024 * 1024, 'foto'));
  assert.equal((await hata(...izin(2 * 1024 * 1024 + 1, 'ses'))).code, '22023');
  assert.equal((await hata(...izin(5 * 1024 * 1024 + 1, 'foto'))).code, '22023');
  assert.equal((await hata(...izin(1, 'baska'))).code, '22023');
  assert.equal((await hata(...izin(0, 'foto'))).code, '22023');
  assert.equal((await hata(...izin(1, 'foto', gul))).code, '42501');

  await dosya(q, yol(U1), 796 * 1024 * 1024);
  await q(...izin(1024, 'foto'));
  const dolu = await hata(...izin(5 * 1024 * 1024, 'foto'));
  assert.equal(dolu.code, '54000');
  assert.match(dolu.message, /oda dolu/);

  await q('delete from storage.objects');
  await dosya(q, yol(U1, 'webp', ODA2), 950 * 1024 * 1024);
  const genelDolu = await hata(...izin(1024 * 1024, 'foto'));
  assert.equal(genelDolu.code, '54000');
  assert.match(genelDolu.message, /depo dolu/);

  await q('delete from storage.objects');
  await q(`insert into public.medya_rate (room, bucket, n) values ($1, date_trunc('hour', now()), 600)
    on conflict (room, bucket) do update set n = 600`, [ODA]);
  const hiz = await hata(...izin(1, 'foto'));
  assert.equal(hiz.code, '54000');
  assert.match(hiz.message, /cok fazla/);
});

test('medya_kullanim: odanın baytı, dosyası, ses payı ve sınır; başka kova ve oda sayılmaz; kimlik zorunlu', ATLA, async () => {
  const { q, hata } = await kur();
  await katil(q, omer);
  await dosya(q, yol(U1), 1000);
  await dosya(q, yol(U2, 'webm'), 500);
  await dosya(q, yol(U1, 'jpg', ODA2), 9999);
  await dosya(q, yol(U2), 9999, 'baska');
  const [{ r }] = await q('select public.medya_kullanim($1, $2, $3) as r', [ODA, omer.id, omer.k]);
  assert.deepEqual(r, { bayt: 1500, dosya: 2, ses_bayt: 500, sinir: 838860800 });
  assert.equal((await hata('select public.medya_kullanim($1, null, null)', [ODA])).code, '42501');
});

// ---------- Kalıcı silme ----------

test('medya_yollari: eski adres ve kova: biçimi; iç içe alan; yinelenen tekil; başka adres yok', ATLA, async () => {
  const { q } = await kur();
  const data = { foto: genel(yol(U1)), ses: { url: `kova:${yol(U2, 'webm')}` }, fotolar: [genel(yol(U1)), 'https://evil.example/a.webp'], metin: 'kova:yok' };
  const r = await q('select public.medya_yollari($1::jsonb) as y', [JSON.stringify(data)]);
  assert.deepEqual(r.map((x) => x.y).sort(), [yol(U1), yol(U2, 'webm')]);
});

test('doc_kalici_sil: yalnız çöpteki belge; veri boşalır, dosya kuyruğa; başka belgedeki dosya kalır', ATLA, async () => {
  const { q, hata } = await kur();
  await ikiCihaz(q);
  await belge(q, 'a', { fotolar: [genel(yol(U1)), `kova:${yol(U2)}`] });
  await belge(q, 'b', { foto: genel(yol(U2)) });
  const kalici = (id, c = omer) => ['select public.doc_kalici_sil($1, $2, $3, $4, $5) as ok', [ODA, c.id, c.k, 'ani', id]];

  assert.equal((await q(...kalici('a')))[0].ok, false, 'silinmemiş belge kalıcı silinmez');
  assert.deepEqual(await kuyruk(q), []);
  await belge(q, 'a', {}, true);
  const once = (await q(`select updated_at from public.room_doc where id = 'a'`))[0].updated_at;
  assert.equal((await q(...kalici('a', gul)))[0].ok, true);
  const [s] = await q(`select data, deleted, updated_at from public.room_doc where id = 'a'`);
  assert.deepEqual([s.data, s.deleted], [{}, true]);
  assert.ok(s.updated_at >= once, 'diğer cihaz artımlı eşitlemede görür');
  assert.deepEqual(await kuyruk(q), [yol(U1)], 'U2 b belgesinde duruyor');
  assert.equal((await q(...kalici('a')))[0].ok, false, 'veri boşsa bir daha çalışmaz');
  assert.equal((await hata('select public.doc_kalici_sil($1, null, null, $2, $3)', [ODA, 'ani', 'a'])).code, '42501');
});

test('medya_silinecekler: yeniden bağlanan dosya kuyruktan çıkar, verilmez; medya_silindi siler', ATLA, async () => {
  const { q } = await kur();
  await ikiCihaz(q);
  await q('insert into public.medya_silinecek (yol, room) values ($1, $2), ($3, $2)', [yol(U1), ODA, yol(U2)]);
  await belge(q, 'geri', { foto: `kova:${yol(U2)}` }); // yedekten geri geldi
  const [{ y }] = await q('select public.medya_silinecekler(10) as y');
  assert.deepEqual(y, [yol(U1)]);
  assert.deepEqual(await kuyruk(q), [yol(U1)]);
  await q('select public.medya_silindi($1)', [[yol(U1)]]);
  assert.deepEqual(await kuyruk(q), []);
});

// ---------- Çöp temizliği ----------

test('cop_temizle: 30 günden eski silinenin verisi boşalır ve dosyası kuyruğa girer; yeni silinen ve canlı kalır', ATLA, async () => {
  const { q } = await kur();
  await ikiCihaz(q);
  await belge(q, 'eski', { foto: genel(yol(U1)), metin: 'gizli' });
  await belge(q, 'yeni', { foto: genel(yol(U2)) });
  await belge(q, 'canli', { foto: genel(yol('2f8e2a1c-1b2d-4c3e-8f9a-0123456789ab')) });
  await belge(q, 'eski', {}, true);
  await belge(q, 'yeni', {}, true);
  await q(`update public.room_doc set updated_at = now() - interval '31 days' where id = 'eski'`);
  await q(`update public.room_doc set updated_at = now() - interval '29 days' where id = 'yeni'`);
  const [{ n }] = await q('select public.cop_temizle() as n');
  assert.equal(n, 1);
  assert.deepEqual((await q(`select data from public.room_doc where id = 'eski'`))[0].data, {});
  assert.deepEqual((await q(`select data from public.room_doc where id = 'yeni'`))[0].data, { foto: genel(yol(U2)) });
  assert.deepEqual(await kuyruk(q), [yol(U1)]);
  assert.equal((await q('select public.cop_temizle() as n'))[0].n, 0, 'tekrar çalışınca iş yok');
});

test('şema: temizlik zamanlaması şemada kurulmaz (ilk çalışma ayrı onaylı adım)', ATLA, async () => {
  const { q } = await kur();
  const isler = (await q('select jobname from cron.job')).map((r) => r.jobname);
  assert.ok(!isler.some((a) => /temizle/.test(a)), isler.join());
});

test('medya_temizle_cagir: kuyruk boşsa istek yok; doluysa anahtarlı POST', ATLA, async () => {
  const { q } = await kur();
  assert.equal((await q('select public.medya_temizle_cagir() as r'))[0].r, null);
  assert.equal((await q('select count(*)::int as n from net.istek'))[0].n, 0);
  await q('insert into public.medya_silinecek (yol, room) values ($1, $2)', [yol(U1), ODA]);
  await q('select public.medya_temizle_cagir()');
  const [i] = await q('select url, headers from net.istek');
  assert.match(i.url, /\/functions\/v1\/medya\?islem=temizle$/);
  assert.ok(i.headers['x-hatirlat-anahtar']);
});

// ---------- Odayı tamamen sil ----------

test('odayı sil: iki cihaz gerekir; vazgeç; süre dolar; her şey silinir; kod bir daha açılmaz', ATLA, async () => {
  const { q, hata } = await kur();
  await ikiCihaz(q);
  const iste = (c) => q('select public.oda_sil_iste($1, $2, $3) as r', [ODA, c.id, c.k]);
  const onay = (c) => ['select public.oda_sil_onayla($1, $2, $3) as r', [ODA, c.id, c.k]];
  const durum = async (c) => (await q('select public.oda_sil_durum($1, $2, $3) as r', [ODA, c.id, c.k]))[0].r;

  await belge(q, 'a', { foto: genel(yol(U1)) });
  await q(`select public.log_game($1, 'dama', '{}'::jsonb, $2, $3)`, [ODA, omer.id, omer.k]);
  await dosya(q, yol(U1));
  await dosya(q, yol(U2, 'webm'));
  await dosya(q, yol(U1, 'jpg', ODA2));

  assert.equal((await durum(omer)).bekliyor, false);
  assert.equal((await hata(...onay(omer))).code, '22023', 'istek yokken onay yok');
  await iste(omer);
  assert.deepEqual([(await durum(gul)).bekliyor, (await durum(gul)).ben, (await durum(omer)).ben], [true, false, true]);
  assert.match((await hata(...onay(omer))).message, /ikinci cihaz/);
  await q('select public.oda_sil_vazgec($1, $2, $3)', [ODA, gul.id, gul.k]);
  assert.equal((await durum(omer)).bekliyor, false);
  assert.equal((await hata(...onay(gul))).code, '22023', 'vazgeçilen istek onaylanmaz');

  await iste(omer);
  await q(`update public.oda set silme_son = now() - interval '1 second'`);
  assert.equal((await durum(gul)).bekliyor, false, 'süresi dolan istek geçersiz');
  assert.equal((await hata(...onay(gul))).code, '22023');

  await iste(omer);
  assert.equal((await q(...onay(gul)))[0].r, true);
  for (const [t, k] of [['room_doc', 'room'], ['game_log', 'room'], ['oda', 'room'], ['oda_cihaz', 'room'], ['oda_davet', 'room']]) {
    assert.equal((await q(`select count(*)::int as n from public.${t} where ${k} = $1`, [ODA]))[0].n, 0, t);
  }
  assert.deepEqual(await kuyruk(q), [yol(U1), yol(U2, 'webm')], 'yalnız bu odanın dosyaları');
  assert.equal((await katil(q, omer)).durum, 'silindi');
  assert.equal((await q('select public.oda_durum($1, $2, $3) as r', [ODA, gul.id, gul.k]))[0].r.durum, 'silindi');
  assert.equal((await q('select count(*)::int as n from public.oda where room = $1', [ODA]))[0].n, 0, 'silinen oda yeniden açılmaz');
  assert.equal((await hata('select * from public.doc_list($1, $2)', [ODA, 'ani'])).code, '42501');
});

test('odayı sil: tek gerçek cihaz (ya da yanında yalnız yedek bilgisayarı) kendisi onaylar', ATLA, async () => {
  const { q } = await kur();
  await katil(q, omer);
  await katil(q, pc);
  await q('select public.cihaz_onayla($1, $2, $3, $4)', [ODA, omer.id, omer.k, pc.id]);
  await q('select public.oda_sil_iste($1, $2, $3)', [ODA, omer.id, omer.k]);
  assert.equal((await q('select public.oda_sil_durum($1, $2, $3) as r', [ODA, omer.id, omer.k]))[0].r.tek, true);
  assert.equal((await q('select public.oda_sil_onayla($1, $2, $3) as r', [ODA, omer.id, omer.k]))[0].r, true);
});

test('odayı sil: isteyen cihaz çıkarılınca istek düşer; anon iç fonksiyonu çağıramaz', ATLA, async () => {
  const { db, q, hata } = await kur();
  await ikiCihaz(q);
  await q('select public.oda_sil_iste($1, $2, $3)', [ODA, omer.id, omer.k]);
  await q('select public.cihaz_cikar($1, $2, $3, $4)', [ODA, gul.id, gul.k, omer.id]);
  assert.equal((await q('select public.oda_sil_durum($1, $2, $3) as r', [ODA, gul.id, gul.k]))[0].r.bekliyor, false);
  await db.exec('set role anon');
  await q('select public.oda_sil_durum($1, $2, $3) as r', [ODA, gul.id, gul.k]);
  assert.equal((await hata('select public.oda_yok_et($1)', [ODA])).code, '42501');
  await db.exec('reset role');
});

// ---------- Taşıma ----------

test('medya_tasi: eski adres kova: olur; updated_at değişmez; parça parça; ikinci kez iş yok; yabancı adres kalır', ATLA, async () => {
  const { q } = await kur();
  await ikiCihaz(q);
  await belge(q, 'a', { fotolar: [genel(yol(U1))], dis: 'https://evil.example/storage/v1/object/public/diger/x.webp' });
  await belge(q, 'b', { ses: { url: genel(yol(U2, 'm4a')) }, metin: 'kalsın' });
  const once = (await q(`select updated_at from public.room_doc where id = 'a'`))[0].updated_at;
  assert.equal((await q('select public.medya_tasi(1) as n'))[0].n, 1);
  assert.equal((await q('select public.medya_tasi(10) as n'))[0].n, 1);
  assert.equal((await q('select public.medya_tasi(10) as n'))[0].n, 0);
  const [a] = await q(`select data, updated_at from public.room_doc where id = 'a'`);
  assert.deepEqual(a.data.fotolar, [`kova:${yol(U1)}`]);
  assert.match(a.data.dis, /evil/);
  assert.equal(a.updated_at.getTime(), once.getTime());
  assert.deepEqual((await q(`select data from public.room_doc where id = 'b'`))[0].data, { ses: { url: `kova:${yol(U2, 'm4a')}` }, metin: 'kalsın' });
});
