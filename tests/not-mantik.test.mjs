import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  TUR, METIN_MAX, yazan, yon, kapaliMi, siralanmis, sonGelen, notDogrula, notVerisi, acYamasi, kisalt,
  bildirimMetni, surprizDurumu,
} from '../sayfalar/not/mantik.js';
import { SAYFALAR } from '../js/core/games.js';
import { DAHA_GRUPLARI } from '../sayfalar/daha/mantik.js';
import { YEDEK_TURLERI } from '../sayfalar/ayarlar/mantik.js';

const BEN = 'ben-1';
const O = 'o-2';
const not = (id, data, created_at, author = data.kimden) => ({ id, data, created_at, author });

test('kayıtlar: SAYFALAR "not", Konuşalım grubunda, yedekte "not"', () => {
  const s = SAYFALAR.find((x) => x.id === 'not');
  assert.equal(s.path, 'sayfalar/not/');
  assert.equal(s.title, 'Not Bırak');
  assert.ok(DAHA_GRUPLARI.find((g) => g.id === 'konusalim').uyeler.includes('not'));
  assert.ok(YEDEK_TURLERI.includes(TUR));
});

test('yazan/yon: kimden önce, yoksa author', () => {
  const a = not('a', { tur: 'yazi', metin: 'x', kimden: O }, '2026-10-31T10:00:00Z', BEN); // ben açtım: author ben
  assert.equal(yazan(a), O);
  assert.equal(yon(a, BEN), 'gelen');
  assert.equal(yon(not('b', { tur: 'yazi' }, '', BEN), BEN), 'giden');
});

test('kapaliMi: yalnız gelen + sürpriz + açılmamış', () => {
  assert.equal(kapaliMi(not('a', { tur: 'yazi', kimden: O, surpriz: true }, ''), BEN), true);
  assert.equal(kapaliMi(not('a', { tur: 'yazi', kimden: O, surpriz: true, acildi: '2026-10-31T11:00:00Z' }, ''), BEN), false);
  assert.equal(kapaliMi(not('a', { tur: 'yazi', kimden: BEN, surpriz: true }, ''), BEN), false);
  assert.equal(kapaliMi(not('a', { tur: 'yazi', kimden: O, surpriz: false }, ''), BEN), false);
});

test('siralanmis ve sonGelen: en yeni önce; sonGelen yalnız sevgiliden', () => {
  const docs = [
    not('1', { tur: 'yazi', kimden: O }, '2026-10-30T10:00:00Z'),
    not('2', { tur: 'yazi', kimden: BEN }, '2026-10-31T09:00:00Z'),
    not('3', { tur: 'foto', kimden: O }, '2026-10-31T08:00:00Z'),
  ];
  assert.deepEqual(siralanmis(docs).map((d) => d.id), ['2', '3', '1']);
  assert.equal(sonGelen(docs, BEN).id, '3');
  assert.equal(sonGelen(docs.slice(1, 2), BEN), null);
  assert.equal(sonGelen([], BEN), null);
});

test('notDogrula: yazı metin ister, çizim/fotoğraf görsel ister, uzunluk sınırı', () => {
  assert.equal(notDogrula({ tur: 'yazi', metin: 'Seni seviyorum' }), null);
  assert.match(notDogrula({ tur: 'yazi', metin: '   ' }), /kelime/);
  assert.match(notDogrula({ tur: 'yazi', metin: 'a'.repeat(METIN_MAX + 1) }), /en çok 200/);
  assert.equal(notDogrula({ tur: 'yazi', metin: '😍'.repeat(METIN_MAX) }), null); // emoji tek karakter sayılır
  assert.match(notDogrula({ tur: 'cizim' }), /çiz/);
  assert.equal(notDogrula({ tur: 'cizim', gorselVar: true }), null);
  assert.match(notDogrula({ tur: 'foto' }), /fotoğraf/);
  assert.equal(notDogrula({ tur: 'foto', metin: '', gorselVar: true }), null);
  assert.match(notDogrula({ tur: 'ses' }), /tür/);
});

test('notVerisi: alanlar kırpılır; yazı notunda foto yok; surpriz boolean', () => {
  assert.deepEqual(notVerisi({ tur: 'yazi', metin: '  merhaba  ', foto: 'local:x', surpriz: 'evet' }, { kime: O, kimden: BEN }),
    { tur: 'yazi', metin: 'merhaba', kime: O, kimden: BEN, surpriz: false });
  assert.deepEqual(notVerisi({ tur: 'foto', metin: ' ', foto: 'local:x', surpriz: true }, { kime: O, kimden: BEN }),
    { tur: 'foto', foto: 'local:x', kime: O, kimden: BEN, surpriz: true });
});

test('acYamasi: ISO acildi', () => {
  assert.deepEqual(acYamasi(new Date('2026-10-31T12:00:00Z')), { acildi: '2026-10-31T12:00:00.000Z' });
});

test('kisalt: kod noktası, boşluk sadeleşir', () => {
  assert.equal(kisalt('kısa', 10), 'kısa');
  assert.equal(kisalt('bir  iki\nüç', 20), 'bir iki üç');
  assert.equal(kisalt('abcdefghij', 5), 'abcd…');
  assert.equal([...kisalt('😍'.repeat(10), 4)].length, 4);
});

test('bildirimMetni: yazıda kısa metin, sürprizde içerik yok', () => {
  assert.deepEqual(bildirimMetni({ tur: 'yazi', metin: 'Akşam erken gel' }, 'Gül'),
    { baslik: 'Gül sana bir not bıraktı ✍️', metin: 'Akşam erken gel' });
  const s = bildirimMetni({ tur: 'yazi', metin: 'gizli söz', surpriz: true }, 'Gül');
  assert.ok(!s.metin.includes('gizli'));
  assert.match(s.metin, /Sürpriz/);
  assert.match(bildirimMetni({ tur: 'cizim' }, '').baslik, /^Sevgilin/);
  assert.match(bildirimMetni({ tur: 'foto' }, 'Ömer').metin, /fotoğraf/);
  assert.ok([...bildirimMetni({ tur: 'yazi', metin: 'x'.repeat(200) }, 'G').metin].length <= 90);
});

test('surprizDurumu', () => {
  assert.equal(surprizDurumu({ surpriz: false }), null);
  assert.equal(surprizDurumu({ surpriz: true }), 'kapali');
  assert.equal(surprizDurumu({ surpriz: true, acildi: 'x' }), 'acildi');
});
