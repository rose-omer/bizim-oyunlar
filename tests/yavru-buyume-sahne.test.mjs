// Yavrumuz: "büyüdü" geçiş sahnesi (sayfalar/yavru/buyume-sahne.js) saf kısımları. DOM yok.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { oku, buyumeYamasi, DK, GUN } from '../sayfalar/yavru/mantik.js';
import {
  buyumeSahnesiGerekli, buyumeMetni, konfetiParcalari, buyumeCizimleri, BUYUME_CSS, BUYUME_SURE, BUYUME_SURE_AZ,
} from '../sayfalar/yavru/buyume-sahne.js';
import { applyPatch } from '../js/core/veri.js';

const T0 = Date.UTC(2026, 9, 30, 9, 0, 0);
const iso = (ms) => new Date(ms).toISOString();
const kucuk = () => oku({ asama: 'kucuk', ad: 'Pamuk', renk: 2, catlama: iso(T0 - 5 * GUN), dogum: iso(T0 - 6 * GUN) });

test('buyumeSahnesiGerekli: büyümüş ve bu cihaz görmemişse bir kez', () => {
  const k = kucuk();
  const b = oku(applyPatch(k, buyumeYamasi(T0)));
  const sonra = T0 + 10 * DK;
  assert.equal(buyumeSahnesiGerekli(b, false, sonra), true, 'büyüdü, görülmedi');
  assert.equal(buyumeSahnesiGerekli(b, true, sonra), false, 'bu cihazda görüldü');
  assert.equal(buyumeSahnesiGerekli(k, false, sonra), false, 'henüz küçük');
  assert.equal(buyumeSahnesiGerekli(null, false, sonra), false, 'belge yok');
  assert.equal(buyumeSahnesiGerekli(oku({ ...b, buyume: null }), false, sonra), false, 'büyüme zamanı yok');
  // Yama sevgiliden gelse de (buyume alanı onun saati) karar aynı.
  assert.equal(buyumeSahnesiGerekli(oku({ ...b, buyume: iso(T0 + 3 * DK) }), false, sonra), true);
});

test('buyumeSahnesiGerekli: günler önce büyümüş yavruda oynamaz', () => {
  const b = oku(applyPatch(kucuk(), buyumeYamasi(T0)));
  assert.equal(buyumeSahnesiGerekli(b, false, T0 + 2 * GUN), true, '2 gün sonra hâlâ oynar');
  assert.equal(buyumeSahnesiGerekli(b, false, T0 + 4 * GUN), false, '4 gün sonra oynamaz');
  assert.equal(buyumeSahnesiGerekli({ asama: 'buyuk', buyume: 'bozuk' }, false, T0), false);
});

test('buyumeMetni: ad ya da varsayılan', () => {
  assert.equal(buyumeMetni('Pamuk'), 'Pamuk büyüdü! ✨');
  assert.equal(buyumeMetni('  Fıstık '), 'Fıstık büyüdü! ✨');
  assert.equal(buyumeMetni(''), 'Yavrumuz büyüdü! ✨');
  assert.equal(buyumeMetni(null), 'Yavrumuz büyüdü! ✨');
  assert.equal(buyumeMetni(42), 'Yavrumuz büyüdü! ✨');
});

test('konfetiParcalari: kararlı, sınırlı, ekrana yayılmış', () => {
  const a = konfetiParcalari();
  assert.deepEqual(a, konfetiParcalari(), 'aynı tohum aynı sonuç');
  assert.notDeepEqual(a, konfetiParcalari(26, 99));
  assert.equal(a.length, 26);
  assert.equal(konfetiParcalari(5).length, 5);
  for (const p of a) {
    assert.ok(p.x >= 0 && p.x <= 100, 'x');
    assert.ok(p.gecik >= 0 && p.gecik <= 0.45, 'gecikme');
    assert.ok(p.sure >= 1.3 && p.sure <= 2.1, 'süre');
    assert.ok(Number.isInteger(p.renk) && p.renk >= 1 && p.renk <= 6, 'renk');
    assert.ok(['serit', 'daire', 'kalp'].includes(p.sekil), 'şekil');
  }
  // Ekranın iki yarısına da düşer.
  assert.ok(a.some((p) => p.x < 50) && a.some((p) => p.x > 50));
  // Konfeti yazıdan sonra başlar ve sahne kapanmadan biter: en geç 1.85 + 0.45 + 2.1 sn ≈ BUYUME_SURE içinde.
  assert.ok(1850 + Math.max(...a.map((p) => (p.gecik + p.sure) * 1000)) <= BUYUME_SURE + 400);
  assert.ok(BUYUME_SURE >= 3000 && BUYUME_SURE <= 4000, '3–4 sn');
  assert.ok(BUYUME_SURE_AZ < BUYUME_SURE);
});

test('buyumeCizimleri: küçükten büyüğe, aynı renk ve giyim; ayrı id önekleri', () => {
  const giyim = { bas: 'tac', goz: 'gozluk', boyun: 'atki' };
  const c = buyumeCizimleri({ renk: 4, kisilik: 'obur', giyim });
  assert.match(c.kucuk, /data-asama="kucuk"/);
  assert.match(c.buyuk, /data-asama="buyuk"/);
  assert.match(c.buyuk, /data-kisilik="obur"/);
  for (const s of [c.kucuk, c.buyuk]) assert.match(s, /--yv-govde:var\(--yv-r4\)/);
  assert.match(c.kucuk, /yvb-giyim-bas" data-urun="tac"/, 'küçükte baş yuvası');
  assert.doesNotMatch(c.kucuk, /yvb-giyim-(goz|boyun)/, 'küçükte gözlük ve atkı yok');
  for (const yuva of ['bas', 'goz', 'boyun']) assert.match(c.buyuk, new RegExp(`yvb-giyim-${yuva}"`));
  const idler = (s) => [...s.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
  assert.equal(idler(c.kucuk).filter((x) => idler(c.buyuk).includes(x)).length, 0, 'aynı sayfada iki SVG çakışmaz');
  // Bilinmeyen değerler sahneyi bozmaz.
  const b = buyumeCizimleri({ renk: 99, giyim: { bas: '<x>' } });
  assert.match(b.buyuk, /--yv-govde:var\(--yv-r1\)/);
  assert.match(b.buyuk, /yvb-aksesuar/, 'baş boşsa varsayılan fiyonk');
});

test('BUYUME_CSS: durağan kurallar son kare; hareket yalnız no-preference altında', () => {
  const [duragan, ...kalan] = BUYUME_CSS.split('@media (prefers-reduced-motion: no-preference)');
  const hareketli = kalan.join('');
  for (const ad of ['yv-bs-gir', 'yv-bs-kucuk', 'yv-bs-isik', 'yv-bs-buyuk', 'yv-bs-yildiz', 'yv-bs-dus']) {
    assert.match(hareketli, new RegExp(`animation:[^;]*${ad}`), ad);
  }
  assert.doesNotMatch(duragan.replace(/animation: none/g, ''), /animation:/, 'hareket azaltmada kıpırdamaz');
  assert.match(duragan, /\.yv-bs-kucuk \{ opacity: 0; \}/, 'son karede yalnız büyük bebek');
  assert.doesNotMatch(BUYUME_CSS, /#[0-9a-f]{3,8}\b/i, 'sabit renk yok (değişken)');
});
