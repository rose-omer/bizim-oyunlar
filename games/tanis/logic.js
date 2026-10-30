// Beni Ne Kadar Tanıyorsun? — saf durum makinesi. DOM'a dokunmaz.
// Her turda bir "özne" kendini cevaplar, diğeri tahmin eder; özne sırayla değişir.
// Eylemler: seat, config {count}, start {seed}, pick {by, choice 0..3}, next {round}, restart.
import { SORULAR } from './sorular.js';
import { drawOrder } from '../_soru/rng.js';
import { seat, isSeat, makePlayers, percent, tier } from '../_soru/common.js';

export const COUNTS = [6, 10, 16];
export const DEFAULT_COUNT = 10;

const IDS = SORULAR.map((q) => q.id);
const BY_ID = new Map(SORULAR.map((q) => [q.id, q]));

const TIERS = [
  [90, 'Ruh okuyucular 🔮'],
  [70, 'Birbirinizin kitabısınız 📖'],
  [50, 'Tatlı tahminciler 💞'],
  [30, 'Keşfedecek çok şey var 🗺️'],
  [0, 'Yeni sayfalar açılıyor ✨'],
];

export function questionById(id) {
  return BY_ID.get(id) || null;
}

export function initialState({ players, count = DEFAULT_COUNT } = {}) {
  return {
    game: 'tanis',
    phase: 'setup',
    players: makePlayers(players),
    count: COUNTS.includes(count) ? count : DEFAULT_COUNT,
    seed: 0,
    qs: [],
    round: 0,
    first: 0,
    picks: [null, null],
    scores: [0, 0],
    asked: [0, 0],
    used: [],
  };
}

/** Bu turda kendini cevaplayan koltuk. */
export function subjectOf(s) {
  return (s.first + s.round) % 2;
}

export function reduce(s, a) {
  if (!s || !a) return s;
  switch (a.type) {
    case 'seat':
      return seat(s, a);

    case 'config':
      if (s.phase !== 'setup' || !COUNTS.includes(a.count) || a.count === s.count) return s;
      return { ...s, count: a.count };

    case 'start': {
      if (s.phase !== 'setup') return s;
      const seed = Number(a.seed) >>> 0;
      const { order, used } = drawOrder(IDS, s.count, seed, s.used);
      return {
        ...s,
        phase: 'pick',
        seed,
        qs: order,
        used,
        round: 0,
        first: seed & 1,
        picks: [null, null],
        scores: [0, 0],
        asked: [0, 0],
      };
    }

    case 'pick': {
      if (s.phase !== 'pick' || !isSeat(a.by) || s.picks[a.by] !== null) return s;
      if (!Number.isInteger(a.choice) || a.choice < 0 || a.choice > 3) return s;
      const picks = s.picks.slice();
      picks[a.by] = a.choice;
      if (picks[0] === null || picks[1] === null) return { ...s, picks };
      const guesser = 1 - subjectOf(s);
      const scores = s.scores.slice();
      const asked = s.asked.slice();
      asked[guesser] += 1;
      if (picks[0] === picks[1]) scores[guesser] += 1;
      return { ...s, picks, scores, asked, phase: 'reveal' };
    }

    case 'next':
      if (s.phase !== 'reveal' || a.round !== s.round) return s;
      if (s.round + 1 >= s.qs.length) return { ...s, phase: 'end' };
      return { ...s, phase: 'pick', round: s.round + 1, picks: [null, null] };

    case 'restart':
      if (s.phase === 'setup') return s;
      return { ...s, phase: 'setup', qs: [], round: 0, picks: [null, null] };

    default:
      return s;
  }
}

/** Bitiş özeti. per[i] = i koltuğunun tahmin başarısı (sevgilisi hakkında). */
export function result(s) {
  const correct = s.scores[0] + s.scores[1];
  const of = s.asked[0] + s.asked[1];
  const pct = percent(correct, of);
  return {
    percent: pct,
    tier: tier(pct, TIERS),
    per: [0, 1].map((i) => ({ correct: s.scores[i], of: s.asked[i] })),
  };
}
