import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  LISTELER, listeById, yeniOge, duzenle, sahibi, grubu, ogeler, sayac, tumSayaclar,
  ekleyen, isaretle, geriAl, isaretleyebilir, duzenleyebilir, gizliIsaret, sahibeGoster, alacakDegistir,
  yapildiMetni, bildirimZamaniMi, BILDIRIM_ARALIK, aniParametreleri, MAX_METIN, yama,
} from '../sayfalar/listeler/liste.js';

const BEN = 'omer-id';
const O = 'gul-id';
let seq = 0;
const doc = (data, { author = BEN, at } = {}) => {
  seq += 1;
  const t = at || new Date(Date.UTC(2026, 9, 1, 10, seq)).toISOString();
  return { id: `d${seq}`, data, author, deleted: false, created_at: t, updated_at: t };
};

test('beş liste, sabit sırada ve eksiksiz', () => {
  assert.deepEqual(LISTELER.map((l) => l.id), ['yapilacak', 'izlenecek', 'gidilecek', 'hediye', 'alisveris']);
  for (const l of LISTELER) {
    assert.ok(l.emoji && l.ad && l.kisa && l.ipucu && l.bos, l.id);
  }
  assert.equal(listeById('hediye').emoji, '🎁');
  assert.equal(listeById('yok'), null);
});

test('yeniOge: metni temizler, boşu ve bilinmeyen listeyi reddeder', () => {
  assert.deepEqual(yeniOge({ liste: 'izlenecek', metin: '  Babam   ve Oğlum ', not: '  ', me: BEN }),
    { data: { liste: 'izlenecek', metin: 'Babam ve Oğlum', ekleyen: BEN } });
  assert.deepEqual(yeniOge({ liste: 'alisveris', metin: 'Süt', not: ' tam yağlı \n', me: BEN }).data,
    { liste: 'alisveris', metin: 'Süt', not: 'tam yağlı', ekleyen: BEN });
  assert.ok(yeniOge({ liste: 'izlenecek', metin: '   ', me: BEN }).hata);
  assert.ok(yeniOge({ liste: 'bilinmez', metin: 'x', me: BEN }).hata);
  assert.ok(yeniOge({ liste: 'izlenecek', metin: 'a'.repeat(MAX_METIN + 1), me: BEN }).hata);
});

test('yeniOge: hediye kişiye özel (kimin = ekleyen)', () => {
  assert.deepEqual(yeniOge({ liste: 'hediye', metin: 'Kahve değirmeni', me: BEN }).data,
    { liste: 'hediye', metin: 'Kahve değirmeni', ekleyen: BEN, kimin: BEN });
  assert.equal(yeniOge({ liste: 'yapilacak', metin: 'Balon', me: BEN }).data.kimin, undefined);
});

test('duzenle: metin ve not değişir, diğer alanlar (gizli işaret dahil) korunur', () => {
  const eski = { liste: 'hediye', metin: 'Kitap', not: 'eski', kimin: BEN, alacak: O };
  assert.deepEqual(duzenle(eski, { metin: ' Roman ', not: '' }).data,
    { liste: 'hediye', metin: 'Roman', kimin: BEN, alacak: O });
  assert.ok(duzenle(eski, { metin: '' }).hata);
});

test('ekleyen: son yazan değil, ilk ekleyen (veri.js author = son yazan)', () => {
  const d = doc({ liste: 'yapilacak', metin: 'Balon', ekleyen: BEN, yapildi: '2026-10-02T10:00:00.000Z', yapan: O }, { author: O });
  assert.equal(ekleyen(d), BEN);
  assert.equal(ekleyen(doc({ liste: 'yapilacak', metin: 'Eski kayıt' }, { author: O })), O, 'eski belgede yazana düşer');
});

test('sahibi ve grubu: kimin yoksa yazan sahiptir', () => {
  const a = doc({ liste: 'hediye', metin: 'A', kimin: O }, { author: BEN });
  const b = doc({ liste: 'hediye', metin: 'B' }, { author: O });
  const c = doc({ liste: 'hediye', metin: 'C', kimin: BEN }, { author: BEN });
  assert.equal(sahibi(a), O);
  assert.equal(sahibi(b), O);
  assert.equal(grubu(a, BEN), 'o');
  assert.equal(grubu(c, BEN), 'ben');
});

test('ogeler: listeye göre süzer; yapılmayanlar üstte (yeniden eskiye), yapılanlar altta', () => {
  const eski = doc({ liste: 'izlenecek', metin: 'Eski' });
  const yeni = doc({ liste: 'izlenecek', metin: 'Yeni' });
  const bitti1 = doc({ liste: 'izlenecek', metin: 'Bitti1', yapildi: '2026-10-02T10:00:00.000Z', yapan: O });
  const bitti2 = doc({ liste: 'izlenecek', metin: 'Bitti2', yapildi: '2026-10-05T10:00:00.000Z', yapan: BEN });
  const baska = doc({ liste: 'alisveris', metin: 'Süt' });
  const docs = [eski, bitti1, yeni, baska, bitti2];
  assert.deepEqual(ogeler(docs, { liste: 'izlenecek', me: BEN }).map((d) => d.data.metin),
    ['Yeni', 'Eski', 'Bitti2', 'Bitti1']);
  assert.deepEqual(ogeler(docs, { liste: 'izlenecek', me: BEN, gizle: true }).map((d) => d.data.metin),
    ['Yeni', 'Eski']);
});

test('ogeler: hediye listesi gruba göre (benim / onun)', () => {
  const benim = doc({ liste: 'hediye', metin: 'Benim', kimin: BEN });
  const onun = doc({ liste: 'hediye', metin: 'Onun', kimin: O }, { author: O });
  assert.deepEqual(ogeler([benim, onun], { liste: 'hediye', me: BEN, grup: 'ben' }).map((d) => d.data.metin), ['Benim']);
  assert.deepEqual(ogeler([benim, onun], { liste: 'hediye', me: BEN, grup: 'o' }).map((d) => d.data.metin), ['Onun']);
  assert.deepEqual(ogeler([benim, onun], { liste: 'hediye', me: O, grup: 'ben' }).map((d) => d.data.metin), ['Onun']);
});

test('sayac ve tumSayaclar: yapılan / toplam', () => {
  const docs = [
    doc({ liste: 'yapilacak', metin: 'a' }),
    doc({ liste: 'yapilacak', metin: 'b', yapildi: '2026-10-02T10:00:00.000Z', yapan: O }),
    doc({ liste: 'alisveris', metin: 'c' }),
    doc({ liste: 'hediye', metin: 'd', kimin: BEN }),
    doc({ liste: 'hediye', metin: 'e', kimin: O, yapildi: '2026-10-03T10:00:00.000Z', yapan: O }, { author: O }),
  ];
  assert.deepEqual(sayac(docs, 'yapilacak'), { yapilan: 1, toplam: 2 });
  assert.deepEqual(sayac(docs, 'hediye', { me: BEN, grup: 'ben' }), { yapilan: 0, toplam: 1 });
  assert.deepEqual(sayac(docs, 'hediye', { me: BEN, grup: 'o' }), { yapilan: 1, toplam: 1 });
  const t = tumSayaclar(docs);
  assert.deepEqual(t.yapilacak, { yapilan: 1, toplam: 2 });
  assert.deepEqual(t.izlenecek, { yapilan: 0, toplam: 0 });
  assert.deepEqual(t.hediye, { yapilan: 1, toplam: 2 });
  assert.deepEqual(t.alisveris, { yapilan: 0, toplam: 1 });
});

test('isaretle ve geriAl: yapildi + yapan eklenir, geri alınca silinir', () => {
  const simdi = new Date('2026-10-12T09:30:00.000Z');
  const d = isaretle({ liste: 'yapilacak', metin: 'Balon' }, O, simdi);
  assert.deepEqual(d, { liste: 'yapilacak', metin: 'Balon', yapildi: '2026-10-12T09:30:00.000Z', yapan: O });
  assert.deepEqual(geriAl(d), { liste: 'yapilacak', metin: 'Balon' });
});

test('isaretleyebilir / duzenleyebilir: hediyede yalnız sahibi; diğer listelerde herkes', () => {
  const hediye = doc({ liste: 'hediye', metin: 'x', kimin: O }, { author: O });
  const ortak = doc({ liste: 'yapilacak', metin: 'y' }, { author: O });
  assert.equal(isaretleyebilir(hediye, BEN), false);
  assert.equal(isaretleyebilir(hediye, O), true);
  assert.equal(duzenleyebilir(hediye, BEN), false);
  assert.equal(isaretleyebilir(ortak, BEN), true);
  assert.equal(duzenleyebilir(ortak, BEN), true);
});

test('gizli işaret: listenin sahibine asla görünmez, partnere görünür', () => {
  const isaretli = doc({ liste: 'hediye', metin: 'Kolye', kimin: O, alacak: BEN }, { author: O });
  assert.equal(gizliIsaret(isaretli, O), null, 'sahibi görmez');
  assert.deepEqual(gizliIsaret(isaretli, BEN), { ben: true });
  const isaretsiz = doc({ liste: 'hediye', metin: 'Saat', kimin: O }, { author: O });
  assert.equal(gizliIsaret(isaretsiz, BEN), null);
  // hediye dışındaki listelerde işaret anlamsız
  assert.equal(gizliIsaret(doc({ liste: 'yapilacak', metin: 'z', alacak: BEN }), O), null);
});

test('sahibeGoster: sahibin ekranına giden veride alacak alanı yok', () => {
  const d = doc({ liste: 'hediye', metin: 'Kolye', kimin: O, alacak: BEN }, { author: O });
  assert.equal('alacak' in sahibeGoster(d, O), false);
  assert.equal(sahibeGoster(d, O).metin, 'Kolye');
  assert.equal(sahibeGoster(d, BEN).alacak, BEN);
});

test('alacakDegistir: sahibi işaretleyemez; partner açar ve kapatır', () => {
  const d = doc({ liste: 'hediye', metin: 'Kolye', kimin: O }, { author: O });
  assert.ok(alacakDegistir(d, O).hata);
  const acik = alacakDegistir(d, BEN).data;
  assert.equal(acik.alacak, BEN);
  const kapali = alacakDegistir({ ...d, data: acik }, BEN).data;
  assert.equal('alacak' in kapali, false);
  assert.ok(alacakDegistir(doc({ liste: 'yapilacak', metin: 'q' }), O).hata);
});

test('yapildiMetni: "Gül yaptı · 12 Ekim", kendin için ikinci tekil', () => {
  assert.equal(yapildiMetni('yapilacak', { ad: 'Gül' }, '12 Ekim'), 'Gül yaptı · 12 Ekim');
  assert.equal(yapildiMetni('yapilacak', { ben: true }, 'bugün'), 'Sen yaptın · bugün');
  assert.equal(yapildiMetni('izlenecek', { ad: 'Ömer' }, 'dün'), 'Ömer izledi · dün');
  assert.equal(yapildiMetni('alisveris', { ben: true }, '3 gün önce'), 'Sen aldın · 3 gün önce');
  assert.equal(yapildiMetni('hediye', { ad: 'Gül' }, '12 Ekim'), 'Hediye geldi · 12 Ekim');
  assert.equal(yapildiMetni('gidilecek', {}, '12 Ekim'), 'Sevgilin gitti · 12 Ekim');
});

test('bildirimZamaniMi: 5 dakikada en çok bir bildirim', () => {
  const t0 = Date.UTC(2026, 9, 30, 12, 0, 0);
  assert.equal(BILDIRIM_ARALIK, 5 * 60 * 1000);
  assert.equal(bildirimZamaniMi(null, t0), true);
  assert.equal(bildirimZamaniMi(t0, t0 + 4 * 60 * 1000), false);
  assert.equal(bildirimZamaniMi(t0, t0 + 5 * 60 * 1000), true);
  assert.equal(bildirimZamaniMi('bozuk', t0), true);
  assert.equal(bildirimZamaniMi(t0 + 60000, t0), false, 'saat geri giderse bekle');
});

test('aniParametreleri: başlık kısaltılır, tarih gün olarak', () => {
  assert.deepEqual(aniParametreleri('  Kapadokya balon  ', '2026-10-12'), { yeni: 1, baslik: 'Kapadokya balon', tarih: '2026-10-12' });
  assert.equal(aniParametreleri('a'.repeat(200), '2026-10-12').baslik.length, 80);
});

test('yama: yalnız verilen alanlar; olmayan alan null (silinir)', () => {
  const d = { liste: 'yapilacak', metin: 'Kahve', not: 'n', alacak: 'x' };
  assert.deepEqual(yama(isaretle(d, BEN, new Date(0)), ['yapildi', 'yapan']),
    { yapildi: '1970-01-01T00:00:00.000Z', yapan: BEN });
  assert.deepEqual(yama(geriAl({ ...d, yapildi: 'z', yapan: BEN }), ['yapildi', 'yapan']), { yapildi: null, yapan: null });
  assert.deepEqual(yama(duzenle(d, { metin: 'Çay', not: '' }).data, ['metin', 'not']), { metin: 'Çay', not: null });
  const h = { id: 'h', author: O, data: { liste: 'hediye', metin: 'Kitap', kimin: O } };
  assert.deepEqual(yama(alacakDegistir(h, BEN).data, ['alacak']), { alacak: BEN });
  assert.deepEqual(yama(alacakDegistir({ ...h, data: { ...h.data, alacak: BEN } }, BEN).data, ['alacak']), { alacak: null });
});
