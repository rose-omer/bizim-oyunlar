// Oyunlarımız sayfası ve ana sayfa önerileri: saf mantık (sayfalar/oyunlar/mantik.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GAMES, SAYFALAR } from '../js/core/games.js';
import {
  GRUPLAR, OYUN_GRUBU, grupla, grupRengi, kartAlt, gunlukSira, onerilenler, acilisPlani,
} from '../sayfalar/oyunlar/mantik.js';

const ids = (list) => list.map((g) => g.id);

test('OYUN_GRUBU: her oyun tek grupta, harita yalnız var olan oyunları ve grupları anar', () => {
  const grupIdleri = new Set(GRUPLAR.map((g) => g.id));
  for (const [oyun, grup] of Object.entries(OYUN_GRUBU)) {
    assert.ok(GAMES.some((g) => g.id === oyun), `bilinmeyen oyun ${oyun}`);
    assert.ok(grupIdleri.has(grup), `bilinmeyen grup ${grup}`);
  }
  for (const g of GAMES) assert.ok(OYUN_GRUBU[g.id], `grupsuz oyun ${g.id}`);
});

test('grupla: 23 oyun 4 grupta, talimattaki sırayla', () => {
  const gr = grupla(GAMES);
  assert.equal(GAMES.length, 23);
  assert.deepEqual(gr.map((g) => g.ad), ['Tanışalım', 'Masa oyunları', 'Kelime ve zekâ', 'Birlikte yarat']);
  assert.deepEqual(ids(gr[0].oyunlar), ['tanis', 'aynikafa', 'kimdaha', 'hicyaptin', 'derin', 'dogruluk']);
  assert.deepEqual(ids(gr[1].oyunlar), ['dama', 'tavla', 'satranc', 'dorttas', 'xox', 'amiral', 'pisti', 'mangala', 'kutu', 'reversi']);
  assert.deepEqual(ids(gr[2].oyunlar), ['kelime', 'duello', 'sudoku', 'hafiza']);
  assert.deepEqual(ids(gr[3].oyunlar), ['yapboz', 'ciz', 'hikaye']);
  assert.equal(gr.reduce((n, g) => n + g.oyunlar.length, 0), GAMES.length);
});

test('grupla: haritada olmayan yeni oyun "Diğer"e düşer; boş grup gösterilmez', () => {
  const yeni = { id: 'bilmece', title: 'Bilmece', emoji: '🧠', players: '2', minutes: '5 dk' };
  const gr = grupla([...GAMES, yeni]);
  assert.equal(gr.at(-1).ad, 'Diğer');
  assert.deepEqual(ids(gr.at(-1).oyunlar), ['bilmece']);
  const az = grupla(GAMES.filter((g) => g.id === 'tavla' || g.id === 'yapboz'));
  assert.deepEqual(az.map((g) => g.id), ['masa', 'yarat']);
  assert.deepEqual(grupla(null), []);
});

test('grupRengi: grup başına sabit ton; Diğer ayrı', () => {
  assert.equal(grupRengi('tanis'), grupRengi('derin'));
  assert.equal(grupRengi('dama'), grupRengi('pisti'));
  assert.notEqual(grupRengi('tanis'), grupRengi('dama'));
  assert.match(grupRengi('yok-boyle-oyun'), /^[1-6]$/);
  assert.notEqual(grupRengi('yok-boyle-oyun'), grupRengi('yapboz'));
});

test('kartAlt: kişi ve süre tek satır', () => {
  assert.equal(kartAlt({ players: '2', minutes: '10 dk' }), '2 kişi · 10 dk');
  assert.equal(kartAlt({ players: '1–2', minutes: '15–90 dk' }), '1–2 kişi · 15–90 dk');
  assert.equal(kartAlt({ players: '2' }), '2 kişi');
});

test('gunlukSira: gruplar arasında sırayla dolaşır, her oyun bir kez', () => {
  const s = gunlukSira(GAMES);
  assert.equal(s.length, GAMES.length);
  assert.equal(new Set(ids(s)).size, GAMES.length);
  assert.deepEqual(ids(s).slice(0, 4), ['tanis', 'dama', 'kelime', 'yapboz']);
});

test('onerilenler: son oynanan önce + günlük 2; aynı gün aynı seçim, ertesi gün başka', () => {
  const a = onerilenler(GAMES, { bugun: '2026-10-31', son: 'tavla' });
  assert.equal(a.length, 3);
  assert.equal(a[0].id, 'tavla');
  assert.equal(new Set(ids(a)).size, 3);
  assert.deepEqual(ids(onerilenler(GAMES, { bugun: '2026-10-31', son: 'tavla' })), ids(a));
  const yarin = onerilenler(GAMES, { bugun: '2026-11-01', son: 'tavla' });
  assert.equal(yarin[0].id, 'tavla');
  assert.notDeepEqual(ids(yarin.slice(1)), ids(a.slice(1)));
  // Son oynanan yoksa günlük ikili + sıradaki üçüncü.
  const sonsuz = onerilenler(GAMES, { bugun: '2026-10-31' });
  assert.equal(sonsuz.length, 3);
  assert.deepEqual(ids(sonsuz.slice(0, 2)), ids(onerilenler(GAMES, { bugun: '2026-10-31', n: 2 })));
});

test('onerilenler: günlük ikili tüm oyunları dolaşır; tekrar yok', () => {
  const gorulen = new Set();
  for (let i = 0; i < Math.ceil(GAMES.length / 2); i++) {
    const d = new Date(Date.UTC(2026, 10, 1 + i)).toISOString().slice(0, 10);
    for (const g of onerilenler(GAMES, { bugun: d, n: 2 })) gorulen.add(g.id);
  }
  assert.equal(gorulen.size, GAMES.length);
});

test('onerilenler: son oynanan günlük ikilideyse yerine sıradaki gelir; bilinmeyen son yok sayılır', () => {
  const ikili = ids(onerilenler(GAMES, { bugun: '2026-10-31', n: 2 }));
  const r = onerilenler(GAMES, { bugun: '2026-10-31', son: ikili[0] });
  assert.equal(r[0].id, ikili[0]);
  assert.equal(r[1].id, ikili[1]);
  assert.equal(new Set(ids(r)).size, 3);
  assert.deepEqual(ids(onerilenler(GAMES, { bugun: '2026-10-31', son: 'silinmis' })), ids(onerilenler(GAMES, { bugun: '2026-10-31' })));
  assert.deepEqual(onerilenler([], { bugun: '2026-10-31' }), []);
  assert.equal(onerilenler(GAMES, { bugun: 'bozuk' }).length, 3);
});

test('acilisPlani: odasız tek kişi; sevgilin o oyundaysa ona katıl; yoksa ev sahibi ol ve haber ver', () => {
  assert.deepEqual(acilisPlani('tavla', { roomId: null }), { solo: true, host: null, gonder: false });
  const p = { clientId: 'gul', page: 'tavla', host: 'omer' };
  assert.deepEqual(acilisPlani('tavla', { roomId: 'oda', partner: p, benId: 'omer' }), { solo: false, host: 'omer', gonder: false });
  assert.deepEqual(acilisPlani('tavla', { roomId: 'oda', partner: { clientId: 'gul', page: 'tavla' }, benId: 'omer' }),
    { solo: false, host: 'gul', gonder: false });
  assert.deepEqual(acilisPlani('dama', { roomId: 'oda', partner: p, benId: 'omer' }), { solo: false, host: 'omer', gonder: true });
  assert.deepEqual(acilisPlani('dama', { roomId: 'oda', partner: null, benId: 'omer' }), { solo: false, host: 'omer', gonder: true });
});

test('SAYFALAR: oyunlar kaydı', () => {
  const s = SAYFALAR.find((x) => x.id === 'oyunlar');
  assert.deepEqual(s, { id: 'oyunlar', title: 'Oyunlarımız', icon: '🎲', path: 'sayfalar/oyunlar/', desc: 'Tüm oyunlarınız, gruplu.' });
});
