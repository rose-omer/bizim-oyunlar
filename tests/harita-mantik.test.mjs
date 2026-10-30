// Anı haritası: saf mantık (konum doğrulama, kümeleme, sınırlar). DOM yok.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  yuvarla4, konumDogrula, boylamSar, haritaNoktasi, dunyaPikseli, kumele, sinirlar, ayniYerde,
  kumeTiklama, konumluAnilar, konumYazi, konumHataMetni, VARSAYILAN_MERKEZ,
} from '../sayfalar/anilar/harita-mantik.js';

test('yuvarla4: 4 ondalık', () => {
  assert.equal(yuvarla4(41.008237), 41.0082);
  assert.equal(yuvarla4(-0.00006), -0.0001);
  assert.equal(yuvarla4(28.97846), 28.9785);
  assert.equal(yuvarla4(10), 10);
});

test('konumDogrula: aralık, sayı, 4 ondalık; Geolocation coords da kabul', () => {
  assert.deepEqual(konumDogrula({ lat: 41.0082376, lng: 28.9783589 }), { lat: 41.0082, lng: 28.9784 });
  assert.deepEqual(konumDogrula({ latitude: 38.4192, longitude: 27.12871 }), { lat: 38.4192, lng: 27.1287 });
  assert.deepEqual(konumDogrula({ lat: -90, lng: 180 }), { lat: -90, lng: 180 });
  assert.deepEqual(konumDogrula({ lat: 0, lng: 0 }), { lat: 0, lng: 0 });
  assert.equal(konumDogrula({ lat: 90.1, lng: 0 }), null);
  assert.equal(konumDogrula({ lat: 0, lng: -180.5 }), null);
  assert.equal(konumDogrula({ lat: '41', lng: '29' }), null, 'metin kabul edilmez');
  assert.equal(konumDogrula({ lat: NaN, lng: 1 }), null);
  assert.equal(konumDogrula({ lat: 1 }), null);
  assert.equal(konumDogrula(null), null);
  assert.equal(konumDogrula('41,29'), null);
  // Fazla alan atılır
  assert.deepEqual(konumDogrula({ lat: 1, lng: 2, ad: 'x' }), { lat: 1, lng: 2 });
});

test('boylamSar ve haritaNoktasi: dünya sarması', () => {
  assert.equal(boylamSar(190), -170);
  assert.equal(boylamSar(-190), 170);
  assert.equal(boylamSar(540), -180);
  assert.equal(boylamSar(28.9), 28.9);
  assert.equal(boylamSar(180), -180);
  assert.deepEqual(haritaNoktasi({ lat: 41.00823, lng: 388.97836 }), { lat: 41.0082, lng: 28.9784 });
  assert.equal(haritaNoktasi({ lat: 95, lng: 0 }), null);
});

test('dunyaPikseli: Web Mercator', () => {
  const o = dunyaPikseli({ lat: 0, lng: 0 }, 0);
  assert.ok(Math.abs(o.x - 128) < 1e-9 && Math.abs(o.y - 128) < 1e-9);
  const z1 = dunyaPikseli({ lat: 0, lng: 180 }, 1);
  assert.ok(Math.abs(z1.x - 512) < 1e-9);
  const kuzey = dunyaPikseli({ lat: 89.9, lng: -180 }, 2);
  assert.equal(kuzey.x, 0);
  assert.ok(Math.abs(kuzey.y) < 1e-6, 'kutup 85.05°e kırpılır');
  assert.ok(dunyaPikseli({ lat: 41, lng: 29 }, 10).y < dunyaPikseli({ lat: 38, lng: 29 }, 10).y, 'kuzey yukarıda');
});

const N = (id, lat, lng) => ({ id, lat, lng });
const istanbul = [N('a', 41.0082, 28.9784), N('b', 41.0136, 28.955), N('c', 41.0422, 29.0067)];
const izmir = [N('d', 38.4237, 27.1428)];
const ankara = [N('e', 39.9208, 32.8541)];

test('kumele: uzak zoomda yakınlar birleşir, yakın zoomda ayrılır', () => {
  const hepsi = [...istanbul, ...izmir, ...ankara];
  const z5 = kumele(hepsi, 5);
  assert.equal(z5.length, 3);
  const ist = z5.find((k) => k.uyeler.length === 3);
  assert.deepEqual(ist.uyeler.map((u) => u.id), ['a', 'b', 'c']);
  assert.ok(Math.abs(ist.lat - (41.0082 + 41.0136 + 41.0422) / 3) < 1e-9, 'merkez = ortalama');
  assert.equal(z5.reduce((n, k) => n + k.uyeler.length, 0), 5, 'her nokta bir kez');

  const z15 = kumele(hepsi, 15);
  assert.equal(z15.length, 5);
  assert.ok(z15.every((k) => k.uyeler.length === 1));

  const z2 = kumele(hepsi, 2, { hucre: 120 });
  assert.ok(z2.length <= 2, `z2: ${z2.length}`);
  assert.deepEqual(kumele([], 5), []);
  assert.deepEqual(kumele(undefined, 5), []);
});

test('kumele: sıra kararlı, anahtar tekil', () => {
  const a = kumele([...istanbul, ...izmir], 5);
  const b = kumele([...istanbul, ...izmir], 5);
  assert.deepEqual(a.map((k) => k.anahtar), b.map((k) => k.anahtar));
  assert.equal(new Set(a.map((k) => k.anahtar)).size, a.length);
  assert.equal(a[0].uyeler[0].id, 'a', 'ilk noktanın kümesi önce');
});

test('sinirlar ve ayniYerde', () => {
  assert.deepEqual(sinirlar([...istanbul, ...izmir]), [[38.4237, 27.1428], [41.0422, 29.0067]]);
  assert.deepEqual(sinirlar(izmir), [[38.4237, 27.1428], [38.4237, 27.1428]]);
  assert.equal(sinirlar([]), null);
  assert.equal(sinirlar(undefined), null);
  assert.equal(ayniYerde([N('x', 1, 2), N('y', 1, 2)]), true);
  assert.equal(ayniYerde(istanbul), false);
  assert.equal(ayniYerde(izmir), true);
});

test('kumeTiklama: aynı yer ya da en yakın zoom → liste; yoksa yakınlaş', () => {
  assert.equal(kumeTiklama({ uyeler: istanbul }, 10, 19), 'yakinlas');
  assert.equal(kumeTiklama({ uyeler: istanbul }, 18, 19), 'liste');
  assert.equal(kumeTiklama({ uyeler: [N('x', 1, 2), N('y', 1, 2)] }, 6, 19), 'liste');
  assert.equal(kumeTiklama({ uyeler: izmir }, 6, 19), 'ani');
});

test('konumluAnilar: yalnız geçerli konumlu anılar, sıra korunur', () => {
  const docs = [
    { id: 'a1', data: { baslik: 'Kordon', konum: { lat: 38.4237, lng: 27.1428 } } },
    { id: 'a2', data: { baslik: 'Konumsuz' } },
    { id: 'a3', data: { baslik: 'Bozuk', konum: { lat: 200, lng: 0 } } },
    { id: 'a4', data: { baslik: 'Galata', konum: { lat: 41.0256, lng: 28.9742 } } },
  ];
  const l = konumluAnilar(docs);
  assert.deepEqual(l.map((x) => [x.id, x.lat, x.lng]), [['a1', 38.4237, 27.1428], ['a4', 41.0256, 28.9742]]);
  assert.equal(l[0].ani, docs[0]);
  assert.deepEqual(konumluAnilar(null), []);
});

test('konumYazi: Türkçe yön harfleri', () => {
  assert.equal(konumYazi({ lat: 41.0082, lng: 28.9784 }), '41,0082° K · 28,9784° D');
  assert.equal(konumYazi({ lat: -33.8688, lng: -151.2093 }), '33,8688° G · 151,2093° B');
  assert.equal(konumYazi({ lat: 0, lng: 0 }), '0,0000° K · 0,0000° D');
  assert.equal(konumYazi(null), '');
});

test('konumHataMetni: izin reddi nazik, harita önerir', () => {
  assert.match(konumHataMetni({ code: 1 }), /izni/i);
  assert.match(konumHataMetni({ code: 1 }), /harita/i);
  assert.match(konumHataMetni({ code: 2 }), /bulunamadı/i);
  assert.match(konumHataMetni({ code: 3 }), /zamanında/i);
  assert.match(konumHataMetni('yok'), /harita/i);
  assert.ok(konumHataMetni(new Error('x')).length > 5);
});

test('VARSAYILAN_MERKEZ: Türkiye', () => {
  assert.ok(konumDogrula(VARSAYILAN_MERKEZ));
  assert.ok(VARSAYILAN_MERKEZ.zoom >= 4 && VARSAYILAN_MERKEZ.zoom <= 7);
});
