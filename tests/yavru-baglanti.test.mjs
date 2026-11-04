// Yavrumuz: kişilik, keyifsizlik ve günlük görevin mantik.js'e bağlanması. Saf mantık, DOM yok.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DK, SAAT, GUN, IHTIYACLAR, UYKU_ENERJI, ILAC,
  oku, yeniYumurta, ihtiyacDegeri, ihtiyaclar, eylemYap, durumMetni, catlamaYamasi, acikmaZamani,
  bildirimMetni, bakimSatiri,
} from '../sayfalar/yavru/mantik.js';
import { KISILIKLER, FAVORI_BONUS, kisilikSec } from '../sayfalar/yavru/kisilik.js';
import { ILAC as SAGLIK_ILAC, keyifsizMi, dusukBaslangic, puanArtisi } from '../sayfalar/yavru/saglik.js';
import { gorevOzeti, odulYamasi } from '../sayfalar/yavru/gorev.js';
import { GOREV_JETON } from '../sayfalar/yavru/seri.js';
import { applyPatch } from '../js/core/veri.js';
import { toDay } from '../js/core/gunler.js';

const A = 'omer-test-id';
const B = 'gul-test-id';
const T0 = Date.UTC(2026, 9, 30, 9, 0, 0);
const iso = (ms) => new Date(ms).toISOString();
const kayit = (v, ms = T0) => ({ v, t: iso(ms) });

function kucuk(ihtiyac = {}, ek = {}) {
  const ih = {};
  for (const ad of IHTIYACLAR) ih[ad] = kayit(ihtiyac[ad] ?? 50);
  return oku({
    asama: 'kucuk', ad: 'Pamuk', renk: 3, dogum: iso(T0 - 2 * GUN), catlama: iso(T0 - GUN),
    ihtiyac: ih, uyku: null, puan: {}, isitma: {}, son: {}, ...ek,
  });
}
const uygula = (y, yama) => oku(applyPatch(y, yama));

test('oku: kişilik ve görev alanı; eski ve bozuk belge kişiliksiz, görev {}', () => {
  assert.equal(kucuk({}, { kisilik: 'obur' }).kisilik, 'obur');
  assert.equal(kucuk().kisilik, null, 'eski belge');
  assert.equal(kucuk({}, { kisilik: 'uzayli' }).kisilik, null);
  assert.equal(kucuk({}, { kisilik: 7 }).kisilik, null);
  const g = { '2026-10-30': { id: 'ikisi-sev', at: iso(T0) } };
  assert.deepEqual(kucuk({}, { gorev: g }).gorev, g);
  assert.deepEqual(kucuk({}, { gorev: [1] }).gorev, {});
  assert.deepEqual(kucuk({}, { gorev: 'x' }).gorev, {});
  assert.deepEqual(oku(null).gorev, {});
});

test('ihtiyacDegeri: kişilik çarpanı düşüşe uygulanır; kişiliksiz 1', () => {
  const k = kayit(80);
  assert.equal(ihtiyacDegeri(k, 'tokluk', null, T0 + 4 * SAAT), 64);
  assert.equal(ihtiyacDegeri(k, 'tokluk', null, T0 + 4 * SAAT, null), 64);
  assert.equal(ihtiyacDegeri(k, 'tokluk', null, T0 + 4 * SAAT, 'obur'), 60, '4 × 1.25 × 4 sa');
  assert.ok(Math.abs(ihtiyacDegeri(k, 'mutluluk', null, T0 + 10 * SAAT, 'neseli') - 56) < 1e-9, '3 × 0.8 × 10 sa');
  assert.equal(ihtiyacDegeri(k, 'temizlik', null, T0 + 4 * SAAT, 'obur'), 72, 'çarpanı olmayan ihtiyaç');
  assert.equal(ihtiyacDegeri(k, 'tokluk', null, T0 + 4 * SAAT, 'bozuk'), 64);
  const y = kucuk({ tokluk: 80 }, { kisilik: 'obur' });
  assert.equal(ihtiyaclar(y, T0 + 4 * SAAT).tokluk, 60, 'ihtiyaclar y.kisilik geçirir');
});

test('ihtiyacDegeri: uykudaki enerji artışı çarpandan etkilenmez, diğerleri yarı hız × çarpan', () => {
  const uyku = { bas: iso(T0), bit: iso(T0 + 8 * SAAT) };
  const k = kayit(20);
  assert.equal(ihtiyacDegeri(k, 'enerji', uyku, T0 + 2 * SAAT, 'uykucu'), 20 + 2 * UYKU_ENERJI);
  assert.equal(ihtiyacDegeri(k, 'enerji', uyku, T0 + 2 * SAAT), 20 + 2 * UYKU_ENERJI);
  // Uyanınca çarpan: 8 sa uyku → 100 (kırpılır), sonra 3 × 1.25 / sa.
  assert.equal(ihtiyacDegeri(k, 'enerji', uyku, T0 + 10 * SAAT, 'uykucu'), 100 - 2 * 3.75);
  assert.equal(ihtiyacDegeri(kayit(80), 'tokluk', uyku, T0 + 4 * SAAT, 'obur'), 80 - 4 * 2.5);
});

test('acikmaZamani: tokluk çarpanı uyanık ve uyku diliminde', () => {
  assert.equal(acikmaZamani(kucuk({ tokluk: 85 }, { kisilik: 'obur' }), T0), T0 + 12 * SAAT, '60 / 5');
  assert.equal(acikmaZamani(kucuk({ tokluk: 85 }, { kisilik: 'titiz' }), T0), Math.round(T0 + (60 / 3.6) * SAAT));
  assert.equal(acikmaZamani(kucuk({ tokluk: 85 }), T0), T0 + 15 * SAAT, 'kişiliksiz değişmez');
  const uyku = { bas: iso(T0), bit: iso(T0 + 8 * SAAT) };
  // Obur uykuda 2.5/sa: 8 sa → 20 düşer (45 → 25), tam uyanırken.
  assert.equal(acikmaZamani(kucuk({ tokluk: 45 }, { kisilik: 'obur', uyku }), T0), T0 + 8 * SAAT);
});

test('eylemYap: favori yiyecekte ek mutluluk ve "En sevdiği!"; başka yiyecekte yok', () => {
  const y = kucuk({ tokluk: 40, mutluluk: 50 }, { kisilik: 'obur' }); // favori: mama
  const r = eylemYap(y, { eylem: 'mama', kim: A, simdi: T0 });
  assert.equal(r.yama['ihtiyac.tokluk'].v, 70);
  assert.equal(r.yama['ihtiyac.mutluluk'].v, 50 + FAVORI_BONUS);
  assert.equal(r.mesaj, 'En sevdiği! 😍');
  assert.equal(r.yama[`puan.${A}`], 1);
  const m = eylemYap(y, { eylem: 'meyve', kim: A, simdi: T0 });
  assert.equal(m.yama['ihtiyac.mutluluk'].v, 55, 'yalnız meyvenin kendi etkisi');
  assert.equal(m.mesaj, null);
  const eski = eylemYap(kucuk({ tokluk: 40, mutluluk: 50 }), { eylem: 'mama', kim: A, simdi: T0 });
  assert.equal(eski.yama['ihtiyac.mutluluk'], undefined, 'kişiliksiz: favori yok');
  assert.equal(eski.mesaj, null);
  assert.equal(KISILIKLER.obur.favori, 'mama');
});

test('eylemYap: karnı tokken favori bonus puan getirmez (puan yalnız yiyeceğin etkisine bakar)', () => {
  const y = kucuk({ tokluk: 100, mutluluk: 50 }, { kisilik: 'obur' });
  const r = eylemYap(y, { eylem: 'mama', kim: A, simdi: T0 });
  assert.equal(r.puan, false);
  assert.equal(r.yama[`puan.${A}`], undefined);
  assert.equal(r.mesaj, 'Karnı tok 😊');
  assert.equal(r.yama['ihtiyac.mutluluk'].v, 55, 'mutluluk yine artar');
});

test('eylemYap: puanArtis (keyifsizken 0.5) puana eklenir; varsayılan 1', () => {
  const y = kucuk({ tokluk: 40 }, { puan: { [A]: 3 } });
  assert.equal(eylemYap(y, { eylem: 'mama', kim: A, simdi: T0 }).yama[`puan.${A}`], 4);
  const r = eylemYap(y, { eylem: 'mama', kim: A, simdi: T0, puanArtis: 0.5 });
  assert.equal(r.yama[`puan.${A}`], 3.5);
  assert.equal(uygula(y, r.yama).puan[A], 3.5, 'oku kesirli puanı korur');
  // Keyifsiz yavru (hepsi ≤ 5): puanArtisi 0.5.
  const bitkin = kucuk({ tokluk: 3, mutluluk: 3, temizlik: 3, enerji: 3 });
  assert.equal(puanArtisi(bitkin, T0), 0.5);
  assert.equal(eylemYap(bitkin, { eylem: 'mama', kim: A, simdi: T0, puanArtis: puanArtisi(bitkin, T0) }).yama[`puan.${A}`], 0.5);
});

test('durumMetni: keyifsizken "Biraz keyifsiz 🤒" (uyurken uyuyor kalır); yumurtada etkisiz', () => {
  const bitkin = kucuk({ tokluk: 3, mutluluk: 3, temizlik: 3, enerji: 3 });
  assert.equal(durumMetni(bitkin, T0, keyifsizMi(bitkin, T0)), 'Biraz keyifsiz 🤒');
  assert.equal(durumMetni(bitkin, T0), 'Karnı acıkmış', 'parametre yoksa eski davranış');
  const uyku = { bas: iso(T0), bit: iso(T0 + 8 * SAAT) };
  assert.equal(durumMetni(kucuk({}, { uyku }), T0 + SAAT, true), 'Mışıl mışıl uyuyor');
  assert.equal(durumMetni(oku(yeniYumurta({ roomId: 'x', simdi: T0 })), T0, true), 'Isıtılmayı bekliyor 🥚');
  // Keyifsiz ama uzun süredir bakılmamış: keyifsizlik önce gelir.
  const eski = kucuk({ tokluk: 3, mutluluk: 3, temizlik: 3, enerji: 3 });
  assert.equal(durumMetni(eski, T0 + 13 * SAAT, true), 'Biraz keyifsiz 🤒');
});

test('ILAC tek tanım; bakımSatiri ve bildirimMetni ilaç için', () => {
  assert.equal(SAGLIK_ILAC, ILAC, 'saglik.js aynı nesneyi dışa verir');
  assert.equal(bildirimMetni({ ad: 'Gül', eylem: 'ilac' }), 'Gül yavrunuza ilaç verdi 💊');
  assert.equal(bildirimMetni({ ad: '', eylem: 'ilac' }), 'Sevgilin yavrunuza ilaç verdi 💊');
  assert.equal(bakimSatiri({ eylem: 'ilac', ad: 'Gül' }), 'Gül ilaç verdi 💊');
  assert.equal(bakimSatiri({ eylem: 'ilac', ad: 'Sen' }), 'Sen ilaç verdin 💊');
});

test('catlamaYamasi: kişilik bir kez yazılır, ısıtma geçmişinden ve oda kimliğinden', () => {
  const yum = oku({ ...yeniYumurta({ roomId: 'testpaka23', simdi: T0 }), isitma: { [A]: [iso(T0)], [B]: [iso(T0 + 20 * DK)] } });
  const yama = catlamaYamasi(yum, { roomId: 'testpaka23', simdi: T0 + GUN });
  assert.equal(yama.kisilik, kisilikSec(yum, 'testpaka23'));
  assert.ok(Object.hasOwn(KISILIKLER, yama.kisilik));
  assert.equal(catlamaYamasi(yum, { roomId: 'testpaka23', simdi: T0 + 2 * GUN }).kisilik, yama.kisilik, 'aynı belge → aynı kişilik');
  assert.equal(uygula(yum, yama).kisilik, yama.kisilik);
});

test('keyifsizMi ve dusukBaslangic kişilik çarpanını kullanır', () => {
  // Obur: tokluk 5/sa. 30'dan 25 altına 1 saatte iner (kişiliksiz 1.25 sa).
  const k = kayit(30);
  assert.equal(dusukBaslangic(k, 'tokluk', null, T0 + 2 * SAAT, 'obur'), T0 + SAAT);
  assert.equal(dusukBaslangic(k, 'tokluk', null, T0 + 2 * SAAT), T0 + 1.25 * SAAT);
  const y = kucuk({ tokluk: 30, mutluluk: 100, temizlik: 30, enerji: 100 }, { kisilik: 'obur' });
  // Tokluk 1 sa sonra, temizlik 2.5 sa sonra (titiz değil) altta; 24 sa daha bekle.
  assert.equal(keyifsizMi(y, T0 + 2.5 * SAAT + 24 * SAAT - DK), false);
  assert.equal(keyifsizMi(y, T0 + 2.5 * SAAT + 24 * SAAT), true);
});

test('görev: oku sonucu gorevOzeti ve odulYamasi ile çalışır; ödül jeton kaydı', () => {
  const gun = toDay(new Date(T0));
  const y = kucuk({}, { puan: { [A]: 4, [B]: 2 } });
  const oz = gorevOzeti(y, { roomId: 'testpaka23', gun, kayitlar: [], kisiler: [A, B] });
  assert.ok(oz && oz.gorev && oz.ilerleme.gerek > 0);
  assert.equal(oz.odullendi, false);
  const yama = odulYamasi(y, gun, [A, B], { gorevId: oz.gorev.id, simdi: T0 });
  assert.equal(yama[`puan.${A}`], undefined);
  assert.equal(yama[`gorev.${gun}`].jeton, GOREV_JETON);
  const sonra = uygula(y, yama);
  assert.equal(sonra.gorev[gun].id, oz.gorev.id);
  assert.equal(odulYamasi(sonra, gun, [A, B], { simdi: T0 }), null, 'bir kez');
  assert.equal(gorevOzeti(sonra, { roomId: 'testpaka23', gun, kayitlar: [], kisiler: [A, B] }).odullendi, true);
  assert.equal(gorevOzeti(oku(yeniYumurta({ roomId: 'x', simdi: T0 })), { roomId: 'x', gun, kayitlar: [], kisiler: [A, B] }), null, 'yumurtada yok');
});

// ---------- Tuvalet ve jeton bağlantısı ----------
import { LAZIMLIK, CIS_VAR, KAZA_METNI, kartRuhu } from '../sayfalar/yavru/mantik.js';
import * as T from '../sayfalar/yavru/tuvalet.js';
import { jetonBakiye, URUNLER } from '../sayfalar/yavru/jeton.js';

test('oku: tuvalet, jeton, dolap ham taşınır; bozuk alan {}; tuvalet.js aynı tanımları verir', () => {
  const y = kucuk({}, { tuvalet: { v: 40, t: iso(T0) }, jeton: { [A]: { kazanc: 30, harcama: 0 } }, dolap: { fiyonk: { at: iso(T0), kim: A, fiyat: 40 } } });
  assert.deepEqual(y.tuvalet, { v: 40, t: iso(T0) });
  assert.equal(jetonBakiye(y), -10, 'oku sonucu jeton.js ile çalışır');
  for (const bozuk of [null, 'x', [1]]) {
    const z = kucuk({}, { tuvalet: bozuk, jeton: bozuk, dolap: bozuk });
    assert.deepEqual([z.tuvalet, z.jeton, z.dolap], [{}, {}, {}]);
  }
  assert.equal(T.LAZIMLIK, LAZIMLIK);
  assert.equal(T.CIS_VAR, CIS_VAR);
  assert.equal(T.KAZA_METNI, KAZA_METNI);
  assert.equal(T.tuvaletDurumu(kucuk(), T0).cisVar, false, 'eski belge: tuvalet yok');
});

test('durumMetni önceliği: keyifsiz → çişi var (uyanık) → kaza → özledi → ruh hâli', () => {
  const durum = (y, simdi, keyifsiz = false) => durumMetni(y, simdi, keyifsiz, T.tuvaletDurumu(y, simdi));
  const cis = kucuk({}, { tuvalet: { v: 80, t: iso(T0) } });
  assert.equal(durum(cis, T0), CIS_VAR);
  assert.equal(durum(cis, T0, true), 'Biraz keyifsiz 🤒', 'keyifsizlik önce');
  const uyku = { bas: iso(T0), bit: iso(T0 + 8 * SAAT) };
  assert.equal(durum(kucuk({}, { uyku, tuvalet: { v: 80, t: iso(T0) } }), T0 + SAAT), 'Mışıl mışıl uyuyor', 'uykuda çiş yazmaz');
  // Kaza 10 dk önce oldu (yazılmış): kaza metni; bir saat geçince normal.
  const kaza = kucuk({}, { tuvalet: { v: 0, t: iso(T0 - 10 * DK), kaza: iso(T0 - 10 * DK) } });
  assert.equal(durum(kaza, T0), KAZA_METNI);
  assert.equal(durum(kaza, T0 + 2 * SAAT), 'İyi görünüyor');
  // Özledi ile çişi var: ikisi birden olunca çiş önce (özledi 12 saatte, eşik 20 saatte: 30 + 2 × 20).
  const unutulmus = kucuk({ tokluk: 100, mutluluk: 100, temizlik: 100, enerji: 100 }, { tuvalet: { v: 30, t: iso(T0) } });
  assert.equal(durum(unutulmus, T0 + 12.5 * SAAT), 'Sizi özledi 🥺');
  assert.equal(durum(unutulmus, T0 + 20.5 * SAAT), CIS_VAR);
  assert.equal(durumMetni(cis, T0), 'İyi görünüyor', 'tuvalet parametresi yoksa eski davranış');
});

test('kartRuhu: yüz durum metniyle uyumlu (keyifsiz/kaza üzgün, çişi var şaşkın; uykuda ve yumurtada değişmez)', () => {
  const ruh = (y, simdi, keyifsiz = false) => kartRuhu(y, simdi, { keyifsiz, tuvalet: T.tuvaletDurumu(y, simdi) });
  const iyi = kucuk({ tokluk: 90, mutluluk: 90, temizlik: 90, enerji: 90 });
  assert.equal(ruh(iyi, T0), 'mutlu');
  const cis = kucuk({ tokluk: 90, mutluluk: 90, temizlik: 90, enerji: 90 }, { tuvalet: { v: 80, t: iso(T0) } });
  assert.equal(ruh(cis, T0), 'sasirma');
  assert.equal(ruh(cis, T0, true), 'uzgun', 'keyifsizlik önce');
  const kaza = kucuk({ tokluk: 90, mutluluk: 90, temizlik: 90, enerji: 90 }, { tuvalet: { v: 0, t: iso(T0 - 10 * DK), kaza: iso(T0 - 10 * DK) } });
  assert.equal(ruh(kaza, T0), 'uzgun');
  assert.equal(ruh(kaza, T0 + 2 * SAAT), 'mutlu', 'kaza metni bitince eski yüz');
  const unutulmus = kucuk({ tokluk: 100, mutluluk: 100, temizlik: 100, enerji: 100 }, { tuvalet: { v: 0, t: iso(T0) } });
  assert.equal(ruh(unutulmus, T0 + 12.5 * SAAT), 'uzgun', 'özledi');
  const uyku = { bas: iso(T0), bit: iso(T0 + 8 * SAAT) };
  assert.equal(ruh(kucuk({}, { uyku, tuvalet: { v: 80, t: iso(T0) } }), T0 + SAAT, true), 'uyuyor');
  assert.equal(ruh(oku(yeniYumurta({ roomId: 'x', simdi: T0 })), T0, true), 'yumurta');
  assert.equal(kartRuhu(null, T0), 'yumurta');
  assert.equal(kartRuhu(kucuk({ tokluk: 10 }), T0), 'ac', 'parametre yoksa ruhHali');
});

test('yemek yaması tuvaletYamasi ile birleşir; lazımlık bakım satırı, bildirim; kaza ve satın alma satırı', () => {
  const y = kucuk({ tokluk: 40 }, { tuvalet: { v: 10, t: iso(T0) } });
  const r = eylemYap(y, { eylem: 'mama', kim: A, simdi: T0 + SAAT });
  const z = oku(applyPatch(y, { ...r.yama, ...T.tuvaletYamasi(y, { simdi: T0 + SAAT, artis: T.YEMEK_ARTIS.mama }) }));
  assert.equal(z.tuvalet.v, 32, '10 + 2 (1 saat) + 20');
  assert.equal(z.ihtiyac.tokluk.v, 66);
  assert.equal(bakimSatiri({ eylem: 'lazimlik', ad: 'Gül' }), 'Gül tuvalete götürdü 🚽');
  assert.equal(bakimSatiri({ eylem: 'lazimlik', ad: 'Sen' }), 'Sen tuvalete götürdün 🚽');
  assert.equal(bildirimMetni({ ad: 'Gül', eylem: 'lazimlik' }), 'Gül yavrunuzu tuvalete götürdü 🚽');
  assert.equal(bakimSatiri({ eylem: 'kaza', ad: 'Gül' }), KAZA_METNI);
  assert.ok(bildirimMetni({ ad: 'Gül', eylem: 'kaza' }));
  assert.equal(bakimSatiri({ eylem: 'satinal', ad: 'Sen', deger: 'cilek', urun: URUNLER.cilek }), 'Sen 🍓 Çilek aldın');
  assert.equal(bakimSatiri({ eylem: 'satinal', ad: 'Gül', deger: 'x' }), 'Gül bir şey aldı 🛍️');
  assert.equal(bildirimMetni({ ad: 'Gül', eylem: 'satinal', urun: URUNLER.tac }), 'Gül yavrunuza 👑 Taç aldı');
});
