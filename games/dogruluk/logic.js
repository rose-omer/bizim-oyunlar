// Doğruluk mu Cesaret mi — saf durum makinesi. DOM'a dokunmaz.
// Sırası gelen tür seçer, ev sahibi tekrarsız kart çeker, DİĞER oyuncu "yaptı" ya da "pas" der.
// Eylemler: seat, config {levels}, start {seed}, choose {by, kind}, mark {by, result 'done'|'pass'},
//   finish, restart.
import { CARDS } from './kartlar.js';
import { mulberry32, mix } from '../_soru/rng.js';
import { seat, isSeat, makePlayers } from '../_soru/common.js';

export const LEVELS = ['tatli', 'eglenceli', 'cesur'];
export const KINDS = ['dogruluk', 'cesaret'];
export const DEFAULT_LEVELS = ['tatli', 'eglenceli'];

const BY_ID = new Map(CARDS.map((c) => [c.id, c]));

export function cardById(id) {
  return BY_ID.get(id) || null;
}

/** Seçili seviyelerde verilen türdeki kartlar. */
export function poolFor(levels, kind) {
  return CARDS.filter((c) => c.kind === kind && levels.includes(c.level));
}

export function initialState({ players, levels = DEFAULT_LEVELS, solo = false } = {}) {
  return {
    game: 'dogruluk',
    phase: 'setup',
    players: makePlayers(players),
    levels: cleanLevels(levels) || DEFAULT_LEVELS.slice(),
    solo: !!solo,
    seed: 0,
    turn: 0,
    draws: 0,
    card: null,
    used: [],
    scores: [0, 0],
    passes: [0, 0],
    last: null,
  };
}

function cleanLevels(levels) {
  if (!Array.isArray(levels)) return null;
  const out = LEVELS.filter((l) => levels.includes(l));
  return out.length ? out : null;
}

function draw(s, kind) {
  const all = poolFor(s.levels, kind);
  if (!all.length) return s;
  let used = s.used;
  const seen = new Set(used);
  let avail = all.filter((c) => !seen.has(c.id));
  if (!avail.length) {
    const ids = new Set(all.map((c) => c.id));
    used = used.filter((id) => !ids.has(id));
    avail = all;
  }
  const r = mulberry32(mix(s.seed, s.draws));
  const card = avail[Math.floor(r() * avail.length)];
  return { ...s, phase: 'card', card: card.id, used: [...used, card.id], draws: s.draws + 1 };
}

export function reduce(s, a) {
  if (!s || !a) return s;
  switch (a.type) {
    case 'seat':
      return seat(s, a);

    case 'config': {
      if (s.phase !== 'setup') return s;
      const levels = cleanLevels(a.levels);
      if (!levels || levels.join() === s.levels.join()) return s;
      return { ...s, levels };
    }

    case 'start': {
      if (s.phase !== 'setup') return s;
      const seed = Number(a.seed) >>> 0;
      return {
        ...s,
        phase: 'choose',
        seed,
        turn: seed & 1,
        draws: 0,
        card: null,
        scores: [0, 0],
        passes: [0, 0],
        last: null,
      };
    }

    case 'choose':
      if (s.phase !== 'choose' || a.by !== s.turn || !KINDS.includes(a.kind)) return s;
      return draw(s, a.kind);

    case 'mark': {
      if (s.phase !== 'card' || !isSeat(a.by) || a.by !== 1 - s.turn) return s;
      if (a.result !== 'done' && a.result !== 'pass') return s;
      const scores = s.scores.slice();
      const passes = s.passes.slice();
      if (a.result === 'done') scores[s.turn] += 1;
      else passes[s.turn] += 1;
      return {
        ...s,
        phase: 'choose',
        scores,
        passes,
        last: { seat: s.turn, result: a.result },
        turn: 1 - s.turn,
        card: null,
      };
    }

    case 'finish':
      if (s.phase !== 'choose' && s.phase !== 'card') return s;
      return { ...s, phase: 'end' };

    case 'restart':
      if (s.phase === 'setup') return s;
      return { ...s, phase: 'setup', card: null, last: null };

    default:
      return s;
  }
}

/** Kazanan koltuk ya da berabere ise null. */
export function winner(s) {
  if (s.scores[0] === s.scores[1]) return null;
  return s.scores[0] > s.scores[1] ? 0 : 1;
}
