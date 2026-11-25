import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  startBoard, sow, legalPits, sideSum, winnerOf, across, TOTAL,
  initialState, reduce, toAction, notice, resultOf, validSaved,
} from '../games/mangala/oyun.js';

const A = 'omer', B = 'gul';
const names = { [A]: 'Ömer', [B]: 'Gül' };
const fresh = () => initialState({ players: [A, B], names, now: 1 });
const mv = (s, by, pit, now = 5) => reduce(s, { type: 'move', by, pit, now });
const sum = (b) => b.reduce((n, x) => n + x, 0);
const bos = () => new Array(14).fill(0);

test('başlangıç: her kuyuda 4 taş, hazineler boş, sıra ilk oyuncuda', () => {
  const s = fresh();
  assert.equal(s.kind, 'mangala');
  assert.deepEqual(s.board, [4, 4, 4, 4, 4, 4, 0, 4, 4, 4, 4, 4, 4, 0]);
  assert.equal(sum(s.board), TOTAL);
  assert.equal(s.turn, 0);
  assert.equal(s.phase, 'play');
  assert.deepEqual(legalPits(s.board, 0), [0, 1, 2, 3, 4, 5]);
  assert.equal(across(0), 12);
  assert.equal(across(5), 7);
});

test('dağıtma: ilk taş aynı kuyuya, kalanı sıradakilere', () => {
  const m = sow(startBoard(), 0, 0);
  assert.deepEqual(m.board.slice(0, 7), [1, 5, 5, 5, 4, 4, 0]);
  assert.equal(m.end, 3);
  assert.equal(m.extra, false);
});

test('tek taş bir sonraki kuyuya geçer', () => {
  const b = bos();
  b[2] = 1; b[3] = 2; b[9] = 3;
  const m = sow(b, 0, 2);
  assert.equal(m.board[2], 0);
  assert.equal(m.board[3], 3);
  assert.equal(m.end, 3);
});

test('son taş kendi hazinesine düşerse sıra aynı oyuncuda kalır', () => {
  const s = mv(fresh(), A, 3); // 4 taş: 3,4,5,hazine
  assert.equal(s.last.extra, true);
  assert.equal(s.turn, 0);
  assert.equal(s.board[6], 1);
  const t = mv(s, A, 0);
  assert.equal(t.turn, 1);
});

test('rakip kuyusunu çift yapan son taş o kuyuyu kazanır', () => {
  const b = startBoard();
  b[5] = 4; b[8] = 1; b[9] = 7; // 5:1, 6:+1, 7:5, 8:2 → çift
  const s = mv({ ...fresh(), board: b }, A, 5);
  assert.equal(s.last.end, 8);
  assert.equal(s.last.cap, 2);
  assert.deepEqual(s.last.capPits, [8]);
  assert.equal(s.board[8], 0);
  assert.equal(s.board[6], 3);
  assert.equal(sum(s.board), TOTAL);
  assert.equal(s.turn, 1);
});

test('kendi boş kuyusuna düşen son taş karşıdakiyle birlikte alınır', () => {
  const b = bos();
  b[0] = 1; b[1] = 0; b[3] = 1; b[11] = 5; b[9] = 2;
  const m = sow(b, 0, 0);
  assert.equal(m.end, 1);
  assert.equal(m.cap, 6);
  assert.deepEqual(m.capPits, [1, 11]);
  assert.equal(m.board[1], 0);
  assert.equal(m.board[11], 0);
  assert.equal(m.board[6], 6);
});

test('karşı kuyu boşsa kendi boş kuyusunda alma yok', () => {
  const b = bos();
  b[0] = 1; b[9] = 2; b[3] = 1;
  const m = sow(b, 0, 0);
  assert.equal(m.cap, 0);
  assert.equal(m.board[1], 1);
});

test('dağıtırken rakip hazinesi atlanır', () => {
  const b = bos();
  b[12] = 3; b[0] = 1; b[3] = 2;
  const m = sow(b, 1, 5); // 12:1, 13:+1, 0:+1 → 0 rakibin, 2 çift → alınır
  assert.equal(m.board[6], 0);
  assert.equal(m.end, 0);
  assert.equal(m.board[13], 3);
  const b2 = bos();
  b2[5] = 10; b2[8] = 1;
  const m2 = sow(b2, 0, 5);
  assert.equal(m2.board[13], 0, 'rakip hazinesine taş girmez');
  assert.equal(sum(m2.board), sum(b2));
});

test('kuyuları boşalan oyuncu rakibin kalan taşlarını da alır; oyun biter', () => {
  const b = bos();
  b[5] = 1; b[6] = 20; b[7] = 3; b[9] = 2; b[13] = 22;
  const m = sow(b, 0, 5);
  assert.equal(m.over, true);
  assert.deepEqual(m.sweep, { to: 0, n: 5 });
  assert.equal(sideSum(m.board, 1), 0);
  assert.equal(m.board[6], 26);
  assert.equal(winnerOf(m.board), 0);
});

test('bitiş: kazanan, sayaç ve sıra', () => {
  const s0 = fresh();
  const b = bos();
  b[5] = 1; b[6] = 20; b[7] = 3; b[9] = 2; b[13] = 22;
  const s = mv({ ...s0, board: b }, A, 5);
  assert.equal(s.phase, 'end');
  assert.deepEqual(s.result, { winner: 0, reason: 'bitti' });
  assert.equal(s.tally[A], 1);
  assert.equal(mv(s, B, 0), s, 'bitince hamle yok');
  assert.deepEqual(resultOf(s), { winner: 0, reason: 'bitti', plies: 1, no: 1, hazine: [26, 22] });
});

test('berabere: hazineler eşit', () => {
  const b = bos();
  b[6] = 24; b[13] = 24;
  assert.equal(winnerOf(b), -1);
});

test('yalnız sırası gelen ve dolu kuyu oynanır', () => {
  const s = fresh();
  assert.equal(mv(s, B, 0), s);
  assert.equal(mv(s, A, 9), s);
  assert.equal(mv(s, A, -1), s);
  const b = startBoard();
  b[2] = 0; b[6] = 4;
  assert.equal(mv({ ...s, board: b }, A, 2).seq, s.seq);
});

test('teslim, rövanş ve renk değişimi', () => {
  const s = mv(fresh(), A, 0);
  const r = reduce(s, { type: 'resign', by: B, now: 9 });
  assert.deepEqual(r.result, { winner: 0, reason: 'teslim' });
  assert.equal(r.tally[A], 1);
  const n = reduce(r, { type: 'new', by: B, no: r.no, now: 10 });
  assert.deepEqual(n.players, [B, A]);
  assert.equal(n.no, 2);
  assert.equal(n.tally[A], 1);
  assert.deepEqual(n.board, startBoard());
  assert.equal(reduce(n, { type: 'new', by: A, no: 1, now: 11 }), n, 'eski rövanş isteği yok sayılır');
});

test('toAction: yalnız ev sahibi yükler; kuyu tam sayı olmalı', () => {
  const s = fresh();
  assert.deepEqual(toAction({ type: 'move', pit: 2 }, B, s, { hostId: A, now: 3 }), { type: 'move', by: B, pit: 2, now: 3 });
  assert.equal(toAction({ type: 'move', pit: '2' }, B, s, { hostId: A, now: 3 }), null);
  assert.equal(toAction({ type: 'load', s }, B, s, { hostId: A, now: 3 }), null);
  assert.ok(toAction({ type: 'load', s }, A, s, { hostId: A, now: 3 }));
  assert.equal(toAction({ type: 'hile' }, A, s, { hostId: A, now: 3 }), null);
});

test('kayıt denetimi ve bildirim metni', () => {
  const s = fresh();
  assert.ok(validSaved(s));
  assert.ok(!validSaved({ ...s, board: s.board.slice(1) }));
  assert.ok(!validSaved({ ...s, board: [...s.board.slice(0, 13), 5] }));
  const b = startBoard();
  b[5] = 4; b[8] = 1; b[9] = 7;
  const s1 = { ...s, board: b };
  const n = mv(s1, A, 5);
  const ad = (id) => names[id];
  assert.deepEqual(notice(s1, n, { by: A, ad }), { baslik: 'Sıra sende', metin: 'Mangala: Ömer oynadı · 2 taş aldı' });
});

test('rastgele oyunlar: taş sayısı korunur, oyun biter', () => {
  let seed = 7;
  const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  for (let g = 0; g < 200; g++) {
    let s = fresh();
    for (let i = 0; i < 400 && s.phase === 'play'; i++) {
      const pits = legalPits(s.board, s.turn);
      assert.ok(pits.length > 0);
      s = mv(s, s.players[s.turn], pits[Math.floor(rnd() * pits.length)], i);
      assert.equal(sum(s.board), TOTAL);
    }
    assert.equal(s.phase, 'end');
  }
});
