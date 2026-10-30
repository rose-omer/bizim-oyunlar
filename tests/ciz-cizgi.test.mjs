import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  Q, PALETTE, ERASER, BRUSHES, MAX_STROKE_PTS, quant, toNorm, farEnough, StrokeStore, makeParts, Outbox,
  flushOne, PartsIn,
} from '../games/ciz/cizgi.js';

test('palet 8 renk, 3 fırça, silgi ayrı indeks', () => {
  assert.equal(PALETTE.length, 8);
  assert.equal(new Set(PALETTE.map((p) => p.color)).size, 8);
  assert.ok(PALETTE.every((p) => p.name));
  assert.equal(BRUSHES.length, 3);
  assert.equal(ERASER, 8);
});

test('quant: 0..1 → 0..10000 tamsayı, sınırlanır', () => {
  assert.equal(Q, 10000);
  assert.equal(quant(0.5), 5000);
  assert.equal(quant(-0.2), 0);
  assert.equal(quant(1.7), 10000);
  assert.equal(quant(0.12345), 1235);
});

test('toNorm: ekran koordinatı → normalize tamsayı', () => {
  const rect = { left: 100, top: 200, width: 400, height: 400 };
  assert.deepEqual(toNorm(300, 400, rect), [5000, 5000]);
  assert.deepEqual(toNorm(50, 900, rect), [0, 10000]);
});

test('farEnough: çok yakın noktaları ele', () => {
  assert.ok(!farEnough(100, 100, 105, 103, 20));
  assert.ok(farEnough(100, 100, 130, 100, 20));
});

test('StrokeStore: s0 / sp / s1 akışı, lastOwn, undo, clear', () => {
  const st = new StrokeStore();
  assert.equal(st.apply({ t: 's0', id: 'a1', c: 2, w: 140, p: [10, 20] }, 'A'), 'add');
  assert.equal(st.apply({ t: 's0', id: 'a1', c: 2, w: 140 }, 'A'), null, 'aynı id iki kez başlamaz');
  assert.equal(st.apply({ t: 'sp', id: 'a1', p: [30, 40, 50, 60] }, 'A'), 'add');
  assert.equal(st.apply({ t: 's1', id: 'a1' }, 'A'), 'add');
  const s = st.get('a1');
  assert.deepEqual(s.p, [10, 20, 30, 40, 50, 60]);
  assert.equal(s.done, true);
  assert.equal(s.by, 'A');
  assert.equal(st.points, 3);
  st.apply({ t: 's0', id: 'b1', c: 0, w: 50, p: [1, 1] }, 'B');
  st.apply({ t: 's1', id: 'b1' }, 'B');
  assert.equal(st.lastOwn('A'), 'a1');
  assert.equal(st.lastOwn('B'), 'b1');
  assert.equal(st.lastOwn('C'), null);
  assert.equal(st.apply({ t: 'undo', id: 'a1' }), 'redraw');
  assert.equal(st.get('a1'), null);
  assert.equal(st.points, 1);
  assert.equal(st.apply({ t: 'undo', id: 'yok' }), null);
  assert.equal(st.apply({ t: 'sp', id: 'yok', p: [1, 2] }), null);
  assert.equal(st.apply({ t: 'clear' }), 'redraw');
  assert.equal(st.list.length, 0);
  assert.equal(st.points, 0);
});

test('StrokeStore: geçersiz veri reddedilir ya da sınırlanır', () => {
  const st = new StrokeStore();
  assert.equal(st.apply({ t: 's0', id: 'x', c: 99, w: 50 }, 'A'), null);
  assert.equal(st.apply({ t: 's0', id: '', c: 1, w: 50 }, 'A'), null);
  assert.equal(st.apply({ t: 's0', id: 'y', c: 1, w: 50, p: [20000, -5, 7] }, 'A'), 'add');
  assert.deepEqual(st.get('y').p, [10000, 0], 'tek kalan koordinat atılır, değerler sınırlanır');
  assert.equal(st.apply({ t: 'nope' }), null);
});

test('StrokeStore: üst sınır aşılınca en eski bitmiş çizgiler düşer', () => {
  const st = new StrokeStore({ maxStrokes: 3, maxPoints: 1000 });
  for (let i = 0; i < 3; i++) {
    st.apply({ t: 's0', id: `s${i}`, c: 0, w: 50, p: [i, i] }, 'A');
    st.apply({ t: 's1', id: `s${i}` }, 'A');
  }
  assert.equal(st.apply({ t: 's0', id: 's3', c: 0, w: 50, p: [3, 3] }, 'A'), 'redraw');
  assert.deepEqual(st.list.map((s) => s.id), ['s1', 's2', 's3']);
  const big = new StrokeStore({ maxStrokes: 100, maxPoints: 10 });
  big.apply({ t: 's0', id: 'a', c: 0, w: 50, p: new Array(16).fill(1) }, 'A');
  big.apply({ t: 's1', id: 'a' }, 'A');
  assert.equal(big.apply({ t: 's0', id: 'b', c: 0, w: 50, p: new Array(8).fill(1) }, 'A'), 'redraw');
  assert.deepEqual(big.list.map((s) => s.id), ['b']);
});

test('makeParts: her parça 60 KB altında, birleşince aynı liste', () => {
  const st = new StrokeStore({ maxStrokes: 5000, maxPoints: 1e6 });
  for (let i = 0; i < 60; i++) {
    const p = [];
    for (let k = 0; k < 1500; k++) p.push(9999 - (k % 50), 1000 + k);
    st.apply({ t: 's0', id: `s${i}`, c: i % 9, w: 140, p }, i % 2 ? 'A' : 'B');
    if (i < 59) st.apply({ t: 's1', id: `s${i}` }, 'A');
  }
  const parts = makeParts(st.list, 4);
  assert.ok(parts.length > 1);
  parts.forEach((m, i) => {
    assert.equal(m.t, 'strokes');
    assert.equal(m.part, i);
    assert.equal(m.total, parts.length);
    assert.equal(m.b, 4);
    assert.ok(JSON.stringify(m).length < 60_000, `parça ${i} çok büyük`);
  });
  const back = new StrokeStore({ maxStrokes: 5000, maxPoints: 1e6 });
  back.load(parts.flatMap((m) => m.list));
  assert.equal(back.list.length, 60);
  assert.deepEqual(back.get('s7').p, st.get('s7').p);
  assert.equal(back.get('s59').done, false);
  assert.equal(back.get('s3').done, true);
  assert.equal(back.points, st.points);
  const empty = makeParts([], 0);
  assert.equal(empty.length, 1);
  assert.deepEqual(empty[0].list, []);
});

test('makeParts: en uzun tek çizgi bile tek parçaya sığar', () => {
  const p = new Array(MAX_STROKE_PTS * 2).fill(10000);
  const parts = makeParts([{ id: 'zzzzzzzz99', by: 'abcdefghijklmnop', c: 8, w: 2000, p, done: true }], 1);
  assert.equal(parts.length, 1);
  assert.ok(JSON.stringify(parts[0]).length < 60_000);
});

test('Outbox: aynı çizginin parçalarını birleştirir, tek mesaj döner', () => {
  const ob = new Outbox();
  assert.equal(ob.flush(), null);
  ob.push({ t: 's0', id: 'a', c: 1, w: 50, b: 2, p: [1, 2] });
  ob.push({ t: 'sp', id: 'a', p: [3, 4] });
  ob.push({ t: 'sp', id: 'a', p: [5, 6] });
  assert.deepEqual(ob.flush(), { t: 's0', id: 'a', c: 1, w: 50, b: 2, p: [1, 2, 3, 4, 5, 6] });
  assert.equal(ob.flush(), null);
  ob.push({ t: 'sp', id: 'a', p: [7, 8] });
  ob.push({ t: 'sp', id: 'a', p: [9, 9] });
  ob.push({ t: 's1', id: 'a' });
  ob.push({ t: 'undo', id: 'a' });
  assert.deepEqual(ob.flush(), { t: 'ops', list: [{ t: 'sp', id: 'a', p: [7, 8, 9, 9] }, { t: 's1', id: 'a' }, { t: 'undo', id: 'a' }] });
  ob.push({ t: 'clear' });
  assert.equal(ob.size, 1);
  ob.reset();
  assert.equal(ob.flush(), null);
});

test('katılım: önce bekleyen işlemler, sonra parçalar, sonra canlı işlemler → iki depo aynı', () => {
  const host = new StrokeStore();
  const ob = new Outbox();
  const local = (op) => { host.apply(op, 'H'); ob.push(op); };
  local({ t: 's0', id: 'h1', c: 1, w: 120, b: 3, p: [10, 10] });
  local({ t: 'sp', id: 'h1', p: [20, 20, 30, 30] });
  ob.flush(); // eski işlemler zaten gitti (misafir yokken)
  local({ t: 'sp', id: 'h1', p: [40, 40] }); // çizgi sürüyor, outbox'ta bekliyor
  // misafir katıldı: kuyruk = [bekleyen, ...parçalar]
  const queue = [ob.flush(), ...makeParts(host.list, 3)];
  local({ t: 'sp', id: 'h1', p: [50, 50] });
  local({ t: 's1', id: 'h1' });
  queue.push(ob.flush());

  const guest = new StrokeStore();
  let pending = null;
  const apply = (m) => {
    if (m.t === 'strokes') {
      if (m.part === 0) pending = [];
      pending.push(...m.list);
      if (m.part === m.total - 1) guest.load(pending);
    } else if (m.t === 'ops') m.list.forEach((o) => guest.apply(o, 'H'));
    else guest.apply(m, 'H');
  };
  queue.forEach(apply);
  assert.deepEqual(guest.get('h1').p, host.get('h1').p);
  assert.deepEqual(guest.get('h1').p, [10, 10, 20, 20, 30, 30, 40, 40, 50, 50]);
  assert.equal(guest.get('h1').done, true);
  assert.equal(guest.points, host.points);
});

test('flushOne: dilim başına bir mesaj; gönderilemezse sıranın başına döner, sıra bozulmaz', () => {
  const q = [];
  const ob = new Outbox();
  const got = [];
  let online = false;
  const send = (m) => (online ? (got.push(m), true) : false);
  assert.equal(flushOne(q, ob, send), null, 'boşken mesaj yok');
  ob.push({ t: 's0', id: 'a', c: 1, w: 50, b: 1, p: [1, 1] });
  assert.equal(flushOne(q, ob, send), null, 'bağlantı yok: gitmedi');
  assert.equal(q.length, 1, 'kuyruğa geri kondu');
  ob.push({ t: 'clear' });
  assert.equal(flushOne(q, ob, send), null);
  assert.equal(q.length, 1, 'her dilimde tek deneme');
  online = true;
  flushOne(q, ob, send);
  assert.deepEqual(got, [{ t: 's0', id: 'a', c: 1, w: 50, b: 1, p: [1, 1] }], 'önce bekleyen');
  flushOne(q, ob, send);
  assert.deepEqual(got.at(-1), { t: 'clear' }, 'clear kaybolmaz');
  assert.equal(flushOne(q, ob, send), null);
  assert.equal(got.length, 2);
});

test('PartsIn: sırayla gelen parçalar birleşir; parça 0 ya da aradaki parça kaçarsa set atılır', () => {
  const st = new StrokeStore({ maxStrokes: 5000, maxPoints: 1e6 });
  for (let i = 0; i < 40; i++) {
    st.apply({ t: 's0', id: `s${i}`, c: 1, w: 120, p: new Array(3000).fill(5000) }, 'H');
  }
  const parts = makeParts(st.list, 2).map((m) => ({ ...m, cg: 4 }));
  assert.ok(parts.length >= 3);
  const rx = new PartsIn();
  let out = null;
  for (const m of parts) out = rx.add(m);
  assert.equal(out.b, 2);
  assert.equal(out.cg, 4);
  assert.equal(out.list.length, 40);
  assert.equal(rx.busy, false);

  const gap = new PartsIn();
  assert.equal(gap.add(parts[0]), null);
  assert.equal(gap.busy, true);
  assert.equal(gap.add(parts[2]), 'lost', 'parça 1 kaçtı');
  assert.equal(gap.busy, false, 'yarım set atıldı');

  const noStart = new PartsIn();
  assert.equal(noStart.add(parts[1]), 'lost', 'parça 0 kaçtı');
  assert.equal(noStart.busy, false);

  const restart = new PartsIn();
  restart.add(parts[0]);
  restart.add(parts[1]);
  restart.add(parts[0]); // ev sahibi yeniden başlattı
  let r2 = null;
  for (const m of parts.slice(1)) r2 = restart.add(m);
  assert.equal(r2.list.length, 40, 'yeni setle baştan');
});
