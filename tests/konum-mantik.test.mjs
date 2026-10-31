// Konum: belge biçimi, okuma, yazım kararı, canlı süre, metinler (saf mantık).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  TUR, SURESIZ, CANLI_SURELER, yuvarla2, yuvarla, konumVerisi, konumOku, paylasiyor, kapaliVeri,
  canliBitis, canliAcik, canliMi, canliBitti, canliDusur, paylasiyorMu, yerKisa, canliKalanMetni, yazilsinMi, acilistaGuncellensinMi,
  mesafeKm, mesafeMetni, mesafeYazi, tazelikMetni, pilVerisi, pilMetni, durumEtiketi, yolTarifiUrl,
  yerAnahtari, nominatimUrl, yerAdi, sorBekleme, sorBildirimi, konumSecenek, KONUM_SECENEK, renkGecerli,
} from '../sayfalar/konum/mantik.js';
import { SAYFALAR } from '../js/core/games.js';
import { DAHA_GRUPLARI } from '../sayfalar/daha/mantik.js';
import { YEDEK_TURLERI } from '../sayfalar/ayarlar/mantik.js';

const T0 = new Date('2026-10-30T10:00:00Z');
const at = (ms) => new Date(T0.getTime() + ms).toISOString();
const DK = 60000;
const SAAT = 60 * DK;

test('kayıtlar: SAYFALAR "konum", Daha › Biz grubunun sonunda, yedekte "konum"', () => {
  const s = SAYFALAR.find((x) => x.id === 'konum');
  assert.deepEqual(s, { id: 'konum', title: 'Konum', icon: '📍', path: 'sayfalar/konum/', desc: 'Neredesin? Canlı konum ve aranızdaki mesafe.' });
  assert.equal(DAHA_GRUPLARI.find((g) => g.id === 'biz').uyeler.at(-1), 'konum');
  assert.ok(YEDEK_TURLERI.includes(TUR));
});

// ---------- Ayarlar'dan taşınanlar (eski davranış aynı) ----------
test('konum: 2 ondalık, geçersiz koordinat reddedilir', () => {
  assert.equal(yuvarla2(41.00823), 41.01);
  assert.equal(yuvarla2(-28.97849), -28.98);
  const v = konumVerisi({ latitude: 41.00823, longitude: 28.97836 }, new Date('2026-10-30T10:00:00Z'));
  assert.deepEqual(v, { lat: 41.01, lng: 28.98, at: '2026-10-30T10:00:00.000Z' });
  assert.equal(konumVerisi({ latitude: 91, longitude: 0 }), null);
  assert.equal(konumVerisi({ latitude: NaN, longitude: 0 }), null);
  assert.equal(konumVerisi(null), null);
});

test('mesafeKm ve mesafeMetni', () => {
  const ist = { lat: 41.01, lng: 28.98 };
  const ank = { lat: 39.93, lng: 32.86 };
  const km = mesafeKm(ist, ank);
  assert.ok(km > 345 && km < 355, String(km));
  assert.equal(mesafeKm(ist, ist), 0);
  assert.equal(mesafeKm(ist, { lat: 'x' }), null);
  assert.equal(mesafeMetni(0.4), 'Yan yanasınız');
  assert.equal(mesafeMetni(3.44), 'Aranızda yaklaşık 3,4 km var');
  assert.equal(mesafeMetni(1234.4), 'Aranızda yaklaşık 1.234 km var');
  assert.equal(mesafeMetni(null), '');
});

// ---------- Hassasiyet ve belge ----------
test('hassasiyet yuvarlama: yaklaşık 2, tam 5 ondalık', () => {
  assert.equal(yuvarla(41.008234567, 'yaklasik'), 41.01);
  assert.equal(yuvarla(41.008234567, 'tam'), 41.00823);
  assert.equal(yuvarla(-28.978369, 'tam'), -28.97837);
  assert.equal(yuvarla(41.008234567, 'bilinmeyen'), 41.01);
  assert.ok(!Object.is(yuvarla(-0.001, 'yaklasik'), -0)); // -0 yazılmasın
});

test('konumVerisi ek alanlarla: tam doğruluk, yer, pil, canlı; yaklaşıkta doğruluk yok', () => {
  const coords = { latitude: 41.008234567, longitude: 28.978369, accuracy: 12.6 };
  const tam = konumVerisi(coords, T0, { hassas: 'tam', yer: '  Kadıköy, İstanbul ', pil: 64, sarj: true, canli: SURESIZ });
  assert.deepEqual(tam, {
    lat: 41.00823, lng: 28.97837, hassas: 'tam', dogruluk: 13, yer: 'Kadıköy, İstanbul', pil: 64, sarj: true,
    canli: SURESIZ, at: T0.toISOString(),
  });
  const yak = konumVerisi(coords, T0, { hassas: 'yaklasik', yer: '', pil: null });
  assert.deepEqual(yak, { lat: 41.01, lng: 28.98, hassas: 'yaklasik', at: T0.toISOString() });
  // pil sınırları ve geçersiz canlı
  const p = konumVerisi(coords, T0, { hassas: 'yaklasik', pil: 140, sarj: 'evet', canli: 'yarın' });
  assert.equal(p.pil, undefined);
  assert.equal(p.sarj, undefined);
  assert.equal(p.canli, undefined);
});

test('kapali okuma: { kapali, at } paylaşmıyor sayılır; eski belge yaklaşık', () => {
  assert.deepEqual(kapaliVeri(T0), { kapali: true, at: T0.toISOString() });
  const k = konumOku({ kapali: true, at: T0.toISOString() });
  assert.deepEqual(k, { kapali: true, at: T0.toISOString() });
  assert.equal(paylasiyor(k), false);
  // kapali bayrağı koordinatı ezer
  assert.equal(paylasiyor(konumOku({ kapali: true, lat: 41, lng: 29, at: T0.toISOString() })), false);
  assert.equal(konumOku(null), null);
  assert.equal(konumOku({}), null);
  assert.equal(konumOku({ lat: 'x', lng: 1 }), null);
  assert.equal(paylasiyor(null), false);
  const eski = konumOku({ lat: 41.01, lng: 28.98, sehir: 'İstanbul', at: T0.toISOString() });
  assert.deepEqual(eski, { lat: 41.01, lng: 28.98, hassas: 'yaklasik', yer: 'İstanbul', at: T0.toISOString() });
  assert.equal(paylasiyor(eski), true);
  // yaklaşık belgede gelen doğruluk yok sayılır; bozuk alanlar atılır
  const y = konumOku({ lat: 41.01, lng: 28.98, hassas: 'yaklasik', dogruluk: 5, pil: -3, sarj: 1, canli: 7, at: 'x' });
  assert.deepEqual(y, { lat: 41.01, lng: 28.98, hassas: 'yaklasik', at: null });
  const t = konumOku({ lat: 41.00823, lng: 28.97837, hassas: 'tam', dogruluk: 13, pil: 64, sarj: false, at: T0.toISOString() });
  assert.equal(t.dogruluk, 13);
  assert.equal(t.sarj, false);
});

test('durumEtiketi: Kapalı / Yaklaşık / Tam / Canlı', () => {
  const s = T0.getTime();
  assert.equal(durumEtiketi(null, s), 'Kapalı');
  assert.equal(durumEtiketi(konumOku({ kapali: true, at: at(0) }), s), 'Kapalı');
  assert.equal(durumEtiketi(konumOku({ lat: 1, lng: 2, at: at(0) }), s), 'Yaklaşık');
  assert.equal(durumEtiketi(konumOku({ lat: 1, lng: 2, hassas: 'tam', at: at(0) }), s), 'Tam');
  assert.equal(durumEtiketi(konumOku({ lat: 1, lng: 2, hassas: 'tam', canli: at(SAAT), at: at(0) }), s), 'Canlı');
  assert.equal(durumEtiketi(konumOku({ lat: 1, lng: 2, hassas: 'tam', canli: at(-1), at: at(0) }), s), 'Tam');
});

// ---------- Canlı süre ----------
test('canliBitis: 1 saat, 8 saat, ben kapatana dek', () => {
  assert.deepEqual(CANLI_SURELER.map((x) => x.ad), ['1 saat', '8 saat', 'Ben kapatana dek']);
  assert.equal(canliBitis('1s', T0), at(SAAT));
  assert.equal(canliBitis('8s', T0), at(8 * SAAT));
  assert.equal(canliBitis('surekli', T0), '9999-12-31T00:00:00Z');
  assert.equal(SURESIZ, '9999-12-31T00:00:00Z');
  assert.equal(canliBitis('bilinmeyen', T0), at(SAAT));
});

test('süre bitişi: canliAcik, canliBitti, canliDusur son konumu korur', () => {
  const s = T0.getTime();
  const d = { lat: 41.01, lng: 28.98, hassas: 'yaklasik', yer: 'Kadıköy, İstanbul', canli: at(30 * DK), at: at(0) };
  assert.equal(canliAcik(konumOku(d), s), true);
  assert.equal(canliBitti(konumOku(d), s), false);
  assert.equal(canliAcik(konumOku(d), s + 30 * DK), false);
  assert.equal(canliBitti(konumOku(d), s + 30 * DK), true);
  assert.equal(canliBitti(konumOku({ ...d, canli: undefined }), s), false);
  assert.equal(canliAcik(konumOku({ kapali: true, at: at(0) }), s), false);
  assert.equal(canliAcik(konumOku({ ...d, canli: SURESIZ }), s + 1e12), true);
  const dus = canliDusur(d);
  assert.equal('canli' in dus, false);
  assert.equal(dus.lat, 41.01);
  assert.equal(dus.yer, 'Kadıköy, İstanbul');
  assert.equal(d.canli, at(30 * DK)); // girdi değişmez
});

test('canliMi (rozet): bitiş gelecekte ve son kayıt taze; ham veri ya da okunmuş veri', () => {
  const s = T0.getTime();
  const d = { lat: 1, lng: 2, canli: at(8 * SAAT), at: at(0) };
  assert.equal(canliMi(d, s + 2 * DK), true);
  assert.equal(canliMi(konumOku(d), s + 2 * DK), true);
  assert.equal(canliMi(d, s + 5 * DK), false, 'uygulaması kapanmış: rozet söner');
  assert.equal(canliMi({ lat: 1, lng: 2, at: at(0) }, s), false);
  assert.equal(canliMi({ ...d, canli: at(-1) }, s), false, 'süre dolmuş');
  assert.equal(canliMi({ kapali: true, canli: at(SAAT), at: at(0) }, s), false);
  assert.equal(canliMi(null, s), false);
});

test('paylasiyorMu ve yerKisa: belge ya da veri; kapalı ve silinmiş paylaşmıyor', () => {
  const v = { lat: 41.01, lng: 28.98, hassas: 'yaklasik', yer: 'Kadıköy, İstanbul', at: at(0) };
  assert.equal(paylasiyorMu(v), true);
  assert.equal(paylasiyorMu({ id: 'a', data: v, deleted: false }), true);
  assert.equal(paylasiyorMu({ id: 'a', data: v, deleted: true }), false);
  assert.equal(paylasiyorMu({ kapali: true, at: at(0) }), false);
  assert.equal(paylasiyorMu({ id: 'a', data: { kapali: true, at: at(0) } }), false);
  assert.equal(paylasiyorMu({ lat: 'x', lng: 2 }), false);
  assert.equal(paylasiyorMu(null), false);
  assert.equal(yerKisa(v), 'Kadıköy, İstanbul');
  assert.equal(yerKisa({ lat: 1, lng: 2, sehir: 'Ankara' }), 'Ankara');
  assert.equal(yerKisa({ lat: 1, lng: 2 }), '');
  assert.equal(yerKisa({ kapali: true, yer: 'Kadıköy', at: at(0) }), '');
  assert.equal(yerKisa(null), '');
});

test('canliKalanMetni', () => {
  const s = T0.getTime();
  assert.equal(canliKalanMetni(konumOku({ lat: 1, lng: 2, canli: at(80 * DK), at: at(0) }), s), '1 saat 20 dk kaldı');
  assert.equal(canliKalanMetni(konumOku({ lat: 1, lng: 2, canli: at(2 * SAAT), at: at(0) }), s), '2 saat kaldı');
  assert.equal(canliKalanMetni(konumOku({ lat: 1, lng: 2, canli: at(30 * 1000), at: at(0) }), s), '1 dk kaldı');
  assert.equal(canliKalanMetni(konumOku({ lat: 1, lng: 2, canli: SURESIZ, at: at(0) }), s), 'Sen kapatana dek');
  assert.equal(canliKalanMetni(konumOku({ lat: 1, lng: 2, at: at(0) }), s), '');
});

// ---------- Yazım kararı ----------
test('yazilsinMi: ilk kayıt ve kapalıdan sonra hemen yazar', () => {
  const yeni = konumVerisi({ latitude: 41, longitude: 29 }, T0, { hassas: 'tam' });
  assert.equal(yazilsinMi(null, yeni, T0.getTime()), true);
  assert.equal(yazilsinMi({ kapali: true, at: at(0) }, yeni, T0.getTime()), true);
  assert.equal(yazilsinMi({ lat: 41, lng: 29 }, null, T0.getTime()), false);
});

test('yazilsinMi: en çok dakikada 1; 50 m altı ve 3 dk altıysa yazmaz', () => {
  const s = T0.getTime();
  const once = { lat: 41.00000, lng: 29.00000, hassas: 'tam', at: at(0) };
  const uzak = konumVerisi({ latitude: 41.01, longitude: 29 }, T0, { hassas: 'tam' }); // ~1,1 km
  const yakin = konumVerisi({ latitude: 41.0002, longitude: 29 }, T0, { hassas: 'tam' }); // ~22 m
  assert.equal(yazilsinMi(once, uzak, s + 30 * 1000), false, 'dakika dolmadı');
  assert.equal(yazilsinMi(once, uzak, s + 61 * 1000), true);
  assert.equal(yazilsinMi(once, yakin, s + 2 * DK), false, 'az hareket, kayıt taze');
  assert.equal(yazilsinMi(once, yakin, s + 3 * DK + 1000), true, 'kayıt bayatladı');
  // hassasiyet değiştiyse dakika dolunca yazar
  const yak = konumVerisi({ latitude: 41.0002, longitude: 29 }, T0, { hassas: 'yaklasik' });
  assert.equal(yazilsinMi(once, yak, s + 61 * 1000), true);
  // tarihi bozuk ya da ileride olan kayıt yazımı kilitlemez
  assert.equal(yazilsinMi({ ...once, at: 'bozuk' }, yakin, s), true);
  assert.equal(yazilsinMi({ ...once, at: at(10 * DK) }, yakin, s), true);
});

test('acilistaGuncellensinMi: paylaşım açık ve kayıt 10 dakikadan eski', () => {
  const s = T0.getTime();
  assert.equal(acilistaGuncellensinMi(konumOku({ lat: 1, lng: 2, at: at(-11 * DK) }), s), true);
  assert.equal(acilistaGuncellensinMi(konumOku({ lat: 1, lng: 2, at: at(-9 * DK) }), s), false);
  assert.equal(acilistaGuncellensinMi(konumOku({ kapali: true, at: at(-SAAT) }), s), false);
  assert.equal(acilistaGuncellensinMi(null, s), false);
  assert.equal(acilistaGuncellensinMi(konumOku({ lat: 1, lng: 2 }), s), true); // tarihsiz eski belge
});

// ---------- Metinler ----------
test('mesafeYazi: büyük mesafe ve "Yan yanasınız"', () => {
  assert.deepEqual(mesafeYazi(12.43), { yakin: false, sayi: '12,4', birim: 'km', metin: 'Aranızda 12,4 km' });
  assert.equal(mesafeYazi(1234.4).metin, 'Aranızda 1.234 km');
  assert.deepEqual(mesafeYazi(0.9), { yakin: true, sayi: '', birim: '', metin: 'Yan yanasınız' });
  // ikisi de tam: metre ve daha küçük yakınlık eşiği
  assert.equal(mesafeYazi(0.9, { tam: true }).metin, 'Aranızda 900 m');
  assert.equal(mesafeYazi(0.344, { tam: true }).metin, 'Aranızda 340 m');
  assert.equal(mesafeYazi(0.02, { tam: true }).metin, 'Yan yanasınız');
  assert.equal(mesafeYazi(null), null);
});

test('tazelikMetni: şimdi / 5 dk önce / 3 saat önce / dün', () => {
  const s = new Date('2026-10-30T12:00:00Z');
  assert.equal(tazelikMetni('2026-10-30T11:59:20Z', s), 'şimdi');
  assert.equal(tazelikMetni('2026-10-30T12:00:30Z', s), 'şimdi'); // saat farkı
  assert.equal(tazelikMetni('2026-10-30T11:55:00Z', s), '5 dk önce');
  assert.equal(tazelikMetni('2026-10-30T09:00:00Z', s), '3 saat önce');
  assert.equal(tazelikMetni('2026-10-29T08:00:00Z', s), 'dün');
  assert.equal(tazelikMetni(null, s), '');
});

test('pil: getBattery → yüzde ve şarj; metin', () => {
  assert.deepEqual(pilVerisi({ level: 0.643, charging: true }), { pil: 64, sarj: true });
  assert.deepEqual(pilVerisi({ level: 1, charging: false }), { pil: 100, sarj: false });
  assert.equal(pilVerisi({ level: NaN }), null);
  assert.equal(pilVerisi(null), null);
  assert.equal(pilMetni({ pil: 64, sarj: true }), '%64 · şarjda');
  assert.equal(pilMetni({ pil: 8 }), '%8');
  assert.equal(pilMetni({}), '');
});

test('yol tarifi URL\'si yalnız tam konumda', () => {
  const t = konumOku({ lat: 41.00823, lng: 28.97837, hassas: 'tam', at: at(0) });
  assert.equal(yolTarifiUrl(t), 'https://www.google.com/maps/dir/?api=1&destination=41.00823,28.97837');
  assert.equal(yolTarifiUrl(konumOku({ lat: 41.01, lng: 28.98, at: at(0) })), null);
  assert.equal(yolTarifiUrl(konumOku({ kapali: true, at: at(0) })), null);
  assert.equal(yolTarifiUrl(null), null);
});

test('yer adı: anahtar, Nominatim adresi, ilçe + şehir', () => {
  assert.equal(yerAnahtari(41.01, 28.98), '41.010,28.980');
  assert.equal(yerAnahtari(41.008234, 28.978369), '41.008,28.978');
  assert.equal(nominatimUrl(41.008234, 28.978369),
    'https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=14&accept-language=tr&lat=41.008&lon=28.978');
  assert.equal(yerAdi({ address: { suburb: 'Caferağa Mahallesi', town: 'Kadıköy', province: 'İstanbul', country: 'Türkiye' } }), 'Kadıköy, İstanbul');
  assert.equal(yerAdi({ address: { city_district: 'Çankaya', city: 'Ankara' } }), 'Çankaya, Ankara');
  assert.equal(yerAdi({ address: { city: 'İzmir', province: 'İzmir' } }), 'İzmir');
  assert.equal(yerAdi({ address: { suburb: 'Moda', state: 'İstanbul' } }), 'Moda, İstanbul');
  assert.equal(yerAdi({ name: 'Ege Denizi', address: {} }), 'Ege Denizi');
  assert.equal(yerAdi({ error: 'Unable to geocode' }), null);
  assert.equal(yerAdi(null), null);
  assert.ok(yerAdi({ address: { town: 'x'.repeat(200) } }).length <= 80);
});

test('Konumunu sor: 10 dakikada bir; bildirim metni', () => {
  const s = T0.getTime();
  assert.equal(sorBekleme(null, s), 0);
  assert.equal(sorBekleme(at(-4 * DK), s), 6 * DK);
  assert.equal(sorBekleme(at(-11 * DK), s), 0);
  assert.equal(sorBekleme(at(30 * DK), s), 10 * DK); // ileri tarih: en çok 10 dk
  assert.deepEqual(sorBildirimi('Tırtıl'), { baslik: 'Biz İkimiz', metin: 'Tırtıl nerede olduğunu merak ediyor 📍' });
  assert.equal(sorBildirimi('').metin, 'Sevgilin nerede olduğunu merak ediyor 📍');
});

test('konumSecenek: yaklaşık tek sefer eski seçenek; tam ve canlı yüksek doğruluk', () => {
  assert.deepEqual(konumSecenek('yaklasik'), KONUM_SECENEK);
  assert.equal(konumSecenek('tam').enableHighAccuracy, true);
  assert.equal(konumSecenek('tam', { canli: true }).enableHighAccuracy, true);
  assert.equal(konumSecenek('yaklasik', { canli: true }).enableHighAccuracy, false);
  assert.ok(konumSecenek('yaklasik', { canli: true }).maximumAge <= 60000);
});

test('renkGecerli: yalnız #RRGGBB', () => {
  assert.equal(renkGecerli('#C2375C'), '#C2375C');
  assert.equal(renkGecerli('red; background:url(x)'), null);
  assert.equal(renkGecerli(null), null);
});
