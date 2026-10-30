import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mipLevel, firstLive } from '../games/yapboz/board.js';

test('mipLevel: drawn scale stays in [1/2, 1) and the level is clamped', () => {
  // texel / k = source px per device px; level halves it until it is below 2.
  assert.equal(mipLevel(1, 1, 4), 0); // 1:1
  assert.equal(mipLevel(1, 2, 4), 0); // zoomed in: never below level 0
  assert.equal(mipLevel(1, 0.6, 4), 0); // drawn at 0.6: still level 0
  assert.equal(mipLevel(1, 0.5, 4), 1); // exactly half: half-size copy at 1:1
  assert.equal(mipLevel(1, 0.3, 4), 1);
  assert.equal(mipLevel(1, 0.2, 4), 2);
  assert.equal(mipLevel(1.1, 0.25, 4), 2);
  assert.equal(mipLevel(1, 0.01, 4), 3); // clamped to the smallest copy
  for (const [texel, k] of [[1.1, 0.7], [1.1, 0.4], [1.1, 0.2], [2, 0.3], [0.8, 0.15]]) {
    const lv = mipLevel(texel, k, 8);
    const drawn = k / (texel / 2 ** lv); // device px per source px of that level
    assert.ok(drawn >= 0.5 && drawn < 1 + 1e-9, `${texel}/${k}: level ${lv} drawn at ${drawn}`);
  }
});

test('mipLevel: bad input falls back to level 0', () => {
  assert.equal(mipLevel(1, 0, 4), 0);
  assert.equal(mipLevel(0, 1, 4), 0);
  assert.equal(mipLevel(1, NaN, 4), 0);
  assert.equal(mipLevel(1, 0.1, 1), 0);
});

test('firstLive: index of the first moving group in z order, else the order length', () => {
  const order = [4, 0, 7, 2, 9];
  assert.equal(firstLive(order, () => false), 5);
  assert.equal(firstLive(order, (id) => id === 9), 4); // usual case: the dragged group is on top
  assert.equal(firstLive(order, (id) => id === 7 || id === 9), 2);
  assert.equal(firstLive(order, (id) => id === 4), 0);
  assert.equal(firstLive([], () => true), 0);
});
