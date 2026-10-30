import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  START_FEN, parseFen, toFen, legalMoves, makeMove, perft, inCheck, attacked, gameStatus, insufficient,
  posKey, sqOf, sqName, colorOf, typeOf, findMove,
} from '../games/satranc/kurallar.js';

const KIWIPETE = 'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1';
const POS3 = '8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1';
const POS4 = 'r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1';
const POS5 = 'rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8';

const play = (pos, ...names) => {
  let p = pos;
  for (const n of names) {
    const m = findMove(p, sqOf(n.slice(0, 2)), sqOf(n.slice(2, 4)), n[4] || null);
    assert.ok(m, `yasal değil: ${n} (${toFen(p)})`);
    p = makeMove(p, m);
  }
  return p;
};
const targets = (pos, from) => legalMoves(pos).filter((m) => m.from === sqOf(from)).map((m) => sqName(m.to) + (m.promo || '')).sort();

test('kare adları: a8 = 0, h1 = 63, e4 = 36', () => {
  assert.equal(sqOf('a8'), 0);
  assert.equal(sqOf('h1'), 63);
  assert.equal(sqOf('e4'), 36);
  assert.equal(sqName(36), 'e4');
  assert.equal(colorOf('P'), 0);
  assert.equal(colorOf('k'), 1);
  assert.equal(colorOf('.'), -1);
  assert.equal(typeOf('Q'), 'q');
});

test('FEN: okur ve aynen geri yazar', () => {
  for (const f of [START_FEN, KIWIPETE, POS3, POS4, POS5]) assert.equal(toFen(parseFen(f)), f);
  const p = parseFen(START_FEN);
  assert.equal(p.turn, 0);
  assert.equal(p.castle, 'KQkq');
  assert.equal(p.ep, -1);
  assert.equal(p.board.length, 64);
});

test('perft başlangıç: derinlik 1–3 = 20, 400, 8902', () => {
  const p = parseFen(START_FEN);
  assert.equal(perft(p, 1), 20);
  assert.equal(perft(p, 2), 400);
  assert.equal(perft(p, 3), 8902);
});

test('perft Kiwipete: derinlik 1–2 = 48, 2039', () => {
  const p = parseFen(KIWIPETE);
  assert.equal(perft(p, 1), 48);
  assert.equal(perft(p, 2), 2039);
});

test('perft ek konumlar (geçerken alma, terfi, rok hakkı)', () => {
  assert.equal(perft(parseFen(POS3), 1), 14);
  assert.equal(perft(parseFen(POS3), 2), 191);
  assert.equal(perft(parseFen(POS3), 3), 2812);
  assert.equal(perft(parseFen(POS4), 1), 6);
  assert.equal(perft(parseFen(POS4), 2), 264);
  assert.equal(perft(parseFen(POS4), 3), 9467);
  assert.equal(perft(parseFen(POS5), 1), 44);
  assert.equal(perft(parseFen(POS5), 2), 1486);
});

test('perft derin: Kiwipete 3 = 97862, başlangıç 4 = 197281, konum 5 derinlik 3 = 62379', () => {
  assert.equal(perft(parseFen(KIWIPETE), 3), 97862);
  assert.equal(perft(parseFen(START_FEN), 4), 197281);
  assert.equal(perft(parseFen(POS5), 3), 62379);
});

test('rok: kısa ve uzun; kale de yer değiştirir', () => {
  const p = parseFen('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
  assert.deepEqual(targets(p, 'e1'), ['c1', 'd1', 'd2', 'e2', 'f1', 'f2', 'g1']);
  const k = play(p, 'e1g1');
  assert.equal(k.board[sqOf('g1')], 'K');
  assert.equal(k.board[sqOf('f1')], 'R');
  assert.equal(k.board[sqOf('h1')], '.');
  assert.equal(k.castle, 'kq');
  const q = play(p, 'e1c1');
  assert.equal(q.board[sqOf('c1')], 'K');
  assert.equal(q.board[sqOf('d1')], 'R');
  assert.equal(q.board[sqOf('a1')], '.');
});

test('rok: şah çekiliyken, geçtiği kare tehdit altındayken ya da arada taş varken yok', () => {
  // e1'e kale bakıyor: şah çekili
  assert.ok(!targets(parseFen('4r1k1/8/8/8/8/8/8/R3K2R w KQ - 0 1'), 'e1').some((t) => t === 'g1' || t === 'c1'));
  // f1'e fil bakıyor: kısa rok yok, uzun var
  const t = targets(parseFen('6k1/8/8/8/8/8/6b1/R3K2R w KQ - 0 1'), 'e1');
  assert.ok(!t.includes('g1'));
  assert.ok(t.includes('c1'));
  // b1 dolu: uzun rok yok (b1 tehdit altında olması engellemez)
  assert.ok(!targets(parseFen('6k1/8/8/8/8/8/8/RN2K2R w KQ - 0 1'), 'e1').includes('c1'));
  assert.ok(targets(parseFen('1r4k1/8/8/8/8/8/8/R3K2R w KQ - 0 1'), 'e1').includes('c1'));
});

test('rok hakkı: şah ya da kale oynayınca, kale yenince düşer', () => {
  const p = parseFen('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
  assert.equal(play(p, 'h1h2').castle, 'Qkq');
  assert.equal(play(p, 'a1a8').castle, 'Kk');
  assert.equal(play(p, 'e1e2').castle, 'kq');
});

test('geçerken alma: yalnız hemen ardından; alınan piyon kalkar', () => {
  let p = play(parseFen(START_FEN), 'e2e4', 'a7a6', 'e4e5', 'd7d5');
  assert.equal(p.ep, sqOf('d6'));
  assert.ok(targets(p, 'e5').includes('d6'));
  const x = play(p, 'e5d6');
  assert.equal(x.board[sqOf('d5')], '.');
  assert.equal(x.board[sqOf('d6')], 'P');
  // bir hamle beklenirse hak düşer
  p = play(p, 'h2h3', 'h7h6');
  assert.ok(!targets(p, 'e5').includes('d6'));
});

test('geçerken alma şahı açıkta bırakıyorsa yasak', () => {
  const p = parseFen('8/8/8/K2pP2r/8/8/8/7k w - d6 0 1');
  assert.ok(!targets(p, 'e5').includes('d6'));
});

test('terfi: dört seçenek; seçilen taş tahtaya gelir', () => {
  const p = parseFen('7k/P7/8/8/8/8/8/K7 w - - 0 1');
  assert.deepEqual(targets(p, 'a7'), ['a8b', 'a8n', 'a8q', 'a8r']);
  assert.equal(play(p, 'a7a8n').board[sqOf('a8')], 'N');
  assert.equal(play(p, 'a7a8q').board[sqOf('a8')], 'Q');
});

test('çakılı taş şahı açamaz; şah çekiliyken yalnız kurtaran hamleler', () => {
  const pin = parseFen('4r1k1/8/8/8/8/8/4B3/4K3 w - - 0 1');
  assert.deepEqual(targets(pin, 'e2'), []);
  const chk = parseFen('4k3/8/8/8/8/8/3PPP2/r3K3 w - - 0 1');
  assert.ok(inCheck(chk));
  assert.deepEqual(legalMoves(chk).map((m) => sqName(m.from) + sqName(m.to)).sort(), []);
});

test('tehdit: attacked hangi tarafın baktığını bilir', () => {
  const p = parseFen(START_FEN);
  assert.ok(attacked(p.board, sqOf('f3'), 0));
  assert.ok(!attacked(p.board, sqOf('f3'), 1));
  assert.ok(attacked(p.board, sqOf('f6'), 1));
});

test('mat ve pat', () => {
  const mate = play(parseFen(START_FEN), 'f2f3', 'e7e5', 'g2g4', 'd8h4');
  assert.deepEqual(gameStatus(mate), { winner: 1, reason: 'mat' });
  const stale = parseFen('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1');
  assert.deepEqual(gameStatus(stale), { winner: -1, reason: 'pat' });
  assert.equal(gameStatus(parseFen(START_FEN)), null);
});

test('50 hamle kuralı: 100 yarım hamle piyon/alma yoksa berabere', () => {
  assert.deepEqual(gameStatus(parseFen('7k/8/8/8/8/8/R7/K7 w - - 100 80')), { winner: -1, reason: 'elli' });
  assert.equal(gameStatus(parseFen('7k/8/8/8/8/8/R7/K7 w - - 99 80')), null);
  // mat 50. hamleye denk gelirse mat geçerli
  assert.deepEqual(gameStatus(parseFen('R6k/8/6K1/8/8/8/8/8 b - - 100 80')), { winner: 0, reason: 'mat' });
});

test('yetersiz malzeme', () => {
  assert.ok(insufficient(parseFen('8/8/8/4k3/8/8/8/4K3 w - - 0 1').board));
  assert.ok(insufficient(parseFen('8/8/8/4k3/8/8/8/4KB2 w - - 0 1').board));
  assert.ok(insufficient(parseFen('8/8/8/4k3/8/8/8/4KN2 w - - 0 1').board));
  assert.ok(insufficient(parseFen('8/8/8/3bk3/8/8/8/4KB2 w - - 0 1').board)); // aynı renk filler (d5, f1 açık)
  assert.ok(!insufficient(parseFen('8/8/8/2b1k3/8/8/8/4KB2 w - - 0 1').board)); // farklı renk filler (c5 koyu)
  assert.ok(!insufficient(parseFen('8/8/8/4k3/8/8/8/3NKN2 w - - 0 1').board));
  assert.ok(!insufficient(parseFen('8/8/8/4k3/8/8/4P3/4K3 w - - 0 1').board));
  assert.ok(!insufficient(parseFen('8/8/8/4k3/8/8/8/4KR2 w - - 0 1').board));
  assert.deepEqual(gameStatus(parseFen('8/8/8/4k3/8/8/8/4KN2 w - - 0 1')), { winner: -1, reason: 'malzeme' });
});

test('posKey: aynı konum aynı anahtar; geçerken alma yalnız mümkünse anahtara girer', () => {
  const a = play(parseFen(START_FEN), 'g1f3', 'g8f6', 'f3g1', 'f6g8');
  assert.equal(posKey(a), posKey(parseFen(START_FEN)));
  const e4 = play(parseFen(START_FEN), 'e2e4');
  assert.equal(e4.ep, sqOf('e3'));
  assert.equal(posKey(e4), posKey({ ...e4, ep: -1 })); // e3'e alabilecek piyon yok
  const ep = play(parseFen(START_FEN), 'e2e4', 'a7a6', 'e4e5', 'd7d5');
  assert.notEqual(posKey(ep), posKey({ ...ep, ep: -1 }));
  assert.notEqual(posKey(parseFen(START_FEN)), posKey({ ...parseFen(START_FEN), castle: 'Kkq' }));
});

test('makeMove: yarım hamle sayacı ve hamle numarası', () => {
  const p1 = play(parseFen(START_FEN), 'g1f3');
  assert.equal(p1.half, 1);
  assert.equal(p1.full, 1);
  assert.equal(p1.turn, 1);
  const p2 = play(p1, 'e7e5');
  assert.equal(p2.half, 0);
  assert.equal(p2.full, 2);
  const p3 = play(p2, 'f3e5');
  assert.equal(p3.half, 0);
  assert.equal(p3.capture, undefined); // pozisyon temiz kalır
});

test('findMove: terfide seçim yoksa null; yasal değilse null', () => {
  const p = parseFen('7k/P7/8/8/8/8/8/K7 w - - 0 1');
  assert.equal(findMove(p, sqOf('a7'), sqOf('a8'), null), null);
  assert.ok(findMove(p, sqOf('a7'), sqOf('a8'), 'q'));
  assert.equal(findMove(p, sqOf('a1'), sqOf('a3'), null), null);
});
