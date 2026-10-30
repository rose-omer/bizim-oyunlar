import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  KATEGORILER, BUTCELER, MIN_FIKIR, fikirleriDogrula, filtrele, cekilis, kayitlar,
  planlananlar, yapilanlar, planMetni, yeniRandevu, butceMetni, fikirDocId,
} from '../sayfalar/randevu/randevu.js';
import { FIKIRLER } from '../sayfalar/randevu/fikirler.js';

const f = (id, kategoriler, butce = '₺', metin = `Fikir ${id}`) => ({ id, metin, kategoriler, sure: '1 saat', butce });

test('kategoriler ve bütçeler sabit', () => {
  assert.deepEqual(KATEGORILER.map((k) => k.id), ['evde', 'disarida', 'uzaktan', 'ucretsiz', 'macera', 'romantik', 'ozelgun']);
  assert.deepEqual(BUTCELER, ['₺', '₺₺', '₺₺₺']);
  assert.equal(MIN_FIKIR, 180);
});

test('fikir havuzu geçerli: en az 180, benzersiz id ve metin, geçerli kategori ve bütçe', () => {
  assert.ok(FIKIRLER.length >= 180, `yalnız ${FIKIRLER.length} fikir`);
  assert.deepEqual(fikirleriDogrula(FIKIRLER), []);
});

test('her kategoride yeterince fikir var', () => {
  for (const k of KATEGORILER) {
    const n = FIKIRLER.filter((x) => x.kategoriler.includes(k.id)).length;
    assert.ok(n >= 15, `${k.id}: ${n}`);
  }
  for (const b of BUTCELER) assert.ok(FIKIRLER.some((x) => x.butce === b), b);
});

test('fikirleriDogrula hataları yakalar', () => {
  const az = [f('a', ['evde'])];
  assert.ok(fikirleriDogrula(az).some((e) => /en az/i.test(e)));
  const kotu = [
    f('a', ['evde']), f('a', ['evde'], '₺', 'başka metin'),
    f('b', ['uzay']), f('c', ['evde'], '₺₺₺₺'), f('d', []),
    { id: 'e', metin: '  ', kategoriler: ['evde'], sure: '1 saat', butce: '₺' },
    f('g', ['ucretsiz', 'evde'], '₺₺'), f('h', ['evde'], '₺', 'Fikir a'),
    { id: 'i', metin: 'Süresiz', kategoriler: ['evde'], sure: '', butce: '₺' },
    f('Büyük Harf', ['evde']),
  ];
  const e = fikirleriDogrula(kotu, { min: 0 }).join('\n');
  assert.match(e, /yinelenen id: a/i);
  assert.match(e, /geçersiz kategori: b/i);
  assert.match(e, /geçersiz bütçe: c/i);
  assert.match(e, /kategori yok: d/i);
  assert.match(e, /metin boş: e/i);
  assert.match(e, /ücretsiz.*: g/i);
  assert.match(e, /yinelenen metin: h/i);
  assert.match(e, /süre yok: i/i);
  assert.match(e, /geçersiz id/i);
});

test('filtrele: kategori ve bütçe birlikte', () => {
  const list = [f('a', ['evde', 'romantik'], '₺'), f('b', ['disarida'], '₺₺'), f('c', ['evde'], '₺₺₺')];
  assert.deepEqual(filtrele(list).map((x) => x.id), ['a', 'b', 'c']);
  assert.deepEqual(filtrele(list, { kategori: 'evde' }).map((x) => x.id), ['a', 'c']);
  assert.deepEqual(filtrele(list, { kategori: 'evde', butce: '₺₺₺' }).map((x) => x.id), ['c']);
  assert.deepEqual(filtrele(list, { butce: '₺₺' }).map((x) => x.id), ['b']);
  assert.deepEqual(filtrele(list, { kategori: 'macera' }), []);
});

test('cekilis: tohumlu, hariçleri atlar, seri seçilenle biter', () => {
  const list = Array.from({ length: 20 }, (_, i) => f(`x${i}`, ['evde']));
  const a = cekilis(list, 42);
  const b = cekilis(list, 42);
  assert.equal(a.secilen.id, b.secilen.id);
  assert.equal(a.seri.at(-1).id, a.secilen.id);
  assert.ok(a.seri.length >= 8);
  const haric = list.slice(0, 19).map((x) => x.id);
  assert.equal(cekilis(list, 7, { haric }).secilen.id, 'x19');
  // Hepsi hariçse yine de havuzdan seçer
  assert.ok(cekilis(list, 7, { haric: list.map((x) => x.id) }).secilen);
  assert.equal(cekilis([], 1), null);
  // Farklı tohumlar farklı sonuçlar verebilmeli
  const ids = new Set(Array.from({ length: 30 }, (_, s) => cekilis(list, s + 1).secilen.id));
  assert.ok(ids.size > 5);
});

const r = (id, data, created = '2026-10-01T10:00:00.000Z') => ({ id, data, created_at: created, updated_at: created });

test('kayitlar: fikirId → belge', () => {
  const docs = [r('1', { fikirId: 'f001', metin: 'a' }), r('2', { metin: 'kendi' })];
  const m = kayitlar(docs);
  assert.equal(m.get('f001').id, '1');
  assert.equal(m.size, 1);
});

test('planlananlar: takvimdekiler tarihe göre, tarihsizler ayrı; yapılanlar hariç', () => {
  const docs = [
    r('1', { metin: 'Sonra', plan: '2026-11-20' }),
    r('2', { metin: 'Yakında', plan: '2026-11-02' }),
    r('3', { metin: 'Bir gün eski' }, '2026-10-01T10:00:00.000Z'),
    r('4', { metin: 'Bir gün yeni' }, '2026-10-05T10:00:00.000Z'),
    r('5', { metin: 'Yapıldı', plan: '2026-10-10', yapildi: '2026-10-10T20:00:00.000Z' }),
  ];
  const p = planlananlar(docs);
  assert.deepEqual(p.takvim.map((d) => d.id), ['2', '1']);
  assert.deepEqual(p.birGun.map((d) => d.id), ['4', '3']);
});

test('yapilanlar: son yapılan üstte', () => {
  const docs = [
    r('1', { metin: 'a', yapildi: '2026-10-01T10:00:00.000Z' }),
    r('2', { metin: 'b' }),
    r('3', { metin: 'c', yapildi: '2026-10-09T10:00:00.000Z' }),
  ];
  assert.deepEqual(yapilanlar(docs).map((d) => d.id), ['3', '1']);
});

test('planMetni', () => {
  assert.equal(planMetni('2026-10-30', '2026-10-30'), 'Bugün');
  assert.equal(planMetni('2026-10-31', '2026-10-30'), 'Yarın');
  assert.equal(planMetni('2026-11-04', '2026-10-30'), '5 gün kaldı');
  assert.equal(planMetni('2026-10-28', '2026-10-30'), 'Tarihi geçti');
  assert.equal(planMetni('', '2026-10-30'), '');
});

test('yeniRandevu: fikirden ya da kendi metninden; tarih doğrulanır', () => {
  const fikir = f('f001', ['evde'], '₺', 'Evde mantı yapma yarışı');
  assert.deepEqual(yeniRandevu({ fikir }).data, { fikirId: 'f001', metin: 'Evde mantı yapma yarışı' });
  assert.deepEqual(yeniRandevu({ fikir, plan: '2026-11-02' }).data,
    { fikirId: 'f001', metin: 'Evde mantı yapma yarışı', plan: '2026-11-02' });
  assert.deepEqual(yeniRandevu({ metin: '  Gece   balık tutmak ' }).data, { metin: 'Gece balık tutmak' });
  assert.ok(yeniRandevu({ metin: '   ' }).hata);
  assert.ok(yeniRandevu({ metin: 'x', plan: '2026-02-30' }).hata);
  assert.ok(yeniRandevu({ metin: 'a'.repeat(141) }).hata);
});

test('butceMetni: ücretsiz kategorisi öne çıkar', () => {
  assert.equal(butceMetni(f('a', ['evde', 'ucretsiz'], '₺')), 'Ücretsiz');
  assert.equal(butceMetni(f('b', ['evde'], '₺₺')), '₺₺');
});

test('fikirDocId: hazır fikir için sabit, geçerli, tekil belge id', () => {
  assert.equal(fikirDocId({ id: 'f001' }), 'f-f001');
  for (const fk of FIKIRLER) assert.match(fikirDocId(fk), /^[A-Za-z0-9_-]{1,64}$/);
  assert.equal(new Set(FIKIRLER.map(fikirDocId)).size, FIKIRLER.length);
});
