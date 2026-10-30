import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseFen, sqOf, START_FEN } from '../games/satranc/kurallar.js';
import {
  initialState, newGame, reduce, toAction, seat, isNewer, notice, resultOf, material, boardMaterial,
} from '../games/satranc/oyun.js';

const W = 'omer', B = 'gul';
const names = { [W]: 'Ömer', [B]: 'Gül' };
const fresh = () => initialState({ players: [W, B], names, now: 1 });
const at = (fen, extra = {}) => ({ ...fresh(), ...parseFen(fen), ...extra });
const mv = (s, by, uci, now = 5) => reduce(s, { type: 'move', by, from: sqOf(uci.slice(0, 2)), to: sqOf(uci.slice(2, 4)), promo: uci[4] || null, now });
function line(s, ...ucis) {
  let x = s;
  ucis.forEach((u, i) => { x = mv(x, x.players[x.turn], u, 10 + i); });
  return x;
}

test('başlangıç: beyaz ilk oyuncu, sıra beyazda, oyun sürüyor', () => {
  const s = fresh();
  assert.equal(s.kind, 'satranc');
  assert.equal(s.v, 1);
  assert.deepEqual(s.players, [W, B]);
  assert.equal(s.board, parseFen(START_FEN).board);
  assert.equal(s.turn, 0);
  assert.equal(s.phase, 'play');
  assert.equal(s.ply, 0);
  assert.deepEqual(s.caps, [[], []]);
  assert.equal(s.rep.length, 1);
  assert.equal(s.offer, null);
});

test('hamle: yalnız sırası gelen ve yasal hamle işlenir', () => {
  const s = fresh();
  assert.equal(mv(s, B, 'e7e5'), s); // sıra beyazda
  assert.equal(mv(s, W, 'e2e5'), s); // yasal değil
  const n = mv(s, W, 'e2e4');
  assert.notEqual(n, s);
  assert.equal(n.turn, 1);
  assert.equal(n.ply, 1);
  assert.equal(n.seq, s.seq + 1);
  assert.equal(n.at, 5);
  assert.deepEqual(n.last, { by: 0, from: sqOf('e2'), to: sqOf('e4'), cap: null, promo: null, flag: '2', check: false });
  assert.equal(n.board[sqOf('e4')], 'P');
});

test('alınan taşlar alan tarafın listesine eklenir (geçerken alma dahil)', () => {
  const s = line(fresh(), 'e2e4', 'd7d5', 'e4d5');
  assert.deepEqual(s.caps, [['p'], []]);
  const ep = line(fresh(), 'e2e4', 'a7a6', 'e4e5', 'd7d5', 'e5d6');
  assert.deepEqual(ep.caps, [['p'], []]);
  assert.equal(ep.last.flag, 'ep');
});

test('terfi: seçim yoksa yok sayılır; seçilen taş gelir', () => {
  const s = at('1n5k/P7/8/8/8/8/8/K7 w - - 0 1');
  assert.equal(mv(s, W, 'a7a8'), s);
  const q = mv(s, W, 'a7b8n');
  assert.equal(q.board[sqOf('b8')], 'N');
  assert.deepEqual(q.caps, [['n'], []]);
  assert.equal(q.last.promo, 'n');
});

test('mat: oyun biter, kazanan sayılır, şah işareti', () => {
  const s = line(fresh(), 'f2f3', 'e7e5', 'g2g4', 'd8h4');
  assert.equal(s.phase, 'end');
  assert.deepEqual(s.result, { winner: 1, reason: 'mat' });
  assert.equal(s.tally[B], 1);
  assert.equal(s.last.check, true);
  assert.equal(mv(s, W, 'a2a3'), s); // bitmiş oyunda hamle yok
});

test('üçlü tekrar: aynı konum üçüncü kez gelince berabere', () => {
  const s = line(fresh(), 'g1f3', 'g8f6', 'f3g1', 'f6g8', 'g1f3', 'g8f6', 'f3g1');
  assert.equal(s.phase, 'play');
  const d = mv(s, B, 'f6g8');
  assert.equal(d.phase, 'end');
  assert.deepEqual(d.result, { winner: -1, reason: 'tekrar' });
  assert.deepEqual(d.tally, {});
});

test('tekrar listesi piyon hamlesi ya da almadan sonra sıfırlanır', () => {
  const s = line(fresh(), 'g1f3', 'g8f6');
  assert.equal(s.rep.length, 3);
  assert.equal(mv(s, W, 'e2e4').rep.length, 1);
});

test('50 hamle: 100. yarım hamle sessizse berabere', () => {
  const s = at('7k/8/8/8/8/8/R7/K7 w - - 99 80');
  const d = mv(s, W, 'a2b2');
  assert.deepEqual(d.result, { winner: -1, reason: 'elli' });
});

test('yetersiz malzeme: son taş alınınca berabere', () => {
  const e = mv(at('7k/8/8/8/8/8/r7/K7 w - - 0 1'), W, 'a1a2');
  assert.deepEqual(e.result, { winner: -1, reason: 'malzeme' });
});

test('beraberlik teklifi: ret, aynı hamlede yeniden teklif yok; kabul berabere bitirir', () => {
  const s = fresh();
  const o = reduce(s, { type: 'offer', by: W, now: 2 });
  assert.equal(o.offer, W);
  assert.equal(reduce(o, { type: 'offer', by: B }), o); // bekleyen teklif var
  assert.equal(reduce(o, { type: 'offerReply', by: W, ok: true }), o); // kendi teklifine cevap yok
  const no = reduce(o, { type: 'offerReply', by: B, ok: false, now: 3 });
  assert.equal(no.offer, null);
  assert.equal(no.phase, 'play');
  assert.equal(reduce(no, { type: 'offer', by: W }), no); // aynı hamlede ısrar yok
  const after = line(no, 'e2e4', 'e7e5');
  assert.equal(reduce(after, { type: 'offer', by: W }).offer, W);
  const yes = reduce(o, { type: 'offerReply', by: B, ok: true, now: 4 });
  assert.equal(yes.phase, 'end');
  assert.deepEqual(yes.result, { winner: -1, reason: 'anlasma' });
});

test('hamle bekleyen teklifi düşürür', () => {
  const o = reduce(fresh(), { type: 'offer', by: B });
  assert.equal(mv(o, W, 'e2e4').offer, null);
});

test('teslim: öbür taraf kazanır', () => {
  const r = reduce(fresh(), { type: 'resign', by: W, now: 9 });
  assert.equal(r.phase, 'end');
  assert.deepEqual(r.result, { winner: 1, reason: 'teslim' });
  assert.equal(r.tally[B], 1);
  assert.equal(reduce(r, { type: 'resign', by: B }), r);
  assert.equal(reduce(fresh(), { type: 'resign', by: 'yabanci' }).phase, 'play');
});

test('yeni oyun: renkler değişir, skor kalır; eski numaralı istek yok sayılır', () => {
  const r = reduce(fresh(), { type: 'resign', by: W, now: 9 });
  const n = reduce(r, { type: 'new', by: W, no: r.no, now: 10 });
  assert.equal(n.no, r.no + 1);
  assert.deepEqual(n.players, [B, W]);
  assert.equal(n.tally[B], 1);
  assert.equal(n.phase, 'play');
  assert.ok(n.seq > r.seq);
  assert.equal(reduce(n, { type: 'new', by: B, no: r.no }), n);
});

test('toAction: niyetleri eyleme çevirir; seat ve load yalnız ev sahibinden', () => {
  const s = fresh();
  const ctx = { hostId: W, now: 7 };
  assert.deepEqual(toAction({ type: 'move', from: 52, to: 36, promo: 'q' }, B, s, ctx), { type: 'move', by: B, from: 52, to: 36, promo: 'q', now: 7 });
  assert.deepEqual(toAction({ type: 'move', from: 52, to: 36 }, B, s, ctx), { type: 'move', by: B, from: 52, to: 36, promo: null, now: 7 });
  assert.equal(toAction({ type: 'move', from: 52, to: 36, promo: 'k' }, B, s, ctx).promo, null);
  assert.deepEqual(toAction({ type: 'offer' }, B, s, ctx), { type: 'offer', by: B, now: 7 });
  assert.deepEqual(toAction({ type: 'offerReply', ok: 1 }, B, s, ctx), { type: 'offerReply', by: B, ok: true, now: 7 });
  assert.deepEqual(toAction({ type: 'resign' }, B, s, ctx), { type: 'resign', by: B, now: 7 });
  assert.deepEqual(toAction({ type: 'new', no: 1 }, B, s, ctx), { type: 'new', by: B, no: 1, now: 7 });
  assert.equal(toAction({ type: 'seat', ids: [W, B] }, B, s, ctx), null);
  assert.equal(toAction({ type: 'load', s }, B, s, ctx), null);
  assert.ok(toAction({ type: 'load', s }, W, s, ctx));
  assert.equal(toAction({ type: 'bilinmez' }, W, s, ctx), null);
});

test('seat ve load: yer tutucuya partner oturur; yalnız yeni kayıt yüklenir', () => {
  const s = initialState({ players: [W, '?'], names, now: 1 });
  const x = reduce(s, { type: 'seat', ids: [W, B], names: { [B]: 'Gül' } });
  assert.deepEqual(x.players, [W, B]);
  const newer = { ...x, seq: x.seq + 5 };
  assert.equal(reduce(x, { type: 'load', s: newer }), newer);
  assert.equal(reduce(newer, { type: 'load', s: x }), newer);
  assert.equal(seat(x, [W, B], {}), x);
  assert.ok(isNewer(newer, x));
});

test('bildirim metni: hamle, şah, yeni oyun, bitiş', () => {
  const ad = (id) => names[id];
  const s0 = fresh();
  const s1 = mv(s0, W, 'e2e4');
  assert.deepEqual(notice(s0, s1, { by: W, ad }), { baslik: 'Sıra sende', metin: 'Satranç: Ömer hamlesini yaptı' });
  const pre = line(fresh(), 'e2e4', 'd7d6');
  const chk = mv(pre, W, 'f1b5');
  assert.equal(chk.phase, 'play');
  assert.equal(notice(pre, chk, { by: W, ad }).metin, 'Satranç: Ömer hamlesini yaptı · şah!');
  const pre2 = line(fresh(), 'f2f3', 'e7e5', 'g2g4');
  const mate = mv(pre2, B, 'd8h4');
  assert.deepEqual(notice(pre2, mate, { by: B, ad }), { baslik: 'Satranç bitti', metin: 'Gül mat etti' });
  const n = reduce(mate, { type: 'new', by: B, no: mate.no, now: 20 });
  assert.equal(notice(mate, n, { by: B, ad }).baslik, 'Yeni oyun');
});

test('resultOf ve material', () => {
  const s = line(fresh(), 'e2e4', 'd7d5', 'e4d5', 'd8d5');
  assert.deepEqual(resultOf(s), { winner: -1, reason: null, plies: 4, no: 1 });
  assert.deepEqual(material(s.caps), [1, 1]);
  assert.deepEqual(material([['q', 'p'], ['n']]), [10, 3]);
});

test('boardMaterial: tahtadaki taş puanı (terfi dahil)', () => {
  assert.deepEqual(boardMaterial(parseFen(START_FEN).board), [39, 39]);
  assert.deepEqual(boardMaterial(parseFen('7k/8/8/8/8/8/8/QQ5K w - - 0 1').board), [18, 0]);
});

test('newGame seq sürdürür', () => {
  const g = newGame({ players: [W, B], names, seq: 41, now: 3 });
  assert.equal(g.seq, 42);
});
