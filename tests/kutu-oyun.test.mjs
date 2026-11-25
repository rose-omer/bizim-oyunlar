import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  hLine, vLine, sidesOf, boxesOfLine, lineCount, counts, closes,
  initialState, reduce, toAction, notice, resultOf, validSaved,
} from '../games/kutu/oyun.js';

const A = 'omer', B = 'gul';
const names = { [A]: 'Ömer', [B]: 'Gül' };
const fresh = (n) => initialState({ players: [A, B], names, n, now: 1 });
const ln = (s, by, line, now = 5) => reduce(s, { type: 'line', by, line, now });
const play = (s, ...ls) => ls.reduce((x, l, i) => ln(x, x.players[x.turn], l, 10 + i), s);

test('başlangıç: 4×4 kutu, 40 çizgi, sıra ilk oyuncuda', () => {
  const s = fresh();
  assert.equal(s.kind, 'kutu');
  assert.equal(s.n, 4);
  assert.equal(s.lines.length, 40);
  assert.equal(s.boxes.length, 16);
  assert.ok(s.lines.every((x) => x === -1));
  assert.equal(s.turn, 0);
  assert.equal(fresh(9).n, 4, 'geçersiz boyut varsayılana döner');
  assert.equal(lineCount(3), 24);
});

test('geometri: kutunun kenarları ve çizginin komşu kutuları', () => {
  assert.deepEqual(sidesOf(3, 0), [hLine(3, 0, 0), hLine(3, 1, 0), vLine(3, 0, 0), vLine(3, 0, 1)]);
  assert.deepEqual(boxesOfLine(3, hLine(3, 0, 1)), [1]);
  assert.deepEqual(boxesOfLine(3, hLine(3, 1, 1)), [1, 4]);
  assert.deepEqual(boxesOfLine(3, vLine(3, 2, 0)), [6]);
  assert.deepEqual(boxesOfLine(3, vLine(3, 2, 2)), [7, 8]);
  for (let b = 0; b < 9; b++) for (const l of sidesOf(3, b)) assert.ok(boxesOfLine(3, l).includes(b));
});

test('kutu kapatmayan çizgi sırayı devreder; dolu çizgi ve yanlış sıra yok sayılır', () => {
  const s = fresh(3);
  const a = ln(s, A, 0);
  assert.equal(a.lines[0], 0);
  assert.equal(a.turn, 1);
  assert.equal(ln(a, B, 0), a, 'dolu çizgi');
  assert.equal(ln(a, A, 1), a, 'sıra Gül\'de');
  assert.equal(ln(a, B, 99), a, 'yok çizgi');
  assert.equal(ln(a, B, 1.5), a);
});

test('dördüncü kenarı çeken kutuyu alır ve yine oynar', () => {
  const [t, b, l, r] = sidesOf(3, 0);
  const s = play(fresh(3), t, b, l);
  assert.equal(s.turn, 1);
  assert.equal(closes(s, r), 1);
  const x = ln(s, B, r);
  assert.deepEqual(x.last, { by: 1, line: r, boxes: [0] });
  assert.equal(x.boxes[0], 1);
  assert.equal(x.turn, 1, 'kutu alan yine oynar');
  assert.deepEqual(counts(x.boxes), [0, 1]);
});

test('tek çizgi iki kutuyu birden kapatabilir', () => {
  const n = 3;
  const mid = hLine(n, 1, 0); // kutu 0 ile 3 arası
  const others = [...sidesOf(n, 0), ...sidesOf(n, 3)].filter((x) => x !== mid);
  let s = fresh(n);
  for (const l of [...new Set(others)]) s = ln(s, s.players[s.turn], l);
  assert.equal(closes(s, mid), 2);
  const who = s.turn;
  const x = ln(s, s.players[who], mid);
  assert.deepEqual(x.last.boxes.sort(), [0, 3]);
  assert.equal(x.boxes[0], who);
  assert.equal(x.boxes[3], who);
});

test('çizgiler bitince çok kutusu olan kazanır; berabere olabilir', () => {
  let s = fresh(3);
  for (let i = 0; i < 24 && s.phase === 'play'; i++) s = ln(s, s.players[s.turn], s.lines.indexOf(-1), i);
  assert.equal(s.phase, 'end');
  const [x, y] = counts(s.boxes);
  assert.equal(x + y, 9);
  assert.equal(s.result.winner, x > y ? 0 : 1);
  assert.equal(s.tally[s.players[s.result.winner]], 1);
  assert.equal(ln(s, s.players[s.turn], 0), s);
  assert.deepEqual(resultOf(s), { winner: s.result.winner, reason: 'bitti', plies: 24, no: 1, n: 3, kutular: [x, y] });
  let t = fresh(4);
  for (let i = 0; i < 40; i++) t = ln(t, t.players[t.turn], t.lines.indexOf(-1), i);
  const [p, q] = counts(t.boxes);
  assert.equal(t.result.winner, p === q ? -1 : p > q ? 0 : 1);
});

test('boyut yalnız ilk çizgiden önce değişir; rövanş boyutu korur ve sırayı çevirir', () => {
  const s = fresh(4);
  const k = reduce(s, { type: 'size', by: B, n: 5, now: 2 });
  assert.equal(k.n, 5);
  assert.equal(k.lines.length, 60);
  assert.ok(k.seq > s.seq);
  assert.equal(reduce(s, { type: 'size', by: A, n: 7, now: 2 }), s);
  const played = ln(k, A, 0);
  assert.equal(reduce(played, { type: 'size', by: A, n: 3, now: 3 }), played);
  const r = reduce(played, { type: 'resign', by: B, now: 4 });
  assert.deepEqual(r.result, { winner: 0, reason: 'teslim' });
  const n = reduce(r, { type: 'new', by: A, no: r.no, now: 5 });
  assert.deepEqual(n.players, [B, A]);
  assert.equal(n.n, 5);
  assert.equal(n.tally[A], 1);
  assert.equal(reduce(n, { type: 'new', by: B, no: 1, now: 6 }), n);
});

test('toAction, kayıt denetimi, bildirim', () => {
  const s = fresh(3);
  const o = { hostId: A, now: 3 };
  assert.deepEqual(toAction({ type: 'line', line: 4 }, B, s, o), { type: 'line', by: B, line: 4, now: 3 });
  assert.equal(toAction({ type: 'line', line: '4' }, B, s, o), null);
  assert.deepEqual(toAction({ type: 'size', n: 5 }, B, s, o), { type: 'size', by: B, n: 5, now: 3 });
  assert.equal(toAction({ type: 'load', s }, B, s, o), null);
  assert.ok(validSaved(s));
  assert.ok(!validSaved({ ...s, lines: s.lines.slice(1) }));
  assert.ok(!validSaved({ ...s, n: 8 }));
  const [t, b, l, r] = sidesOf(3, 0);
  const p = play(s, t, b, l);
  const x = ln(p, B, r);
  const y = ln(x, B, 20);
  const ad = (id) => names[id];
  assert.deepEqual(notice(x, y, { by: B, ad }), { baslik: 'Sıra sende', metin: 'Kutu Kapmaca: Gül çizgisini çekti' });
  assert.deepEqual(notice(p, x, { by: B, ad }).metin, 'Kutu Kapmaca: Gül çizgisini çekti · 1 kutu aldı');
});
