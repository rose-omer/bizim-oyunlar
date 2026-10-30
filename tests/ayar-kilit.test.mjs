import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  pinHatasi, kayitCoz, denemeCoz, yanlisSay, beklemeKalan, kalanHak, oturumGecerli,
  unutulacakAnahtarlar, sha256Saf, ozetle, pinDogrula, kilitAyarla, kilitVarMi, hexYap, cihazdanUnut, pinUnutuldu,
  MAX_YANLIS, BEKLEME_MS, ARKA_PLAN_MS, BILDIRIM_BEKLE_MS, K_PIN,
} from '../js/core/kilit.js';
import { readStore, writeStore, setRoom, currentRoom } from '../js/core/identity.js';

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

const ODA = 'pdaaaaaaa2';
const ODA_ANAHTARLARI = [
  `bizim.veri.${ODA}.mesaj`, `bizim.veri.giden.${ODA}.cli-1`, `bizim.partner.${ODA}.abc`,
  `bizim.sohbet.taslak.${ODA}.cli-1`, `bizim.mektup.taslak.${ODA}.cli-1`, `bizim.sevgidili.taslak.${ODA}.cli-1`,
  `bizim.gunler.kutlama.${ODA}.cli-1`, `bizim.dokunusGordu.${ODA}.cli-1`, `bizim.baslangicGec.${ODA}`,
  `bizim.izle.son.${ODA}`, `bizim.hafiza.${ODA}.duo`, `bizim.soru.kimdaha.${ODA}`, `bizim.log.${ODA}`,
  'bizim.room', 'bizim.bildirim.tazelendi',
];
const KALACAKLAR = [
  'bizim.veri.baskaoda22.mesaj', `bizim.yerelveri.${ODA}.mesaj`, 'bizim.kilit', 'bizim.kilit.oturum', 'bizim.tema',
  'bizim.client', 'bizim.name', 'bizim.yerel', 'bizim.hafiza.-.solo', `baska.${ODA}`,
];

test('unutulacakAnahtarlar: oda kodunu içeren tüm bizim.* + oda kaydı; yerel mod verisi kalır', () => {
  assert.deepEqual(unutulacakAnahtarlar([...KALACAKLAR, ...ODA_ANAHTARLARI], ODA), ODA_ANAHTARLARI);
  assert.deepEqual(unutulacakAnahtarlar(ODA_ANAHTARLARI, null), []);
  assert.deepEqual(unutulacakAnahtarlar(ODA_ANAHTARLARI, 'a'), [], 'geçersiz oda kodu hiçbir şey silmez');
});

/** Web Storage benzeri sahte depo (Node). */
function sahteDepo(anahtarlar) {
  const m = new Map(anahtarlar.map((k) => [k, '1']));
  return {
    m,
    get length() { return m.size; },
    key: (i) => [...m.keys()][i] ?? null,
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
  };
}

async function unutOrtami(abonelik, fn) {
  const eski = { ls: globalThis.localStorage, ss: globalThis.sessionStorage, nav: globalThis.navigator };
  const ls = sahteDepo([...KALACAKLAR, ...ODA_ANAHTARLARI]);
  const ss = sahteDepo([`bizim.sohbet.taslak.${ODA}.x`, 'bizim.bildirim.tazelendi', 'bizim.yerel', 'bizim.kilit.oturum']);
  const def = (ad, v) => Object.defineProperty(globalThis, ad, { value: v, configurable: true, writable: true });
  def('localStorage', ls);
  def('sessionStorage', ss);
  def('navigator', { serviceWorker: { getRegistration: async () => ({ pushManager: { getSubscription: async () => abonelik } }) } });
  writeStore('session', 'bizim.yerel', '1'); // yerel mod: bildirimKapat sunucuya gitmez
  try {
    await fn(ls, ss);
  } finally {
    writeStore('session', 'bizim.yerel', null);
    def('localStorage', eski.ls);
    def('sessionStorage', eski.ss);
    def('navigator', eski.nav);
  }
}

test('cihazdanUnut: önce bildirim kapanır, sonra oda anahtarları (local + session) silinir', async () => {
  let kapatildiginda = null;
  const abonelik = { endpoint: 'https://fcm.googleapis.com/fcm/send/x', unsubscribe: async () => { kapatildiginda = [...globalThis.localStorage.m.keys()]; return true; } };
  await unutOrtami(abonelik, async (ls, ss) => {
    setRoom(ODA);
    await cihazdanUnut(ODA);
    assert.ok(kapatildiginda, 'bildirim aboneliği kapatılmalı');
    assert.ok(kapatildiginda.includes(`bizim.veri.${ODA}.mesaj`), 'bildirim, anahtarlar silinmeden önce kapanır');
    assert.deepEqual([...ls.m.keys()], KALACAKLAR);
    assert.deepEqual([...ss.m.keys()], ['bizim.yerel', 'bizim.kilit.oturum']);
    assert.equal(currentRoom(), null);
  });
});

test('cihazdanUnut: bildirim kapatma takılırsa en çok 5 sn beklenir; hata yutulur', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const takili = { endpoint: 'https://fcm.googleapis.com/fcm/send/y', unsubscribe: () => new Promise(() => {}) };
  await unutOrtami(takili, async (ls) => {
    let bitti = false;
    const s = cihazdanUnut(ODA).then(() => { bitti = true; });
    for (let i = 0; i < 20; i++) await new Promise((r) => setImmediate(r));
    assert.equal(bitti, false, '5 sn dolmadan bitmemeli');
    t.mock.timers.tick(BILDIRIM_BEKLE_MS);
    await s;
    assert.deepEqual([...ls.m.keys()], KALACAKLAR);
  });
  await unutOrtami({ endpoint: 'x', unsubscribe: async () => { throw new Error('ağ yok'); } }, async (ls) => {
    await cihazdanUnut(ODA);
    assert.deepEqual([...ls.m.keys()], KALACAKLAR);
  });
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

test("pinUnutuldu: önce bu cihazın oda kaydı silinir (yerel sıkı), sonra oda unutulur ve PIN silinir", async () => {
  await unutOrtami(null, async () => {
    writeStore('session', 'bizim.yerel.uyelik', '1');
    writeStore('session', 'bizim.client', 'pinli-cihaz');
    try {
      const { odaGiris } = await import('../js/core/uyelik.js');
      setRoom(ODA);
      assert.equal((await odaGiris(ODA)).durum, 'onayli');
      await kilitAyarla('2468');
      await pinUnutuldu(ODA);
      const st = JSON.parse(readStore('local', `bizim.yerelveri.${ODA}._uyelik`));
      assert.equal(st.cihazlar['pinli-cihaz'], undefined, 'geri dönünce çakışma olmasın diye kayıt silinir');
      assert.equal(currentRoom(), null);
      assert.equal(kilitVarMi(), false);
    } finally {
      writeStore('session', 'bizim.yerel.uyelik', null);
      writeStore('session', 'bizim.client', null);
    }
  });
});

test('pinUnutuldu: kayıt silinemezse (çevrimdışı) de oda unutulur ve PIN silinir', async () => {
  const { _testSupabase } = await import('../js/core/room.js');
  _testSupabase(async () => { throw new TypeError('Failed to fetch'); });
  const uyari = console.warn;
  console.warn = () => {};
  try {
    await unutOrtami(null, async () => {
      writeStore('session', 'bizim.yerel', null); // sunucu modu
      setRoom(ODA);
      await kilitAyarla('2468');
      await pinUnutuldu(ODA);
      assert.equal(currentRoom(), null);
      assert.equal(kilitVarMi(), false);
    });
  } finally {
    console.warn = uyari;
    _testSupabase(null);
  }
});
