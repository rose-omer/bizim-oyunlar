import { test } from 'node:test';
import assert from 'node:assert/strict';
import { W, H, PW, PADX, PADY, PH, D, relOf, colX, isTop, stackY, diceView, dieSvg, boardSvg } from '../games/tavla/tahta.js';
import { initialState, reduce, BAR, OFF } from '../games/tavla/oyun.js';

test('relOf kendi tersidir; oyuncu 1 için tahta döner', () => {
  for (let i = 0; i < 24; i++) {
    assert.equal(relOf(relOf(i, 1), 1), i);
    assert.equal(relOf(i, 0), i);
  }
  assert.equal(relOf(0, 1), 23);
});

test('her hanenin sütunu farklı ve tahtanın içinde; alt/üst yarı doğru', () => {
  const seen = new Set();
  for (let r = 0; r < 24; r++) {
    const x = colX(r);
    assert.ok(x >= PADX && x + PW <= W - PADX, `hane ${r}`);
    seen.add(`${x}:${isTop(r)}`);
  }
  assert.equal(seen.size, 24);
  assert.ok(colX(0) > colX(5), 'iç bölge sağdan sola');
  assert.ok(colX(23) > colX(18));
  assert.ok(colX(6) > colX(11));
});

test('pul yığını hane içinde kalır (15 pula kadar sıkışır)', () => {
  for (const top of [true, false]) {
    for (let n = 1; n <= 15; n++) {
      for (let k = 0; k < n; k++) {
        const y = stackY(k, n, top);
        if (top) assert.ok(y - D / 2 >= PADY - 0.01 && y + D / 2 <= PADY + PH + 0.01);
        else assert.ok(y + D / 2 <= H - PADY + 0.01 && y - D / 2 >= H - PADY - PH - 0.01);
      }
    }
  }
});

test('diceView: kullanılan zarlar ve çift zarın kalanı', () => {
  assert.deepEqual(diceView({ dice: [6, 3], left: [3], phase: 'move' }).dice, [{ v: 6, used: true }, { v: 3, used: false }]);
  assert.deepEqual(diceView({ dice: [4, 4], left: [4, 4, 4], phase: 'move' }), { dice: [{ v: 4, used: false }, { v: 4, used: false }], extra: 3 });
  assert.deepEqual(diceView({ dice: [4, 4], left: [4], phase: 'move' }).dice.map((d) => d.used), [true, false]);
  assert.deepEqual(diceView({ dice: null }), { dice: [], extra: 0 });
  assert.equal((dieSvg(5, 10, 10).match(/<circle/g) || []).length, 5);
});

test('boardSvg: 24 hane, 30 pul, bar ve toplama; bakan oyuncuya göre etiket', () => {
  const s = reduce(initialState({ players: ['a', 'b'] }), { type: 'match', by: 'a', target: 5, seed: 9 });
  const labels = [];
  const svg = boardSvg(s, { seat: 1, me: 'b', movable: new Set(), targets: new Map(), last: { from: new Set(), to: new Set() }, labels: (k) => { labels.push(k); return `L${k}`; } });
  assert.equal((svg.match(/class="tv-pt/g) || []).length, 24);
  assert.equal((svg.match(/class="tv-ck /g) || []).length, 30);
  assert.ok(svg.includes(`data-k="${BAR}"`) && svg.includes(`data-k="${OFF}"`));
  assert.ok(labels.includes(BAR) && labels.includes(OFF));
  assert.ok(svg.startsWith('<svg') && svg.endsWith('</svg>'));
  // Seçim ve hedef işaretleri
  const t = boardSvg({ ...s, phase: 'move', dice: [3, 1], left: [3, 1] }, { seat: 0, me: 'a', sel: 7, movable: new Set([7]), targets: new Map([[4, false]]), last: { from: new Set(), to: new Set() }, labels: () => '<x>' });
  assert.ok(t.includes('is-sel'));
  assert.ok(t.includes('tv-ghost'));
  assert.ok(!t.includes('<x>'), 'etiket kaçışlanır');
});
