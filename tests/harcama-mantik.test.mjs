import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  KATEGORILER, MAX_KURUS, tutarCoz, paraMetni, paylar, yonelme, kayitOku, yeniHarcama, bakiye, bakiyeDurumu,
  bakiyeMetni, hesaplasmaKaydi, aylar, ayFiltresi, kategoriOzeti, payTuru, payAciklama, ozelPay,
} from '../sayfalar/harcama/mantik.js';

const O = 'omer-test-id';
const G = 'gul-test-id';
const AD = { [O]: 'Ömer', [G]: 'Gül' };
const adOf = (id) => AD[id] || 'Sevgilin';
let seq = 0;
const doc = (data, { at } = {}) => {
  seq += 1;
  const t = at || new Date(Date.UTC(2026, 9, 1, 10, seq)).toISOString();
  return { id: `h${seq}`, author: data.odeyen, deleted: false, created_at: t, updated_at: t, data };
};
const harcama = (tutar, odeyen, pay, ek = {}) => doc({
  baslik: 'Market', tutar, odeyen, pay, tarih: '2026-10-12', kategori: 'market', ...ek,
});
const NB = ' ';

test('KATEGORILER: sabit kimlikler, "diger" sonda', () => {
  assert.deepEqual(KATEGORILER.map((k) => k.id), ['market', 'yemek', 'ev', 'ulasim', 'eglence', 'hediye', 'seyahat', 'diger']);
  for (const k of KATEGORILER) assert.ok(k.ad, k.id);
});

test('tutarCoz: Türkçe ve noktalı yazım kuruşa tamsayı olarak çevrilir', () => {
  const ok = {
    '120': 12000, '120,5': 12050, '120,50': 12050, '1.234,56': 123456, '1234.56': 123456, '1.234': 123400,
    '1.5': 150, '0,01': 1, ' 45 ₺ ': 4500, '45 TL': 4500, '1.000.000,00': 100000000, '19,99': 1999, '0,1': 10,
  };
  for (const [girdi, beklenen] of Object.entries(ok)) assert.equal(tutarCoz(girdi), beklenen, girdi);
  for (const kotu of ['', '0', '0,00', '-5', 'abc', '12,3,4', '120,505', '1.000.000,01', '1,2.3', '.5', null]) {
    assert.equal(tutarCoz(kotu), null, String(kotu));
  }
  assert.equal(MAX_KURUS, 100000000);
});

test('paraMetni: tr-TR biçimi, binlik nokta, ondalık virgül, ₺ sonda (bölünmez boşluk)', () => {
  assert.equal(paraMetni(12050), `120,50${NB}₺`);
  assert.equal(paraMetni(123456), `1.234,56${NB}₺`);
  assert.equal(paraMetni(5), `0,05${NB}₺`);
  assert.equal(paraMetni(0), `0,00${NB}₺`);
  assert.equal(paraMetni(100000000), `1.000.000,00${NB}₺`);
  assert.equal(paraMetni(-12050), `-120,50${NB}₺`);
});

test('paylar: yuvarlama kuralı — borçlunun payı aşağı, artan kuruş ödeyende kalır; toplam hep tutar', () => {
  assert.deepEqual(paylar(101, { [O]: 1, [G]: 1 }, O), { [O]: 51, [G]: 50 });
  assert.deepEqual(paylar(101, { [O]: 1, [G]: 1 }, G), { [O]: 50, [G]: 51 });
  assert.deepEqual(paylar(1000, { [O]: 70, [G]: 30 }, O), { [O]: 700, [G]: 300 });
  assert.deepEqual(paylar(1001, { [O]: 1, [G]: 2 }, G), { [O]: 333, [G]: 668 });
  assert.deepEqual(paylar(1001, { [O]: 1, [G]: 2 }, O), { [O]: 334, [G]: 667 });
  assert.deepEqual(paylar(999, { [G]: 1 }, O), { [G]: 999 });
  assert.deepEqual(paylar(100, { a: 1, b: 1, c: 1 }, 'd'), { a: 33, b: 33, c: 33, d: 1 });
  for (let t = 1; t < 400; t += 7) {
    const p = paylar(t, { [O]: 3, [G]: 7 }, O);
    assert.equal(p[O] + p[G], t, `toplam ${t}`);
  }
  assert.equal(paylar(100, {}, O), null);
  assert.equal(paylar(100, { [O]: 0 }, O), null);
  assert.equal(paylar(100, { [O]: -1, [G]: 2 }, O), null);
});

test('yonelme: Türkçe yönelme eki', () => {
  assert.equal(yonelme('Gül'), "Gül'e");
  assert.equal(yonelme('Ömer'), "Ömer'e");
  assert.equal(yonelme('Ayşe'), "Ayşe'ye");
  assert.equal(yonelme('Ali'), "Ali'ye");
  assert.equal(yonelme('Can'), "Can'a");
  assert.equal(yonelme('Oya'), "Oya'ya");
  assert.equal(yonelme('Burak'), "Burak'a");
  assert.equal(yonelme('Sevgilin'), 'Sevgiline');
});

test('yeniHarcama: alanları doğrular, tutarı kuruşa çevirir', () => {
  const r = yeniHarcama({
    baslik: '  Haftalık   market ', tutarMetni: '245,90', odeyen: O, pay: { [O]: 1, [G]: 1 }, tarih: '2026-10-12', kategori: 'market',
  });
  assert.deepEqual(r, { data: { baslik: 'Haftalık market', tutar: 24590, odeyen: O, pay: { [O]: 1, [G]: 1 }, tarih: '2026-10-12', kategori: 'market' } });
  const temel = { baslik: 'a', tutarMetni: '1', odeyen: O, pay: { [O]: 1 }, tarih: '2026-10-12', kategori: 'market' };
  assert.match(yeniHarcama({ ...temel, baslik: ' ' }).hata, /Ne için/);
  assert.match(yeniHarcama({ ...temel, tutarMetni: 'on lira' }).hata, /Tutar/);
  assert.ok(yeniHarcama({ ...temel, odeyen: '' }).hata);
  assert.ok(yeniHarcama({ ...temel, pay: {} }).hata);
  assert.ok(yeniHarcama({ ...temel, tarih: '2026-02-30' }).hata);
  assert.equal(yeniHarcama({ ...temel, kategori: 'uzay' }).data.kategori, 'diger');
  assert.ok(yeniHarcama({ ...temel, baslik: 'x'.repeat(81) }).hata);
});

test('kayitOku: bozuk kayıtları atar', () => {
  assert.equal(kayitOku(harcama(100, O, { [O]: 1 })).tutar, 100);
  assert.equal(kayitOku(harcama(1.5, O, { [O]: 1 })), null, 'kesirli tutar');
  assert.equal(kayitOku(harcama(0, O, { [O]: 1 })), null, 'sıfır');
  assert.equal(kayitOku(harcama(100, '', { [O]: 1 })), null, 'ödeyen yok');
  assert.equal(kayitOku(harcama(100, O, {})), null, 'pay yok');
  assert.equal(kayitOku(harcama(100, O, { [O]: 1 }, { tarih: 'dün' })), null, 'tarih bozuk');
  assert.equal(kayitOku(harcama(100, O, { [O]: 1 }, { kategori: 'uzay' })).kategori, 'diger');
  assert.equal(kayitOku({ ...harcama(100, O, { [O]: 1 }), deleted: true }), null);
});

test('bakiye ve hesaplaşma: borç kapanınca sıfırlanır', () => {
  const docs = [
    harcama(24590, O, { [O]: 1, [G]: 1 }),      // Ömer öder: Gül 12295 borçlu
    harcama(101, G, { [O]: 1, [G]: 1 }),        // Gül öder: Ömer 50 borçlu (artan kuruş Gül'de)
    harcama(3000, G, { [O]: 1 }),               // hepsi Ömer için: Ömer 3000 borçlu
  ];
  const net = bakiye(docs);
  assert.equal(net.get(O), 12295 - 50 - 3000);
  assert.equal(net.get(G), -(12295 - 50 - 3000));
  const d = bakiyeDurumu(net, G, O);
  assert.deepEqual(d, { borclu: G, alacakli: O, tutar: 9245 });
  assert.equal(bakiyeMetni(d, adOf), `Gül, Ömer'e 92,45${NB}₺ borçlu`);
  assert.deepEqual(bakiyeDurumu(net, O, G), d, 'iki taraftan aynı sonuç');

  const kapat = hesaplasmaKaydi(d, { tarih: '2026-10-20' });
  assert.deepEqual(kapat, {
    baslik: 'Hesaplaştık', tutar: 9245, odeyen: G, pay: { [O]: 1 }, tarih: '2026-10-20', kategori: 'diger', hesaplasma: true,
  });
  const sonra = bakiyeDurumu(bakiye([...docs, doc(kapat)]), O, G);
  assert.deepEqual(sonra, { borclu: null, alacakli: null, tutar: 0 });
  assert.match(bakiyeMetni(sonra, adOf), /denk/);
  assert.equal(hesaplasmaKaydi(sonra, { tarih: '2026-10-20' }), null);
});

test('bakiyeDurumu: partner bilinmiyorsa da benim net tutarım esas', () => {
  const net = new Map([[O, -500]]);
  assert.deepEqual(bakiyeDurumu(net, O, null), { borclu: O, alacakli: null, tutar: 500 });
});

test('aylar, ayFiltresi: yeniden eskiye; ay yoksa hepsi', () => {
  const docs = [
    harcama(100, O, { [O]: 1 }, { tarih: '2026-09-30' }),
    harcama(200, O, { [O]: 1 }, { tarih: '2026-10-02' }),
    harcama(300, G, { [G]: 1 }, { tarih: '2026-10-02' }),
    harcama(400, G, { [G]: 1 }, { tarih: '2025-12-31' }),
  ];
  assert.deepEqual(aylar(docs), ['2026-10', '2026-09', '2025-12']);
  assert.deepEqual(ayFiltresi(docs, '2026-10').map((d) => d.data.tutar), [300, 200], 'aynı gün: son eklenen üstte');
  assert.deepEqual(ayFiltresi(docs, null).map((d) => d.data.tutar), [300, 200, 100, 400]);
});

test('kategoriOzeti: hesaplaşma hariç, büyükten küçüğe, oranlı', () => {
  const docs = [
    harcama(6000, O, { [O]: 1 }, { kategori: 'market' }),
    harcama(3000, G, { [G]: 1 }, { kategori: 'yemek' }),
    harcama(1000, G, { [G]: 1 }, { kategori: 'market' }),
    harcama(9999, G, { [O]: 1 }, { kategori: 'diger', hesaplasma: true, baslik: 'Hesaplaştık' }),
    harcama(500, O, { [O]: 1 }, { kategori: 'ev', tarih: '2026-09-01' }),
  ];
  const oz = kategoriOzeti(docs, '2026-10');
  assert.equal(oz.toplam, 10000);
  assert.deepEqual(oz.kategoriler.map((k) => [k.id, k.toplam, k.oran]), [['market', 7000, 70], ['yemek', 3000, 30]]);
  assert.deepEqual(oz.odeyenler, { [O]: 6000, [G]: 4000 });
  assert.equal(kategoriOzeti(docs, null).toplam, 10500);
});

test('payTuru, ozelPay ve payAciklama', () => {
  assert.deepEqual(payTuru({ [O]: 1, [G]: 1 }, O, G), { tur: 'esit', yuzde: 50 });
  assert.deepEqual(payTuru({ [O]: 1 }, O, G), { tur: 'benim', yuzde: 100 });
  assert.deepEqual(payTuru({ [G]: 1 }, O, G), { tur: 'onun', yuzde: 0 });
  assert.deepEqual(payTuru({ [O]: 70, [G]: 30 }, O, G), { tur: 'ozel', yuzde: 70 });
  assert.deepEqual(ozelPay(70, O, G), { [O]: 70, [G]: 30 });
  assert.deepEqual(ozelPay(100, O, G), { [O]: 100 });
  assert.deepEqual(ozelPay(0, O, G), { [G]: 100 });
  assert.equal(payAciklama({ [O]: 1, [G]: 1 }, O, G, adOf), 'yarı yarıya');
  assert.equal(payAciklama({ [G]: 1 }, O, G, adOf), 'hepsi Gül için');
  assert.equal(payAciklama({ [O]: 70, [G]: 30 }, O, G, adOf), 'Ömer %70 · Gül %30');
});
