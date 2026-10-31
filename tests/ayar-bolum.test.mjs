// Ayarlar: katlanır bölümlerin açık/kapalı durumu (saf).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { K_ACIK_BOLUMLER, acikBolumler, acikGuncelle } from '../sayfalar/ayarlar/mantik.js';

test('acikBolumler: varsayılan Profilim açık; bozuk değer varsayılana düşer', () => {
  assert.equal(K_ACIK_BOLUMLER, 'bizim.ayarlar.acik');
  assert.deepEqual(acikBolumler(null), ['profil']);
  assert.deepEqual(acikBolumler('bozuk{'), ['profil']);
  assert.deepEqual(acikBolumler('{"a":1}'), ['profil']);
  assert.deepEqual(acikBolumler('[]'), []); // kullanıcı hepsini kapattıysa kapalı kalır
  assert.deepEqual(acikBolumler('["kilit","cihaz","kilit",3,"<x>"]'), ['kilit', 'cihaz']);
});

test('acikGuncelle: ekler, çıkarır, tekrar etmez', () => {
  assert.deepEqual(acikGuncelle(['profil'], 'kilit', true), ['profil', 'kilit']);
  assert.deepEqual(acikGuncelle(['profil', 'kilit'], 'kilit', true), ['profil', 'kilit']);
  assert.deepEqual(acikGuncelle(['profil', 'kilit'], 'profil', false), ['kilit']);
  assert.deepEqual(acikGuncelle(null, 'oda', true), ['oda']);
});
