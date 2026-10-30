import { test } from 'node:test';
import assert from 'node:assert/strict';
import { yildizYamasi, ozet } from '../sayfalar/sohbet/mantik.js';

test('yıldız yaması: yalnız kendi alanım; ikinci basış kaldırır; eski belgede gönderen korunur', () => {
  const d = (yildiz, kimden = 'a') => ({ id: 'm', author: 'b', data: { metin: 'x', kimden, ...(yildiz ? { yildiz } : {}) } });
  assert.deepEqual(yildizYamasi(d(undefined), 'a'), { 'yildiz.a': true });
  assert.deepEqual(yildizYamasi(d({ b: true }), 'a'), { 'yildiz.a': true }); // partnerinkine dokunmaz
  assert.deepEqual(yildizYamasi(d({ a: true, b: true }), 'a'), { 'yildiz.a': null }); // kaldır
  assert.deepEqual(yildizYamasi({ id: 'm', author: 'a', data: { metin: 'x' } }, 'b'), { 'yildiz.b': true, kimden: 'a' });
});

test('özet: sesli mesaj', () => {
  assert.equal(ozet({ ses: { url: 'local:1', sure: 7, tur: 'audio/webm' } }), '🎤 Sesli mesaj (0:07)');
  assert.equal(ozet({ ses: { url: 'local:1', sure: 75 } }), '🎤 Sesli mesaj (1:15)');
  assert.equal(ozet({ ses: { url: 'local:1' } }), '🎤 Sesli mesaj');
});
