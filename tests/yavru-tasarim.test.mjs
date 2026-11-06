// Yavrumuz yeni düzen: oda-ihtiyaç sırası, durum alt metni, önerilen eylem, ikon dili (saf; DOM yok).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ODALAR, odaDurumlari, durumAltMetni, onerilenEylem, partnerOdaKisa, eylemAltMetni, UYARI } from '../sayfalar/yavru/odalar.js';
import { ikon, ODA_IKON, EYLEM_IKON } from '../sayfalar/yavru/ikonlar.js';
import { EYLEMLER, DUSUK } from '../sayfalar/yavru/mantik.js';
import { readFileSync } from 'node:fs';
import { SEKMELER } from '../js/core/games.js';

const TOK = { tokluk: 72, mutluluk: 88, temizlik: 55, enerji: 60 };

test('oda sırası: her oda kendi ihtiyacını gösterir', () => {
  const d = odaDurumlari({ ihtiyac: TOK, tuvaletDeger: 10, cisVar: false, uyuyor: false });
  assert.deepEqual(Object.keys(d), ODALAR.map((o) => o.id));
  assert.equal(d.mutfak.deger, 72);
  assert.equal(d.banyo.deger, 55);
  assert.equal(d.yatak.deger, 60);
  assert.equal(d.oyun.deger, 88);
  assert.equal(d.tuvalet.deger, 90, 'tuvalet rahatlık gösterir: 100 − sıkışıklık');
  assert.equal(d.mutfak.ihtiyac, 'tokluk');
  assert.equal(d.tuvalet.ihtiyac, 'rahatlık');
  for (const o of Object.values(d)) assert.equal(o.uyari, false);
});

test('oda sırası: uyarı eşiği, acil nokta ve tuvalet', () => {
  assert.ok(UYARI > DUSUK);
  const d = odaDurumlari({ ihtiyac: { ...TOK, enerji: UYARI - 1, tokluk: DUSUK - 1 }, tuvaletDeger: 80, cisVar: true, uyuyor: false });
  assert.equal(d.yatak.uyari, true);
  assert.equal(d.yatak.acil, false, 'eşik altı ama acil değil');
  assert.equal(d.mutfak.acil, true);
  assert.equal(d.tuvalet.uyari, true);
  assert.equal(d.tuvalet.acil, true);
  const u = odaDurumlari({ ihtiyac: { ...TOK, enerji: 5 }, tuvaletDeger: 80, cisVar: true, uyuyor: true });
  assert.equal(u.yatak.acil, false, 'uyurken enerji acil değil');
  assert.equal(u.tuvalet.acil, false, 'uyurken tuvalet acil değil');
});

test('oda sırası: değerler 0–100 tam sayı; bozuk girdi 0', () => {
  const d = odaDurumlari({ ihtiyac: { tokluk: 71.6, mutluluk: 130, temizlik: -4 }, tuvaletDeger: Number.NaN });
  assert.equal(d.mutfak.deger, 72);
  assert.equal(d.oyun.deger, 100);
  assert.equal(d.banyo.deger, 0);
  assert.equal(d.yatak.deger, 0);
  assert.equal(d.tuvalet.deger, 100);
});

test('durum alt metni: uyku süresi, en düşük ihtiyaç, oda ipucu', () => {
  assert.equal(durumAltMetni({ uyuyor: true, kalan: '5 sa 40 dk', oda: 'mutfak', ihtiyac: TOK }), '5 sa 40 dk sonra kendiliğinden uyanır.');
  assert.match(durumAltMetni({ oda: 'mutfak', ihtiyac: { ...TOK, enerji: UYARI - 1 } }), /Enerjisi azalıyor/);
  assert.match(durumAltMetni({ oda: 'mutfak', ihtiyac: { ...TOK, tokluk: UYARI - 1, enerji: UYARI - 10 } }), /Enerjisi/, 'en düşük öne çıkar');
  assert.equal(durumAltMetni({ oda: 'banyo', ihtiyac: TOK }), ODALAR[1].ipucu);
  assert.equal(durumAltMetni({ oda: 'oyun', ihtiyac: TOK }), 'Başını okşa, karnını gıdıkla.');
  assert.equal(durumAltMetni({ oda: 'yok', ihtiyac: null }), ODALAR[0].ipucu);
});

test('önerilen eylem: odada tek vurgu, yalnız gerektiğinde', () => {
  const ok = { ihtiyac: TOK, cisVar: false, uyuyor: false };
  assert.equal(onerilenEylem('mutfak', ok), null);
  assert.equal(onerilenEylem('mutfak', { ...ok, ihtiyac: { ...TOK, tokluk: UYARI - 1 } }), 'mama');
  assert.equal(onerilenEylem('banyo', ok), 'yika');
  assert.equal(onerilenEylem('tuvalet', ok), null);
  assert.equal(onerilenEylem('tuvalet', { ...ok, cisVar: true }), 'lazimlik');
  assert.equal(onerilenEylem('yatak', ok), null);
  assert.equal(onerilenEylem('yatak', { ...ok, ihtiyac: { ...TOK, enerji: UYARI - 1 } }), 'uyut');
  assert.equal(onerilenEylem('oyun', ok), 'oyunlar');
  for (const oda of ['mutfak', 'banyo', 'tuvalet', 'yatak', 'oyun']) assert.equal(onerilenEylem(oda, { ...ok, uyuyor: true }), null, oda);
});

test('partner kısa metni: emoji yok; geçersiz alan null', () => {
  assert.equal(partnerOdaKisa('Gül', 'banyo'), 'Gül banyoda');
  assert.equal(partnerOdaKisa('', 'yatak'), 'Sevgilin yatak odasında');
  assert.equal(partnerOdaKisa('Gül', 'x'), null);
  assert.equal(partnerOdaKisa('Gül', null), null);
});

test('eylem alt metni: gerçek etkiden gelir', () => {
  assert.equal(eylemAltMetni('mama', EYLEMLER), `+${EYLEMLER.mama.etki.tokluk} tokluk`);
  assert.equal(eylemAltMetni('meyve', EYLEMLER), `+${EYLEMLER.meyve.etki.tokluk} tokluk`);
  assert.equal(eylemAltMetni('tatli', EYLEMLER), `+${EYLEMLER.tatli.etki.mutluluk} mutluluk`);
  assert.equal(eylemAltMetni('oyna', EYLEMLER), `+${EYLEMLER.oyna.etki.mutluluk} mutluluk`);
  assert.equal(eylemAltMetni('yika', EYLEMLER), `+${EYLEMLER.yika.etki.temizlik} temizlik`);
  assert.equal(eylemAltMetni('yok', EYLEMLER), '');
});

test('ikonlar: her oda ve eylemin ikonu var; tek biçim, emoji yok', () => {
  for (const o of ODALAR) assert.ok(ODA_IKON[o.id], o.id);
  for (const e of [...Object.keys(EYLEMLER), 'ilac', 'lazimlik', 'ninni', 'durdur', 'oyunlar', 'konus', 'magaza', 'durula']) assert.ok(EYLEM_IKON[e], e);
  const s = ikon('kalp');
  assert.match(s, /^<svg [^>]*viewBox="0 0 24 24"/);
  assert.match(s, /aria-hidden="true"/);
  assert.match(s, /stroke="currentColor"/);
  assert.doesNotMatch(s, /\sid="/);
  assert.equal(ikon('yok'), '');
  assert.equal(ikon('__proto__'), '');
  for (const ad of [...Object.values(ODA_IKON), ...Object.values(EYLEM_IKON)]) {
    const c = ikon(ad);
    assert.ok(c.length > 40, ad);
    assert.doesNotMatch(c, /\p{Extended_Pictographic}/u, ad);
    assert.doesNotMatch(c, /undefined|NaN/, ad);
  }
});

test('alt bar: Yavrumuz sekmesi Anılar ile Günler arasında, sayfada bar görünür', () => {
  assert.deepEqual(SEKMELER, ['biz', 'sohbet', 'anilar', 'yavru', 'gunler', 'daha']);
  const taban = readFileSync(new URL('../css/base.css', import.meta.url), 'utf8');
  const sutun = taban.match(/#tabbar \{[^}]*?grid-template-columns: repeat\((\d+),/);
  assert.equal(Number(sutun?.[1]), SEKMELER.length);
  const uygulama = readFileSync(new URL('../sayfalar/yavru/app.js', import.meta.url), 'utf8');
  assert.match(uygulama, /bootPage\(\{ ns: 'yavru', title: 'Yavrumuz', tab: 'yavru' \}\)/);
  assert.doesNotMatch(uygulama, /yv-ust-geri/);
  const stil = readFileSync(new URL('../sayfalar/yavru/style.css', import.meta.url), 'utf8');
  assert.doesNotMatch(stil, /body\.yv-tam #tabbar/);
  assert.doesNotMatch(stil, /yv-ust-geri/);
});
