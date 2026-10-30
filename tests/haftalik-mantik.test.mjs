import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ALANLAR, NOT_MAX, isoHafta, haftaPazartesi, haftaKaydir, sonHaftalar, docId, kayitOku, haftalaraGore,
  haftaDurumu, yeniKayit, ortalama, karsilastir, egilim, egilimOzeti, cizgiYolu, hatirlatmaGoster,
  bildirimMetni, sayiMetni,
} from '../sayfalar/haftalik/mantik.js';

const BEN = 'omer-test-id';
const O = 'gul-test-id';
const P = (a, b, c, d) => ({ iletisim: a, yakinlik: b, eglence: c, destek: d });
const doc = (hafta, kim, puanlar, { not, updated = '2026-10-30T10:00:00.000Z' } = {}) => ({
  id: docId(hafta, kim), author: kim,
  data: { puanlar, ...(not ? { not } : {}), at: updated },
  created_at: updated, updated_at: updated,
});

test('ALANLAR: dört alan, sabit sırada', () => {
  assert.deepEqual(ALANLAR.map((a) => a.id), ['iletisim', 'yakinlik', 'eglence', 'destek']);
  for (const a of ALANLAR) assert.ok(a.ad && a.soru, a.id);
});

test('isoHafta: ISO 8601 hafta-yılı sınırları', () => {
  assert.equal(isoHafta('2026-10-31'), '2026-W44'); // cumartesi
  assert.equal(isoHafta('2026-11-01'), '2026-W44'); // pazar: hafta pazar biter
  assert.equal(isoHafta('2026-11-02'), '2026-W45'); // pazartesi
  assert.equal(isoHafta('2026-01-01'), '2026-W01'); // perşembe
  assert.equal(isoHafta('2027-01-01'), '2026-W53'); // cuma: önceki yılın 53. haftası
  assert.equal(isoHafta('2024-12-30'), '2025-W01'); // pazartesi: sonraki yılın 1. haftası
  assert.equal(isoHafta('2021-01-03'), '2020-W53');
  assert.equal(isoHafta('bozuk'), null);
});

test('haftaPazartesi ve haftaKaydir: yıl geçişlerinde doğru', () => {
  assert.equal(haftaPazartesi('2026-W44'), '2026-10-26');
  assert.equal(haftaPazartesi('2025-W01'), '2024-12-30');
  assert.equal(haftaPazartesi('2026-W53'), '2026-12-28');
  assert.equal(haftaKaydir('2026-W01', -1), '2025-W52');
  assert.equal(haftaKaydir('2026-W52', 1), '2026-W53');
  assert.equal(haftaKaydir('2026-W53', 1), '2027-W01');
  assert.deepEqual(sonHaftalar('2026-W02', 4), ['2025-W51', '2025-W52', '2026-W01', '2026-W02']);
});

test('docId: veri.js id biçimine uyar', () => {
  assert.equal(docId('2026-W44', BEN), '2026-W44-omer-test-id');
  assert.match(docId('2026-W44', '3f2b8a7c-1d2e-4f5a-9b8c-7d6e5f4a3b2c'), /^[A-Za-z0-9_-]{1,64}$/);
});

test('kayitOku: hafta ve kişi id\'den; puanlar 1–5 tamsayı olmalı', () => {
  assert.deepEqual(kayitOku(doc('2026-W44', BEN, P(4, 5, 3, 4), { not: ' iyi ' })),
    { hafta: '2026-W44', kim: BEN, puanlar: P(4, 5, 3, 4), not: 'iyi', at: '2026-10-30T10:00:00.000Z' });
  assert.equal(kayitOku(doc('2026-W44', BEN, P(4, 6, 3, 4))), null, '6 geçersiz');
  assert.equal(kayitOku(doc('2026-W44', BEN, P(4, 2.5, 3, 4))), null, 'kesirli geçersiz');
  assert.equal(kayitOku(doc('2026-W44', BEN, { iletisim: 4 })), null, 'eksik alan');
  assert.equal(kayitOku({ id: '2026-44-x', data: { puanlar: P(1, 1, 1, 1) } }), null, 'bozuk hafta');
  assert.equal(kayitOku(null), null);
});

test('haftaDurumu: partnerin en yeni cihazı; ikisi', () => {
  const harita = haftalaraGore([
    doc('2026-W44', BEN, P(4, 4, 4, 4)),
    doc('2026-W44', 'gul-eski', P(1, 1, 1, 1), { updated: '2026-10-27T10:00:00.000Z' }),
    doc('2026-W44', O, P(5, 5, 5, 5), { updated: '2026-10-31T10:00:00.000Z' }),
  ]);
  const d = haftaDurumu(harita, '2026-W44', BEN);
  assert.equal(d.ikisi, true);
  assert.equal(d.partner.kim, O);
  assert.deepEqual(d.partner.puanlar, P(5, 5, 5, 5));
  assert.deepEqual(haftaDurumu(harita, '2026-W43', BEN), { ben: null, partner: null, ikisi: false });
});

test('yeniKayit: dört puan zorunlu, not sınırlı', () => {
  const simdi = new Date('2026-11-01T17:00:00.000Z');
  assert.deepEqual(yeniKayit({ puanlar: P(4, 5, 3, 4), not: '  güzel hafta  ', simdi }),
    { data: { puanlar: P(4, 5, 3, 4), not: 'güzel hafta', at: '2026-11-01T17:00:00.000Z' } });
  assert.deepEqual(yeniKayit({ puanlar: P(1, 2, 3, 4), not: '', simdi }).data, { puanlar: P(1, 2, 3, 4), at: '2026-11-01T17:00:00.000Z' });
  assert.match(yeniKayit({ puanlar: { iletisim: 4, yakinlik: 5, eglence: 3 }, simdi }).hata, /Destek/);
  assert.ok(yeniKayit({ puanlar: P(4, 0, 3, 4), simdi }).hata);
  assert.ok(yeniKayit({ puanlar: P(4, 4, 4, 4), not: 'a'.repeat(NOT_MAX + 1), simdi }).hata);
});

test('ortalama ve sayiMetni: bir ondalık, Türkçe virgül', () => {
  assert.equal(ortalama(P(4, 5, 3, 4)), 4);
  assert.equal(ortalama(P(4, 5, 4, 4)), 4.3);
  assert.equal(ortalama(P(1, 2, 2, 2)), 1.8);
  assert.equal(sayiMetni(4), '4,0');
  assert.equal(sayiMetni(4.25), '4,3');
});

test('karsilastir: alan alan fark, 2 ve üstü fark "konuşalım"', () => {
  const k = karsilastir(P(4, 5, 2, 4), P(4, 3, 4, 5));
  assert.deepEqual(k.satirlar.map((s) => [s.id, s.ben, s.partner, s.fark]),
    [['iletisim', 4, 4, 0], ['yakinlik', 5, 3, -2], ['eglence', 2, 4, 2], ['destek', 4, 5, 1]]);
  assert.deepEqual(k.konusalim, ['yakinlik', 'eglence']);
  assert.equal(k.ayni, 1);
  assert.equal(k.benOrt, 3.8);
  assert.equal(k.partnerOrt, 4);
});

test('egilim: son 8 hafta eskiden yeniye; bu haftanın partner puanı ben doldurmadan gizli', () => {
  const docs = [
    doc('2026-W44', O, P(5, 5, 5, 5)),
    doc('2026-W43', BEN, P(3, 3, 3, 3)), doc('2026-W43', O, P(4, 4, 4, 4)),
    doc('2026-W40', BEN, P(2, 2, 2, 2)),
    doc('2026-W30', BEN, P(1, 1, 1, 1)), // 8 haftadan eski
  ];
  const e = egilim(haftalaraGore(docs), { hafta: '2026-W44', benId: BEN });
  assert.equal(e.length, 8);
  assert.equal(e[0].hafta, '2026-W37');
  assert.deepEqual(e.at(-1), { hafta: '2026-W44', ben: null, partner: null });
  assert.deepEqual(e.at(-2), { hafta: '2026-W43', ben: 3, partner: 4 });
  assert.deepEqual(e[3], { hafta: '2026-W40', ben: 2, partner: null });
  const sonra = egilim(haftalaraGore([...docs, doc('2026-W44', BEN, P(4, 4, 4, 4))]), { hafta: '2026-W44', benId: BEN });
  assert.deepEqual(sonra.at(-1), { hafta: '2026-W44', ben: 4, partner: 5 });
});

test('egilimOzeti: yükseliş, düşüş, sabit, tek hafta, veri yok', () => {
  const s = (ben, partner) => ben.map((b, i) => ({ hafta: `2026-W${40 + i}`, ben: b, partner: partner[i] }));
  const metin = egilimOzeti(s([3, null, 3.5, 4.3], [4, 4.1, null, 3]), { partnerAd: 'Gül' });
  assert.match(metin, /4 haftanın 4 haftasında puan var/);
  assert.match(metin, /Senin ortalaman 3,0 iken 4,3 oldu, yükselişte\./);
  assert.match(metin, /Gül'ün ortalaması 4,0 iken 3,0 oldu, düşüşte\./);
  assert.match(egilimOzeti(s([4, 4.2], [null, 3]), { partnerAd: 'Gül' }), /Senin ortalaman 4,2 civarında, sabit\..*Gül'ün ortalaması 3,0 \(tek hafta\)\./);
  assert.match(egilimOzeti(s([null, null], [null, null]), { partnerAd: 'Gül' }), /Henüz puanlanmış hafta yok/);
  assert.match(egilimOzeti(s([4, null], [null, null]), { partnerAd: 'Gül' }), /Gül henüz puan vermedi/);
});

test('cizgiYolu: boşlukta çizgi kopar, her değer bir nokta', () => {
  const r = cizgiYolu([1, 5, null, 3], { genislik: 300, yukseklik: 100 });
  assert.equal(r.d, 'M0 100L100 0M300 50');
  assert.deepEqual(r.noktalar.map((n) => [n.x, n.y, n.i]), [[0, 100, 0], [100, 0, 1], [300, 50, 3]]);
  assert.equal(cizgiYolu([null, null], { genislik: 10, yukseklik: 10 }).d, '');
  assert.equal(cizgiYolu([2], { genislik: 10, yukseklik: 40 }).d, 'M5 30');
});

test('hatirlatmaGoster: yalnız pazar 18:00 sonrası ve doldurulmadıysa', () => {
  const pazarAksam = new Date(2026, 10, 1, 19, 30);
  assert.equal(hatirlatmaGoster({ simdi: pazarAksam, benDoldurdu: false }), true);
  assert.equal(hatirlatmaGoster({ simdi: pazarAksam, benDoldurdu: true }), false);
  assert.equal(hatirlatmaGoster({ simdi: new Date(2026, 10, 1, 17, 59), benDoldurdu: false }), false);
  assert.equal(hatirlatmaGoster({ simdi: new Date(2026, 10, 2, 19), benDoldurdu: false }), false);
});

test('bildirimMetni: ilk dolduran davet eder, ikinci açılışı haber verir', () => {
  assert.match(bildirimMetni({ benAd: 'Ömer', partnerDoldurdu: false }).metin, /^Ömer bu haftayı değerlendirdi/);
  assert.match(bildirimMetni({ benAd: 'Ömer', partnerDoldurdu: true }).metin, /açıldı/);
  assert.match(bildirimMetni({ benAd: '', partnerDoldurdu: false }).metin, /^Sevgilin/);
});
