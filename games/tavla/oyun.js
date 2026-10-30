// Tavla: saf kurallar ve durum makinesi. DOM yok; ev sahibi uygular, misafir yalnız çizer.
//
// Kurallar (standart tavla / backgammon, Türk puanlaması):
//  - 24 hane, 15'er pul. İki zar; çift gelirse 4 hamle.
//  - Mümkün olan en çok zar oynanır. Zarlardan yalnız biri oynanabiliyorsa büyüğü oynanır (oynanabiliyorsa).
//  - Kırık pul (bar) önce girer. Tek pul vurulur; 2+ pul olan hane (kapı) kapalıdır.
//  - Toplama yalnız tüm pullar iç bölgedeyken. Zar tam haneyi tutmazsa, daha geride pul yoksa
//    büyük zarla en arkadaki haneden toplanır.
//  - Oyun 1 puan; rakip hiç pul toplamadıysa mars: 2 puan. Maç 3/5/7 puana kadar.
//  - Açılış: iki oyuncu birer zar atar, büyük atan başlar ve kendi zarlarını atar. Sonraki oyunu
//    önceki oyunun kazananı başlatır.
//  - Zarlar ev sahibinde tohumlu RNG ile hesaplanır (seed durumda; misafire ve kayda gönderilmez).
//    Tohumsuz durum (kayıttan sürdürülen) ilk zarda ev sahibinin verdiği yeni tohumla sürer.
//
// Konum: points[24] işaretli sayılar (+ oyuncu 0, − oyuncu 1). Oyuncu 0 23→0 yönünde gider,
// iç bölgesi 0–5; oyuncu 1 0→23 yönünde gider, iç bölgesi 18–23.
import { mulberry32 } from '../hafiza/rng.js';

export const BAR = 'bar';
export const OFF = 'off';
export const CHECKERS = 15;
export const TARGETS = [3, 5, 7];
export const PASS_MS = 1800;

const SIGN = [1, -1];

export function initialPoints() {
  const p = Array(24).fill(0);
  p[23] = 2; p[12] = 5; p[7] = 3; p[5] = 5;
  p[0] = -2; p[11] = -5; p[16] = -3; p[18] = -5;
  return p;
}

export function countAt(points, i, pl) {
  const v = points[i] * SIGN[pl];
  return v > 0 ? v : 0;
}

/** Hanenin oyuncuya göre toplamaya uzaklığı (1–24); bar = 25. */
export function pipOf(pl, i) {
  if (i === BAR) return 25;
  return pl === 0 ? i + 1 : 24 - i;
}

export function pipCount(pos, pl) {
  let n = pos.bar[pl] * 25;
  for (let i = 0; i < 24; i++) n += countAt(pos.points, i, pl) * pipOf(pl, i);
  return n;
}

function allHome(pos, pl) {
  if (pos.bar[pl] > 0) return false;
  for (let i = 0; i < 24; i++) if (countAt(pos.points, i, pl) && pipOf(pl, i) > 6) return false;
  return true;
}

function fartherThan(pos, pl, i) {
  const d = pipOf(pl, i);
  for (let j = 0; j < 24; j++) if (countAt(pos.points, j, pl) && pipOf(pl, j) > d) return true;
  return false;
}

/** Tek zarla yapılabilecek adımlar (en çok zar kuralı uygulanmadan). */
export function stepsFor(pos, pl, die) {
  const out = [];
  const opp = 1 - pl;
  const open = (t) => countAt(pos.points, t, opp) < 2;
  const hit = (t) => countAt(pos.points, t, opp) === 1;
  if (pos.bar[pl] > 0) {
    const t = pl === 0 ? 24 - die : die - 1;
    if (open(t)) out.push({ from: BAR, to: t, die, hit: hit(t) });
    return out;
  }
  const bear = allHome(pos, pl);
  for (let i = 0; i < 24; i++) {
    if (!countAt(pos.points, i, pl)) continue;
    const t = pl === 0 ? i - die : i + die;
    if (t >= 0 && t <= 23) {
      if (open(t)) out.push({ from: i, to: t, die, hit: hit(t) });
    } else if (bear) {
      const d = pipOf(pl, i);
      if (d === die || (d < die && !fartherThan(pos, pl, i))) out.push({ from: i, to: OFF, die, hit: false });
    }
  }
  return out;
}

export function applyStep(pos, pl, st) {
  const points = pos.points.slice();
  const bar = pos.bar.slice();
  const off = pos.off.slice();
  if (st.from === BAR) bar[pl]--;
  else points[st.from] -= SIGN[pl];
  if (st.to === OFF) off[pl]++;
  else {
    if (countAt(points, st.to, 1 - pl) === 1) {
      points[st.to] = 0;
      bar[1 - pl]++;
    }
    points[st.to] += SIGN[pl];
  }
  return { points, bar, off };
}

function removeOne(left, die) {
  const i = left.indexOf(die);
  return i < 0 ? left : [...left.slice(0, i), ...left.slice(i + 1)];
}
const uniq = (a) => [...new Set(a)];

// En çok kaç zar oynanabilir? Aynı konumlar tekrar tekrar gelir: önbellek.
const memo = new Map();
function maxDice(pos, pl, left) {
  if (!left.length) return 0;
  const key = `${pl}|${pos.points.join(',')}|${pos.bar.join(',')}|${pos.off.join(',')}|${left.join(',')}`;
  const hit = memo.get(key);
  if (hit !== undefined) return hit;
  let best = 0;
  outer: for (const die of uniq(left)) {
    for (const st of stepsFor(pos, pl, die)) {
      const n = 1 + maxDice(applyStep(pos, pl, st), pl, removeOne(left, die));
      if (n > best) best = n;
      if (best === left.length) break outer;
    }
  }
  if (memo.size > 50000) memo.clear();
  memo.set(key, best);
  return best;
}

/** Kurala uygun ilk adımlar: en çok zarı oynatan yolların başı; tek zar oynanabiliyorsa büyük zar. */
export function legalSteps(pos, pl, left) {
  if (!left?.length) return [];
  const total = maxDice(pos, pl, left);
  if (!total) return [];
  let out = [];
  for (const die of uniq(left)) {
    for (const st of stepsFor(pos, pl, die)) {
      if (1 + maxDice(applyStep(pos, pl, st), pl, removeOne(left, die)) === total) out.push(st);
    }
  }
  if (total === 1 && left.length === 2 && left[0] !== left[1]) {
    const hi = Math.max(...left);
    if (out.some((st) => st.die === hi)) out = out.filter((st) => st.die === hi);
  }
  return out;
}

export function diceAt(seed, n) {
  const r = mulberry32(((seed >>> 0) ^ Math.imul(n + 1, 0x9e3779b1)) >>> 0);
  return [1 + Math.floor(r() * 6), 1 + Math.floor(r() * 6)];
}

/** Açılış zarı: [oyuncu 0, oyuncu 1], eşit gelmez (eşitse yeniden atılır). */
export function openingRoll(seed) {
  const s = ((seed >>> 0) ^ 0xa5a5a5a5) >>> 0;
  for (let k = 0; k < 100; k++) {
    const d = diceAt(s, k);
    if (d[0] !== d[1]) return d;
  }
  return [6, 1];
}

// ---------- Durum ----------

export const posOf = (s) => ({ points: s.points, bar: s.bar, off: s.off });

function freshBoard() {
  return {
    points: initialPoints(), bar: [0, 0], off: [0, 0],
    dice: null, left: [], steps: [], stack: [], noMove: false, last: null, result: null,
  };
}

export function initialState({ players, names = {}, target = 5, now = null }) {
  return {
    v: 1, kind: 'tavla', seq: 1, at: now, startedAt: null,
    players: players.slice(0, 2), names: { ...names },
    target, score: [0, 0], game: 0, match: 0, rolls: 0, seed: null, opening: null,
    phase: 'setup', turn: 0,
    ...freshBoard(),
  };
}

function bump(s, now, patch) {
  return { ...s, ...patch, seq: s.seq + 1, at: now ?? s.at };
}

function endTurn(s, now) {
  const pl = s.turn;
  const last = { by: pl, dice: s.dice, steps: s.steps };
  if (s.off[pl] >= CHECKERS) {
    const mars = s.off[1 - pl] === 0;
    const pts = mars ? 2 : 1;
    const score = s.score.slice();
    score[pl] += pts;
    return bump(s, now, {
      score, last, left: [], stack: [], noMove: false,
      phase: score[pl] >= s.target ? 'matchover' : 'gameover',
      result: { winner: pl, pts, mars },
    });
  }
  return bump(s, now, { turn: 1 - pl, phase: 'roll', last, left: [], steps: [], stack: [], noMove: false });
}

export function reduce(s, a) {
  const isPlayer = (id) => !!id && s.players.includes(id);
  const isTurn = (id) => s.players[s.turn] === id;
  switch (a?.type) {
    case 'match': {
      if (!isPlayer(a.by) || !TARGETS.includes(a.target) || !Number.isInteger(a.seed)) return s;
      // a.match = isteyenin gördüğü maç: iki taraf aynı anda "Başla" derse ikincisi yok sayılır.
      if (a.match !== (s.match || 0)) return s;
      // Süren maç yalnız bilerek ("Yeni maç" onayı) sıfırlanır.
      if (s.phase !== 'setup' && s.phase !== 'matchover' && !a.restart) return s;
      const opening = openingRoll(a.seed);
      return bump(s, a.now, {
        ...freshBoard(),
        target: a.target, score: [0, 0], game: 1, match: (s.match || 0) + 1,
        seed: a.seed >>> 0, rolls: 0, opening,
        turn: opening[0] > opening[1] ? 0 : 1,
        phase: 'roll', startedAt: a.now ?? null,
      });
    }
    case 'roll': {
      const seed = s.seed ?? (Number.isInteger(a.seed) ? a.seed >>> 0 : null);
      if (s.phase !== 'roll' || !isTurn(a.by) || seed == null) return s;
      const dice = diceAt(seed, s.rolls);
      const left = dice[0] === dice[1] ? [dice[0], dice[0], dice[0], dice[0]] : dice.slice();
      const noMove = legalSteps(posOf(s), s.turn, left).length === 0;
      return bump(s, a.now, { seed, dice, left, steps: [], stack: [], noMove, rolls: s.rolls + 1, phase: 'move', opening: null });
    }
    case 'play': {
      if (s.phase !== 'move' || s.noMove || !isTurn(a.by)) return s;
      if (!Array.isArray(a.steps) || !a.steps.length || a.steps.length > 4) return s;
      let pos = posOf(s);
      let left = s.left;
      const steps = s.steps.slice();
      const stack = s.stack.slice();
      for (const want of a.steps) {
        const st = legalSteps(pos, s.turn, left).find((x) => x.from === want?.from && x.die === want?.die);
        if (!st) return s;
        stack.push({ ...pos, left, steps: steps.slice() });
        pos = applyStep(pos, s.turn, st);
        left = removeOne(left, st.die);
        steps.push(st);
      }
      const next = { ...s, ...pos, left, steps, stack };
      const done = pos.off[s.turn] >= CHECKERS || !left.length || !legalSteps(pos, s.turn, left).length;
      return done ? endTurn(next, a.now) : bump(next, a.now, {});
    }
    case 'undo': {
      if (s.phase !== 'move' || !isTurn(a.by) || !s.stack.length) return s;
      const top = s.stack[s.stack.length - 1];
      return bump(s, a.now, {
        points: top.points, bar: top.bar, off: top.off, left: top.left, steps: top.steps,
        stack: s.stack.slice(0, -1),
      });
    }
    case 'pass': {
      if (s.phase !== 'move' || !s.noMove) return s;
      return endTurn(s, a.now);
    }
    case 'next': {
      if (s.phase !== 'gameover' || !isPlayer(a.by)) return s;
      return bump(s, a.now, { ...freshBoard(), game: s.game + 1, turn: s.result.winner, phase: 'roll', opening: null });
    }
    case 'seat':
      return seat(s, a.ids, a.names);
    case 'load':
      return isNewer(a.s, s) && a.s.kind === s.kind ? a.s : s;
    default:
      return s;
  }
}

/** Koltuk eşleme: ids = [ben, partner]; kayıttaki tek bilinen kimliğin öbür koltuğuna diğeri oturur. */
export function seat(s, ids, names) {
  const [a, b] = ids || [];
  if (!a || !b || a === b) return s;
  const has = (x) => s.players.includes(x);
  let players = s.players;
  if (has(a) && !has(b)) players = s.players.map((x) => (x === a ? a : b));
  else if (has(b) && !has(a)) players = s.players.map((x) => (x === b ? b : a));
  const nm = { ...s.names, ...(names || {}) };
  const sameNames = Object.keys(nm).every((k) => s.names?.[k] === nm[k]);
  if (players === s.players && sameNames) return s;
  return { ...s, players, names: nm, seq: s.seq + 1 };
}

export function isNewer(x, y) {
  if (!x || typeof x.seq !== 'number') return false;
  if (!y) return true;
  if (x.seq !== y.seq) return x.seq > y.seq;
  return (x.at || 0) > (y.at || 0);
}

export function toAction(intent, by, s, { hostId, now, seed }) {
  switch (intent?.type) {
    case 'roll': return { type: 'roll', by, seed, now };
    case 'play': return { type: 'play', by, steps: intent.steps, now };
    case 'undo': return { type: 'undo', by, now };
    case 'next': return { type: 'next', by, now };
    case 'match': return { type: 'match', by, target: intent.target, match: intent.match, restart: !!intent.restart, seed, now };
    case 'seat': return by === hostId ? { type: 'seat', ids: intent.ids, names: intent.names } : null;
    case 'load': return by === hostId ? { type: 'load', s: intent.s } : null;
    default: return null;
  }
}

/** Ev sahibi zamanlayıcısı: oynanacak hamle yoksa kısa bir süre sonra sıra geçer. */
export function schedule(s) {
  if (s.phase !== 'move' || !s.noMove) return null;
  return { key: `pass:${s.seq}`, delay: PASS_MS, action: { type: 'pass' } };
}

/** Misafire giden görünüm: zar tohumu gizlenir. */
export function view(s) {
  if (!s || s.seed == null) return s;
  return { ...s, seed: null };
}

// ---------- Arayüz yardımcıları ----------

/** Sıradaki oyuncunun oynatabileceği pulların yerleri (hane indeksi ya da BAR). */
export function movable(s) {
  if (s.phase !== 'move' || s.noMove) return [];
  return uniq(legalSteps(posOf(s), s.turn, s.left).map((st) => st.from));
}

/** Bir puldan gidilebilecek hedefler: tek zar ya da aynı pulla art arda zarlar. -> [{ to, steps }] */
export function targetsFrom(s, from) {
  if (s.phase !== 'move' || s.noMove) return [];
  const pl = s.turn;
  const out = new Map();
  const hits = (p) => p.filter((x) => x.hit).length;
  const walk = (pos, left, at, seq) => {
    for (const st of legalSteps(pos, pl, left)) {
      if (st.from !== at) continue;
      const path = [...seq, st];
      const cur = out.get(st.to);
      if (!cur || path.length < cur.length || (path.length === cur.length && hits(path) > hits(cur))) out.set(st.to, path);
      if (st.to !== OFF && left.length > 1) walk(applyStep(pos, pl, st), removeOne(left, st.die), st.to, path);
    }
  };
  walk(posOf(s), s.left, from, []);
  return [...out].map(([to, steps]) => ({ to, steps: steps.map(({ from: f, die }) => ({ from: f, die })), hit: steps.some((x) => x.hit) }));
}

/**
 * Sıra partnere geçince ona gidecek bildirim. by = değişikliği yapan (ev sahibi), ad(id) = görünen ad.
 * -> { baslik, metin }
 */
export function notice(prev, s, { by, ad }) {
  const winner = () => ad(s.players[s.result.winner]);
  if (s.phase === 'matchover' && prev.phase !== 'matchover') return { baslik: 'Tavla bitti', metin: `${winner()} maçı kazandı` };
  if (s.phase === 'gameover' && prev.phase !== 'gameover') return { baslik: 'Tavla', metin: `${winner()} oyunu aldı` };
  if (s.match !== prev.match) {
    const o = s.opening;
    const open = o ? ` · açılış zarı ${Math.max(...o)}–${Math.min(...o)}, ilk zar senin` : '';
    return { baslik: 'Yeni maç', metin: `Tavla: ${ad(by)} ${s.target} puanlık maç başlattı${open}` };
  }
  if (s.game !== prev.game) return { baslik: 'Sıra sende', metin: `Tavla: ${s.game}. oyun başladı · ilk zar senin` };
  if (prev.phase === 'move' && prev.noMove) return { baslik: 'Sıra sende', metin: `Tavla: ${ad(by)} oynayamadı · zar sende` };
  return { baslik: 'Sıra sende', metin: `Tavla: ${ad(by)} zarını oynadı` };
}

export function resultOf(s) {
  return { target: s.target, score: s.score.slice(), games: s.game, winner: s.score[0] >= s.target ? 0 : s.score[1] >= s.target ? 1 : -1 };
}
