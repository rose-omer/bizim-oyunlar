// Yapboz sayfası saf yardımcıları: süre, kısma, çakışma, eşleme kararları, fotoğraf boyutu, kayıt anahtarı.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatClock,
  formatDuration,
  createClock,
  createSender,
  createConflictGate,
  shouldRequestState,
  progressFromState,
  readHello,
  isBoardState,
} from '../games/yapboz/app.js';
import { fitSize, isHeic, decodeErrorText, MAX_SIDE } from '../games/yapboz/image.js';
import { storeKey } from '../games/yapboz/store.js';

function fakeTime() {
  let t = 0;
  const timers = [];
  return {
    now: () => t,
    setTimer(fn, ms) {
      const id = { fn, at: t + ms };
      timers.push(id);
      return id;
    },
    clearTimer(id) {
      const i = timers.indexOf(id);
      if (i >= 0) timers.splice(i, 1);
    },
    advance(ms) {
      t += ms;
      for (;;) {
        timers.sort((a, b) => a.at - b.at);
        const next = timers[0];
        if (!next || next.at > t) break;
        timers.shift();
        next.fn();
      }
    },
    pending: () => timers.length,
  };
}

function sender() {
  const time = fakeTime();
  const sent = [];
  const s = createSender((m) => sent.push(m), { interval: 100, ...time });
  return { s, sent, time };
}

test('formatClock: mm:ss, saat varsa h:mm:ss, bozuk değer 00:00', () => {
  assert.equal(formatClock(0), '00:00');
  assert.equal(formatClock(65_000), '01:05');
  assert.equal(formatClock(59_999), '00:59');
  assert.equal(formatClock(3_725_000), '1:02:05');
  assert.equal(formatClock(NaN), '00:00');
  assert.equal(formatClock(-5), '00:00');
  assert.equal(formatClock(Infinity), '00:00');
});

test('formatDuration: Türkçe kısa süre', () => {
  assert.equal(formatDuration(45_000), '45 sn');
  assert.equal(formatDuration(300_000), '5 dk');
  assert.equal(formatDuration(754_000), '12 dk 34 sn');
  assert.equal(formatDuration(3_600_000), '1 sa');
  assert.equal(formatDuration(3_900_000), '1 sa 5 dk');
  assert.equal(formatDuration(undefined), '0 sn');
});

test('createClock: yalnız çalışırken sayar; set taban değeri değiştirir', () => {
  const time = fakeTime();
  const c = createClock(time.now);
  assert.equal(c.value(), 0);
  c.start();
  time.advance(1000);
  assert.equal(c.value(), 1000);
  c.stop();
  time.advance(5000);
  assert.equal(c.value(), 1000);
  assert.equal(c.running, false);
  c.set(10_000);
  assert.equal(c.value(), 10_000);
  c.start();
  time.advance(500);
  c.set(20_000);
  time.advance(250);
  assert.equal(c.value(), 20_250);
  c.start(); // ikinci start sayacı sıfırlamaz
  time.advance(250);
  assert.equal(c.value(), 20_500);
});

test('sender: ilk move hemen gider, 100 ms içindekiler birleşir, sonuncusu gider', () => {
  const { s, sent, time } = sender();
  s.act({ type: 'move', g: 3, x: 1, y: 1 });
  assert.equal(sent.length, 1);
  s.act({ type: 'move', g: 3, x: 2, y: 2 });
  s.act({ type: 'move', g: 3, x: 3, y: 3 });
  assert.equal(sent.length, 1);
  time.advance(100);
  assert.equal(sent.length, 2);
  assert.deepEqual(sent[1], { t: 'act', a: { type: 'move', g: 3, x: 3, y: 3 } });
  time.advance(500);
  assert.equal(sent.length, 2);
});

test('sender: aynı turda move gittiyse imleç bir sonraki tura kalır (10 mesaj/sn)', () => {
  const { s, sent, time } = sender();
  s.act({ type: 'move', g: 1, x: 0, y: 0 }); // hemen
  s.act({ type: 'cursor', x: 5, y: 5 });
  s.act({ type: 'move', g: 1, x: 9, y: 9 });
  time.advance(100);
  assert.deepEqual(sent.map((m) => m.t), ['act', 'act']);
  time.advance(100);
  assert.deepEqual(sent.at(-1), { t: 'cur', x: 5, y: 5 });
  // Her 100 ms penceresinde en fazla bir kısılmış mesaj.
  assert.equal(sent.length, 3);
});

test('sender: yalnız imleç varsa 100 ms kısılır', () => {
  const { s, sent, time } = sender();
  s.act({ type: 'cursor', x: 1, y: 1 });
  s.act({ type: 'cursor', x: 2, y: 2 });
  assert.equal(sent.length, 1);
  time.advance(99);
  assert.equal(sent.length, 1);
  time.advance(1);
  assert.deepEqual(sent, [
    { t: 'cur', x: 1, y: 1 },
    { t: 'cur', x: 2, y: 2 },
  ]);
});

test('sender: drop önce bekleyen move\'u gönderir, sonra drop; sonra eski move gelmez', () => {
  const { s, sent, time } = sender();
  s.act({ type: 'grab', g: 7 });
  s.act({ type: 'move', g: 7, x: 1, y: 1 });
  s.act({ type: 'move', g: 7, x: 2, y: 2 });
  s.act({ type: 'drop', g: 7, x: 3, y: 3, pieces: [7, 8] });
  assert.deepEqual(
    sent.map((m) => m.a.type + ':' + (m.a.x ?? '')),
    ['grab:', 'move:1', 'move:2', 'drop:3'],
  );
  time.advance(1000);
  assert.equal(sent.length, 4);
});

test('sender: drop, pieces içindeki eski grup id\'sinin bekleyen move\'unu da boşaltır', () => {
  const { s, sent, time } = sender();
  s.act({ type: 'move', g: 12, x: 1, y: 1 });
  s.act({ type: 'move', g: 12, x: 2, y: 2 });
  s.act({ type: 'drop', g: 4, x: 0, y: 0, pieces: [4, 12, 13] });
  assert.deepEqual(sent.map((m) => m.a.type), ['move', 'move', 'drop']);
  time.advance(1000);
  assert.equal(sent.length, 3);
});

test('sender: grab ve scatter hemen gider; clear bekleyeni atar; forget grubu atar', () => {
  const { s, sent, time } = sender();
  s.act({ type: 'move', g: 1, x: 0, y: 0 });
  s.act({ type: 'move', g: 1, x: 1, y: 1 });
  s.act({ type: 'grab', g: 2 });
  s.act({ type: 'scatter', moves: [] });
  assert.deepEqual(sent.map((m) => m.a.type), ['move', 'grab', 'scatter']);
  s.clear();
  time.advance(1000);
  assert.equal(sent.length, 3);
  assert.equal(time.pending(), 0);
  s.act({ type: 'move', g: 5, x: 0, y: 0 });
  s.act({ type: 'move', g: 5, x: 1, y: 1 });
  s.forget(5);
  time.advance(1000);
  assert.equal(sent.length, 4);
});

test('gate (ev sahibi): kendi tuttuğu grubu isteyen grab reddedilir, ardından move/drop yok sayılır', () => {
  const gate = createConflictGate(true);
  const deny = gate.incoming({ type: 'grab', g: 4 }, 4);
  assert.deepEqual(deny, { apply: false, cancelLocal: false, deny: 4, resync: false });
  assert.equal(gate.incoming({ type: 'move', g: 4, x: 1, y: 1 }, null).apply, false);
  const drop = gate.incoming({ type: 'drop', g: 4, x: 1, y: 1, pieces: [4] }, null);
  assert.equal(drop.apply, false);
  assert.equal(drop.resync, true);
  // Yeni (kabul edilen) grab yasağı kaldırır.
  assert.equal(gate.incoming({ type: 'grab', g: 4 }, null).apply, true);
  assert.equal(gate.incoming({ type: 'move', g: 4, x: 2, y: 2 }, null).apply, true);
});

test('gate (ev sahibi): tuttuğu gruba dokunan drop uygulanmaz, durum yollanır; diğerleri uygulanır', () => {
  const gate = createConflictGate(true);
  assert.deepEqual(gate.incoming({ type: 'drop', g: 2, x: 0, y: 0, pieces: [2, 9] }, 9), {
    apply: false,
    cancelLocal: false,
    deny: null,
    resync: true,
  });
  assert.equal(gate.incoming({ type: 'move', g: 9, x: 0, y: 0 }, 9).apply, false);
  assert.equal(gate.incoming({ type: 'drop', g: 2, x: 0, y: 0, pieces: [2, 3] }, 9).apply, true);
  assert.equal(gate.incoming({ type: 'grab', g: 5 }, 9).apply, true);
  assert.equal(gate.incoming({ type: 'scatter', moves: [{ g: 1, x: 0, y: 0 }] }, 9).apply, true);
  assert.equal(gate.incoming({ type: 'scatter', moves: [{ g: 9, x: 0, y: 0 }] }, 9).resync, true);
  gate.incoming({ type: 'grab', g: 9 }, 9);
  gate.reset();
  assert.equal(gate.incoming({ type: 'move', g: 9, x: 0, y: 0 }, null).apply, true);
});

test('gate (misafir): tuttuğu gruba gelen eylemde önce yerel sürükleme iptal, sonra uygula', () => {
  const gate = createConflictGate(false);
  assert.deepEqual(gate.incoming({ type: 'grab', g: 3 }, 3), {
    apply: true,
    cancelLocal: true,
    deny: null,
    resync: false,
  });
  assert.equal(gate.incoming({ type: 'drop', g: 1, x: 0, y: 0, pieces: [1, 3] }, 3).cancelLocal, true);
  assert.equal(gate.incoming({ type: 'drop', g: 1, x: 0, y: 0, pieces: [1, 2] }, 3).cancelLocal, false);
  assert.equal(gate.incoming({ type: 'move', g: 6, x: 0, y: 0 }, null).apply, true);
  assert.equal(gate.incoming({ type: 'move', g: 6, x: 0, y: 0 }, null).cancelLocal, false);
});

test('gate: bilinmeyen ve imleç eylemleri uygulanmaz', () => {
  for (const host of [true, false]) {
    const gate = createConflictGate(host);
    assert.equal(gate.incoming({ type: 'cursor', x: 1, y: 1 }, null).apply, false);
    assert.equal(gate.incoming({ type: 'boom' }, null).apply, false);
    assert.equal(gate.incoming(null, null).apply, false);
  }
});

test('shouldRequestState: fark + sürükleme yok + 1 sn sessizlik + 2 sn aralık', () => {
  const base = { local: 'a', remote: 'b', dragging: false, lastActAt: 0, lastNeedAt: -Infinity, now: 1000 };
  assert.equal(shouldRequestState(base), true);
  assert.equal(shouldRequestState({ ...base, remote: 'a' }), false);
  assert.equal(shouldRequestState({ ...base, dragging: true }), false);
  assert.equal(shouldRequestState({ ...base, lastActAt: 500 }), false);
  assert.equal(shouldRequestState({ ...base, lastNeedAt: 0 }), false);
  assert.equal(shouldRequestState({ ...base, now: 3000, lastNeedAt: 1000 }), true);
  assert.equal(shouldRequestState({ ...base, remote: undefined }), false);
});

test('progressFromState: sözleşme formülü round(100*(total-groups)/(total-1))', () => {
  assert.equal(progressFromState({ v: 1, groups: new Array(100).fill(0) }, 100), 0);
  assert.equal(progressFromState({ v: 1, groups: [0] }, 100), 100);
  assert.equal(progressFromState({ v: 1, groups: new Array(50).fill(0) }, 100), 51);
  assert.equal(progressFromState(null, 100), 0);
  assert.equal(progressFromState({ groups: [0] }, 1), 100);
});

test('readHello: geçerli mesajı normalleştirir, bozuğu reddeder', () => {
  const ok = readHello({ t: 'hello', photo: 'local:1', cols: 10, rows: 8, seed: 42, count: 80, note: 'x'.repeat(300), elapsed: 1234 });
  assert.equal(ok.photo, 'local:1');
  assert.equal(ok.cols, 10);
  assert.equal(ok.rows, 8);
  assert.equal(ok.seed, 42);
  assert.equal(ok.count, 80);
  assert.equal(ok.note.length, 200);
  assert.equal(ok.elapsed, 1234);
  assert.equal(typeof ok.sig, 'string');
  assert.notEqual(ok.sig, readHello({ photo: 'local:1', cols: 10, rows: 8, seed: 43 }).sig);
  const loose = readHello({ photo: 'u', cols: 3, rows: 2, seed: 1 });
  assert.equal(loose.count, 6);
  assert.equal(loose.note, '');
  assert.equal(loose.elapsed, 0);
  assert.equal(readHello({ photo: '', cols: 3, rows: 2, seed: 1 }), null);
  assert.equal(readHello({ photo: 'u', cols: 0, rows: 2, seed: 1 }), null);
  assert.equal(readHello({ photo: 'u', cols: 2.5, rows: 2, seed: 1 }), null);
  assert.equal(readHello({ photo: 'u', cols: 3, rows: 2, seed: 'x' }), null);
  assert.equal(readHello(null), null);
});

test('isBoardState', () => {
  assert.equal(isBoardState({ v: 1, groups: [] }), true);
  assert.equal(isBoardState({ v: 1 }), false);
  assert.equal(isBoardState(null), false);
});

test('fitSize: uzun kenar 2000 px, büyütmez, en-boy korunur', () => {
  assert.equal(MAX_SIDE, 2000);
  assert.deepEqual(fitSize(4000, 3000), { width: 2000, height: 1500 });
  assert.deepEqual(fitSize(3024, 4032), { width: 1500, height: 2000 });
  assert.deepEqual(fitSize(1000, 800), { width: 1000, height: 800 });
  assert.deepEqual(fitSize(8000, 10), { width: 2000, height: 3 });
  assert.deepEqual(fitSize(9000, 1), { width: 2000, height: 1 });
});

test('isHeic ve decodeErrorText', () => {
  assert.equal(isHeic({ type: 'image/heic', name: 'a' }), true);
  assert.equal(isHeic({ type: '', name: 'IMG_1.HEIF' }), true);
  assert.equal(isHeic({ type: 'image/jpeg', name: 'a.jpg' }), false);
  assert.match(decodeErrorText({ type: 'image/heic' }), /HEIC/);
  assert.doesNotMatch(decodeErrorText({ type: 'image/png' }), /HEIC/);
});

test('storeKey', () => {
  assert.equal(storeKey('abc'), 'yapboz:abc');
  assert.equal(storeKey(null), 'yapboz:solo');
});
