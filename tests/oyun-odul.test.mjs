// Site oyunları → Yavrumuz jetonu (sayfalar/yavru/site-oyun.js). Saf mantık; oyun bağlantısı kaynaktan denetlenir.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { applyPatch } from '../js/core/veri.js';
import { jetonBakiye, jetonKaydi, GUNLUK_SINIR } from '../sayfalar/yavru/jeton.js';
import { SITE_OYUNLARI, SITE_ODUL, OYUN_HAK, kalanOyunHakki, siteOyunYamasi } from '../sayfalar/yavru/site-oyun.js';

const A = 'omer-test-id';
const B = 'gul-test-id';
const T = new Date(2026, 10, 7, 12).getTime();
const YARIN = new Date(2026, 10, 8, 12).getTime();
const uygula = (d, r) => applyPatch(d, r.yama);

test('ödül: kazanan fazla alır, kaybeden boş dönmez, beraberlik ve ortak oyun arada', () => {
  assert.ok(SITE_ODUL.kazan > SITE_ODUL.beraber && SITE_ODUL.beraber > SITE_ODUL.kayip && SITE_ODUL.kayip > 0);
  assert.equal(SITE_ODUL.ortak, SITE_ODUL.beraber);
  for (const sonuc of Object.keys(SITE_ODUL)) {
    const r = siteOyunYamasi({}, { kim: A, oyun: 'dama', sonuc, simdi: T });
    assert.equal(r.eklenen, SITE_ODUL[sonuc], sonuc);
    assert.equal(jetonBakiye(uygula({}, r)), SITE_ODUL[sonuc], sonuc);
  }
});

test('yama yalnız kişinin kendi sayacını yazar; iki kişi çakışmaz', () => {
  const r = siteOyunYamasi({}, { kim: A, oyun: 'dama', sonuc: 'kazan', simdi: T });
  assert.deepEqual(Object.keys(r.yama), [`jeton.${A}`]);
  const r2 = siteOyunYamasi({}, { kim: B, oyun: 'dama', sonuc: 'kayip', simdi: T });
  const d = uygula(uygula({}, r), r2);
  assert.equal(jetonKaydi(d, A).kazanc, SITE_ODUL.kazan);
  assert.equal(jetonKaydi(d, B).kazanc, SITE_ODUL.kayip);
});

test('hak: oyun başına günde OYUN_HAK ödül; başka oyun ayrı; ertesi gün yenilenir', () => {
  assert.equal(OYUN_HAK, 3);
  let d = {};
  assert.equal(kalanOyunHakki(d, A, 'dama', T), OYUN_HAK);
  for (let i = 0; i < OYUN_HAK; i++) {
    const r = siteOyunYamasi(d, { kim: A, oyun: 'dama', sonuc: 'kazan', simdi: T });
    assert.equal(r.kalanHak, OYUN_HAK - i - 1);
    d = uygula(d, r);
  }
  assert.equal(kalanOyunHakki(d, A, 'dama', T), 0);
  assert.deepEqual(siteOyunYamasi(d, { kim: A, oyun: 'dama', sonuc: 'kazan', simdi: T }), { hata: 'hak' });
  assert.ok(siteOyunYamasi(d, { kim: A, oyun: 'tavla', sonuc: 'kazan', simdi: T }).yama, 'başka oyun');
  assert.ok(siteOyunYamasi(d, { kim: B, oyun: 'dama', sonuc: 'kazan', simdi: T }).yama, 'sevgilinin hakkı ayrı');
  assert.equal(kalanOyunHakki(d, A, 'dama', YARIN), OYUN_HAK);
  assert.ok(siteOyunYamasi(d, { kim: A, oyun: 'dama', sonuc: 'kazan', simdi: YARIN }).yama);
});

test('günlük jeton sınırı geçerli: aşan kısım kesilir, dolunca sinir; hak harcanmaz', () => {
  const dolu = { jeton: { [A]: { kazanc: GUNLUK_SINIR - 5, harcama: 0, gun: '2026-11-07', bugun: GUNLUK_SINIR - 5 } } };
  const r = siteOyunYamasi(dolu, { kim: A, oyun: 'dama', sonuc: 'kazan', simdi: T });
  assert.equal(r.eklenen, 5);
  const son = uygula(dolu, r);
  assert.deepEqual(siteOyunYamasi(son, { kim: A, oyun: 'tavla', sonuc: 'kazan', simdi: T }), { hata: 'sinir' });
  assert.equal(kalanOyunHakki(son, A, 'tavla', T), OYUN_HAK);
});

test('var olan sayaç korunur: harcama, kazanç, görev günü', () => {
  const d = { jeton: { [A]: { kazanc: 100, harcama: 40, gun: '2026-11-07', bugun: 10, gorevGun: '2026-11-06' } } };
  const k = jetonKaydi(uygula(d, siteOyunYamasi(d, { kim: A, oyun: 'dama', sonuc: 'kazan', simdi: T })), A);
  assert.equal(k.kazanc, 100 + SITE_ODUL.kazan);
  assert.equal(k.harcama, 40);
  assert.equal(k.bugun, 10 + SITE_ODUL.kazan);
  assert.equal(k.gorevGun, '2026-11-06');
});

test('geçersiz girdi yama vermez; bozuk hak kaydı yok sayılır', () => {
  const o = { kim: A, oyun: 'dama', sonuc: 'kazan', simdi: T };
  assert.deepEqual(siteOyunYamasi({}, { ...o, oyun: 'yok' }), { hata: 'gecersiz' });
  assert.deepEqual(siteOyunYamasi({}, { ...o, oyun: '__proto__' }), { hata: 'gecersiz' });
  assert.deepEqual(siteOyunYamasi({}, { ...o, sonuc: 'hile' }), { hata: 'gecersiz' });
  assert.deepEqual(siteOyunYamasi({}, { ...o, sonuc: 'constructor' }), { hata: 'gecersiz' });
  assert.deepEqual(siteOyunYamasi({}, { ...o, kim: '' }), { hata: 'gecersiz' });
  const bozuk = { jeton: { [A]: { kazanc: 0, harcama: 0, oyunHak: 'x' } } };
  assert.ok(siteOyunYamasi(bozuk, o).yama);
  assert.deepEqual(jetonKaydi(bozuk, A), { kazanc: 0, harcama: 0, gun: null, bugun: 0 });
});

test('liste: yalnız birlikte oynanabilen oyunlar; xox yok', () => {
  assert.ok(!SITE_OYUNLARI.includes('xox'));
  for (const id of ['dama', 'tavla', 'dorttas', 'amiral', 'satranc', 'pisti', 'kelime', 'duello', 'sudoku', 'hafiza', 'ciz', 'yapboz']) {
    assert.ok(SITE_OYUNLARI.includes(id), id);
  }
});

test('bağlantı: her oyun bitişte oyunOdulu çağırır ve tek kişilikte ödül vermez', () => {
  for (const yol of ['amiral/app.js', 'dama/app.js', 'dorttas/app.js', 'satranc/app.js', 'tavla/app.js', 'pisti/app.js',
    'duello/app.js', 'kelime/app.js', 'sudoku/app.js', 'hafiza/app.js', 'ciz/app.js', 'yapboz/app.js', '_soru/view.js']) {
    const s = readFileSync(new URL(`../games/${yol}`, import.meta.url), 'utf8');
    assert.match(s, /core\/oyun-odul\.js/, yol);
    assert.match(s, /oyunOdulu\(\{/, yol);
    assert.match(s, /ikiKisi:/, `${yol}: iki kişi şartı açık`);
  }
});
