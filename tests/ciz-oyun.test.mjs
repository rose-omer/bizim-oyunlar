import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ROUND_MS, REVEAL_MS, MAX_GUESSES, normalize, matches, hintOf, wordAt, initialState, reduce,
  toAction, schedule, viewFor, drawerId, canDraw, totalRounds, resultOf,
} from '../games/ciz/oyun.js';
import { WORDS } from '../games/ciz/kelimeler.js';

const A = 'aaa', B = 'bbb';
const T0 = 100_000;

function tahmin({ rounds = 3, seed = 11, from } = {}) {
  return reduce(from || initialState({ players: [A, B] }), {
    type: 'setup', mode: 'tahmin', rounds, seed, players: [A, B], names: { [A]: 'Ali', [B]: 'Ece' }, now: T0,
  });
}
const guess = (s, by, text, now) => reduce(s, { type: 'guess', by, text, now });

test('normalize: tr küçük harf, kırp, boşluk daralt, aksan sil', () => {
  assert.equal(normalize('  Deniz   FENERİ  '), 'deniz feneri');
  assert.equal(normalize('IŞIK'), 'isik');
  assert.equal(normalize('Çiçek'), 'cicek');
  assert.equal(normalize('kâğıt'), 'kagit');
  assert.equal(normalize('ÖRDEK'), 'ordek');
  assert.equal(normalize('Güneş'), 'gunes');
  assert.equal(normalize('deniz-feneri'), 'deniz feneri');
  assert.equal(normalize('Şemsiye!'), 'semsiye');
  assert.equal(normalize(''), '');
  assert.equal(normalize(null), '');
});

test('matches: normalize sonrası tam eşleşme; boşluksuz yazım da kabul', () => {
  assert.ok(matches('Deniz Feneri', 'deniz feneri'));
  assert.ok(matches('denizfeneri', 'deniz feneri'));
  assert.ok(matches('  KEDİ ', 'kedi'));
  assert.ok(matches('kedı', 'kedi'));
  assert.ok(!matches('kediler', 'kedi'));
  assert.ok(!matches('ked', 'kedi'));
  assert.ok(!matches('', 'kedi'));
});

test('hintOf: harf sayısı ipucu', () => {
  assert.equal(hintOf('kedi'), '_ _ _ _ (4)');
  assert.equal(hintOf('deniz feneri'), '_ _ _ _ _   _ _ _ _ _ _ (5, 6)');
  assert.equal(hintOf('şemsiye'), '_ _ _ _ _ _ _ (7)');
});

test('wordAt: tohuma bağlı, banka içinden, ardışık işaretçiler farklı kelime', () => {
  assert.equal(wordAt(5, 0), wordAt(5, 0));
  const seen = new Set();
  for (let i = 0; i < 20; i++) {
    const w = wordAt(5, i);
    assert.ok(WORDS.includes(w));
    seen.add(w);
  }
  assert.equal(seen.size, 20);
});

test('setup: tahmin iki kişi ister; serbest tek kişiyle olur', () => {
  const one = initialState({ players: [A] });
  assert.equal(reduce(one, { type: 'setup', mode: 'tahmin', rounds: 3, seed: 1, players: [A], now: T0 }), one);
  const free = reduce(one, { type: 'setup', mode: 'serbest', seed: 1, players: [A], now: T0 });
  assert.equal(free.phase, 'free');
  assert.equal(free.board, one.board + 1);
  assert.ok(canDraw(free, A));
});

test('tahmin başlangıcı: tur, çizen, kelime, süre', () => {
  const s = tahmin();
  assert.equal(s.phase, 'turn');
  assert.equal(s.round, 0);
  assert.equal(totalRounds(s), 6);
  assert.equal(drawerId(s), A);
  assert.equal(s.word, wordAt(11, 0));
  assert.equal(s.deadline, T0 + ROUND_MS);
  assert.equal(s.score, 0);
  assert.ok(canDraw(s, A));
  assert.ok(!canDraw(s, B));
});

test('çizen tahmin edemez; boş tahmin yok sayılır; yanlış tahmin listeye girer', () => {
  const s = tahmin();
  assert.equal(guess(s, A, s.word, T0 + 1000), s);
  assert.equal(guess(s, B, '   ', T0 + 1000), s);
  const s1 = guess(s, B, 'zzz', T0 + 1000);
  assert.equal(s1.phase, 'turn');
  assert.deepEqual(s1.guesses, [{ by: B, text: 'zzz', ok: false }]);
  const long = guess(s, B, 'x'.repeat(100), T0 + 1000);
  assert.equal(long.guesses[0].text.length, 40);
});

test('doğru tahmin: ortak puan + süre bonusu, gösterim aşaması', () => {
  const s = tahmin();
  const now = T0 + 20_000;
  const s1 = guess(s, B, s.word.toUpperCase(), now);
  assert.equal(s1.phase, 'reveal');
  assert.equal(s1.ok, true);
  assert.equal(s1.gained, 50 + 60);
  assert.equal(s1.score, 110);
  assert.equal(s1.revealUntil, now + REVEAL_MS);
  assert.deepEqual(s1.history, [{ word: s.word, drawer: A, ok: true, points: 110 }]);
  assert.equal(s1.guesses.at(-1).ok, true);
  assert.equal(guess(s1, B, 'tekrar', now + 10), s1, 'gösterimde tahmin yok');
});

test('süre bitince tahmin sayılmaz, tur zaman aşımıyla kapanır', () => {
  const s = tahmin();
  const late = guess(s, B, s.word, s.deadline + 5);
  assert.equal(late.phase, 'reveal');
  assert.equal(late.ok, false);
  assert.equal(late.score, 0);
  assert.equal(late.guesses.length, 0);
});

test('timeout: süreden önce yok sayılır; süre dolunca kelime açılır', () => {
  const s = tahmin();
  assert.equal(reduce(s, { type: 'timeout', now: s.deadline - 1000 }), s);
  const t = reduce(s, { type: 'timeout', now: s.deadline });
  assert.equal(t.phase, 'reveal');
  assert.equal(t.ok, false);
  assert.equal(t.gained, 0);
  assert.deepEqual(t.history, [{ word: s.word, drawer: A, ok: false, points: 0 }]);
});

test('next: gösterim bitmeden yok sayılır; sonra çizen değişir, tuval temizlenir', () => {
  const s = reduce(tahmin(), { type: 'timeout', now: T0 + ROUND_MS });
  assert.equal(reduce(s, { type: 'next', now: s.revealUntil - 500 }), s);
  const n = reduce(s, { type: 'next', now: s.revealUntil });
  assert.equal(n.phase, 'turn');
  assert.equal(n.round, 1);
  assert.equal(drawerId(n), B);
  assert.notEqual(n.word, s.word);
  assert.deepEqual(n.guesses, []);
  assert.equal(n.board, s.board + 1);
  assert.equal(n.deadline, s.revealUntil + ROUND_MS);
});

test('tam oyun: 2 tur ayarı = 4 tur, sonra end; sonuç; sonraki oyunda ilk çizen değişir', () => {
  let s = tahmin({ rounds: 2 });
  let now = T0;
  for (let r = 0; r < 4; r++) {
    assert.equal(s.phase, 'turn');
    const guesser = drawerId(s) === A ? B : A;
    now += 10_000;
    s = r % 2 === 0 ? guess(s, guesser, s.word, now) : reduce(s, { type: 'timeout', now: (now = s.deadline) });
    now = s.revealUntil;
    s = reduce(s, { type: 'next', now });
  }
  assert.equal(s.phase, 'end');
  assert.equal(s.history.length, 4);
  const r = resultOf(s);
  assert.equal(r.mode, 'tahmin');
  assert.equal(r.rounds, 2);
  assert.equal(r.total, 4);
  assert.equal(r.ok, 2);
  assert.equal(r.score, s.score);
  assert.equal(s.score, 2 * (50 + 70));
  const again = tahmin({ rounds: 2, seed: 12, from: s });
  assert.equal(drawerId(again), B);
  assert.equal(again.score, 0);
});

test('pas: yalnız çizen, tur başına bir kez, yeni kelime', () => {
  const s = tahmin();
  assert.equal(reduce(s, { type: 'pass', by: B, now: T0 + 1 }), s);
  const p = reduce(s, { type: 'pass', by: A, now: T0 + 1 });
  assert.notEqual(p.word, s.word);
  assert.equal(p.passes, 1);
  assert.equal(p.deadline, s.deadline);
  assert.equal(reduce(p, { type: 'pass', by: A, now: T0 + 2 }), p);
});

test('tahmin listesi sınırlı', () => {
  let s = tahmin();
  for (let i = 0; i < MAX_GUESSES + 10; i++) s = guess(s, B, `yanlis${i}`, T0 + 100 + i);
  assert.equal(s.guesses.length, MAX_GUESSES);
  assert.equal(s.guesses.at(-1).text, `yanlis${MAX_GUESSES + 9}`);
});

test('viewFor: tahmin eden kelimeyi görmez, ipucu görür; gösterimde herkes görür', () => {
  const s = tahmin();
  const g = viewFor(s, B);
  assert.equal(g.word, null);
  assert.equal(g.hint, hintOf(s.word));
  assert.equal(viewFor(s, A).word, s.word);
  const r = reduce(s, { type: 'timeout', now: s.deadline });
  assert.equal(viewFor(r, B).word, s.word);
});

test('schedule: turda süre sonu, gösterimde sonraki tur', () => {
  const s = tahmin();
  const p = schedule(s);
  assert.equal(p.at, s.deadline);
  assert.equal(p.action.type, 'timeout');
  const r = reduce(s, { type: 'timeout', now: s.deadline });
  const q = schedule(r);
  assert.equal(q.at, r.revealUntil);
  assert.equal(q.action.type, 'next');
  assert.notEqual(p.key, q.key);
  assert.equal(schedule(initialState({ players: [A, B] })), null);
});

test('toAction: misafir guess/pass/again; setup ve menu yalnız ev sahibi', () => {
  const s = tahmin();
  const ctx = { hostId: A, now: 9, seed: 3 };
  assert.deepEqual(toAction({ type: 'guess', text: 'kedi' }, B, s, ctx), { type: 'guess', text: 'kedi', by: B, now: 9 });
  assert.deepEqual(toAction({ type: 'pass' }, B, s, ctx), { type: 'pass', by: B, now: 9 });
  assert.equal(toAction({ type: 'setup', mode: 'serbest' }, B, s, ctx), null);
  assert.equal(toAction({ type: 'menu' }, B, s, ctx), null);
  assert.equal(toAction({ type: 'timeout' }, B, s, ctx), null);
  assert.equal(toAction({ type: 'next' }, A, s, ctx), null);
  assert.equal(toAction({ type: 'again' }, B, s, ctx), null, 'oyun bitmeden tekrar yok');
  const end = { ...s, phase: 'end' };
  const again = toAction({ type: 'again' }, B, end, ctx);
  assert.equal(again.type, 'setup');
  assert.equal(again.mode, 'tahmin');
  assert.equal(again.rounds, 3);
  assert.equal(again.seed, 3);
  const setup = toAction({ type: 'setup', mode: 'tahmin', rounds: 99 }, A, s, ctx);
  assert.equal(setup.rounds, 3, 'geçersiz tur sayısı varsayılana döner');
  assert.equal(toAction({ type: 'setup', mode: 'tahmin', rounds: 5 }, A, s, ctx).rounds, 5);
  assert.deepEqual(toAction({ type: 'menu' }, A, s, ctx), { type: 'menu' });
});

test('cizimAnisi: çizim fotoğraflı anı olur; kelime asla başlığa girmez', async () => {
  const { cizimAnisi } = await import('../games/ciz/oyun.js');
  const url = 'https://x.supabase.co/storage/v1/object/public/photos/abcdefghij/1.webp';
  assert.deepEqual(cizimAnisi({ url, gun: '2026-10-31', birlikte: true }),
    { baslik: 'Birlikte çizdik 🎨', tarih: '2026-10-31', fotolar: [url], etiketler: ['çizim'] });
  assert.equal(cizimAnisi({ url, gun: '2026-10-31', birlikte: false }).baslik, 'Çizimim 🎨');
  assert.equal(cizimAnisi({ url: '', gun: '2026-10-31' }), null);
  assert.equal(cizimAnisi({ url, gun: '31.10.2026' }), null);
});
