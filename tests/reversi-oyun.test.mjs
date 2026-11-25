import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  startBoard, flipsFor, legalMoves, counts, sqName,
  initialState, reduce, toAction, notice, resultOf, validSaved,
} from '../games/reversi/oyun.js';

const A = 'omer', B = 'gul';
const names = { [A]: 'Ömer', [B]: 'Gül' };
const fresh = () => initialState({ players: [A, B], names, now: 1 });
const mv = (s, by, sq, now = 5) => reduce(s, { type: 'move', by, sq, now });
const sq = (n) => (Number(n[1]) - 1) * 8 + 'abcdefgh'.indexOf(n[0]);

test('başlangıç: ortada dört taş, koyu başlar, dört yasal hamle', () => {
  const s = fresh();
  assert.equal(s.kind, 'reversi');
  assert.deepEqual(counts(s.board), [2, 2]);
  assert.equal(s.turn, 0);
  assert.deepEqual(legalMoves(s.board, 0).map(sqName).sort(), ['c4', 'd3', 'e6', 'f5']);
  assert.equal(sqName(sq('e6')), 'e6');
});

test('hamle sıkışan taşları çevirir, sıra geçer', () => {
  const s = mv(fresh(), A, sq('d3'));
  assert.deepEqual(s.last.flips.map(sqName), ['d4']);
  assert.deepEqual(counts(s.board), [4, 1]);
  assert.equal(s.turn, 1);
  assert.equal(s.seq, fresh().seq + 1);
});

test('geçersiz hamle, dolu kare ve yanlış sıra yok sayılır', () => {
  const s = fresh();
  assert.equal(mv(s, A, sq('a1')), s);
  assert.equal(mv(s, A, sq('d4')), s);
  assert.equal(mv(s, B, sq('d3')), s);
  assert.equal(mv(s, A, 64), s);
  assert.equal(mv(s, A, 1.5), s);
  assert.deepEqual(flipsFor(s.board, 0, -1), []);
});

test('birden çok yönde çevirir', () => {
  const b = new Array(64).fill(-1);
  b[sq('a1')] = 0; b[sq('b1')] = 1; b[sq('a2')] = 1; b[sq('b2')] = 1; b[sq('c3')] = 0; b[sq('a3')] = 0;
  // c1: batıda b1 (a1 koyu), kuzeybatıda b2 (a3 koyu) sıkışır; a2 sıkışmaz.
  assert.deepEqual(flipsFor(b, 0, sq('c1')).map(sqName).sort(), ['b1', 'b2']);
  const b2 = new Array(64).fill(-1);
  b2[sq('d4')] = 1; b2[sq('c4')] = 0; b2[sq('d5')] = 1; b2[sq('d6')] = 0; b2[sq('e5')] = 1; b2[sq('f6')] = 0;
  assert.deepEqual(flipsFor(b2, 0, sq('d4')), []);
  b2[sq('d4')] = -1; b2[sq('e4')] = 1; b2[sq('f4')] = 0;
  assert.deepEqual(flipsFor(b2, 0, sq('d4')).map(sqName).sort(), ['d5', 'e4', 'e5']);
});

test('iki tarafın da hamlesi yoksa oyun biter', () => {
  // Koyu c1'e koyunca açığın taşı kalmaz; kimse oynayamaz.
  const b = new Array(64).fill(-1);
  b[sq('a1')] = 0; b[sq('b1')] = 1;
  const s = mv({ ...fresh(), board: b }, A, sq('c1'));
  assert.equal(s.phase, 'end');
  assert.deepEqual(s.result, { winner: 0, reason: 'bitti' });
  assert.equal(s.tally[A], 1);
});

test('rakibin hamlesi yoksa pas: sıra aynı oyuncuda kalır', () => {
  const p = new Array(64).fill(-1);
  p[sq('a1')] = 0; p[sq('b1')] = 1; // koyu c1 → b1 döner
  p[sq('h8')] = 0; p[sq('h7')] = 1; // açık h7'nin hamlesi yok; koyu h6'ya oynayabilir
  const t = mv({ ...fresh(), board: p }, A, sq('c1'));
  assert.deepEqual(legalMoves(t.board, 1), [], 'açığın hamlesi yok');
  assert.ok(legalMoves(t.board, 0).length > 0, 'koyunun hamlesi var');
  assert.equal(t.turn, 0);
  assert.equal(t.last.pass, 1);
  assert.equal(t.phase, 'play');
});

test('teslim, rövanş, renk değişimi', () => {
  const s = mv(fresh(), A, sq('d3'));
  const r = reduce(s, { type: 'resign', by: A, now: 9 });
  assert.deepEqual(r.result, { winner: 1, reason: 'teslim' });
  assert.equal(r.tally[B], 1);
  const n = reduce(r, { type: 'new', by: A, no: r.no, now: 10 });
  assert.deepEqual(n.players, [B, A]);
  assert.deepEqual(n.board, startBoard());
  assert.equal(reduce(n, { type: 'new', by: B, no: 1, now: 11 }), n);
});

test('toAction, kayıt denetimi, bildirim, sonuç', () => {
  const s = fresh();
  const o = { hostId: A, now: 3 };
  assert.deepEqual(toAction({ type: 'move', sq: 19 }, B, s, o), { type: 'move', by: B, sq: 19, now: 3 });
  assert.equal(toAction({ type: 'move', sq: '19' }, B, s, o), null);
  assert.equal(toAction({ type: 'load', s }, B, s, o), null);
  assert.ok(validSaved(s));
  assert.ok(!validSaved({ ...s, board: s.board.slice(1) }));
  assert.ok(!validSaved({ ...s, board: s.board.map(() => 2) }));
  const n = mv(s, A, sq('d3'));
  assert.deepEqual(notice(s, n, { by: A, ad: (id) => names[id] }), { baslik: 'Sıra sende', metin: 'Reversi: Ömer oynadı · 1 taş çevirdi' });
  assert.deepEqual(resultOf(n), { winner: -1, reason: null, plies: 1, no: 1, taslar: [4, 1] });
});

test('rastgele oyunlar: her zaman biter, taşlar ≤ 64', () => {
  let seed = 3;
  const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  for (let g = 0; g < 60; g++) {
    let s = fresh();
    for (let i = 0; i < 80 && s.phase === 'play'; i++) {
      const ms = legalMoves(s.board, s.turn);
      assert.ok(ms.length > 0, 'sıradaki oyuncunun hamlesi olmalı');
      s = mv(s, s.players[s.turn], ms[Math.floor(rnd() * ms.length)], i);
      const [x, y] = counts(s.board);
      assert.ok(x + y <= 64);
    }
    assert.equal(s.phase, 'end');
  }
});
