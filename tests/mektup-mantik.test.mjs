import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_METIN, ZARFLAR, zarfRengi, yon, kilitliMi, durum, ayir, geriSayimYazi, acilisYazi,
  mektupDogrula, yilDonumuAcilis, hazirAcilislar, girdiDegeri, girdidenIso, bildirimMetni, mektupVerisi,
  ek, kalanYazi, yazan,
} from '../sayfalar/mektup/mantik.js';

const SIMDI = new Date(2026, 9, 30, 20, 0, 0); // 30 Ekim 2026 20:00 (yerel)
const iso = (...a) => new Date(...a).toISOString();
let seq = 0;
const mektup = (author, data, created = iso(2026, 9, 1 + (++seq % 25))) => ({
  id: `m${seq}`, author, created_at: created, updated_at: created, data: { baslik: 'B', metin: 'M', ...data },
});

test('zarfRengi bilinmeyeni varsayılana çevirir', () => {
  assert.ok(ZARFLAR.length >= 5);
  assert.equal(zarfRengi('erik'), 'erik');
  assert.equal(zarfRengi('javascript:alert(1)'), ZARFLAR[0].id);
  assert.equal(zarfRengi(undefined), ZARFLAR[0].id);
});

test('yon: yazan bensem giden, değilse gelen', () => {
  assert.equal(yon(mektup('omer', { kime: 'gul' }), 'omer'), 'giden');
  assert.equal(yon(mektup('omer', { kime: 'gul' }), 'gul'), 'gelen');
});

test('yon: alıcı açınca author değişse de kimden belirleyicidir', () => {
  const acilmis = mektup('gul', { kimden: 'omer', kime: 'gul', acildi: iso(2026, 9, 2) });
  assert.equal(yazan(acilmis), 'omer');
  assert.equal(yon(acilmis, 'gul'), 'gelen');
  assert.equal(yon(acilmis, 'omer'), 'giden');
});

test('kilitliMi: açılış zamanı gelmemişse kilitli', () => {
  assert.equal(kilitliMi({}, SIMDI), false);
  assert.equal(kilitliMi({ acilis: iso(2026, 9, 31, 9) }, SIMDI), true);
  assert.equal(kilitliMi({ acilis: iso(2026, 9, 30, 20) }, SIMDI), false); // tam vakit: açılır
  assert.equal(kilitliMi({ acilis: 'bozuk' }, SIMDI), false);
});

test('durum: gelen / giden durumları', () => {
  const kapsul = { acilis: iso(2027, 1, 14, 9) };
  assert.equal(durum(mektup('omer', kapsul), 'gul', SIMDI), 'kilitli');
  assert.equal(durum(mektup('omer', kapsul), 'omer', SIMDI), 'kilitli');
  assert.equal(durum(mektup('omer', {}), 'gul', SIMDI), 'yeni');
  assert.equal(durum(mektup('omer', {}), 'omer', SIMDI), 'gonderildi');
  assert.equal(durum(mektup('omer', { acildi: iso(2026, 9, 2) }), 'gul', SIMDI), 'okundu');
  assert.equal(durum(mektup('omer', { acildi: iso(2026, 9, 2) }), 'omer', SIMDI), 'okundu');
});

test('ayir: gelende yeni önce, sonra en yakın kilit, sonra okunanlar; giden yeniden eskiye', () => {
  const okunmus = mektup('omer', { baslik: 'okundu', acildi: iso(2026, 9, 3) }, iso(2026, 9, 3));
  const yeni1 = mektup('omer', { baslik: 'yeni-eski' }, iso(2026, 9, 4));
  const yeni2 = mektup('omer', { baslik: 'yeni-yeni' }, iso(2026, 9, 5));
  const kilitUzak = mektup('omer', { baslik: 'kilit-uzak', acilis: iso(2027, 9, 30) }, iso(2026, 9, 6));
  const kilitYakin = mektup('omer', { baslik: 'kilit-yakın', acilis: iso(2026, 10, 1) }, iso(2026, 9, 7));
  const g1 = mektup('gul', { baslik: 'giden-1' }, iso(2026, 9, 1));
  const g2 = mektup('gul', { baslik: 'giden-2' }, iso(2026, 9, 9));
  const { gelen, giden } = ayir([okunmus, yeni1, yeni2, kilitUzak, kilitYakin, g1, g2], 'gul', SIMDI);
  assert.deepEqual(gelen.map((d) => d.data.baslik), ['yeni-yeni', 'yeni-eski', 'kilit-yakın', 'kilit-uzak', 'okundu']);
  assert.deepEqual(giden.map((d) => d.data.baslik), ['giden-2', 'giden-1']);
});

test('geriSayimYazi ölçeğe göre kısalır', () => {
  assert.equal(geriSayimYazi({ days: 3, hours: 4, minutes: 5, seconds: 6 }), '3 gün 4 sa');
  assert.equal(geriSayimYazi({ days: 0, hours: 2, minutes: 5, seconds: 6 }), '2 sa 5 dk');
  assert.equal(geriSayimYazi({ days: 0, hours: 0, minutes: 5, seconds: 6 }), '5 dk 6 sn');
  assert.equal(geriSayimYazi({ days: 0, hours: 0, minutes: 0, seconds: 9 }), '9 sn');
  assert.equal(geriSayimYazi(null), '');
});

test('acilisYazi yerel saatle yazar', () => {
  assert.equal(acilisYazi(iso(2027, 1, 14, 9, 5)), '14 Şubat 2027, 09:05');
  assert.equal(acilisYazi('bozuk'), '');
});

test('mektupDogrula', () => {
  assert.equal(mektupDogrula({ baslik: 'Sana', metin: 'Seni seviyorum' }, SIMDI), null);
  assert.match(mektupDogrula({ baslik: '', metin: 'x' }, SIMDI), /başlık/i);
  assert.match(mektupDogrula({ baslik: 'a', metin: '   ' }, SIMDI), /boş/i);
  assert.match(mektupDogrula({ baslik: 'a', metin: 'x'.repeat(MAX_METIN + 1) }, SIMDI), /6000/);
  assert.equal(mektupDogrula({ baslik: 'a', metin: 'x'.repeat(MAX_METIN) }, SIMDI), null);
  assert.match(mektupDogrula({ baslik: 'a', metin: 'x', acilis: iso(2026, 9, 30, 19) }, SIMDI), /ileri/i);
  assert.match(mektupDogrula({ baslik: 'a', metin: 'x', acilis: 'bozuk' }, SIMDI), /tarih/i);
  assert.equal(mektupDogrula({ baslik: 'a', metin: 'x', acilis: iso(2026, 9, 31, 9) }, SIMDI), null);
});

test('yilDonumuAcilis: bir sonraki yıl dönümü sabah 09:00', () => {
  const a = yilDonumuAcilis('2025-02-14', SIMDI);
  assert.equal(a.n, 2);
  assert.equal(a.iso, iso(2027, 1, 14, 9, 0));
  // Bugün yıl dönümü ama saat 09:00 geçti: bir sonraki yıl.
  const b = yilDonumuAcilis('2024-10-30', SIMDI);
  assert.equal(b.n, 3);
  assert.equal(b.iso, iso(2027, 9, 30, 9, 0));
  // Başlangıç gelecekte: ilk yıl dönümü.
  const c = yilDonumuAcilis('2026-12-01', SIMDI);
  assert.equal(c.n, 1);
  assert.equal(c.iso, iso(2027, 11, 1, 9, 0));
  // 29 Şubat: artık olmayan yılda 28 Şubat.
  assert.equal(yilDonumuAcilis('2024-02-29', SIMDI).iso, iso(2027, 1, 28, 9, 0));
  assert.equal(yilDonumuAcilis('yok', SIMDI), null);
});

test('hazirAcilislar: yarın sabah, 1 ay, 1 yıl ve varsa yıl dönümü', () => {
  const l = hazirAcilislar(SIMDI, '2025-02-14');
  assert.deepEqual(l.map((x) => x.ad), ['Yarın sabah', '1 ay sonra', '1 yıl sonra', '2. yıl dönümümüzde']);
  assert.equal(l[0].iso, iso(2026, 9, 31, 9, 0));
  assert.equal(l[1].iso, iso(2026, 10, 30, 9, 0));
  assert.equal(hazirAcilislar(SIMDI, null).length, 3);
});

test('girdiDegeri ve girdidenIso (datetime-local)', () => {
  assert.equal(girdiDegeri(iso(2027, 1, 14, 9, 5)), '2027-02-14T09:05');
  assert.equal(girdidenIso('2027-02-14T09:05'), iso(2027, 1, 14, 9, 5));
  assert.equal(girdidenIso(''), null);
  assert.equal(girdidenIso('saçma'), null);
});

test('bildirimMetni: kapsülde açılış tarihi, değilse başlık', () => {
  assert.equal(bildirimMetni({ baslik: 'Günaydın' }), 'Günaydın');
  assert.equal(bildirimMetni({ baslik: 'Gizli', acilis: iso(2027, 1, 14, 9, 0) }), 'Açılış: 14 Şubat 2027, 09:00');
});

test('ek: özel isimlere yönelme ve ayrılma eki', () => {
  assert.equal(ek('Gül', 'e'), "Gül'e");
  assert.equal(ek('Ömer', 'e'), "Ömer'e");
  assert.equal(ek('Ayşe', 'e'), "Ayşe'ye");
  assert.equal(ek('Ali', 'e'), "Ali'ye");
  assert.equal(ek('Can', 'e'), "Can'a");
  assert.equal(ek('Burak', 'e'), "Burak'a");
  assert.equal(ek('Gül', 'den'), "Gül'den");
  assert.equal(ek('Ömer', 'den'), "Ömer'den");
  assert.equal(ek('Ahmet', 'den'), "Ahmet'ten");
  assert.equal(ek('Can', 'den'), "Can'dan");
  assert.equal(ek('Burak', 'den'), "Burak'tan");
  assert.equal(ek('ILGAZ', 'den'), "ILGAZ'dan");
  assert.equal(ek('', 'e'), '');
});

test('kalanYazi: kilitliyse kalan süre, değilse boş', () => {
  assert.equal(kalanYazi({ acilis: iso(2026, 9, 31, 9, 0) }, SIMDI), '13 sa 0 dk');
  assert.equal(kalanYazi({}, SIMDI), '');
});

test('mektupVerisi: kırpar, kapsül yoksa acilis yazmaz', () => {
  assert.deepEqual(mektupVerisi({ baslik: ' Sana ', metin: '  satır 1\nsatır 2  ', zarf: 'erik' }, 'gul'),
    { baslik: 'Sana', metin: 'satır 1\nsatır 2', kime: 'gul', zarf: 'erik' });
  const k = mektupVerisi({ baslik: 'a', metin: 'b', zarf: '??', acilis: iso(2027, 0, 1) }, null);
  assert.equal(k.zarf, ZARFLAR[0].id);
  assert.equal(k.acilis, iso(2027, 0, 1));
  assert.equal('kime' in k, false);
  assert.equal(mektupVerisi({ baslik: 'a', metin: 'b' }, 'gul', 'omer').kimden, 'omer');
});
