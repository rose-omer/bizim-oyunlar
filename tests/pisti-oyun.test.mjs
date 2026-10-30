import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  fullDeck, cardPoints, rankOf, suitOf, initialState, reduce, toAction, view, seat, isNewer, notice, resultOf,
  handSize, deckLeft, HEDEFLER,
} from '../games/pisti/oyun.js';

const A = 'omer', B = 'gul';
const names = { [A]: 'Ömer', [B]: 'Gül' };
const start = (o = {}) => initialState({ players: [A, B], names, now: 1, seed: 42, ...o });
// Elle kurulmuş durum: varsayılan sıra A'da (koltuk 0).
function st(patch) {
  return { ...start(), dealer: 1, turn: 0, hidden: 0, pile: [], deck: [], taken: [0, 0], pts: [0, 0], pp: [0, 0], lastCap: null, plays: 5, ...patch };
}
const play = (s, by, card, now = 9) => reduce(s, { type: 'play', by, card, now });

test('deste: 52 farklı kart; puanlı kartların toplamı 13', () => {
  const d = fullDeck();
  assert.equal(d.length, 52);
  assert.equal(new Set(d).size, 52);
  assert.equal(d.reduce((n, c) => n + cardPoints(c), 0), 13);
  assert.equal(cardPoints('2c'), 2);
  assert.equal(cardPoints('Td'), 3);
  assert.equal(cardPoints('Ah'), 1);
  assert.equal(cardPoints('Js'), 1);
  assert.equal(cardPoints('2d'), 0);
  assert.equal(cardPoints('Tc'), 0);
  assert.equal(rankOf('Td'), 'T');
  assert.equal(suitOf('Td'), 'd');
});

test('dağıtım: 4+4 el, yere 4 (3 kapalı), 40 kart destede; aynı tohum aynı dağıtım', () => {
  const s = start();
  assert.equal(s.kind, 'pisti');
  assert.equal(s.hands[0].length, 4);
  assert.equal(s.hands[1].length, 4);
  assert.equal(s.pile.length, 4);
  assert.equal(s.hidden, 3);
  assert.equal(s.deck.length, 40);
  assert.equal(new Set([...s.deck, ...s.hands[0], ...s.hands[1], ...s.pile]).size, 52);
  assert.deepEqual(start().hands, s.hands);
  assert.notDeepEqual(start({ seed: 7 }).hands, s.hands);
  assert.equal(s.turn, 1 - s.dealer);
  assert.equal(s.phase, 'play');
  assert.equal(s.el, 1);
  assert.equal(s.hedef, 151);
  assert.deepEqual(HEDEFLER, [0, 51, 151]);
});

test('kart atma: yalnız sırası gelen, elindeki kartı atar; eşleşme yoksa yere konur', () => {
  const s = st({ hands: [['5h', '9c'], ['Kd', '3s']], pile: ['7d'], deck: ['2h', '2s'] });
  assert.equal(play(s, B, 'Kd'), s);
  assert.equal(play(s, A, 'Kd'), s);
  const n = play(s, A, '5h');
  assert.deepEqual(n.pile, ['7d', '5h']);
  assert.deepEqual(n.hands[0], ['9c']);
  assert.equal(n.turn, 1);
  assert.equal(n.seq, s.seq + 1);
  assert.deepEqual(n.last, { by: 0, card: '5h', took: 0, pisti: 0 });
});

test('aynı değer yerdekilerin hepsini alır; kapalı kartlar da sayılır', () => {
  const s = st({ hands: [['7h', '9c'], ['Kd', '3s']], pile: ['2c', 'Ad', 'Td', '7d'], hidden: 3, deck: ['4h', '4s'] });
  const n = play(s, A, '7h');
  assert.deepEqual(n.pile, []);
  assert.equal(n.hidden, 0);
  assert.equal(n.taken[0], 5);
  assert.equal(n.pts[0], 2 + 1 + 3); // sinek 2, as, karo 10
  assert.equal(n.pp[0], 0);
  assert.equal(n.lastCap, 0);
  assert.equal(n.last.took, 5);
});

test('vale her yığını alır; boş yere atılan vale yerde kalır', () => {
  const s = st({ hands: [['Jh', '9c'], ['Kd', '3s']], pile: ['4d', '8s'], deck: ['5h', '5s'] });
  const n = play(s, A, 'Jh');
  assert.equal(n.taken[0], 3);
  assert.equal(n.pts[0], 1);
  assert.equal(n.pp[0], 0);
  const e = play(st({ hands: [['Jh', '9c'], ['Kd', '3s']], pile: [], deck: ['5h', '5s'] }), A, 'Jh');
  assert.deepEqual(e.pile, ['Jh']);
  assert.equal(e.taken[0], 0);
});

test('pişti: yerde tek kart varken aynı değer 10; valeye vale 20; tek karta vale pişti değil', () => {
  const base = { hands: [['8h', 'Jh'], ['Kd', '3s']], deck: ['5h', '5s'] };
  const p = play(st({ ...base, pile: ['8d'] }), A, '8h');
  assert.equal(p.pp[0], 10);
  assert.equal(p.last.pisti, 10);
  assert.equal(p.taken[0], 2);
  const v = play(st({ ...base, pile: ['Jc'] }), A, 'Jh');
  assert.equal(v.pp[0], 20);
  assert.equal(v.pts[0], 2);
  const j = play(st({ ...base, pile: ['8d'] }), A, 'Jh');
  assert.equal(j.pp[0], 0);
  assert.equal(j.last.pisti, 0);
  assert.equal(j.taken[0], 2);
  // iki kart varken aynı değer: alma var, pişti yok
  assert.equal(play(st({ ...base, pile: ['3c', '8d'] }), A, '8h').pp[0], 0);
});

test('eller bitince desteden 4\'er kart dağıtılır; sıra el açanda', () => {
  const s = st({ hands: [[], ['3s']], pile: ['9d'], deck: ['2h', '3h', '4h', '5h', '6h', '7h', '8h', '9h', 'Ts', 'Qs'], turn: 1 });
  const n = play(s, B, '3s');
  assert.equal(n.hands[0].length, 4);
  assert.equal(n.hands[1].length, 4);
  assert.equal(n.deck.length, 2);
  assert.equal(n.turn, 0);
  assert.equal(n.phase, 'play');
});

test('el sonu: kalan kartlar son alana; çoğunluk 3; tek el oyunu biter', () => {
  const s = st({
    hedef: 0, hands: [[], ['5c']], pile: ['Ac', '9d'], deck: [], turn: 1,
    taken: [30, 18], pts: [6, 3], pp: [10, 0], lastCap: 0,
  });
  const n = play(s, B, '5c');
  assert.equal(n.phase, 'end');
  assert.deepEqual(n.taken, [33, 18]);
  assert.deepEqual(n.elSonu, { taken: [33, 18], cogunluk: 0, kart: [7, 3], pisti: [10, 0], toplam: [20, 3] });
  assert.deepEqual(n.total, [20, 3]);
  assert.deepEqual(n.result, { winner: 0 });
  assert.equal(n.tally[A], 1);
  assert.equal(play(n, A, '5c'), n);
});

test('kart sayısı eşitse çoğunluk puanı yok; tek elde eşit puan berabere', () => {
  const s = st({ hedef: 0, hands: [[], ['5c']], pile: [], deck: [], turn: 1, taken: [25, 26], pts: [5, 8], pp: [0, 0], lastCap: 0 });
  const n = play(s, B, '5c');
  assert.equal(n.elSonu.cogunluk, -1);
  assert.deepEqual(n.total, [5, 8]);
  const t = play(st({ hedef: 0, hands: [[], ['5c']], pile: [], deck: [], turn: 1, taken: [25, 26], pts: [8, 8], pp: [0, 0], lastCap: 0 }), B, '5c');
  assert.deepEqual(t.result, { winner: -1 });
  assert.deepEqual(t.tally, {});
});

test('51 puanlık oyun: hedefe varılmadıysa el arası; sonraki el yeni dağıtır, dağıtan değişir', () => {
  const s = st({ hedef: 51, hands: [[], ['5c']], pile: [], deck: [], turn: 1, taken: [30, 21], pts: [5, 8], pp: [0, 0], lastCap: 0, total: [10, 4] });
  const n = play(s, B, '5c');
  assert.equal(n.phase, 'elsonu');
  assert.deepEqual(n.total, [18, 12]);
  assert.equal(reduce(n, { type: 'next', by: A, el: n.el + 1, seed: 3 }), n); // bayat/yanlış el
  const x = reduce(n, { type: 'next', by: A, el: n.el, seed: 3, now: 20 });
  assert.equal(x.el, n.el + 1);
  assert.equal(x.dealer, 1 - n.dealer);
  assert.equal(x.turn, 1 - x.dealer);
  assert.equal(x.phase, 'play');
  assert.equal(x.hands[0].length, 4);
  assert.equal(x.deck.length, 40);
  assert.deepEqual(x.taken, [0, 0]);
  assert.deepEqual(x.total, [18, 12]);
  assert.equal(x.lastCap, null);
});

test('hedefe varan kazanır; ikisi de geçip eşitse oyun sürer', () => {
  const win = play(st({ hedef: 51, hands: [[], ['5c']], pile: [], deck: [], turn: 1, taken: [30, 21], pts: [5, 8], pp: [10, 0], lastCap: 0, total: [40, 30] }), B, '5c');
  assert.equal(win.phase, 'end');
  assert.deepEqual(win.result, { winner: 0 });
  const tie = play(st({ hedef: 51, hands: [[], ['5c']], pile: [], deck: [], turn: 1, taken: [25, 26], pts: [5, 5], pp: [0, 0], lastCap: 0, total: [50, 50] }), B, '5c');
  assert.equal(tie.phase, 'elsonu');
});

test('görünüm: misafire yalnız kendi eli; deste ve kapalı kartlar gizli', () => {
  const s = start();
  const g = view(s, B);
  assert.deepEqual(g.hands[1], s.hands[1]);
  assert.equal(g.hands[0], 4);
  assert.equal(g.deck, 40);
  assert.deepEqual(g.pile.slice(0, 3), [null, null, null]);
  assert.equal(g.pile[3], s.pile[3]);
  assert.equal(JSON.stringify(g).includes(s.hands[0][0]), false);
  const none = view(s, null);
  assert.equal(none.hands[0], 4);
  assert.equal(none.hands[1], 4);
  assert.equal(handSize(g, 0), 4);
  assert.equal(handSize(s, 1), 4);
  assert.equal(deckLeft(g), 40);
  assert.equal(deckLeft(s), 40);
  assert.equal(view(s, A).deck, 40);
});

test('hedef seçimi yalnız ilk kart atılmadan', () => {
  const s = start();
  const h = reduce(s, { type: 'hedef', by: A, hedef: 51 });
  assert.equal(h.hedef, 51);
  assert.equal(reduce(s, { type: 'hedef', by: A, hedef: 77 }), s);
  assert.equal(reduce(s, { type: 'hedef', by: 'yabanci', hedef: 0 }), s);
  const p = play(s, s.players[s.turn], s.hands[s.turn][0]);
  assert.equal(reduce(p, { type: 'hedef', by: A, hedef: 0 }), p);
});

test('yeni oyun: puanlar sıfırlanır, galibiyetler kalır; bayat istek yok sayılır', () => {
  const s = { ...start(), total: [90, 40], tally: { [A]: 2 } };
  const n = reduce(s, { type: 'new', by: B, no: s.no, seed: 5, now: 30 });
  assert.equal(n.no, s.no + 1);
  assert.deepEqual(n.total, [0, 0]);
  assert.deepEqual(n.tally, { [A]: 2 });
  assert.equal(n.hedef, s.hedef);
  assert.equal(n.el, 1);
  assert.ok(n.seq > s.seq);
  assert.equal(n.dealer, 1 - s.dealer);
  assert.equal(reduce(n, { type: 'new', by: B, no: s.no, seed: 6 }), n);
});

test('toAction: tohum ev sahibinden; seat ve load yalnız ev sahibine', () => {
  const s = start();
  const ctx = { hostId: A, now: 7, seed: 99 };
  assert.deepEqual(toAction({ type: 'play', card: '5h' }, B, s, ctx), { type: 'play', by: B, card: '5h', now: 7 });
  assert.deepEqual(toAction({ type: 'next', el: 2 }, B, s, ctx), { type: 'next', by: B, el: 2, seed: 99, now: 7 });
  assert.deepEqual(toAction({ type: 'new', no: 1, seed: 1 }, B, s, ctx), { type: 'new', by: B, no: 1, seed: 99, now: 7 });
  assert.deepEqual(toAction({ type: 'hedef', hedef: 51 }, B, s, ctx), { type: 'hedef', by: B, hedef: 51, now: 7 });
  assert.equal(toAction({ type: 'seat', ids: [A, B] }, B, s, ctx), null);
  assert.ok(toAction({ type: 'seat', ids: [A, B] }, A, s, ctx));
  assert.equal(toAction({ type: 'load', s }, B, s, ctx), null);
  assert.equal(toAction({ type: 'yok' }, A, s, ctx), null);
});

test('seat ve load', () => {
  const s = initialState({ players: [A, '?'], names, now: 1, seed: 4 });
  const x = reduce(s, { type: 'seat', ids: [A, B], names: { [B]: 'Gül' } });
  assert.deepEqual(x.players, [A, B]);
  assert.deepEqual(x.hands, s.hands);
  assert.equal(seat(x, [A, B], {}), x);
  const newer = { ...x, seq: x.seq + 3 };
  assert.equal(reduce(x, { type: 'load', s: newer }), newer);
  assert.equal(reduce(newer, { type: 'load', s: x }), newer);
  assert.ok(isNewer(newer, x));
});

test('bildirim metni', () => {
  const ad = (id) => names[id];
  const s = st({ hands: [['8h', '9c'], ['Kd', '3s']], pile: ['8d'], deck: ['5h', '5s'] });
  assert.deepEqual(notice(s, play(s, A, '9c'), { by: A, ad }), { baslik: 'Sıra sende', metin: 'Pişti: Ömer kartını attı' });
  assert.deepEqual(notice(s, play(s, A, '8h'), { by: A, ad }), { baslik: 'Sıra sende', metin: 'Pişti: Ömer pişti yaptı!' });
  const e = st({ hedef: 0, hands: [[], ['5c']], pile: [], deck: [], turn: 1, taken: [30, 21], pts: [5, 12], pp: [0, 0], lastCap: 0 });
  assert.deepEqual(notice(e, play(e, B, '5c'), { by: B, ad }), { baslik: 'Pişti bitti', metin: 'Gül kazandı' });
  const m = st({ hedef: 51, hands: [[], ['5c']], pile: [], deck: [], turn: 1, taken: [30, 21], pts: [5, 8], pp: [0, 0], lastCap: 0 });
  assert.deepEqual(notice(m, play(m, B, '5c'), { by: B, ad }), { baslik: 'El bitti', metin: 'Pişti: 1. el bitti · Ömer 8 – 8 Gül' });
});

test('resultOf', () => {
  const e = play(st({ hedef: 0, hands: [[], ['5c']], pile: [], deck: [], turn: 1, taken: [30, 21], pts: [5, 8], pp: [10, 0], lastCap: 0 }), B, '5c');
  assert.deepEqual(resultOf(e), { winner: 0, total: [18, 8], el: 1, hedef: 0, no: 1 });
});

test('rastgele tam oyunlar: her el 52 kart ve 13 kart puanı dağıtır; oyun biter', () => {
  for (let g = 1; g <= 20; g++) {
    let s = initialState({ players: [A, B], names, now: 1, seed: g * 7919, hedef: 151 });
    let rnd = g;
    let els = 0;
    for (let step = 0; step < 5000 && s.phase !== 'end'; step++) {
      if (s.phase === 'elsonu') {
        assert.equal(s.elSonu.taken[0] + s.elSonu.taken[1], 52);
        assert.equal(s.elSonu.kart[0] + s.elSonu.kart[1], 13);
        els++;
        s = reduce(s, { type: 'next', by: A, el: s.el, seed: g * 31 + els, now: 2 });
        continue;
      }
      const hand = s.hands[s.turn];
      rnd = (rnd * 1103515245 + 12345) % 2147483648;
      s = play(s, s.players[s.turn], hand[rnd % hand.length]);
    }
    assert.equal(s.phase, 'end');
    assert.ok(Math.max(...s.total) >= 151);
    assert.equal(s.elSonu.taken[0] + s.elSonu.taken[1], 52);
  }
});
