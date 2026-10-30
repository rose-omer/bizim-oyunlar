import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  initialBoard, boardFrom, legalMoves, applyMove, outcome, countPieces, sqOf, rowOf, ownerOf, isKing,
  newGame, initialState, reduce, toAction, seat, isNewer, resultOf, squareName,
} from '../games/dama/oyun.js';

const W = 'omer', B = 'gul';
const E = '........';
const sq = (r, c) => sqOf(r, c);
const paths = (ms) => ms.map((m) => `${m.from}>${m.path.join(',')}`).sort();

// Boş tahtaya taş koyar: { 'r,c': 'a' }
function place(map) {
  const b = Array(64).fill('.');
  for (const [k, v] of Object.entries(map)) {
    const [r, c] = k.split(',').map(Number);
    b[sq(r, c)] = v;
  }
  return b.join('');
}
function game(board, turn = 0) {
  return { ...newGame({ players: [W, B], names: { [W]: 'Ömer', [B]: 'Gül' }, now: 1 }), board, turn };
}
const mv = (s, by, from, path, now = 5) => reduce(s, { type: 'move', by, from, path, now });

test('başlangıç: 16’şar taş 2.-3. sıralarda; 0. ve 7. sıra boş', () => {
  const b = initialBoard();
  assert.equal(b.length, 64);
  const n = countPieces(b);
  assert.deepEqual(n, [{ men: 16, kings: 0 }, { men: 16, kings: 0 }]);
  for (let c = 0; c < 8; c++) {
    assert.equal(b[sq(0, c)], '.');
    assert.equal(b[sq(7, c)], '.');
    assert.equal(b[sq(1, c)], 'b');
    assert.equal(b[sq(2, c)], 'b');
    assert.equal(b[sq(5, c)], 'a');
    assert.equal(b[sq(6, c)], 'a');
  }
  assert.equal(squareName(sq(7, 0)), 'a1');
  assert.equal(squareName(sq(0, 7)), 'h8');
});

test('ilk hamleler: beyazın 8 hamlesi var, hepsi bir kare ileri', () => {
  const ms = legalMoves(initialBoard(), 0);
  assert.equal(ms.length, 8);
  for (const m of ms) {
    assert.equal(rowOf(m.from), 5);
    assert.equal(m.path[0], m.from - 8);
    assert.deepEqual(m.caps, []);
  }
  const bm = legalMoves(initialBoard(), 1);
  assert.equal(bm.length, 8);
  for (const m of bm) assert.equal(m.path[0], m.from + 8);
});

test('taş ileri ve yana gider; geri ve çapraz gitmez', () => {
  const b = place({ '4,4': 'a', '0,0': 'b' });
  const ms = legalMoves(b, 0).filter((m) => m.from === sq(4, 4));
  assert.deepEqual(ms.map((m) => m.path[0]).sort((x, y) => x - y), [sq(3, 4), sq(4, 3), sq(4, 5)].sort((x, y) => x - y));
  const blk = place({ '4,4': 'b', '7,7': 'a' });
  const bm = legalMoves(blk, 1).filter((m) => m.from === sq(4, 4)).map((m) => m.path[0]);
  assert.deepEqual(bm.sort((x, y) => x - y), [sq(4, 3), sq(4, 5), sq(5, 4)]);
});

test('kenarda taş tahtadan çıkmaz', () => {
  const b = place({ '3,0': 'a', '0,7': 'b' });
  const ms = legalMoves(b, 0).filter((m) => m.from === sq(3, 0)).map((m) => m.path[0]);
  assert.deepEqual(ms.sort((x, y) => x - y), [sq(2, 0), sq(3, 1)]);
});

test('yeme zorunlu: yeme varsa sessiz hamle listelenmez', () => {
  const b = place({ '4,4': 'a', '3,4': 'b', '6,0': 'a', '0,7': 'b' });
  const ms = legalMoves(b, 0);
  assert.equal(ms.length, 1);
  assert.deepEqual(ms[0], { from: sq(4, 4), path: [sq(2, 4)], caps: [sq(3, 4)] });
});

test('taş yana da yer, geriye yemez', () => {
  const side = place({ '4,4': 'a', '4,5': 'b' });
  assert.deepEqual(legalMoves(side, 0)[0].caps, [sq(4, 5)]);
  const back = place({ '4,4': 'a', '5,4': 'b' }); // beyaz için 5. satır geri
  assert.ok(legalMoves(back, 0).every((m) => m.caps.length === 0));
  // siyah için ileri aşağıdır: 5,4 siyahı 4,4 beyazını yiyemez (yukarı = geri)
  const bBack = place({ '5,4': 'b', '4,4': 'a', '0,0': 'a' });
  assert.ok(legalMoves(bBack, 1).every((m) => m.caps.length === 0));
});

test('arkası dolu taş yenmez; uzaktaki taşı normal taş yiyemez', () => {
  const blocked = place({ '4,4': 'a', '3,4': 'b', '2,4': 'b' });
  assert.ok(legalMoves(blocked, 0).every((m) => m.caps.length === 0));
  const far = place({ '4,4': 'a', '2,4': 'b' });
  assert.ok(legalMoves(far, 0).every((m) => m.caps.length === 0));
});

test('çoklu yeme tek hamlede; en çok taş alan yol zorunlu', () => {
  // (5,0) taşı 2 yer: (4,0) ve (2,0). (5,5) taşı 1 yer: (4,5).
  const b = place({ '5,0': 'a', '4,0': 'b', '2,0': 'b', '5,5': 'a', '4,5': 'b' });
  const ms = legalMoves(b, 0);
  assert.equal(ms.length, 1);
  assert.deepEqual(ms[0], { from: sq(5, 0), path: [sq(3, 0), sq(1, 0)], caps: [sq(4, 0), sq(2, 0)] });
  const after = applyMove(b, ms[0], 0);
  assert.equal(after[sq(4, 0)], '.');
  assert.equal(after[sq(2, 0)], '.');
  assert.equal(after[sq(1, 0)], 'a');
});

test('eşit uzunlukta yollar arasında oyuncu seçer', () => {
  const b = place({ '4,4': 'a', '4,3': 'b', '4,5': 'b' });
  const ms = legalMoves(b, 0);
  assert.deepEqual(paths(ms), [`${sq(4, 4)}>${sq(4, 2)}`, `${sq(4, 4)}>${sq(4, 6)}`].sort());
});

test('yenen taş anında kalkar: dama aynı zincirde boşalan kareden geçer', () => {
  // Dama 7,0 → sağa 7,2'yi yer → yukarı 5,5 → sola 3,3 → aşağı 5,1 → sağa (7,2 artık boş) 7,6'yı yer.
  const b = place({ '7,0': 'A', '7,2': 'b', '5,5': 'b', '3,3': 'b', '5,1': 'b', '7,6': 'b' });
  const ms = legalMoves(b, 0);
  assert.ok(ms.length >= 1);
  for (const m of ms) assert.equal(m.caps.length, 5);
  assert.ok(ms.some((m) => m.path[m.path.length - 1] === sq(7, 7)));
  const after = applyMove(b, ms[0], 0);
  assert.deepEqual(countPieces(after)[1], { men: 0, kings: 0 });
});

test('dama: 180° dönerek ikinci yeme yapamaz', () => {
  // Dama 3,2. Sağda 3,4, solda 3,1 rakip. Biri yenince geri dönüp öbürünü yemek yasak.
  const b = place({ '3,2': 'A', '3,4': 'b', '3,1': 'b', '7,7': 'b' });
  const ms = legalMoves(b, 0);
  assert.ok(ms.length > 0);
  for (const m of ms) assert.equal(m.caps.length, 1);
  // Dik dönüş serbest: sağa yer, sonra yukarı
  const b2 = place({ '3,2': 'A', '3,4': 'b', '1,6': 'b' });
  const m2 = legalMoves(b2, 0);
  for (const m of m2) assert.equal(m.caps.length, 2);
  assert.ok(m2.every((m) => m.path[0] === sq(3, 6)), 'devam eden iniş seçilmeli');
});

test('dama uzaktan yer ve ötedeki her boş kareye konabilir', () => {
  const b = place({ '7,0': 'A', '3,0': 'b', '7,7': 'b' });
  const ms = legalMoves(b, 0);
  assert.deepEqual(ms.map((m) => m.path[0]).sort((x, y) => x - y), [sq(0, 0), sq(1, 0), sq(2, 0)]);
  for (const m of ms) assert.deepEqual(m.caps, [sq(3, 0)]);
});

test('dama arada kendi taşı ya da iki rakip taş varsa atlayamaz', () => {
  const own = place({ '7,0': 'A', '5,0': 'a', '3,0': 'b' });
  assert.ok(legalMoves(own, 0).every((m) => m.caps.length === 0));
  const two = place({ '7,0': 'A', '4,0': 'b', '3,0': 'b', '7,7': 'b' });
  assert.ok(legalMoves(two, 0).every((m) => m.caps.length === 0));
});

test('dama: sessiz hamlede dört yönde istediği kadar, taşa çarpınca durur', () => {
  const b = place({ '4,4': 'A', '4,6': 'a', '0,0': 'b' });
  const to = legalMoves(b, 0).filter((m) => m.from === sq(4, 4)).map((m) => m.path[0]);
  // yukarı 4, aşağı 3, sol 4, sağ 1 (4,5) = 12
  assert.equal(to.length, 12);
  assert.ok(to.includes(sq(0, 4)) && to.includes(sq(7, 4)) && to.includes(sq(4, 0)) && to.includes(sq(4, 5)));
  assert.ok(!to.includes(sq(4, 6)) && !to.includes(sq(4, 7)));
});

test('son sıraya varan taş dama olur (beyaz 0. satır, siyah 7. satır)', () => {
  const b = place({ '1,3': 'a', '6,4': 'b' });
  const w = legalMoves(b, 0).find((m) => m.path[0] === sq(0, 3));
  assert.equal(applyMove(b, w, 0)[sq(0, 3)], 'A');
  const k = legalMoves(b, 1).find((m) => m.path[0] === sq(7, 4));
  assert.equal(applyMove(b, k, 1)[sq(7, 4)], 'B');
  const side = legalMoves(b, 0).find((m) => m.path[0] === sq(1, 2));
  assert.equal(applyMove(b, side, 0)[sq(1, 2)], 'a');
});

test('yeme ile son sıraya gelen taş zinciri taş olarak sürdürür, sonunda dama olur', () => {
  // 2,3 taşı 1,3'ü yer → 0,3; oradan yana 0,4'ü yer → 0,5. 0,1 uzakta: taş uzaktan yiyemez.
  const b = place({ '2,3': 'a', '1,3': 'b', '0,4': 'b', '0,1': 'b' });
  const ms = legalMoves(b, 0);
  assert.equal(ms.length, 1);
  assert.deepEqual(ms[0].path, [sq(0, 3), sq(0, 5)]);
  assert.equal(ms[0].caps.length, 2);
  const after = applyMove(b, ms[0], 0);
  assert.equal(after[sq(0, 5)], 'A');
  assert.equal(after[sq(0, 1)], 'b', 'uzaktaki taş yenmedi');
});

test('bitiş: rakibin taşı kalmazsa kazanır', () => {
  let s = game(place({ '4,4': 'a', '3,4': 'b' }));
  s = mv(s, W, sq(4, 4), [sq(2, 4)]);
  assert.equal(s.phase, 'end');
  assert.deepEqual(s.result, { winner: 0, reason: 'tas' });
  assert.equal(s.tally[W], 1);
  assert.deepEqual(resultOf(s), { winner: 0, reason: 'tas', plies: 1, no: 1 });
});

test('bitiş: rakibin hamlesi kalmazsa kazanır', () => {
  // Siyah 0,0 köşede (yalnız aşağı/sağa gidebilir); 1,0 ve 0,1 beyaz, arkaları dolu → hamle yok.
  const b = place({ '0,0': 'b', '1,0': 'a', '2,0': 'a', '0,1': 'a', '0,2': 'a', '6,6': 'a' });
  assert.deepEqual(outcome(b, 1), { winner: 0, reason: 'hamle' });
  let s = game(place({ '0,0': 'b', '1,0': 'a', '2,0': 'a', '0,2': 'a', '1,1': 'a', '7,7': 'a' }));
  s = mv(s, W, sq(1, 1), [sq(0, 1)]);
  assert.equal(s.phase, 'end');
  assert.deepEqual(s.result, { winner: 0, reason: 'hamle' });
});

test('beraberlik: iki tarafta da tek dama kalırsa', () => {
  assert.deepEqual(outcome(place({ '0,0': 'A', '7,7': 'B' }), 0), { winner: -1, reason: 'dama' });
  assert.equal(outcome(place({ '0,0': 'A', '7,7': 'b' }), 1), null, 'dama - taş sürer');
  assert.equal(outcome(place({ '0,0': 'A', '3,3': 'A', '7,7': 'B' }), 1), null);
  // Hamle ile beraberliğe varış
  let s = game(place({ '4,4': 'A', '4,5': 'b', '0,0': 'B' }));
  s = mv(s, W, sq(4, 4), [sq(4, 6)]);
  assert.equal(s.phase, 'end');
  assert.deepEqual(s.result, { winner: -1, reason: 'dama' });
  assert.deepEqual(s.tally, {});
});

test('reducer: sırası olmayan ve geçersiz hamle yok sayılır; zorunlu yemeyi atlamak olmaz', () => {
  const s0 = initialState({ players: [W, B], names: {}, now: 1 });
  assert.equal(mv(s0, B, sq(2, 0), [sq(3, 0)]), s0, 'sıra beyazda');
  assert.equal(mv(s0, W, sq(6, 0), [sq(5, 0)]), s0, 'dolu kare');
  assert.equal(mv(s0, W, sq(5, 0), [sq(3, 0)]), s0, 'iki kare');
  assert.equal(mv(s0, 'yabanci', sq(5, 0), [sq(4, 0)]), s0);
  const s1 = mv(s0, W, sq(5, 0), [sq(4, 0)], 9);
  assert.equal(s1.turn, 1);
  assert.equal(s1.ply, 1);
  assert.equal(s1.seq, s0.seq + 1);
  assert.equal(s1.at, 9);
  assert.deepEqual(s1.last, { by: 0, from: sq(5, 0), path: [sq(4, 0)], caps: [] });
  // Zorunlu yeme: sessiz hamle reddedilir
  const f = game(place({ '4,4': 'a', '3,4': 'b', '6,0': 'a', '0,7': 'b' }));
  assert.equal(mv(f, W, sq(6, 0), [sq(5, 0)]), f);
  // Kısmi zincir reddedilir
  const c = game(place({ '5,0': 'a', '4,0': 'b', '2,0': 'b', '7,7': 'b' }));
  assert.equal(mv(c, W, sq(5, 0), [sq(3, 0)]), c);
  assert.equal(mv(c, W, sq(5, 0), [sq(3, 0), sq(1, 0)]).ply, 1);
});

test('geri alma: yalnız son hamleyi yapan ister, rakip onaylar ya da reddeder', () => {
  const s0 = initialState({ players: [W, B], names: {}, now: 1 });
  assert.equal(reduce(s0, { type: 'undoAsk', by: W }), s0, 'hamle yok');
  const s1 = mv(s0, W, sq(5, 0), [sq(4, 0)]);
  assert.equal(reduce(s1, { type: 'undoAsk', by: B }), s1, 'son hamle onun değil');
  const s2 = reduce(s1, { type: 'undoAsk', by: W, now: 7 });
  assert.equal(s2.undoReq, W);
  assert.equal(reduce(s2, { type: 'undoReply', by: W, ok: true }), s2, 'kendi isteğini onaylayamaz');
  const no = reduce(s2, { type: 'undoReply', by: B, ok: false });
  assert.equal(no.undoReq, null);
  assert.equal(no.board, s1.board);
  const yes = reduce(s2, { type: 'undoReply', by: B, ok: true });
  assert.equal(yes.board, s0.board);
  assert.equal(yes.turn, 0);
  assert.equal(yes.ply, 0);
  assert.equal(yes.prev, null);
  assert.ok(yes.seq > s2.seq);
  // Rakip oynayınca istek düşer
  const s3 = mv(s2, B, sq(2, 7), [sq(3, 7)]);
  assert.equal(s3.undoReq, null);
});

test('yeni oyun: renkler yer değiştirir, skor korunur; yalnız oyuncular başlatır', () => {
  let s = game(place({ '4,4': 'a', '3,4': 'b' }));
  s = mv(s, W, sq(4, 4), [sq(2, 4)]);
  assert.equal(reduce(s, { type: 'new', by: 'x' }), s);
  const n = reduce(s, { type: 'new', by: B, now: 50 });
  assert.deepEqual(n.players, [B, W]);
  assert.equal(n.no, 2);
  assert.equal(n.phase, 'play');
  assert.equal(n.board, initialBoard());
  assert.equal(n.tally[W], 1);
  assert.ok(n.seq > s.seq);
});

test('seat: yer tutucu ya da eski kimlik yerine partner oturur; skor taşınır', () => {
  const s = { ...initialState({ players: [W, '?'], names: { [W]: 'Ömer' } }), tally: { '?': 2 } };
  const t = seat(s, [W, B], { [B]: 'Gül' });
  assert.deepEqual(t.players, [W, B]);
  assert.equal(t.names[B], 'Gül');
  assert.deepEqual(t.tally, { [B]: 2 });
  assert.equal(seat(t, [W, B], { [B]: 'Gül' }), t, 'değişiklik yok');
  assert.equal(seat(t, ['x', 'y']), t, 'ikisi de yabancı');
  const u = seat(t, [B, 'yeni-cihaz']);
  assert.deepEqual(u.players, ['yeni-cihaz', B]);
});

test('load: yalnız daha yeni kayıt benimsenir; isNewer', () => {
  const s = initialState({ players: [W, B], names: {}, now: 1 });
  const newer = mv(s, W, sq(5, 0), [sq(4, 0)]);
  assert.equal(reduce(s, { type: 'load', s: newer }), newer);
  assert.equal(reduce(newer, { type: 'load', s }), newer);
  assert.equal(reduce(s, { type: 'load', s: { ...newer, kind: 'tavla' } }), s);
  assert.ok(isNewer({ seq: 2, at: 1 }, { seq: 1, at: 9 }));
  assert.ok(isNewer({ seq: 2, at: 5 }, { seq: 2, at: 4 }));
  assert.ok(!isNewer(null, { seq: 1 }));
  assert.ok(isNewer({ seq: 0 }, null));
});

test('toAction: by gönderenden gelir; seat/load yalnız ev sahibinden', () => {
  const s = initialState({ players: [W, B], names: {} });
  const o = { hostId: W, now: 3 };
  assert.deepEqual(toAction({ type: 'move', from: 1, path: [2], by: 'sahte' }, B, s, o), { type: 'move', by: B, from: 1, path: [2], now: 3 });
  assert.equal(toAction({ type: 'load', s }, B, s, o), null);
  assert.equal(toAction({ type: 'seat', ids: [B, W] }, B, s, o), null);
  assert.deepEqual(toAction({ type: 'seat', ids: [W, B] }, W, s, o), { type: 'seat', ids: [W, B], names: undefined });
  assert.equal(toAction({ type: 'hile' }, W, s, o), null);
  assert.equal(toAction(null, W, s, o), null);
});

test('rastgele tam oyunlar: kurallar tutarlı, taş sayısı hiç artmaz, oyun biter ya da sürer', () => {
  let seed = 12345;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 2 ** 32);
  for (let g = 0; g < 30; g++) {
    let s = initialState({ players: [W, B], names: {}, now: 1 });
    for (let i = 0; i < 300 && s.phase === 'play'; i++) {
      const ms = legalMoves(s.board, s.turn);
      assert.ok(ms.length > 0);
      const m = ms[Math.floor(rnd() * ms.length)];
      const before = countPieces(s.board);
      const next = mv(s, s.players[s.turn], m.from, m.path);
      assert.notEqual(next, s);
      const after = countPieces(next.board);
      const opp = s.turn === 0 ? 1 : 0;
      assert.equal(after[opp].men + after[opp].kings, before[opp].men + before[opp].kings - m.caps.length);
      for (const c of m.caps) assert.equal(ownerOf(s.board[c]), opp);
      const to = m.path[m.path.length - 1];
      if (rowOf(to) === (s.turn === 0 ? 0 : 7)) assert.ok(isKing(next.board[to]), 'son sırada dama olmalı');
      s = next;
    }
  }
});
