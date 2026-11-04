// Yavrumuz: otomatik yazımlar bayat önbellekle çalışmaz (sayfalar/yavru/tazelik.js). Saf mantık, DOM yok.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DK, SAAT, GUN, IHTIYACLAR, oku } from '../sayfalar/yavru/mantik.js';
import { lazimlikEylemi } from '../sayfalar/yavru/tuvalet.js';
import { applyPatch } from '../js/core/veri.js';
import { otoYazimIzinli, kazaKarari, tazelikIzleyici, TAZELEME_ARALIK_MS } from '../sayfalar/yavru/tazelik.js';

const BEN = 'omer-test-id';
const PARTNER = 'gul-test-id';
const T0 = Date.UTC(2026, 9, 30, 9, 0, 0);
const iso = (ms) => new Date(ms).toISOString();
const kayit = (v, ms = T0) => ({ v, t: iso(ms) });

/** Çişi olan yavru: T0'da eşikte; T0 + 2 saatte kaza. */
function veri() {
  const ihtiyac = {};
  for (const ad of IHTIYACLAR) ihtiyac[ad] = kayit(100);
  return {
    asama: 'kucuk', ad: 'Pamuk', renk: 3, dogum: iso(T0 - 2 * GUN), catlama: iso(T0 - GUN),
    ihtiyac, uyku: null, puan: {}, isitma: {}, son: {}, tuvalet: kayit(70),
  };
}
const yv = (data) => ({ ...oku(data), tuvalet: data.tuvalet });
const KAZA_SONRASI = T0 + 2 * SAAT + 5 * DK;
const bekle = () => new Promise((r) => setTimeout(r, 0));

test('otoYazimIzinli: yalnız tazelenmiş ve çevrimiçiyken', () => {
  assert.equal(otoYazimIzinli({ tazelendi: true }), true);
  assert.equal(otoYazimIzinli({ tazelendi: true, cevrimici: true }), true);
  assert.equal(otoYazimIzinli({ tazelendi: false }), false);
  assert.equal(otoYazimIzinli({ tazelendi: true, cevrimici: false }), false);
  assert.equal(otoYazimIzinli({}), false);
  assert.equal(otoYazimIzinli(), false);
});

test('tazelenmeden kaza yazılmaz (önbellek kazayı gösterse de)', () => {
  const bayat = yv(veri());
  assert.equal(kazaKarari({ tazelendi: false, y: bayat, kim: BEN, simdi: KAZA_SONRASI }), null);
});

test('tazelenince kaza gerçekten olmuşsa yazılır', () => {
  const r = kazaKarari({ tazelendi: true, y: yv(veri()), kim: BEN, simdi: KAZA_SONRASI });
  assert.ok(r);
  assert.equal(r.kayitId, `kaza-${T0 + 2 * SAAT}`);
  assert.equal(r.yama.tuvalet.v, 0);
});

test('tazelenince güncel veriyle (partner lazımlık yapmışsa) kaza yazılmaz', () => {
  const bayat = veri();
  const partnerAn = T0 + 1 * SAAT;
  const lazimlik = lazimlikEylemi(yv(bayat), { kim: PARTNER, simdi: partnerAn });
  const guncel = applyPatch(bayat, lazimlik.yama);
  assert.ok(kazaKarari({ tazelendi: true, y: yv(bayat), kim: BEN, simdi: KAZA_SONRASI }), 'bayat veride kaza görünür');
  assert.equal(kazaKarari({ tazelendi: true, y: yv(guncel), kim: BEN, simdi: KAZA_SONRASI }), null);
});

test('kazaKarari: belge yok ya da yumurta', () => {
  assert.equal(kazaKarari({ tazelendi: true, y: null, kim: BEN, simdi: T0 }), null);
  assert.equal(kazaKarari({ tazelendi: true, y: { ...yv(veri()), asama: 'yumurta' }, kim: BEN, simdi: KAZA_SONRASI }), null);
});

/** Elle bitirilen tazelemeler. */
function kur({ gizli = false } = {}) {
  const k = { istek: [], taze: 0, simdi: 1_000_000 };
  k.iz = tazelikIzleyici({
    tazele: () => new Promise((resolve, reject) => k.istek.push({ resolve, reject })),
    tazelenince: () => { k.taze++; },
    saat: () => k.simdi,
    gizli,
  });
  return k;
}

test('izleyici: ilk başarılı tazelemeye dek kapalı; bitince bir kez haber verir', async () => {
  const k = kur();
  assert.equal(k.iz.taze(), false);
  k.iz.dene();
  k.iz.dene();
  assert.equal(k.istek.length, 1, 'süren istek varken yenisi yok');
  assert.equal(k.iz.taze(), false);
  k.istek[0].resolve(true);
  await bekle();
  assert.equal(k.iz.taze(), true);
  assert.equal(k.taze, 1);
  k.simdi += 10 * TAZELEME_ARALIK_MS;
  k.iz.dene();
  assert.equal(k.istek.length, 1, 'tazeyken istek yok');
});

test('izleyici: başarısız tazelemede kapalı kalır, aralıktan önce yeniden denemez, sonra dener', async () => {
  const k = kur();
  k.iz.dene();
  k.istek[0].resolve(false);
  await bekle();
  assert.equal(k.iz.taze(), false);
  assert.equal(k.taze, 0, 'başarısızlık yeniden çizim tetiklemez (döngü olmaz)');
  k.iz.dene();
  assert.equal(k.istek.length, 1, 'istek fırtınası yok');
  k.simdi += TAZELEME_ARALIK_MS;
  k.iz.dene();
  assert.equal(k.istek.length, 2);
  k.istek[1].reject(new Error('ağ'));
  await bekle();
  assert.equal(k.iz.taze(), false, 'fırlatan tazeleme de başarısızdır');
  k.simdi += TAZELEME_ARALIK_MS;
  k.iz.dene();
  k.istek[2].resolve(true);
  await bekle();
  assert.equal(k.iz.taze(), true, 'sonraki başarılı tazelemede açılır');
});

test('izleyici: arka plana gidince kapanır; öne gelince önce tazeler', async () => {
  const k = kur();
  k.iz.dene();
  k.istek[0].resolve(true);
  await bekle();
  k.iz.gizlendi();
  assert.equal(k.iz.taze(), false);
  k.simdi += 10 * TAZELEME_ARALIK_MS;
  k.iz.dene();
  assert.equal(k.istek.length, 1, 'arka planda istek yok');
  k.iz.gorundu();
  assert.equal(k.istek.length, 2, 'öne gelince hemen tazeler (aralık beklenmez)');
  assert.equal(k.iz.taze(), false, 'tazeleme bitene dek kapalı');
  k.istek[1].resolve(true);
  await bekle();
  assert.equal(k.iz.taze(), true);
});

test('izleyici: arka plana gitmeden önce başlayan tazeleme sayılmaz', async () => {
  const k = kur();
  k.iz.dene();
  k.iz.gizlendi();
  k.iz.gorundu();
  assert.equal(k.istek.length, 2);
  k.istek[0].resolve(true); // eski veri: arka plandan önce sorulmuş
  await bekle();
  assert.equal(k.iz.taze(), false);
  assert.equal(k.taze, 0);
  k.istek[1].resolve(true);
  await bekle();
  assert.equal(k.iz.taze(), true);
  assert.equal(k.taze, 1);
});

test('izleyici: sayfa gizli açıldıysa görünene dek istek yok', () => {
  const k = kur({ gizli: true });
  k.iz.dene();
  k.iz.hemenDene();
  assert.equal(k.istek.length, 0);
  k.iz.gorundu();
  assert.equal(k.istek.length, 1);
});

test('izleyici: koptu kapatır; hemenDene aralığı kısaltır ama sık bağlantı olayında fırtına yapmaz', async () => {
  const k = kur();
  k.iz.dene();
  k.istek[0].resolve(true);
  await bekle();
  k.iz.koptu();
  assert.equal(k.iz.taze(), false);
  k.iz.hemenDene();
  assert.equal(k.istek.length, 1, 'son denemenin hemen ardından istek yok');
  k.simdi += 5000;
  k.iz.hemenDene();
  k.iz.hemenDene();
  assert.equal(k.istek.length, 2, 'süren istek varken ikincisi yok');
  k.istek[1].resolve(true);
  await bekle();
  assert.equal(k.iz.taze(), true);
});

test('app.js: bütün otomatik yazımlar kapıdan geçer; kart.js belge yazmaz', () => {
  const app = readFileSync(new URL('../sayfalar/yavru/app.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const govde = (ad) => {
    const i = app.indexOf(`function ${ad}(`);
    assert.ok(i >= 0, ad);
    return app.slice(i, app.indexOf('\n}\n', i));
  };
  assert.match(govde('kazaYaz'), /kazaKarari\(\{ tazelendi: otoIzin\(\)/);
  assert.match(govde('cizGorev'), /otoIzin\(\) && tamam && !odullendi/);
  const gecis = govde('gecisler');
  assert.match(gecis, /if \(otoIzin\(\)\) \{\n[^\n]*catla\(\);\n[^\n]*buyu\(\);\n/);
  assert.equal(app.split('catla();').length - 1, 1, 'catla yalnız gecisler içinden');
  assert.equal(app.split('buyu();').length - 1, 1, 'buyu yalnız gecisler içinden');
  assert.equal(app.split('gorevOdul(gun').length - 1, 2, 'gorevOdul: tanım ve tek çağrı');
  assert.match(app, /visibilityState === 'visible'\) \{\n\s+tazelik\.gorundu\(\);/);
  assert.match(app, /tazelik\.gizlendi\(\)/);
  const kart = readFileSync(new URL('../sayfalar/yavru/kart.js', import.meta.url), 'utf8');
  assert.doesNotMatch(kart, /\.(patch|put|remove)\(/);
});
