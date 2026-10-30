// Aynı Kafa — saf durum makinesi. DOM'a dokunmaz.
// İkisi aynı anda a ya da b seçer. Süreyi ev sahibi tutar: `deadline` ev sahibi saatiyle.
// Eylemler: seat, config {count}, start {seed, now}, pick {by, choice 'a'|'b'},
//   timeout {round, now}, next {round, now}, rearm {now}, restart.
import { IKILILER } from './ikililer.js';
import { drawOrder } from '../_soru/rng.js';
import { seat, isSeat, makePlayers, percent, tier } from '../_soru/common.js';

export const COUNTS = [10, 15, 25];
export const DEFAULT_COUNT = 15;
export const PICK_MS = 10000;

const IDS = IKILILER.map((_, i) => i);

const TIERS = [
  [90, 'Ruh ikizi 💞'],
  [75, 'Aynı kafa, aynı kalp 🤝'],
  [55, 'Uyumlu ikili ✨'],
  [35, 'Tatlı zıtlar 🌗'],
  [0, 'Zıt kutuplar birbirini çeker 🧲'],
];

export function pairOf(id) {
  return IKILILER[id] || null;
}

export function initialState({ players, count = DEFAULT_COUNT } = {}) {
  return {
    game: 'aynikafa',
    phase: 'setup',
    players: makePlayers(players),
    count: COUNTS.includes(count) ? count : DEFAULT_COUNT,
    seed: 0,
    qs: [],
    round: 0,
    picks: [null, null],
    deadline: 0,
    matches: 0,
    log: [],
    used: [],
  };
}

const nowOf = (a) => Number(a.now) || 0;

function reveal(s, picks) {
  const m = picks[0] !== null && picks[0] === picks[1];
  return {
    ...s,
    picks,
    phase: 'reveal',
    matches: s.matches + (m ? 1 : 0),
    log: [...s.log, { q: s.qs[s.round], p: picks, m }],
  };
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
        picks: [null, null],
        deadline: nowOf(a) + PICK_MS,
        matches: 0,
        log: [],
      };
    }

    case 'pick': {
      if (s.phase !== 'pick' || !isSeat(a.by) || s.picks[a.by] !== null) return s;
      if (a.choice !== 'a' && a.choice !== 'b') return s;
      const picks = s.picks.slice();
      picks[a.by] = a.choice;
      if (picks[0] === null || picks[1] === null) return { ...s, picks };
      return reveal(s, picks);
    }

    case 'timeout':
      if (s.phase !== 'pick' || a.round !== s.round) return s;
      if (a.now != null && nowOf(a) < s.deadline) return s;
      return reveal(s, s.picks.slice());

    case 'next':
      if (s.phase !== 'reveal' || a.round !== s.round) return s;
      if (s.round + 1 >= s.qs.length) return { ...s, phase: 'end' };
      return { ...s, phase: 'pick', round: s.round + 1, picks: [null, null], deadline: nowOf(a) + PICK_MS };

    case 'rearm':
      if (s.phase !== 'pick') return s;
      return { ...s, deadline: nowOf(a) + PICK_MS };

    case 'restart':
      if (s.phase === 'setup') return s;
      return { ...s, phase: 'setup', qs: [], round: 0, picks: [null, null] };

    default:
      return s;
  }
}

/** Uyum yüzdesi ve unvan. */
export function result(s) {
  const pct = percent(s.matches, s.count);
  return { percent: pct, tier: tier(pct, TIERS) };
}
