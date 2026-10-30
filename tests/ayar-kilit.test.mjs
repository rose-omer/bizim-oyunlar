import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  pinHatasi, kayitCoz, denemeCoz, yanlisSay, beklemeKalan, kalanHak, oturumGecerli,
  unutulacakAnahtarlar, sha256Saf, ozetle, pinDogrula, kilitAyarla, kilitVarMi, hexYap,
  MAX_YANLIS, BEKLEME_MS, ARKA_PLAN_MS, K_PIN,
} from '../js/core/kilit.js';
import { readStore } from '../js/core/identity.js';

test('pinHatasi: yalnız 4–6 rakamlı dize geçer', () => {
  for (const ok of ['1234', '0000', '12345', '098765']) assert.equal(pinHatasi(ok), null, ok);
  for (const bad of ['123', '1234567', '12a4', ' 1234', '', null, undefined, 1234, '١٢٣٤']) {
    assert.equal(typeof pinHatasi(bad), 'string', String(bad));
  }
});

test('kayitCoz: bozuk kayıtları reddeder', () => {
  const iyi = { v: 1, tuz: 'a'.repeat(32), ozet: 'b'.repeat(64), n: 4 };
  assert.deepEqual(kayitCoz(JSON.stringify(iyi)), iyi);
  assert.equal(kayitCoz(null), null);
  assert.equal(kayitCoz('{bozuk'), null);
  assert.equal(kayitCoz({ ...iyi, n: 7 }), null);
  assert.equal(kayitCoz({ ...iyi, tuz: 'xyz' }), null);
  assert.equal(kayitCoz({ ...iyi, ozet: 'B'.repeat(64) }), null);
});

test('yanlış deneme sayacı: 5. yanlışta 30 sn bekleme ve sayaç sıfırlanır', () => {
  const t0 = 1_000_000;
  let d = denemeCoz(null);
  assert.deepEqual(d, { yanlis: 0, kadar: 0 });
  assert.equal(kalanHak(d), MAX_YANLIS);
  for (let i = 1; i < MAX_YANLIS; i++) {
    d = yanlisSay(d, t0);
    assert.equal(d.yanlis, i);
    assert.equal(beklemeKalan(d, t0), 0);
    assert.equal(kalanHak(d), MAX_YANLIS - i);
  }
  d = yanlisSay(d, t0);
  assert.deepEqual(d, { yanlis: 0, kadar: t0 + BEKLEME_MS });
  assert.equal(beklemeKalan(d, t0 + 1000), BEKLEME_MS - 1000);
  assert.equal(beklemeKalan(d, t0 + BEKLEME_MS), 0);
  assert.equal(kalanHak(d), MAX_YANLIS);
});

test('beklemeKalan: saat geri alınsa da en çok 30 sn', () => {
  const d = { yanlis: 0, kadar: 10_000_000 };
  assert.equal(beklemeKalan(d, 0), BEKLEME_MS);
  assert.equal(beklemeKalan(JSON.stringify(d), 10_000_000 - 5000), 5000);
  assert.equal(beklemeKalan('bozuk', 0), 0);
});

test('oturumGecerli: 5 dk arka plan sınırı', () => {
  const t = 50_000_000;
  assert.equal(oturumGecerli(null, t), false);
  assert.equal(oturumGecerli({ acik: false, son: t }, t), false);
  assert.equal(oturumGecerli({ acik: true, son: t - 1000 }, t), true);
  assert.equal(oturumGecerli({ acik: true, son: t - ARKA_PLAN_MS + 1 }, t), true);
  assert.equal(oturumGecerli({ acik: true, son: t - ARKA_PLAN_MS }, t), false);
  assert.equal(oturumGecerli({ acik: true, son: t + 10 * 60_000 }, t), false, 'gelecekteki zaman güvenilmez');
  assert.equal(oturumGecerli({ acik: true, son: 'x' }, t), false);
});

test('unutulacakAnahtarlar: yalnız o odanın önbelleği', () => {
  const keys = [
    'bizim.veri.odaaaaaaa2.mesaj', 'bizim.veri.odaaaaaaa2.kisi', 'bizim.veri.giden.odaaaaaaa2',
    'bizim.partner.odaaaaaaa2.abc', 'bizim.veri.baskaoda22.mesaj', 'bizim.yerelveri.odaaaaaaa2.mesaj',
    'bizim.room', 'bizim.kilit', 'bizim.tema',
  ];
  assert.deepEqual(unutulacakAnahtarlar(keys, 'odaaaaaaa2'), [
    'bizim.veri.odaaaaaaa2.mesaj', 'bizim.veri.odaaaaaaa2.kisi', 'bizim.veri.giden.odaaaaaaa2', 'bizim.partner.odaaaaaaa2.abc',
  ]);
  assert.deepEqual(unutulacakAnahtarlar(keys, null), []);
});

test('sha256Saf node:crypto ile aynı (tek ve çok blok)', () => {
  const girdiler = ['', 'abc', 'a'.repeat(55), 'a'.repeat(56), 'a'.repeat(64), 'ğüşiöç:1234', 'x'.repeat(1000)];
  for (const s of girdiler) {
    const beklenen = createHash('sha256').update(s, 'utf8').digest('hex');
    assert.equal(hexYap(sha256Saf(new TextEncoder().encode(s))), beklenen, `uzunluk ${s.length}`);
  }
});

test('ozetle: crypto.subtle ve saf yol aynı özeti verir', async () => {
  const tuz = '0123456789abcdef0123456789abcdef';
  const subtle = await ozetle('2468', tuz);
  const saf = hexYap(sha256Saf(new TextEncoder().encode(`${tuz}:2468`)));
  assert.equal(subtle, saf);
  assert.match(subtle, /^[0-9a-f]{64}$/);
});

test('kilitAyarla / kilitVarMi / pinDogrula uçtan uca', async () => {
  await kilitAyarla(null);
  assert.equal(kilitVarMi(), false);
  await assert.rejects(() => kilitAyarla('12'), /4–6/);
  await kilitAyarla('48151');
  assert.equal(kilitVarMi(), true);
  const kayit = kayitCoz(readStore('local', K_PIN));
  assert.equal(kayit.n, 5);
  assert.ok(!readStore('local', K_PIN).includes('48151'), 'PIN düz metin saklanmaz');
  assert.equal(await pinDogrula('48151', kayit), true);
  assert.equal(await pinDogrula('48152', kayit), false);
  assert.equal(await pinDogrula('4815', kayit), false);
  // Aynı PIN iki kez ayarlanınca tuz farklı → özet farklı.
  await kilitAyarla('48151');
  assert.notEqual(kayitCoz(readStore('local', K_PIN)).ozet, kayit.ozet);
  await kilitAyarla(null);
  assert.equal(kilitVarMi(), false);
});
