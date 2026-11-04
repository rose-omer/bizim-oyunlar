// Yavrumuz yaş evreleri ve özel gün (sayfalar/yavru/evre.js, mantik.js ozelGun, jeton.js pasta). Saf mantık, DOM yok.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyPatch } from '../js/core/veri.js';
import { toDay } from '../js/core/gunler.js';
import { oku, ozelGun, ozelGunMetni, ozelGunOlayi, bakimSatiri, bildirimMetni, bildirimGerekli } from '../sayfalar/yavru/mantik.js';
import { EVRELER, ayYasi, evreSon, evreYamasi, urunKilidi, evreSahnesiGerekli } from '../sayfalar/yavru/evre.js';
import { satinAl, pastaBedavaMi, jetonBakiye, URUNLER } from '../sayfalar/yavru/jeton.js';
import { urunDurumu, hataMetni } from '../sayfalar/yavru/magaza.js';
import { gorevOzeti, gununGorevi, gorevDurumu, odulYamasi, MUM_GOREV, MUM_JETON, gorevOdalari } from '../sayfalar/yavru/gorev.js';
import { GOREV_JETON } from '../sayfalar/yavru/seri.js';

const A = 'omer-test-id';
const B = 'gul-test-id';
const L = (y, m, d, sa = 12) => new Date(y, m - 1, d, sa).getTime();
const iso = (ms) => new Date(ms).toISOString();
const CATLAMA = L(2026, 3, 15, 9);
const veri = (ek = {}) => ({
  asama: 'buyuk', ad: 'Pamuk', renk: 2, dogum: iso(CATLAMA - 86400000), catlama: iso(CATLAMA), buyume: iso(CATLAMA + 8 * 86400000),
  ihtiyac: { tokluk: { v: 50, t: iso(CATLAMA) }, mutluluk: { v: 50, t: iso(CATLAMA) }, temizlik: { v: 50, t: iso(CATLAMA) }, enerji: { v: 50, t: iso(CATLAMA) } },
  ...ek,
});

test('EVRELER: 1, 3, 6, 12 ay; eşyalar var olan kıyafet', () => {
  assert.deepEqual(EVRELER.map((e) => e.ay), [1, 3, 6, 12]);
  for (const e of EVRELER) {
    assert.ok(e.unvan.length > 0);
    assert.equal(URUNLER[e.urun]?.tur, 'kiyafet', e.urun);
  }
  assert.equal(new Set(EVRELER.map((e) => e.urun)).size, EVRELER.length);
});

test('ayYasi: tamamlanan ay; yumurtada 0', () => {
  assert.equal(ayYasi(oku(veri()), L(2026, 4, 14)), 0);
  assert.equal(ayYasi(oku(veri()), L(2026, 4, 15)), 1);
  assert.equal(ayYasi(oku(veri()), L(2027, 3, 15)), 12);
  assert.equal(ayYasi(oku({ asama: 'yumurta' }), L(2027, 3, 15)), 0);
});

test('evreYamasi: yalnız büyükte; hak edilenler tek yamada; kıyafet bedava; iki kez yazılmaz', () => {
  assert.equal(evreYamasi(oku(veri({ asama: 'kucuk' })), { kim: A, simdi: L(2026, 8, 1) }), null, 'küçükte yok');
  assert.equal(evreYamasi(oku(veri()), { kim: A, simdi: L(2026, 4, 14) }), null, 'süre dolmadı');
  const t = L(2026, 6, 20); // 3 aylık: 1 ve 3 birlikte
  const r = evreYamasi(oku(veri()), { kim: A, simdi: t });
  assert.equal(r.evre.id, 'ay3');
  assert.deepEqual(Object.keys(r.yama).sort(), ['dolap.atki', 'dolap.gozluk', 'evre.ay1', 'evre.ay3'].sort());
  assert.equal(r.yama['dolap.gozluk'].fiyat, 0);
  const d = applyPatch(veri(), r.yama);
  assert.equal(jetonBakiye(d), 0);
  assert.equal(evreSon(oku(d)).unvan, EVRELER[1].unvan);
  assert.equal(evreYamasi(oku(d), { kim: B, simdi: t }), null, 'ikinci cihaz yazmaz');
});

test('evreYamasi: daha önce alınmış kıyafetin bedeli korunur; iki cihaz aynı sonuç', () => {
  const d = veri({ dolap: { atki: { at: 'x', kim: B, fiyat: 50 } }, jeton: { [A]: { kazanc: 100, harcama: 0 } } });
  const r = evreYamasi(oku(d), { kim: A, simdi: L(2026, 4, 20) });
  assert.equal(r.yama['dolap.atki'], undefined);
  assert.equal(jetonBakiye(applyPatch(d, r.yama)), 50);
  const r2 = evreYamasi(oku(d), { kim: B, simdi: L(2026, 4, 20) });
  assert.deepEqual(applyPatch(applyPatch(d, r.yama), r2.yama).evre, r2.yama['evre.ay1'] && { ay1: r2.yama['evre.ay1'] });
});

test('kilit: evre gelene dek mağazada kilitli; dolaptaki kalır', () => {
  const v = oku(veri({ jeton: { [A]: { kazanc: 500, harcama: 0 } } }));
  assert.equal(urunKilidi(v, 'tac').id, 'yas1');
  assert.equal(urunKilidi(v, 'fiyonk'), null);
  const r = satinAl(v, { kim: A, urun: 'tac', simdi: L(2026, 4, 1) });
  assert.equal(r.hata, 'kilitli');
  assert.match(hataMetni(r), /12 ay|1 yaş/);
  assert.equal(urunDurumu(v, 'tac', { kim: A, simdi: L(2026, 4, 1) }).durum, 'kilitli');
  const sahip = oku(veri({ dolap: { tac: { at: 'x', kim: A, fiyat: 150 } } }));
  assert.equal(urunKilidi(sahip, 'tac'), null);
  assert.notEqual(urunDurumu(sahip, 'tac', { kim: A, simdi: L(2026, 4, 1) }).durum, 'kilitli');
});

test('evreSahnesiGerekli: cihaz başına bir kez, yeni evrede', () => {
  const d = applyPatch(veri(), evreYamasi(oku(veri()), { kim: A, simdi: L(2026, 4, 20) }).yama);
  const v = oku(d);
  assert.equal(evreSahnesiGerekli(v, null, L(2026, 4, 20)).id, 'ay1');
  assert.equal(evreSahnesiGerekli(v, 'ay1', L(2026, 4, 20)), null);
  assert.equal(evreSahnesiGerekli(v, null, L(2026, 4, 30)), null, 'eski evrede oynamaz');
  assert.equal(evreSahnesiGerekli(oku(veri()), null, L(2026, 4, 20)), null);
});

test('ozelGun: ay dönümü, doğum günü, gün sayısı; çatladığı gün ve yumurtada yok', () => {
  const v = oku(veri());
  assert.equal(ozelGun(v, '2026-03-15'), null, 'çatladığı gün');
  assert.equal(ozelGun(v, '2026-03-16'), null);
  assert.deepEqual(ozelGun(v, '2026-04-15'), { tur: 'ay', n: 1 });
  assert.deepEqual(ozelGun(v, '2026-09-15'), { tur: 'ay', n: 6 });
  assert.deepEqual(ozelGun(v, '2027-03-15'), { tur: 'yil', n: 1 });
  assert.equal(ozelGun(oku({ asama: 'yumurta' }), '2027-03-15'), null);
  assert.equal(ozelGun(null, '2027-03-15'), null);
  assert.deepEqual(ozelGun(v, toDay(new Date(2026, 5, 22))), { tur: 'gun', n: 100 }, '100. gün');
  // Ayın 31'i: kısa ayda son gün.
  const v31 = oku(veri({ catlama: iso(L(2026, 1, 31, 9)) }));
  assert.deepEqual(ozelGun(v31, '2026-02-28'), { tur: 'ay', n: 1 });
  assert.equal(ozelGun(oku({ asama: 'kucuk', ad: 'Eski' }), '2026-02-28'), null, 'eski belge');
});

test('ozelGunMetni ve bakım, bildirim satırları', () => {
  assert.equal(ozelGunMetni({ tur: 'ay', n: 3 }, 'Pamuk'), 'Pamuk 3 aylık oldu!');
  assert.equal(ozelGunMetni({ tur: 'yil', n: 1 }, ''), 'Yavrumuz 1 yaşında!');
  assert.equal(ozelGunMetni({ tur: 'gun', n: 100 }, 'Pamuk'), 'Pamuk 100 günlük oldu!');
  assert.match(bakimSatiri({ eylem: 'mum', ad: 'Sen' }), /üfledin/);
  assert.match(bakimSatiri({ eylem: 'mum', ad: 'Gül' }), /Gül .*üfledi/);
  assert.match(bakimSatiri({ eylem: 'evre', ad: 'Sen', deger: 'Küçük kâşif' }), /Küçük kâşif/);
  assert.match(bildirimMetni({ ad: 'Gül', eylem: 'mum' }), /Gül/);
  assert.match(bildirimMetni({ ad: 'Gül', eylem: 'evre', deger: 'Küçük kâşif', yavruAd: 'Pamuk' }), /Pamuk.*Küçük kâşif/);
  assert.equal(bildirimGerekli({ son: 1000, simdi: 1001, eylem: 'evre' }), true);
});

test('ozelGunOlayi: sıradaki ay dönümü 10:00; yıl dönümü dogumGunuOlayi ile çakışmaz', () => {
  const v = oku(veri());
  const o = ozelGunOlayi(v, L(2026, 3, 20));
  assert.equal(o.zaman, iso(L(2026, 4, 15, 10)));
  assert.match(o.metin, /1 aylık/);
  assert.equal(ozelGunOlayi(v, L(2026, 4, 15, 9)).zaman, iso(L(2026, 4, 15, 10)));
  assert.equal(ozelGunOlayi(v, L(2026, 4, 15, 11)).zaman, iso(L(2026, 5, 15, 10)));
  assert.equal(ozelGunOlayi(oku({ asama: 'yumurta' }), L(2026, 3, 20)), null);
});

test('bedava pasta: özel günde kişi başı bir kez, jeton düşmez; başka gün bedelli', () => {
  const t = L(2026, 4, 15);
  const v0 = veri();
  assert.equal(pastaBedavaMi(oku(v0), A, t), true);
  assert.equal(pastaBedavaMi(oku(v0), A, L(2026, 4, 16)), false);
  assert.deepEqual(satinAl(oku(v0), { kim: A, urun: 'pasta', simdi: L(2026, 4, 16) }), { hata: 'yetersiz', eksik: URUNLER.pasta.fiyat });
  const r = satinAl(oku(v0), { kim: A, urun: 'pasta', simdi: t });
  assert.ok(r.yama, 'bakiye yokken de verilir');
  assert.equal(r.yama[`jeton.${A}`], undefined);
  assert.equal(r.yama[`son.${A}`].pastaGun, '2026-04-15');
  assert.equal(r.yama['ihtiyac.mutluluk'].v, URUNLER.pasta.etki.mutluluk, 'aylar geçti: 0 + etki');
  const d = applyPatch(v0, r.yama);
  assert.equal(jetonBakiye(d), 0);
  assert.equal(pastaBedavaMi(oku(d), A, t), false, 'ikinci pasta bedelli');
  assert.equal(pastaBedavaMi(oku(d), B, t), true, 'sevgilinin hakkı ayrı');
  assert.equal(urunDurumu(oku(v0), 'pasta', { kim: A, simdi: t }).bedava, true);
  assert.equal(satinAl(oku(veri({ uyku: { bas: iso(t - 1000), bit: iso(t + 8 * 3600000) } })), { kim: A, urun: 'pasta', simdi: t }).hata, 'uyuyor');
});

test('mum görevi: özel günde günün görevi; ikisi üfleyince tamam, ek jeton, seri işler', () => {
  const gun = '2026-04-15';
  assert.equal(gorevOdalari(MUM_GOREV).length, 0);
  const at = (sa) => iso(new Date(2026, 3, 15, sa).getTime());
  const ozet = (kayitlar) => gorevOzeti(oku(veri()), { roomId: 'oda', gun, kayitlar, kisiler: [A, B] });
  assert.equal(ozet([]).gorev.id, 'mum');
  assert.equal(ozet([{ eylem: 'mum', kim: A, at: at(10) }]).tamam, false);
  const tam = ozet([{ eylem: 'mum', kim: A, at: at(10) }, { eylem: 'mum', kim: B, at: at(11) }]);
  assert.equal(tam.tamam, true);
  assert.notEqual(gorevOzeti(oku(veri()), { roomId: 'oda', gun: '2026-04-16', kayitlar: [], kisiler: [A, B] }).gorev.id, 'mum');
  assert.notEqual(gununGorevi('oda', gun).id, 'mum', 'tohumlu seçim değişmez');
  assert.equal(gorevDurumu(MUM_GOREV, [{ eylem: 'sev', kim: A, at: at(10) }], { gun, kisiler: [A, B] }).ilerleme.n, 0);
  const yama = odulYamasi(veri(), gun, [A, B], { gorevId: 'mum', simdi: L(2026, 4, 15) });
  assert.equal(yama[`gorev.${gun}`].jeton, GOREV_JETON + MUM_JETON);
  assert.equal(yama.gorevSeri.n, 1);
});
