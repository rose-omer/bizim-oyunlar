// Kutu Kapmaca (noktalar ve kutular): durum makinesi (saf). Ev sahibi uygular, misafir yalnız çizer.
//
// Tahta n×n kutu, (n+1)×(n+1) nokta. Sırayla iki nokta arasına çizgi çekilir.
// Kutunun dördüncü kenarını çeken kutuyu alır ve bir kez daha oynar. Çizgiler bitince çok kutusu olan kazanır.
// Çizgi numarası: yatay (r, c) = r*n + c (r 0..n, c 0..n-1); dikey (r, c) = H + r*(n+1) + c (r 0..n-1, c 0..n).
// Durum: players [ilk oynayan, ikinci], n, lines (-1 | koltuk), boxes (-1 | koltuk), turn, ply,
//  last { by, line, boxes: [kutu] } | null, phase 'play' | 'end', result { winner: 0|1|-1, reason: 'bitti'|'teslim' }, tally, seq.
import { seat, isNewer } from '../dama/oyun.js';

export { seat, isNewer };

export const BOYUTLAR = [3, 4, 5];
export const VARSAYILAN = 4;

export const hCount = (n) => (n + 1) * n;
export const lineCount = (n) => 2 * n * (n + 1);
export const hLine = (n, r, c) => r * n + c;
export const vLine = (n, r, c) => hCount(n) + r * (n + 1) + c;

/** Kutunun dört kenarı: [üst, alt, sol, sağ]. */
export function sidesOf(n, b) {
  const r = Math.floor(b / n), c = b % n;
  return [hLine(n, r, c), hLine(n, r + 1, c), vLine(n, r, c), vLine(n, r, c + 1)];
}

/** Çizginin komşu kutuları (1 ya da 2). */
export function boxesOfLine(n, l) {
  const out = [];
  if (l < hCount(n)) {
    const r = Math.floor(l / n), c = l % n;
    if (r > 0) out.push((r - 1) * n + c);
    if (r < n) out.push(r * n + c);
  } else {
    const x = l - hCount(n);
    const r = Math.floor(x / (n + 1)), c = x % (n + 1);
    if (c > 0) out.push(r * n + c - 1);
    if (c < n) out.push(r * n + c);
  }
  return out;
}

/** Kutu sayıları: [ilk oyuncu, ikinci]. */
export function counts(boxes) {
  const out = [0, 0];
  for (const b of boxes) if (b === 0 || b === 1) out[b] += 1;
  return out;
}

/** Çizilirse kaç kutu kapanır (ipucu ve test için). */
export function closes(s, l) {
  if (s.lines[l] !== -1) return 0;
  return boxesOfLine(s.n, l).filter((b) => sidesOf(s.n, b).every((x) => x === l || s.lines[x] !== -1)).length;
}

const okSize = (n) => (BOYUTLAR.includes(n) ? n : VARSAYILAN);

export function newGame({ players, names = {}, n = VARSAYILAN, no = 1, tally = {}, seq = 0, now = null }) {
  const size = okSize(n);
  return {
    v: 1,
    kind: 'kutu',
    no,
    seq: seq + 1,
    at: now,
    startedAt: now,
    players: players.slice(0, 2),
    names: { ...names },
    n: size,
    lines: new Array(lineCount(size)).fill(-1),
    boxes: new Array(size * size).fill(-1),
    turn: 0,
    ply: 0,
    last: null,
    phase: 'play',
    result: null,
    tally: { ...tally },
  };
}

export function initialState({ players, names, n, now = null }) {
  return newGame({ players, names, n, now });
}

function bump(s, now, patch) {
  return { ...s, ...patch, seq: s.seq + 1, at: now ?? s.at };
}

function addWin(s, result) {
  const tally = { ...s.tally };
  if (result && result.winner >= 0) {
    const id = s.players[result.winner];
    tally[id] = (tally[id] || 0) + 1;
  }
  return tally;
}

export function reduce(s, a) {
  switch (a?.type) {
    case 'line': {
      if (s.phase !== 'play' || s.players[s.turn] !== a.by) return s;
      const l = a.line;
      if (!Number.isInteger(l) || l < 0 || l >= s.lines.length || s.lines[l] !== -1) return s;
      const lines = s.lines.slice();
      lines[l] = s.turn;
      const boxes = s.boxes.slice();
      const got = boxesOfLine(s.n, l).filter((b) => boxes[b] === -1 && sidesOf(s.n, b).every((x) => lines[x] !== -1));
      for (const b of got) boxes[b] = s.turn;
      const done = lines.every((x) => x !== -1);
      let result = null;
      if (done) {
        const [x, y] = counts(boxes);
        result = { winner: x === y ? -1 : x > y ? 0 : 1, reason: 'bitti' };
      }
      return bump(s, a.now, {
        lines,
        boxes,
        turn: done || got.length ? s.turn : 1 - s.turn,
        ply: s.ply + 1,
        last: { by: s.turn, line: l, boxes: got },
        phase: done ? 'end' : 'play',
        result,
        tally: addWin(s, result),
        startedAt: s.startedAt ?? a.now ?? null,
      });
    }
    case 'size': {
      // Boyut yalnız ilk çizgiden önce değişir.
      if (s.phase !== 'play' || s.ply !== 0 || !s.players.includes(a.by) || !BOYUTLAR.includes(a.n) || a.n === s.n) return s;
      const f = newGame({ players: s.players, names: s.names, n: a.n, no: s.no, tally: s.tally, seq: s.seq, now: a.now });
      return f;
    }
    case 'resign': {
      const i = s.players.indexOf(a.by);
      if (s.phase !== 'play' || i < 0) return s;
      const result = { winner: 1 - i, reason: 'teslim' };
      return bump(s, a.now, { phase: 'end', result, tally: addWin(s, result) });
    }
    case 'new': {
      // a.no = isteyenin gördüğü oyun: iki taraf aynı anda "Rövanş" derse ikincisi yok sayılır.
      if (!s.players.includes(a.by) || a.no !== s.no) return s;
      return newGame({
        players: [s.players[1], s.players[0]],
        names: s.names,
        n: s.n,
        no: s.no + 1,
        tally: s.tally,
        seq: s.seq,
        now: a.now,
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

// Ev sahibi: niyeti eyleme çevirir. null = yok say.
export function toAction(intent, by, s, { hostId, now }) {
  switch (intent?.type) {
    case 'line':
      return Number.isInteger(intent.line) ? { type: 'line', by, line: intent.line, now } : null;
    case 'size':
      return Number.isInteger(intent.n) ? { type: 'size', by, n: intent.n, now } : null;
    case 'resign':
      return { type: 'resign', by, now };
    case 'new':
      return { type: 'new', by, no: intent.no, now };
    case 'seat':
      return by === hostId ? { type: 'seat', ids: intent.ids, names: intent.names } : null;
    case 'load':
      return by === hostId ? { type: 'load', s: intent.s } : null;
    default:
      return null;
  }
}

/** Kayıttan gelen durum geçerli mi? */
export function validSaved(d) {
  return BOYUTLAR.includes(d?.n) && Array.isArray(d.lines) && d.lines.length === lineCount(d.n)
    && Array.isArray(d.boxes) && d.boxes.length === d.n * d.n && Array.isArray(d.players) && (d.turn === 0 || d.turn === 1);
}

/** Sıra partnere geçince ona gidecek bildirim. by = değişikliği yapan, ad(id) = görünen ad. */
export function notice(prev, s, { by, ad }) {
  const [x, y] = counts(s.boxes);
  if (s.phase === 'end' && prev.phase !== 'end') {
    const r = s.result || {};
    let metin = `Berabere bitti (${x}–${y})`;
    if (r.reason === 'teslim') metin = `${ad(s.players[1 - r.winner])} teslim oldu`;
    else if (r.winner >= 0) metin = `${ad(s.players[r.winner])} kazandı (${Math.max(x, y)}–${Math.min(x, y)})`;
    return { baslik: 'Kutu Kapmaca bitti', metin };
  }
  if (s.no !== prev.no) return { baslik: 'Yeni oyun', metin: `Kutu Kapmaca: ${ad(by)} yeni oyun başlattı · ilk çizgi senin` };
  const got = s.last?.boxes?.length ? ` · ${s.last.boxes.length} kutu aldı` : '';
  return { baslik: 'Sıra sende', metin: `Kutu Kapmaca: ${ad(by)} çizgisini çekti${got}` };
}

export function resultOf(s) {
  const r = s.result || {};
  return { winner: r.winner ?? -1, reason: r.reason ?? null, plies: s.ply, no: s.no, n: s.n, kutular: counts(s.boxes) };
}
