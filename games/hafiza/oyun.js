// Hafıza Kartları: saf durum makinesi. Ev sahibi uygular, misafir yalnız çizer.
import { mulberry32, shuffle } from './rng.js';
import { themeById } from './temalar.js';

export const SIZES = [
  { id: '4x4', cols: 4, rows: 4, pairs: 8, label: '4×4' },
  { id: '4x6', cols: 4, rows: 6, pairs: 12, label: '4×6' },
  { id: '6x6', cols: 6, rows: 6, pairs: 18, label: '6×6' },
];
export const HIDE_MS = 900;

export function sizeById(id) {
  return SIZES.find((s) => s.id === id) || null;
}

// Konum başına emoji dizisi; her emoji tam iki kez.
export function deal(themeId, sizeId, seed) {
  const theme = themeById(themeId);
  const size = sizeById(sizeId);
  const rnd = mulberry32(seed);
  const picked = shuffle(theme.emoji, rnd).slice(0, size.pairs);
  return shuffle([...picked, ...picked], rnd);
}

export function initialState({ players = [], names = {} } = {}) {
  return { v: 1, phase: 'setup', theme: 'ask', size: '4x4', players, names, game: 0 };
}

export function reduce(s, a) {
  switch (a?.type) {
    case 'setup': {
      if (!themeById(a.theme) || !sizeById(a.size)) return s;
      const players = a.players?.length ? a.players : s.players;
      if (!players.length) return s;
      const deck = deal(a.theme, a.size, a.seed);
      const game = (s.game || 0) + 1;
      return {
        v: 1,
        phase: 'play',
        theme: a.theme,
        size: a.size,
        seed: a.seed,
        players,
        names: a.names || s.names || {},
        game,
        deck,
        owner: deck.map(() => -1),
        open: [],
        pending: false,
        turn: (game - 1) % players.length,
        scores: players.map(() => 0),
        moves: 0,
        startedAt: null,
        endedAt: null,
      };
    }
    case 'flip': {
      const i = a.i;
      if (s.phase !== 'play' || s.pending) return s;
      if (s.players[s.turn] !== a.by) return s;
      if (!Number.isInteger(i) || i < 0 || i >= s.deck.length) return s;
      if (s.owner[i] !== -1 || s.open.includes(i)) return s;
      const open = [...s.open, i];
      const startedAt = s.startedAt ?? a.now;
      if (open.length < 2) return { ...s, open, startedAt };
      const moves = s.moves + 1;
      const [x, y] = open;
      if (s.deck[x] !== s.deck[y]) return { ...s, open, startedAt, moves, pending: true };
      const owner = s.owner.slice();
      owner[x] = owner[y] = s.turn;
      const scores = s.scores.slice();
      scores[s.turn] += 1;
      const done = owner.every((o) => o !== -1);
      return {
        ...s, open: [], owner, scores, moves, startedAt,
        phase: done ? 'end' : 'play',
        endedAt: done ? a.now : null,
      };
    }
    case 'hide': {
      if (!s.pending) return s;
      return { ...s, open: [], pending: false, turn: (s.turn + 1) % s.players.length };
    }
    case 'menu':
      return { ...s, phase: 'setup' };
    default:
      return s;
  }
}

// Ev sahibi: gelen niyeti (kendi ya da misafir) eyleme çevirir. null = yok say.
export function toAction(intent, by, s, { hostId, now, seed, players, names }) {
  switch (intent?.type) {
    case 'flip':
      return { type: 'flip', i: intent.i, by, now };
    case 'again':
      if (s.phase !== 'end') return null;
      return { type: 'setup', theme: s.theme, size: s.size, seed, players: s.players, names: s.names, now };
    case 'setup':
      if (by !== hostId) return null;
      return {
        type: 'setup', theme: intent.theme, size: intent.size, seed,
        players: players || s.players, names: names || s.names, now,
      };
    case 'menu':
      return by === hostId ? { type: 'menu' } : null;
    default:
      return null;
  }
}

// Ev sahibi zamanlayıcısı: yanlış eşte kartları HIDE_MS sonra kapat.
export function schedule(s) {
  if (s.phase !== 'play' || !s.pending) return null;
  return { key: `hide:${s.game}:${s.moves}`, delay: HIDE_MS, action: { type: 'hide' } };
}

export function winnerOf(s) {
  if (s.scores.length < 2 || s.scores[0] === s.scores[1]) return -1;
  return s.scores[0] > s.scores[1] ? 0 : 1;
}

export function resultOf(s) {
  const seconds = s.startedAt != null && s.endedAt != null ? Math.round((s.endedAt - s.startedAt) / 1000) : null;
  const base = { mode: s.players.length > 1 ? 'duo' : 'solo', theme: s.theme, size: s.size, moves: s.moves, seconds };
  return s.players.length > 1 ? { ...base, scores: s.scores, winner: winnerOf(s) } : base;
}

// Alana en büyük kartları sığdıran yerleşim. Dikdörtgen boyutta çevrik yerleşimi de dener.
// Kart en fazla 1.3 kat uzun, hiçbir zaman yatık değil.
export function bestLayout(sizeId, W, H, gap) {
  const size = sizeById(sizeId);
  const opts = [{ cols: size.cols, rows: size.rows, transposed: false }];
  if (size.cols !== size.rows) opts.push({ cols: size.rows, rows: size.cols, transposed: true });
  let best = null;
  for (const o of opts) {
    const cw = (W - gap * (o.cols - 1)) / o.cols;
    const ch = (H - gap * (o.rows - 1)) / o.rows;
    const h = Math.max(0, Math.min(ch, cw * 1.3));
    const w = Math.max(0, Math.min(cw, h));
    if (!best || w > best.w + 0.5) best = { ...o, w: Math.floor(w), h: Math.floor(h) };
  }
  return best;
}
