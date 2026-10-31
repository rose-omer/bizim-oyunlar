// Çiz Bakalım: oyun akışı için saf durum makinesi (çizgiler burada değil; bkz. cizgi.js).
// Modlar: 'serbest' (ortak tuval) ve 'tahmin' (biri çizer, diğeri tahmin eder; ortak puan).
import { mulberry32, shuffle } from '../hafiza/rng.js';
import { WORDS } from './kelimeler.js';

export const ROUND_MS = 80_000;
export const REVEAL_MS = 3_500;
export const MAX_GUESSES = 30;
export const MAX_GUESS_LEN = 40;
export const BASE_POINTS = 50;
export const ROUND_OPTIONS = [2, 3, 5];
export const DEFAULT_ROUNDS = 3;

const FOLD = { ı: 'i', ğ: 'g', ü: 'u', ş: 's', ö: 'o', ç: 'c', â: 'a', î: 'i', û: 'u' };

// tr-TR küçük harf, aksan sil, harf/rakam dışını boşluk yap, kırp, boşlukları daralt.
export function normalize(text) {
  return String(text ?? '')
    .toLocaleLowerCase('tr-TR')
    .replace(/[ığüşöçâîû]/g, (ch) => FOLD[ch])
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// Normalize sonrası tam eşleşme. Bitişik yazım da sayılır ("denizfeneri").
export function matches(guess, word) {
  const g = normalize(guess);
  const w = normalize(word);
  if (!g || !w) return false;
  return g === w || g.replaceAll(' ', '') === w.replaceAll(' ', '');
}

// "_ _ _ _ (4)"; çok sözcükte sözcük arası üç boşluk: "_ _ _ _ _   _ _ _ _ _ _ (5, 6)".
export function hintOf(word) {
  const parts = String(word).split(' ').filter(Boolean);
  const lens = parts.map((p) => Array.from(p).length);
  return `${lens.map((n) => Array(n).fill('_').join(' ')).join('   ')} (${lens.join(', ')})`;
}

export function wordAt(seed, ptr) {
  const order = shuffle(WORDS.map((_, i) => i), mulberry32(seed));
  return WORDS[order[ptr % order.length]];
}

export function initialState({ players = [], names = {} } = {}) {
  return { v: 1, phase: 'setup', mode: 'serbest', rounds: DEFAULT_ROUNDS, players, names, game: 0, board: 0 };
}

export const totalRounds = (s) => (s.rounds || DEFAULT_ROUNDS) * 2;
export const drawerId = (s) => (s.mode === 'tahmin' && s.players ? s.players[s.drawer] ?? null : null);

export function canDraw(s, id) {
  if (!s) return false;
  if (s.phase === 'free') return true;
  return s.phase === 'turn' && drawerId(s) === id;
}

function startRound(s, now) {
  const starter = (s.game - 1) % 2;
  return {
    ...s,
    phase: 'turn',
    drawer: (starter + s.round) % 2,
    word: wordAt(s.seed, s.ptr),
    ptr: s.ptr + 1,
    deadline: now + ROUND_MS,
    passes: 0,
    guesses: [],
    ok: null,
    gained: 0,
    revealUntil: 0,
    board: (s.board || 0) + 1,
  };
}

function reveal(s, ok, gained, now) {
  return {
    ...s,
    phase: 'reveal',
    ok,
    gained,
    score: s.score + gained,
    revealUntil: now + REVEAL_MS,
    history: [...s.history, { word: s.word, drawer: drawerId(s), ok, points: gained }],
  };
}

export function reduce(s, a) {
  switch (a?.type) {
    case 'setup': {
      const players = a.players?.length ? a.players : s.players;
      const names = a.names || s.names || {};
      const game = (s.game || 0) + 1;
      if (a.mode === 'serbest') {
        if (!players.length) return s;
        return { ...s, mode: 'serbest', phase: 'free', players, names, game, board: (s.board || 0) + 1 };
      }
      if (a.mode !== 'tahmin' || players.length !== 2) return s;
      const rounds = ROUND_OPTIONS.includes(a.rounds) ? a.rounds : DEFAULT_ROUNDS;
      return startRound({
        v: 1, mode: 'tahmin', players, names, game, rounds, seed: a.seed, ptr: 0, round: 0,
        score: 0, history: [], board: s.board || 0,
      }, a.now);
    }
    case 'guess': {
      if (s.phase !== 'turn') return s;
      if (!s.players.includes(a.by) || a.by === drawerId(s)) return s;
      const text = String(a.text ?? '').trim().slice(0, MAX_GUESS_LEN);
      if (!text) return s;
      if (a.now >= s.deadline) return reveal(s, false, 0, a.now);
      const ok = matches(text, s.word);
      const guesses = [...s.guesses, { by: a.by, text, ok }].slice(-MAX_GUESSES);
      if (!ok) return { ...s, guesses };
      const gained = BASE_POINTS + Math.ceil((s.deadline - a.now) / 1000);
      return reveal({ ...s, guesses }, true, gained, a.now);
    }
    case 'timeout':
      if (s.phase !== 'turn' || a.now < s.deadline) return s;
      return reveal(s, false, 0, a.now);
    case 'pass':
      if (s.phase !== 'turn' || a.by !== drawerId(s) || s.passes >= 1) return s;
      return { ...s, word: wordAt(s.seed, s.ptr), ptr: s.ptr + 1, passes: s.passes + 1 };
    case 'next': {
      if (s.phase !== 'reveal' || a.now < s.revealUntil) return s;
      const round = s.round + 1;
      if (round >= totalRounds(s)) return { ...s, phase: 'end', round };
      return startRound({ ...s, round }, a.now);
    }
    case 'menu':
      return { ...s, phase: 'setup' };
    default:
      return s;
  }
}

// Ev sahibi: niyet → eylem. timeout/next yalnız zamanlayıcıdan gelir.
export function toAction(intent, by, s, { hostId, now, seed, players, names }) {
  switch (intent?.type) {
    case 'guess':
      return { type: 'guess', text: intent.text, by, now };
    case 'pass':
      return { type: 'pass', by, now };
    case 'again':
      if (s.phase !== 'end') return null;
      return { type: 'setup', mode: s.mode, rounds: s.rounds, seed, players: s.players, names: s.names, now };
    case 'setup': {
      if (by !== hostId) return null;
      const rounds = ROUND_OPTIONS.includes(intent.rounds) ? intent.rounds : DEFAULT_ROUNDS;
      return { type: 'setup', mode: intent.mode, rounds, seed, players: players || s.players, names: names || s.names, now };
    }
    case 'menu':
      return by === hostId ? { type: 'menu' } : null;
    default:
      return null;
  }
}

export function schedule(s) {
  if (s.phase === 'turn') return { key: `t:${s.game}:${s.round}`, at: s.deadline, action: { type: 'timeout' } };
  if (s.phase === 'reveal') return { key: `r:${s.game}:${s.round}`, at: s.revealUntil, action: { type: 'next' } };
  return null;
}

// Bir oyuncunun görmesi gereken durum: tahmin eden kelimeyi görmez, ipucunu görür.
export function viewFor(s, viewerId) {
  if (s?.phase !== 'turn' || drawerId(s) === viewerId) return s;
  return { ...s, word: null, hint: hintOf(s.word) };
}

export function resultOf(s) {
  const ok = (s.history || []).filter((h) => h.ok).length;
  return { mode: 'tahmin', rounds: s.rounds, total: totalRounds(s), ok, score: s.score };
}

/**
 * Tuvaldeki çizim → Anılar'a yazılacak 'ani' verisi. Tahmin turundaki kelime başlığa girmez (sevgili görmesin).
 * url: yüklenen fotoğraf; gun: 'YYYY-MM-DD'; birlikte: iki kişi aynı tuvaldeydi.
 */
export function cizimAnisi({ url, gun, birlikte = false } = {}) {
  if (!url || !/^\d{4}-\d{2}-\d{2}$/.test(gun || '')) return null;
  return { baslik: birlikte ? 'Birlikte çizdik 🎨' : 'Çizimim 🎨', tarih: gun, fotolar: [url], etiketler: ['çizim'] };
}
