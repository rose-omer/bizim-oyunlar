// İmzalı medya okuma ve cihaz yetkili yükleme (istemci). Ağ sahte; canlıya istek gitmez.
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { imzaDeposu } from '../js/core/medya-imza.js';
import {
  isAllowedPhotoUrl, medyaYolu, medyaAdresi, medyaHazir, medyaUnut, loadPhoto, uploadPhoto, uploadAudio, medyaVarMi,
  KOVA_ONEK, _testMedyaSifirla,
} from '../js/core/storage.js';
import { SUPABASE_URL } from '../js/config.js';
import { writeStore } from '../js/core/identity.js';

const ODA = 'abcdefgh23';
const U = '0f8e2a1c-1b2d-4c3e-8f9a-0123456789ab';
const YOL = `${ODA}/${U}.webp`;
const GENEL = `${SUPABASE_URL}/storage/v1/object/public/photos/${YOL}`;
const IMZALI = `${SUPABASE_URL}/storage/v1/object/sign/photos/${YOL}?token=T`;
const hemen = (fn) => { queueMicrotask(fn); return 1; };

test('imzaDeposu: aynı anda istenenler tek istekte; önbellek süre payına uyar; eksik null; depoya yazar', async () => {
  let t = 1000;
  const istekler = [];
  const yazilan = [];
  const d = imzaDeposu({
    iste: async (oda, yollar) => {
      istekler.push([oda, yollar]);
      return { adresler: Object.fromEntries(yollar.filter((y) => y !== 'o/eksik').map((y) => [y, `u:${y}`])), eksik: [], sure: 3600 };
    },
    depo: { oku: () => ({}), yaz: (x) => yazilan.push(x) },
    simdi: () => t,
    zamanla: hemen,
  });
  const [a, b, c, e] = await Promise.all([d.al('o/a'), d.al('o/b'), d.al('o/a'), d.al('o/eksik')]);
  assert.deepEqual([a, b, c, e], ['u:o/a', 'u:o/b', 'u:o/a', null]);
  assert.deepEqual(istekler, [['o', ['o/a', 'o/b', 'o/eksik']]]);
  assert.equal(d.hazir('o/a'), 'u:o/a');
  assert.ok(yazilan.at(-1)['o/a']);

  t += 3600_000 - 5 * 60_000 + 1; // süre payı içinde: kullanılmaz
  assert.equal(d.hazir('o/a'), null);
  await d.al('o/a');
  assert.equal(istekler.length, 2);
  d.unut('o/a');
  assert.equal(d.hazir('o/a'), null);
});

test('imzaDeposu: odalar ayrı istek, 100\'lük parça; depodan okur, eskiyi atar', async () => {
  const istekler = [];
  const iste = async (oda, yollar) => { istekler.push([oda, yollar.length]); return { adresler: {}, sure: 1 }; };
  const d = imzaDeposu({ iste, zamanla: hemen });
  await Promise.all([...Array.from({ length: 101 }, (_, i) => d.al(`a/${i}`)), d.al('b/x')]);
  assert.deepEqual(istekler, [['a', 100], ['a', 1], ['b', 1]]);

  const onceki = imzaDeposu({
    iste: async () => assert.fail('ağa gitmemeli'),
    depo: { oku: () => ({ 'o/t': { u: 'taze', s: 10 ** 9 }, 'o/e': { u: 'eski', s: 1 } }), yaz() {} },
    simdi: () => 1000,
    zamanla: hemen,
  });
  assert.equal(await onceki.al('o/t'), 'taze');
  assert.equal(onceki.hazir('o/e'), null);
});

test('imzaDeposu: hata null verir ve bir süre yeniden denemez (işlev yayında değilken)', async () => {
  let t = 0;
  let n = 0;
  const d = imzaDeposu({ iste: async () => { n++; throw new Error('404'); }, simdi: () => t, zamanla: hemen });
  assert.equal(await d.al('o/a'), null);
  assert.equal(await d.al('o/b'), null);
  assert.equal(n, 1);
  t += 61_000;
  assert.equal(await d.al('o/b'), null);
  assert.equal(n, 2);
});

test('isAllowedPhotoUrl ve medyaYolu: kova: biçimi ve eski adres; kaçış ve imzalı adres belgeye giremez', () => {
  assert.equal(isAllowedPhotoUrl(`${KOVA_ONEK}${YOL}`), true);
  assert.equal(isAllowedPhotoUrl(GENEL), true);
  assert.equal(medyaYolu(`${KOVA_ONEK}${YOL}`), YOL);
  assert.equal(medyaYolu(GENEL), YOL);
  for (const k of ['kova:../x.webp', `kova:${ODA}/../${U}.webp`, `kova:${YOL}?x=1`, 'kova:', `kova:${ODA}/a.svg`]) {
    assert.equal(isAllowedPhotoUrl(k), false, k);
  }
  assert.equal(isAllowedPhotoUrl(IMZALI), false);
  assert.equal(medyaYolu('local:abc'), null);
  assert.equal(medyaYolu(`${SUPABASE_URL}/storage/v1/object/public/photos/odaabcdefg/x.jpg`), null, 'eski biçim dışı: imza istenmez');
});

// ---------- storage.js ağ akışları ----------
const asil = globalThis.fetch;
let istekler;
let cevap;

beforeEach(() => {
  writeStore('session', 'bizim.yerel', null);
  _testMedyaSifirla();
  istekler = [];
  cevap = () => new Response('{}', { status: 404 });
  globalThis.fetch = async (url, init = {}) => {
    istekler.push({ url: String(url), init });
    return cevap(String(url), init);
  };
});
afterEach(() => { globalThis.fetch = asil; });

const imzaCevap = () => new Response(JSON.stringify({ adresler: { [YOL]: IMZALI }, eksik: [], sure: 3600 }));

test('medyaAdresi: imza gelirse imzalı adres (kimlik gövdede); ikinci çağrı ağa gitmez; medyaHazir eşzamanlı', async () => {
  cevap = imzaCevap;
  assert.equal(await medyaAdresi(GENEL), IMZALI);
  assert.equal(await medyaAdresi(`kova:${YOL}`), IMZALI);
  assert.equal(istekler.length, 1);
  assert.equal(istekler[0].url, `${SUPABASE_URL}/functions/v1/medya?islem=imzala`);
  const g = JSON.parse(istekler[0].init.body);
  assert.equal(g.room, ODA);
  assert.deepEqual(g.yollar, [YOL]);
  assert.match(g.anahtar, /^[A-Za-z0-9_-]{43}$/);
  assert.ok(g.cihaz);
  assert.equal(medyaHazir(GENEL), IMZALI);
  medyaUnut(GENEL);
  assert.equal(medyaHazir(GENEL), null);
});

test('medyaAdresi: işlev yok ya da yetki yoksa açık kova adresine düşer (geçiş boyunca fotoğraf kırılmaz)', async () => {
  cevap = () => new Response('{}', { status: 404 });
  assert.equal(await medyaAdresi(GENEL), GENEL);
  _testMedyaSifirla();
  assert.equal(await medyaAdresi(`kova:${YOL}`), GENEL);
  _testMedyaSifirla();
  cevap = () => { throw new TypeError('ağ yok'); };
  assert.equal(await medyaAdresi(GENEL), GENEL);
  assert.equal(await medyaAdresi('https://evil.example/x.webp'), null);
});

test('loadPhoto: imzalı adresten indirir; süresi geçmiş adres bir kez tazelenir', async () => {
  let imza = 0;
  let dosya = 0;
  cevap = (u) => {
    if (u.includes('/functions/v1/medya')) { imza++; return imzaCevap(); }
    dosya++;
    return dosya === 1 ? new Response('', { status: 400 }) : new Response('foto');
  };
  const b = await loadPhoto(GENEL);
  assert.equal(await b.text(), 'foto');
  assert.deepEqual([imza, dosya], [2, 2]);
});

test('uploadPhoto: işlevle yükler, kimlik başlıkta; adres eski biçimde döner (eski cihaz okuyabilsin)', async () => {
  cevap = () => new Response(JSON.stringify({ yol: YOL, tur: 'foto', bayt: 4 }));
  const url = await uploadPhoto(new Blob(['abcd'], { type: 'image/webp' }), ODA);
  assert.equal(url, GENEL);
  const { url: adres, init } = istekler[0];
  assert.equal(adres, `${SUPABASE_URL}/functions/v1/medya?islem=yukle`);
  assert.equal(init.headers['x-oda'], ODA);
  assert.match(init.headers['x-anahtar'], /^[A-Za-z0-9_-]{43}$/);
  assert.equal(init.headers['Content-Type'], 'image/webp');
  assert.equal(istekler.length, 1);
});

test('uploadPhoto: kalıcı ret anlaşılır hata (eski yola düşmez); dolu ve büyük ayrı metin', async () => {
  const blob = new Blob(['x'], { type: 'image/webp' });
  cevap = () => new Response(JSON.stringify({ neden: 'dolu' }), { status: 429 });
  await assert.rejects(uploadPhoto(blob, ODA), /^Error: Fotoğraf yüklenemedi: depolama alanınız doldu/);
  cevap = () => new Response('{}', { status: 403 });
  await assert.rejects(uploadPhoto(blob, ODA), /yetkisi yok/);
  cevap = () => new Response('{}', { status: 413 });
  await assert.rejects(uploadAudio(new Blob(['x'], { type: 'audio/webm' }), ODA), /^Error: Ses kaydı yüklenemedi: dosya çok büyük/);
  assert.ok(istekler.every((i) => i.url.includes('/functions/v1/medya')));
});

test('medyaVarMi: odadaki dosyaların var/eksik ayrımı; başka oda ve bozuk yol sorulmaz', async () => {
  cevap = () => new Response(JSON.stringify({ adresler: { [YOL]: IMZALI }, eksik: [`${ODA}/eksik`], sure: 3600 }));
  const r = await medyaVarMi(ODA, [YOL, `${ODA}/eksik`, `zzzzzzzz22/${U}.webp`]);
  assert.deepEqual(r, { var: [YOL], eksik: [`${ODA}/eksik`] });
  assert.deepEqual(JSON.parse(istekler[0].init.body).yollar, [YOL, `${ODA}/eksik`]);
});
