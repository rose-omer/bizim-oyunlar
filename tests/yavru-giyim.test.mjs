// Yavrumuz: giydirme (sayfalar/yavru/giyim.js). Saf mantık, DOM yok.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { YUVALAR, yuvaBul, giyimOku, giyYamasi, cikarYamasi, satinAlGiyYamasi } from '../sayfalar/yavru/giyim.js';
import { URUNLER, satinAl } from '../sayfalar/yavru/jeton.js';
import { applyPatch } from '../js/core/veri.js';
import { SEKMELER, sekmeUrunleri, urunDurumu, hataMetni, etkiMetni } from '../sayfalar/yavru/magaza.js';

const BOS = Object.freeze({ bas: null, goz: null, boyun: null, govde: null, agiz: null, kucak: null });
const dolap = (...idler) => Object.fromEntries(idler.map((id) => [id, { at: '2026-10-30T09:00:00.000Z', kim: 'a', fiyat: URUNLER[id].fiyat }]));

test('yuvalar: her kıyafet tek yuvada; yiyecek yuvasız', () => {
  const kiyafetler = Object.entries(URUNLER).filter(([, u]) => u.tur === 'kiyafet').map(([id]) => id).sort();
  assert.deepEqual(Object.values(YUVALAR).flat().sort(), kiyafetler);
  assert.equal(yuvaBul('tac'), 'bas');
  assert.equal(yuvaBul('fiyonk'), 'bas');
  assert.equal(yuvaBul('sapka'), 'bas');
  assert.equal(yuvaBul('gozluk'), 'goz');
  assert.equal(yuvaBul('atki'), 'boyun');
  assert.equal(yuvaBul('elbise'), 'govde');
  assert.equal(yuvaBul('ayicik'), 'govde');
  assert.equal(yuvaBul('pijama'), 'govde');
  assert.equal(yuvaBul('emzik'), 'agiz');
  assert.equal(yuvaBul('battaniye'), 'kucak');
  assert.equal(yuvaBul('tulum'), null, 'tulum varsayılan; ürün değil');
  assert.equal(yuvaBul('pizza'), null);
  assert.equal(yuvaBul('__proto__'), null);
  assert.equal(yuvaBul(undefined), null);
});

test('giyimOku: yalnız dolapta olan ve yuvasına uyan değer geçerli', () => {
  assert.deepEqual(giyimOku(null), BOS);
  assert.deepEqual(giyimOku({}), BOS);
  const y = { dolap: dolap('tac', 'gozluk'), giyim: { bas: 'tac', goz: 'gozluk', boyun: 'atki' } };
  assert.deepEqual(giyimOku(y), { ...BOS, bas: 'tac', goz: 'gozluk' }, 'atkı dolapta yok');
  assert.deepEqual(giyimOku({ dolap: dolap('tac', 'atki'), giyim: { bas: 'atki', goz: 'tac' } }), BOS, 'yanlış yuva');
  assert.deepEqual(giyimOku({ dolap: dolap('tac'), giyim: { bas: 7, goz: ['x'], boyun: { a: 1 } } }), BOS, 'bozuk');
  assert.deepEqual(giyimOku({ dolap: dolap('tac'), giyim: 'tac' }), BOS);
  assert.deepEqual(Object.keys(giyimOku({ giyim: { el: 'x' } })), ['bas', 'goz', 'boyun', 'govde', 'agiz', 'kucak'], 'bilinmeyen yuva eklenmez');
  const yeni = { dolap: dolap('elbise', 'emzik', 'battaniye'), giyim: { govde: 'elbise', agiz: 'emzik', kucak: 'battaniye' } };
  assert.deepEqual(giyimOku(yeni), { ...BOS, govde: 'elbise', agiz: 'emzik', kucak: 'battaniye' });
  assert.deepEqual(giyimOku({ dolap: dolap('elbise'), giyim: { govde: 'pijama', agiz: 'elbise' } }), BOS, 'dolapta yok / yanlış yuva');
  assert.equal(giyimOku({ dolap: {}, giyim: {} }).govde, null, 'gövde boş = varsayılan tulum');
});

test('giyYamasi: dolaptaki kıyafeti yuvasına yazar; yerine geçer', () => {
  let d = { dolap: dolap('tac', 'fiyonk', 'atki') };
  const r = giyYamasi(d, { urun: 'tac' });
  assert.deepEqual(r, { yama: { 'giyim.bas': 'tac' } });
  d = applyPatch(d, r.yama);
  d = applyPatch(d, giyYamasi(d, { urun: 'atki' }).yama);
  assert.deepEqual(giyimOku(d), { ...BOS, bas: 'tac', boyun: 'atki' });
  d = applyPatch(d, giyYamasi(d, { urun: 'fiyonk' }).yama);
  assert.deepEqual(giyimOku(d), { ...BOS, bas: 'fiyonk', boyun: 'atki' }, 'baş yuvasında tek ürün');
  // Yama en çok iki düzey (veri.js kuralı).
  for (const k of Object.keys(r.yama)) assert.ok(k.split('.').length <= 2);
});

test('giyYamasi: dolapta yok ya da bilinmiyor', () => {
  assert.deepEqual(giyYamasi({ dolap: {} }, { urun: 'tac' }), { hata: 'dolapta-yok' });
  assert.deepEqual(giyYamasi(null, { urun: 'gozluk' }), { hata: 'dolapta-yok' });
  assert.deepEqual(giyYamasi({ dolap: dolap('tac') }, { urun: 'pizza' }), { hata: 'bilinmiyor' }, 'yiyecek giyilmez');
  assert.deepEqual(giyYamasi({ dolap: dolap('tac') }, { urun: 'yok' }), { hata: 'bilinmiyor' });
  assert.deepEqual(giyYamasi({ dolap: dolap('tac') }, { urun: 'constructor' }), { hata: 'bilinmiyor' });
  assert.deepEqual(giyYamasi({ dolap: dolap('tac') }), { hata: 'bilinmiyor' });
});

test('cikarYamasi: yuvayı boşaltır (null yama alanı siler)', () => {
  let d = { dolap: dolap('gozluk'), giyim: { goz: 'gozluk' } };
  const r = cikarYamasi(d, { yuva: 'goz' });
  assert.deepEqual(r, { yama: { 'giyim.goz': null } });
  d = applyPatch(d, r.yama);
  assert.deepEqual(d.giyim, {});
  assert.deepEqual(giyimOku(d), BOS);
  assert.deepEqual(cikarYamasi(d, { yuva: 'govde' }), { yama: { 'giyim.govde': null } }, 'kıyafeti çıkar = tulum');
  assert.deepEqual(cikarYamasi(d, { yuva: 'el' }), { hata: 'bilinmiyor' });
  assert.deepEqual(cikarYamasi(d, { yuva: 'hasOwnProperty' }), { hata: 'bilinmiyor' });
  assert.deepEqual(cikarYamasi(d), { hata: 'bilinmiyor' });
});

// ---------- Mağaza kart durumu (magaza.js saf yardımcıları) ----------
const K = 'omer-test-id';
const T = Date.UTC(2026, 9, 30, 10, 0, 0);
const belge = (kazanc, ek = {}) => ({
  asama: 'buyuk', renk: 3, uyku: null, ihtiyac: {}, jeton: { [K]: { kazanc, harcama: 0, gun: null, bugun: 0 } }, dolap: {}, ...ek,
});

test('mağaza: sekmeler ve ürünler fiyata göre', () => {
  assert.deepEqual(SEKMELER.map((s) => s.id), ['yiyecek', 'giyim']);
  assert.deepEqual(sekmeUrunleri('yiyecek'), ['cilek', 'kurabiye', 'dondurma', 'pizza', 'pasta']);
  assert.deepEqual(sekmeUrunleri('giyim'), ['emzik', 'battaniye', 'fiyonk', 'atki', 'sapka', 'pijama', 'gozluk', 'ayicik', 'elbise', 'tac']);
  assert.deepEqual(sekmeUrunleri('yok'), []);
  assert.equal(etkiMetni('cilek'), '+10 tokluk · +5 mutluluk');
  assert.equal(etkiMetni('tac'), '');
});

test('mağaza: kart durumu Al / Yetersiz / Dolapta / Üstünde; yiyecekte yumurta ve uyku', () => {
  const o = { kim: K, simdi: T };
  assert.deepEqual(urunDurumu(belge(100), 'atki', o), { durum: 'al' });
  assert.deepEqual(urunDurumu(belge(100), 'tac', o), { durum: 'yetersiz', eksik: 50 });
  let d = belge(100);
  d = applyPatch(d, satinAl(d, { kim: K, urun: 'atki', simdi: T }).yama);
  assert.deepEqual(urunDurumu(d, 'atki', o), { durum: 'dolapta' });
  d = applyPatch(d, giyYamasi(d, { urun: 'atki' }).yama);
  assert.deepEqual(urunDurumu(d, 'atki', o), { durum: 'giyili' });
  assert.deepEqual(urunDurumu(d, 'gozluk', o), { durum: 'yetersiz', eksik: 30 }, 'atkı bedeli bakiyeden düştü');
  assert.deepEqual(urunDurumu(belge(100), 'pizza', o), { durum: 'al' });
  assert.deepEqual(urunDurumu(belge(5), 'cilek', o), { durum: 'yetersiz', eksik: 5 });
  assert.deepEqual(urunDurumu(belge(100, { asama: 'yumurta' }), 'cilek', o), { durum: 'yumurta' });
  const uyku = { bas: new Date(T - 60_000).toISOString(), bit: new Date(T + 3_600_000).toISOString() };
  assert.deepEqual(urunDurumu(belge(100, { uyku }), 'cilek', o), { durum: 'uyuyor' });
});

test('mağaza: hata iletileri Türkçe; yetersizde eksik jeton sayısı', () => {
  assert.equal(hataMetni({ hata: 'yetersiz', eksik: 12 }), '12 jeton eksik');
  for (const hata of ['zaten', 'yumurta', 'uyuyor', 'dolapta-yok', 'bilinmiyor', undefined]) {
    const m = hataMetni({ hata });
    assert.ok(typeof m === 'string' && m.length > 3 && !/undefined/.test(m), String(hata));
  }
});

test('satinAlGiyYamasi: kıyafet tek yamada dolaba girer ve giyilir; eskisinin yerine geçer', () => {
  let d = belge(300, { dolap: dolap('ayicik'), giyim: { govde: 'ayicik' } });
  const r = satinAlGiyYamasi(d, { kim: K, urun: 'elbise', simdi: T });
  assert.deepEqual(Object.keys(r.yama).sort(), ['dolap.elbise', 'giyim.govde']);
  assert.equal(r.yama['giyim.govde'], 'elbise');
  assert.deepEqual(r.yama['dolap.elbise'], { at: new Date(T).toISOString(), kim: K, fiyat: URUNLER.elbise.fiyat });
  assert.deepEqual(r.kayit, { eylem: 'satinal', kim: K, at: new Date(T).toISOString(), deger: 'elbise' });
  for (const k of Object.keys(r.yama)) assert.ok(k.split('.').length <= 2, 'yama en çok iki düzey');
  d = applyPatch(d, r.yama);
  assert.equal(giyimOku(d).govde, 'elbise');
  assert.deepEqual(urunDurumu(d, 'elbise', { kim: K, simdi: T }), { durum: 'giyili' });
  assert.deepEqual(urunDurumu(d, 'ayicik', { kim: K, simdi: T }), { durum: 'dolapta' }, 'eski kıyafet dolapta kalır');
  // Aksesuar da alınınca giyilir.
  const e = satinAlGiyYamasi(belge(100), { kim: K, urun: 'emzik', simdi: T });
  assert.equal(e.yama['giyim.agiz'], 'emzik');
});

test('satinAlGiyYamasi: hatada yama yok; yiyecekte satinAl sonucu aynen', () => {
  assert.deepEqual(satinAlGiyYamasi(belge(10), { kim: K, urun: 'elbise', simdi: T }), { hata: 'yetersiz', eksik: URUNLER.elbise.fiyat - 10 });
  assert.deepEqual(satinAlGiyYamasi(belge(300, { dolap: dolap('elbise') }), { kim: K, urun: 'elbise', simdi: T }), { hata: 'zaten' });
  assert.deepEqual(satinAlGiyYamasi(belge(300), { kim: K, urun: 'yok', simdi: T }), { hata: 'bilinmiyor' });
  const y = belge(100);
  assert.deepEqual(satinAlGiyYamasi(y, { kim: K, urun: 'cilek', simdi: T }), satinAl(y, { kim: K, urun: 'cilek', simdi: T }));
});

test('yeni kıyafet fiyatları: kıyafet 40–120, emzik 20, battaniye 35', () => {
  for (const id of YUVALAR.govde) assert.ok(URUNLER[id].fiyat >= 40 && URUNLER[id].fiyat <= 120, id);
  assert.equal(URUNLER.emzik.fiyat, 20);
  assert.equal(URUNLER.battaniye.fiyat, 35);
});
