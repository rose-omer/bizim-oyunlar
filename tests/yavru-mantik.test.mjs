// Yavrumuz: saf mantık (sayfalar/yavru/mantik.js). DOM yok.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  TUR, BAKIM_TUR, BELGE_ID, DK, SAAT, GUN, IHTIYACLAR, EYLEMLER,
  renkSec, yeniYumurta, oku, ihtiyacDegeri, ihtiyaclar, uyuyorMu, ruhHali, ozledi, durumMetni,
  kalanBekleme, eylemYap, isitmaSayisi, isit, yumurtaDurumu, catlamaHazir, catlamaYamasi,
  buyumeDurumu, buyumeYamasi, adTemizle, yasMetni, kalanMetni, saatKalanMetni,
  acikmaZamani, hatirlaticiOlaylari, bildirimGerekli, bildirimMetni, bakimSatiri, dogumBirlestir,
} from '../sayfalar/yavru/mantik.js';
import { applyPatch, KIND_RE, ID_RE } from '../js/core/veri.js';

const A = 'omer-test-id';
const B = 'gul-test-id';
const T0 = Date.UTC(2026, 9, 30, 9, 0, 0); // 30 Ekim 2026 09:00Z (İstanbul 12:00)
const iso = (ms) => new Date(ms).toISOString();
const sonra = (dk) => T0 + dk * DK;
const kayit = (v, ms = T0) => ({ v, t: iso(ms) });

/** Çatlamış (küçük) yavru: ihtiyaçlar T0'da verilir. */
function kucuk(ihtiyac = {}, ek = {}) {
  return oku({
    asama: 'kucuk', ad: 'Pamuk', renk: 3, dogum: iso(T0 - 2 * GUN), catlama: iso(T0 - GUN),
    ihtiyac: {
      tokluk: kayit(ihtiyac.tokluk ?? 50), mutluluk: kayit(ihtiyac.mutluluk ?? 50),
      temizlik: kayit(ihtiyac.temizlik ?? 50), enerji: kayit(ihtiyac.enerji ?? 50),
    },
    uyku: null, puan: {}, isitma: {}, son: {},
    ...ek,
  });
}

/** Yamayı belgeye uygular (veri.js applyPatch: sunucudaki doc_patch kuralı). */
const uygula = (y, yama) => oku(applyPatch(y, yama));

test('türler ve belge kimliği veri.js kurallarına uyar', () => {
  assert.match(TUR, KIND_RE);
  assert.match(BAKIM_TUR, KIND_RE);
  assert.match(BELGE_ID, ID_RE);
  assert.deepEqual(IHTIYACLAR, ['tokluk', 'mutluluk', 'temizlik', 'enerji']);
});

test('renkSec: oda kimliğinden tohumlu, kararlı, 1–6', () => {
  assert.equal(renkSec('testpaka23'), renkSec('testpaka23'));
  const gorulen = new Set();
  for (let i = 0; i < 200; i++) {
    const r = renkSec(`oda${i}xyzab`);
    assert.ok(Number.isInteger(r) && r >= 1 && r <= 6, `${i} -> ${r}`);
    gorulen.add(r);
  }
  assert.equal(gorulen.size, 6, 'altı rengin hepsi çıkar');
  assert.ok(renkSec('') >= 1 && renkSec(null) <= 6);
});

test('yeniYumurta ve oku: varsayılanlar, bozuk alanlar düzelir', () => {
  const y = yeniYumurta({ roomId: 'testpaka23', simdi: T0 });
  assert.deepEqual(y, {
    asama: 'yumurta', ad: '', renk: renkSec('testpaka23'), dogum: iso(T0),
    uyku: null, puan: {}, isitma: {}, son: {},
  });
  const o = oku({ asama: 'uzay', ad: 5, renk: 99, ihtiyac: 'x', puan: [], isitma: { a: 'x', b: [iso(T0), 3] }, uyku: { bas: 'x' } });
  assert.equal(o.asama, 'yumurta');
  assert.equal(o.ad, '');
  assert.equal(o.renk, 1);
  assert.equal(o.uyku, null);
  assert.deepEqual(o.puan, {});
  assert.deepEqual(o.isitma, { a: [], b: [iso(T0)] });
  assert.deepEqual(Object.keys(o.ihtiyac), IHTIYACLAR);
  assert.deepEqual(oku(null).son, {});
});

test('ihtiyacDegeri: saatlik düşüş, 0–100 kırpma, gelecek zaman', () => {
  assert.equal(ihtiyacDegeri(kayit(80), 'tokluk', null, sonra(5 * 60)), 60); // 4/sa
  assert.equal(ihtiyacDegeri(kayit(80), 'mutluluk', null, sonra(120)), 74); // 3/sa
  assert.equal(ihtiyacDegeri(kayit(80), 'temizlik', null, sonra(90)), 77); // 2/sa
  assert.equal(ihtiyacDegeri(kayit(80), 'enerji', null, sonra(60)), 77); // 3/sa
  assert.equal(ihtiyacDegeri(kayit(10), 'tokluk', null, sonra(10 * 60)), 0, 'alt sınır');
  assert.equal(ihtiyacDegeri(kayit(140), 'tokluk', null, T0), 100, 'üst sınır');
  assert.equal(ihtiyacDegeri(kayit(70, sonra(30)), 'tokluk', null, T0), 70, 'saat farkı: gelecekteki kayıt düşmez');
  assert.equal(ihtiyacDegeri(null, 'tokluk', null, T0), 0);
  assert.equal(ihtiyacDegeri({ v: 'x', t: 'y' }, 'tokluk', null, T0), 0);
});

test('ihtiyacDegeri: uyku aralığı ayrı işlenir (enerji +12/sa, diğerleri yarı hız), sırayla kırpılır', () => {
  const uyku = { bas: iso(sonra(60)), bit: iso(sonra(9 * 60)) };
  const simdi = sonra(10 * 60);
  // tokluk: 1 sa uyanık (4) + 8 sa uyku (16) + 1 sa uyanık (4)
  assert.equal(ihtiyacDegeri(kayit(80), 'tokluk', uyku, simdi), 56);
  // enerji: 50 → 47 → +96 (100'de kırpılır) → 97
  assert.equal(ihtiyacDegeri(kayit(50), 'enerji', uyku, simdi), 97);
  // uyku sürerken: 3 sa uykuda
  assert.equal(ihtiyacDegeri(kayit(20, sonra(60)), 'enerji', uyku, sonra(4 * 60)), 56);
  assert.equal(ihtiyacDegeri(kayit(60, sonra(60)), 'temizlik', uyku, sonra(4 * 60)), 57);
  // kayıt uykudan sonra: uyku etkisiz
  assert.equal(ihtiyacDegeri(kayit(60, sonra(10 * 60)), 'enerji', uyku, sonra(11 * 60)), 57);
  assert.equal(uyuyorMu(uyku, sonra(2 * 60)), true);
  assert.equal(uyuyorMu(uyku, sonra(9 * 60)), false, '8 saat sonra kendiliğinden biter');
  assert.equal(uyuyorMu(uyku, T0), false);
  assert.equal(uyuyorMu(null, T0), false);
});

test('eylemYap: besle etkisi, puan, kişi başına bekleme', () => {
  const y = kucuk({ tokluk: 40 });
  const r = eylemYap(y, { eylem: 'mama', kim: A, simdi: T0 });
  assert.equal(r.hata, undefined);
  assert.equal(r.puan, true);
  assert.deepEqual(r.yama, {
    'ihtiyac.tokluk': { v: 70, t: iso(T0) },
    [`son.${A}`]: { mama: iso(T0) },
    [`puan.${A}`]: 1,
  });
  assert.deepEqual(r.kayit, { eylem: 'mama', kim: A, at: iso(T0) });
  // Tüm anahtarlar en çok iki düzey (veri.js patch kuralı).
  assert.doesNotThrow(() => applyPatch({}, r.yama));
  const y2 = uygula(y, r.yama);
  assert.equal(Math.round(ihtiyaclar(y2, T0).tokluk), 70);

  const erken = eylemYap(y2, { eylem: 'mama', kim: A, simdi: sonra(5) });
  assert.equal(erken.hata, 'bekle');
  assert.equal(erken.kalan, 15 * DK);
  assert.equal(kalanBekleme(y2, A, 'mama', sonra(5)), 15 * DK);
  assert.equal(kalanBekleme(y2, B, 'mama', sonra(5)), 0, 'bekleme kişi başına');
  assert.equal(eylemYap(y2, { eylem: 'mama', kim: B, simdi: sonra(5) }).hata, undefined);
  assert.equal(eylemYap(y2, { eylem: 'meyve', kim: A, simdi: sonra(5) }).hata, undefined, 'her yiyeceğin kendi beklemesi');
  assert.equal(eylemYap(y2, { eylem: 'mama', kim: A, simdi: sonra(20) }).hata, undefined);

  const meyve = eylemYap(kucuk({ tokluk: 40, mutluluk: 40 }), { eylem: 'meyve', kim: A, simdi: T0 }).yama;
  assert.deepEqual([meyve['ihtiyac.tokluk'].v, meyve['ihtiyac.mutluluk'].v], [60, 45]);
  const tatli = eylemYap(kucuk({ tokluk: 40, mutluluk: 40 }), { eylem: 'tatli', kim: A, simdi: T0 });
  assert.deepEqual([tatli.yama['ihtiyac.tokluk'].v, tatli.yama['ihtiyac.mutluluk'].v], [50, 55]);
  const t2 = uygula(kucuk(), tatli.yama);
  assert.equal(kalanBekleme(t2, A, 'tatli', sonra(30)), 30 * DK, 'tatlı 60 dk');
  const oyna = eylemYap(kucuk({ mutluluk: 40, enerji: 5 }), { eylem: 'oyna', kim: A, simdi: T0 }).yama;
  assert.deepEqual([oyna['ihtiyac.mutluluk'].v, oyna['ihtiyac.enerji'].v], [65, 0]);
  assert.equal(eylemYap(kucuk({ temizlik: 70 }), { eylem: 'yika', kim: A, simdi: T0 }).yama['ihtiyac.temizlik'].v, 100);
  assert.equal(eylemYap(kucuk(), { eylem: 'zipla', kim: A, simdi: T0 }).hata, 'bilinmiyor');
});

test('eylemYap: değer 100 iken eylem yapılır ama puan vermez', () => {
  const r = eylemYap(kucuk({ tokluk: 100 }), { eylem: 'mama', kim: A, simdi: T0 });
  assert.equal(r.hata, undefined);
  assert.equal(r.puan, false);
  assert.equal(r.mesaj, 'Karnı tok 😊');
  assert.equal(r.yama[`puan.${A}`], undefined);
  assert.deepEqual(r.yama[`son.${A}`], { mama: iso(T0) }, 'bekleme yine başlar');
  assert.equal(eylemYap(kucuk({ temizlik: 100 }), { eylem: 'yika', kim: A, simdi: T0 }).puan, false);
  // Yüzde 99,6 ekranda 100 görünür: tok sayılır.
  assert.equal(eylemYap(kucuk({ tokluk: 99.6 }), { eylem: 'mama', kim: A, simdi: T0 }).puan, false);
  // Meyve: tokluk dolu ama mutluluk değil → etkili.
  assert.equal(eylemYap(kucuk({ tokluk: 100, mutluluk: 50 }), { eylem: 'meyve', kim: A, simdi: T0 }).puan, true);
});

test('eylemYap: yumurtada bakım yok; uyurken yalnız Uyandır ve Sev', () => {
  const yum = oku(yeniYumurta({ roomId: 'x', simdi: T0 }));
  assert.equal(eylemYap(yum, { eylem: 'mama', kim: A, simdi: T0 }).hata, 'yumurta');

  const y = kucuk({ enerji: 30 });
  assert.equal(eylemYap(y, { eylem: 'uyandir', kim: A, simdi: T0 }).hata, 'uyanik');
  const u = eylemYap(y, { eylem: 'uyut', kim: A, simdi: T0 });
  assert.equal(u.puan, true);
  assert.deepEqual(u.yama.uyku, { bas: iso(T0), bit: iso(T0 + 8 * SAAT) });
  for (const ad of IHTIYACLAR) assert.equal(u.yama[`ihtiyac.${ad}`].t, iso(T0), `${ad} o ana sabitlenir`);
  const uyuyan = uygula(y, u.yama);
  assert.equal(uyuyorMu(uyuyan.uyku, sonra(60)), true);
  for (const e of ['mama', 'meyve', 'tatli', 'oyna', 'yika', 'uyut']) {
    assert.equal(eylemYap(uyuyan, { eylem: e, kim: B, simdi: sonra(60) }).hata, 'uyuyor', e);
  }
  const sev = eylemYap(uyuyan, { eylem: 'sev', kim: B, simdi: sonra(60) });
  assert.equal(sev.hata, undefined);
  assert.equal(sev.yama.uyku, undefined, 'sevmek uyandırmaz');

  const kalk = eylemYap(uyuyan, { eylem: 'uyandir', kim: B, simdi: sonra(120) });
  assert.equal(kalk.hata, undefined);
  assert.equal(kalk.puan, false);
  assert.equal(kalk.yama.uyku, null);
  assert.equal(kalk.yama['ihtiyac.enerji'].v, 54, '2 saat uyku: 30 + 24');
  assert.equal(kalk.yama['ihtiyac.tokluk'].v, 46, 'uykuda yarı hız: 50 − 4');
  const uyanik = uygula(uyuyan, kalk.yama);
  assert.equal(uyuyorMu(uyanik.uyku, sonra(121)), false);
  assert.equal(Math.round(ihtiyaclar(uyanik, sonra(180)).enerji), 51, 'uyanınca yine düşer');
});

test('eylemYap: Sev günde en çok 5 puan; Uyut 8 saatte bir puan', () => {
  let y = kucuk({ mutluluk: 10 });
  let puan = 0;
  for (let i = 0; i < 7; i++) {
    const r = eylemYap(y, { eylem: 'sev', kim: A, simdi: sonra(i * 3) });
    assert.equal(r.hata, undefined, `sev ${i}`);
    if (r.puan) puan++;
    y = uygula(y, r.yama);
  }
  assert.equal(puan, 5);
  assert.equal(y.puan[A], 5);
  assert.ok(ihtiyaclar(y, sonra(18)).mutluluk > 40, 'puan vermese de mutluluk artar');
  const ertesi = eylemYap(y, { eylem: 'sev', kim: A, simdi: T0 + GUN });
  assert.equal(ertesi.puan, true, 'ertesi gün yeniden');
  assert.equal(eylemYap(y, { eylem: 'sev', kim: B, simdi: sonra(30) }).puan, true, 'sınır kişi başına');

  let z = kucuk({ enerji: 40 });
  const u1 = eylemYap(z, { eylem: 'uyut', kim: A, simdi: T0 });
  z = uygula(z, u1.yama);
  z = uygula(z, eylemYap(z, { eylem: 'uyandir', kim: A, simdi: sonra(10) }).yama);
  assert.equal(eylemYap(z, { eylem: 'uyut', kim: A, simdi: sonra(20) }).puan, false, 'art arda uyutmak puan vermez');
  assert.equal(eylemYap(z, { eylem: 'uyut', kim: A, simdi: sonra(8 * 60 + 1) }).puan, true);
  assert.equal(eylemYap(kucuk({ enerji: 100 }), { eylem: 'uyut', kim: A, simdi: T0 }).puan, false, 'enerji tam');
});

test('isit: aynı kişi 10 dk arayla; erken ısıtma yazılmaz; son 10 kayıt', () => {
  let y = oku(yeniYumurta({ roomId: 'x', simdi: T0 }));
  const r = isit(y, { kim: A, simdi: T0 });
  assert.deepEqual(r.yama, { [`isitma.${A}`]: [iso(T0)] });
  assert.deepEqual(r.kayit, { eylem: 'isit', kim: A, at: iso(T0) });
  y = uygula(y, r.yama);
  const erken = isit(y, { kim: A, simdi: sonra(4) });
  assert.equal(erken.hata, 'erken');
  assert.equal(erken.kalan, 6 * DK);
  assert.equal(isit(y, { kim: B, simdi: sonra(4) }).hata, undefined, 'aralık kişi başına');
  for (let i = 1; i <= 12; i++) y = uygula(y, isit(y, { kim: A, simdi: sonra(i * 10) }).yama);
  assert.equal(y.isitma[A].length, 10);
  assert.equal(y.isitma[A][9], iso(sonra(120)));
  assert.equal(isit(kucuk(), { kim: A, simdi: T0 }).hata, 'catladi');
});

test('isitmaSayisi: 10 dakikadan sık ısıtmalar tek sayılır', () => {
  assert.equal(isitmaSayisi([iso(T0), iso(sonra(5)), iso(sonra(10)), iso(sonra(19)), iso(sonra(30))]), 3);
  assert.equal(isitmaSayisi([iso(sonra(30)), iso(T0), iso(sonra(10))]), 3, 'sıra önemsiz');
  assert.equal(isitmaSayisi([]), 0);
  assert.equal(isitmaSayisi(['bozuk']), 0);
});

test('çatlama: 24 saat ve iki kişinin her biri en az 3 ısıtma', () => {
  const yap = (a, b, dogum = T0) => oku({
    asama: 'yumurta', dogum: iso(dogum),
    isitma: {
      [A]: Array.from({ length: a }, (_, i) => iso(dogum + i * 15 * DK)),
      [B]: Array.from({ length: b }, (_, i) => iso(dogum + i * 15 * DK)),
    },
  });
  const gun = T0 + GUN;
  assert.equal(catlamaHazir(yap(3, 3), gun), true);
  assert.equal(catlamaHazir(yap(3, 3), gun - DK), false, '24 saat dolmadı');
  assert.equal(catlamaHazir(yap(5, 2), gun), false, 'biri eksik');
  assert.equal(catlamaHazir(yap(6, 0), gun), false, 'tek kişi yetmez');
  const sik = oku({ asama: 'yumurta', dogum: iso(T0), isitma: { [A]: [iso(T0), iso(sonra(3)), iso(sonra(6))], [B]: yap(0, 3).isitma[B] } });
  assert.equal(catlamaHazir(sik, gun), false, '10 dakikadan sık ısıtma sayılmaz');
  assert.equal(catlamaHazir(kucuk(), gun), false, 'zaten çatlamış');

  const d = yumurtaDurumu(yap(2, 3), { benId: A, simdi: T0 + 10 * SAAT });
  assert.deepEqual(d, { ben: 2, partnerId: B, partner: 3, gerek: 3, kalan: 14 * SAAT, hazir: false });
  assert.deepEqual(yumurtaDurumu(yap(1, 0), { benId: A, simdi: gun }).partner, 0);

  const yama = catlamaYamasi(yap(3, 3), { roomId: 'testpaka23', simdi: gun });
  assert.equal(yama.asama, 'kucuk');
  assert.equal(yama.catlama, iso(gun));
  assert.equal(yama.renk, renkSec('testpaka23'));
  assert.equal(yama.uyku, null);
  for (const ad of IHTIYACLAR) assert.equal(yama.ihtiyac[ad].t, iso(gun));
  assert.equal(ruhHali(uygula(yap(3, 3), yama), gun), 'normal');
});

test('büyüme: 7 gün, toplam 60 puan, ikisi de en az 15', () => {
  const yap = (puan, gun = 7) => kucuk({}, { catlama: iso(T0 - gun * GUN), puan });
  assert.equal(buyumeDurumu(yap({ [A]: 30, [B]: 30 }), T0).hazir, true);
  assert.equal(buyumeDurumu(yap({ [A]: 30, [B]: 30 }, 6.9), T0).hazir, false, '7 gün dolmadı');
  assert.equal(buyumeDurumu(yap({ [A]: 30, [B]: 29 }), T0).hazir, false, 'toplam 59');
  assert.equal(buyumeDurumu(yap({ [A]: 50, [B]: 14 }), T0).hazir, false, 'biri 15 altında');
  assert.equal(buyumeDurumu(yap({ [A]: 70 }), T0).hazir, false, 'tek kişi');
  assert.deepEqual(buyumeDurumu(yap({ [A]: 20, [B]: 5 }, 4.5), T0),
    { hazir: false, kalanGun: 3, toplam: 25, gerekToplam: 60, gerekKisi: 15, kisiler: [{ id: A, puan: 20 }, { id: B, puan: 5 }] });
  const buyuk = oku({ ...yap({ [A]: 30, [B]: 30 }), asama: 'buyuk' });
  assert.equal(buyumeDurumu(buyuk, T0).hazir, false, 'sonraki aşama yok');
  assert.deepEqual(buyumeYamasi(T0), { asama: 'buyuk', buyume: iso(T0) });
});

test('ruhHali: uyuyor, en düşük ihtiyaç (<25), hepsi >60 mutlu, yoksa normal', () => {
  assert.equal(ruhHali(kucuk({ tokluk: 10, temizlik: 20 }), T0), 'ac');
  assert.equal(ruhHali(kucuk({ tokluk: 30, temizlik: 20 }), T0), 'kirli');
  assert.equal(ruhHali(kucuk({ enerji: 5 }), T0), 'uykulu');
  assert.equal(ruhHali(kucuk({ mutluluk: 24 }), T0), 'uzgun');
  assert.equal(ruhHali(kucuk({ tokluk: 61, mutluluk: 61, temizlik: 61, enerji: 61 }), T0), 'mutlu');
  assert.equal(ruhHali(kucuk({ tokluk: 61, mutluluk: 60, temizlik: 90, enerji: 90 }), T0), 'normal');
  assert.equal(ruhHali(kucuk({ tokluk: 25 }), T0), 'normal', '25 sınırı dahil değil');
  const uyuyan = kucuk({ tokluk: 5 }, { uyku: { bas: iso(T0), bit: iso(T0 + 8 * SAAT) } });
  assert.equal(ruhHali(uyuyan, sonra(1)), 'uyuyor');
  assert.equal(ruhHali(oku(yeniYumurta({ roomId: 'x', simdi: T0 })), T0), 'yumurta');
});

test('ozledi ve durumMetni: uzun süre bakılmazsa "Sizi özledi"', () => {
  const y = kucuk({ tokluk: 90, mutluluk: 90, temizlik: 90, enerji: 90 });
  assert.equal(ozledi(y, sonra(60)), false);
  assert.equal(ozledi(y, T0 + 12 * SAAT), true);
  assert.equal(durumMetni(y, T0 + 12 * SAAT), 'Sizi özledi 🥺');
  assert.equal(durumMetni(y, sonra(60)), 'Keyfi yerinde');
  assert.equal(durumMetni(kucuk({ tokluk: 10 }), T0), 'Karnı acıkmış');
  assert.equal(durumMetni(kucuk({}, { uyku: { bas: iso(T0), bit: iso(T0 + 8 * SAAT) } }), sonra(1)), 'Mışıl mışıl uyuyor');
  assert.equal(durumMetni(null, T0), 'Bir yumurtanız var 🥚 Isıtalım mı?');
  assert.equal(durumMetni(oku(yeniYumurta({ roomId: 'x', simdi: T0 })), T0), 'Isıtılmayı bekliyor 🥚');
});

test('adTemizle, yasMetni, kalanMetni, saatKalanMetni', () => {
  assert.deepEqual(adTemizle('  Pamuk   Şeker '), { ad: 'Pamuk Şeker' });
  assert.deepEqual(adTemizle('   '), { hata: 'Bir ad yaz.' });
  assert.equal(adTemizle('a'.repeat(40)).ad.length, 20);
  assert.equal([...adTemizle('🐣'.repeat(30)).ad].length, 20, 'emoji bölünmez');

  const yum = oku(yeniYumurta({ roomId: 'x', simdi: T0 }));
  assert.equal(yasMetni(yum, sonra(30)), 'Yeni yumurta');
  assert.equal(yasMetni(yum, T0 + 5 * SAAT), '5 saatlik');
  assert.equal(yasMetni(yum, T0 + 49 * SAAT), '2 günlük');
  assert.equal(yasMetni(kucuk({}, { catlama: iso(T0) }), T0 + 3 * SAAT), 'Yeni doğdu');
  assert.equal(yasMetni(kucuk({}, { catlama: iso(T0) }), T0 + 3 * GUN + SAAT), '3 günlük');

  assert.equal(kalanMetni(0), '');
  assert.equal(kalanMetni(30_000), '1 dk');
  assert.equal(kalanMetni(12 * DK), '12 dk');
  assert.equal(kalanMetni(60 * DK), '1 sa');
  assert.equal(kalanMetni(75 * DK), '1 sa 15 dk');
  assert.equal(saatKalanMetni(14 * SAAT), '14 saat kaldı');
  assert.equal(saatKalanMetni(13 * SAAT + 1), '14 saat kaldı');
  assert.equal(saatKalanMetni(20 * DK), '20 dk kaldı');
  assert.equal(saatKalanMetni(0), '');
});

test('hatırlatıcı: tokluğun 25 altına düşeceği an ve uyku bitişi', () => {
  assert.equal(acikmaZamani(kucuk({ tokluk: 85 }), T0), T0 + 15 * SAAT);
  assert.equal(acikmaZamani(kucuk({ tokluk: 85 }), T0 + 5 * SAAT), T0 + 15 * SAAT, 'şimdiden bağımsız');
  assert.equal(acikmaZamani(kucuk({ tokluk: 20 }), T0), null, 'zaten aç');
  assert.equal(acikmaZamani(oku(yeniYumurta({ roomId: 'x', simdi: T0 })), T0), null);
  // Uyurken yarı hız: 8 sa uyku 16 düşürür, sonra 4/sa.
  const uyku = { bas: iso(T0), bit: iso(T0 + 8 * SAAT) };
  assert.equal(acikmaZamani(kucuk({ tokluk: 45 }, { uyku }), T0), T0 + 8 * SAAT + 1 * SAAT);
  assert.equal(acikmaZamani(kucuk({ tokluk: 35 }, { uyku }), T0), T0 + 5 * SAAT, 'uykuda acıkır');

  const olaylar = hatirlaticiOlaylari(kucuk({ tokluk: 45 }, { uyku }), sonra(10));
  assert.deepEqual(olaylar, [
    { id: 'ac', baslik: 'Yavrumuz', metin: 'Yavrunuz acıktı 🍼', zaman: iso(T0 + 9 * SAAT) },
    { id: 'uyandi', baslik: 'Yavrumuz', metin: 'Yavrunuz uyandı ☀️', zaman: iso(T0 + 8 * SAAT) },
  ]);
  assert.deepEqual(hatirlaticiOlaylari(kucuk({ tokluk: 10 }), T0), []);
  assert.deepEqual(hatirlaticiOlaylari(null, T0), []);
});

test('bildirim: kişi başına 30 dk; çatlama, büyüme, ad her zaman', () => {
  assert.equal(bildirimGerekli({ son: null, simdi: T0 }), true);
  assert.equal(bildirimGerekli({ son: T0, simdi: sonra(29) }), false);
  assert.equal(bildirimGerekli({ son: T0, simdi: sonra(30) }), true);
  assert.equal(bildirimGerekli({ son: T0, simdi: sonra(1), eylem: 'catlama' }), true);
  assert.equal(bildirimGerekli({ son: T0, simdi: sonra(1), eylem: 'buyume' }), true);
  assert.equal(bildirimGerekli({ son: T0, simdi: sonra(1), eylem: 'ad' }), true);

  assert.equal(bildirimMetni({ ad: 'Gül', eylem: 'mama' }), 'Gül yavrunuzu besledi 🍼');
  assert.equal(bildirimMetni({ ad: 'Gül', eylem: 'tatli' }), 'Gül yavrunuzu besledi 🍰');
  assert.equal(bildirimMetni({ ad: 'Ömer', eylem: 'oyna' }), 'Ömer yavrunuzla oynadı ⚽');
  assert.equal(bildirimMetni({ ad: 'Ömer', eylem: 'isit' }), 'Ömer yumurtanızı ısıttı 🥚');
  assert.equal(bildirimMetni({ ad: 'Ömer', eylem: 'ad', deger: 'Pamuk' }), 'Ömer yavrunuza “Pamuk” adını verdi 💛');
  assert.equal(bildirimMetni({ eylem: 'catlama' }), 'Yumurtanız çatladı! Yavrunuz dünyaya geldi 🐣');
  assert.equal(bildirimMetni({ eylem: 'buyume', yavruAd: 'Pamuk' }), 'Pamuk büyüdü ✨');
  assert.equal(bildirimMetni({ ad: '', eylem: 'sev' }), 'Sevgilin yavrunuzu sevdi 🤍');

  assert.equal(bakimSatiri({ eylem: 'mama', ad: 'Gül' }), 'Gül besledi 🍼');
  assert.equal(bakimSatiri({ eylem: 'yika', ad: 'Sen' }), 'Sen yıkadın 🫧');
  assert.equal(bakimSatiri({ eylem: 'uyandir', ad: 'Ömer' }), 'Ömer uyandırdı ☀️');
  assert.equal(bakimSatiri({ eylem: 'catlama', ad: 'Ömer' }), 'Yumurta çatladı 🐣');
  assert.equal(bakimSatiri({ eylem: 'ad', ad: 'Gül', deger: 'Pamuk' }), 'Gül adını “Pamuk” koydu');
  assert.equal(bakimSatiri({ eylem: 'bilinmez', ad: 'Gül' }), '');
});

test('dogumBirlestir: iki cihaz aynı anda oluşturursa en erken doğum kalır', () => {
  assert.equal(dogumBirlestir(iso(sonra(1)), iso(T0)), iso(T0));
  assert.equal(dogumBirlestir(iso(T0), iso(sonra(1))), null);
  assert.equal(dogumBirlestir(iso(T0), iso(T0)), null);
  assert.equal(dogumBirlestir('bozuk', iso(T0)), iso(T0));
  assert.equal(dogumBirlestir(iso(T0), null), null);
});

test('EYLEMLER: tablodaki etki ve beklemeler', () => {
  assert.deepEqual(EYLEMLER.mama.etki, { tokluk: 30 });
  assert.deepEqual(EYLEMLER.meyve.etki, { tokluk: 20, mutluluk: 5 });
  assert.deepEqual(EYLEMLER.tatli.etki, { tokluk: 10, mutluluk: 15 });
  assert.deepEqual(EYLEMLER.oyna.etki, { mutluluk: 25, enerji: -10 });
  assert.deepEqual(EYLEMLER.yika.etki, { temizlik: 40 });
  assert.deepEqual(EYLEMLER.sev.etki, { mutluluk: 5 });
  assert.deepEqual(
    ['mama', 'meyve', 'tatli', 'oyna', 'yika', 'sev'].map((e) => EYLEMLER[e].bekleme / DK),
    [20, 20, 60, 20, 30, 2]);
});
