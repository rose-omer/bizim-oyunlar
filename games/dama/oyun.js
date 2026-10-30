// Türk daması: saf kurallar ve durum makinesi. DOM yok; ev sahibi uygular, misafir yalnız çizer.
//
// Kural kaynakları:
//  - https://en.wikipedia.org/wiki/Turkish_draughts
//  - https://mindsports.nl/index.php/on-the-evolution-of-draughts-variants/draughts-variants/502-dama-turkish-draughts
// Uygulanan kurallar:
//  - 8×8, her oyuncu 16 taş (2. ve 3. sıra). Beyaz (oyuncu 0) başlar.
//  - Taş bir kare ileri ya da yana gider; geri ve çapraz yok. Taş da ileri/yana, bitişik taşın üstünden atlayarak yer.
//  - Yeme zorunlu; en çok taş alan yol zorunlu (dama ve taş eşit sayılır). Eşitlikte oyuncu seçer.
//  - Yenen taş ATLANDIĞI ANDA tahtadan kalkar (Türk kuralı; uluslararası damadaki gibi hamle sonunu beklemez).
//    Bu yüzden aynı taş iki kez atlanamaz ve boşalan kareden yeniden geçilebilir.
//  - Dama dikey/yatay istediği kadar gider; aradaki kareler boşsa uzaktan tek taşı atlar, ötesindeki
//    herhangi bir boş kareye konar. Çoklu yemede iki yeme arasında 180° dönemez.
//  - Son sıraya varan taş dama olur. Yeme zinciri sırasında son sıraya gelen taş zinciri TAŞ olarak
//    sürdürür; zincir son sırada biterse dama olur (mindsports: "If a man ends its capture on the back rank
//    it is promoted to king").
//  - Bitiş: sırası gelen oyuncunun taşı ya da yasal hamlesi yoksa kaybeder.
//    Beraberlik (bu uygulamanın kuralı): iki tarafta da yalnız birer dama kalırsa ve sıradaki tarafın
//    yeme hamlesi yoksa (yiyebiliyorsa oyun sürer; yiyen kazanır).

export const SIZE = 8;
export const EMPTY = '.';
// Tahta: 64 karakterlik dize, indeks = satır*8 + sütun. Satır 0 üstte (oyuncu 0'ın gözünden).
// 'a' = oyuncu 0 taşı, 'A' = oyuncu 0 daması; 'b' / 'B' = oyuncu 1.
const MAN = ['a', 'b'];
const KING = ['A', 'B'];
const FWD = [-1, 1]; // oyuncu 0 yukarı (satır azalır), oyuncu 1 aşağı
const LAST_ROW = [0, 7];
const ORTHO = [[-1, 0], [1, 0], [0, -1], [0, 1]];

export const rowOf = (sq) => Math.floor(sq / SIZE);
export const colOf = (sq) => sq % SIZE;
export const sqOf = (r, c) => r * SIZE + c;
const inside = (r, c) => r >= 0 && r < SIZE && c >= 0 && c < SIZE;

export function ownerOf(ch) {
  if (ch === 'a' || ch === 'A') return 0;
  if (ch === 'b' || ch === 'B') return 1;
  return -1;
}
export const isKing = (ch) => ch === 'A' || ch === 'B';

/** Başlangıç: oyuncu 1 satır 1–2, oyuncu 0 satır 5–6; 0. ve 7. satır boş. */
export function initialBoard() {
  let s = '';
  for (let r = 0; r < SIZE; r++) {
    const ch = r === 1 || r === 2 ? 'b' : r === 5 || r === 6 ? 'a' : EMPTY;
    s += ch.repeat(SIZE);
  }
  return s;
}

/** Tahtayı satırlardan kurar (testler için): 8 satır, her biri 8 karakter. */
export function boardFrom(rows) {
  const s = rows.join('').replace(/\s/g, '');
  if (s.length !== SIZE * SIZE) throw new Error('Tahta 64 kare olmalı');
  return s;
}

function dirsFor(ch, p) {
  return isKing(ch) ? ORTHO : [[FWD[p], 0], [0, -1], [0, 1]];
}

// Bir taşın yeme zincirleri. b: dizi (kopyalanır), sq: taşın yeri, last: önceki yeme yönü.
// -> [{ path: [iniş kareleri], caps: [yenen kareler] }]
function captureChains(b, sq, ch, p, last) {
  const out = [];
  const r0 = rowOf(sq), c0 = colOf(sq);
  for (const [dr, dc] of dirsFor(ch, p)) {
    if (last && dr === -last[0] && dc === -last[1]) continue; // 180° dönüş yasak
    let r = r0 + dr, c = c0 + dc;
    if (isKing(ch)) {
      while (inside(r, c) && b[sqOf(r, c)] === EMPTY) { r += dr; c += dc; }
    }
    if (!inside(r, c) || ownerOf(b[sqOf(r, c)]) !== 1 - p) continue;
    const cap = sqOf(r, c);
    r += dr; c += dc;
    const lands = [];
    while (inside(r, c) && b[sqOf(r, c)] === EMPTY) {
      lands.push(sqOf(r, c));
      if (!isKing(ch)) break; // taş yalnız hemen arkasına konar
      r += dr; c += dc;
    }
    for (const land of lands) {
      const nb = b.slice();
      nb[sq] = EMPTY;
      nb[cap] = EMPTY; // yenen taş hemen kalkar
      nb[land] = ch;
      const subs = captureChains(nb, land, ch, p, [dr, dc]);
      if (!subs.length) out.push({ path: [land], caps: [cap] });
      for (const s of subs) out.push({ path: [land, ...s.path], caps: [cap, ...s.caps] });
    }
  }
  return out;
}

/** Oyuncunun yasal hamleleri: [{ from, path, caps }]. Yeme varsa yalnız en çok alan yeme yolları. */
export function legalMoves(board, p) {
  const b = board.split('');
  const caps = [];
  for (let sq = 0; sq < b.length; sq++) {
    if (ownerOf(b[sq]) !== p) continue;
    for (const ch of captureChains(b, sq, b[sq], p, null)) caps.push({ from: sq, ...ch });
  }
  if (caps.length) {
    const most = Math.max(...caps.map((m) => m.caps.length));
    return caps.filter((m) => m.caps.length === most);
  }
  const quiet = [];
  for (let sq = 0; sq < b.length; sq++) {
    const ch = b[sq];
    if (ownerOf(ch) !== p) continue;
    for (const [dr, dc] of dirsFor(ch, p)) {
      let r = rowOf(sq) + dr, c = colOf(sq) + dc;
      while (inside(r, c) && b[sqOf(r, c)] === EMPTY) {
        quiet.push({ from: sq, path: [sqOf(r, c)], caps: [] });
        if (!isKing(ch)) break;
        r += dr; c += dc;
      }
    }
  }
  return quiet;
}

export function sameMove(m, from, path) {
  return m.from === from && m.path.length === path.length && m.path.every((x, i) => x === path[i]);
}

/** Hamleyi uygular (doğrulamaz). Son sıraya varan taş dama olur. */
export function applyMove(board, move, p) {
  const b = board.split('');
  const ch = b[move.from];
  b[move.from] = EMPTY;
  for (const c of move.caps) b[c] = EMPTY;
  const to = move.path[move.path.length - 1];
  b[to] = !isKing(ch) && rowOf(to) === LAST_ROW[p] ? KING[p] : ch;
  return b.join('');
}

export function countPieces(board) {
  const n = [{ men: 0, kings: 0 }, { men: 0, kings: 0 }];
  for (const ch of board) {
    const o = ownerOf(ch);
    if (o < 0) continue;
    if (isKing(ch)) n[o].kings++;
    else n[o].men++;
  }
  return n;
}

/** Sıradaki oyuncu `turn` için sonuç: null (sürüyor) | { winner: 0|1|-1, reason: 'tas'|'hamle'|'dama' } */
export function outcome(board, turn) {
  const n = countPieces(board);
  const total = (p) => n[p].men + n[p].kings;
  if (!total(turn)) return { winner: 1 - turn, reason: 'tas' };
  const moves = legalMoves(board, turn);
  const kings = n[0].men === 0 && n[1].men === 0 && n[0].kings === 1 && n[1].kings === 1;
  if (kings && !moves[0]?.caps.length) return { winner: -1, reason: 'dama' };
  if (!moves.length) return { winner: 1 - turn, reason: 'hamle' };
  return null;
}

// ---------- Durum ----------
// players: [beyazın id'si, siyahın id'si] (bu oyun için). Her yeni oyunda renkler yer değiştirir.
// seq her değişimde artar: kayıtlı durumlardan hangisinin yeni olduğu buna bakılarak seçilir.

export function newGame({ players, names = {}, no = 1, tally = {}, seq = 0, now = null }) {
  return {
    v: 1,
    kind: 'dama',
    no,
    seq: seq + 1,
    at: now,
    startedAt: now,
    players: players.slice(0, 2),
    names: { ...names },
    board: initialBoard(),
    turn: 0,
    ply: 0,
    last: null,
    prev: null,
    undoReq: null,
    phase: 'play',
    result: null,
    tally: { ...tally },
  };
}

export function initialState({ players, names, now = null }) {
  return newGame({ players, names, now });
}

function bump(s, now, patch) {
  return { ...s, ...patch, seq: s.seq + 1, at: now ?? s.at };
}

export function reduce(s, a) {
  switch (a?.type) {
    case 'move': {
      if (s.phase !== 'play') return s;
      if (s.players[s.turn] !== a.by) return s;
      if (!Number.isInteger(a.from) || !Array.isArray(a.path) || !a.path.length) return s;
      const move = legalMoves(s.board, s.turn).find((m) => sameMove(m, a.from, a.path));
      if (!move) return s;
      const board = applyMove(s.board, move, s.turn);
      const turn = 1 - s.turn;
      const result = outcome(board, turn);
      const tally = { ...s.tally };
      if (result && result.winner >= 0) {
        const id = s.players[result.winner];
        tally[id] = (tally[id] || 0) + 1;
      }
      return bump(s, a.now, {
        board,
        turn,
        ply: s.ply + 1,
        last: { by: s.turn, from: move.from, path: move.path, caps: move.caps },
        prev: { by: a.by, board: s.board, turn: s.turn, ply: s.ply, last: s.last },
        undoReq: null,
        phase: result ? 'end' : 'play',
        result,
        tally,
        startedAt: s.startedAt ?? a.now ?? null,
      });
    }
    case 'undoAsk': {
      // Yalnız son hamleyi yapan, rakip henüz oynamadan isteyebilir.
      if (s.phase !== 'play' || !s.prev || s.prev.by !== a.by || s.undoReq) return s;
      return bump(s, a.now, { undoReq: a.by });
    }
    case 'undoReply': {
      if (!s.undoReq || a.by === s.undoReq || !s.players.includes(a.by)) return s;
      if (!a.ok) return bump(s, a.now, { undoReq: null });
      const p = s.prev;
      return bump(s, a.now, { board: p.board, turn: p.turn, ply: p.ply, last: p.last, prev: null, undoReq: null });
    }
    case 'new': {
      // a.no = isteyenin gördüğü oyun: iki taraf aynı anda "Rövanş" derse ikincisi yok sayılır.
      if (!s.players.includes(a.by) || a.no !== s.no) return s;
      return newGame({
        players: [s.players[1], s.players[0]], // renkler yer değiştirir: bu kez öbürü başlar
        names: s.names,
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

/**
 * Koltukları gerçek kimliklerle eşler: ids = [ben, partner]. Kayıtta biri varsa öbür koltuğa diğeri oturur
 * (ör. '?' yer tutucu ya da başka cihaz). İkisi de varsa ya da hiçbiri yoksa dokunmaz.
 */
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
  const tally = {};
  for (const [k, v] of Object.entries(s.tally || {})) {
    const i = s.players.indexOf(k);
    tally[i >= 0 ? players[i] : k] = v;
  }
  return { ...s, players, names: nm, tally, seq: s.seq + 1 };
}

/** x, y'den yeni mi? (önce seq, eşitse zaman) */
export function isNewer(x, y) {
  if (!x || typeof x.seq !== 'number') return false;
  if (!y) return true;
  if (x.seq !== y.seq) return x.seq > y.seq;
  return (x.at || 0) > (y.at || 0);
}

// Ev sahibi: niyeti eyleme çevirir. null = yok say.
export function toAction(intent, by, s, { hostId, now }) {
  switch (intent?.type) {
    case 'move':
      return { type: 'move', by, from: intent.from, path: intent.path, now };
    case 'undoAsk':
      return { type: 'undoAsk', by, now };
    case 'undoReply':
      return { type: 'undoReply', by, ok: !!intent.ok, now };
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

/**
 * Sıra partnere geçince ona gidecek bildirim. by = değişikliği yapan (ev sahibi), ad(id) = görünen ad.
 * -> { baslik, metin }
 */
export function notice(prev, s, { by, ad }) {
  if (s.phase === 'end' && prev.phase !== 'end') {
    const w = s.result?.winner;
    return { baslik: 'Dama bitti', metin: w === -1 ? 'Berabere bitti' : `${ad(s.players[w])} kazandı` };
  }
  if (s.no !== prev.no) return { baslik: 'Yeni oyun', metin: `Dama: ${ad(by)} yeni oyun başlattı · ilk hamle senin` };
  if (s.ply < prev.ply) return { baslik: 'Sıra sende', metin: `Dama: ${ad(by)} geri almayı kabul etti` };
  return { baslik: 'Sıra sende', metin: `Dama: ${ad(by)} hamlesini yaptı` };
}

export function resultOf(s) {
  const r = s.result || {};
  return { winner: r.winner ?? -1, reason: r.reason ?? null, plies: s.ply, no: s.no };
}

/** Kare adı (oyuncu 0'ın gözünden): a1 sol alt. */
export function squareName(sq) {
  return 'abcdefgh'[colOf(sq)] + String(SIZE - rowOf(sq));
}
