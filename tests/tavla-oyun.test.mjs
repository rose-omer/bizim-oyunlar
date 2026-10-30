import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BAR, OFF, initialPoints, countAt, pipCount, stepsFor, applyStep, legalSteps, diceAt, openingRoll,
  initialState, reduce, toAction, schedule, view, movable, targetsFrom, posOf, seat, isNewer, resultOf, PASS_MS, notice,
} from '../games/tavla/oyun.js';

const A = 'omer', B = 'gul';

// Durum kurucu: p0/p1 = { hane: sayı }. Toplanmış pul sayısı verilmezse 15'e tamamlanır.
function st({ p0 = {}, p1 = {}, bar = [0, 0], off, turn = 0, left = [], target = 5, score = [0, 0] } = {}) {
  const points = Array(24).fill(0);
  let c0 = bar[0], c1 = bar[1];
  for (const [i, n] of Object.entries(p0)) { points[i] += n; c0 += n; }
  for (const [i, n] of Object.entries(p1)) { points[i] -= n; c1 += n; }
  const base = initialState({ players: [A, B], names: { [A]: 'Ömer', [B]: 'Gül' } });
  return {
    ...base, points, bar: bar.slice(), off: off || [15 - c0, 15 - c1], turn, left, target, score,
    dice: left.length ? left.slice(0, 2) : null, phase: left.length ? 'move' : 'roll', seed: 99, game: 1,
  };
}
const ls = (s) => legalSteps(posOf(s), s.turn, s.left).map((x) => `${x.from}>${x.to}/${x.die}`).sort();
const play = (s, by, steps, now = 5) => reduce(s, { type: 'play', by, steps, now });
const total = (s, pl) => {
  let n = s.bar[pl] + s.off[pl];
  for (let i = 0; i < 24; i++) n += countAt(s.points, i, pl);
  return n;
};

test('başlangıç dizilimi: 15’er pul, 167 pip, doğru haneler', () => {
  const p = initialPoints();
  const pos = { points: p, bar: [0, 0], off: [0, 0] };
  assert.equal(p.filter((v) => v > 0).reduce((a, b) => a + b, 0), 15);
  assert.equal(-p.filter((v) => v < 0).reduce((a, b) => a + b, 0), 15);
  assert.equal(pipCount(pos, 0), 167);
  assert.equal(pipCount(pos, 1), 167);
  assert.deepEqual([p[23], p[12], p[7], p[5]], [2, 5, 3, 5]);
  assert.deepEqual([p[0], p[11], p[16], p[18]], [-2, -5, -3, -5]);
});

test('zar: tohuma bağlı, 1–6 arası, açılışta eşit gelmez', () => {
  assert.deepEqual(diceAt(5, 3), diceAt(5, 3));
  const seen = new Set();
  for (let n = 0; n < 600; n++) {
    for (const d of diceAt(1234, n)) {
      assert.ok(d >= 1 && d <= 6);
      seen.add(d);
    }
  }
  assert.equal(seen.size, 6);
  for (let s = 0; s < 200; s++) {
    const [a, b] = openingRoll(s);
    assert.notEqual(a, b);
  }
});

test('maç: açılış zarı başlayanı seçer; geçersiz hedef ve yabancı yok sayılır', () => {
  const s0 = initialState({ players: [A, B], names: {} });
  assert.equal(s0.phase, 'setup');
  assert.equal(reduce(s0, { type: 'match', by: A, target: 4, seed: 1, match: 0 }), s0);
  assert.equal(reduce(s0, { type: 'match', by: 'x', target: 5, seed: 1, match: 0 }), s0);
  const s = reduce(s0, { type: 'match', by: B, target: 3, seed: 77, match: 0, now: 10 });
  assert.equal(s.phase, 'roll');
  assert.equal(s.target, 3);
  assert.deepEqual(s.score, [0, 0]);
  assert.equal(s.turn, s.opening[0] > s.opening[1] ? 0 : 1);
  assert.equal(s.seq, s0.seq + 1);
});

test('zar atma: yalnız sırası gelen; çift zar 4 hamle verir', () => {
  const s0 = reduce(initialState({ players: [A, B] }), { type: 'match', by: A, target: 5, seed: 3, match: 0 });
  const cur = s0.players[s0.turn], other = s0.players[1 - s0.turn];
  assert.equal(reduce(s0, { type: 'roll', by: other }), s0);
  const r = reduce(s0, { type: 'roll', by: cur, now: 2 });
  assert.equal(r.phase, 'move');
  assert.deepEqual(r.dice, diceAt(3, 0));
  assert.equal(r.rolls, 1);
  assert.equal(r.opening, null);
  assert.equal(reduce(r, { type: 'roll', by: cur }), r, 'iki kez atılmaz');
  // Çift zar veren tohumu bul
  let seed = 0;
  while (diceAt(seed, 0)[0] !== diceAt(seed, 0)[1]) seed++;
  const d = reduce({ ...s0, seed, rolls: 0 }, { type: 'roll', by: cur });
  assert.equal(d.left.length, 4);
  assert.ok(d.left.every((x) => x === d.dice[0]));
});

test('çift zar: dört adım oynanır, sonra sıra geçer', () => {
  const s = st({ p0: { 23: 2, 12: 5, 7: 3, 5: 5 }, p1: { 0: 2, 11: 5, 16: 3, 18: 5 }, left: [3, 3, 3, 3] });
  let t = play(s, A, [{ from: 12, die: 3 }, { from: 12, die: 3 }]);
  assert.equal(t.left.length, 2);
  assert.equal(t.turn, 0);
  t = play(t, A, [{ from: 9, die: 3 }]);
  assert.equal(t.left.length, 1);
  t = play(t, A, [{ from: 9, die: 3 }]);
  assert.equal(t.phase, 'roll');
  assert.equal(t.turn, 1);
  assert.equal(t.last.steps.length, 4);
  assert.equal(countAt(t.points, 6, 0), 2);
});

test('en çok zar kuralı: ikinci zarı oynatmayan ilk adım yasak', () => {
  // A 13, B 10; zar 5-2. 11 ve 3 kapı. B 10→5 oynanırsa 2 oynanamaz: yasak.
  const s = st({ p0: { 13: 1, 10: 1 }, p1: { 11: 2, 3: 2 }, left: [5, 2] });
  assert.deepEqual(ls(s), ['10>8/2', '13>8/5'].sort());
  assert.equal(play(s, A, [{ from: 10, die: 5 }]), s);
  const ok = play(s, A, [{ from: 13, die: 5 }]);
  assert.equal(ok.left.length, 1);
});

test('tek zar oynanabiliyorsa büyük zar zorunlu; büyüğü yoksa küçüğü', () => {
  // A 13; zar 6-4; 3 kapı: 6 ya da 4 tek başına oynanır ama ikisi birden olmaz.
  const s = st({ p0: { 13: 1 }, p1: { 3: 2 }, left: [6, 4] });
  assert.deepEqual(ls(s), ['13>7/6']);
  const t = play(s, A, [{ from: 13, die: 6 }]);
  assert.equal(t.phase, 'roll', 'kalan zar oynanamaz: sıra geçer');
  assert.equal(t.turn, 1);
  // 7 de kapalıysa yalnız 4 oynanır
  const u = st({ p0: { 13: 1 }, p1: { 3: 2, 7: 2 }, left: [6, 4] });
  assert.deepEqual(ls(u), ['13>9/4']);
});

test('kırık pul önce girer; kapı kapalı, tek pul vurulur', () => {
  const s = st({ p0: { 12: 2 }, bar: [1, 0], p1: { 21: 2, 18: 1 }, left: [6, 3] });
  // giriş: 6 → 18 (tek pul: vurur), 3 → 21 kapalı
  assert.deepEqual(ls(s), [`${BAR}>18/6`]);
  assert.deepEqual(movable(s), [BAR]);
  const t = play(s, A, [{ from: BAR, die: 6 }]);
  assert.equal(t.bar[0], 0);
  assert.equal(t.bar[1], 1, 'vurulan pul bara');
  assert.equal(countAt(t.points, 18, 0), 1);
  assert.equal(countAt(t.points, 18, 1), 0);
  assert.equal(total(t, 0), 15);
  assert.equal(total(t, 1), 15);
});

test('giriş tamamen kapalıysa hamle yok: sıra kısa süre sonra geçer', () => {
  const base = st({ bar: [1, 0], p0: { 12: 14 }, p1: { 18: 2, 19: 2, 20: 2, 21: 2, 22: 2, 23: 2 } });
  let seed = 0;
  while (diceAt(seed, 0)[0] === diceAt(seed, 0)[1]) seed++;
  const r = reduce({ ...base, seed, rolls: 0 }, { type: 'roll', by: A, now: 1 });
  assert.equal(r.noMove, true);
  assert.deepEqual(movable(r), []);
  assert.equal(play(r, A, [{ from: BAR, die: r.dice[0] }]), r);
  const plan = schedule(r);
  assert.equal(plan.delay, PASS_MS);
  assert.deepEqual(plan.action, { type: 'pass' });
  const p = reduce(r, { type: 'pass', now: 9 });
  assert.equal(p.turn, 1);
  assert.equal(p.phase, 'roll');
  assert.equal(schedule(p), null);
  assert.equal(reduce(p, { type: 'pass' }), p);
});

test('kapı: 2+ rakip pulu olan haneye konulmaz', () => {
  const pos = { points: st({ p0: { 10: 1 }, p1: { 7: 2, 6: 1 } }).points, bar: [0, 0], off: [14, 12] };
  const to = stepsFor(pos, 0, 3).map((x) => x.to);
  assert.ok(!to.includes(7));
  const four = stepsFor(pos, 0, 4);
  assert.deepEqual(four.map((x) => [x.to, x.hit]), [[6, true]]);
});

test('toplama: yalnız tüm pullar içerideyken', () => {
  const out = st({ p0: { 2: 3, 8: 1 }, p1: { 20: 1 }, left: [3, 1] });
  assert.ok(!ls(out).some((x) => x.includes(OFF)), 'dışarıda pul var');
  const home = st({ p0: { 2: 3, 4: 1 }, p1: { 20: 1 }, left: [3, 5] });
  assert.ok(ls(home).includes(`2>${OFF}/3`), 'tam zar');
  assert.ok(ls(home).includes(`4>${OFF}/5`), 'tam zar 5');
});

test('toplama: büyük zarla yalnız en arkadaki haneden; geride pul varsa olmaz', () => {
  // Pullar 1 ve 3 (pip 2, 4). Zar 6: geride pul yok → en arkadaki (3) toplanır, 1 toplanamaz.
  const s = st({ p0: { 1: 2, 3: 2 }, p1: { 20: 1 }, left: [6, 5] });
  const l = ls(s);
  assert.ok(l.includes(`3>${OFF}/6`));
  assert.ok(!l.includes(`1>${OFF}/6`));
  // Zar 5 ve pul 5. hanede (idx 5, pip 6): büyük zar değil, normal hamle 5→0
  const t = st({ p0: { 5: 1, 0: 1 }, p1: { 20: 1 }, left: [5] });
  assert.deepEqual(ls(t), ['5>0/5']);
});

test('oyun sonu: mars 2 puan, normal 1 puan; maç hedefinde biter', () => {
  // Son pul 0. hanede, zar 1: toplar ve kazanır. Rakip hiç toplamadı → mars.
  const mars = st({ p0: { 0: 1 }, p1: { 20: 15 }, off: [14, 0], left: [1, 2] });
  const m = play(mars, A, [{ from: 0, die: 2 }]);
  assert.equal(m.phase, 'gameover');
  assert.deepEqual(m.result, { winner: 0, pts: 2, mars: true });
  assert.deepEqual(m.score, [2, 0]);
  const norm = st({ p0: { 0: 1 }, p1: { 20: 14 }, off: [14, 1], left: [1, 2] });
  assert.equal(play(norm, A, [{ from: 0, die: 1 }]), norm, 'tek zar oynanabiliyor: büyük zar zorunlu');
  const n = play(norm, A, [{ from: 0, die: 2 }]);
  assert.deepEqual(n.result, { winner: 0, pts: 1, mars: false });
  // Hedefe ulaşınca maç biter
  const end = play({ ...mars, score: [4, 2] }, A, [{ from: 0, die: 2 }]);
  assert.equal(end.phase, 'matchover');
  assert.deepEqual(end.score, [6, 2]);
  assert.deepEqual(resultOf(end), { target: 5, score: [6, 2], games: 1, winner: 0 });
  assert.equal(reduce(end, { type: 'next', by: A }), end, 'maç bitti: sonraki oyun yok');
});

test('sonraki oyun: kazanan başlar, tahta sıfırlanır, skor kalır', () => {
  const g = play(st({ p0: { 0: 1 }, p1: { 20: 15 }, off: [14, 0], left: [1, 2], turn: 0 }), A, [{ from: 0, die: 2 }]);
  assert.equal(reduce(g, { type: 'next', by: 'x' }), g);
  const n = reduce(g, { type: 'next', by: B, now: 4 });
  assert.equal(n.phase, 'roll');
  assert.equal(n.turn, 0);
  assert.equal(n.game, 2);
  assert.deepEqual(n.score, [2, 0]);
  assert.deepEqual(n.points, initialPoints());
  assert.deepEqual(n.off, [0, 0]);
  assert.equal(n.result, null);
});

test('geri al: kendi turunda zarlar bitene dek adım adım', () => {
  const s = st({ p0: { 23: 2, 12: 5, 7: 3, 5: 5 }, p1: { 0: 2, 11: 5, 16: 3, 18: 5 }, left: [4, 4, 4, 4] });
  const t1 = play(s, A, [{ from: 12, die: 4 }]);
  const t2 = play(t1, A, [{ from: 8, die: 4 }]);
  assert.equal(reduce(t2, { type: 'undo', by: B }), t2, 'rakip geri alamaz');
  const u1 = reduce(t2, { type: 'undo', by: A });
  assert.deepEqual(u1.points, t1.points);
  assert.deepEqual(u1.left, t1.left);
  assert.equal(u1.steps.length, 1);
  const u0 = reduce(u1, { type: 'undo', by: A });
  assert.deepEqual(u0.points, s.points);
  assert.deepEqual(u0.left, [4, 4, 4, 4]);
  assert.equal(reduce(u0, { type: 'undo', by: A }), u0, 'geri alınacak adım yok');
  // Zarlar bitince sıra geçer, geri alma yok
  const done = play(s, A, [{ from: 12, die: 4 }, { from: 12, die: 4 }, { from: 8, die: 4 }, { from: 8, die: 4 }]);
  assert.equal(done.phase, 'roll');
  assert.equal(reduce(done, { type: 'undo', by: A }), done);
});

test('birleşik hamle: aynı pulla iki zar; geçersiz zincir hiç uygulanmaz', () => {
  const s = st({ p0: { 12: 1, 3: 1 }, p1: { 20: 2 }, left: [6, 2] });
  const ts = targetsFrom(s, 12);
  const to = Object.fromEntries(ts.map((t) => [t.to, t.steps]));
  assert.ok(to[6] && to[6].length === 1);
  assert.ok(to[10] && to[10].length === 1);
  assert.ok(to[4] && to[4].length === 2, '6+2 birleşik');
  const t = play(s, A, to[4]);
  assert.equal(countAt(t.points, 4, 0), 1);
  assert.equal(t.phase, 'roll');
  // ikinci adım geçersizse ilk adım da uygulanmaz
  assert.equal(play(s, A, [{ from: 12, die: 6 }, { from: 12, die: 2 }]), s);
  assert.equal(play(s, A, []), s);
  assert.equal(play(s, B, [{ from: 12, die: 6 }]), s);
});

test('targetsFrom: vuran yol önce; toplama hedefi OFF', () => {
  const s = st({ p0: { 2: 1, 1: 1 }, p1: { 20: 1 }, left: [3, 2] });
  const t = targetsFrom(s, 2);
  assert.ok(t.some((x) => x.to === OFF));
  assert.deepEqual(targetsFrom({ ...s, phase: 'roll' }, 2), []);
});

test('view zar tohumunu gizler; toAction izinleri; seat ve load', () => {
  const s = st({ left: [] });
  assert.equal(view(s).seed, null);
  assert.equal(s.seed, 99);
  const o = { hostId: A, now: 1, seed: 5 };
  assert.deepEqual(toAction({ type: 'match', target: 7, match: 2, seed: 1 }, B, s, o),
    { type: 'match', by: B, target: 7, match: 2, restart: false, seed: 5, now: 1 }, 'tohum istemciden gelmez');
  assert.deepEqual(toAction({ type: 'roll', dice: [6, 6], seed: 1 }, B, s, o), { type: 'roll', by: B, seed: 5, now: 1 }, 'zar istemciden gelmez');
  assert.equal(toAction({ type: 'load', s }, B, s, o), null);
  assert.equal(toAction({ type: 'seat', ids: [B, A] }, B, s, o), null);
  assert.equal(toAction({ type: 'x' }, A, s, o), null);
  const q = { ...s, players: [A, '?'] };
  assert.deepEqual(seat(q, [A, B], { [B]: 'Gül' }).players, [A, B]);
  const newer = { ...s, seq: s.seq + 5 };
  assert.equal(reduce(s, { type: 'load', s: newer }), newer);
  assert.equal(reduce(newer, { type: 'load', s }), newer);
  assert.ok(isNewer(newer, s));
});

test('rastgele maçlar: pul sayısı korunur, maç sonunda biter', () => {
  let r = 7;
  const rnd = () => ((r = (r * 1103515245 + 12345) >>> 0) / 2 ** 32);
  for (let m = 0; m < 6; m++) {
    let s = reduce(initialState({ players: [A, B] }), { type: 'match', by: A, target: 3, seed: 1000 + m, match: 0 });
    let guard = 0;
    while (s.phase !== 'matchover' && guard++ < 5000) {
      const who = s.players[s.turn];
      if (s.phase === 'roll') s = reduce(s, { type: 'roll', by: who });
      else if (s.phase === 'move' && s.noMove) s = reduce(s, { type: 'pass' });
      else if (s.phase === 'move') {
        const opts = legalSteps(posOf(s), s.turn, s.left);
        assert.ok(opts.length > 0);
        const o = opts[Math.floor(rnd() * opts.length)];
        const next = play(s, who, [{ from: o.from, die: o.die }]);
        assert.notEqual(next, s);
        s = next;
      } else if (s.phase === 'gameover') s = reduce(s, { type: 'next', by: who });
      for (const pl of [0, 1]) assert.equal(total(s, pl), 15);
      for (let i = 0; i < 24; i++) assert.ok(!(countAt(s.points, i, 0) && countAt(s.points, i, 1)));
    }
    assert.equal(s.phase, 'matchover');
    assert.ok(Math.max(...s.score) >= 3);
  }
});

// ---- İnceleme 3 düzeltmeleri ----

test('maç: aynı numarayla iki "Başla" tek maç açar; oyun ortasında yalnız bilerek sıfırlanır', () => {
  const s0 = initialState({ players: [A, B] });
  const m1 = reduce(s0, { type: 'match', by: A, target: 3, seed: 7, match: 0, now: 1 });
  assert.equal(m1.match, 1);
  assert.equal(reduce(m1, { type: 'match', by: B, target: 5, seed: 9, match: 0, now: 2 }), m1, 'ikinci Başla');
  assert.equal(reduce(s0, { type: 'match', by: A, target: 3, seed: 7, now: 1 }), s0, 'numarasız');
  const r1 = reduce(m1, { type: 'roll', by: m1.players[m1.turn], now: 3 });
  assert.equal(r1.phase, 'move');
  assert.equal(reduce(r1, { type: 'match', by: B, target: 5, seed: 9, match: 1, now: 4 }), r1, 'faz: oyun ortası');
  const re = reduce(r1, { type: 'match', by: B, target: 5, seed: 9, match: 1, restart: true, now: 4 });
  assert.equal(re.match, 2, 'Yeni maç onayıyla sıfırlanır');
  assert.equal(re.phase, 'roll');
  const over = { ...r1, phase: 'matchover' };
  assert.equal(reduce(over, { type: 'match', by: A, target: 3, seed: 1, match: 1, now: 5 }).match, 2, 'maç bitince açılır');
});

test('zar tohumu: kayda giden görünümde tohum yok; tohumsuz durum ev sahibinin yeni tohumuyla sürer', () => {
  let s = reduce(initialState({ players: [A, B] }), { type: 'match', by: A, target: 5, seed: 31, match: 0, now: 1 });
  const kayit = view(s);
  assert.equal(kayit.seed, null);
  const cur = kayit.players[kayit.turn];
  assert.equal(reduce(kayit, { type: 'roll', by: cur, now: 2 }), kayit, 'tohum yoksa ve verilmediyse atılmaz');
  const o = { hostId: A, now: 2, seed: 4242 };
  const r = reduce(kayit, toAction({ type: 'roll', seed: 1 }, cur, kayit, o));
  assert.equal(r.phase, 'move');
  assert.equal(r.seed, 4242, 'yeni tohum ev sahibinden');
  assert.deepEqual(r.dice, diceAt(4242, kayit.rolls));
  // Tohumlu durumda verilen tohum yok sayılır
  const t = reduce(s, toAction({ type: 'roll' }, cur, s, o));
  assert.equal(t.seed, 31);
  assert.deepEqual(t.dice, diceAt(31, 0));
});

test('bildirim: yeni maçta açılış zarı, yeni oyunda ve pasta doğru metin', () => {
  const ad = (id) => (id === A ? 'Ömer' : 'Gül');
  const s0 = initialState({ players: [A, B] });
  let seed = 1;
  let m = reduce(s0, { type: 'match', by: A, target: 3, seed, match: 0, now: 1 });
  while (m.turn !== 1) m = reduce(s0, { type: 'match', by: A, target: 3, seed: ++seed, match: 0, now: 1 });
  const hi = Math.max(...m.opening), lo = Math.min(...m.opening);
  assert.deepEqual(notice(s0, m, { by: A, ad }), { baslik: 'Yeni maç', metin: `Tavla: Ömer 3 puanlık maç başlattı · açılış zarı ${hi}–${lo}, ilk zar senin` });
  const g = { ...m, phase: 'gameover', result: { winner: 0, pts: 1, mars: false } };
  const n = reduce(g, { type: 'next', by: A, now: 2 });
  assert.equal(notice(g, n, { by: A, ad }).metin, 'Tavla: 2. oyun başladı · ilk zar senin');
  const pas = { ...m, phase: 'move', noMove: true, turn: 0 };
  assert.equal(notice(pas, reduce(pas, { type: 'pass', now: 3 }), { by: A, ad }).metin, 'Tavla: Ömer oynayamadı · zar sende');
  const oyn = { ...m, phase: 'move', noMove: false, turn: 0 };
  assert.equal(notice(oyn, { ...oyn, turn: 1, phase: 'roll' }, { by: A, ad }).metin, 'Tavla: Ömer zarını oynadı');
});
