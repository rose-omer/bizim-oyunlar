// Sevgi Dili Testi: soru dengesi, puanlama, yüzde, birincil dil, karşılaştırma, ad ekleri.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DILLER, DIL_IDS, SORULAR, dilById, dengeHatalari, puanla, yuzdeler, birincil, siralama,
  karsilastir, ilerleme, ilgiEki, oneriBasligi, gecerliPuanlar, taslakCoz,
} from '../sayfalar/sevgi-dili/mantik.js';

test('taslakCoz: bozuk ya da eksik taslak güvenle açılır', () => {
  assert.deepEqual(taslakCoz(null, 3), [null, null, null]);
  assert.deepEqual(taslakCoz('bozuk{', 3), [null, null, null]);
  assert.deepEqual(taslakCoz('["a","x","b","a"]', 3), ['a', null, 'b']);
  assert.equal(taslakCoz('[]').length, 30);
});

test('5 dil, her birinde ad, özet ve 3 öneri', () => {
  assert.deepEqual(DIL_IDS, ['soz', 'zaman', 'hediye', 'hizmet', 'dokunma']);
  assert.equal(DILLER.length, 5);
  for (const d of DILLER) {
    assert.ok(d.ad && d.ozet && d.emoji, d.id);
    assert.equal(d.oneriler.length, 3, d.id);
    assert.ok(d.oneriler.every((o) => o.trim().length > 10), d.id);
  }
  assert.equal(dilById('zaman').ad, 'Birlikte zaman');
  assert.equal(dilById('yok'), null);
});

test('30 ikili; her dil 12 kez; her dil çifti 3 kez; metinler tekil', () => {
  assert.equal(SORULAR.length, 30);
  assert.deepEqual(dengeHatalari(SORULAR), []);
});

test('dengeHatalari bozuk listeyi yakalar', () => {
  const bozuk = SORULAR.slice(0, 29).concat([{ id: 'x', a: { dil: 'soz', metin: 'a' }, b: { dil: 'soz', metin: 'b' } }]);
  const e = dengeHatalari(bozuk).join('\n');
  assert.match(e, /aynı dil/);
  assert.match(e, /12/);
});

test('puanla: seçilen dil puan alır; boş cevap sayılmaz', () => {
  const hepA = SORULAR.map(() => 'a');
  const p = puanla(SORULAR, hepA);
  assert.equal(Object.values(p).reduce((x, y) => x + y, 0), 30);
  for (const id of DIL_IDS) assert.ok(Number.isInteger(p[id]));
  const bos = puanla(SORULAR, []);
  assert.deepEqual(bos, { soz: 0, zaman: 0, hediye: 0, hizmet: 0, dokunma: 0 });
  // Her zaman "zaman"ı seçen kişi: zaman 12 puan alır.
  const zamanci = SORULAR.map((q) => (q.a.dil === 'zaman' ? 'a' : q.b.dil === 'zaman' ? 'b' : 'a'));
  assert.equal(puanla(SORULAR, zamanci).zaman, 12);
});

test('yuzdeler: toplam 100, en büyük kalan yöntemi; sıfır güvenli', () => {
  const y = yuzdeler({ soz: 10, zaman: 10, hediye: 10, hizmet: 0, dokunma: 0 });
  assert.equal(Object.values(y).reduce((a, b) => a + b, 0), 100);
  assert.deepEqual(y, { soz: 34, zaman: 33, hediye: 33, hizmet: 0, dokunma: 0 });
  assert.deepEqual(yuzdeler({ soz: 12, zaman: 9, hediye: 3, hizmet: 6, dokunma: 0 }),
    { soz: 40, zaman: 30, hediye: 10, hizmet: 20, dokunma: 0 });
  assert.deepEqual(yuzdeler({}), { soz: 0, zaman: 0, hediye: 0, hizmet: 0, dokunma: 0 });
});

test('birincil: en yüksek dil(ler); eşitlikte ikisi; sıralama büyükten küçüğe', () => {
  assert.deepEqual(birincil({ soz: 3, zaman: 9, hediye: 2, hizmet: 9, dokunma: 7 }), ['zaman', 'hizmet']);
  assert.deepEqual(birincil({ soz: 12, zaman: 0, hediye: 0, hizmet: 0, dokunma: 0 }), ['soz']);
  assert.deepEqual(birincil({}), []);
  assert.deepEqual(siralama({ soz: 3, zaman: 9, hediye: 2, hizmet: 9, dokunma: 7 }), ['zaman', 'hizmet', 'dokunma', 'soz', 'hediye']);
});

test('karsilastir: satırlar, ortak birincil, en büyük fark', () => {
  const ben = { soz: 2, zaman: 12, hediye: 4, hizmet: 6, dokunma: 6 };
  const o = { soz: 8, zaman: 10, hediye: 0, hizmet: 2, dokunma: 10 };
  const k = karsilastir(ben, o);
  assert.deepEqual(k.benBirincil, ['zaman']);
  assert.deepEqual(k.partnerBirincil, ['zaman', 'dokunma']);
  assert.deepEqual(k.ortak, ['zaman']);
  assert.equal(k.satirlar.length, 5);
  assert.equal(k.satirlar[0].dil, 'zaman', 'toplamı en yüksek önce');
  assert.equal(k.satirlar.find((s) => s.dil === 'soz').ben, 7);
  assert.equal(k.satirlar.find((s) => s.dil === 'soz').partner, 27);
  assert.equal(k.enFarkli, 'soz');
});

test('ilerleme: ilk boş soru; hepsi doluysa uzunluk', () => {
  assert.equal(ilerleme([], 30), 0);
  assert.equal(ilerleme(['a', 'b', null, 'a'], 30), 2);
  assert.equal(ilerleme(Array(30).fill('a'), 30), 30);
});

test('ilgiEki: Türkçe ilgi eki (Gül\'ün, Ömer\'in, Ayşe\'nin, Su\'yun değil Su\'nun)', () => {
  assert.equal(ilgiEki('Gül'), "Gül'ün");
  assert.equal(ilgiEki('Ömer'), "Ömer'in");
  assert.equal(ilgiEki('Can'), "Can'ın");
  assert.equal(ilgiEki('Ayşe'), "Ayşe'nin");
  assert.equal(ilgiEki('Ali'), "Ali'nin");
  assert.equal(ilgiEki('Su'), "Su'nun");
  assert.equal(ilgiEki('Doruk'), "Doruk'un");
  assert.equal(ilgiEki('Sevgilin'), 'Sevgilinin');
  assert.equal(ilgiEki(''), 'Sevgilinin');
  assert.equal(ilgiEki('  Gül  '), "Gül'ün");
});

test('oneriBasligi: "Gül\'ün dili \'Birlikte zaman\'"', () => {
  assert.equal(oneriBasligi('Gül', 'zaman'), "Gül'ün dili 'Birlikte zaman'");
  assert.equal(oneriBasligi(null, 'soz'), "Sevgilinin dili 'Sözlerle ifade'");
});

test('gecerliPuanlar: bozuk veriyi reddeder', () => {
  assert.equal(gecerliPuanlar({ soz: 1, zaman: 2, hediye: 3, hizmet: 4, dokunma: 20 }), true);
  assert.equal(gecerliPuanlar({ soz: 1 }), false);
  assert.equal(gecerliPuanlar({ soz: -1, zaman: 2, hediye: 3, hizmet: 4, dokunma: 22 }), false);
  assert.equal(gecerliPuanlar({ soz: 0, zaman: 0, hediye: 0, hizmet: 0, dokunma: 0 }), false, 'hiç cevap yoksa geçersiz');
  assert.equal(gecerliPuanlar(null), false);
});
