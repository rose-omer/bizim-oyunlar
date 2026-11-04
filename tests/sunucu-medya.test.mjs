// Edge Function 'medya': imzalı okuma, cihaz yetkili yükleme, silme kuyruğu. Saf işleyici; fetch ve env sahte.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { medyaIsleyici, yolGecerli, turCoz, IMZA_SURE } from '../supabase/functions/_shared/medya.js';

const ODA = 'abcdefgh23';
const KEY = 'a'.repeat(43);
const U = '0f8e2a1c-1b2d-4c3e-8f9a-0123456789ab';
const YOL = `${ODA}/${U}.webp`;
const PUB = 'sb_publishable_x';
const SEC = 'sb_secret_y';
const HOST = 'https://test.supabase.co';
const env = (ad) => ({ SUPABASE_URL: HOST, SUPABASE_SECRET_KEYS: JSON.stringify({ d: SEC }), SUPABASE_PUBLISHABLE_KEYS: JSON.stringify({ d: PUB }) })[ad];

function sahte(ayar = {}) {
  const c = { rpc: [], depo: [] };
  const fn = async (url, init = {}) => {
    const u = String(url);
    const rpc = /\/rest\/v1\/rpc\/(\w+)$/.exec(u);
    if (rpc) {
      c.rpc.push({ ad: rpc[1], args: JSON.parse(init.body) });
      if (ayar.rpcHata?.[rpc[1]]) return new Response(JSON.stringify(ayar.rpcHata[rpc[1]]), { status: 400 });
      if (rpc[1] === 'hatirlat_anahtar') return new Response(JSON.stringify('gizli'));
      if (rpc[1] === 'medya_silinecekler') {
        const sira = ayar.kuyruk || [];
        return new Response(JSON.stringify(sira.shift() || []));
      }
      return new Response('null');
    }
    c.depo.push({ url: u, method: init.method, headers: init.headers, body: init.body });
    if (u.endsWith('/storage/v1/object/sign/photos')) {
      const { paths } = JSON.parse(init.body);
      return new Response(JSON.stringify(paths.map((p) => (ayar.eksik?.includes(p)
        ? { path: p, signedURL: null, error: 'yok' }
        : { path: p, signedURL: `/object/sign/photos/${p}?token=T`, error: null }))));
    }
    if (ayar.depoDurum) return new Response(JSON.stringify(ayar.depoGovde || {}), { status: ayar.depoDurum });
    return new Response('{}');
  };
  return { fn, c };
}

const BAS = { Origin: 'https://rose-omer.github.io', apikey: PUB };
const imzaIstek = (govde, b = BAS) => new Request(`${HOST}/functions/v1/medya?islem=imzala`, {
  method: 'POST', headers: { ...b, 'Content-Type': 'application/json' }, body: JSON.stringify(govde),
});
const IMZA = { room: ODA, cihaz: 'omer', anahtar: KEY, yollar: [YOL] };
const webp = (n = 32) => {
  const b = new Uint8Array(n);
  b.set(new TextEncoder().encode('RIFF'), 0);
  b.set(new TextEncoder().encode('WEBP'), 8);
  return b;
};
const yukIstek = (govde, { tur = 'image/webp', ek = {}, b = BAS } = {}) => new Request(`${HOST}/functions/v1/medya?islem=yukle`, {
  method: 'POST',
  headers: { ...b, 'Content-Type': tur, 'x-oda': ODA, 'x-cihaz': 'omer', 'x-anahtar': KEY, ...ek },
  body: govde,
});

test('yolGecerli: yalnız oda/uuid.uzantı; yol kaçışı ve başka uzantı yok', () => {
  assert.equal(yolGecerli(YOL), true);
  assert.equal(yolGecerli(`${ODA}/${U}.m4a`), true);
  for (const y of [`../${U}.webp`, `${ODA}/../${U}.webp`, `${ODA}/${U}.svg`, `${ODA}/a.webp`, 'x', null, `${ODA}/${U}.webp?x=1`]) {
    assert.equal(yolGecerli(y), false, String(y));
  }
});

test('turCoz: içerik imzası beyanla uyuşmalı; html ya da svg foto sayılmaz', () => {
  const b = (...x) => new Uint8Array([...x, ...new Array(16).fill(0)]);
  assert.deepEqual(turCoz('image/jpeg', b(0xff, 0xd8, 0xff)), { mime: 'image/jpeg', uzanti: 'jpg', tur: 'foto' });
  assert.deepEqual(turCoz('image/webp', webp()), { mime: 'image/webp', uzanti: 'webp', tur: 'foto' });
  assert.deepEqual(turCoz('audio/webm;codecs=opus', b(0x1a, 0x45, 0xdf, 0xa3)), { mime: 'audio/webm', uzanti: 'webm', tur: 'ses' });
  assert.deepEqual(turCoz('audio/mp4', new Uint8Array([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0, 0, 0, 0])), { mime: 'audio/mp4', uzanti: 'm4a', tur: 'ses' });
  assert.deepEqual(turCoz('image/png', b(0x89, 0x50, 0x4e, 0x47)), { mime: 'image/png', uzanti: 'jpg', tur: 'foto' });
  assert.equal(turCoz('image/jpeg', new TextEncoder().encode('<html><script>')), null);
  assert.equal(turCoz('image/webp', b(0xff, 0xd8, 0xff)), null, 'beyan edilen tür tutmuyor');
  assert.equal(turCoz('text/html', b(0xff, 0xd8, 0xff)), null);
});

test('kapı: OPTIONS, yöntem, köken ve anahtar; özel başlıklara CORS izni', async () => {
  const { fn, c } = sahte();
  const h = medyaIsleyici({ env, fetchFn: fn });
  const pre = await h(new Request(`${HOST}/x`, { method: 'OPTIONS', headers: { Origin: 'http://localhost:5181' } }));
  assert.equal(pre.status, 204);
  assert.equal(pre.headers.get('access-control-allow-origin'), 'http://localhost:5181');
  assert.match(pre.headers.get('access-control-allow-headers'), /x-oda/);
  assert.match(pre.headers.get('access-control-allow-headers'), /x-anahtar/);
  assert.equal((await h(new Request(`${HOST}/x?islem=imzala`))).status, 405);
  assert.equal((await h(imzaIstek(IMZA, { Origin: 'https://evil.example', apikey: PUB }))).status, 403);
  assert.equal((await h(imzaIstek(IMZA, { Origin: 'https://rose-omer.github.io', apikey: 'yanlis' }))).status, 401);
  assert.equal((await h(new Request(`${HOST}/x?islem=baska`, { method: 'POST', headers: BAS, body: '{}' }))).status, 404);
  assert.equal(c.depo.length, 0);
});

test('imzala: yetki RPC sonrası kısa ömürlü adres; eksik dosya ayrı; servis anahtarı depoya gider, yanıta gitmez', async () => {
  const eksikYol = `${ODA}/1f8e2a1c-1b2d-4c3e-8f9a-0123456789ab.jpg`;
  const { fn, c } = sahte({ eksik: [eksikYol] });
  const r = await medyaIsleyici({ env, fetchFn: fn })(imzaIstek({ ...IMZA, yollar: [YOL, eksikYol, YOL] }));
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.deepEqual(j, { adresler: { [YOL]: `${HOST}/storage/v1/object/sign/photos/${YOL}?token=T` }, eksik: [eksikYol], sure: IMZA_SURE });
  assert.deepEqual(c.rpc[0], { ad: 'medya_imza_izni', args: { p_room: ODA, p_cihaz: 'omer', p_anahtar: KEY } });
  const d = c.depo[0];
  assert.equal(d.headers.apikey, SEC);
  assert.deepEqual(JSON.parse(d.body), { expiresIn: IMZA_SURE, paths: [YOL, eksikYol] });
  assert.ok(IMZA_SURE <= 3600, 'kısa ömür');
  assert.ok(!JSON.stringify(j).includes(SEC));
});

test('imzala: bozuk girdi 400; başka odanın yolu reddedilir; 42501 → 403 ve depoya gidilmez', async () => {
  const { fn, c } = sahte();
  const h = medyaIsleyici({ env, fetchFn: fn });
  assert.equal((await h(imzaIstek({ ...IMZA, yollar: ['zzzzzzzz22/' + U + '.webp'] }))).status, 400);
  assert.equal((await h(imzaIstek({ ...IMZA, yollar: [] }))).status, 400);
  assert.equal((await h(imzaIstek({ ...IMZA, yollar: new Array(101).fill(YOL) }))).status, 400);
  assert.equal((await h(imzaIstek({ ...IMZA, anahtar: 'kisa' }))).status, 400);
  assert.equal((await h(imzaIstek({ ...IMZA, room: '../x' }))).status, 400);
  assert.equal(c.rpc.length + c.depo.length, 0, 'biçim hatası ağa çıkmaz');
  const yasak = sahte({ rpcHata: { medya_imza_izni: { code: '42501', message: 'yetki yok' } } });
  const r = await medyaIsleyici({ env, fetchFn: yasak.fn })(imzaIstek(IMZA));
  assert.equal(r.status, 403);
  assert.equal(yasak.c.depo.length, 0);
});

test('yukle: geçerli foto servis anahtarıyla kovaya gider; yol sunucuda üretilir; upsert yok', async () => {
  const { fn, c } = sahte();
  const r = await medyaIsleyici({ env, fetchFn: fn })(yukIstek(webp()));
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.match(j.yol, new RegExp(`^${ODA}/[0-9a-f-]{36}\\.webp$`));
  assert.equal(j.bayt, 32);
  assert.deepEqual(c.rpc[0], { ad: 'medya_yukleme_izni', args: { p_room: ODA, p_cihaz: 'omer', p_anahtar: KEY, p_bayt: 32, p_tur: 'foto' } });
  const d = c.depo[0];
  assert.equal(d.url, `${HOST}/storage/v1/object/photos/${j.yol}`);
  assert.equal(d.method, 'POST');
  assert.equal(d.headers.apikey, SEC);
  assert.equal(d.headers['Content-Type'], 'image/webp');
  assert.equal(d.headers['x-upsert'], 'false');
});

test('yukle: ses 2 MB ve foto 5 MB sunucuda; kimliksiz 400; 42501 → 403; dolu → 429; yanlış içerik 415', async () => {
  const ses = (n) => {
    const b = new Uint8Array(n);
    b.set([0x1a, 0x45, 0xdf, 0xa3]);
    return b;
  };
  const { fn, c } = sahte();
  const h = medyaIsleyici({ env, fetchFn: fn });
  assert.equal((await h(yukIstek(ses(2 * 1024 * 1024 + 1), { tur: 'audio/webm' }))).status, 413);
  assert.equal((await h(yukIstek(webp(5 * 1024 * 1024 + 1)))).status, 413);
  assert.equal(c.rpc.length, 0, 'sınır aşımı RPC ve depoya gitmez');
  assert.equal((await h(yukIstek(ses(2 * 1024 * 1024), { tur: 'audio/webm' }))).status, 200);
  assert.equal((await h(yukIstek(new TextEncoder().encode('<html>'.repeat(9)), { tur: 'image/jpeg' }))).status, 415);
  assert.equal((await h(yukIstek(webp(), { ek: { 'x-anahtar': 'kisa' } }))).status, 400);
  assert.equal((await h(yukIstek(webp(), { ek: { 'x-yol': `zzzzzzzz22/${U}.webp` } }))).status, 400);
  assert.equal((await h(yukIstek(webp(), { ek: { 'x-yol': `${ODA}/${U}.jpg` } }))).status, 400, 'uzantı içerikle aynı');
  for (const [kod, durum, neden] of [['42501', 403, null], ['54000', 429, 'dolu']]) {
    const s = sahte({ rpcHata: { medya_yukleme_izni: { code: kod, message: 'medya_yukleme_izni: oda dolu' } } });
    const r = await medyaIsleyici({ env, fetchFn: s.fn })(yukIstek(webp()));
    assert.equal(r.status, durum);
    if (neden) assert.equal((await r.json()).neden, neden);
    assert.equal(s.c.depo.length, 0);
  }
});

test('yukle: x-yol ile geri yükleme aynı yola yazar; var olan dosya 409 (hata sayılmaz); depo hatası 502', async () => {
  const a = sahte();
  const r = await medyaIsleyici({ env, fetchFn: a.fn })(yukIstek(webp(), { ek: { 'x-yol': YOL } }));
  assert.equal((await r.json()).yol, YOL);
  assert.equal(a.c.depo[0].url, `${HOST}/storage/v1/object/photos/${YOL}`);
  const b = sahte({ depoDurum: 409, depoGovde: { statusCode: '409', error: 'Duplicate' } });
  assert.equal((await medyaIsleyici({ env, fetchFn: b.fn })(yukIstek(webp(), { ek: { 'x-yol': YOL } }))).status, 409);
  // Storage eski sürümde çakışmayı 400 + statusCode 409 döner.
  const b2 = sahte({ depoDurum: 400, depoGovde: { statusCode: '409', error: 'Duplicate' } });
  assert.equal((await medyaIsleyici({ env, fetchFn: b2.fn })(yukIstek(webp(), { ek: { 'x-yol': YOL } }))).status, 409);
  const e = sahte({ depoDurum: 500 });
  assert.equal((await medyaIsleyici({ env, fetchFn: e.fn })(yukIstek(webp()))).status, 502);
});

const temizle = (a = 'gizli') => new Request(`${HOST}/functions/v1/medya?islem=temizle`, {
  method: 'POST', headers: { 'x-hatirlat-anahtar': a }, body: '{}',
});

test('temizle: anahtar zorunlu; kuyruk parti parti Storage API ile silinir, silinenler işaretlenir; hata kuyrukta kalır', async () => {
  const a = sahte({ kuyruk: [[YOL], []] });
  assert.equal((await medyaIsleyici({ env, fetchFn: a.fn })(temizle('yanlis'))).status, 401);
  assert.equal(a.c.depo.length, 0);

  const ok = sahte({ kuyruk: [[YOL, `${ODA}/${U}.jpg`], []] });
  const r = await medyaIsleyici({ env, fetchFn: ok.fn })(temizle());
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { silinen: 2 });
  const d = ok.c.depo[0];
  assert.equal(d.url, `${HOST}/storage/v1/object/photos`);
  assert.equal(d.method, 'DELETE');
  assert.deepEqual(JSON.parse(d.body), { prefixes: [YOL, `${ODA}/${U}.jpg`] });
  assert.deepEqual(ok.c.rpc.find((x) => x.ad === 'medya_silindi').args, { p_yollar: [YOL, `${ODA}/${U}.jpg`] });

  const kotu = sahte({ kuyruk: [[YOL]], depoDurum: 500 });
  const r2 = await medyaIsleyici({ env, fetchFn: kotu.fn })(temizle());
  assert.equal(r2.status, 502);
  assert.equal(kotu.c.rpc.some((x) => x.ad === 'medya_silindi'), false);

  // Yalnız geçerli yol silinir: kuyruk bozulsa bile kova boşaltılamaz.
  const bozuk = sahte({ kuyruk: [[YOL, 'photos', ''], []] });
  await medyaIsleyici({ env, fetchFn: bozuk.fn })(temizle());
  assert.deepEqual(JSON.parse(bozuk.c.depo[0].body), { prefixes: [YOL] });
});
