// Android kabuğu (APK) yeni sürüm uyarısı: js/core/mobil.js.
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { apkSurumu, kabukKarari, kabukGuncellemeKontrol, APK_SURUM_URL } from '../js/core/mobil.js';
import { SITE_ROOT } from '../js/core/identity.js';
import { APK_URL } from '../sayfalar/daha/mantik.js';

const SURUM = { surum: '1.2.37', kod: 37, tarih: '2026-10-30T12:00:00Z', fcm: true };
const SIMDI = Date.parse('2026-10-30T12:00:00.000Z');
const SAAT = 3_600_000;

afterEach(() => { delete globalThis.Capacitor; });

/** Bellekte localStorage benzeri depo. */
function sahteDepo(ilk = {}) {
  const m = new Map(Object.entries(ilk));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), m };
}

function sahteKopru(build = '30') {
  globalThis.Capacitor = { isNativePlatform: () => true, Plugins: { App: { getInfo: async () => ({ build, version: `1.2.${build}` }) } } };
}

function sahteFetch(govde = SURUM, { ok = true } = {}) {
  const istekler = [];
  const fn = async (url, secenek) => {
    istekler.push({ url: String(url), secenek });
    return { ok, json: async () => govde };
  };
  return { fn, istekler };
}

test('APK_SURUM_URL: site kökündeki indir/surum.json (GitHub API değil)', () => {
  assert.equal(APK_SURUM_URL, new URL('indir/surum.json', SITE_ROOT).href);
  assert.ok(APK_SURUM_URL.endsWith('/indir/surum.json'));
  assert.doesNotMatch(APK_SURUM_URL, /api\.github\.com|releases/);
  assert.equal(APK_URL, 'https://rose-omer.github.io/bizim-oyunlar/indir/BizIkimiz.apk');
});

test('apkSurumu: surum.json kod alanı → versionCode; geçersizse null', () => {
  assert.equal(apkSurumu(SURUM), 37);
  assert.equal(apkSurumu({ kod: 1 }), 1);
  assert.equal(apkSurumu({ kod: 0 }), null);
  assert.equal(apkSurumu({ kod: -3 }), null);
  assert.equal(apkSurumu({ kod: 3.5 }), null);
  assert.equal(apkSurumu({ kod: '37' }), null);
  assert.equal(apkSurumu({ surum: '1.2.37' }), null);
  assert.equal(apkSurumu({}), null);
  assert.equal(apkSurumu(null), null);
  assert.equal(apkSurumu('sürüm 1.2.37'), null);
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
  assert.deepEqual(f.istekler.map((i) => i.url), [APK_SURUM_URL]);
  assert.equal(f.istekler[0].secenek?.cache, 'no-store', 'HTTP önbelleği (max-age=600) atlanır');
  assert.deepEqual(adresler, [APK_URL]);
  // Ertesi gün aynı sürüm: sorar ama yeniden haber vermez.
  assert.equal(await kabukGuncellemeKontrol({ bildir, fetchFn: f.fn, depo, simdi: SIMDI + 25 * SAAT }), false);
  assert.equal(f.istekler.length, 2);
  assert.equal(adresler.length, 1);
});

test('kabukGuncellemeKontrol: kurulu sürüm güncelse haber vermez', async () => {
  sahteKopru('37');
  const adresler = [];
  assert.equal(await kabukGuncellemeKontrol({ bildir: (u) => adresler.push(u), fetchFn: sahteFetch().fn, depo: sahteDepo(), simdi: SIMDI }), false);
  assert.equal(adresler.length, 0);
});

test('kabukGuncellemeKontrol: 12 saatte bir sorar', async () => {
  sahteKopru('30');
  const f = sahteFetch({ ...SURUM, kod: 30 });
  const depo = sahteDepo();
  await kabukGuncellemeKontrol({ bildir: () => {}, fetchFn: f.fn, depo, simdi: SIMDI });
  await kabukGuncellemeKontrol({ bildir: () => {}, fetchFn: f.fn, depo, simdi: SIMDI + 2 * SAAT });
  assert.equal(f.istekler.length, 1);
  await kabukGuncellemeKontrol({ bildir: () => {}, fetchFn: f.fn, depo, simdi: SIMDI + 13 * SAAT });
  assert.equal(f.istekler.length, 2);
});

test('kabukGuncellemeKontrol: ağ hatası, 404 (surum.json henüz yok) ya da bozuk bilgi → sessizce false', async () => {
  sahteKopru('30');
  const bildir = () => assert.fail('haber verilmemeli');
  assert.equal(await kabukGuncellemeKontrol({ bildir, fetchFn: async () => { throw new TypeError('ağ yok'); }, depo: sahteDepo(), simdi: SIMDI }), false);
  // 404: kontrol zamanı yazılmaz; sonraki sayfa açılışında yeniden denenir.
  const depo = sahteDepo();
  const yok = sahteFetch(null, { ok: false });
  assert.equal(await kabukGuncellemeKontrol({ bildir, fetchFn: yok.fn, depo, simdi: SIMDI }), false);
  assert.equal(depo.m.size, 0);
  assert.equal(await kabukGuncellemeKontrol({ bildir, fetchFn: sahteFetch({ surum: '1.2.37' }).fn, depo: sahteDepo(), simdi: SIMDI }), false);
  const bozukJson = { ok: true, json: async () => { throw new SyntaxError('JSON değil'); } };
  assert.equal(await kabukGuncellemeKontrol({ bildir, fetchFn: async () => bozukJson, depo: sahteDepo(), simdi: SIMDI }), false);
  globalThis.Capacitor.Plugins.App.getInfo = undefined;
  assert.equal(await kabukGuncellemeKontrol({ bildir, fetchFn: sahteFetch().fn, depo: sahteDepo(), simdi: SIMDI }), false);
});
