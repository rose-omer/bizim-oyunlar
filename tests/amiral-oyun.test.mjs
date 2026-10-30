import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  N, FILO, gemiTanim, koord, hucreler, yerlesimHatasi, filoGecerli, rastgeleFilo, dondur,
  atisSonucu, dogrula, batanlar, initialState, reduce, toAction, cevapla, resultOf,
} from '../games/amiral/oyun.js';
import { mulberry32 } from '../games/hafiza/rng.js';

const A = 'aaa', B = 'bbb';
const KURAL = { temasYok: true };

// Elle kurulmuş, temassız filo
const FILO_A = [
  { id: 'ucak', x: 0, y: 0, yon: 'y' },      // A1–E1
  { id: 'zirhli', x: 0, y: 2, yon: 'd' },    // A3–A6
  { id: 'kruvazor', x: 2, y: 2, yon: 'y' },  // C3–E3
  { id: 'denizalti', x: 9, y: 5, yon: 'd' }, // J6–J8
  { id: 'muhrip', x: 5, y: 9, yon: 'y' },    // F10–G10
];

test('filo tanımı: 5,4,3,3,2; koordinat adı', () => {
  assert.deepEqual(FILO.map((g) => g.boy), [5, 4, 3, 3, 2]);
  assert.equal(new Set(FILO.map((g) => g.id)).size, 5);
  assert.equal(gemiTanim('yok'), null);
  assert.equal(koord(0, 0), 'A1');
  assert.equal(koord(9, 9), 'J10');
  assert.equal(koord(2, 4), 'C5');
});

test('hucreler: yatay x artar, dikey y artar; döndür pruvayı korur', () => {
  assert.deepEqual(hucreler({ id: 'muhrip', x: 3, y: 4, yon: 'y' }), [[3, 4], [4, 4]]);
  assert.deepEqual(hucreler({ id: 'kruvazor', x: 3, y: 4, yon: 'd' }), [[3, 4], [3, 5], [3, 6]]);
  assert.deepEqual(hucreler({ id: 'yok', x: 0, y: 0, yon: 'y' }), []);
  assert.deepEqual(dondur({ id: 'muhrip', x: 1, y: 2, yon: 'y' }), { id: 'muhrip', x: 1, y: 2, yon: 'd' });
});

test('yerlesimHatasi: dışarı, çakışma, temas (kenar ve çapraz) yalnız kural açıkken', () => {
  const diger = [{ id: 'ucak', x: 2, y: 2, yon: 'y' }]; // C3–G3
  assert.equal(yerlesimHatasi(diger, { id: 'muhrip', x: 9, y: 0, yon: 'y' }), 'disari');
  assert.equal(yerlesimHatasi(diger, { id: 'zirhli', x: 0, y: 7, yon: 'd' }), 'disari');
  assert.equal(yerlesimHatasi(diger, { id: 'muhrip', x: -1, y: 0, yon: 'y' }), 'disari');
  assert.equal(yerlesimHatasi(diger, { id: 'kruvazor', x: 4, y: 1, yon: 'd' }), 'cakisma');
  assert.equal(yerlesimHatasi(diger, { id: 'muhrip', x: 2, y: 3, yon: 'y' }, KURAL), 'temas', 'alt kenar');
  assert.equal(yerlesimHatasi(diger, { id: 'muhrip', x: 7, y: 1, yon: 'y' }, KURAL), 'temas', 'çapraz köşe');
  assert.equal(yerlesimHatasi(diger, { id: 'muhrip', x: 7, y: 1, yon: 'y' }, { temasYok: false }), null);
  assert.equal(yerlesimHatasi(diger, { id: 'muhrip', x: 2, y: 3, yon: 'y' }, { temasYok: false }), null);
  assert.equal(yerlesimHatasi(diger, { id: 'muhrip', x: 2, y: 4, yon: 'y' }, KURAL), null, 'bir boşluk yeter');
  assert.equal(yerlesimHatasi(diger, { id: 'ucak', x: 0, y: 9, yon: 'y' }, KURAL), null, 'kendisiyle çakışmaz');
});

test('filoGecerli: eksik, yinelenen, temaslı filolar reddedilir', () => {
  assert.equal(filoGecerli(FILO_A, KURAL), true);
  assert.equal(filoGecerli(FILO_A.slice(0, 4), KURAL), false);
  assert.equal(filoGecerli([...FILO_A.slice(0, 4), { id: 'ucak', x: 0, y: 9, yon: 'y' }], KURAL), false);
  const temasli = FILO_A.map((g) => (g.id === 'muhrip' ? { ...g, x: 1, y: 1, yon: 'y' } : g));
  assert.equal(filoGecerli(temasli, KURAL), false);
  assert.equal(filoGecerli(temasli, { temasYok: false }), true);
  assert.equal(filoGecerli(null), false);
});

test('rastgeleFilo: iki kuralla da her tohumda geçerli ve tohuma bağlı', () => {
  for (let seed = 1; seed <= 150; seed++) {
    assert.equal(filoGecerli(rastgeleFilo(mulberry32(seed), KURAL), KURAL), true, `seed ${seed}`);
    assert.equal(filoGecerli(rastgeleFilo(mulberry32(seed), { temasYok: false }), { temasYok: false }), true);
  }
  assert.deepEqual(rastgeleFilo(mulberry32(7), KURAL), rastgeleFilo(mulberry32(7), KURAL));
});

test('atisSonucu: ıska, isabet, batırma, son gemi = bitti', () => {
  assert.deepEqual(atisSonucu(FILO_A, [], 5, 5), { vurdu: false, batti: null, bitti: false });
  const r1 = atisSonucu(FILO_A, [], 5, 9);
  assert.equal(r1.vurdu, true);
  assert.equal(r1.batti, null);
  const r2 = atisSonucu(FILO_A, [{ x: 5, y: 9, vurdu: true }], 6, 9);
  assert.deepEqual(r2.batti, { id: 'muhrip', ad: 'Muhrip', boy: 2, hucreler: [[5, 9], [6, 9]] });
  assert.equal(r2.bitti, false);
  // Hepsini vur, sonuncuda bitti
  const tum = FILO_A.flatMap(hucreler);
  const once = tum.slice(0, -1).map(([x, y]) => ({ x, y, vurdu: true }));
  const [lx, ly] = tum.at(-1);
  const son = atisSonucu(FILO_A, once, lx, ly);
  assert.equal(son.bitti, true);
  assert.equal(son.batti.id, 'muhrip');
});

test('dogrula: doğru kayıt geçer; yalan söylenen ıska yakalanır', () => {
  const kayit = [];
  for (const [x, y] of [[0, 0], [5, 5], [1, 0], [5, 9], [6, 9]]) {
    const r = atisSonucu(FILO_A, kayit, x, y);
    kayit.push(r.batti ? { x, y, vurdu: r.vurdu, batti: r.batti } : { x, y, vurdu: r.vurdu });
  }
  assert.equal(dogrula(FILO_A, kayit), true);
  const yalan = kayit.map((a, i) => (i === 0 ? { ...a, vurdu: false } : a));
  assert.equal(dogrula(FILO_A, yalan), false);
  assert.deepEqual([...batanlar(kayit)], ['muhrip']);
  assert.equal(dogrula(null, kayit), false);
});

function kur() {
  let s = initialState({ players: [A, B], names: {}, kimlik: 11 });
  return s;
}
const ev = (s, intent, by) => reduce(s, toAction(intent, by, s, { kimlik: 99 }));

test('yerleşim: kural yalnız kimse hazır değilken değişir; ikisi hazır olunca başlar', () => {
  let s = kur();
  assert.equal(s.faz, 'yerlesim');
  assert.equal(s.temasYok, true);
  s = ev(s, { t: 'kural', temasYok: false }, B);
  assert.equal(s.temasYok, false);
  s = ev(s, { t: 'hazir', hazir: true }, A);
  assert.deepEqual(s.hazir, [true, false]);
  assert.equal(ev(s, { t: 'kural', temasYok: true }, A), s, 'biri hazırken kural kilitli');
  s = ev(s, { t: 'hazir', hazir: false }, A);
  assert.deepEqual(s.hazir, [false, false]);
  s = ev(s, { t: 'hazir', hazir: true }, A);
  assert.equal(ev(s, { t: 'atis', x: 0, y: 0 }, A), s, 'oyun başlamadan atış yok');
  s = ev(s, { t: 'hazir', hazir: true }, B);
  assert.equal(s.faz, 'oyun');
  assert.equal(s.sira, 0);
  assert.equal(toAction({ t: 'hazir', hazir: true }, 'yabanci', s), null);
});

test('atış akışı: sıra, bekleyen, yalnız savunan cevaplar, isabette sıra kalır, ıskada geçer', () => {
  let s = kur();
  s = ev(ev(s, { t: 'hazir', hazir: true }, A), { t: 'hazir', hazir: true }, B);
  assert.equal(ev(s, { t: 'atis', x: 1, y: 1 }, B), s, 'sıra A\'da');
  assert.equal(ev(s, { t: 'atis', x: 10, y: 1 }, A), s, 'tahta dışı');
  s = ev(s, { t: 'atis', x: 5, y: 9 }, A);
  assert.deepEqual(s.bekleyen, { idx: 0, x: 5, y: 9 });
  assert.equal(ev(s, { t: 'atis', x: 2, y: 2 }, A), s, 'sonuç gelmeden ikinci atış yok');
  assert.equal(ev(s, { t: 'sonuc', x: 5, y: 9, vurdu: true }, A), s, 'saldıran kendi sonucunu veremez');
  assert.equal(ev(s, { t: 'sonuc', x: 4, y: 9, vurdu: true }, B), s, 'başka hücre');
  s = ev(s, cevapla(s, 1, FILO_A), B);
  assert.equal(s.bekleyen, null);
  assert.deepEqual(s.atislar[0], [{ x: 5, y: 9, vurdu: true }]);
  assert.equal(s.sira, 0, 'isabet: tekrar atar');
  assert.equal(ev(s, { t: 'atis', x: 5, y: 9 }, A), s, 'aynı hücreye ikinci atış yok');
  s = ev(s, { t: 'atis', x: 6, y: 9 }, A);
  s = ev(s, cevapla(s, 1, FILO_A), B);
  assert.equal(s.atislar[0][1].batti.id, 'muhrip');
  s = ev(s, { t: 'atis', x: 9, y: 0 }, A);
  s = ev(s, cevapla(s, 1, FILO_A), B);
  assert.equal(s.atislar[0][2].vurdu, false);
  assert.equal(s.sira, 1, 'ıska: sıra geçer');
  assert.equal(cevapla(s, 1, FILO_A), null, 'bekleyen yok');
});

test('sonuç temizlenir: sahte batti ve filo süzülür', () => {
  let s = kur();
  s = ev(ev(s, { t: 'hazir', hazir: true }, A), { t: 'hazir', hazir: true }, B);
  s = ev(s, { t: 'atis', x: 0, y: 0 }, A);
  s = ev(s, { t: 'sonuc', x: 0, y: 0, vurdu: true, batti: { id: 'ucak', hucreler: [[0, 0]] } }, B);
  assert.equal(s.atislar[0][0].batti, undefined, 'boyu tutmayan batti atılır');
  s = ev(s, { t: 'atis', x: 1, y: 0 }, A);
  s = ev(s, { t: 'sonuc', x: 1, y: 0, vurdu: false, batti: { id: 'muhrip', hucreler: [[1, 0], [2, 0]] } }, B);
  assert.deepEqual(s.atislar[0][1], { x: 1, y: 0, vurdu: false }, 'ıskada batti olmaz');
});

// İki cihazı saf fonksiyonlarla oynat: her iki filo yalnız "kendi cihazında".
function tamOyun(filoA, filoB, kural = KURAL) {
  let s = kur();
  const filolar = { 0: filoA, 1: filoB };
  s = ev(s, { t: 'kural', temasYok: kural.temasYok }, A);
  s = ev(ev(s, { t: 'hazir', hazir: true }, A), { t: 'hazir', hazir: true }, B);
  const sirali = [];
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) sirali.push([x, y]);
  const kalan = { 0: sirali.slice(), 1: sirali.slice().reverse() };
  const durumlar = [];
  let guard = 0;
  while (s.faz === 'oyun' && guard++ < 500) {
    const k = s.sira;
    const [x, y] = kalan[k].shift();
    s = ev(s, { t: 'atis', x, y }, s.players[k]);
    durumlar.push(JSON.stringify(s));
    s = ev(s, cevapla(s, 1 - k, filolar[1 - k]), s.players[1 - k]);
    durumlar.push(JSON.stringify(s));
  }
  return { s, durumlar };
}

test('tam oyun: biri bitirir, skor ve kaybedenin filosu açılır; filo bitmeden durumda yok', () => {
  const fb = rastgeleFilo(mulberry32(5), KURAL);
  const { s, durumlar } = tamOyun(FILO_A, fb);
  assert.equal(s.faz, 'bitti');
  assert.ok(s.kazanan === 0 || s.kazanan === 1);
  assert.equal(s.skor[s.kazanan], 1);
  const kaybeden = 1 - s.kazanan;
  assert.ok(s.filolar[kaybeden], 'kaybedenin filosu son sonuçla açıldı');
  assert.equal(s.filolar[s.kazanan], null, 'kazananınki kendi cihazından gelecek');
  // Oyun sürerken ortak durumda hiçbir gemi konumu yok (yalnız batmış gemiler)
  for (const j of durumlar.slice(0, -1)) assert.ok(!j.includes('"yon"'), 'filo sızmamalı');
  // Kazanan filosunu yollar
  const kazananFilo = s.kazanan === 0 ? FILO_A : fb;
  const s2 = ev(s, { t: 'filo', filo: kazananFilo }, s.players[s.kazanan]);
  assert.deepEqual(s2.filolar[s.kazanan], kazananFilo);
  assert.equal(ev(s2, { t: 'filo', filo: FILO_A }, s.players[s.kazanan]), s2, 'ikinci kez yazılmaz');
  // Kayıtlar açılan filolarla tutarlı
  assert.equal(dogrula(s2.filolar[0], s2.atislar[1]), true);
  assert.equal(dogrula(s2.filolar[1], s2.atislar[0]), true);
  const r = resultOf(s2);
  assert.equal(r.kazanan, s.kazanan);
  assert.equal(r.atis.length, 2);
});

test('yeni oyun: başlayan değişir, skor kalır, atışlar ve hazırlık sıfırlanır, kimlik yenilenir', () => {
  const { s } = tamOyun(FILO_A, rastgeleFilo(mulberry32(9), KURAL));
  const y = ev(s, { t: 'yeni' }, B);
  assert.equal(y.faz, 'yerlesim');
  assert.equal(y.tur, 2);
  assert.equal(y.baslayan, 1);
  assert.equal(y.kimlik, 99);
  assert.deepEqual(y.hazir, [false, false]);
  assert.deepEqual(y.atislar, [[], []]);
  assert.deepEqual(y.filolar, [null, null]);
  assert.deepEqual(y.skor, s.skor);
  const y2 = ev(ev(y, { t: 'hazir', hazir: true }, A), { t: 'hazir', hazir: true }, B);
  assert.equal(y2.sira, 1, 'ikinci oyunda misafir başlar');
});

test('temaslı kural kapalıyken de tam oyun biter', () => {
  const fa = rastgeleFilo(mulberry32(21), { temasYok: false });
  const fb = rastgeleFilo(mulberry32(22), { temasYok: false });
  const { s } = tamOyun(fa, fb, { temasYok: false });
  assert.equal(s.faz, 'bitti');
  assert.equal(s.temasYok, false);
});
