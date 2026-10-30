// Android kabuğu (APK) yeni sürüm uyarısı: js/core/mobil.js.
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { apkSurumu, kabukKarari, kabukGuncellemeKontrol, APK_SURUM_API } from '../js/core/mobil.js';
import { APK_URL } from '../sayfalar/daha/mantik.js';

const NOT = '**Biz İkimiz** Android uygulaması · sürüm 1.0.37 · 2dc6f37 · imza: release\n\nKurulum: ...';
const SIMDI = Date.parse('2026-10-30T12:00:00.000Z');
const SAAT = 3_600_000;

afterEach(() => { delete globalThis.Capacitor; });

/** Bellekte localStorage benzeri depo. */
function sahteDepo(ilk = {}) {
  const m = new Map(Object.entries(ilk));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), m };
}

function sahteKopru(build = '30') {
  globalThis.Capacitor = { isNativePlatform: () => true, Plugins: { App: { getInfo: async () => ({ build, version: `1.0.${build}` }) } } };
}

function sahteFetch(govde = NOT) {
  const istekler = [];
  const fn = async (url) => {
    istekler.push(String(url));
    return { ok: true, json: async () => ({ body: govde }) };
  };
  return { fn, istekler };
}

test('apkSurumu: sürüm notundaki 1.0.N → N', () => {
  assert.equal(apkSurumu(NOT), 37);
  assert.equal(apkSurumu('sürüm 1.0.5'), 5);
  assert.equal(apkSurumu('sürüm yok'), null);
  assert.equal(apkSurumu(''), null);
  assert.equal(apkSurumu(null), null);
});

test('kabukKarari: yalnız kurulu olandan yeni ve henüz gösterilmemiş sürüm', () => {
  assert.equal(kabukKarari({ kurulu: 30, son: 37 }), true);
  assert.equal(kabukKarari({ kurulu: 30, son: 37, gosterilen: 36 }), true);
  assert.equal(kabukKarari({ kurulu: 30, son: 37, gosterilen: 37 }), false);
  assert.equal(kabukKarari({ kurulu: 37, son: 37 }), false);
  assert.equal(kabukKarari({ kurulu: 38, son: 37 }), false);
  assert.equal(kabukKarari({ kurulu: NaN, son: 37 }), false);
  assert.equal(kabukKarari({ kurulu: 30, son: null }), false);
});

test('kabukGuncellemeKontrol: web\'de hiçbir şey yapmaz', async () => {
  const f = sahteFetch();
  let cagrildi = false;
  assert.equal(await kabukGuncellemeKontrol({ bildir: () => { cagrildi = true; }, fetchFn: f.fn, depo: sahteDepo(), simdi: SIMDI }), false);
  assert.equal(f.istekler.length, 0);
  assert.equal(cagrildi, false);
});

test('kabukGuncellemeKontrol: yeni APK varsa bir kez haber verir, indirme adresini verir', async () => {
  sahteKopru('30');
  const f = sahteFetch();
  const depo = sahteDepo();
  const adresler = [];
  const bildir = (url) => adresler.push(url);
  assert.equal(await kabukGuncellemeKontrol({ bildir, fetchFn: f.fn, depo, simdi: SIMDI }), true);
  assert.deepEqual(f.istekler, [APK_SURUM_API]);
  assert.deepEqual(adresler, [APK_URL]);
  // Ertesi gün aynı sürüm: sorar ama yeniden haber vermez.
  assert.equal(await kabukGuncellemeKontrol({ bildir, fetchFn: f.fn, depo, simdi: SIMDI + 25 * SAAT }), false);
  assert.equal(f.istekler.length, 2);
  assert.equal(adresler.length, 1);
});

test('kabukGuncellemeKontrol: 12 saatte bir sorar (GitHub API sınırı)', async () => {
  sahteKopru('30');
  const f = sahteFetch('sürüm 1.0.30');
  const depo = sahteDepo();
  await kabukGuncellemeKontrol({ bildir: () => {}, fetchFn: f.fn, depo, simdi: SIMDI });
  await kabukGuncellemeKontrol({ bildir: () => {}, fetchFn: f.fn, depo, simdi: SIMDI + 2 * SAAT });
  assert.equal(f.istekler.length, 1);
  await kabukGuncellemeKontrol({ bildir: () => {}, fetchFn: f.fn, depo, simdi: SIMDI + 13 * SAAT });
  assert.equal(f.istekler.length, 2);
});

test('kabukGuncellemeKontrol: ağ hatası ya da sürüm bilgisi yoksa sessizce false', async () => {
  sahteKopru('30');
  const depo = sahteDepo();
  assert.equal(await kabukGuncellemeKontrol({ bildir: () => {}, fetchFn: async () => { throw new TypeError('ağ yok'); }, depo, simdi: SIMDI }), false);
  globalThis.Capacitor.Plugins.App.getInfo = undefined;
  assert.equal(await kabukGuncellemeKontrol({ bildir: () => {}, fetchFn: sahteFetch().fn, depo: sahteDepo(), simdi: SIMDI }), false);
});
