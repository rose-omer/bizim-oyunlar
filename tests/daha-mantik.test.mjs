// Daha sayfası: gruplar ve davet satırı (saf mantık).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DAHA_GRUPLARI, dahaGruplari, davetGoster, dahaAra, sonOku, sonEkle, sonSayfalar, SON_EN_COK } from '../sayfalar/daha/mantik.js';
import { SAYFALAR, SEKMELER } from '../js/core/games.js';

const s = (id) => ({ id, title: id, icon: '•', path: `sayfalar/${id}/`, desc: '' });
const idler = (gruplar) => gruplar.map((g) => [g.id, g.sayfalar.map((x) => x.id)]);

test('DAHA_GRUPLARI: dört grup, talimattaki sıra', () => {
  assert.deepEqual(DAHA_GRUPLARI.map((g) => [g.baslik, g.uyeler]), [
    ['Konuşalım', ['mektup', 'gunsorusu', 'haftalik', 'gunfoto', 'not']],
    ['Planlayalım', ['listeler', 'randevu', 'harcama', 'onun', 'cark']],
    ['Biz', ['ruh', 'sevgidili', 'yilimiz', 'sohbetozet', 'rozetler', 'skor', 'konum']],
    ['Birlikte', ['yavru', 'kupon', 'izle', 'oyunlar']],
  ]);
});

test('dahaGruplari: sekmeler ve ayarlar çıkar, haritadaki sıra korunur', () => {
  const g = dahaGruplari(SAYFALAR, SEKMELER);
  const hepsi = g.flatMap((x) => x.sayfalar.map((y) => y.id));
  for (const yok of ['biz', 'daha', 'ayarlar', 'sohbet', 'anilar', 'gunler', 'yavru']) assert.ok(!hepsi.includes(yok), yok);
  assert.deepEqual(g[0].sayfalar.map((x) => x.id), ['mektup', 'gunsorusu', 'haftalik', 'gunfoto', 'not']);
  assert.deepEqual(g[2].sayfalar.map((x) => x.id), ['ruh', 'sevgidili', 'yilimiz', 'sohbetozet', 'rozetler', 'skor', 'konum']);
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

const adlar = (l) => l.map((x) => x.id);
test('dahaAra: başlık başı, başlık içi, açıklama sırasıyla; biz ve daha çıkar, sekmeler ve Ayarlar bulunur', () => {
  assert.deepEqual(adlar(dahaAra(SAYFALAR, 'mektup')), ['mektup']);
  assert.deepEqual(adlar(dahaAra(SAYFALAR, 'ayar')), ['ayarlar']);
  assert.ok(adlar(dahaAra(SAYFALAR, 'anı')).includes('anilar'));
  assert.equal(adlar(dahaAra(SAYFALAR, 'tüm özellikler')).includes('daha'), false);
  assert.equal(adlar(dahaAra(SAYFALAR, 'ana sayfa')).includes('biz'), false);
  const l = [
    { id: 'c', title: 'Xyz', path: 'c/', desc: 'foto burada' },
    { id: 'b', title: 'Güzel foto', path: 'b/', desc: '' },
    { id: 'a', title: 'Fotoğraf', path: 'a/', desc: '' },
  ];
  assert.deepEqual(adlar(dahaAra(l, 'foto')), ['a', 'b', 'c']);
});

test('dahaAra: Türkçe harfsiz yazım, büyük harf, çok kelime; boş sorgu boş döner', () => {
  assert.deepEqual(adlar(dahaAra(SAYFALAR, 'gunun fotografi')), ['gunfoto']);
  assert.deepEqual(adlar(dahaAra(SAYFALAR, 'GÜNÜN FOTOĞRAFI')), ['gunfoto']);
  assert.equal(adlar(dahaAra(SAYFALAR, 'İZLE'))[0], 'izle');
  assert.deepEqual(dahaAra(SAYFALAR, '   '), []);
  assert.deepEqual(dahaAra(SAYFALAR, 'yokboylebirsey'), []);
  assert.deepEqual(dahaAra(null, 'a'), []);
});

test('sonOku: bozuk kayıt boş liste; yalnız metin kimlikler', () => {
  assert.deepEqual(sonOku(null), []);
  assert.deepEqual(sonOku('{bozuk'), []);
  assert.deepEqual(sonOku('{"a":1}'), []);
  assert.deepEqual(sonOku('["a",1,null,"b"]'), ['a', 'b']);
});

test('sonEkle: en yeni başa, tekrar yok, sınır korunur', () => {
  assert.deepEqual(sonEkle([], 'a'), ['a']);
  assert.deepEqual(sonEkle(['a', 'b'], 'b'), ['b', 'a']);
  let l = [];
  for (const id of ['a', 'b', 'c', 'd', 'e', 'f']) l = sonEkle(l, id);
  assert.equal(l.length, SON_EN_COK);
  assert.equal(l[0], 'f');
});

test('sonSayfalar: yalnız Daha listesindekiler, kayıt sırasıyla; silinmiş sayfa düşer', () => {
  const g = dahaGruplari(SAYFALAR, SEKMELER);
  assert.deepEqual(adlar(sonSayfalar(['konum', 'yokartik', 'anilar', 'ayarlar', 'mektup'], g)), ['konum', 'mektup']);
  assert.deepEqual(sonSayfalar([], g), []);
});
