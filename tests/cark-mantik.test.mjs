// Karar Çarkı: saf mantık (DOM yok).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MIN_SECENEK, MAX_SECENEK, SECENEK_MAX, SURE_MS, YEMEKLER, CARKLAR, carkById,
  listeSecenekleri, ornekle, gunTohumu, fikirSecenekleri, secenekler,
  kendiOku, kendiEkle, kendiCikar, cevirmeHazirla, hedefAci, aciSonuc,
  mesajKur, mesajGecerli, onceGelir, sonucParcalari, etiketKisalt, etiketSatirlari, dilimRenk, FIKIR_MAX,
} from '../sayfalar/cark/mantik.js';
import { FIKIRLER } from '../sayfalar/randevu/fikirler.js';
import { SAYFALAR } from '../js/core/games.js';
import { DAHA_GRUPLARI } from '../sayfalar/daha/mantik.js';

const liste = (liste, metin, ek = {}) => ({ id: metin, data: { liste, metin, ...ek } });

test('kayıtlar: SAYFALAR "cark" ve Daha > Planlayalım', () => {
  const s = SAYFALAR.find((x) => x.id === 'cark');
  assert.deepEqual(s, { id: 'cark', title: 'Karar Çarkı', icon: '🎡', path: 'sayfalar/cark/', desc: 'Ne yesek, ne izlesek? Çark karar versin.' });
  assert.ok(DAHA_GRUPLARI.find((g) => g.id === 'planlayalim').uyeler.includes('cark'));
});

test('hazır çarklar: beş çark, 12 yemek, tekil', () => {
  assert.deepEqual(CARKLAR.map((c) => c.id), ['yemek', 'izle', 'git', 'yap', 'kendi']);
  assert.equal(YEMEKLER.length, 12);
  assert.equal(new Set(YEMEKLER).size, 12);
  for (const y of YEMEKLER) assert.ok(y.length <= SECENEK_MAX, y);
  assert.equal(carkById('izle').liste, 'izlenecek');
  assert.equal(carkById('git').liste, 'gidilecek');
  assert.equal(carkById('yok'), null);
});

test('listeSecenekleri: yalnız o liste, yapılmamış, boş ve yinelenen atlanır', () => {
  const docs = [
    liste('izlenecek', 'Babam ve Oğlum'),
    liste('izlenecek', '  Eşkıya  '),
    liste('izlenecek', 'Amélie', { yapildi: '2026-10-01T10:00:00Z' }),
    liste('gidilecek', 'Kaş'),
    liste('izlenecek', ''),
    liste('izlenecek', 'babam ve oğlum'),
    null,
  ];
  assert.deepEqual(listeSecenekleri(docs, 'izlenecek'), ['Babam ve Oğlum', 'Eşkıya']);
  assert.deepEqual(listeSecenekleri(docs, 'gidilecek'), ['Kaş']);
  assert.deepEqual(listeSecenekleri(null, 'izlenecek'), []);
});

test('listeSecenekleri: uzun metin kısalır', () => {
  const uzun = 'A'.repeat(80);
  assert.equal(listeSecenekleri([liste('izlenecek', uzun)], 'izlenecek')[0].length, SECENEK_MAX);
});

test('ornekle: az ise hepsi; çoksa tohumla aynı n tane', () => {
  assert.deepEqual(ornekle(['a', 'b'], 12, 5), ['a', 'b']);
  const l = Array.from({ length: 30 }, (_, i) => `s${i}`);
  const a = ornekle(l, 12, 42);
  assert.equal(a.length, 12);
  assert.equal(new Set(a).size, 12);
  assert.deepEqual(ornekle(l, 12, 42), a);
  assert.notDeepEqual(ornekle(l, 12, 43), a);
});

test('gunTohumu: kararlı 32 bit, girdiye duyarlı', () => {
  const t = gunTohumu('2026-10-31', 'oda1');
  assert.equal(t, gunTohumu('2026-10-31', 'oda1'));
  assert.notEqual(t, gunTohumu('2026-11-01', 'oda1'));
  assert.ok(Number.isInteger(t) && t >= 0 && t < 2 ** 32);
});

test('fikirSecenekleri: 8 kısa fikir, gün tohumuyla aynı', () => {
  const a = fikirSecenekleri(FIKIRLER, 7);
  assert.equal(a.length, 8);
  for (const f of a) assert.ok(f.length <= FIKIR_MAX, f);
  assert.ok(FIKIRLER.filter((f) => f.metin.length <= FIKIR_MAX).length >= 20, 'havuz yeterli');
  assert.deepEqual(fikirSecenekleri(FIKIRLER, 7), a);
});

test('secenekler: çarka göre kaynak', () => {
  const docs = [liste('izlenecek', 'Eşkıya'), liste('izlenecek', 'Vizontele'), liste('gidilecek', 'Kaş')];
  const ort = { docs, fikirler: FIKIRLER, kendi: ['Bowling', 'Sinema'], gun: '2026-10-31', oda: 'o' };
  assert.deepEqual(secenekler('yemek', ort), YEMEKLER);
  assert.deepEqual(secenekler('izle', ort), ['Eşkıya', 'Vizontele']);
  assert.deepEqual(secenekler('git', ort), ['Kaş']);
  assert.equal(secenekler('yap', ort).length, 8);
  assert.deepEqual(secenekler('kendi', ort), ['Bowling', 'Sinema']);
  assert.deepEqual(secenekler('yok', ort), []);
  const cok = Array.from({ length: 20 }, (_, i) => liste('izlenecek', `Film ${i}`));
  assert.equal(secenekler('izle', { ...ort, docs: cok }).length, MAX_SECENEK);
});

test('kendiOku: bozuk depo boş liste; temizler ve 12 ile sınırlar', () => {
  assert.deepEqual(kendiOku(null), []);
  assert.deepEqual(kendiOku('{bozuk'), []);
  assert.deepEqual(kendiOku('"x"'), []);
  assert.deepEqual(kendiOku(JSON.stringify([' a ', '', 'A', 'b', 5])), ['a', 'b']);
  assert.equal(kendiOku(JSON.stringify(Array.from({ length: 20 }, (_, i) => `x${i}`))).length, MAX_SECENEK);
});

test('kendiEkle / kendiCikar', () => {
  assert.deepEqual(kendiEkle(['a'], '  b  '), { liste: ['a', 'b'] });
  assert.match(kendiEkle(['a'], '   ').hata, /yaz/i);
  assert.match(kendiEkle(['Pizza'], 'pizza').hata, /zaten/i);
  const dolu = Array.from({ length: MAX_SECENEK }, (_, i) => `x${i}`);
  assert.match(kendiEkle(dolu, 'yeni').hata, /12/);
  assert.equal(kendiEkle([], 'B'.repeat(60)).liste[0].length, SECENEK_MAX);
  assert.deepEqual(kendiCikar(['a', 'b', 'c'], 1), ['a', 'c']);
  assert.deepEqual(kendiCikar(['a'], 5), ['a']);
});

test('cevirmeHazirla: aralıkta sonuç ve 32 bit tohum', () => {
  const sabit = (v) => () => v;
  assert.equal(cevirmeHazirla(8, sabit(0)).sonuc, 0);
  assert.equal(cevirmeHazirla(8, sabit(0.999)).sonuc, 7);
  const c = cevirmeHazirla(5);
  assert.ok(c.sonuc >= 0 && c.sonuc < 5);
  assert.ok(Number.isInteger(c.tohum) && c.tohum >= 0 && c.tohum < 2 ** 32);
});

test('hedefAci: ibre sonucu gösterir, en az 5 tur ileri, kararlı', () => {
  for (const n of [2, 3, 7, 8, 12]) {
    for (let sonuc = 0; sonuc < n; sonuc++) {
      for (const bas of [0, 137.5, -40, 3600 + 12]) {
        const tohum = (n * 977 + sonuc * 131 + Math.round(bas)) >>> 0;
        const a = hedefAci(bas, n, sonuc, tohum);
        assert.equal(aciSonuc(a, n), sonuc, `n=${n} sonuc=${sonuc} bas=${bas}`);
        assert.ok(a - bas >= 5 * 360 && a - bas < 8 * 360, `tur n=${n}`);
        assert.equal(a, hedefAci(bas, n, sonuc, tohum));
      }
    }
  }
});

test('aciSonuc: dilim sınırları', () => {
  // Dönme yok: ibre 0. dilimin başında; çok az dönünce son dilim gelir.
  assert.equal(aciSonuc(1, 4), 3);
  assert.equal(aciSonuc(-1, 4), 0);
  assert.equal(aciSonuc(-89, 4), 0);
  assert.equal(aciSonuc(-91, 4), 1);
  assert.equal(aciSonuc(360 * 6 + 1, 4), 3);
  assert.equal(aciSonuc(360 * 6 - 1, 4), 0);
});

test('mesajKur / mesajGecerli: gidip gelen mesaj aynı; bozuk olan reddedilir', () => {
  const m = mesajKur({ cark: 'yemek', baslik: 'Ne yesek?', secenekler: YEMEKLER, sonuc: 3, tohum: 99, at: 1000 });
  assert.equal(m.t, 'cevir');
  assert.deepEqual(mesajGecerli(JSON.parse(JSON.stringify(m))), m);
  assert.equal(mesajGecerli(null), null);
  assert.equal(mesajGecerli({ ...m, t: 'baska' }), null);
  assert.equal(mesajGecerli({ ...m, secenekler: ['tek'] }), null);
  assert.equal(mesajGecerli({ ...m, secenekler: Array(13).fill('x').map((x, i) => x + i) }), null);
  assert.equal(mesajGecerli({ ...m, secenekler: ['a', 5] }), null);
  assert.equal(mesajGecerli({ ...m, sonuc: 12 }), null);
  assert.equal(mesajGecerli({ ...m, sonuc: 1.5 }), null);
  assert.equal(mesajGecerli({ ...m, tohum: -1 }), null);
  assert.equal(mesajGecerli({ ...m, cark: 'yok' }), null);
  assert.equal(mesajGecerli({ ...m, at: 'dün' }), null);
  // Uzun seçenek ve başlık kısalır
  const u = mesajGecerli({ ...m, sonuc: 1, baslik: 'B'.repeat(200), secenekler: ['C'.repeat(200), 'd'] });
  assert.equal(u.secenekler[0].length, SECENEK_MAX);
  assert.ok(u.baslik.length <= 60);
});

test('onceGelir: önce başlayan kazanır; eşitte küçük clientId', () => {
  assert.equal(onceGelir({ at: 1, from: 'b' }, { at: 2, from: 'a' }), true);
  assert.equal(onceGelir({ at: 2, from: 'a' }, { at: 1, from: 'b' }), false);
  assert.equal(onceGelir({ at: 5, from: 'a' }, { at: 5, from: 'b' }), true);
  assert.equal(onceGelir({ at: 5, from: 'b' }, { at: 5, from: 'a' }), false);
});

test('sonucParcalari: "Bu akşam: Pizza 🍕"', () => {
  assert.deepEqual(sonucParcalari('yemek', 'Pizza 🍕'), { on: 'Bu akşam:', deger: 'Pizza 🍕' });
  assert.deepEqual(sonucParcalari('izle', 'Eşkıya'), { on: 'Bu akşam:', deger: 'Eşkıya 🎬' });
  assert.deepEqual(sonucParcalari('git', 'Kaş'), { on: 'Sıradaki rota:', deger: 'Kaş 📍' });
  assert.equal(sonucParcalari('kendi', 'Bowling').on, 'Çark dedi ki:');
  assert.equal(sonucParcalari('yok', 'X').deger, 'X');
});

test('etiketKisalt: kelime sınırında, üç nokta', () => {
  assert.equal(etiketKisalt('Pizza 🍕', 14), 'Pizza 🍕');
  assert.equal(etiketKisalt('Mum ışığında evde akşam yemeği', 14), 'Mum ışığında…');
  assert.equal(etiketKisalt('Supercalifragilistic', 10), 'Supercali…');
});

test('etiketSatirlari: iki satıra sarar, taşanı üç noktayla keser', () => {
  assert.deepEqual(etiketSatirlari('Pizza 🍕', 14), ['Pizza 🍕']);
  assert.deepEqual(etiketSatirlari("Ölüdeniz'de yamaç paraşütü", 14), ["Ölüdeniz'de", 'yamaç paraşütü']);
  assert.deepEqual(etiketSatirlari('Mum ışığında evde akşam yemeği', 14), ['Mum ışığında', 'evde akşam…']);
  assert.deepEqual(etiketSatirlari('Supercalifragilisticexpialidocious', 10), ['Supercalif', 'ragilisti…']);
  assert.deepEqual(etiketSatirlari('  ', 10), []);
});

test('dilimRenk: 1–6; komşu dilimler (sondan başa da) farklı', () => {
  for (let n = MIN_SECENEK; n <= MAX_SECENEK; n++) {
    const r = Array.from({ length: n }, (_, i) => dilimRenk(i, n));
    for (const x of r) assert.ok(x >= 1 && x <= 6);
    for (let i = 0; i < n; i++) assert.notEqual(r[i], r[(i + 1) % n], `n=${n} i=${i}`);
  }
  assert.ok(SURE_MS >= 3000 && SURE_MS <= 4000);
});
