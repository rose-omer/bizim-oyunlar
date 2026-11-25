import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ACILISLAR, HEDEF, BITIR_EN_AZ, EN_UZUN, temizle, bitirebilir, tamMetin,
  initialState, reduce, toAction, notice, resultOf, validSaved,
} from '../games/hikaye/oyun.js';

const A = 'omer', B = 'gul';
const names = { [A]: 'Ömer', [B]: 'Gül' };
const fresh = (seed = 3) => initialState({ players: [A, B], names, now: 1, seed });
const yaz = (s, by, text, now = 5) => reduce(s, { type: 'yaz', by, text, now });
const sirayla = (s, n) => {
  let x = s;
  for (let i = 0; i < n; i++) x = yaz(x, x.players[x.turn], `Cümle ${i + 1}.`, 10 + i);
  return x;
};

test('başlangıç: tohuma göre açılış, boş hikâye, ilk yazan ilk oyuncu', () => {
  const s = fresh(3);
  assert.equal(s.kind, 'hikaye');
  assert.equal(s.acilis, 3);
  assert.equal(fresh(ACILISLAR.length + 2).acilis, 2);
  assert.deepEqual(s.parts, []);
  assert.equal(s.turn, 0);
  assert.ok(ACILISLAR.length >= 30);
  assert.ok(ACILISLAR.every((t) => t.length > 10 && t.length <= EN_UZUN));
});

test('temizle: boşluk ve kontrol karakteri gider, uzun metin kesilir, kısa metin reddedilir', () => {
  assert.equal(temizle('  Merhaba \n\t dünya  '), 'Merhaba dünya');
  assert.equal(temizle('a\u0000b'), 'a b');
  assert.equal(temizle('x'), '');
  assert.equal(temizle(''), '');
  assert.equal(temizle(42), '');
  assert.equal(temizle('a'.repeat(500)).length, EN_UZUN);
});

test('yaz: yalnız sırası gelen yazar, sıra değişir; geçersiz metin yok sayılır', () => {
  const s = fresh();
  assert.equal(yaz(s, B, 'Ben önce yazayım.'), s);
  assert.equal(yaz(s, A, '   '), s);
  const n = yaz(s, A, 'Kedi bize göz kırptı.');
  assert.deepEqual(n.parts, [{ by: 0, text: 'Kedi bize göz kırptı.' }]);
  assert.equal(n.turn, 1);
  assert.equal(n.seq, s.seq + 1);
  assert.equal(n.at, 5);
});

test('hedef cümle sayısında hikâye biter', () => {
  const s = sirayla(fresh(), HEDEF - 1);
  assert.equal(s.phase, 'play');
  const e = yaz(s, s.players[s.turn], 'Ve sonsuza dek mutlu yaşadılar.');
  assert.equal(e.phase, 'end');
  assert.deepEqual(e.result, { reason: 'hedef' });
  assert.equal(e.parts.length, HEDEF);
  assert.equal(yaz(e, e.players[e.turn], 'Bir cümle daha.'), e);
});

test('bitir: en az BITIR_EN_AZ cümleden sonra iki taraf da bitirebilir', () => {
  const az = sirayla(fresh(), BITIR_EN_AZ - 1);
  assert.equal(bitirebilir(az), false);
  assert.equal(reduce(az, { type: 'bitir', by: A, now: 9 }), az);
  const yeter = sirayla(fresh(), BITIR_EN_AZ);
  const e = reduce(yeter, { type: 'bitir', by: B, now: 9 });
  assert.equal(e.phase, 'end');
  assert.deepEqual(e.result, { reason: 'bitir', by: 1 });
  assert.equal(reduce(yeter, { type: 'bitir', by: 'yabanci', now: 9 }), yeter);
});

test('yeni hikâye: ilk yazan değişir, açılış öncekinden farklı', () => {
  const s = sirayla(fresh(5), 4);
  const n = reduce(s, { type: 'new', by: B, no: s.no, now: 20, seed: 5 });
  assert.deepEqual(n.players, [B, A]);
  assert.equal(n.no, 2);
  assert.deepEqual(n.parts, []);
  assert.notEqual(n.acilis, s.acilis, 'aynı tohum aynı açılışı vermez');
  assert.ok(n.seq > s.seq);
  assert.equal(reduce(n, { type: 'new', by: A, no: 1, now: 21, seed: 1 }), n);
});

test('toAction, kayıt denetimi, tam metin, bildirim', () => {
  const s = fresh(0);
  const o = { hostId: A, now: 3, seed: 7 };
  assert.deepEqual(toAction({ type: 'yaz', text: 'Selam.' }, B, s, o), { type: 'yaz', by: B, text: 'Selam.', now: 3 });
  assert.equal(toAction({ type: 'yaz', text: 5 }, B, s, o), null);
  assert.equal(toAction({ type: 'yaz', text: 'x'.repeat(5000) }, B, s, o).text.length, EN_UZUN * 2);
  assert.deepEqual(toAction({ type: 'new', no: 1 }, B, s, o), { type: 'new', by: B, no: 1, now: 3, seed: 7 });
  assert.equal(toAction({ type: 'load', s }, B, s, o), null);
  assert.ok(validSaved(s));
  assert.ok(!validSaved({ ...s, acilis: 999 }));
  assert.ok(!validSaved({ ...s, parts: [{ by: 2, text: 'x' }] }));
  const n = yaz(s, A, 'Kedi miyavladı.');
  assert.equal(tamMetin(n), `${ACILISLAR[0]} Kedi miyavladı.`);
  assert.deepEqual(notice(s, n, { by: A, ad: (id) => names[id] }), { baslik: 'Sıra sende', metin: `Birlikte Hikâye: Ömer bir cümle ekledi (1/${HEDEF})` });
  assert.deepEqual(resultOf(n), { reason: null, cumle: 1, no: 1, acilis: 0 });
});
