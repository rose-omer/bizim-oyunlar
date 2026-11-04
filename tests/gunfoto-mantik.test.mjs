import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  NOT_MAX, docId, fotoOku, gunlereGore, gunDurumu, gorunum, yeniKayit, arsiv, bildirimMetni, aniTaslagi,
} from '../sayfalar/gunfoto/mantik.js';

const BEN = 'omer-test-id';
const O = 'gul-test-id';
const at = (s) => `2026-10-${s}T09:00:00.000Z`;
const doc = (gun, kim, data = {}, { updated } = {}) => ({
  id: docId(gun, kim),
  author: kim,
  data: { foto: `local:${gun}-${kim}`, at: at('30'), ...data },
  created_at: updated || at('30'),
  updated_at: updated || at('30'),
});

test('docId: gün ve clientId, veri.js id biçimine uyar', () => {
  const id = docId('2026-10-31', BEN);
  assert.equal(id, '2026-10-31-omer-test-id');
  assert.match(docId('2026-10-31', '3f2b8a7c-1d2e-4f5a-9b8c-7d6e5f4a3b2c'), /^[A-Za-z0-9_-]{1,64}$/);
});

test('fotoOku: günü ve kişiyi id\'den çözer, bozuk belgeyi atar', () => {
  assert.deepEqual(fotoOku(doc('2026-10-31', BEN, { not: '  kahve  ' })),
    { gun: '2026-10-31', kim: BEN, foto: 'local:2026-10-31-omer-test-id', not: 'kahve', at: at('30') });
  assert.equal(fotoOku(doc('2026-10-31', BEN, { not: '' })).not, '');
  assert.equal(fotoOku({ id: 'x', data: { foto: 'a' } }), null, 'günsüz id');
  assert.equal(fotoOku({ id: '2026-13-01-a', data: { foto: 'a' } }), null, 'geçersiz gün');
  assert.equal(fotoOku({ id: '2026-10-31-a', data: { foto: '' } }), null, 'fotoğrafsız');
  assert.equal(fotoOku({ id: '2026-10-31-', data: { foto: 'a' } }), null, 'kişisiz');
  assert.equal(fotoOku(null), null);
});

test('gunDurumu: ben, partner, ikisi; partnerin en yeni cihazı', () => {
  const harita = gunlereGore([
    doc('2026-10-31', BEN),
    doc('2026-10-31', 'gul-eski', {}, { updated: at('29') }),
    doc('2026-10-31', O, {}, { updated: at('31') }),
    doc('2026-10-30', O),
  ]);
  const d = gunDurumu(harita, '2026-10-31', BEN);
  assert.equal(d.ben.foto, 'local:2026-10-31-omer-test-id');
  assert.equal(d.partner.kim, O);
  assert.equal(d.ikisi, true);
  const dun = gunDurumu(harita, '2026-10-30', BEN);
  assert.deepEqual([dun.ben, dun.partner?.kim, dun.ikisi], [null, O, false]);
  assert.deepEqual(gunDurumu(harita, '2026-10-01', BEN), { ben: null, partner: null, ikisi: false });
});

test('gorunum: bugün partnerinki ben gönderene dek kilitli; geçmiş günler açık', () => {
  const bugun = '2026-10-31';
  const yalnizO = { ben: null, partner: { foto: 'x' }, ikisi: false };
  const yalnizBen = { ben: { foto: 'y' }, partner: null, ikisi: false };
  const ikisi = { ben: { foto: 'y' }, partner: { foto: 'x' }, ikisi: true };
  assert.deepEqual(gorunum(yalnizO, bugun, bugun), { ben: 'bos', partner: 'kilitli' });
  assert.deepEqual(gorunum(yalnizBen, bugun, bugun), { ben: 'acik', partner: 'bos' });
  assert.deepEqual(gorunum(ikisi, bugun, bugun), { ben: 'acik', partner: 'acik' });
  assert.deepEqual(gorunum(yalnizO, '2026-10-30', bugun), { ben: 'bos', partner: 'acik' });
});

test('yeniKayit: fotoğraf zorunlu, not kırpılır ve sınırlı, an ISO', () => {
  const simdi = new Date('2026-10-31T08:15:00.000Z');
  assert.deepEqual(yeniKayit({ foto: 'local:1', not: '  günaydın \n ', simdi }),
    { data: { foto: 'local:1', not: 'günaydın', at: '2026-10-31T08:15:00.000Z' } });
  assert.deepEqual(yeniKayit({ foto: 'local:1', not: '   ', simdi }).data, { foto: 'local:1', at: '2026-10-31T08:15:00.000Z' });
  assert.ok(yeniKayit({ foto: '', simdi }).hata);
  assert.ok(yeniKayit({ foto: 'local:1', not: 'a'.repeat(NOT_MAX + 1), simdi }).hata);
  assert.ok(!yeniKayit({ foto: 'local:1', not: 'a'.repeat(NOT_MAX), simdi }).hata);
});

test('arsiv: bugün hariç, ay ay yeniden eskiye; gün başına ikili; ortak gün sayısı', () => {
  const harita = gunlereGore([
    doc('2026-10-31', BEN), doc('2026-10-31', O), // bugün: arşive girmez
    doc('2026-10-30', BEN), doc('2026-10-30', O),
    doc('2026-10-02', O),
    doc('2026-09-15', BEN), doc('2026-09-15', O),
    doc('2025-12-31', BEN),
  ]);
  const a = arsiv(harita, { bugun: '2026-10-31', benId: BEN });
  assert.deepEqual(a.map((m) => m.ay), ['2026-10', '2026-09', '2025-12']);
  assert.deepEqual(a[0].gunler.map((g) => g.gun), ['2026-10-30', '2026-10-02']);
  assert.equal(a[0].ortak, 1);
  assert.equal(a[0].gunler[0].ikisi, true);
  assert.equal(a[0].gunler[1].ben, null);
  assert.equal(a[0].gunler[1].partner.foto, 'local:2026-10-02-gul-test-id');
  assert.equal(a[2].ortak, 0);
  assert.deepEqual(arsiv(new Map(), { bugun: '2026-10-31', benId: BEN }), []);
});

test('bildirimMetni: partner göndermişse açılış, yoksa davet', () => {
  const ilk = bildirimMetni({ benAd: 'Ömer', partnerGonderdi: false });
  assert.equal(ilk.baslik, 'Günün fotoğrafı');
  assert.match(ilk.metin, /^Ömer bugünün fotoğrafını gönderdi/);
  const acilis = bildirimMetni({ benAd: 'Ömer', partnerGonderdi: true });
  assert.match(acilis.baslik, /açıldı/);
  assert.match(acilis.metin, /Ömer/);
  assert.match(bildirimMetni({ benAd: '', partnerGonderdi: false }).metin, /^Sevgilin/);
});

test('aniTaslagi: yalnız açık fotoğraflar; kilitli partner fotoğrafı asla girmez', () => {
  const ben = { foto: 'b.webp', not: 'kahve' };
  const o = { foto: 'o.webp', not: '' };
  assert.deepEqual(aniTaslagi({ ben, partner: o }, { ben: 'acik', partner: 'acik' }), { fotolar: ['b.webp', 'o.webp'], not: 'kahve' });
  assert.deepEqual(aniTaslagi({ ben: null, partner: o }, { ben: 'bos', partner: 'kilitli' }), { fotolar: [], not: '' });
  assert.deepEqual(aniTaslagi({ ben: null, partner: o }, { ben: 'bos', partner: 'acik' }), { fotolar: ['o.webp'], not: '' });
  assert.equal(aniTaslagi({ ben: { foto: 'b', not: 'x' }, partner: { foto: 'o', not: 'y' } }, { ben: 'acik', partner: 'acik' }).not, 'x\ny');
});
