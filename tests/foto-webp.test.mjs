import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fotoUzantisi, isAllowedPhotoUrl } from '../js/core/storage.js';
import { yolGecerli } from '../supabase/functions/_shared/medya.js';
import { WEBP_KALITE, webpUygunMu } from '../js/core/foto.js';
import { MAX_BYTES } from '../games/yapboz/image.js';

test('fotoUzantisi: WebP → webp, diğerleri jpg (eski yol)', () => {
  assert.equal(fotoUzantisi('image/webp'), 'webp');
  assert.equal(fotoUzantisi('image/jpeg'), 'jpg');
  assert.equal(fotoUzantisi(''), 'jpg');
  assert.equal(fotoUzantisi(undefined), 'jpg');
});

test('webpUygunMu: yalnız gerçekten WebP kodlanmış ve sınır içindeyse', () => {
  assert.equal(WEBP_KALITE, 0.82);
  assert.equal(webpUygunMu(new Blob(['x'], { type: 'image/webp' })), true);
  // WebP yazamayan tarayıcı (Safari) PNG döner
  assert.equal(webpUygunMu(new Blob(['x'], { type: 'image/png' })), false);
  assert.equal(webpUygunMu(new Blob([], { type: 'image/webp' })), false);
  assert.equal(webpUygunMu(new Blob([new Uint8Array(11)], { type: 'image/webp' }), 10), false);
  assert.equal(webpUygunMu(null), false);
  assert.ok(MAX_BYTES < 5 * 1024 * 1024);
});

test('isAllowedPhotoUrl: .webp ve eski .jpg adresleri birlikte çalışır', () => {
  const base = 'https://abcd.supabase.co';
  const pub = `${base}/storage/v1/object/public/photos/abcdefghij/0f8e2a1c-1b2d-4c3e-8f9a-0123456789ab`;
  assert.equal(isAllowedPhotoUrl(`${pub}.webp`, base, 'photos'), true);
  assert.equal(isAllowedPhotoUrl(`${pub}.jpg`, base, 'photos'), true);
  assert.equal(isAllowedPhotoUrl(`${pub}.webp?x=1`, base, 'photos'), false);
});

test('schema.sql §3: kova türleri ve yükleme yolu storage.js ile uyumlu', () => {
  const sql = readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8');
  const bolum = sql.slice(sql.indexOf('-- 3. Fotoğraf kovası'), sql.indexOf('-- 4. Çift verisi'));
  for (const tur of ['image/jpeg', 'image/webp', 'image/png', 'audio/webm', 'audio/mp4']) {
    assert.ok(bolum.includes(`'${tur}'`), `${tur} kovada izinli olmalı`);
  }
  const uuid = '0f8e2a1c-1b2d-4c3e-8f9a-0123456789ab';
  for (const uz of ['jpg', 'webp', 'webm', 'm4a']) assert.ok(yolGecerli(`abcdefghij/${uuid}.${uz}`), uz);
  for (const kotu of [`abcdefghij/${uuid}.png`, `abcdefghij/${uuid}.webm.exe`, `x/${uuid}.jpg`, `abcdefghij/${uuid}.jpgx`]) {
    assert.equal(yolGecerli(kotu), false, kotu);
  }
});
