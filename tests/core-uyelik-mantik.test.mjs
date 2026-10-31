// Cihaz üyeliği saf mantığı (js/core/uyelik-mantik.js): biçimler, sonuç çözme ve yerel sıkı öykünme (§4.3 kuralları).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import {
  ANAHTAR_RE, base64url, cihazAdi, yetkiHatasiMi, eskiSunucuHatasiMi, sonucCoz, girisAcikMi, kanalSec,
  kurtarmaTemizle, davetKoduMu, yeniDurum, ykKatil, ykDurum, ykYetki, ykListele, ykOnayla, ykReddet, ykCikar,
  ykDavetOlustur, ykKurtarmaOlustur,
} from '../js/core/uyelik-mantik.js';

const GUN = 864e5;
const T0 = Date.parse('2026-10-01T10:00:00.000Z');
const ctx = (simdi = T0) => ({ simdi, rastgele: (n) => new Uint8Array(randomBytes(n)) });
const anahtar = () => base64url(new Uint8Array(randomBytes(32)));
const kim = (cihaz, a) => ({ cihaz, anahtar: a });
const kodu = (fn) => { try { fn(); } catch (e) { return e.code; } return null; };

test('base64url: 32 bayt → 43 karakter, dolgusuz, url güvenli', () => {
  const b = new Uint8Array(32).fill(255);
  assert.equal(base64url(b), '_'.repeat(42) + '8');
  assert.match(base64url(new Uint8Array([251, 255, 62])), /^[A-Za-z0-9_-]+$/);
  for (let i = 0; i < 50; i++) assert.match(anahtar(), ANAHTAR_RE);
});

test('cihazAdi: ad + cihaz türü', () => {
  const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36';
  const TABLET = 'Mozilla/5.0 (Linux; Android 13; SM-X200) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36';
  const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1';
  const IPAD = 'Mozilla/5.0 (iPad; CPU OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1';
  const WIN = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36 Edg/129.0';
  const MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15';
  assert.equal(cihazAdi(ANDROID, 'Ömer'), 'Ömer · Android telefon');
  assert.equal(cihazAdi(TABLET, 'Ömer'), 'Ömer · Android tablet');
  assert.equal(cihazAdi(IPHONE, 'Gül'), 'Gül · iPhone');
  assert.equal(cihazAdi(IPAD, 'Gül'), 'Gül · iPad');
  assert.equal(cihazAdi(WIN, 'Ömer'), 'Ömer · Windows bilgisayar');
  assert.equal(cihazAdi(MAC, 'Gül'), 'Gül · Mac');
  assert.equal(cihazAdi('', '  Gül  '), 'Gül · cihaz');
  assert.equal(cihazAdi(WIN, ''), 'Windows bilgisayar');
  assert.ok(cihazAdi(WIN, 'x'.repeat(100)).length <= 60);
});

test('yetkiHatasiMi ve eskiSunucuHatasiMi', () => {
  assert.equal(yetkiHatasiMi({ code: '42501', message: 'doc_put: yetki yok' }), true);
  assert.equal(yetkiHatasiMi(Object.assign(new Error('x'), { code: '42501' })), true);
  assert.equal(yetkiHatasiMi(Object.assign(new Error('x'), { yetki: true })), true);
  assert.equal(yetkiHatasiMi({ code: '54000' }), false);
  assert.equal(yetkiHatasiMi(null), false);
  assert.equal(eskiSunucuHatasiMi({ code: 'PGRST202' }), true);
  assert.equal(eskiSunucuHatasiMi({ code: 'XX' }, 404), true);
  assert.equal(eskiSunucuHatasiMi({ code: '42501' }, 403), false);
  assert.equal(eskiSunucuHatasiMi(null), false);
});

test('sonucCoz: sunucu yanıtını normalleştirir; bilinmeyen durum → null', () => {
  assert.deepEqual(sonucCoz({ durum: 'onayli', kanal: 'k'.repeat(32), zorunlu: '2026-10-01T10:00:00Z', ilk: true }),
    { durum: 'onayli', kanal: 'k'.repeat(32), zorunlu: '2026-10-01T10:00:00Z', ilk: true });
  assert.deepEqual(sonucCoz({ durum: 'bekliyor', kanal: 'x' }), { durum: 'bekliyor', kanal: null, zorunlu: null, ilk: false });
  assert.deepEqual(sonucCoz([{ durum: 'cakisma' }]), { durum: 'cakisma', kanal: null, zorunlu: null, ilk: false });
  assert.equal(sonucCoz({ durum: 'hack' }), null);
  assert.equal(sonucCoz(null), null);
});

test('girisAcikMi ve kanalSec', () => {
  const R = 'abcdefghij';
  assert.equal(girisAcikMi({ durum: 'onayli', kanal: 'k1' }), true);
  assert.equal(girisAcikMi({ durum: 'eski-sunucu' }), true);
  assert.equal(girisAcikMi({ durum: 'cevrimdisi', onceki: 'onayli', kanal: 'k1' }), true);
  assert.equal(girisAcikMi({ durum: 'cevrimdisi', onceki: null }), false);
  for (const d of ['bekliyor', 'reddedildi', 'cakisma', 'yok']) assert.equal(girisAcikMi({ durum: d }), false, d);
  assert.equal(girisAcikMi(null), false);
  assert.equal(kanalSec({ durum: 'onayli', kanal: 'k1' }, R), 'k1');
  assert.equal(kanalSec({ durum: 'onayli', kanal: null }, R), R);
  assert.equal(kanalSec({ durum: 'eski-sunucu' }, R), R);
  assert.equal(kanalSec({ durum: 'cevrimdisi', onceki: 'onayli', kanal: 'k2' }, R), 'k2');
  assert.equal(kanalSec({ durum: 'bekliyor' }, R), null);
});

test('kurtarmaTemizle ve davetKoduMu', () => {
  assert.equal(kurtarmaTemizle(' abcd-efgh jklm-npqr '), 'ABCDEFGHJKLMNPQR');
  assert.equal(kurtarmaTemizle(null), '');
  assert.equal(davetKoduMu('a'.repeat(32)), true);
  assert.equal(davetKoduMu('a'.repeat(31)), false);
  assert.equal(davetKoduMu('A'.repeat(32)), false);
  assert.equal(davetKoduMu('<script>' + 'a'.repeat(24)), false);
});

// ---------- Yerel sıkı öykünme ----------
const R = 'odakodu234';

test('öykünme: kurucu onaylı (ilk), ikinci cihaz bekler, onaylanınca girer', () => {
  const st = yeniDurum();
  const a = anahtar(); const b = anahtar();
  const s1 = ykKatil(st, { room: R, cihaz: 'omer', anahtar: a, ad: 'Ömer · iPhone' }, ctx());
  assert.equal(s1.durum, 'onayli');
  assert.equal(s1.ilk, true);
  assert.equal(s1.kanal, st.oda.kanal); // yeni oda: koruma hemen başlar → gizli kanal
  assert.match(s1.kanal, /^[0-9a-f]{32}$/);
  assert.equal(st.oda.zorunlu, new Date(T0).toISOString());

  const s2 = ykKatil(st, { room: R, cihaz: 'gul', anahtar: b, ad: 'Gül' }, ctx(T0 + 1000));
  assert.deepEqual(s2, { durum: 'bekliyor', kanal: null, zorunlu: st.oda.zorunlu, ilk: false });
  assert.equal(ykDurum(st, kim('gul', b), T0 + 2000).durum, 'bekliyor');
  assert.equal(kodu(() => ykListele(st, kim('gul', b), T0)), '42501');

  const liste = ykListele(st, kim('omer', a), T0 + 3000);
  assert.deepEqual(liste.map((r) => [r.cihaz, r.durum, r.ad]), [['omer', 'onayli', 'Ömer · iPhone'], ['gul', 'bekliyor', 'Gül']]);
  assert.equal(ykOnayla(st, kim('omer', a), 'gul', ctx()), true);
  assert.equal(st.cihazlar.gul.onaylayan, 'omer');
  const s3 = ykDurum(st, kim('gul', b), T0 + 4000);
  assert.equal(s3.durum, 'onayli');
  assert.equal(s3.kanal, st.oda.kanal);
  assert.equal(ykOnayla(st, kim('omer', a), 'gul', ctx()), false, 'zaten onaylı');
});

test('öykünme: onaylı cihaz yeniden katılınca adı güncellenir; farklı anahtar → çakışma', () => {
  const st = yeniDurum();
  const a = anahtar();
  ykKatil(st, { room: R, cihaz: 'omer', anahtar: a, ad: 'Eski' }, ctx());
  assert.equal(ykKatil(st, { room: R, cihaz: 'omer', anahtar: a, ad: 'Yeni' }, ctx()).durum, 'onayli');
  assert.equal(st.cihazlar.omer.ad, 'Yeni');
  const c = ykKatil(st, { room: R, cihaz: 'omer', anahtar: anahtar(), ad: 'Hırsız' }, ctx());
  assert.equal(c.durum, 'cakisma');
  assert.equal(c.kanal, null);
  assert.equal(st.cihazlar.omer.ad, 'Yeni', 'satıra dokunulmaz');
  assert.equal(ykDurum(st, kim('omer', anahtar()), T0).durum, 'cakisma');
  assert.equal(ykDurum(st, kim('yok', anahtar()), T0).durum, 'yok');
  assert.equal(ykDurum(yeniDurum(), kim('yok', anahtar()), T0).durum, 'yok');
});

test('öykünme: biçim hatası 22023', () => {
  const st = yeniDurum();
  assert.equal(kodu(() => ykKatil(st, { room: R, cihaz: 'kötü id', anahtar: anahtar() }, ctx())), '22023');
  assert.equal(kodu(() => ykKatil(st, { room: R, cihaz: 'omer', anahtar: 'kisa' }, ctx())), '22023');
});

test('öykünme: davet tek kullanımlık, 7 gün geçerli; reddedilen davetle onaylanır', () => {
  const st = yeniDurum();
  const a = anahtar();
  ykKatil(st, { room: R, cihaz: 'omer', anahtar: a }, ctx());
  const kod = ykDavetOlustur(st, kim('omer', a), ctx());
  assert.ok(davetKoduMu(kod), kod);
  const g = anahtar();
  assert.equal(ykKatil(st, { room: R, cihaz: 'gul', anahtar: g, davet: kod }, ctx(T0 + 1000)).durum, 'onayli');
  // aynı kod ikinci kez işe yaramaz
  assert.equal(ykKatil(st, { room: R, cihaz: 'tablet', anahtar: anahtar(), davet: kod }, ctx()).durum, 'bekliyor');
  // süresi dolan kod
  const eski = ykDavetOlustur(st, kim('omer', a), ctx());
  assert.equal(ykKatil(st, { room: R, cihaz: 'tel2', anahtar: anahtar(), davet: eski }, ctx(T0 + 8 * GUN)).durum, 'bekliyor');
  // reddedilen cihaz reddedilmiş kalır; geçerli davetle onaylanır
  const t = anahtar();
  ykKatil(st, { room: R, cihaz: 'tel3', anahtar: t }, ctx());
  assert.equal(ykReddet(st, kim('omer', a), 'tel3', ctx()), true);
  assert.equal(ykReddet(st, kim('omer', a), 'tel3', ctx()), false, 'yalnız bekleyen reddedilir');
  assert.equal(ykKatil(st, { room: R, cihaz: 'tel3', anahtar: t }, ctx()).durum, 'reddedildi');
  const yeni = ykDavetOlustur(st, kim('omer', a), ctx());
  assert.equal(ykKatil(st, { room: R, cihaz: 'tel3', anahtar: t, davet: yeni }, ctx()).durum, 'onayli');
});

test('öykünme: odada en çok 5 geçerli davet (fazlası en eskiden silinir)', () => {
  const st = yeniDurum();
  const a = anahtar();
  ykKatil(st, { room: R, cihaz: 'omer', anahtar: a }, ctx());
  const kodlar = [];
  for (let i = 0; i < 7; i++) kodlar.push(ykDavetOlustur(st, kim('omer', a), ctx(T0 + i * 1000)));
  assert.equal(Object.keys(st.davetler).length, 5);
  assert.equal(ykKatil(st, { room: R, cihaz: 'x1', anahtar: anahtar(), davet: kodlar[0] }, ctx(T0 + 9000)).durum, 'bekliyor');
  assert.equal(ykKatil(st, { room: R, cihaz: 'x2', anahtar: anahtar(), davet: kodlar[6] }, ctx(T0 + 9000)).durum, 'onayli');
});

test('öykünme: kurtarma kodu biçimi, tek kullanım, yenisi eskisini geçersiz yapar', () => {
  const st = yeniDurum();
  const a = anahtar();
  ykKatil(st, { room: R, cihaz: 'omer', anahtar: a }, ctx());
  const k1 = ykKurtarmaOlustur(st, kim('omer', a), ctx());
  assert.match(k1, /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}(-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}){3}$/);
  const k2 = ykKurtarmaOlustur(st, kim('omer', a), ctx());
  assert.equal(ykKatil(st, { room: R, cihaz: 'yeni', anahtar: anahtar(), kurtarma: k1 }, ctx()).durum, 'bekliyor');
  assert.equal(ykKatil(st, { room: R, cihaz: 'yeni2', anahtar: anahtar(), kurtarma: k2.toLowerCase().replace(/-/g, '') }, ctx()).durum, 'onayli');
  assert.equal(st.oda.kurtarma, null);
  assert.equal(ykKatil(st, { room: R, cihaz: 'yeni3', anahtar: anahtar(), kurtarma: k2 }, ctx()).durum, 'bekliyor');
  assert.equal(kodu(() => ykKurtarmaOlustur(st, kim('yeni3', anahtar()), ctx())), '42501');
});

test('öykünme: çıkarma satırı siler, kanalı yeniler, korumayı başlatır; kendini çıkarmak serbest', () => {
  const st = yeniDurum();
  const a = anahtar(); const g = anahtar();
  ykKatil(st, { room: R, cihaz: 'omer', anahtar: a, veriVar: true, eskiYazar: true }, ctx()); // eski oda: 3 gün geçiş
  assert.equal(st.oda.zorunlu, new Date(T0 + 3 * GUN).toISOString());
  ykKatil(st, { room: R, cihaz: 'gul', anahtar: g, eskiYazar: true }, ctx()); // geçiş: eski yazar onaylı
  assert.equal(ykDurum(st, kim('gul', g), T0).kanal, R, 'koruma öncesi kanal = oda kodu');
  const eskiKanal = st.oda.kanal;
  assert.equal(ykCikar(st, kim('omer', a), 'gul', ctx(T0 + 5000)), true);
  assert.equal(st.cihazlar.gul, undefined);
  assert.notEqual(st.oda.kanal, eskiKanal);
  assert.equal(st.oda.zorunlu, new Date(T0 + 5000).toISOString());
  assert.equal(ykDurum(st, kim('gul', g), T0 + 6000).durum, 'yok');
  assert.equal(ykDurum(st, kim('omer', a), T0 + 6000).kanal, st.oda.kanal);
  assert.equal(ykCikar(st, kim('omer', a), 'gul', ctx()), false, 'satır yok');
  assert.equal(ykCikar(st, kim('omer', a), 'omer', ctx()), true);
  assert.equal(kodu(() => ykYetki(st, kim('omer', a), T0)), '42501');
});

test('öykünme: veri olan odada onaylı cihaz yoksa kurucu yolu kapalı', () => {
  const st = yeniDurum();
  assert.equal(ykKatil(st, { room: R, cihaz: 'yabanci', anahtar: anahtar(), veriVar: true }, ctx()).durum, 'bekliyor');
});

test('öykünme: sınırlar (8 onaylı, 20 satır) → 54000', () => {
  const st = yeniDurum();
  const a = anahtar();
  ykKatil(st, { room: R, cihaz: 'c0', anahtar: a }, ctx());
  for (let i = 1; i < 8; i++) {
    const kod = ykDavetOlustur(st, kim('c0', a), ctx());
    assert.equal(ykKatil(st, { room: R, cihaz: 'c' + i, anahtar: anahtar(), davet: kod }, ctx()).durum, 'onayli');
  }
  const kod = ykDavetOlustur(st, kim('c0', a), ctx());
  assert.equal(kodu(() => ykKatil(st, { room: R, cihaz: 'c8', anahtar: anahtar(), davet: kod }, ctx())), '54000');
  for (let i = 8; i < 20; i++) ykKatil(st, { room: R, cihaz: 'b' + i, anahtar: anahtar() }, ctx());
  assert.equal(Object.keys(st.cihazlar).length, 20);
  assert.equal(kodu(() => ykKatil(st, { room: R, cihaz: 'fazla', anahtar: anahtar() }, ctx())), '54000');
  assert.equal(kodu(() => ykOnayla(st, kim('c0', a), 'b8', ctx())), '54000');
});

test('ykYetki: geçerli onaylı kimlik geçer, son_gorulme en çok 10 dk\'da bir güncellenir', () => {
  const st = yeniDurum();
  const a = anahtar();
  ykKatil(st, { room: R, cihaz: 'omer', anahtar: a }, ctx());
  const ilk = st.cihazlar.omer.son_gorulme;
  ykYetki(st, kim('omer', a), T0 + 60_000);
  assert.equal(st.cihazlar.omer.son_gorulme, ilk);
  ykYetki(st, kim('omer', a), T0 + 11 * 60_000);
  assert.equal(st.cihazlar.omer.son_gorulme, new Date(T0 + 11 * 60_000).toISOString());
  assert.equal(kodu(() => ykYetki(st, kim('omer', anahtar()), T0)), '42501');
  assert.equal(kodu(() => ykYetki(st, kim('kimse', a), T0)), '42501');
});

test('öykünme: geçerli kurtarma kodu çakışmayı çözer (anahtar yenilenir, onaylanır, kod tükenir); davet çözmez', () => {
  const st = yeniDurum();
  const eski = anahtar();
  ykKatil(st, { room: R, cihaz: 'omer', anahtar: eski }, ctx());
  const kod = ykKurtarmaOlustur(st, kim('omer', eski), ctx());
  const davet = ykDavetOlustur(st, kim('omer', eski), ctx());
  const yeni = anahtar();
  assert.equal(ykKatil(st, { room: R, cihaz: 'omer', anahtar: yeni, davet }, ctx()).durum, 'cakisma', 'davet çakışmayı çözmez');
  assert.equal(ykKatil(st, { room: R, cihaz: 'omer', anahtar: yeni, kurtarma: 'ABCD-EFGH-JKLM-NPQR' }, ctx()).durum, 'cakisma');
  const s = ykKatil(st, { room: R, cihaz: 'omer', anahtar: yeni, kurtarma: kod }, ctx());
  assert.equal(s.durum, 'onayli');
  assert.equal(st.cihazlar.omer.anahtar, yeni);
  assert.equal(st.oda.kurtarma, null);
  assert.equal(ykDurum(st, kim('omer', eski), T0).durum, 'cakisma', 'eski anahtar artık geçmez');
  assert.equal(ykDurum(st, kim('omer', yeni), T0).durum, 'onayli');
  // Reddedilmiş satır da kurtarmayla (yeni anahtarla) onaylanır.
  ykKatil(st, { room: R, cihaz: 'tel', anahtar: anahtar() }, ctx());
  ykReddet(st, kim('omer', yeni), 'tel', ctx());
  const kod2 = ykKurtarmaOlustur(st, kim('omer', yeni), ctx());
  assert.equal(ykKatil(st, { room: R, cihaz: 'tel', anahtar: anahtar(), kurtarma: kod2 }, ctx()).durum, 'onayli');
});

test('öykünme: kişiye bağlı davet — oluşturma kuralları; yalnız o kimlik; çakışmayı çözer, kurtarma kodu kalır; tek kullanım', () => {
  const st = yeniDurum();
  const a = anahtar(); const g = anahtar();
  ykKatil(st, { room: R, cihaz: 'omer', anahtar: a }, ctx());
  ykKatil(st, { room: R, cihaz: 'gul', anahtar: g, davet: ykDavetOlustur(st, kim('omer', a), ctx()) }, ctx());
  const kurtarma = ykKurtarmaOlustur(st, kim('omer', a), ctx());
  const gulDaveti = ykDavetOlustur(st, kim('gul', g), ctx());

  // Oluşturma: biçim; odada kisi belgesi (kisiVar) ya da cihaz satırı olmalı; yetki eskisi gibi.
  assert.equal(kodu(() => ykDavetOlustur(st, kim('omer', a), ctx(), { kimlik: 'kötü id' })), '22023');
  assert.equal(kodu(() => ykDavetOlustur(st, kim('omer', a), ctx(), { kimlik: 'yabanci' })), '22023');
  assert.equal(kodu(() => ykDavetOlustur(st, kim('omer', anahtar()), ctx(), { kimlik: 'gul' })), '42501');
  assert.ok(davetKoduMu(ykDavetOlustur(st, kim('omer', a), ctx(), { kimlik: 'eski-gul', kisiVar: true })));
  const bagli = ykDavetOlustur(st, kim('omer', a), ctx(), { kimlik: 'gul' });
  assert.equal(st.davetler[bagli].kimlik, 'gul');
  assert.equal(st.davetler[gulDaveti].kimlik, null);

  // Başka kimlik kullanamaz: davet yokmuş gibi, harcanmaz.
  assert.equal(ykKatil(st, { room: R, cihaz: 'ali', anahtar: anahtar(), davet: bagli }, ctx()).durum, 'bekliyor');
  assert.equal(st.davetler[bagli].kullanildi, null);

  // Genel davet çakışmayı çözmez.
  const yeni = anahtar();
  const genel = ykDavetOlustur(st, kim('omer', a), ctx());
  assert.equal(ykKatil(st, { room: R, cihaz: 'gul', anahtar: yeni, davet: genel }, ctx()).durum, 'cakisma');
  assert.equal(st.davetler[genel].kullanildi, null);

  // Bağlı davet çözer: anahtar yenilenir, onaylanır, kanal yenilenir; davet harcanır, kurtarma kodu kalır,
  // eski anahtarın davetleri silinir.
  const kanal = st.oda.kanal;
  const kodOnce = st.oda.kurtarma;
  const s = ykKatil(st, { room: R, cihaz: 'gul', anahtar: yeni, davet: bagli, ad: 'Gül · yeni' }, ctx(T0 + 1000));
  assert.equal(s.durum, 'onayli');
  assert.deepEqual([st.cihazlar.gul.anahtar, st.cihazlar.gul.ad], [yeni, 'Gül · yeni']);
  assert.ok(st.davetler[bagli].kullanildi);
  assert.equal(st.oda.kurtarma, kodOnce);
  assert.notEqual(st.oda.kanal, kanal);
  assert.equal(st.davetler[gulDaveti], undefined);
  assert.equal(ykDurum(st, kim('gul', g), T0).durum, 'cakisma', 'eski anahtar artık geçmez');
  assert.equal(kodu(() => ykYetki(st, kim('gul', g), T0)), '42501');
  assert.doesNotThrow(() => ykYetki(st, kim('gul', yeni), T0));

  // Tek kullanım.
  assert.equal(ykKatil(st, { room: R, cihaz: 'gul', anahtar: anahtar(), davet: bagli }, ctx()).durum, 'cakisma');
  // Satırı olmayan kimlik: bağlı davetle yeni onaylı satır.
  const eski = ykDavetOlustur(st, kim('gul', yeni), ctx(), { kimlik: 'eski-gul', kisiVar: true });
  assert.equal(ykKatil(st, { room: R, cihaz: 'eski-gul', anahtar: anahtar(), davet: eski }, ctx()).durum, 'onayli');
  // Kendine bağlı davet.
  const kendi = ykDavetOlustur(st, kim('omer', a), ctx(), { kimlik: 'omer' });
  assert.equal(ykKatil(st, { room: R, cihaz: 'omer', anahtar: anahtar(), davet: kendi }, ctx()).durum, 'onayli');
  // Kurtarma kodu hâlâ geçerli.
  assert.equal(ykKatil(st, { room: R, cihaz: 'gul', anahtar: anahtar(), kurtarma }, ctx()).durum, 'onayli');
  assert.equal(st.oda.kurtarma, null);
});

test('öykünme: geçiş yolu yalnız koruma başlamadan (zorunlu öncesi)', () => {
  const st = yeniDurum();
  const a = anahtar();
  ykKatil(st, { room: R, cihaz: 'omer', anahtar: a, veriVar: true, eskiYazar: true }, ctx()); // zorunlu = T0 + 3 gün
  assert.equal(ykKatil(st, { room: R, cihaz: 'gec', anahtar: anahtar(), eskiYazar: true }, ctx(T0 + 4 * GUN)).durum, 'bekliyor');
  const g = anahtar();
  assert.equal(ykKatil(st, { room: R, cihaz: 'gul', anahtar: g, eskiYazar: true }, ctx(T0 + GUN)).durum, 'onayli');
  // Çıkarılan cihaz geçiş yoluyla geri dönemez: çıkarma korumayı hemen başlatır.
  ykCikar(st, kim('omer', a), 'gul', ctx(T0 + GUN));
  assert.equal(ykKatil(st, { room: R, cihaz: 'gul', anahtar: g, eskiYazar: true }, ctx(T0 + GUN + 1000)).durum, 'bekliyor');
});
