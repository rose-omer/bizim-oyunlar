// js/core/kirp.js saf geometrisi: kapsama, sınırlama, odaklı yakınlaştırma, pinch, döndürme, çıktı.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as k from '../js/core/kirp.js';

const yakin = (a, b, eps = 1e-6, msg) => assert.ok(Math.abs(a - b) <= eps, `${msg || ''} ${a} ≉ ${b}`);
const O = (W, H, fw, fh, maxKat = 5) => ({ W, H, fw, fh, maxKat });

/** Durum çerçeveyi tamamen dolduruyor mu (boşluk yok)? */
function doluMu(d, o) {
  const { iw, ih } = k.donukBoyut(o, d.r);
  const eps = 1e-6;
  return d.tx <= eps && d.ty <= eps && d.tx + iw * d.s >= o.fw - eps && d.ty + ih * d.s >= o.fh - eps;
}

/** Afin matris [a,b,c,d,e,f] ile nokta. */
const uygula = (m, x, y) => ({ x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] });

test('kapsamaOlcegi: çerçeveyi dolduran en küçük ölçek', () => {
  yakin(k.kapsamaOlcegi(2000, 1000, 300, 300), 0.3);
  yakin(k.kapsamaOlcegi(1000, 2000, 300, 300), 0.3);
  yakin(k.kapsamaOlcegi(1000, 1000, 320, 180), 0.32);
});

test('baslangicDurumu: ortalanmış ve dolu; dikey görsel 16:9 çerçevede', () => {
  const o = O(2000, 1000, 300, 300);
  const d = k.baslangicDurumu(o);
  assert.equal(d.r, 0);
  yakin(d.s, 0.3);
  yakin(d.tx, (300 - 600) / 2);
  yakin(d.ty, 0);
  assert.ok(doluMu(d, o));
  const o2 = O(900, 1600, 320, 180);
  const d2 = k.baslangicDurumu(o2);
  yakin(d2.s, 320 / 900);
  assert.ok(doluMu(d2, o2));
  yakin(d2.tx, 0);
});

test('sinirla: rastgele durumlar her zaman çerçeveyi doldurur, ölçek sınırda', () => {
  let tohum = 7;
  const rnd = () => ((tohum = (tohum * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 400; i++) {
    const o = O(64 + rnd() * 3000, 64 + rnd() * 3000, 100 + rnd() * 400, 100 + rnd() * 400, 1 + rnd() * 6);
    const d = k.sinirla({ s: rnd() * 3, tx: (rnd() - 0.5) * 5000, ty: (rnd() - 0.5) * 5000, r: Math.floor(rnd() * 9) }, o);
    assert.ok(doluMu(d, o), `durum ${i}`);
    const { min, max } = k.olcekSiniri(o, d.r);
    assert.ok(d.s >= min - 1e-9 && d.s <= max + 1e-9);
  }
});

test('kaydir: kenarda durur, ortada aynen kayar', () => {
  const o = O(2000, 1000, 300, 300);
  const d = k.baslangicDurumu(o);
  const sag = k.kaydir(d, 50, 0, o);
  yakin(sag.tx, d.tx + 50);
  const cokSag = k.kaydir(d, 5000, 0, o);
  yakin(cokSag.tx, 0);
  const cokSol = k.kaydir(d, -5000, 0, o);
  yakin(cokSol.tx, 300 - 600);
  const dikey = k.kaydir(d, 0, 40, o);
  yakin(dikey.ty, 0); // dikeyde pay yok
});

test('odakliOlcekle: odak altındaki nokta yerinde kalır; ölçek sınırlanır', () => {
  const o = O(1000, 1000, 300, 300);
  const d = k.baslangicDurumu(o);
  const odak = { x: 100, y: 200 };
  const once = { x: (odak.x - d.tx) / d.s, y: (odak.y - d.ty) / d.s };
  const z = k.odakliOlcekle(d, d.s * 2, odak, o);
  yakin(z.s, d.s * 2);
  yakin((odak.x - z.tx) / z.s, once.x, 1e-6, 'x');
  yakin((odak.y - z.ty) / z.s, once.y, 1e-6, 'y');
  assert.ok(doluMu(z, o));
  const cok = k.odakliOlcekle(d, 999, odak, o);
  yakin(cok.s, k.olcekSiniri(o, 0).max);
  const az = k.odakliOlcekle(z, 0.0001, odak, o);
  yakin(az.s, k.olcekSiniri(o, 0).min);
  assert.ok(doluMu(az, o));
  yakin(k.yakinlik(z, o), 2);
});

test('pinchDurumu: iki parmak açılınca ölçek oranla büyür, orta nokta korunur ve izlenir', () => {
  const o = O(1000, 1000, 300, 300);
  const bas = k.odakliOlcekle(k.baslangicDurumu(o), 0.6, { x: 150, y: 150 }, o);
  const a1 = { x: 120, y: 150 };
  const a2 = { x: 180, y: 150 };
  const b1 = { x: 100, y: 160 };
  const b2 = { x: 220, y: 160 }; // mesafe 60 → 120, orta (150,150) → (160,160)
  const d = k.pinchDurumu(bas, a1, a2, b1, b2, o);
  yakin(d.s, 1.2);
  const p = { x: (150 - bas.tx) / bas.s, y: (150 - bas.ty) / bas.s };
  yakin((160 - d.tx) / d.s, p.x, 1e-6);
  yakin((160 - d.ty) / d.s, p.y, 1e-6);
  assert.ok(doluMu(d, o));
  // Parmaklar üst üste başladıysa (mesafe ~0) ölçek değişmez, yalnız kayar.
  const ayni = k.pinchDurumu(bas, { x: 150, y: 150 }, { x: 150.2, y: 150 }, { x: 160, y: 150 }, { x: 260, y: 150 }, o);
  yakin(ayni.s, bas.s);
  // Kıstırınca kapsama ölçeğinin altına inmez.
  const kis = k.pinchDurumu(bas, a1, a2, { x: 149, y: 150 }, { x: 151, y: 150 }, o);
  yakin(kis.s, k.olcekSiniri(o, 0).min);
  assert.ok(doluMu(kis, o));
});

test('dondur: boyutlar yer değiştirir, çerçeve dolu, 4 tur sonra başa döner', () => {
  const o = O(1600, 900, 320, 180); // yatay görsel, 16:9 çerçeve
  let d = k.odakliOlcekle(k.baslangicDurumu(o), 0.5, { x: 160, y: 90 }, o);
  d = k.kaydir(d, -40, 10, o);
  const ilk = d;
  const d1 = k.dondur(d, o);
  assert.equal(d1.r, 1);
  assert.deepEqual(k.donukBoyut(o, 1), { iw: 900, ih: 1600 });
  assert.ok(doluMu(d1, o));
  yakin(k.yakinlik(d1, o), k.yakinlik(d, o), 1e-6, 'yakınlık korunur');
  // Çerçeve ortasındaki görsel noktası döndürmeden sonra da ortada (sınırlanmadıysa).
  const kare = O(1000, 1000, 300, 300);
  const e = k.kaydir(k.odakliOlcekle(k.baslangicDurumu(kare), 0.9, { x: 150, y: 150 }, kare), 30, -20, kare);
  const e1 = k.dondur(e, kare);
  const merkez0 = { x: (150 - e.tx) / e.s, y: (150 - e.ty) / e.s };
  const merkez1 = { x: (150 - e1.tx) / e1.s, y: (150 - e1.ty) / e1.s };
  yakin(merkez1.x, 1000 - merkez0.y, 1e-6);
  yakin(merkez1.y, merkez0.x, 1e-6);
  for (let i = 0; i < 3; i++) d = k.dondur(d, o);
  d = k.dondur(d, o);
  assert.equal(d.r, 4);
  assert.ok(doluMu(d, o));
  // Kırpma alanı 4 turdan sonra ilk duruma yakın (sınırlama küçük kaymalar yapabilir).
  const a = k.kirpmaAlani(ilk, o);
  const b = k.kirpmaAlani(d, o);
  yakin(a.w, b.w, 1e-6);
  yakin(a.h, b.h, 1e-6);
});

test('kirpmaAlani: görselin içinde; başlangıçta kısa kenarın tamamı', () => {
  const o = O(2000, 1000, 300, 300);
  const d = k.baslangicDurumu(o);
  const a = k.kirpmaAlani(d, o);
  yakin(a.w, 1000);
  yakin(a.h, 1000);
  yakin(a.x, 500);
  yakin(a.y, 0);
  const z = k.kaydir(k.odakliOlcekle(d, 1.2, { x: 10, y: 10 }, o), -999, -999, o);
  const b = k.kirpmaAlani(z, o);
  assert.ok(b.x >= -1e-6 && b.y >= -1e-6 && b.x + b.w <= 2000 + 1e-6 && b.y + b.h <= 1000 + 1e-6);
});

test('cerceveBoyu: alana sığan en büyük oranlı dikdörtgen, tam sayı', () => {
  assert.deepEqual(k.cerceveBoyu(390, 600, 1, 16), { fw: 358, fh: 358 });
  assert.deepEqual(k.cerceveBoyu(390, 600, 16 / 9, 16), { fw: 358, fh: 201 });
  assert.deepEqual(k.cerceveBoyu(1000, 300, 1, 20), { fw: 260, fh: 260 });
  const c = k.cerceveBoyu(10, 10, 1, 20);
  assert.ok(c.fw >= 1 && c.fh >= 1);
});

test('ciktiBoyu: profil 512 kare, kapak 1280×720', () => {
  assert.deepEqual(k.ciktiBoyu(512, 1), { w: 512, h: 512 });
  assert.deepEqual(k.ciktiBoyu(1280, 16 / 9), { w: 1280, h: 720 });
  assert.deepEqual(k.ciktiBoyu(0, 1), { w: 1, h: 1 });
});

test('donusMatrisi: özgün köşeler döndürülmüş görselin köşelerine gider', () => {
  const W = 400;
  const H = 300;
  const kose = (m, x, y) => { const p = uygula(m, x, y); return [Math.round(p.x), Math.round(p.y)]; };
  assert.deepEqual(kose(k.donusMatrisi(0, W, H), 0, 0), [0, 0]);
  // 90° saat yönü: sol-üst → sağ-üst (yeni genişlik H)
  assert.deepEqual(kose(k.donusMatrisi(1, W, H), 0, 0), [H, 0]);
  assert.deepEqual(kose(k.donusMatrisi(1, W, H), W, H), [0, W]);
  assert.deepEqual(kose(k.donusMatrisi(2, W, H), 0, 0), [W, H]);
  assert.deepEqual(kose(k.donusMatrisi(3, W, H), 0, 0), [0, W]);
  assert.deepEqual(kose(k.donusMatrisi(3, W, H), W, 0), [0, 0]);
  assert.deepEqual(kose(k.donusMatrisi(5, W, H), 0, 0), [H, 0]); // sayaç mod 4
});

test('ciktiMatrisi: kırpma alanının köşeleri çıktı tuvalinin köşelerine gider (her yön)', () => {
  const o = O(1600, 900, 320, 180);
  let d = k.kaydir(k.odakliOlcekle(k.baslangicDurumu(o), 0.4, { x: 50, y: 40 }, o), -20, -5, o);
  for (let r = 0; r < 4; r++) {
    const m = k.ciktiMatrisi(d, o, 1280, 720);
    const a = k.kirpmaAlani(d, o);
    // Döndürülmüş koordinattaki köşeyi özgün koordinata geri çevir: ters dönüş.
    const ters = (qx, qy) => {
      const R = k.donusMatrisi(d.r, o.W, o.H);
      const det = R[0] * R[3] - R[1] * R[2];
      const x = (R[3] * (qx - R[4]) - R[2] * (qy - R[5])) / det;
      const y = (-R[1] * (qx - R[4]) + R[0] * (qy - R[5])) / det;
      return { x, y };
    };
    const sol = ters(a.x, a.y);
    const sag = ters(a.x + a.w, a.y + a.h);
    const p0 = uygula(m, sol.x, sol.y);
    const p1 = uygula(m, sag.x, sag.y);
    yakin(p0.x, 0, 1e-6, `r=${r} x0`);
    yakin(p0.y, 0, 1e-6, `r=${r} y0`);
    yakin(p1.x, 1280, 1e-6, `r=${r} x1`);
    yakin(p1.y, 720, 1e-6, `r=${r} y1`);
    d = k.dondur(d, o);
  }
});

test('ekranDonusumu: görsel merkezi, açı ve ölçek', () => {
  const o = O(2000, 1000, 300, 300);
  const d = k.baslangicDurumu(o);
  const t = k.ekranDonusumu(d, o);
  yakin(t.cx, 150);
  yakin(t.cy, 150);
  assert.equal(t.aci, 0);
  yakin(t.s, 0.3);
  const t1 = k.ekranDonusumu(k.dondur(d, o), o);
  assert.equal(t1.aci, 90);
  yakin(t1.cx, 150);
  yakin(t1.cy, 150);
});

test('yenidenOlcekle: çerçeve büyüyünce yakınlık ve ortadaki nokta korunur', () => {
  const o = O(1200, 800, 300, 300);
  const d = k.kaydir(k.odakliOlcekle(k.baslangicDurumu(o), 0.7, { x: 150, y: 150 }, o), 25, 15, o);
  const yeni = O(1200, 800, 450, 450);
  const e = k.yenidenOlcekle(d, o, yeni);
  yakin(k.yakinlik(e, yeni), k.yakinlik(d, o));
  const m0 = { x: (150 - d.tx) / d.s, y: (150 - d.ty) / d.s };
  const m1 = { x: (225 - e.tx) / e.s, y: (225 - e.ty) / e.s };
  yakin(m1.x, m0.x, 1e-6);
  yakin(m1.y, m0.y, 1e-6);
  assert.ok(doluMu(e, yeni));
});

test('fotoKirp dışa aktarılır; Node\'da DOM yok', async () => {
  assert.equal(typeof k.fotoKirp, 'function');
  await assert.rejects(() => k.fotoKirp(new Blob(['x'])), /tarayıcı/);
});
