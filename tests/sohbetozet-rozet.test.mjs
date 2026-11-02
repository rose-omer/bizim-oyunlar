// Sohbet Özetimiz: rozetler ve ekran yardımcıları.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rozetler, kazanan, ROZETLER, KISI_BASI_ROZET } from '../sayfalar/sohbet-ozeti/rozet.js';
import { sureYaz, cevapYaz, ilkler, kategoriler, yillar, aylikSeri, isiHaritasi, kisaAy } from '../sayfalar/sohbet-ozeti/gorunum.js';

const kisi = (ek = {}) => ({
  mesaj: 10, kelime: 50, harf: 200, farkliKelime: 30, medya: {}, silinen: 0, soru: 0,
  sohbetAcma: 0, gununIlk: 0, gununSon: 0, cevapOrtDk: null, cevapAyniDk: null, enBekletme: null,
  artArda: 0, enUzunSeri: { n: 1, an: null }, enUzunMesaj: { harf: 0, gun: null }, gece: 0,
  soz: { seviyorum: 0, askim: 0, sevgilim: 0, canim: 0, bebegim: 0, ozledim: 0, gunaydin: 0, iyiGeceler: 0, muah: 0, ozur: 0, tesekkur: 0, gulme: 0 },
  sozIlk: {}, kelimeler: [], emojiler: [], ...ek,
});

test('kazanan: %5 altı fark berabere; küçük kazanır seçeneği', () => {
  assert.equal(kazanan(100, 50), 0);
  assert.equal(kazanan(50, 100), 1);
  assert.equal(kazanan(100, 96), null);
  assert.equal(kazanan(100, 95), 0);
  assert.equal(kazanan(0, 0), null);
  assert.equal(kazanan(3, 0), 0);
  assert.equal(kazanan(2, 10, { kucuk: true }), 0);
  assert.equal(kazanan(null, 10, { kucuk: true }), null);
  assert.equal(kazanan(0, 4, { kucuk: true }), 0);
});

test('rozetler: önde olan alır, berabere kimse almaz, medya türü yoksa medya rozeti yok', () => {
  const o = {
    kaynak: { medyaTuru: false },
    kisi: {
      a: kisi({ gece: 50, cevapOrtDk: 2, soz: { ...kisi().soz, gulme: 10 }, medya: { ses: 40 } }),
      b: kisi({ gece: 10, cevapOrtDk: 9, soz: { ...kisi().soz, gulme: 10 }, gununSon: 7, medya: { ses: 1 } }),
    },
  };
  const r = rozetler(o, ['a', 'b']);
  assert.deepEqual(r.a.map((x) => x.id), ['isik', 'gece']);
  assert.deepEqual(r.b.map((x) => x.id), ['sonsoz']);
  const m = rozetler({ ...o, kaynak: { medyaTuru: true } }, ['a', 'b']);
  assert.ok(m.a.some((x) => x.id === 'ses'));
});

test('rozetler: kişi başı en çok 6; eksik kişi boş liste', () => {
  const buyuk = kisi({
    sohbetAcma: 9, cevapOrtDk: 1, gece: 9, gununSon: 9, farkliKelime: 99, enUzunMesaj: { harf: 99 },
    soz: { ...kisi().soz, gunaydin: 9, gulme: 9, muah: 9, tesekkur: 9 },
  });
  const r = rozetler({ kaynak: {}, kisi: { a: buyuk, b: kisi({ cevapOrtDk: 5 }) } }, ['a', 'b']);
  assert.equal(r.a.length, KISI_BASI_ROZET);
  assert.equal(r.b.length, 0);
  assert.deepEqual(rozetler({ kisi: { a: buyuk } }, ['a', null]), { a: [] });
  assert.ok(ROZETLER.every((x) => x.ad && x.simge));
});

test('sureYaz ve cevapYaz', () => {
  assert.equal(sureYaz(45), '45 dk');
  assert.equal(sureYaz(60), '1 sa');
  assert.equal(sureYaz(192), '3 sa 12 dk');
  assert.equal(sureYaz(1440 * 2 + 240), '2 gün 4 sa');
  assert.equal(cevapYaz(0.4), '1 dk\'dan az');
  assert.equal(cevapYaz(null), '—');
});

test('ilkler: ilk mesaj ve sözler zaman sırasıyla', () => {
  const o = {
    ilkMesaj: { kim: 'a', gun: '2025-01-01' },
    kisi: {
      a: kisi({ sozIlk: { seviyorum: '2025-03-01T10:00:00.000Z', gunaydin: '2025-01-02T07:00:00.000Z' } }),
      b: kisi({ sozIlk: { seviyorum: '2025-02-01T10:00:00.000Z', askim: null } }),
    },
  };
  const l = ilkler(o, ['a', 'b']);
  assert.deepEqual(l.map((x) => [x.anahtar, x.kim]), [['mesaj', 'a'], ['gunaydin', 'a'], ['seviyorum', 'b']]);
});

test('kategoriler: ikisi de 0 olan atlanır; oran ve önde', () => {
  const o = { kisi: { a: kisi({ mesaj: 30 }), b: kisi({ mesaj: 10, kelime: 50 }) } };
  const k = kategoriler(o, ['a', 'b']);
  const mesaj = k.find((x) => x.id === 'mesaj');
  assert.equal(mesaj.oran, 0.75);
  assert.equal(mesaj.onde, 0);
  assert.equal(k.find((x) => x.id === 'kelime').onde, null);
  assert.ok(!k.some((x) => x.id === 'gece'));
  assert.deepEqual(kategoriler({ kisi: {} }, ['a', 'b']), []);
  const md = { kaynak: { medyaTuru: false }, kisi: { a: kisi({ medya: { medya: 3 } }), b: kisi({ medya: { medya: 1 } }) } };
  assert.deepEqual(kategoriler(md, ['a', 'b']).filter((x) => x.id.startsWith('medya')).map((x) => [x.id, x.ad]), [['medya', 'Medya']]);
  const mt = { kaynak: { medyaTuru: true }, kisi: { a: kisi({ medya: { foto: 3, ses: 2 } }), b: kisi({ medya: { foto: 1 } }) } };
  assert.deepEqual(kategoriler(mt, ['a', 'b']).filter((x) => x.id.startsWith('medya')).map((x) => x.ad), ['Fotoğraf', 'Sesli mesaj']);
});

test('yillar ve aylikSeri', () => {
  const o = {
    kaynak: { ilk: '2024-12-01', son: '2025-02-10' },
    aylik: { '2024-12': { a: 31, b: 31 }, '2025-02': { a: 5 } },
  };
  const y = yillar(o);
  assert.deepEqual(y.map((x) => [x.yil, x.toplam, x.gun, x.gunlukOrt]), [[2024, 62, 31, 2], [2025, 5, 41, 0.1]]);
  assert.deepEqual(y[0].pay, { a: 31, b: 31 });
  assert.deepEqual(aylikSeri(o).map((x) => [x.ay, x.toplam]), [['2024-12', 62], ['2025-01', 0], ['2025-02', 5]]);
  assert.equal(kisaAy('2025-02'), 'Şub 25');
});

test('isiHaritasi: haftalar Pzt başlar, aralık dışı null, seviyeler', () => {
  // 2025-04-09 Çarşamba
  const g = { '2025-04-09': 1, '2025-04-10': 4, '2025-04-14': 10, '2025-04-15': 2 };
  const r = isiHaritasi(g, '2025-04-09', '2025-04-15');
  assert.equal(r.haftalar.length, 2);
  assert.deepEqual(r.haftalar[0].gunler.slice(0, 2), [null, null]);
  assert.equal(r.haftalar[0].gunler[2].gun, '2025-04-09');
  assert.equal(r.haftalar[0].gunler[3].n, 4);
  assert.equal(r.haftalar[0].gunler[4].seviye, 0);
  assert.equal(r.haftalar[1].gunler[0].seviye, 4);
  assert.equal(r.haftalar[1].gunler[2], null);
  assert.equal(r.haftalar[0].ay, 'Nis');
  assert.equal(r.haftalar[1].ay, null);
  assert.equal(r.enCok, 10);
  assert.deepEqual(isiHaritasi({}, null, null), { haftalar: [], enCok: 0 });
});
