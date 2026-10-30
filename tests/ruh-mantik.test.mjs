// Ruh hâli geçmişi: saf mantık (DOM yok).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  GECMIS_TURU, MOODLAR, ruhBilgisi, gecmisId, gecmisIdCoz, gecmisVerisi, gunAnahtari, ruhGunleri,
  digerKisi, takvim, haftaOzeti, haftaCumlesi, donemOzeti, gunBasligi, dagilimYazi, ayniGunSayisi, sonRuh,
} from '../sayfalar/ruh/mantik.js';
import { MOODS } from '../js/hub.js';
import { SAYFALAR } from '../js/core/games.js';
import { YEDEK_TURLERI } from '../sayfalar/ayarlar/mantik.js';

test('kayıtlar: SAYFALAR "ruh" ve yedekte "ruhgecmis"', () => {
  const s = SAYFALAR.find((x) => x.id === 'ruh');
  assert.equal(s?.path, 'sayfalar/ruh/');
  assert.ok(YEDEK_TURLERI.includes('ruhgecmis'));
});

// Yerel saatle ISO (gunAnahtari yerel takvim gününü kullanır).
const an = (gun, saat = 12) => {
  const [y, m, d] = gun.split('-').map(Number);
  return new Date(y, m - 1, d, saat).toISOString();
};
const gecmis = (gun, kim, emoji, extra = {}) => ({ id: `${gun}-${kim}`, data: { emoji, at: an(gun), ...extra } });

test('tür adı ve ruh listesi Biz sayfasıyla aynı', () => {
  assert.equal(GECMIS_TURU, 'ruhgecmis');
  assert.match(GECMIS_TURU, /^[a-z]{2,20}$/);
  assert.deepEqual(MOODLAR, MOODS);
  assert.deepEqual(ruhBilgisi('😊'), { emoji: '😊', ad: 'Mutlu' });
  assert.equal(ruhBilgisi('🦄'), null);
});

test('gecmisId ve gecmisIdCoz: <gün>-<clientId>', () => {
  const id = gecmisId('2026-10-31', 'gul-test-id');
  assert.equal(id, '2026-10-31-gul-test-id');
  assert.match(id, /^[A-Za-z0-9_-]{1,64}$/);
  assert.deepEqual(gecmisIdCoz(id), { gun: '2026-10-31', clientId: 'gul-test-id' });
  const uuid = '3f2b8c1e-9a4d-4e7f-8b2a-1c3d5e7f9a0b';
  assert.deepEqual(gecmisIdCoz(gecmisId('2026-01-05', uuid)), { gun: '2026-01-05', clientId: uuid });
  assert.equal(gecmisIdCoz('2026-13-01-x'), null);
  assert.equal(gecmisIdCoz('2026-10-31-'), null);
  assert.equal(gecmisIdCoz('gul'), null);
  assert.equal(gecmisIdCoz(null), null);
  assert.throws(() => gecmisId('31-10-2026', 'gul'));
});

test('gecmisVerisi: emoji zorunlu, not kırpılır, at ISO', () => {
  const at = '2026-10-31T09:00:00.000Z';
  assert.deepEqual(gecmisVerisi({ emoji: '😊', at }), { emoji: '😊', at });
  assert.deepEqual(gecmisVerisi({ emoji: '😊', not: '  kahve   içtik ', at }), { emoji: '😊', not: 'kahve içtik', at });
  assert.equal(gecmisVerisi({ emoji: '😊', not: 'x'.repeat(200), at }).not.length, 80);
  assert.deepEqual(gecmisVerisi({ emoji: '😊', not: '   ', at }), { emoji: '😊', at });
  assert.equal(gecmisVerisi({ emoji: '', at }), null);
  assert.equal(gecmisVerisi({ at }), null);
  assert.equal(gecmisVerisi({ emoji: '😊', at: 'dün' }), null);
  assert.equal(gecmisVerisi(null), null);
});

test('gunAnahtari: ISO → yerel gün', () => {
  assert.equal(gunAnahtari(an('2026-10-31', 23)), '2026-10-31');
  assert.equal(gunAnahtari(an('2026-11-01', 0)), '2026-11-01');
  assert.equal(gunAnahtari('bozuk'), null);
  assert.equal(gunAnahtari(undefined), null);
});

test('ruhGunleri: geçmiş belgeleri kişi ve güne dağılır; eski ruh belgesi boş günü doldurur', () => {
  const docs = [
    gecmis('2026-10-29', 'omer', '😊'),
    gecmis('2026-10-30', 'omer', '😴', { not: 'uykusuz' }),
    gecmis('2026-10-30', 'gul', '🥰'),
    { id: 'bozuk-id', data: { emoji: '😊', at: an('2026-10-30') } },
    { id: '2026-10-28-gul', data: { at: an('2026-10-28') } }, // emojisiz: atlanır
  ];
  const ruh = [
    { id: 'gul', data: { emoji: '🤩', at: an('2026-10-31', 9) } }, // geçmişte yok: eklenir
    { id: 'omer', data: { emoji: '😔', at: an('2026-10-30', 8) } }, // aynı gün, geçmişteki daha yeni: geçmiş kalır
  ];
  const g = ruhGunleri(docs, ruh);
  assert.deepEqual([...g.keys()].sort(), ['gul', 'omer']);
  assert.deepEqual([...g.get('omer').keys()].sort(), ['2026-10-29', '2026-10-30']);
  assert.equal(g.get('omer').get('2026-10-30').emoji, '😴');
  assert.equal(g.get('omer').get('2026-10-30').not, 'uykusuz');
  assert.equal(g.get('gul').get('2026-10-31').emoji, '🤩');
  assert.equal(g.get('gul').has('2026-10-28'), false);

  const g2 = ruhGunleri([gecmis('2026-10-30', 'omer', '😊')], [{ id: 'omer', data: { emoji: '😔', at: an('2026-10-30', 20) } }]);
  assert.equal(g2.get('omer').get('2026-10-30').emoji, '😔', 'aynı gün ruh belgesi daha yeniyse o kazanır');
  assert.equal(ruhGunleri([], []).size, 0);
  assert.equal(ruhGunleri(undefined, undefined).size, 0);
});

test('digerKisi: benden farklı, en son paylaşan', () => {
  const g = ruhGunleri([
    gecmis('2026-10-20', 'eski-cihaz', '😊'),
    gecmis('2026-10-30', 'gul', '🥰'),
    gecmis('2026-10-31', 'omer', '😊'),
  ], []);
  assert.equal(digerKisi(g, 'omer'), 'gul');
  assert.equal(digerKisi(g, 'gul'), 'omer');
  assert.equal(digerKisi(ruhGunleri([gecmis('2026-10-31', 'omer', '😊')], []), 'omer'), null);
});

test('takvim: Pazartesi başlar, aralık dışı ve gelecek işaretlenir', () => {
  // 31 Ekim 2026 Cumartesi.
  const t = takvim('2026-10-31', 30);
  assert.equal(t.baslangic, '2026-10-02');
  assert.equal(t.bitis, '2026-10-31');
  assert.equal(t.haftalar.length, 5);
  assert.ok(t.haftalar.every((h) => h.length === 7));
  const ilk = t.haftalar[0];
  assert.equal(ilk[0].gun, '2026-09-28'); // Pazartesi
  assert.equal(ilk[0].aralikta, false);
  assert.equal(ilk[4].gun, '2026-10-02');
  assert.equal(ilk[4].aralikta, true);
  assert.equal(ilk[4].ayBasi, true, 'aralığın ilk günü ay etiketi alır');
  const son = t.haftalar[4];
  assert.equal(son[5].gun, '2026-10-31');
  assert.equal(son[5].bugun, true);
  assert.equal(son[6].gun, '2026-11-01');
  assert.equal(son[6].gelecek, true);
  assert.equal(son[6].aralikta, false);
  const gunler = t.haftalar.flat().filter((c) => c.aralikta);
  assert.equal(gunler.length, 30);

  const u = takvim('2026-10-31', 90);
  assert.equal(u.baslangic, '2026-08-03');
  assert.equal(u.haftalar.flat().filter((c) => c.aralikta).length, 90);
  assert.equal(u.haftalar[0][0].gun, '2026-08-03', 'aralık Pazartesi başlıyorsa boşluk yok');
  const ayBaslari = u.haftalar.flat().filter((c) => c.aralikta && c.ayBasi).map((c) => c.gun);
  assert.deepEqual(ayBaslari, ['2026-08-03', '2026-09-01', '2026-10-01']);

  const pz = takvim('2026-11-01', 7); // Pazar: tam bir hafta
  assert.equal(pz.haftalar.length, 1);
  assert.equal(pz.haftalar[0][6].bugun, true);
  assert.equal(pz.haftalar.flat().some((c) => c.gelecek || !c.aralikta), false);
  const pz8 = takvim('2026-11-01', 8);
  assert.equal(pz8.haftalar.length, 2);
  assert.deepEqual(pz8.haftalar[0].map((c) => c.aralikta), [false, false, false, false, false, false, true]);
});

test('haftaOzeti: bu hafta (Pzt–Paz), baskın emoji; eşitlikte en son seçilen', () => {
  const g = ruhGunleri([
    gecmis('2026-10-25', 'gul', '😔'), // geçen hafta Pazar: sayılmaz
    gecmis('2026-10-26', 'gul', '😊'),
    gecmis('2026-10-27', 'gul', '😴'),
    gecmis('2026-10-28', 'gul', '😊'),
    gecmis('2026-10-29', 'gul', '😴'),
    gecmis('2026-10-31', 'gul', '🥰'),
  ], []).get('gul');
  const o = haftaOzeti(g, '2026-10-31');
  assert.equal(o.gunler.length, 7);
  assert.equal(o.gunler[0].gun, '2026-10-26');
  assert.equal(o.gunler[0].ruh.emoji, '😊');
  assert.equal(o.gunler[4].ruh, null);
  assert.equal(o.gunler[6].gelecek, true);
  assert.equal(o.paylasilan, 5);
  assert.equal(o.gecen, 6, 'Pazartesiden bugüne geçen gün');
  assert.equal(o.baskin, '😴', '😊 ve 😴 ikişer; 😴 daha yakın');
  assert.equal(o.baskinSayi, 2);

  const bos = haftaOzeti(undefined, '2026-10-31');
  assert.equal(bos.paylasilan, 0);
  assert.equal(bos.baskin, null);
});

test('haftaCumlesi: ben / partner, boş hafta', () => {
  const o = { baskin: '😊', baskinSayi: 3, paylasilan: 4 };
  assert.deepEqual(haftaCumlesi(o, { ben: true }), { baslik: 'Bu hafta çoğunlukla 😊', alt: 'Mutlu · 3 gün' });
  assert.deepEqual(haftaCumlesi(o, { ad: 'Gül' }), { baslik: 'Gül bu hafta çoğunlukla 😊', alt: 'Mutlu · 3 gün' });
  assert.deepEqual(haftaCumlesi({ baskin: '🦄', baskinSayi: 1, paylasilan: 1 }, { ad: 'Gül' }),
    { baslik: 'Gül bu hafta şimdilik 🦄', alt: '1 gün' });
  // Hepsi birer kez: "çoğunlukla" denmez; baskın = en son seçilen.
  assert.deepEqual(haftaCumlesi({ baskin: '🥰', baskinSayi: 1, paylasilan: 4 }, { ad: 'Gül' }),
    { baslik: 'Gül bu hafta karışık, en son 🥰', alt: '4 farklı his' });
  assert.deepEqual(haftaCumlesi({ baskin: '😊', baskinSayi: 1, paylasilan: 2 }, { ben: true }),
    { baslik: 'Bu hafta karışık, en son 😊', alt: '2 farklı his' });
  assert.deepEqual(haftaCumlesi({ baskin: null, baskinSayi: 0, paylasilan: 0 }, { ben: true }),
    { baslik: 'Bu hafta henüz paylaşmadın', alt: '' });
  assert.deepEqual(haftaCumlesi({ baskin: null, baskinSayi: 0, paylasilan: 0 }, { ad: 'Gül' }),
    { baslik: 'Gül bu hafta henüz paylaşmadı', alt: '' });
  assert.equal(haftaCumlesi({ baskin: null, paylasilan: 0 }, {}).baslik, 'Sevgilin bu hafta henüz paylaşmadı');
});

test('donemOzeti ve dagilimYazi: son N gün, çoktan aza', () => {
  const g = ruhGunleri([
    gecmis('2026-09-01', 'omer', '😔'), // aralık dışı
    gecmis('2026-10-02', 'omer', '😊'),
    gecmis('2026-10-10', 'omer', '😴'),
    gecmis('2026-10-20', 'omer', '😊'),
    gecmis('2026-10-30', 'omer', '🥰'),
    gecmis('2026-10-31', 'omer', '😴'),
  ], []).get('omer');
  const o = donemOzeti(g, '2026-10-31', 30);
  assert.equal(o.paylasilan, 5);
  assert.deepEqual(o.dagilim, [{ emoji: '😴', sayi: 2 }, { emoji: '😊', sayi: 2 }, { emoji: '🥰', sayi: 1 }]);
  assert.equal(dagilimYazi(o.dagilim), '😴 2 gün, 😊 2 gün, 🥰 1 gün');
  assert.equal(donemOzeti(g, '2026-10-31', 90).paylasilan, 6);
  assert.deepEqual(donemOzeti(undefined, '2026-10-31', 30), { paylasilan: 0, dagilim: [] });
  assert.equal(dagilimYazi([]), '');
});

test('gunBasligi: Türkçe gün adı', () => {
  assert.equal(gunBasligi('2026-10-31'), '31 Ekim Cumartesi');
  assert.equal(gunBasligi('bozuk'), '');
});

test('ayniGunSayisi: son N günde ikisinin aynı emojiyi seçtiği günler', () => {
  const g = ruhGunleri([
    gecmis('2026-10-29', 'omer', '😊'), gecmis('2026-10-29', 'gul', '😊'),
    gecmis('2026-10-30', 'omer', '😴'), gecmis('2026-10-30', 'gul', '😊'),
    gecmis('2026-10-31', 'omer', '🥰'), gecmis('2026-10-31', 'gul', '🥰'),
    gecmis('2026-08-01', 'omer', '😌'), gecmis('2026-08-01', 'gul', '😌'), // aralık dışı
  ], []);
  assert.equal(ayniGunSayisi(g.get('omer'), g.get('gul'), '2026-10-31', 30), 2);
  assert.equal(ayniGunSayisi(g.get('omer'), g.get('gul'), '2026-10-31', 120), 3);
  assert.equal(ayniGunSayisi(g.get('omer'), undefined, '2026-10-31', 30), 0);
});

test('sonRuh: en son paylaşılan gün', () => {
  const g = ruhGunleri([gecmis('2026-10-29', 'gul', '😊'), gecmis('2026-10-31', 'gul', '🥰', { not: 'sabah kahvesi' })], []).get('gul');
  assert.deepEqual(sonRuh(g), { gun: '2026-10-31', emoji: '🥰', not: 'sabah kahvesi', at: an('2026-10-31') });
  assert.equal(sonRuh(undefined), null);
  assert.equal(sonRuh(new Map()), null);
});
