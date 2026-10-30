import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fotoMu, secilecekDosyalar, hataMetni, fotoYukle } from '../js/core/foto.js';
import { PhotoError } from '../games/yapboz/image.js';

const dosya = (name, type = '') => ({ name, type, size: 10 });

test('fotoMu: tür ya da uzantı; HEIC dahil', () => {
  assert.equal(fotoMu(dosya('a.jpg', 'image/jpeg')), true);
  assert.equal(fotoMu(dosya('IMG_1.HEIC')), true);
  assert.equal(fotoMu(dosya('foto.webp')), true);
  assert.equal(fotoMu(dosya('not.pdf', 'application/pdf')), false);
  assert.equal(fotoMu(null), false);
});

test('secilecekDosyalar: fotoğraf olmayanı atlar, sınırı uygular', () => {
  const files = [dosya('1.jpg', 'image/jpeg'), dosya('x.txt', 'text/plain'), dosya('2.png', 'image/png'), dosya('3.jpg', 'image/jpeg')];
  const r = secilecekDosyalar(files, 2);
  assert.deepEqual(r.secilen.map((f) => f.name), ['1.jpg', '2.png']);
  assert.equal(r.atlanan, 1);
  assert.equal(r.fazla, 1);
  assert.deepEqual(secilecekDosyalar(null).secilen, []);
  assert.equal(secilecekDosyalar(files, -3).secilen.length, 0);
});

test('hataMetni: PhotoError metni korunur; HEIC açıklaması; bilinmeyen hata Türkçe', () => {
  assert.equal(hataMetni(new PhotoError('Bu fotoğraf çok küçük.')), 'Bu fotoğraf çok küçük.');
  assert.match(hataMetni(new Error('x'), dosya('a.heic')), /HEIC/);
  assert.match(hataMetni(new Error('Fotoğraf yüklenemedi: kota')), /kota/);
  assert.match(hataMetni(new TypeError('Failed to fetch')), /Bağlantını/);
});

test('fotoYukle: hiç fotoğraf yoksa Türkçe hata fırlatır', async () => {
  await assert.rejects(fotoYukle('oda', []), /seçilmedi/);
  await assert.rejects(fotoYukle('oda', [dosya('a.pdf', 'application/pdf')]), /fotoğraf değil/);
  await assert.rejects(fotoYukle('oda', [dosya('a.jpg', 'image/jpeg')], { enFazla: 0 }), /sınırı/);
});
