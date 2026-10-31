// Daha sayfası: gruplar ve davet satırı (saf mantık).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DAHA_GRUPLARI, dahaGruplari, davetGoster } from '../sayfalar/daha/mantik.js';
import { SAYFALAR, SEKMELER } from '../js/core/games.js';

const s = (id) => ({ id, title: id, icon: '•', path: `sayfalar/${id}/`, desc: '' });
const idler = (gruplar) => gruplar.map((g) => [g.id, g.sayfalar.map((x) => x.id)]);

test('DAHA_GRUPLARI: dört grup, talimattaki sıra', () => {
  assert.deepEqual(DAHA_GRUPLARI.map((g) => [g.baslik, g.uyeler]), [
    ['Konuşalım', ['mektup', 'gunsorusu', 'haftalik', 'gunfoto', 'not']],
    ['Planlayalım', ['listeler', 'randevu', 'harcama', 'onun', 'cark']],
    ['Biz', ['ruh', 'sevgidili', 'yilimiz', 'rozetler', 'skor', 'konum']],
    ['Birlikte', ['yavru', 'kupon', 'izle', 'oyunlar']],
  ]);
});

test('dahaGruplari: sekmeler ve ayarlar çıkar, haritadaki sıra korunur', () => {
  const g = dahaGruplari(SAYFALAR, SEKMELER);
  const hepsi = g.flatMap((x) => x.sayfalar.map((y) => y.id));
  for (const yok of ['biz', 'daha', 'ayarlar', 'sohbet', 'anilar', 'gunler']) assert.ok(!hepsi.includes(yok), yok);
  assert.deepEqual(g[0].sayfalar.map((x) => x.id), ['mektup', 'gunsorusu', 'haftalik', 'gunfoto', 'not']);
  assert.deepEqual(g[2].sayfalar.map((x) => x.id), ['ruh', 'sevgidili', 'yilimiz', 'rozetler', 'skor', 'konum']);
  // Bu daldaki kayıtta her sayfa bir gruba düşer: "Diğer" yok.
  assert.ok(!g.some((x) => x.id === 'diger'));
});

test('dahaGruplari: haritada olmayan sayfa "Diğer"e düşer (kayıt sırasıyla)', () => {
  const kayit = [s('biz'), s('yeni1'), s('izle'), s('yeni2'), s('oyunlar'), s('yeni3'), s('ayarlar'), s('mektup')];
  assert.deepEqual(idler(dahaGruplari(kayit, ['biz'])), [
    ['konusalim', ['mektup']],
    ['birlikte', ['izle', 'oyunlar']],
    ['diger', ['yeni1', 'yeni2', 'yeni3']],
  ]);
  const diger = dahaGruplari(kayit, ['biz']).at(-1);
  assert.equal(diger.baslik, 'Diğer');
});

test('dahaGruplari: boş grup gösterilmez; bozuk girdi atlanır', () => {
  assert.deepEqual(dahaGruplari(null), []);
  assert.deepEqual(dahaGruplari([null, { id: 'x' }, s('skor')]).map((g) => g.id), ['biz']);
});

test('davetGoster: yalnız sevgili henüz yokken', () => {
  assert.equal(davetGoster(null, null), true);
  assert.equal(davetGoster({ clientId: 'a', name: 'Gül' }, null), false);
  assert.equal(davetGoster(null, { clientId: 'a', ad: 'Gül' }), false);
  assert.equal(davetGoster({}, {}), true);
});
