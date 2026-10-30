// Otomatik güncelleme: js/core/pwa.js saf yardımcıları ve sw.js önbellek kuralı.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { guncellemeKarari, mesgulYol, sunucuSurumu, KOK_URL } from '../js/core/pwa.js';

const YAYIN = 'Fri, 30 Oct 2026 20:46:47 GMT';
const T0 = Date.parse(YAYIN);
const DK = 60_000;
const BOSTA = { ilk: T0, son: T0, simdi: T0 + 60 * DK, gizliMs: 5 * DK, doluAlan: false, mesgul: false, native: false };
const YENI = { ...BOSTA, son: T0 + DK };

test('guncellemeKarari: sürüm aynı, eski ya da bilinmiyorsa yok', () => {
  assert.equal(guncellemeKarari(BOSTA), 'yok');
  assert.equal(guncellemeKarari({ ...BOSTA, son: null }), 'yok');
  assert.equal(guncellemeKarari({ ...BOSTA, ilk: NaN, son: T0 + DK }), 'yok');
  assert.equal(guncellemeKarari({ ...BOSTA, son: T0 - DK }), 'yok', 'eski yayın yeni sayılmaz');
});

test('guncellemeKarari: arka plandan dönen boştaki sayfa kendini yeniler', () => {
  assert.equal(guncellemeKarari(YENI), 'yenile');
});

test('guncellemeKarari: kısa süre gizli, dolu yazı alanı ya da oyun/izleme varsa yalnız haber verir', () => {
  assert.equal(guncellemeKarari({ ...YENI, gizliMs: 10_000 }), 'bildir');
  assert.equal(guncellemeKarari({ ...YENI, gizliMs: 0 }), 'bildir');
  assert.equal(guncellemeKarari({ ...YENI, doluAlan: true }), 'bildir');
  assert.equal(guncellemeKarari({ ...YENI, mesgul: true }), 'bildir');
});

test('guncellemeKarari: Android uygulaması yayından 10 dk geçmeden yenilemez (HTTP önbelleği 600 sn)', () => {
  const yerli = { ...YENI, native: true };
  assert.equal(guncellemeKarari({ ...yerli, simdi: T0 + 5 * DK }), 'bekle');
  assert.equal(guncellemeKarari({ ...yerli, simdi: T0 + 5 * DK, mesgul: true }), 'bekle');
  assert.equal(guncellemeKarari({ ...yerli, simdi: T0 + 11 * DK }), 'yenile');
});

test('mesgulYol: oyunlar ve Birlikte İzle meşgul; diğer sayfalar değil', () => {
  assert.ok(mesgulYol('/bizim-oyunlar/games/dama/'));
  assert.ok(mesgulYol('/games/yapboz/index.html'));
  assert.ok(mesgulYol('/bizim-oyunlar/sayfalar/izle/'));
  assert.ok(!mesgulYol('/bizim-oyunlar/sayfalar/sohbet/'));
  assert.ok(!mesgulYol('/bizim-oyunlar/'));
  assert.ok(!mesgulYol(''));
});

test('sunucuSurumu: site köküne önbelleksiz HEAD; Last-Modified → ms', async () => {
  const istekler = [];
  const fetchFn = async (url, secenek) => {
    istekler.push([String(url), secenek]);
    return { ok: true, headers: new Headers({ 'Last-Modified': YAYIN }) };
  };
  assert.equal(await sunucuSurumu(fetchFn), T0);
  assert.equal(istekler.length, 1);
  assert.equal(istekler[0][0], KOK_URL.href);
  assert.equal(istekler[0][1].method, 'HEAD');
  assert.equal(istekler[0][1].cache, 'no-store');
});

test('sunucuSurumu: başlık yok, hata kodu ya da ağ yok → null', async () => {
  assert.equal(await sunucuSurumu(async () => ({ ok: true, headers: new Headers() })), null);
  assert.equal(await sunucuSurumu(async () => ({ ok: false, headers: new Headers({ 'Last-Modified': YAYIN }) })), null);
  assert.equal(await sunucuSurumu(async () => { throw new TypeError('ağ yok'); }), null);
});

test('sw.js: CSS ağdan önce gelir (yeni JS eski CSS ile karışmaz); görseller önbellekten', () => {
  const kaynak = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
  const varlikRe = new RegExp(kaynak.match(/const VARLIK_RE = \/(.+)\/i;/)[1], 'i');
  assert.ok(!varlikRe.test('/bizim-oyunlar/css/base.css'));
  assert.ok(!varlikRe.test('/bizim-oyunlar/games/dama/style.css'));
  assert.ok(varlikRe.test('/bizim-oyunlar/assets/icons/icon-192.png'));
  const hedefler = JSON.parse(kaynak.match(/const VARLIK_HEDEF = new Set\((\[[^\]]*\])\)/)[1].replace(/'/g, '"'));
  assert.ok(!hedefler.includes('style'));
  assert.ok(hedefler.includes('image'));
});
