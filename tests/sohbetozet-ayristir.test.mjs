// Sohbet Özetimiz: ayrıştırıcı. Örnek satırlar uydurmadır (kısa, nötr).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ayristir, ayristirParcali, icerikTuru, satirTemizle, yazanlar } from '../sayfalar/sohbet-ozeti/ayristir.js';

const yerel = (t) => [t.getFullYear(), t.getMonth() + 1, t.getDate(), t.getHours(), t.getMinutes(), t.getSeconds()];

test('Android (ABD, 12 saat): ay/gün, PM, sistem satırı atlanır, çok satırlı mesaj', () => {
  const r = ayristir([
    '4/7/25, 6:18 PM - Messages and calls are end-to-end encrypted. Tap to learn more.',
    '4/7/25, 6:18 PM - Ali: selam',
    '4/7/25, 6:20 PM - Ayşe: merhaba',
    'ikinci satır',
    '4/13/25, 12:05 AM - Ali: iyi geceler',
    '4/13/25, 12:30 PM - Ayşe: öğle',
  ].join('\n'));
  assert.equal(r.bicim, 'android');
  assert.equal(r.saniye, false);
  assert.equal(r.mesajlar.length, 4);
  assert.deepEqual(yerel(r.mesajlar[0].t), [2025, 4, 7, 18, 18, 0]);
  assert.equal(r.mesajlar[1].m, 'merhaba\nikinci satır');
  assert.deepEqual(yerel(r.mesajlar[2].t), [2025, 4, 13, 0, 5, 0]);
  assert.deepEqual(yerel(r.mesajlar[3].t), [2025, 4, 13, 12, 30, 0]);
  assert.deepEqual(r.aramalar, []);
});

test('Android 24 saat: noktalı ve eğik çizgili Türkçe biçim gün/ay', () => {
  const a = ayristir('07.04.2025 18:18 - Ali: selam\n08.04.2025 09:01 - Ayşe: günaydın');
  assert.equal(a.bicim, 'android');
  assert.deepEqual(yerel(a.mesajlar[0].t), [2025, 4, 7, 18, 18, 0]);
  const b = ayristir('07/04/2025, 18:18 - Ali: selam');
  assert.deepEqual(yerel(b.mesajlar[0].t), [2025, 4, 7, 18, 18, 0]);
});

test('Gün/ay belirsizliği dosyadaki 12\'den büyük sayıyla çözülür', () => {
  // İlk satırlar belirsiz; sonda 25 gün olduğunu gösterir.
  const r = ayristir('3/4/25, 1:00 PM - A: x\n3/25/25, 1:00 PM - A: y');
  assert.deepEqual(yerel(r.mesajlar[0].t).slice(0, 3), [2025, 3, 4]);
  const s = ayristir('03/04/2025, 13:00 - A: x\n25/04/2025, 13:00 - A: y');
  assert.deepEqual(yerel(s.mesajlar[0].t).slice(0, 3), [2025, 4, 3]);
  const u = ayristir('04/13/2025, 13:00 - A: y\n03/04/2025, 13:00 - A: x');
  assert.deepEqual(yerel(u.mesajlar[1].t).slice(0, 3), [2025, 3, 4]);
});

test('iPhone: saniye, arama satırı, görünmez karakterler', () => {
  const r = ayristir([
    '‎[8/9/26, 3:57:40 PM] Ali: selam',
    '[8/9/26, 8:06:14 PM] - [Call]',
    '[8/9/26, 8:10:00 PM] Ayşe: ‎Missed voice call',
    '[8/9/26, 8:11:05 PM] Ayşe: ‎image omitted',
  ].join('\r\n'));
  assert.equal(r.bicim, 'ios');
  assert.equal(r.saniye, true);
  assert.equal(r.mesajlar.length, 2);
  assert.deepEqual(yerel(r.mesajlar[0].t), [2026, 8, 9, 15, 57, 40]);
  assert.equal(r.aramalar.length, 2);
  assert.equal(r.mesajlar[1].m, 'image omitted');
});

test('Türkçe iPhone: [9.08.2026 15:57:40]', () => {
  const r = ayristir('[9.08.2026 15:57:40] Ali: selam\n[10.08.2026 08:00:01] Ayşe: günaydın');
  assert.equal(r.bicim, 'ios');
  assert.deepEqual(yerel(r.mesajlar[0].t), [2026, 8, 9, 15, 57, 40]);
});

test('Düzenlendi eki atılır; satirTemizle dar boşluğu düzeltir', () => {
  const r = ayristir('07.04.2025 18:18 - Ali: tamam <This message was edited>\n07.04.2025 18:19 - Ali: olur <Bu mesaj düzenlendi>');
  assert.equal(r.mesajlar[0].m, 'tamam');
  assert.equal(r.mesajlar[1].m, 'olur');
  assert.equal(satirTemizle('a b‎c'), 'a bc');
});

test('icerikTuru: medya türleri, silinen, metin', () => {
  const t = (m) => icerikTuru(m);
  assert.deepEqual(t('<Media omitted>'), { tur: 'medya', medya: 'medya' });
  assert.deepEqual(t('<Medya dahil edilmedi>'), { tur: 'medya', medya: 'medya' });
  assert.equal(t('<sticker omitted>').medya, 'cikartma');
  assert.equal(t('<çıkartma dahil edilmedi>').medya, 'cikartma');
  assert.equal(t('<image omitted>').medya, 'foto');
  assert.equal(t('görüntü dahil edilmedi').medya, 'foto');
  assert.equal(t('<voice message omitted>').medya, 'ses');
  assert.equal(t('<View once voice message omitted>').medya, 'ses');
  assert.equal(t('<audio omitted>').medya, 'ses');
  assert.equal(t('<video omitted>').medya, 'video');
  assert.equal(t('<video message omitted>').medya, 'not');
  assert.equal(t('<Video note omitted>').medya, 'not');
  assert.equal(t('<GIF omitted>').medya, 'gif');
  assert.equal(t('<document omitted>').medya, 'belge');
  assert.equal(t('<album message>').medya, 'foto');
  assert.equal(t('live location shared').medya, 'konum');
  assert.equal(t('null').tur, 'medya');
  assert.equal(t('This message was deleted').tur, 'silinen');
  assert.equal(t('Bu mesajı sildiniz').tur, 'silinen');
  assert.equal(t('You deleted this message').tur, 'silinen');
  assert.equal(t('Bu mesaj silindi').tur, 'silinen');
  assert.equal(t('bugün film izleyelim mi').tur, 'metin');
});

test('ayristirParcali: aynı sonuç, ilerleme 1\'e ulaşır', async () => {
  const satirlar = [];
  for (let i = 0; i < 50; i++) satirlar.push(`07.04.2025 18:${String(i).padStart(2, '0')} - ${i % 2 ? 'A' : 'B'}: m${i}`);
  const metin = satirlar.join('\n');
  const oranlar = [];
  const r = await ayristirParcali(metin, { parca: 7, ilerleme: (o) => oranlar.push(o), bekle: async () => {} });
  assert.equal(r.mesajlar.length, 50);
  assert.equal(oranlar.at(-1), 1);
  assert.ok(oranlar.length >= 7);
  assert.deepEqual(r.mesajlar.map((x) => x.m), ayristir(metin).mesajlar.map((x) => x.m));
});

test('yazanlar: çoktan aza; tanınmayan metin boş sonuç verir', () => {
  const r = ayristir('07.04.2025 18:18 - A: x\n07.04.2025 18:19 - B: y\n07.04.2025 18:20 - B: z\n07.04.2025 18:21 - C: w');
  assert.deepEqual(yazanlar(r.mesajlar), [{ ad: 'B', n: 2 }, { ad: 'A', n: 1 }, { ad: 'C', n: 1 }]);
  const bos = ayristir('rastgele bir metin\nbaşka satır');
  assert.equal(bos.bicim, null);
  assert.equal(bos.mesajlar.length, 0);
});

test('Hız: 120.000 satır 3 sn\'den kısa sürer', () => {
  const satirlar = [];
  const bas = new Date(2024, 0, 1).getTime();
  for (let i = 0; i < 120000; i++) {
    const t = new Date(bas + i * 4 * 60e3);
    const s = `${t.getDate()}.${t.getMonth() + 1}.${t.getFullYear()} ${t.getHours()}:${String(t.getMinutes()).padStart(2, '0')}`;
    satirlar.push(`${s} - ${i % 3 ? 'Ali' : 'Ayşe'}: bugün hava güzel mi acaba ${i}`);
  }
  const t0 = performance.now();
  const r = ayristir(satirlar.join('\n'));
  const sure = performance.now() - t0;
  assert.equal(r.mesajlar.length, 120000);
  assert.ok(sure < 3000, `süre ${sure} ms`);
});
