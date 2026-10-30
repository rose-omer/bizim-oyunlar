import { test } from 'node:test';
import assert from 'node:assert/strict';
import { siraPartnere, UNKNOWN } from '../games/dama/kayit.js';

const ME = 'omer', P = 'gul';

test('siraPartnere: sıra benden partnere geçince true', () => {
  assert.equal(siraPartnere(ME, P, ME), true);
});

test('siraPartnere: sıra bana geçince ya da değişmeyince false (bildirimi öbür cihaz yollar)', () => {
  assert.equal(siraPartnere(P, ME, ME), false);
  assert.equal(siraPartnere(P, P, ME), false);
  assert.equal(siraPartnere(ME, ME, ME), false);
});

test('siraPartnere: oyun başında sıra partnerdeyse true; sıra yoksa false', () => {
  assert.equal(siraPartnere(null, P, ME), true);
  assert.equal(siraPartnere(ME, null, ME), false);
  assert.equal(siraPartnere(null, null, ME), false);
});

test('siraPartnere: yer tutucu koltuğa bildirim yok', () => {
  assert.equal(siraPartnere(ME, UNKNOWN, ME), false);
});
