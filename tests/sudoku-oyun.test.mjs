import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as S from '../games/sudoku/oyun.js';

const A = 'aaa'; // ev sahibi
const B = 'bbb';
const ctx = (extra = {}) => ({ hostId: A, now: 5000, seed: 4242, ...extra });
const act = (s, intent, by, extra) => {
  const a = S.toAction(intent, by, s, ctx(extra));
  return a ? S.reduce(s, a) : s;
};
const bos = () => S.initialState({ players: [A, B], names: { [A]: 'Ömer', [B]: 'Gül' }, now: 1000 });
const basla = (zorluk = 'kolay') => act(bos(), { type: 'yeni', no: 0, zorluk }, A, { now: 1000 });
const bosHucre = (s, n = 0) => {
  let k = 0;
  for (let i = 0; i < 81; i++) if (s.bulmaca[i] === '0' && k++ === n) return i;
  return -1;
};
const dogru = (s, i) => Number(s.cozum[i]);
const yanlis = (s, i) => (dogru(s, i) % 9) + 1;

test('başlangıç: zorluk seçimi fazı', () => {
  const s = bos();
  assert.equal(s.kind, 'sudoku');
  assert.equal(s.faz, 'secim');
  assert.equal(s.no, 0);
});

test('yeni: tohumlu bulmaca kurar; aynı numarayla ikinci istek yok sayılır', () => {
  const s = basla('orta');
  assert.equal(s.faz, 'oyun');
  assert.equal(s.zorluk, 'orta');
  assert.equal(s.no, 1);
  assert.equal(s.kimlik, 4242);
  assert.equal(s.bulmaca.length, 81);
  assert.equal(s.deger.length, 81);
  assert.ok(s.deger.every((d) => d === 0));
  assert.equal(s.basla, 1000);
  assert.equal(act(s, { type: 'yeni', no: 0, zorluk: 'zor' }, B), s);
  const t = act(s, { type: 'yeni', no: 1, zorluk: 'bilinmez' }, B);
  assert.equal(t.no, 2);
  assert.equal(t.zorluk, 'kolay');
  assert.equal(act(bos(), { type: 'yeni', no: 0, zorluk: 'kolay' }, 'zzz').faz, 'secim', 'yabancı açamaz');
});

test('yaz: boş hücreye yazar, ipucunun üstüne yazamaz; aynı rakam silinir', () => {
  let s = basla();
  const i = bosHucre(s);
  const ipucu = s.bulmaca.indexOf(s.bulmaca.split('').find((c) => c !== '0'));
  assert.equal(act(s, { type: 'yaz', i: ipucu, d: 1, v: 0 }, A), s);
  s = act(s, { type: 'yaz', i, d: dogru(s, i), v: 0 }, A);
  assert.equal(s.deger[i], dogru(s, i));
  assert.equal(s.son[i], 0);
  assert.equal(s.sur[i], 1);
  s = act(s, { type: 'yaz', i, d: dogru(s, i), v: 1 }, A);
  assert.equal(s.deger[i], 0, 'aynı rakam ikinci kez: siler');
  assert.equal(act(s, { type: 'yaz', i, d: 0, v: 2 }, A), s, 'geçersiz rakam');
  assert.equal(act(s, { type: 'yaz', i: 81, d: 1, v: 0 }, A), s, 'geçersiz hücre');
  assert.equal(act(s, { type: 'yaz', i, d: 3, v: 2 }, 'zzz'), s, 'oyuncu değil');
});

test('çakışma: aynı hücrede ev sahibi kazanır', () => {
  let s = basla();
  const i = bosHucre(s);
  s = act(s, { type: 'yaz', i, d: 4, v: 0 }, A); // ev sahibi yazdı: sur 1
  assert.equal(act(s, { type: 'yaz', i, d: 7, v: 0 }, B), s, 'misafirin eski sürüme dayalı yazısı reddedilir');
  const t = act(s, { type: 'yaz', i, d: 7, v: 1 }, B);
  assert.equal(t.deger[i], 7, 'güncel sürümü gören misafir yazar');
  assert.equal(t.son[i], 1);
  // misafir kendi ardışık yazılarında eski sürümle de geçer (kendi değişikliği)
  const u = act(t, { type: 'yaz', i, d: 8, v: 1 }, B);
  assert.equal(u.deger[i], 8);
  // ev sahibi eski sürümle de yazar
  const w = act(u, { type: 'yaz', i, d: 2, v: 0 }, A);
  assert.equal(w.deger[i], 2);
});

test('not: boş hücrede aday aç/kapa; dolu hücrede olmaz; yazınca notlar silinir', () => {
  let s = basla();
  const i = bosHucre(s);
  s = act(s, { type: 'not', i, d: 3, v: 0 }, B);
  s = act(s, { type: 'not', i, d: 5, v: 1 }, B);
  assert.deepEqual(S.adaylar(s.notlar[i]), [3, 5]);
  s = act(s, { type: 'not', i, d: 3, v: 2 }, B);
  assert.deepEqual(S.adaylar(s.notlar[i]), [5]);
  s = act(s, { type: 'yaz', i, d: 9, v: 3 }, B);
  assert.equal(s.notlar[i], 0);
  assert.equal(act(s, { type: 'not', i, d: 1, v: 4 }, B), s);
});

test('sil: değer ve notları temizler; boş hücrede değişiklik yok', () => {
  let s = basla();
  const i = bosHucre(s);
  assert.equal(act(s, { type: 'sil', i, v: 0 }, A), s);
  s = act(s, { type: 'yaz', i, d: 2, v: 0 }, A);
  s = act(s, { type: 'sil', i, v: 1 }, A);
  assert.equal(s.deger[i], 0);
  const j = bosHucre(s, 1);
  s = act(s, { type: 'not', i: j, d: 4, v: 0 }, A);
  s = act(s, { type: 'sil', i: j, v: 1 }, A);
  assert.equal(s.notlar[j], 0);
});

test('geri: yalnız kendi hamleni geri alır, sırayla', () => {
  let s = basla();
  const i = bosHucre(s, 0);
  const j = bosHucre(s, 1);
  s = act(s, { type: 'yaz', i, d: 5, v: 0 }, A);
  s = act(s, { type: 'yaz', j, i: j, d: 6, v: 0 }, A);
  s = act(s, { type: 'yaz', i: bosHucre(s, 2), d: 1, v: 0 }, B);
  s = act(s, { type: 'geri' }, A);
  assert.equal(s.deger[j], 0, 'son hamlem geri alındı');
  assert.equal(s.deger[bosHucre(s, 2)], 1, 'partnerin hamlesine dokunulmadı');
  s = act(s, { type: 'geri' }, A);
  assert.equal(s.deger[i], 0);
  assert.equal(act(s, { type: 'geri' }, A), s, 'geri alınacak hamle yok');
});

test('geri: partner hücreyi değiştirdiyse o hamle atlanır', () => {
  let s = basla();
  const i = bosHucre(s, 0);
  const j = bosHucre(s, 1);
  s = act(s, { type: 'yaz', i: j, d: 3, v: 0 }, B);
  s = act(s, { type: 'yaz', i, d: 3, v: 0 }, B);
  s = act(s, { type: 'yaz', i, d: 7, v: 1 }, A); // ev sahibi üstüne yazdı
  s = act(s, { type: 'geri' }, B); // B'nin son hamlesi (i) artık geçersiz → atlanır, j geri alınır
  assert.equal(s.deger[i], 7);
  assert.equal(s.deger[j], 0);
  assert.equal(s.geri[1].length, 0);
});

test('geri yığını sınırlı', () => {
  let s = basla();
  const i = bosHucre(s);
  for (let k = 0; k < S.GERI_SINIR + 10; k++) s = act(s, { type: 'not', i, d: (k % 9) + 1, v: s.sur[i] }, A);
  assert.equal(s.geri[0].length, S.GERI_SINIR);
});

test('hata sayacı: yanlış rakam yazan oyuncuya yazılır', () => {
  let s = basla();
  const i = bosHucre(s);
  s = act(s, { type: 'yaz', i, d: yanlis(s, i), v: 0 }, B);
  assert.deepEqual(s.hata, [0, 1]);
  assert.deepEqual(S.hatalilar(s), [i]);
});

test('bitiş: tüm hücreler doğruysa biter, süre kesinleşir', () => {
  let s = basla();
  let k = 0;
  for (let i = 0; i < 81; i++) {
    if (s.bulmaca[i] !== '0') continue;
    const kim = k++ % 2 ? B : A;
    s = act(s, { type: 'yaz', i, d: dogru(s, i), v: s.sur[i] }, kim, { now: 61000 });
  }
  assert.equal(s.faz, 'bitti');
  assert.equal(s.basla, null);
  assert.equal(s.sure, 60000);
  assert.equal(S.gecenSure(s, 999999), 60000);
  assert.equal(act(s, { type: 'yaz', i: bosHucre(s), d: 1, v: 9 }, A), s, 'bitince yazılmaz');
  const katki = S.katki(s);
  assert.equal(katki[0] + katki[1], 81 - S.ipucuSayisi(s.bulmaca));
});

test('bitiş: son yanlışı geri almak bulmacayı tamamlarsa biter', () => {
  let s = basla();
  const x = bosHucre(s);
  s = act(s, { type: 'yaz', i: x, d: dogru(s, x), v: 0 }, A, { now: 2000 });
  s = act(s, { type: 'yaz', i: x, d: yanlis(s, x), v: 1 }, A, { now: 3000 });
  for (let i = 0; i < 81; i++) {
    if (s.bulmaca[i] !== '0' || i === x) continue;
    s = act(s, { type: 'yaz', i, d: dogru(s, i), v: s.sur[i] }, B, { now: 4000 });
  }
  assert.equal(s.faz, 'oyun');
  s = act(s, { type: 'geri' }, A, { now: 11000 });
  assert.equal(s.deger[x], dogru(s, x));
  assert.equal(s.faz, 'bitti');
  assert.equal(s.sure, 10000);
  assert.equal(s.basla, null);
});

test('bitiş: dolu ama yanlışsa sürer', () => {
  let s = basla();
  const ilk = bosHucre(s);
  for (let i = 0; i < 81; i++) {
    if (s.bulmaca[i] !== '0') continue;
    s = act(s, { type: 'yaz', i, d: i === ilk ? yanlis(s, i) : dogru(s, i), v: s.sur[i] }, A);
  }
  assert.equal(s.faz, 'oyun');
  assert.ok(S.doluMu(s));
});

test('süre: oturum önceki oturumu son hamleye kadar sayar', () => {
  let s = basla(); // basla = 1000
  s = act(s, { type: 'yaz', i: bosHucre(s), d: 1, v: 0 }, A, { now: 31000 }); // at = 31000
  assert.equal(S.gecenSure(s, 41000), 40000);
  const t = act(s, { type: 'oturum' }, A, { now: 900000 }); // yeni oturum (ertesi gün)
  assert.equal(t.sure, 30000, 'boşta geçen süre sayılmaz');
  assert.equal(t.basla, 900000);
  assert.equal(S.gecenSure(t, 905000), 35000);
  assert.equal(act(s, { type: 'oturum' }, B), s, 'yalnız ev sahibi');
});

test('seat ve load', () => {
  const s = S.initialState({ players: [A, '?'], names: {}, now: 1 });
  const t = S.reduce(s, S.toAction({ type: 'seat', ids: [A, B], names: { [B]: 'Gül' } }, A, s, ctx()));
  assert.deepEqual(t.players, [A, B]);
  assert.equal(S.toAction({ type: 'seat', ids: [A, B] }, B, s, ctx()), null);
  const n = { ...t, seq: t.seq + 3 };
  assert.equal(S.reduce(t, { type: 'load', s: n }), n);
  assert.equal(S.reduce(t, { type: 'load', s: { ...n, kind: 'dama' } }), t);
});

test('tek kişilik: oyuncu dizisi tek', () => {
  let s = S.initialState({ players: [A], names: {}, now: 1 });
  s = act(s, { type: 'yeni', no: 0, zorluk: 'kolay' }, A);
  const i = bosHucre(s);
  s = act(s, { type: 'yaz', i, d: 2, v: 0 }, A);
  assert.equal(s.deger[i], 2);
  s = act(s, { type: 'geri' }, A);
  assert.equal(s.deger[i], 0);
});

test('gecerliKayit ve resultOf', () => {
  const s = basla();
  assert.equal(S.gecerliKayit(s), true);
  assert.equal(S.gecerliKayit({ kind: 'sudoku', v: 1, players: [A, B], faz: 'oyun', bulmaca: 'x' }), false);
  assert.equal(S.gecerliKayit(null), false);
  const r = S.resultOf(s);
  assert.equal(r.zorluk, 'kolay');
  assert.equal(typeof r.sure, 'number');
});

test('kalanSayilar: her rakamdan kaç tane eksik', () => {
  const s = basla();
  const k = S.kalanSayilar(s);
  assert.equal(k.length, 10);
  const toplam = k.slice(1).reduce((a, b) => a + b, 0);
  assert.equal(toplam, 81 - S.ipucuSayisi(s.bulmaca));
});
