import { test } from 'node:test';
import assert from 'node:assert/strict';
import { THEMES, themeById } from '../games/hafiza/temalar.js';
import {
  SIZES, sizeById, deal, initialState, reduce, toAction, resultOf, winnerOf, bestLayout,
} from '../games/hafiza/oyun.js';
import { mulberry32, shuffle } from '../games/hafiza/rng.js';

const A = 'aaa', B = 'bbb';

function start({ players = [A, B], size = '4x4', theme = 'ask', seed = 42, now = 1000, from } = {}) {
  return reduce(from || initialState({ players }), { type: 'setup', theme, size, seed, players, names: {}, now });
}
// Destede aynı emojili iki konumu ve farklı emojili iki konumu bul.
function pairOf(s, skip = []) {
  for (let i = 0; i < s.deck.length; i++) {
    if (skip.includes(i) || s.owner[i] !== -1) continue;
    const j = s.deck.findIndex((e, k) => k !== i && e === s.deck[i]);
    return [i, j];
  }
  return null;
}
function mismatchOf(s) {
  const i = s.owner.findIndex((o) => o === -1);
  const j = s.deck.findIndex((e, k) => s.owner[k] === -1 && e !== s.deck[i]);
  return [i, j];
}
const flip = (s, i, by, now = 2000) => reduce(s, { type: 'flip', i, by, now });

test('temalar: 5 tema, her biri en az 18 farklı emoji, kimlikler tekil', () => {
  assert.equal(THEMES.length, 5);
  const names = THEMES.map((t) => t.name);
  for (const n of ['Aşk', 'Yemek', 'Hayvanlar', 'Seyahat', 'Doğa']) assert.ok(names.includes(n), n);
  assert.equal(new Set(THEMES.map((t) => t.id)).size, 5);
  for (const t of THEMES) {
    assert.ok(t.emoji.length >= 18, t.id);
    assert.equal(new Set(t.emoji).size, t.emoji.length, `${t.id} tekrar içeriyor`);
    assert.ok(t.icon, t.id);
  }
  assert.equal(themeById('yok'), null);
});

test('rng: aynı tohum aynı dizi; shuffle permütasyon döner', () => {
  const a = mulberry32(7), b = mulberry32(7);
  for (let i = 0; i < 5; i++) assert.equal(a(), b());
  const arr = [1, 2, 3, 4, 5, 6];
  const s = shuffle(arr, mulberry32(3));
  assert.deepEqual([...s].sort(), arr);
  assert.deepEqual(arr, [1, 2, 3, 4, 5, 6]);
});

test('deal: boyuta göre kart sayısı, her emoji tam iki kez, tohuma bağlı', () => {
  for (const sz of SIZES) {
    const d = deal('yemek', sz.id, 9);
    assert.equal(d.length, sz.cols * sz.rows);
    const counts = new Map();
    for (const e of d) counts.set(e, (counts.get(e) || 0) + 1);
    assert.equal(counts.size, sz.pairs);
    for (const c of counts.values()) assert.equal(c, 2);
  }
  assert.deepEqual(deal('ask', '6x6', 5), deal('ask', '6x6', 5));
  assert.notDeepEqual(deal('ask', '6x6', 5), deal('ask', '6x6', 6));
  assert.equal(sizeById('4x6').pairs, 12);
});

test('setup: oyun başlar, puanlar sıfır, geçersiz tema/boyut yok sayılır', () => {
  const s = start({ size: '4x6' });
  assert.equal(s.phase, 'play');
  assert.equal(s.deck.length, 24);
  assert.deepEqual(s.scores, [0, 0]);
  assert.deepEqual(s.open, []);
  assert.equal(s.moves, 0);
  assert.equal(s.startedAt, null);
  const base = initialState({ players: [A, B] });
  assert.equal(reduce(base, { type: 'setup', theme: 'yok', size: '4x4', seed: 1, players: [A, B], now: 1 }), base);
  assert.equal(reduce(base, { type: 'setup', theme: 'ask', size: '9x9', seed: 1, players: [A, B], now: 1 }), base);
});

test('ilk oyuncu her oyunda değişir', () => {
  const s1 = start();
  assert.equal(s1.turn, 0);
  const s2 = start({ from: s1, seed: 43 });
  assert.equal(s2.turn, 1);
  const s3 = start({ from: s2, seed: 44 });
  assert.equal(s3.turn, 0);
});

test('sırası olmayan oyuncu çeviremez; aynı karta iki kez basılmaz', () => {
  const s = start();
  assert.equal(flip(s, 0, B), s);
  const s1 = flip(s, 0, A);
  assert.deepEqual(s1.open, [0]);
  assert.equal(s1.startedAt, 2000);
  assert.equal(flip(s1, 0, A), s1);
  assert.equal(flip(s1, 99, A), s1);
  assert.equal(flip(s1, -1, A), s1);
});

test('eşleşme: puan +1, sıra aynı oyuncuda kalır', () => {
  const s = start();
  const [i, j] = pairOf(s);
  const s2 = flip(flip(s, i, A), j, A);
  assert.deepEqual(s2.open, []);
  assert.equal(s2.pending, false);
  assert.equal(s2.owner[i], 0);
  assert.equal(s2.owner[j], 0);
  assert.deepEqual(s2.scores, [1, 0]);
  assert.equal(s2.turn, 0);
  assert.equal(s2.moves, 1);
  assert.equal(flip(s2, i, A), s2, 'eşleşmiş kart çevrilmez');
});

test('yanlış: kartlar açık bekler, üçüncü kart çevrilmez, hide sonrası sıra geçer', () => {
  const s = start();
  const [i, j] = mismatchOf(s);
  const s2 = flip(flip(s, i, A), j, A);
  assert.equal(s2.pending, true);
  assert.deepEqual(s2.open, [i, j]);
  assert.equal(s2.moves, 1);
  const k = s.owner.findIndex((o, x) => x !== i && x !== j);
  assert.equal(flip(s2, k, A), s2);
  const s3 = reduce(s2, { type: 'hide', now: 3000 });
  assert.deepEqual(s3.open, []);
  assert.equal(s3.pending, false);
  assert.equal(s3.turn, 1);
  assert.equal(reduce(s3, { type: 'hide', now: 3100 }), s3, 'bekleyen yoksa hide etkisiz');
});

test('tek kişilik: sıra hep aynı oyuncuda, hamle sayılır', () => {
  const s = start({ players: [A] });
  const [i, j] = mismatchOf(s);
  const s2 = reduce(flip(flip(s, i, A), j, A), { type: 'hide', now: 3000 });
  assert.equal(s2.turn, 0);
  assert.equal(s2.moves, 1);
});

test('bitiş: tüm eşler bulununca phase end, sonuç ve kazanan', () => {
  let s = start({ size: '4x4' });
  let t = 2000;
  while (s.phase === 'play') {
    const [i, j] = pairOf(s);
    s = flip(flip(s, i, A, t), j, A, t + 500);
    t += 1000;
  }
  assert.equal(s.phase, 'end');
  assert.equal(s.endedAt, t - 1000 + 500);
  assert.deepEqual(s.scores, [8, 0]);
  assert.equal(winnerOf(s), 0);
  const r = resultOf(s);
  assert.equal(r.mode, 'duo');
  assert.deepEqual(r.scores, [8, 0]);
  assert.equal(r.moves, 8);
  assert.equal(r.theme, 'ask');
  assert.equal(r.size, '4x4');
  assert.equal(r.seconds, Math.round((s.endedAt - s.startedAt) / 1000));
  assert.equal(flip(s, 0, A), s);
});

test('berabere: winnerOf -1', () => {
  const s = { ...start(), scores: [4, 4], phase: 'end' };
  assert.equal(winnerOf(s), -1);
});

test('menu: kurulum ekranına döner, tema/boyut korunur', () => {
  const s = start({ theme: 'doga', size: '6x6' });
  const m = reduce(s, { type: 'menu' });
  assert.equal(m.phase, 'setup');
  assert.equal(m.theme, 'doga');
  assert.equal(m.size, '6x6');
});

test('toAction: misafir yalnız flip ve again isteyebilir; setup/menu yalnız ev sahibi', () => {
  const s = start();
  const ctx = { hostId: A, now: 5, seed: 77 };
  assert.deepEqual(toAction({ type: 'flip', i: 3 }, B, s, ctx), { type: 'flip', i: 3, by: B, now: 5 });
  assert.equal(toAction({ type: 'setup', theme: 'ask', size: '4x4' }, B, s, ctx), null);
  assert.equal(toAction({ type: 'menu' }, B, s, ctx), null);
  assert.equal(toAction({ type: 'hide' }, B, s, ctx), null);
  assert.equal(toAction({ type: 'again' }, B, s, ctx), null, 'oyun bitmeden tekrar yok');
  const end = { ...s, phase: 'end' };
  const again = toAction({ type: 'again' }, B, end, ctx);
  assert.equal(again.type, 'setup');
  assert.equal(again.seed, 77);
  assert.equal(again.theme, s.theme);
  assert.deepEqual(again.players, s.players);
  const setup = toAction({ type: 'setup', theme: 'yemek', size: '6x6' }, A, s, ctx);
  assert.equal(setup.type, 'setup');
  assert.equal(setup.theme, 'yemek');
  assert.deepEqual(toAction({ type: 'menu' }, A, s, ctx), { type: 'menu' });
});

test('bestLayout: telefonda dikey ve yatayda sığan yerleşimi seçer', () => {
  const p = bestLayout('4x6', 343, 700, 8);
  assert.equal(p.cols, 4);
  assert.equal(p.rows, 6);
  assert.equal(p.transposed, false);
  const l = bestLayout('4x6', 800, 300, 8);
  assert.equal(l.cols, 6);
  assert.equal(l.rows, 4);
  assert.equal(l.transposed, true);
  for (const [w, h] of [[343, 700], [800, 300], [1200, 800]]) {
    for (const sz of SIZES) {
      const r = bestLayout(sz.id, w, h, 8);
      assert.ok(r.cols * r.w + (r.cols - 1) * 8 <= w + 0.01, `${sz.id} ${w}x${h} genişlik`);
      assert.ok(r.rows * r.h + (r.rows - 1) * 8 <= h + 0.01, `${sz.id} ${w}x${h} yükseklik`);
      assert.ok(r.w <= r.h, 'kart yatık değil');
    }
  }
});
