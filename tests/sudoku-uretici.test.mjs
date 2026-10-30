import { test } from 'node:test';
import assert from 'node:assert/strict';
import { uret, cozumSay, coz, tekliklerleCoz, cakisanlar, ZORLUKLAR, ipucuSayisi } from '../games/sudoku/uretici.js';

const dizi = (s) => [...s].map(Number);
// Bilinen tek çözümlü bulmaca ve çözümü
const BULMACA = '530070000600195000098000060800060003400803001700020006060000280000419005000080079';
const COZUM = '534678912672195348198342567859761423426853791713924856961537284287419635345286179';

test('cozumSay: tek çözümlü bulmaca 1, boş tahta sınıra kadar sayar, çelişkili 0', () => {
  assert.equal(cozumSay(dizi(BULMACA)), 1);
  assert.equal(cozumSay(Array(81).fill(0)), 2, 'varsayılan sınır 2');
  assert.equal(cozumSay(Array(81).fill(0), 5), 5);
  const bozuk = dizi(BULMACA);
  bozuk[2] = 5; // aynı satırda iki 5
  assert.equal(cozumSay(bozuk), 0);
});

test('cozumSay: birkaç ipucu silinince çoklu çözüm', () => {
  const g = dizi(COZUM);
  // aynı iki satır ve iki sütunda dikdörtgen: 4 hücre boşalınca iki çözüm olur
  // satır 0 ve 1, sütun 0 ve 1? değerler (5,3)/(6,7) değil; uygun dikdörtgeni ara
  let bulundu = false;
  for (let r1 = 0; r1 < 9 && !bulundu; r1++) for (let r2 = r1 + 1; r2 < 9 && !bulundu; r2++) {
    if (Math.floor(r1 / 3) !== Math.floor(r2 / 3)) continue;
    for (let c1 = 0; c1 < 9 && !bulundu; c1++) for (let c2 = c1 + 1; c2 < 9 && !bulundu; c2++) {
      const a = g[r1 * 9 + c1], b = g[r1 * 9 + c2];
      if (g[r2 * 9 + c1] === b && g[r2 * 9 + c2] === a) {
        const h = g.slice();
        for (const i of [r1 * 9 + c1, r1 * 9 + c2, r2 * 9 + c1, r2 * 9 + c2]) h[i] = 0;
        assert.equal(cozumSay(h), 2);
        bulundu = true;
      }
    }
  }
  assert.ok(bulundu, 'test için dikdörtgen bulundu');
});

test('coz: çözümü bulur, girdiyi değiştirmez', () => {
  const g = dizi(BULMACA);
  const kopya = g.slice();
  assert.equal(coz(g).join(''), COZUM);
  assert.deepEqual(g, kopya);
  const bozuk = dizi(BULMACA);
  bozuk[2] = 5;
  assert.equal(coz(bozuk), null);
});

test('tekliklerleCoz: kolay bulmacayı tekliklerle çözer, takılırsa null', () => {
  assert.equal(tekliklerleCoz(dizi(BULMACA))?.join(''), COZUM);
  assert.equal(tekliklerleCoz(Array(81).fill(0)), null);
});

test('cakisanlar: satır, sütun ve kutu çakışmaları', () => {
  const g = Array(81).fill(0);
  g[0] = 4; g[8] = 4; // satır
  g[40] = 7; g[76] = 7; // sütun 4
  g[30] = 2; g[50] = 2; // kutu 4 (satır 3 sütun 3, satır 5 sütun 5)
  const c = cakisanlar(g);
  assert.deepEqual([...c].sort((a, b) => a - b), [0, 8, 30, 40, 50, 76]);
  assert.equal(cakisanlar(dizi(COZUM)).size, 0);
});

test('uret: tohumlu; aynı tohum aynı bulmaca, farklı tohum farklı', () => {
  const a = uret(12345, 'kolay');
  const b = uret(12345, 'kolay');
  const c = uret(54321, 'kolay');
  assert.equal(a.bulmaca, b.bulmaca);
  assert.equal(a.cozum, b.cozum);
  assert.notEqual(a.bulmaca, c.bulmaca);
});

test('uret: her zorlukta tek çözüm, çözüm geçerli ve bulmacayla uyumlu', () => {
  for (const z of Object.keys(ZORLUKLAR)) {
    for (const seed of [1, 2, 3]) {
      const { bulmaca, cozum } = uret(seed, z);
      assert.equal(bulmaca.length, 81);
      assert.match(bulmaca, /^[0-9]{81}$/);
      assert.match(cozum, /^[1-9]{81}$/);
      assert.equal(cakisanlar(dizi(cozum)).size, 0, `${z}/${seed} çözüm geçerli`);
      for (let i = 0; i < 81; i++) if (bulmaca[i] !== '0') assert.equal(bulmaca[i], cozum[i]);
      assert.equal(cozumSay(dizi(bulmaca)), 1, `${z}/${seed} tek çözüm`);
      assert.equal(coz(dizi(bulmaca)).join(''), cozum);
    }
  }
});

test('uret: zorluk ipucu sayısıyla kademelenir; kolay ve orta tekliklerle çözülür', () => {
  const ort = (z) => [11, 22, 33].reduce((n, s) => n + ipucuSayisi(uret(s, z).bulmaca), 0) / 3;
  const kolay = ort('kolay');
  const orta = ort('orta');
  const zor = ort('zor');
  assert.ok(kolay > orta && orta > zor, `${kolay} > ${orta} > ${zor}`);
  assert.ok(kolay <= ZORLUKLAR.kolay.ipucu + 1);
  for (const s of [11, 22]) {
    assert.ok(tekliklerleCoz(dizi(uret(s, 'kolay').bulmaca)), 'kolay tekliklerle çözülür');
    assert.ok(tekliklerleCoz(dizi(uret(s, 'orta').bulmaca)), 'orta tekliklerle çözülür');
  }
});

test('uret: bilinmeyen zorluk kolay sayılır; makul sürede', () => {
  const t0 = Date.now();
  const x = uret(7, 'bilinmez');
  assert.equal(x.zorluk, 'kolay');
  uret(8, 'zor');
  assert.ok(Date.now() - t0 < 4000, 'üretim hızlı');
});
