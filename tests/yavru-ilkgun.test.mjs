// Yavrumuz ilk gün ve tuvalet dengesi (mantik.js, tuvalet.js). Saf mantık, DOM yok.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DK, SAAT, GUN, oku, yeniYumurta, ozledi, durumMetni, ozelGunOlayi, hatirlaticiOlaylari, yumurtaRehberi, adOnerileri, adTemizle,
  gunduzeKaydir, bildirimGerekli, bildirimMetni,
} from '../sayfalar/yavru/mantik.js';
import { ESIK, KAZA_SURE, TUVALET_ARTIS, kazaYamasi, tuvaletOlaylari, tuvaletDurumu } from '../sayfalar/yavru/tuvalet.js';
import { applyPatch } from '../js/core/veri.js';

const A = 'omer-test-id';
const B = 'gul-test-id';
const L = (y, m, d, sa = 12, dk = 0) => new Date(y, m - 1, d, sa, dk).getTime();
const iso = (ms) => new Date(ms).toISOString();
const T0 = L(2026, 11, 10, 9);
const isitma = (n, bas = T0) => Array.from({ length: n }, (_, i) => iso(bas + i * 11 * DK));

function yavru(tuvalet, ihtiyacT = T0) {
  const ihtiyac = {};
  for (const ad of ['tokluk', 'mutluluk', 'temizlik', 'enerji']) ihtiyac[ad] = { v: 80, t: iso(ihtiyacT) };
  return { asama: 'kucuk', ad: 'Pamuk', renk: 3, dogum: iso(T0 - 2 * GUN), catlama: iso(T0 - GUN), ihtiyac, uyku: null, tuvalet };
}

test('KAZA_SURE 6 saat: 5 sa 59 dk kaza yok, 6 sa kaza', () => {
  assert.equal(KAZA_SURE, 6 * SAAT);
  const y = oku(yavru({ v: ESIK, t: iso(T0) }));
  assert.equal(kazaYamasi(y, { kim: A, simdi: T0 + 6 * SAAT - DK }), null);
  assert.ok(kazaYamasi(y, { kim: A, simdi: T0 + 6 * SAAT }));
});

test('ozledi: kazanın yazdığı temizlik zamanı bakım sayılmaz', () => {
  // Sıkışık başladı, kimse gelmedi: kaza 6 sa sonra, 13 sa sonra biri açtı.
  const d = yavru({ v: ESIK, t: iso(T0) });
  const kaza = kazaYamasi(oku(d), { kim: A, simdi: T0 + 13 * SAAT });
  const son = applyPatch(d, kaza.yama);
  const y = oku(son);
  assert.equal(son.ihtiyac.temizlik.t, iso(T0 + KAZA_SURE), 'kaza temizlik zamanını yazdı');
  assert.equal(ozledi(y, T0 + 13 * SAAT), true, 'kaza 7 sa önceydi ama son bakım 13 sa önce');
  assert.equal(durumMetni(y, T0 + 13 * SAAT), 'Sizi özledi 🥺');
});

test('ozledi: gerçek yıkama hâlâ bakımdır; alanı olmayan eski belge aynı', () => {
  const d = yavru({ v: 0, t: iso(T0), kaza: iso(T0) });
  d.ihtiyac.temizlik = { v: 90, t: iso(T0 + 6 * SAAT) }; // kazadan sonra yıkandı
  assert.equal(ozledi(oku(d), T0 + 13 * SAAT), false);
  const eski = yavru(undefined);
  assert.equal(ozledi(oku(eski), T0 + 11 * SAAT), false);
  assert.equal(ozledi(oku(eski), T0 + 12 * SAAT), true);
});

test('kaza partnere her zaman bildirilir (30 dk sınırı yok)', () => {
  assert.equal(bildirimGerekli({ son: T0, simdi: T0 + 1, eylem: 'kaza' }), true);
  assert.match(bildirimMetni({ ad: 'Gül', eylem: 'kaza' }), /kaza/);
});

test('gunduzeKaydir: gece hatırlatması sabah 08:00', () => {
  assert.equal(gunduzeKaydir(L(2026, 11, 10, 14)), L(2026, 11, 10, 14));
  assert.equal(gunduzeKaydir(L(2026, 11, 10, 3)), L(2026, 11, 10, 8));
  assert.equal(gunduzeKaydir(L(2026, 11, 10, 23, 30)), L(2026, 11, 11, 8));
  assert.equal(gunduzeKaydir(L(2026, 11, 10, 8)), L(2026, 11, 10, 8));
});

test('tuvaletOlaylari: eşikte ve kazadan 1 saat önce; geçmiş gönderilmez; alan yoksa yok', () => {
  assert.deepEqual(tuvaletOlaylari(oku(yavru(undefined)), T0), []);
  assert.deepEqual(tuvaletOlaylari(null, T0), []);
  assert.deepEqual(tuvaletOlaylari(oku({ asama: 'yumurta' }), T0), []);
  const y = oku(yavru({ v: ESIK - TUVALET_ARTIS, t: iso(T0) })); // 1 sa sonra eşik: 10:00; kaza 16:00
  const o = tuvaletOlaylari(y, T0);
  assert.deepEqual(o.map((x) => x.id), ['cis', 'cis-son']);
  assert.equal(o[0].zaman, iso(T0 + SAAT));
  assert.equal(o[1].zaman, iso(T0 + SAAT + KAZA_SURE - SAAT));
  // Eşik geçmiş: yalnız son uyarı.
  assert.deepEqual(tuvaletOlaylari(y, T0 + 2 * SAAT).map((x) => x.id), ['cis-son']);
  // Son uyarı da geçmiş: hiç.
  assert.deepEqual(tuvaletOlaylari(y, T0 + 6.5 * SAAT), []);
  assert.equal(tuvaletDurumu(y, T0 + 6.5 * SAAT).cisVar, true);
});

test('tuvaletOlaylari: gece düşen eşik sabaha; kazadan sonraya kalan uyarı atılır', () => {
  const y = oku(yavru({ v: ESIK, t: iso(L(2026, 11, 10, 22)) })); // eşik 22:00, kaza 04:00
  const o = tuvaletOlaylari(y, L(2026, 11, 10, 21));
  assert.deepEqual(o.map((x) => x.id), ['cis']);
  assert.equal(o[0].zaman, iso(L(2026, 11, 10, 22)));
  const yg = oku(yavru({ v: ESIK - 2 * TUVALET_ARTIS, t: iso(L(2026, 11, 10, 23)) })); // eşik 01:00, kaza 07:00: sabah kazadan sonra
  assert.deepEqual(tuvaletOlaylari(yg, L(2026, 11, 10, 23)), []);
});

test('hatirlaticiOlaylari yumurta: çatlama anı, iki kişi hazırsa "hazır", değilse tamamlama çağrısı', () => {
  const h = (isit) => hatirlaticiOlaylari(oku({ asama: 'yumurta', dogum: iso(T0), isitma: isit }), T0 + SAAT);
  const hazir = h({ [A]: isitma(3), [B]: isitma(3) });
  assert.equal(hazir.length, 1);
  assert.equal(hazir[0].id, 'catlama');
  assert.equal(hazir[0].zaman, iso(T0 + GUN));
  assert.match(hazir[0].metin, /çatlamaya hazır/);
  assert.match(h({ [A]: isitma(1) })[0].metin, /Isıtmayı/);
  // 24 saat doldu: sayfa açılınca çatlar, geçmiş olay yok.
  assert.deepEqual(hatirlaticiOlaylari(oku({ asama: 'yumurta', dogum: iso(T0), isitma: {} }), T0 + GUN + 1), []);
  // Gece dolan 24 saat sabaha kayar.
  const gece = L(2026, 11, 10, 2);
  assert.equal(hatirlaticiOlaylari(oku({ asama: 'yumurta', dogum: iso(gece), isitma: {} }), gece + SAAT)[0].zaman, iso(L(2026, 11, 11, 8)));
});

test('yumurtaRehberi: adımlar, davet, süre', () => {
  const bos = oku(yeniYumurta({ roomId: 'oda', simdi: T0 }));
  const r0 = yumurtaRehberi(bos, { benId: A, simdi: T0, partnerVar: false });
  assert.equal(r0.davet, true);
  assert.deepEqual(r0.adimlar.map((a) => a.durum), ['simdi', 'sonra', 'sonra']);
  assert.match(r0.adimlar[0].baslik, /3 kez/);
  assert.match(r0.adimlar[0].alt, /10 dakika/);
  assert.match(r0.adimlar[1].baslik, /24 saat/);
  const yari = oku({ asama: 'yumurta', dogum: iso(T0), isitma: { [A]: isitma(3) } });
  const r1 = yumurtaRehberi(yari, { benId: A, simdi: T0 + SAAT, partnerVar: true, partnerAd: 'Gül' });
  assert.equal(r1.davet, false);
  assert.match(r1.adimlar[0].alt, /Gül/, 'sıra sevgilide');
  const tam = oku({ asama: 'yumurta', dogum: iso(T0), isitma: { [A]: isitma(3), [B]: isitma(3) } });
  const r2 = yumurtaRehberi(tam, { benId: A, simdi: T0 + SAAT, partnerVar: true, partnerAd: 'Gül' });
  assert.deepEqual(r2.adimlar.map((a) => a.durum), ['tamam', 'simdi', 'sonra']);
  assert.match(r2.adimlar[1].alt, /23 saat/);
  // Belge daha yokken de çalışır.
  assert.equal(yumurtaRehberi(null, { benId: A, simdi: T0, partnerVar: false }).davet, true);
});

test('adOnerileri: odaya kararlı, tekil, adTemizle geçer', () => {
  const o = adOnerileri('testpaka23');
  assert.equal(o.length, 3);
  assert.equal(new Set(o).size, 3);
  assert.deepEqual(adOnerileri('testpaka23'), o);
  for (const ad of o) assert.equal(adTemizle(ad).ad, ad);
  const hepsi = new Set(['a', 'b', 'c', 'd', 'e', 'f'].flatMap((x) => adOnerileri(`oda-${x}`)));
  assert.ok(hepsi.size > 3, 'odaya göre değişir');
});

test('ozelGunOlayi yumurtada null (hatırlatıcı listesi bozulmaz)', () => {
  assert.equal(ozelGunOlayi(oku({ asama: 'yumurta', dogum: iso(T0) }), T0), null);
});
