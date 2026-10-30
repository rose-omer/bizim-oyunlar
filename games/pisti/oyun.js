// Pişti: saf kurallar ve durum makinesi. DOM yok; ev sahibi uygular, misafir yalnız kendi elini görür.
//
// Kart: 2 karakter, değer + renk. Değer 'A23456789TJQK' (T = 10), renk 's' maça, 'h' kupa, 'd' karo, 'c' sinek.
// Kurallar:
//  - 52 kart, tohumlu karıştırma (ev sahibi). Her ele 4'er kart; elin başında yere 4 kart (3 kapalı, sonuncusu açık).
//  - Dağıtmayan başlar; sırayla birer kart atılır. Eller bitince desteden yeniden 4'er kart (yere kart açılmaz).
//  - Yerdeki üst kartla aynı değerde kart ya da vale yerdeki bütün kartları alır.
//  - Yerde tek kart varken aynı değerle almak pişti: 10 puan; valeye vale 20 puan (tek karta başka valeyle alma pişti değil).
//  - Sayım (el sonunda): kart çoğunluğu 3, sinek 2'si 2, karo 10'u 3, her as ve vale 1. Eşit kartta çoğunluk puanı yok.
//  - Destenin sonunda yerde kalan kartları son alan oyuncu alır.
//  - Hedef: 0 = tek el (çok puan alan kazanır), 51 ya da 151 = el sonunda hedefe varan kazanır;
//    ikisi de vardıysa çok olan; eşitse bir el daha.
// Gizli bilgi: deste ve eller tam durumda durur (ev sahibi ve kayıt). Misafire view(s, id) gider.
import { mulberry32, shuffle } from '../hafiza/rng.js';
import { seat, isNewer } from '../dama/oyun.js';

export { seat, isNewer };

export const RANKS = 'A23456789TJQK';
export const SUITS = 'shdc';
export const HEDEFLER = [0, 51, 151];
const HAND = 4;

export const rankOf = (c) => c[0];
export const suitOf = (c) => c[1];

export function fullDeck() {
  const out = [];
  for (const s of SUITS) for (const r of RANKS) out.push(r + s);
  return out;
}

/** Kartın sayım puanı (pişti ve çoğunluk hariç). */
export function cardPoints(c) {
  if (c === '2c') return 2;
  if (c === 'Td') return 3;
  const r = rankOf(c);
  return r === 'A' || r === 'J' ? 1 : 0;
}

const sumPoints = (cards) => cards.reduce((n, c) => n + cardPoints(c), 0);

/** Yeni el: karıştır, dağıt. */
function deal(s, { el, dealer, seed }) {
  const deck = shuffle(fullDeck(), mulberry32(seed >>> 0));
  const first = 1 - dealer;
  const hands = [[], []];
  hands[first] = deck.splice(-HAND);
  hands[dealer] = deck.splice(-HAND);
  const pile = deck.splice(-4);
  return {
    ...s,
    el,
    dealer,
    turn: first,
    deck,
    hands,
    pile,
    hidden: 3,
    taken: [0, 0],
    pts: [0, 0],
    pp: [0, 0],
    lastCap: null,
    last: null,
    plays: 0,
    phase: 'play',
    elSonu: null,
  };
}

export function newGame({ players, names = {}, no = 1, tally = {}, seq = 0, now = null, hedef = 151, seed = 1 }) {
  const base = {
    v: 1,
    kind: 'pisti',
    no,
    seq: seq + 1,
    at: now,
    startedAt: now,
    players: players.slice(0, 2),
    names: { ...names },
    hedef: HEDEFLER.includes(hedef) ? hedef : 151,
    total: [0, 0],
    result: null,
    tally: { ...tally },
  };
  return deal(base, { el: 1, dealer: (no - 1) % 2, seed });
}

export function initialState({ players, names, now = null, seed = 1, hedef = 151 }) {
  return newGame({ players, names, now, seed, hedef });
}

function bump(s, now, patch) {
  return { ...s, ...patch, seq: s.seq + 1, at: now ?? s.at };
}

// El bitti: kalanlar son alana, çoğunluk, toplam, oyun sonu kararı.
function closeEl(s) {
  const taken = s.taken.slice();
  const pts = s.pts.slice();
  if (s.lastCap != null && s.pile.length) {
    taken[s.lastCap] += s.pile.length;
    pts[s.lastCap] += sumPoints(s.pile);
  }
  const cogunluk = taken[0] === taken[1] ? -1 : taken[0] > taken[1] ? 0 : 1;
  const toplam = [0, 1].map((i) => pts[i] + s.pp[i] + (cogunluk === i ? 3 : 0));
  const total = s.total.map((t, i) => t + toplam[i]);
  let result = null;
  if (s.hedef === 0) result = { winner: total[0] === total[1] ? -1 : total[0] > total[1] ? 0 : 1 };
  else if (Math.max(...total) >= s.hedef && total[0] !== total[1]) result = { winner: total[0] > total[1] ? 0 : 1 };
  const tally = { ...s.tally };
  if (result && result.winner >= 0) {
    const id = s.players[result.winner];
    tally[id] = (tally[id] || 0) + 1;
  }
  return {
    pile: s.lastCap != null ? [] : s.pile,
    hidden: 0,
    taken,
    pts,
    total,
    elSonu: { taken, cogunluk, kart: pts, pisti: s.pp.slice(), toplam },
    phase: result ? 'end' : 'elsonu',
    result,
    tally,
  };
}

export function reduce(s, a) {
  switch (a?.type) {
    case 'play': {
      if (s.phase !== 'play' || s.players[s.turn] !== a.by) return s;
      const t = s.turn;
      const hand = s.hands[t];
      if (!Array.isArray(hand) || !hand.includes(a.card)) return s;
      const hands = s.hands.map((h, i) => (i === t ? h.filter((c) => c !== a.card) : h));
      const top = s.pile[s.pile.length - 1];
      const r = rankOf(a.card);
      let next;
      if (top && (r === rankOf(top) || r === 'J')) {
        const pisti = s.pile.length === 1 && r === rankOf(top) ? (r === 'J' ? 20 : 10) : 0;
        const won = [...s.pile, a.card];
        const at = (arr, v) => arr.map((x, i) => (i === t ? x + v : x));
        next = {
          pile: [],
          hidden: 0,
          taken: at(s.taken, won.length),
          pts: at(s.pts, sumPoints(won)),
          pp: at(s.pp, pisti),
          lastCap: t,
          last: { by: t, card: a.card, took: won.length, pisti },
        };
      } else {
        next = { pile: [...s.pile, a.card], last: { by: t, card: a.card, took: 0, pisti: 0 } };
      }
      let n = { ...s, ...next, hands, turn: 1 - t, plays: s.plays + 1 };
      if (!hands[0].length && !hands[1].length) {
        if (s.deck.length) {
          const deck = s.deck.slice();
          const h = [[], []];
          const first = 1 - s.dealer;
          h[first] = deck.splice(-HAND);
          h[s.dealer] = deck.splice(-HAND);
          n = { ...n, deck, hands: h, turn: first };
        } else {
          n = { ...n, ...closeEl(n) };
        }
      }
      return bump(n, a.now, { startedAt: s.startedAt ?? a.now ?? null });
    }
    case 'next': {
      if (s.phase !== 'elsonu' || a.el !== s.el || !s.players.includes(a.by)) return s;
      return bump(deal(s, { el: s.el + 1, dealer: 1 - s.dealer, seed: a.seed }), a.now, {});
    }
    case 'hedef': {
      if (!HEDEFLER.includes(a.hedef) || !s.players.includes(a.by)) return s;
      if (s.phase !== 'play' || s.el !== 1 || s.plays > 0 || s.hedef === a.hedef) return s;
      return bump(s, a.now, { hedef: a.hedef });
    }
    case 'new': {
      // a.no = isteyenin gördüğü oyun: iki taraf aynı anda "Rövanş" derse ikincisi yok sayılır.
      if (!s.players.includes(a.by) || a.no !== s.no) return s;
      return newGame({
        players: s.players,
        names: s.names,
        no: s.no + 1,
        tally: s.tally,
        seq: s.seq,
        now: a.now,
        hedef: s.hedef,
        seed: a.seed,
      });
    }
    case 'seat':
      return seat(s, a.ids, a.names);
    case 'load':
      return isNewer(a.s, s) && a.s.kind === s.kind ? a.s : s;
    default:
      return s;
  }
}

// Ev sahibi: niyeti eyleme çevirir; tohum ev sahibinden gelir. null = yok say.
export function toAction(intent, by, s, { hostId, now, seed }) {
  switch (intent?.type) {
    case 'play':
      return { type: 'play', by, card: intent.card, now };
    case 'next':
      return { type: 'next', by, el: intent.el, seed, now };
    case 'new':
      return { type: 'new', by, no: intent.no, seed, now };
    case 'hedef':
      return { type: 'hedef', by, hedef: intent.hedef, now };
    case 'seat':
      return by === hostId ? { type: 'seat', ids: intent.ids, names: intent.names } : null;
    case 'load':
      return by === hostId ? { type: 'load', s: intent.s } : null;
    default:
      return null;
  }
}

/**
 * Bir oyuncunun göreceği durum: kendi eli açık; öbür el, deste ve yerdeki kapalı kartlar yalnız sayı.
 * forId oyuncu değilse iki el de gizli.
 */
export function view(s, forId) {
  if (!s || !Array.isArray(s.deck)) return s;
  const me = s.players.indexOf(forId);
  return {
    ...s,
    deck: s.deck.length,
    hands: s.hands.map((h, i) => (i === me ? h : h.length)),
    pile: s.pile.map((c, i) => (i < s.hidden ? null : c)),
  };
}

export const handSize = (s, i) => (Array.isArray(s.hands[i]) ? s.hands[i].length : s.hands[i]);
export const deckLeft = (s) => (Array.isArray(s.deck) ? s.deck.length : s.deck);

/** Sıra partnere geçince ona gidecek bildirim. by = değişikliği yapan, ad(id) = görünen ad. */
export function notice(prev, s, { by, ad }) {
  if (s.phase === 'end' && prev.phase !== 'end') {
    const w = s.result?.winner;
    return { baslik: 'Pişti bitti', metin: w === -1 ? 'Berabere bitti' : `${ad(s.players[w])} kazandı` };
  }
  if (s.phase === 'elsonu' && prev.phase !== 'elsonu') {
    return { baslik: 'El bitti', metin: `Pişti: ${s.el}. el bitti · ${ad(s.players[0])} ${s.total[0]} – ${s.total[1]} ${ad(s.players[1])}` };
  }
  if (s.no !== prev.no) return { baslik: 'Yeni oyun', metin: `Pişti: ${ad(by)} yeni oyun başlattı` };
  if (s.el !== prev.el) return { baslik: 'Sıra sende', metin: `Pişti: ${s.el}. el başladı` };
  return { baslik: 'Sıra sende', metin: s.last?.pisti ? `Pişti: ${ad(by)} pişti yaptı!` : `Pişti: ${ad(by)} kartını attı` };
}

export function resultOf(s) {
  return { winner: s.result?.winner ?? -1, total: s.total.slice(), el: s.el, hedef: s.hedef, no: s.no };
}
