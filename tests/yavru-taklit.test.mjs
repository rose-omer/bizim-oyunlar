import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  rms, perdeOrani, sesAlgilayici, yenidenOrnekle, zamanEsnet, bebekSesi,
  zarfCikar, agizDegeri, mikrofonAcikMi, mikrofonHataDurumu, birlestir, TAKLIT,
} from '../sayfalar/yavru/taklit-mantik.js';

const HZ = 48000;
function sinus(f, sn, genlik = 0.5, hz = HZ) {
  const x = new Float32Array(Math.round(sn * hz));
  for (let i = 0; i < x.length; i++) x[i] = genlik * Math.sin((2 * Math.PI * f * i) / hz);
  return x;
}
/** Yükselen sıfır geçişleriyle frekans (Hz), ortadaki bölümde ölçer. */
function frekans(x, hz = HZ) {
  const bas = Math.floor(x.length * 0.2);
  const son = Math.floor(x.length * 0.8);
  let n = 0;
  for (let i = bas + 1; i < son; i++) if (x[i - 1] < 0 && x[i] >= 0) n++;
  return (n * hz) / (son - bas);
}
function enBuyukSicrama(x) {
  let m = 0;
  for (let i = 1; i < x.length; i++) m = Math.max(m, Math.abs(x[i] - x[i - 1]));
  return m;
}

test('rms: sessizlik 0, sabit genlik kendisi, sinüs a/√2, boş 0', () => {
  assert.equal(rms(new Float32Array(100)), 0);
  assert.ok(Math.abs(rms(new Float32Array(100).fill(0.3)) - 0.3) < 1e-6);
  assert.ok(Math.abs(rms(sinus(440, 0.1, 0.5)) - 0.5 / Math.SQRT2) < 0.005);
  assert.equal(rms(new Float32Array(0)), 0);
  assert.equal(rms(null), 0);
});

test('perdeOrani: 0 → 1, 12 → 2, 6 → √2; sınırlar ve geçersiz girdi', () => {
  assert.equal(perdeOrani(0), 1);
  assert.ok(Math.abs(perdeOrani(12) - 2) < 1e-9);
  assert.ok(Math.abs(perdeOrani(6) - Math.SQRT2) < 1e-9);
  assert.ok(Math.abs(perdeOrani(30) - 2) < 1e-9, 'en çok 12 yarım ton');
  assert.equal(perdeOrani(-5), 1, 'aşağı kaydırma yok');
  assert.ok(Math.abs(perdeOrani('x') - perdeOrani(TAKLIT.yarimTon)) < 1e-9, 'geçersiz → varsayılan');
});

test('birlestir: parçaları sırayla ekler', () => {
  const b = birlestir([Float32Array.of(1, 2), Float32Array.of(), Float32Array.of(3)]);
  assert.deepEqual([...b], [1, 2, 3]);
});

// Algılayıcıya 50 ms'lik bloklar verir.
function besle(alg, dizi) {
  const olaylar = [];
  for (const [deger, sn] of dizi) {
    for (let t = 0; t < sn - 1e-9; t += 0.05) {
      const o = alg.besle(deger, 0.05);
      if (o) olaylar.push(o);
    }
  }
  return olaylar;
}

test('sesAlgilayici: konuşma başlar, 0.8 sn sessizlikte biter', () => {
  const alg = sesAlgilayici();
  const o = besle(alg, [[0.002, 0.5], [0.1, 1.5], [0.002, 1.0]]);
  assert.deepEqual(o.map((x) => x.tur), ['basladi', 'bitti']);
  assert.equal(o[1].neden, 'sessizlik');
  assert.ok(Math.abs(o[1].kuyrukSn - 0.8) < 0.06, 'kırpılacak sessizlik ≈ 0.8 sn');
  assert.equal(alg.durum, 'bitti');
});

test('sesAlgilayici: kısa duraklama konuşmayı bitirmez', () => {
  const alg = sesAlgilayici();
  const o = besle(alg, [[0.002, 0.2], [0.1, 0.6], [0.002, 0.5], [0.1, 0.6], [0.002, 0.9]]);
  assert.deepEqual(o.map((x) => x.tur), ['basladi', 'bitti']);
});

test('sesAlgilayici: en çok 6 sn sonra kendisi biter', () => {
  const alg = sesAlgilayici();
  const o = besle(alg, [[0.002, 0.2], [0.1, 8]]);
  assert.deepEqual(o.map((x) => x.tur), ['basladi', 'bitti']);
  assert.equal(o[1].neden, 'sure');
  assert.equal(o[1].kuyrukSn, 0);
});

test('sesAlgilayici: tık gibi kısa ses vazgeçilir, sonra yeniden bekler', () => {
  const alg = sesAlgilayici();
  const o = besle(alg, [[0.002, 0.2], [0.1, 0.15], [0.002, 1.0], [0.1, 0.5], [0.002, 1.0]]);
  assert.deepEqual(o.map((x) => x.tur), ['basladi', 'vazgec', 'basladi', 'bitti']);
});

test('sesAlgilayici: hiç konuşulmazsa bekleme süresinde "sessiz"', () => {
  const alg = sesAlgilayici({ beklemeSn: 3 });
  const o = besle(alg, [[0.002, 4]]);
  assert.deepEqual(o.map((x) => x.tur), ['sessiz']);
  assert.equal(alg.besle(0.5, 0.05), null, 'bittikten sonra olay yok');
});

test('sesAlgilayici: ilk ölçüm süresinde konuşma başlamaz (ortam ölçülür)', () => {
  const alg = sesAlgilayici();
  assert.equal(alg.besle(0.5, 0.05), null);
  assert.equal(alg.besle(0.5, 0.05), null);
  assert.equal(alg.durum, 'bekliyor');
});

test('sesAlgilayici: açılıştaki sıfır bloklar gürültü sayılmaz; uğultu yine konuşma olmaz', () => {
  const alg = sesAlgilayici({ beklemeSn: 100 });
  const o = besle(alg, [[0, 0.3], [0.03, 3]]);
  assert.deepEqual(o, []);
});

test('sesAlgilayici: gürültülü ortamda eşik yükselir (uğultu konuşma sayılmaz)', () => {
  const alg = sesAlgilayici({ beklemeSn: 100 });
  const o = besle(alg, [[0.03, 3]]); // sabit uğultu, sabit eşiğin (0.02) üstünde
  assert.ok(!o.some((x) => x.tur === 'bitti'), 'uğultu konuşma diye bitmez');
  const o2 = besle(alg, [[0.25, 1], [0.03, 1]]);
  assert.deepEqual(o2.map((x) => x.tur).filter((t) => t !== 'vazgec'), ['basladi', 'bitti']);
});

test('yenidenOrnekle: oran 2 → yarı uzunluk, frekans iki katı', () => {
  const x = sinus(200, 1);
  const y = yenidenOrnekle(x, 2);
  assert.equal(y.length, x.length / 2);
  assert.ok(Math.abs(frekans(y) - 400) < 5);
});

test('zamanEsnet: süre oranla değişir, frekans aynı kalır, sıçrama (cızırtı) yok', () => {
  const x = sinus(220, 1);
  for (const oran of [0.8, 1.41, 1.6]) {
    const y = zamanEsnet(x, oran, HZ);
    assert.ok(Math.abs(y.length - x.length * oran) < 2, `uzunluk ${oran}`);
    assert.ok(Math.abs(frekans(y) - 220) < 4, `frekans ${oran}: ${frekans(y)}`);
    const ic = y.subarray(2000, y.length - 2000);
    assert.ok(enBuyukSicrama(ic) < 0.05, `sıçrama ${oran}: ${enBuyukSicrama(ic)}`);
    // Faz uyumsuz bindirme genliği dalgalandırır ("robotik" ses): 20 ms'lik blokların RMS'i sabit kalmalı.
    const blok = HZ / 50;
    for (let i = 0; i + blok <= ic.length; i += blok) {
      const r = rms(ic.subarray(i, i + blok));
      assert.ok(Math.abs(r - 0.5 / Math.SQRT2) < 0.035, `genlik dalgası ${oran} @${i}: ${r}`);
    }
  }
});

test('bebekSesi: +6 yarım ton, 1.12 hız → frekans √2 katı, süre /1.12, tepe ≤ 0.9, uçlar sessiz', () => {
  const x = sinus(200, 1.5, 0.3);
  const y = bebekSesi(x, HZ, { yarimTon: 6, hiz: 1.12 });
  assert.ok(Math.abs(y.length - x.length / 1.12) < 50, `uzunluk ${y.length}`);
  assert.ok(Math.abs(frekans(y) - 200 * Math.SQRT2) < 5, `frekans ${frekans(y)}`);
  let tepe = 0;
  for (const v of y) tepe = Math.max(tepe, Math.abs(v));
  assert.ok(tepe <= 0.9 + 1e-6 && tepe > 0.8, `tepe ${tepe}`);
  assert.ok(Math.abs(y[0]) < 1e-3 && Math.abs(y[y.length - 1]) < 1e-3, 'başta ve sonda yumuşak geçiş');
  assert.ok(enBuyukSicrama(y.subarray(3000, y.length - 3000)) < 0.08);
});

test('bebekSesi: +12 yarım ton, hız 1 → süre aynı, frekans iki katı', () => {
  const x = sinus(150, 1);
  const y = bebekSesi(x, HZ, { yarimTon: 12, hiz: 1 });
  assert.ok(Math.abs(y.length - x.length) < 50);
  assert.ok(Math.abs(frekans(y) - 300) < 5);
});

test('bebekSesi: sessiz ya da boş girdi bozulmaz (NaN yok)', () => {
  const y = bebekSesi(new Float32Array(48000), HZ);
  assert.ok(y.every((v) => v === 0));
  assert.equal(bebekSesi(new Float32Array(0), HZ).length, 0);
});

test('zarfCikar: sessizlik 0, ses ≈ 1; kare sayısı süreye uygun', () => {
  const x = birlestir([new Float32Array(HZ / 2), sinus(300, 0.5, 0.4), new Float32Array(HZ / 2)]);
  const z = zarfCikar(x, HZ, 1 / 50);
  assert.equal(z.length, 75);
  assert.ok(z[5] < 0.02, 'baş sessiz');
  assert.ok(z[37] > 0.9, 'orta dolu');
  assert.ok(z[74] < 0.05, 'son sessiz');
  assert.ok(z.every((v) => v >= 0 && v <= 1));
  assert.ok(zarfCikar(new Float32Array(1000), HZ).every((v) => v === 0));
});

test('agizDegeri: zamana göre kare; dışarıda 0', () => {
  const z = Float32Array.of(0.1, 0.5, 0.9);
  assert.equal(agizDegeri(z, 0, 0.1), Math.fround(0.1));
  assert.equal(agizDegeri(z, 0.15, 0.1), Math.fround(0.5));
  assert.equal(agizDegeri(z, 0.35, 0.1), 0);
  assert.equal(agizDegeri(z, -1, 0.1), 0);
});

test('mikrofonAcikMi ve mikrofonHataDurumu', () => {
  assert.equal(mikrofonAcikMi('dinliyor'), true);
  assert.equal(mikrofonAcikMi('konusuyor'), true);
  for (const d of ['tekrar', 'bitti', 'hata', 'izin-yok']) assert.equal(mikrofonAcikMi(d), false);
  assert.equal(mikrofonHataDurumu({ name: 'NotAllowedError' }), 'izin-yok');
  assert.equal(mikrofonHataDurumu({ name: 'SecurityError' }), 'izin-yok');
  assert.equal(mikrofonHataDurumu({ name: 'NotFoundError' }), 'hata');
  assert.equal(mikrofonHataDurumu(null), 'hata');
});
