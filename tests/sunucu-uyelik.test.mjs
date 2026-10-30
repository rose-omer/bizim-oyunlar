// supabase/schema.sql 7. bölüm: cihaz üyeliği, onay, davet, kurtarma, yetki (oda_yetki), yedekten geri yükleme.
// PGlite ile (gerçek Postgres, bellekte). Kurulum: sunucu-pglite.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, createHash } from 'node:crypto';
import { kur, ATLA, ODA, ODA2, ab } from './sunucu-pglite.mjs';

const HEX32 = /^[0-9a-f]{32}$/;
const DAVET_RE = /^[abcdefghijkmnpqrstuvwxyz2-9]{32}$/;
const KURTARMA_RE = /^[A-HJ-NP-Z2-9]{4}(-[A-HJ-NP-Z2-9]{4}){3}$/;
const KIMLIKSIZ = { id: null, k: null };

/** Cihaz: clientId + 32 baytlık base64url anahtar (43 karakter), istemcideki gibi. */
const cihaz = (id) => ({ id, k: randomBytes(32).toString('base64url') });
const ozet = (s) => createHash('sha256').update(s, 'utf8').digest('hex');
const bekle = (ms) => new Promise((r) => setTimeout(r, ms));

function uyelik(q) {
  const tek = async (s, p) => (await q(s, p))[0].r;
  const hedefli = (ad) => (oda, c, hedef) => tek(`select public.${ad}($1, $2, $3, $4) as r`, [oda, c.id, c.k, hedef]);
  return {
    katil: (oda, c, { ad = null, davet = null, kurtarma = null } = {}) =>
      tek('select public.oda_katil($1, $2, $3, $4, $5, $6) as r', [oda, c.id, c.k, ad, davet, kurtarma]),
    durum: (oda, c) => tek('select public.oda_durum($1, $2, $3) as r', [oda, c.id, c.k]),
    liste: (oda, c) => q('select * from public.cihaz_listele($1, $2, $3)', [oda, c.id, c.k]),
    onayla: hedefli('cihaz_onayla'),
    reddet: hedefli('cihaz_reddet'),
    cikar: hedefli('cihaz_cikar'),
    davet: (oda, c) => tek('select public.davet_olustur($1, $2, $3) as r', [oda, c.id, c.k]),
    kurtarma: (oda, c) => tek('select public.kurtarma_olustur($1, $2, $3) as r', [oda, c.id, c.k]),
    satir: async (oda, id) => (await q('select * from public.oda_cihaz where room = $1 and cihaz = $2', [oda, id]))[0] || null,
    oda: async (oda) => (await q('select * from public.oda where room = $1', [oda]))[0] || null,
  };
}

test('oda_katil: kurucu onaylı (ilk), ikinci cihaz bekliyor; yeni odada koruma hemen, kanal gizli; çakışma', ATLA, async () => {
  const { q, hata } = await kur();
  const u = uyelik(q);
  const omer = cihaz('omer-1');
  const gul = cihaz('gul-1');

  const r1 = await u.katil(ODA, omer, { ad: '  Ömer · Android telefon  ' });
  assert.equal(r1.durum, 'onayli');
  assert.equal(r1.ilk, true);
  assert.match(r1.kanal, HEX32);
  assert.match(r1.zorunlu, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/);
  const oda = await u.oda(ODA);
  assert.equal(oda.kanal, r1.kanal);
  assert.equal(new Date(r1.zorunlu).getTime(), oda.zorunlu.getTime());
  assert.ok(oda.zorunlu <= new Date(), 'yeni oda: koruma hemen başlar');
  assert.equal(oda.kurtarma_ozet, null);
  const s = await u.satir(ODA, omer.id);
  assert.equal(s.ad, 'Ömer · Android telefon');
  assert.equal(s.durum, 'onayli');
  assert.equal((await q(`select encode(anahtar_ozet, 'hex') as h from public.oda_cihaz where cihaz = $1`, [omer.id]))[0].h,
    ozet(omer.k), 'sunucuda yalnız sha256 özeti');

  const r2 = await u.katil(ODA, gul);
  assert.deepEqual(r2, { durum: 'bekliyor', kanal: null, zorunlu: r1.zorunlu, ilk: false });
  assert.equal((await u.katil(ODA, gul)).durum, 'bekliyor');
  assert.equal((await q('select count(*)::int as n from public.oda_cihaz'))[0].n, 2);

  // Onaylı cihaz yeniden girer: ilk değil, aynı kanal; ad kırpılır, ad verilmezse eskisi kalır.
  assert.deepEqual(await u.katil(ODA, omer, { ad: 'x'.repeat(80) }), { ...r1, ilk: false });
  assert.equal((await u.satir(ODA, omer.id)).ad, 'x'.repeat(60));
  await u.katil(ODA, omer);
  assert.equal((await u.satir(ODA, omer.id)).ad, 'x'.repeat(60));

  // Çakışma: aynı cihaz başka anahtarla. Satıra dokunulmaz.
  const once = await u.satir(ODA, omer.id);
  assert.deepEqual(await u.katil(ODA, { id: omer.id, k: cihaz('x').k }, { ad: 'Sahte' }),
    { durum: 'cakisma', kanal: null, zorunlu: r1.zorunlu, ilk: false });
  assert.deepEqual(await u.satir(ODA, omer.id), once);

  for (const [o, c, k] of [
    ['KOTU', 'a', omer.k], [null, 'a', omer.k], [ODA, 'a b', omer.k], [ODA, null, omer.k], [ODA, 'x'.repeat(65), omer.k],
    [ODA, 'a', 'kisa'], [ODA, 'a', omer.k + 'x'], [ODA, 'a', null], [ODA, 'a', omer.k.slice(0, 42) + '='],
  ]) {
    const e = await hata('select public.oda_katil($1, $2, $3)', [o, c, k]);
    assert.equal(e.code, '22023', `${o} ${c} ${k}: ${e.message}`);
  }
  assert.equal((await hata('select public.oda_katil($1, $2, $3, null, $4)', [ODA, 'a', omer.k, 'x'.repeat(65)])).code, '22023');
  assert.equal((await hata('select public.oda_katil($1, $2, $3, null, null, $4)', [ODA, 'a', omer.k, 'x'.repeat(65)])).code, '22023');
});

test('oda_durum: yok / bekliyor / onayli / cakisma; oda oluşturmaz; yalnız son_gorulme değişir', ATLA, async () => {
  const { q, hata } = await kur();
  const u = uyelik(q);
  const omer = cihaz('omer');
  const gul = cihaz('gul');
  assert.deepEqual(await u.durum(ODA, omer), { durum: 'yok', kanal: null, zorunlu: null, ilk: false });
  assert.equal(await u.oda(ODA), null, 'oda_durum oda satırı oluşturmaz');

  const r1 = await u.katil(ODA, omer);
  await u.katil(ODA, gul);
  assert.deepEqual(await u.durum(ODA, omer), { ...r1, ilk: false });
  assert.deepEqual(await u.durum(ODA, gul), { durum: 'bekliyor', kanal: null, zorunlu: r1.zorunlu, ilk: false });
  assert.equal((await u.durum(ODA, { id: 'gul', k: omer.k })).durum, 'cakisma');
  assert.deepEqual(await u.durum(ODA, cihaz('yabanci')), { durum: 'yok', kanal: null, zorunlu: r1.zorunlu, ilk: false });
  assert.equal((await q('select count(*)::int as n from public.oda_cihaz'))[0].n, 2);

  // son_gorulme en çok 10 dakikada bir yazılır.
  await q(`update public.oda_cihaz set son_gorulme = now() - interval '11 minutes'`);
  await u.durum(ODA, gul);
  assert.ok(Date.now() - (await u.satir(ODA, 'gul')).son_gorulme < 60_000);
  await q(`update public.oda_cihaz set son_gorulme = now() - interval '9 minutes' where cihaz = 'gul'`);
  const s2 = (await u.satir(ODA, 'gul')).son_gorulme;
  await u.durum(ODA, gul);
  assert.equal((await u.satir(ODA, 'gul')).son_gorulme.getTime(), s2.getTime());

  assert.equal((await hata('select public.oda_durum($1, $2, $3)', ['KOTU', 'a', omer.k])).code, '22023');
  assert.equal((await hata('select public.oda_durum($1, $2, $3)', [ODA, 'a', null])).code, '22023');
});

test('davet: onaylı oluşturur; davetle doğrudan onay; tek kullanım; süresi geçen ve başka oda geçmez; en çok 5 geçerli', ATLA, async () => {
  const { q, hata } = await kur();
  const u = uyelik(q);
  const omer = cihaz('omer');
  const gul = cihaz('gul');
  const ali = cihaz('ali');
  const veli = cihaz('veli');
  await u.katil(ODA, omer);

  const kod = await u.davet(ODA, omer);
  assert.match(kod, DAVET_RE);
  const d = await q(`select encode(ozet, 'hex') as h, room, olusturan, son, kullanildi from public.oda_davet`);
  assert.equal(d.length, 1);
  assert.equal(d[0].h, ozet(kod), 'sunucuda yalnız özet');
  assert.equal(d[0].olusturan, 'omer');
  const gun = (d[0].son - Date.now()) / 86_400_000;
  assert.ok(gun > 6.99 && gun < 7.01, `7 gün geçerli: ${gun}`);

  const r = await u.katil(ODA, gul, { davet: kod });
  assert.equal(r.durum, 'onayli');
  assert.equal(r.ilk, false);
  assert.match(r.kanal, HEX32);
  assert.equal((await u.satir(ODA, 'gul')).onaylayan, 'omer');
  assert.ok((await q('select kullanildi from public.oda_davet'))[0].kullanildi instanceof Date);
  assert.equal((await u.katil(ODA, ali, { davet: kod })).durum, 'bekliyor', 'tek kullanım');

  // Bekleyen cihaz yeni davetle onaylanır.
  assert.equal((await u.katil(ODA, ali, { davet: await u.davet(ODA, gul) })).durum, 'onayli');

  // Süresi geçmiş davet geçmez.
  const kod3 = await u.davet(ODA, omer);
  await q(`update public.oda_davet set son = now() - interval '1 second' where ozet = sha256(convert_to($1, 'UTF8'))`, [kod3]);
  assert.equal((await u.katil(ODA, veli, { davet: kod3 })).durum, 'bekliyor');

  // Başka odanın daveti geçmez ve harcanmaz.
  const kod4 = await u.davet(ODA, omer);
  await u.katil(ODA2, cihaz('kurucu2'));
  assert.equal((await u.katil(ODA2, veli, { davet: kod4 })).durum, 'bekliyor');
  assert.equal((await q(`select kullanildi from public.oda_davet where ozet = sha256(convert_to($1, 'UTF8'))`, [kod4]))[0].kullanildi, null);

  // En çok 5 geçerli davet: fazlası en eskiden silinir; kullanılmış ve süresi geçmişler de temizlenir.
  const kodlar = [];
  for (let i = 0; i < 6; i++) {
    kodlar.push(await u.davet(ODA, omer));
    await bekle(3); // PGlite saati ms çözünürlüklü: sıra kesin olsun
  }
  const kalan = await q(`select encode(ozet, 'hex') as h from public.oda_davet where room = $1`, [ODA]);
  assert.deepEqual(new Set(kalan.map((x) => x.h)), new Set(kodlar.slice(1).map(ozet)));

  // Bekleyen ya da kimliksiz cihaz davet oluşturamaz.
  const bek = cihaz('bek');
  await u.katil(ODA, bek);
  assert.equal((await hata('select public.davet_olustur($1, $2, $3)', [ODA, bek.id, bek.k])).code, '42501');
  assert.equal((await hata('select public.davet_olustur($1, $2, $3)', [ODA, null, null])).code, '42501');
});

test('kurtarma kodu: biçim, yalnız özet, yenisi eskisini geçersiz yapar, tek kullanım, tüm cihazlar gidince geri dönüş', ATLA, async () => {
  const { q, hata } = await kur();
  const u = uyelik(q);
  const omer = cihaz('omer');
  await u.katil(ODA, omer);
  await q('select * from public.doc_put($1, $2, $3, $4::jsonb, $5, false, $6, $7)', [ODA, 'liste', 'a', '{}', 'omer', omer.id, omer.k]);

  const kod1 = await u.kurtarma(ODA, omer);
  assert.match(kod1, KURTARMA_RE);
  assert.equal((await q(`select encode(kurtarma_ozet, 'hex') as h from public.oda`))[0].h, ozet(kod1.replaceAll('-', '')));
  const kod2 = await u.kurtarma(ODA, omer);
  assert.match(kod2, KURTARMA_RE);
  assert.notEqual(kod2, kod1);

  const x = cihaz('x');
  assert.equal((await u.katil(ODA, x, { kurtarma: kod1 })).durum, 'bekliyor', 'eski kod geçersiz');
  // Küçük harf, boşluk, tiresiz yazım kabul edilir; bekleyen cihaz onaylanır.
  assert.equal((await u.katil(ODA, x, { kurtarma: `  ${kod2.toLowerCase().replaceAll('-', '')} ` })).durum, 'onayli');
  assert.equal((await u.oda(ODA)).kurtarma_ozet, null);
  assert.equal((await u.katil(ODA, cihaz('y'), { kurtarma: kod2 })).durum, 'bekliyor', 'tek kullanım');

  // Tüm onaylı cihazlar çıkınca kurtarma koduyla geri dönülür (veri olduğu için kurucu yolu kapalı).
  const kod3 = await u.kurtarma(ODA, x);
  assert.equal(await u.cikar(ODA, omer, 'omer'), true);
  assert.equal(await u.cikar(ODA, x, 'x'), true);
  assert.equal((await u.katil(ODA, cihaz('z'))).durum, 'bekliyor');
  assert.equal((await u.katil(ODA, cihaz('yeni'), { kurtarma: kod3 })).durum, 'onayli');

  const bek = cihaz('bek');
  await u.katil(ODA, bek);
  assert.equal((await hata('select public.kurtarma_olustur($1, $2, $3)', [ODA, bek.id, bek.k])).code, '42501');
  assert.equal((await hata('select public.kurtarma_olustur($1, $2, $3)', [ODA, null, null])).code, '42501');
});

test('eski oda geçişi: olusturma öncesi kisi/author onaylı; sonradan eklenen bekler; 3 gün kimliksiz erişim, kanal = oda kodu', ATLA, async () => {
  const { q, hata } = await kur();
  const u = uyelik(q);
  const put = (oda, kind, id, author) =>
    q('select * from public.doc_put($1, $2, $3, $4::jsonb, $5)', [oda, kind, id, '{"x":1}', author]);
  await put(ODA, 'kisi', 'omer', 'omer');
  await put(ODA, 'mesaj', 'm1', 'gul');
  await q(`update public.room_doc set created_at = now() - interval '1 day'`); // aynı milisaniye olmasın

  // Veri olan odada ilk gelen kurucu olmaz.
  assert.equal((await u.katil(ODA, cihaz('yabanci'))).durum, 'bekliyor');
  const oda = await u.oda(ODA);
  assert.ok(Math.abs((oda.zorunlu - oda.olusturma) - 3 * 86_400_000) < 1000, 'eski oda: 3 gün geçiş');

  const omer = cihaz('omer');
  const gul = cihaz('gul');
  const r1 = await u.katil(ODA, omer);
  assert.equal(r1.durum, 'onayli');
  assert.equal(r1.ilk, false);
  assert.equal(r1.kanal, ODA, 'koruma öncesi kanal = oda kodu');
  assert.equal((await u.katil(ODA, gul)).durum, 'onayli', 'author ile geçiş');

  // Geçişte (kimliksiz) yeni eklenen kişi ya da yazar onay almaz.
  await put(ODA, 'kisi', 'yeni', 'yeni');
  await put(ODA, 'liste', 'l1', 'yeni2');
  assert.equal((await u.katil(ODA, cihaz('yeni'))).durum, 'bekliyor');
  assert.equal((await u.katil(ODA, cihaz('yeni2'))).durum, 'bekliyor');

  // Eski istemci koruma başlayana dek çalışır; cihaz yönetimi her zaman kimlik ister.
  assert.equal((await q('select * from public.doc_list($1, $2)', [ODA, 'kisi'])).length, 2);
  assert.equal((await hata('select * from public.cihaz_listele($1, null, null)', [ODA])).code, '42501');
  assert.equal((await hata('select public.cihaz_onayla($1, null, null, $2)', [ODA, 'yeni'])).code, '42501');

  // Koruma başlayınca kanal gizli değer olur.
  await q(`update public.oda set zorunlu = now() - interval '1 second'`);
  const r2 = await u.durum(ODA, omer);
  assert.match(r2.kanal, HEX32);
  assert.equal(r2.kanal, oda.kanal);
  assert.equal((await u.katil(ODA, gul)).kanal, oda.kanal);

  // Yalnız oyun kaydı olan v1 odası da eski sayılır; belge olmadığından ilk gelen kurucudur.
  await q('select public.log_game($1, $2, $3::jsonb)', [ODA2, 'dama', '{}']);
  const r3 = await u.katil(ODA2, cihaz('ilk'));
  assert.deepEqual([r3.durum, r3.ilk, r3.kanal], ['onayli', true, ODA2]);
});

test('cihaz_onayla / cihaz_reddet / cihaz_listele: yalnız onaylı cihaz; durum geçişleri; 8 onaylı ve 20 satır sınırı', ATLA, async () => {
  const { q, hata } = await kur();
  const u = uyelik(q);
  const omer = cihaz('omer');
  const gul = cihaz('gul');
  const ali = cihaz('ali');
  await u.katil(ODA, omer, { ad: 'Ömer' });
  await u.katil(ODA, gul, { ad: 'Gül' });
  await u.katil(ODA, ali);

  for (const [s, p] of [
    ['select public.cihaz_onayla($1, $2, $3, $4)', [ODA, gul.id, gul.k, 'gul']],
    ['select public.cihaz_onayla($1, $2, $3, $4)', [ODA, null, null, 'gul']],
    ['select public.cihaz_reddet($1, $2, $3, $4)', [ODA, gul.id, gul.k, 'ali']],
    ['select public.cihaz_cikar($1, $2, $3, $4)', [ODA, gul.id, gul.k, 'omer']],
    ['select * from public.cihaz_listele($1, $2, $3)', [ODA, gul.id, gul.k]],
    ['select * from public.cihaz_listele($1, $2, $3)', [ODA, omer.id, gul.k]],
    ['select * from public.cihaz_listele($1, $2, $3)', [ODA2, omer.id, omer.k]],
  ]) {
    assert.equal((await hata(s, p)).code, '42501', `${s} ${p}`);
  }

  assert.equal(await u.onayla(ODA, omer, 'gul'), true);
  const g = await u.satir(ODA, 'gul');
  assert.equal(g.durum, 'onayli');
  assert.equal(g.onaylayan, 'omer');
  assert.equal(await u.onayla(ODA, omer, 'gul'), false, 'zaten onaylı');
  assert.equal(await u.onayla(ODA, omer, 'yok'), false);

  assert.equal(await u.reddet(ODA, gul, 'ali'), true);
  assert.equal((await u.katil(ODA, ali)).durum, 'reddedildi', 'yeniden istekte reddedildi kalır');
  assert.equal((await u.durum(ODA, ali)).durum, 'reddedildi');
  assert.equal(await u.reddet(ODA, gul, 'ali'), false, 'yalnız bekleyen reddedilir');
  assert.equal(await u.reddet(ODA, gul, 'omer'), false, 'onaylı reddedilmez');
  assert.equal(await u.onayla(ODA, gul, 'ali'), true, 'reddedilen sonradan onaylanabilir');

  const liste = await u.liste(ODA, omer);
  assert.deepEqual(liste.map((x) => [x.cihaz, x.ad, x.durum]), [['omer', 'Ömer', 'onayli'], ['gul', 'Gül', 'onayli'], ['ali', null, 'onayli']]);
  assert.deepEqual(Object.keys(liste[0]).sort(), ['ad', 'cihaz', 'durum', 'olusturma', 'son_gorulme']);
  assert.ok(liste[0].olusturma instanceof Date);
  for (const h of ['a b', null]) {
    assert.equal((await hata('select public.cihaz_onayla($1, $2, $3, $4)', [ODA, omer.id, omer.k, h])).code, '22023');
  }

  // En çok 8 onaylı: 3 + 5 = 8.
  await q(`insert into public.oda_cihaz (room, cihaz, anahtar_ozet, durum)
    select $1, 'c' || i, '\\x00', 'onayli' from generate_series(1, 5) as i`, [ODA]);
  const dokuz = cihaz('dokuz');
  assert.equal((await u.katil(ODA, dokuz)).durum, 'bekliyor');
  assert.equal((await hata('select public.cihaz_onayla($1, $2, $3, $4)', [ODA, omer.id, omer.k, 'dokuz'])).code, '54000');
  const kod = await u.davet(ODA, omer);
  assert.equal((await hata('select public.oda_katil($1, $2, $3, null, $4)', [ODA, 'on', cihaz('on').k, kod])).code, '54000');
  assert.equal((await q('select kullanildi from public.oda_davet'))[0].kullanildi, null, 'reddedilen onay daveti harcamaz');

  // Toplam en çok 20 cihaz satırı: 8 onaylı + dokuz + 11 bekleyen = 20.
  await q(`insert into public.oda_cihaz (room, cihaz, anahtar_ozet, durum)
    select $1, 'b' || i, '\\x00', 'bekliyor' from generate_series(1, 11) as i`, [ODA]);
  assert.equal((await hata('select public.oda_katil($1, $2, $3)', [ODA, 'yirmibir', cihaz('x').k])).code, '54000');
  assert.equal((await u.katil(ODA, dokuz)).durum, 'bekliyor', 'var olan satır sınırdan etkilenmez');
});

test('cihaz_cikar: satır ve push aboneliği silinir, davetleri geçersiz, kanal yenilenir, koruma hemen; kendini çıkarabilir', ATLA, async () => {
  const { q, hata } = await kur();
  const u = uyelik(q);
  const omer = cihaz('omer');
  const gul = cihaz('gul');
  await u.katil(ODA, omer);
  await u.katil(ODA, gul, { davet: await u.davet(ODA, omer) });
  const kaydet = (c, n) => q('select public.push_kaydet($1, $2, $3::jsonb, null, $4)', [ODA, c.id, JSON.stringify(ab(n)), c.k]);
  await kaydet(omer, 1);
  await kaydet(gul, 2);
  await q('select public.push_kaydet($1, $2, $3::jsonb)', [ODA2, 'gul', JSON.stringify(ab(3))]); // başka oda
  const gulDaveti = await u.davet(ODA, gul);
  await q(`update public.oda set zorunlu = now() + interval '3 days'`); // geçişteki oda gibi
  const once = await u.oda(ODA);

  assert.equal(await u.cikar(ODA, omer, 'gul'), true);
  assert.equal(await u.satir(ODA, 'gul'), null);
  assert.deepEqual((await q('select room, client from public.push_sub order by room')).map((x) => `${x.room}/${x.client}`),
    [`${ODA}/omer`, `${ODA2}/gul`]);
  const sonra = await u.oda(ODA);
  assert.match(sonra.kanal, HEX32);
  assert.notEqual(sonra.kanal, once.kanal);
  assert.ok(sonra.zorunlu <= new Date(), 'koruma hemen başlar');

  // Çıkarılan cihaz: durum 'yok'; kimlikli ve kimliksiz veri yok; daveti geçersiz; yeniden istek onay bekler.
  assert.equal((await u.durum(ODA, gul)).durum, 'yok');
  assert.equal((await hata('select * from public.doc_list($1, $2, null, 500, $3, $4)', [ODA, 'liste', gul.id, gul.k])).code, '42501');
  assert.equal((await hata('select * from public.doc_list($1, $2)', [ODA, 'liste'])).code, '42501');
  assert.equal((await u.katil(ODA, cihaz('gul-yeni'), { davet: gulDaveti })).durum, 'bekliyor', 'çıkarılanın daveti geçersiz');
  assert.equal((await u.katil(ODA, gul)).durum, 'bekliyor');

  // Olmayan cihaz: false, kanal değişmez.
  assert.equal(await u.cikar(ODA, omer, 'yok'), false);
  assert.equal((await u.oda(ODA)).kanal, sonra.kanal);
  // Kendini çıkarmak serbest.
  assert.equal(await u.cikar(ODA, omer, 'omer'), true);
  assert.equal((await u.durum(ODA, omer)).durum, 'yok');
});

test('oda_yetki: koruma öncesi kimliksiz geçer, sonrası 42501; geçersiz kimlik her zaman 42501; onaylı geçer', ATLA, async () => {
  const { q, hata } = await kur();
  const u = uyelik(q);
  // push_kaydet'te cihaz = p_client; kimlik anahtarla başlar (anahtar yoksa kimliksiz).
  const cagrilar = {
    log_game: (c) => ['select public.log_game($1, $2, $3::jsonb, $4, $5)', [ODA, 'dama', '{}', c.id, c.k]],
    room_stats: (c) => ['select * from public.room_stats($1, $2, $3)', [ODA, c.id, c.k]],
    doc_put: (c) => ['select * from public.doc_put($1, $2, $3, $4::jsonb, null, false, $5, $6)', [ODA, 'liste', 'a', '{"x":1}', c.id, c.k]],
    doc_patch: (c) => ['select * from public.doc_patch($1, $2, $3, $4::jsonb, null, $5, $6)', [ODA, 'liste', 'a', '{"y":1}', c.id, c.k]],
    doc_list: (c) => ['select * from public.doc_list($1, $2, null, 500, $3, $4)', [ODA, 'liste', c.id, c.k]],
    doc_page: (c) => ['select * from public.doc_page($1, $2, null, 50, $3, $4)', [ODA, 'liste', c.id, c.k]],
    push_kaydet: (c) => ['select public.push_kaydet($1, $2, $3::jsonb, null, $4)', [ODA, c.id ?? 'eski-tel', JSON.stringify(ab(1)), c.k]],
  };
  const gec = async (c) => {
    for (const f of Object.values(cagrilar)) await q(...f(c));
  };
  const red = async (c, neden, adlar = Object.keys(cagrilar)) => {
    for (const ad of adlar) {
      const e = await hata(...cagrilar[ad](c));
      assert.equal(e.code, '42501', `${ad} ${neden}: ${e.message}`);
      assert.equal(e.message, `${ad}: yetki yok`);
    }
  };

  // Oda satırı yok: kimliksiz geçer, geçersiz kimlik yine reddedilir.
  await gec(KIMLIKSIZ);
  const omer = cihaz('omer');
  await red(omer, 'kayıtlı olmayan cihaz');

  // Eski oda: omer geçişle onaylı, bek bekliyor; 3 gün kimliksiz erişim.
  await q(`select * from public.doc_put($1, 'kisi', 'omer', '{}'::jsonb, 'omer')`, [ODA]);
  await q(`update public.room_doc set created_at = now() - interval '1 day'`);
  assert.equal((await u.katil(ODA, omer)).durum, 'onayli');
  const bek = cihaz('bek');
  assert.equal((await u.katil(ODA, bek)).durum, 'bekliyor');
  await gec(KIMLIKSIZ);
  await gec(omer);
  await red({ id: omer.id, k: bek.k }, 'yanlış anahtar');
  await red(bek, 'bekleyen cihaz');
  await red({ id: 'a b', k: omer.k }, 'bozuk cihaz');
  await red({ id: omer.id, k: 'kisa' }, 'bozuk anahtar');
  await red({ id: 'yok', k: omer.k }, 'kayıtlı olmayan cihaz');
  await red({ id: null, k: omer.k }, 'yalnız anahtar');
  await red({ id: omer.id, k: null }, 'yalnız cihaz', Object.keys(cagrilar).filter((ad) => ad !== 'push_kaydet'));

  // Koruma başladı: kimliksiz 42501, onaylı geçer, başka oda etkilenmez.
  await q(`update public.oda set zorunlu = now() - interval '1 second'`);
  await red(KIMLIKSIZ, 'koruma sonrası kimliksiz');
  await gec(omer);
  await q('select * from public.doc_list($1, $2)', [ODA2, 'liste']);

  // son_gorulme en çok 10 dakikada bir yazılır.
  const liste = () => q('select * from public.doc_list($1, $2, null, 500, $3, $4)', [ODA, 'liste', omer.id, omer.k]);
  await q(`update public.oda_cihaz set son_gorulme = now() - interval '11 minutes' where cihaz = 'omer'`);
  await liste();
  assert.ok(Date.now() - (await u.satir(ODA, 'omer')).son_gorulme < 60_000);
  await q(`update public.oda_cihaz set son_gorulme = now() - interval '5 minutes' where cihaz = 'omer'`);
  const s2 = (await u.satir(ODA, 'omer')).son_gorulme;
  await liste();
  assert.equal((await u.satir(ODA, 'omer')).son_gorulme.getTime(), s2.getTime());
});

test('doc_ice_aktar: kimlik zorunlu; yeni olan kazanır; yedekteki zamanlar; 200 sınırı; biçim; sınır bir kez sayılır', ATLA, async () => {
  const { db, q, hata } = await kur();
  const u = uyelik(q);
  const omer = cihaz('omer');
  await u.katil(ODA, omer);
  const aktar = async (belgeler, c = omer) =>
    (await q('select public.doc_ice_aktar($1, $2, $3, $4::jsonb) as n', [ODA, c.id, c.k, JSON.stringify(belgeler)]))[0].n;
  const aktarHata = (belgeler, c = omer) =>
    hata('select public.doc_ice_aktar($1, $2, $3, $4::jsonb)', [ODA, c.id, c.k, belgeler === undefined ? null : JSON.stringify(belgeler)]);
  const belge = async (id) => (await q('select * from public.room_doc where room = $1 and id = $2', [ODA, id]))[0];
  const yazma = async () => (await q('select coalesce(sum(n), 0)::int as n from public.room_rate where room = $1', [ODA]))[0].n;
  const put = (id, data) => q('select * from public.doc_put($1, $2, $3, $4::jsonb, $5, false, $6, $7)', [ODA, 'liste', id, JSON.stringify(data), 'omer', omer.id, omer.k]);
  await put('a', { v: 'sunucu' });
  await put('e', { v: 'eski-sunucu' });
  await q(`update public.room_doc set updated_at = '2021-01-01T00:00:00Z' where id = 'e'`);

  const yedek = [
    { kind: 'liste', id: 'a', data: { v: 'yedek' }, updated_at: '2020-01-01T00:00:00Z' }, // sunucudaki yeni: atlanır
    { kind: 'liste', id: 'e', data: { v: 'yedek' }, author: 'gul', updated_at: '2022-01-01T00:00:00Z' }, // yedek yeni: yazılır
    { kind: 'mesaj', id: 'b', data: { metin: 'selam' }, author: 'gul', created_at: '2025-01-01T10:00:00Z', updated_at: '2025-02-01T10:00:00.123Z' },
    { kind: 'ani', id: 'c', data: { baslik: 'x' } }, // zamansız: şimdi
    { kind: 'liste', id: 'd', data: { v: 1 }, deleted: true, author: null },
  ];
  const once = await yazma();
  assert.equal(await aktar(yedek), 4);
  assert.equal(await yazma(), once + 1, 'doc_sinir bir kez');
  assert.deepEqual((await belge('a')).data, { v: 'sunucu' });
  const e = await belge('e');
  assert.deepEqual([e.data, e.author, e.updated_at.toISOString()], [{ v: 'yedek' }, 'gul', '2022-01-01T00:00:00.000Z']);
  const b = await belge('b');
  assert.deepEqual([b.kind, b.author, b.created_at.toISOString(), b.updated_at.toISOString()],
    ['mesaj', 'gul', '2025-01-01T10:00:00.000Z', '2025-02-01T10:00:00.123Z']);
  const c = await belge('c');
  assert.ok(Date.now() - c.created_at < 60_000 && Date.now() - c.updated_at < 60_000);
  const d = await belge('d');
  assert.deepEqual([d.deleted, d.data], [true, {}]);
  assert.equal(await aktar(yedek), 0, 'aynı yedek ikinci kez: hiçbir şey yazılmaz');

  // Gelecekteki zaman şimdiye çekilir (eşitleme imleci bozulmasın).
  assert.equal(await aktar([{ kind: 'liste', id: 'f', data: {}, created_at: '2999-01-01T00:00:00Z', updated_at: '2999-01-01T00:00:00Z' }]), 1);
  const f = await belge('f');
  assert.ok(f.updated_at <= new Date() && f.created_at <= new Date());

  // 200 sınırı.
  const cok = Array.from({ length: 201 }, (_, i) => ({ kind: 'liste', id: `x${i}`, data: { i } }));
  assert.equal((await aktarHata(cok)).code, '22023');
  assert.equal(await aktar(cok.slice(0, 200)), 200);
  assert.equal(await aktar([]), 0);

  // Biçim: biri bozuksa hiçbiri yazılmaz.
  for (const kotu of [
    undefined, {}, 'metin', ['metin'], [null],
    [{ kind: 'X', id: 'a', data: {} }],
    [{ kind: 'liste', id: 'a b', data: {} }],
    [{ kind: 'liste', data: {} }],
    [{ kind: 'liste', id: 'a', data: [] }],
    [{ kind: 'liste', id: 'a' }],
    [{ kind: 'liste', id: 'a', data: { t: 'x'.repeat(33000) } }],
    [{ kind: 'liste', id: 'a', data: {}, author: 'a b' }],
    [{ kind: 'liste', id: 'a', data: {}, deleted: 'evet' }],
    [{ kind: 'liste', id: 'a', data: {}, updated_at: 'dün' }],
    [{ kind: 'liste', id: 'a', data: {}, updated_at: 'infinity' }],
    [{ kind: 'liste', id: 'a', data: {}, created_at: '2025-13-45T00:00:00Z' }],
    [{ kind: 'liste', id: 'yeni1', data: {} }, { kind: 'X', id: 'a', data: {} }],
  ]) {
    const err = await aktarHata(kotu);
    assert.equal(err.code, '22023', `${JSON.stringify(kotu)?.slice(0, 80)}: ${err.message}`);
  }
  assert.equal(await belge('yeni1'), undefined);

  // Kimlik zorunlu (koruma öncesinde de), bekleyen cihaz yazamaz.
  await q(`update public.oda set zorunlu = now() + interval '1 day'`);
  assert.equal((await aktarHata([], KIMLIKSIZ)).code, '42501');
  const bek = cihaz('bek');
  await u.katil(ODA, bek);
  assert.equal((await aktarHata([], bek)).code, '42501');

  // Yazma sınırı (doc_sinir).
  await db.exec(`update public.room_rate set n = 2000 where room = '${ODA}'`);
  const sinir = await aktarHata([{ kind: 'liste', id: 'g', data: {} }]);
  assert.equal(sinir.code, '54000');
  assert.match(sinir.message, /doc_ice_aktar: cok fazla yazma/);
  assert.equal(await belge('g'), undefined);
});

test('oda_katil hız sınırı: oda başına saatte 30, genel 1000 deneme; onaylı cihazın girişi sayılmaz; eski sayaçlar silinir', ATLA, async () => {
  const { q, hata } = await kur();
  const u = uyelik(q);
  const omer = cihaz('omer');
  const bek = cihaz('bek');
  await u.katil(ODA, omer); // 1. deneme (henüz onaylı değildi)
  for (let i = 0; i < 40; i++) await u.katil(ODA, omer); // onaylı: sayılmaz
  for (let i = 0; i < 29; i++) await u.katil(ODA, bek); // 2..30
  const e = await hata('select public.oda_katil($1, $2, $3)', [ODA, bek.id, bek.k]);
  assert.equal(e.code, '54000');
  assert.match(e.message, /oda_katil: cok fazla deneme/);
  assert.equal((await q('select n from public.oda_katil_rate where room = $1', [ODA]))[0].n, 30, 'reddedilen deneme sayılmaz');
  assert.equal((await u.katil(ODA, omer)).durum, 'onayli', 'onaylı cihaz sınırdan etkilenmez');
  assert.equal((await u.durum(ODA, bek)).durum, 'bekliyor', 'oda_durum sınırsız');

  // Başka oda etkilenmez; genel sınır.
  await u.katil(ODA2, cihaz('x'));
  await q(`update public.oda_katil_rate set n = 1000 where room = '*'`);
  assert.equal((await hata('select public.oda_katil($1, $2, $3)', ['yyyyyyyy22', 'y', cihaz('y').k])).code, '54000');

  // Eski kovalar saatin ilk genel denemesinde silinir.
  await q(`delete from public.oda_katil_rate where room = '*'`);
  await q(`insert into public.oda_katil_rate values ('eskioda222', now() - interval '2 days', 5)`);
  await u.katil(ODA2, cihaz('z'));
  assert.equal((await q(`select count(*)::int as n from public.oda_katil_rate where room = 'eskioda222'`))[0].n, 0);
});

test('push: koruma altındaki odada yalnız onaylı cihazlar; push_hedef anahtarla; push_abonelikler ve hatirlat_belgeler süzülür', ATLA, async () => {
  const { q, hata } = await kur();
  const u = uyelik(q);
  const omer = cihaz('omer');
  const gul = cihaz('gul');
  const bek = cihaz('bek');
  // ODA2: oda satırı yok (eski istemci), kimliksiz abonelik.
  await q('select public.push_kaydet($1, $2, $3::jsonb)', [ODA2, 'eski', JSON.stringify(ab(9))]);
  await q('select * from public.doc_put($1, $2, $3, $4::jsonb, null)', [ODA2, 'gun', 'g', '{"baslik":"x"}']);

  // ODA: oda satırı yokken eski bir cihaz abone olmuş; sonra yeni istemciler katılır (yeni oda: koruma hemen).
  await q('select public.push_kaydet($1, $2, $3::jsonb)', [ODA, 'eski-tel', JSON.stringify(ab(1))]);
  await u.katil(ODA, omer);
  await u.katil(ODA, gul, { davet: await u.davet(ODA, omer) });
  await u.katil(ODA, bek);
  const kaydet = (c, n) => q('select public.push_kaydet($1, $2, $3::jsonb, null, $4)', [ODA, c.id, JSON.stringify(ab(n)), c.k]);
  await kaydet(omer, 2);
  await kaydet(gul, 3);
  assert.equal((await hata('select public.push_kaydet($1, $2, $3::jsonb, null, $4)', [ODA, bek.id, JSON.stringify(ab(4)), bek.k])).code, '42501');
  assert.equal((await hata('select public.push_kaydet($1, $2, $3::jsonb)', [ODA, 'eski-tel', JSON.stringify(ab(5))])).code, '42501');

  const hedef = async (from, k) => (await q('select endpoint from public.push_hedef($1, $2, $3)', [ODA, from, k])).map((x) => x.endpoint);
  assert.deepEqual(await hedef('omer', omer.k), [ab(3).endpoint], 'onaylı olmayan eski-tel hedef değil');
  for (const [from, k] of [['omer', null], [null, null], ['omer', gul.k], [null, omer.k], ['bek', bek.k], ['a b', omer.k]]) {
    assert.equal((await hata('select * from public.push_hedef($1, $2, $3)', [ODA, from, k])).code, '42501', `${from} ${k}`);
  }
  assert.deepEqual((await q('select endpoint from public.push_hedef($1, null)', [ODA2])).map((x) => x.endpoint), [ab(9).endpoint]);

  const abonelikler = async () => (await q('select room, client from public.push_abonelikler() order by room, client')).map((x) => `${x.room}/${x.client}`);
  assert.deepEqual(await abonelikler(), [`${ODA}/gul`, `${ODA}/omer`, `${ODA2}/eski`]);

  const odalar = async () => (await q(`select distinct room from public.hatirlat_belgeler(array['gun'])`)).map((x) => x.room).sort();
  await q('select * from public.doc_put($1, $2, $3, $4::jsonb, null, false, $5, $6)', [ODA, 'gun', 'g1', '{"baslik":"y"}', omer.id, omer.k]);
  assert.deepEqual(await odalar(), [ODA, ODA2].sort());
  await q(`delete from public.push_sub where client in ('omer', 'gul')`);
  assert.deepEqual(await odalar(), [ODA2], 'yalnız onaysız aboneliği olan korumalı oda hatırlatma almaz');

  // Koruma öncesi (geçiş) odada tüm abonelikler sayılır.
  await q(`update public.oda set zorunlu = now() + interval '1 day'`);
  assert.deepEqual(await abonelikler(), [`${ODA}/eski-tel`, `${ODA2}/eski`]);
  assert.deepEqual(await odalar(), [ODA, ODA2].sort());
});

// Canlıdaki önceki şemanın imzaları (gövdeler önemsiz). Yeni şema eskileri kaldırmalı, sql olanları plpgsql yapmalı.
const DOC = 'table (id text, data jsonb, author text, deleted boolean, created_at timestamptz, updated_at timestamptz)';
const DOC_BOS = 'select null::text, null::jsonb, null::text, null::boolean, null::timestamptz, null::timestamptz where false';
const ESKI_IMZALAR = `
  create function public.log_game(p_room text, p_game text, p_result jsonb) returns void language plpgsql as $$ begin end $$;
  create function public.room_stats(p_room text) returns table (game text, played bigint, last_at timestamptz)
    language sql stable as $$ select null::text, 0::bigint, null::timestamptz where false $$;
  create function public.doc_put(p_room text, p_kind text, p_id text, p_data jsonb, p_author text, p_deleted boolean default false)
    returns ${DOC} language plpgsql as $$ begin end $$;
  create function public.doc_list(p_room text, p_kind text, p_since timestamptz default null, p_limit integer default 500)
    returns ${DOC} language sql stable as $$ ${DOC_BOS} $$;
  create function public.doc_page(p_room text, p_kind text, p_before timestamptz default null, p_limit integer default 50)
    returns ${DOC} language sql stable as $$ ${DOC_BOS} $$;
  create function public.doc_patch(p_room text, p_kind text, p_id text, p_patch jsonb, p_author text)
    returns ${DOC} language plpgsql as $$ begin end $$;
  create function public.push_kaydet(p_room text, p_client text, p_sub jsonb, p_ua text default null)
    returns boolean language plpgsql as $$ begin return true; end $$;
  create function public.push_hedef(p_room text, p_from text) returns table (endpoint text, p256dh text, auth text)
    language plpgsql as $$ begin end $$;
  create function public.push_abonelikler(p_after text default null, p_limit integer default 500)
    returns table (room text, client text, endpoint text, p256dh text, auth text)
    language sql stable as $$ select null::text, null::text, null::text, null::text, null::text where false $$;
  create function public.hatirlat_belgeler(p_kinds text[], p_gs_gun integer default null, p_after text[] default null,
    p_limit integer default 500) returns table (room text, kind text, id text, data jsonb)
    language sql stable as $$ select null::text, null::text, null::text, null::jsonb where false $$;
`;

test('push: geçişte kimliksiz, başka cihaz adına kayıt koruma başlayınca sayılmaz; anahtarla kayıt sayılır', ATLA, async () => {
  const { q } = await kur();
  const u = uyelik(q);
  // Eski oda: L geçişle onaylı, M davetle.
  await q(`select * from public.doc_put($1, 'kisi', 'L', '{}'::jsonb, 'L')`, [ODA]);
  await q(`update public.room_doc set created_at = now() - interval '1 day'`);
  const L = cihaz('L');
  const M = cihaz('M');
  assert.equal((await u.katil(ODA, L)).durum, 'onayli');
  assert.equal((await u.katil(ODA, M, { davet: await u.davet(ODA, L) })).durum, 'onayli');
  // Oda kodunu bilen biri geçişte (kimliksiz çağrı geçer) L adına abone olur.
  await q('select public.push_kaydet($1, $2, $3::jsonb)', [ODA, 'L', JSON.stringify(ab(66))]);
  const dogrulandi = async () => (await q('select endpoint, dogrulandi from public.push_sub order by endpoint'))
    .map((x) => [x.endpoint, x.dogrulandi]);
  assert.deepEqual(await dogrulandi(), [[ab(66).endpoint, false]]);
  const hedef = async () => (await q('select endpoint from public.push_hedef($1, $2, $3)', [ODA, M.id, M.k])).map((x) => x.endpoint);
  assert.deepEqual(await hedef(), [ab(66).endpoint], 'geçişte kimliksiz kayıt sayılır');

  await q(`update public.oda set zorunlu = now() - interval '1 second'`);
  assert.deepEqual(await hedef(), [], 'koruma altında kimliksiz kayıt sayılmaz');
  assert.deepEqual(await q('select * from public.push_abonelikler()'), []);

  // L anahtarıyla kaydolur: sayılır; kendi eski (kimliksiz) kaydı silinir.
  await q('select public.push_kaydet($1, $2, $3::jsonb, null, $4)', [ODA, L.id, JSON.stringify(ab(67)), L.k]);
  assert.deepEqual(await dogrulandi(), [[ab(67).endpoint, true]]);
  assert.deepEqual(await hedef(), [ab(67).endpoint]);
  assert.deepEqual((await q('select endpoint from public.push_abonelikler()')).map((x) => x.endpoint), [ab(67).endpoint]);

  // Aynı adres önce kimliksiz (eski istemci), sonra anahtarla (yeni istemci) kaydedilince doğrulanır.
  await q(`update public.oda set zorunlu = now() + interval '1 day'`);
  await q('select public.push_kaydet($1, $2, $3::jsonb)', [ODA, M.id, JSON.stringify(ab(68))]);
  await q(`update public.oda set zorunlu = now() - interval '1 second'`);
  await q('select public.push_kaydet($1, $2, $3::jsonb, null, $4)', [ODA, M.id, JSON.stringify(ab(68)), M.k]);
  assert.deepEqual(await dogrulandi(), [[ab(67).endpoint, true], [ab(68).endpoint, true]]);
});

test('oda_yetki: cihaz satırını paylaşımlı kilitler (çıkarma, süren isteğin bitmesini bekler)', ATLA, async () => {
  const { q } = await kur();
  // Tek bağlantılı PGlite'ta eşzamanlılık denenemez; kilit ifadesi yapıdan denetlenir.
  const kaynak = (await q(`select prosrc from pg_catalog.pg_proc where proname = 'oda_yetki'`))[0].prosrc;
  assert.match(kaynak, /for key share of c/);
});

test('şema: eski şemanın üstüne kurulur; eski imzalar kalmaz; yetki fonksiyonları volatile ve tanımlayıcı yetkili; eski adlı argümanlar; anon yeni RPC\'leri çağırır', ATLA, async () => {
  const { db, q } = await kur({ once: ESKI_IMZALAR });
  const dil = await q(`select p.proname as ad, l.lanname as dil from pg_catalog.pg_proc as p
    join pg_catalog.pg_language as l on l.oid = p.prolang where p.proname in ('push_abonelikler', 'hatirlat_belgeler')`);
  assert.deepEqual(dil.map((x) => x.dil), ['plpgsql', 'plpgsql']);
  const adlar = ['log_game', 'room_stats', 'doc_put', 'doc_patch', 'doc_list', 'doc_page', 'push_kaydet', 'push_hedef',
    'oda_katil', 'oda_durum', 'cihaz_listele', 'cihaz_onayla', 'cihaz_reddet', 'cihaz_cikar', 'davet_olustur',
    'kurtarma_olustur', 'doc_ice_aktar'];
  const r = await q(`
    select p.proname as ad, count(*)::int as n, bool_and(p.provolatile = 'v') as volatile, bool_and(p.prosecdef) as definer,
      bool_and(array_to_string(p.proconfig, ',') = 'search_path=""') as yol
    from pg_catalog.pg_proc as p join pg_catalog.pg_namespace as s on s.oid = p.pronamespace
    where s.nspname = 'public' and p.proname = any ($1) group by p.proname`, [adlar]);
  assert.deepEqual(r.map((x) => x.ad).sort(), [...adlar].sort());
  for (const x of r) {
    // Tek imza: aynı adlı iki fonksiyon PostgREST'te belirsizlik (PGRST203) yaratır.
    // volatile: PostgREST stable fonksiyonu salt okunur işlemde çalıştırır; son_gorulme yazılamaz.
    assert.deepEqual([x.n, x.volatile, x.definer, x.yol], [1, true, true, true], x.ad);
  }

  // Eski istemci: yeni parametreler olmadan, adlı argümanlarla.
  await q(`select * from public.doc_put(p_room => $1, p_kind => 'liste', p_id => 'a', p_data => '{}'::jsonb, p_author => null)`, [ODA]);
  await q(`select * from public.doc_patch(p_room => $1, p_kind => 'liste', p_id => 'a', p_patch => '{"x":1}'::jsonb, p_author => null)`, [ODA]);
  assert.equal((await q(`select * from public.doc_list(p_room => $1, p_kind => 'liste', p_since => null, p_limit => 10)`, [ODA])).length, 1);
  assert.equal((await q(`select * from public.doc_page(p_room => $1, p_kind => 'liste')`, [ODA])).length, 1);
  await q(`select public.log_game(p_room => $1, p_game => 'dama', p_result => null)`, [ODA]);
  assert.equal((await q(`select * from public.room_stats(p_room => $1)`, [ODA])).length, 1);
  await q(`select public.push_kaydet(p_room => $1, p_client => 'c', p_sub => $2::jsonb, p_ua => 'x')`, [ODA, JSON.stringify(ab(1))]);
  await q(`select * from public.push_hedef(p_room => $1, p_from => 'd')`, [ODA]);
  assert.equal((await q('select * from public.push_abonelikler()')).length, 1);
  assert.equal((await q(`select * from public.hatirlat_belgeler(array['liste'])`)).length, 1);

  // anon (tarayıcı) yeni RPC'lerin hepsini çağırabilir.
  await db.exec('set role anon');
  const u = uyelik(q);
  const omer = cihaz('omer');
  const gul = cihaz('gul');
  const ali = cihaz('ali');
  assert.equal((await u.katil(ODA2, omer)).ilk, true);
  assert.equal((await u.katil(ODA2, gul)).durum, 'bekliyor');
  assert.equal((await u.katil(ODA2, ali)).durum, 'bekliyor');
  assert.equal((await u.durum(ODA2, gul)).durum, 'bekliyor');
  assert.equal((await u.liste(ODA2, omer)).length, 3);
  assert.equal(await u.onayla(ODA2, omer, 'gul'), true);
  assert.equal(await u.reddet(ODA2, omer, 'ali'), true);
  assert.equal(await u.cikar(ODA2, omer, 'ali'), true);
  assert.match(await u.davet(ODA2, omer), DAVET_RE);
  assert.match(await u.kurtarma(ODA2, omer), KURTARMA_RE);
  assert.equal((await q('select public.doc_ice_aktar($1, $2, $3, $4::jsonb) as n', [ODA2, gul.id, gul.k, '[{"kind":"liste","id":"a","data":{}}]']))[0].n, 1);
  await q('select * from public.doc_list($1, $2, null, 500, $3, $4)', [ODA2, 'liste', gul.id, gul.k]);
  await db.exec('reset role');
});
