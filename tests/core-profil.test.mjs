import { test } from 'node:test';
import assert from 'node:assert/strict';
import { yamaOf } from '../js/core/profil.js';

test('yamaOf: undefined alan null olur (silme), diğerleri aynen', () => {
  assert.deepEqual(yamaOf({ bulusma: undefined, bulusmaNotu: null, baslangic: '2025-02-14' }),
    { bulusma: null, bulusmaNotu: null, baslangic: '2025-02-14' });
  assert.deepEqual(JSON.parse(JSON.stringify(yamaOf({ kapak: undefined }))), { kapak: null });
  assert.deepEqual(yamaOf(null), {});
});
