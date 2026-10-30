import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as D from '../games/duello/oyun.js';
import { seat, isNewer } from '../games/duello/koltuk.js';

const A = 'aaa';
const B = 'bbb';
const yeni = () => D.initialState({ players: [A, B], names: { [A]: 'Ömer', [B]: 'Gül' }, now: 1000, kimlik: 7 });
const act = (s, intent, by, ctx = {}) => {
  const a = D.toAction(intent, by, s, { hostId: A, now: 2000, seed: 99, ...ctx });
  return a ? D.reduce(s, a) : s;
};
// A'nın kelimesi "kalem" (B bulmaya çalışır), B'nin kelimesi "kitap" (A bulmaya çalışır).
const basla = () => act(act(yeni(), { type: 'sec', kelime: 'kalem' }, A), { type: 'sec', kelime: 'kitap' }, B);

test('trBuyuk / trKucuk: i→İ, ı→I ve tersi', () => {
  assert.equal(D.trBuyuk('ılık iğne'), 'ILIK İĞNE');
  assert.equal(D.trBuyuk('çöşüğ'), 'ÇÖŞÜĞ');
  assert.equal(D.trKucuk('ILIK İĞNE'), 'ılık iğne');
  assert.equal(D.trKucuk('İnci'), 'inci');
  assert.equal(D.trKucuk('KİTAP'), 'kitap');
  assert.equal(D.trKucuk('IRMAK'), 'ırmak');
});

test('harfMi: yalnız Türk alfabesi (q w x yok)', () => {
  for (const h of 'abcçdefgğhıijklmnoöprsştuüvyz') assert.ok(D.harfMi(h), h);
  for (const h of ['q', 'w', 'x', 'A', 'İ', '1', ' ', 'ab', '']) assert.equal(D.harfMi(h), false, h);
});

test('normalizeTus: fiziksel klavye harfini tr küçüğe çevirir', () => {
  assert.equal(D.normalizeTus('İ'), 'i');
  assert.equal(D.normalizeTus('I'), 'ı');
  assert.equal(D.normalizeTus('Ş'), 'ş');
  assert.equal(D.normalizeTus('q'), null);
  assert.equal(D.normalizeTus('Enter'), null);
});

test('geriBildirim: doğru yer, var, yok', () => {
  assert.equal(D.geriBildirim('kalem', 'kalem'), 'ddddd');
  assert.equal(D.geriBildirim('melek', 'kalem'), 'vyddv');
  assert.equal(D.geriBildirim('titiz', 'kitap'), 'yddyy');
});

test('geriBildirim: tekrarlı harf kuralı', () => {
  // gizlide tek "a" var (2. sırada değil): ilk fazla "a" var, ikincisi yok
  assert.equal(D.geriBildirim('dalga', 'dolap'), 'dvdyy');
  // doğru yerdeki harf önce sayılır; kalan yoksa "yok"
  assert.equal(D.geriBildirim('aaaaa', 'anane'), 'dydyy');
  assert.equal(D.geriBildirim('kekik', 'kemik'), 'ddydd');
  // iki "e" gizlide de iki kez
  assert.equal(D.geriBildirim('esnek', 'erkek'), 'dyydd');
  assert.equal(D.geriBildirim('ekmek', 'erkek'), 'dvydd');
});

test('geriBildirim: ç/c, ı/i, ğ/g ayrı harflerdir', () => {
  assert.equal(D.geriBildirim('çilek', 'çiçek'), 'ddydd');
  assert.equal(D.geriBildirim('irmik', 'ırmak'), 'yddyd');
  assert.equal(D.geriBildirim('cacık', 'çaçık'), 'ydydd');
});

test('klavyeDurumu: her harf için en iyi bilgi (d > v > y)', () => {
  const k = D.klavyeDurumu([{ k: 'melek', r: 'vyddv' }, { k: 'kalem', r: 'ddddd' }]);
  assert.equal(k.k, 'd');
  assert.equal(k.m, 'd');
  assert.equal(k.e, 'd');
  const k2 = D.klavyeDurumu([{ k: 'melek', r: 'vyddv' }]);
  assert.equal(k2.m, 'v');
  assert.equal(k2.e, 'd', 'bir yerde doğru olan harf doğru kalır');
  assert.equal(k2.k, 'v');
  assert.deepEqual(D.klavyeDurumu([{ r: 'ddddd' }]), {}, 'harfsiz satır yok sayılır');
});

test('başlangıç durumu: seçim fazı, gizli yok', () => {
  const s = yeni();
  assert.equal(s.kind, 'duello');
  assert.equal(s.v, 1);
  assert.equal(s.faz, 'secim');
  assert.deepEqual(s.hazir, [false, false]);
  assert.deepEqual(s.gizli, [null, null]);
  assert.deepEqual(s.tahmin, [[], []]);
  assert.equal(s.kimlik, 7);
});

test('seçim: sözlükte olmayan kelime ve yabancı kişi reddedilir; ikisi seçince başlar', () => {
  let s = yeni();
  assert.equal(act(s, { type: 'sec', kelime: 'abcde' }, A), s, 'sözlükte yok');
  assert.equal(act(s, { type: 'sec', kelime: 'kalem' }, 'zzz'), s, 'oyuncu değil');
  s = act(s, { type: 'sec', kelime: 'KALEM' }, A);
  assert.deepEqual(s.hazir, [true, false]);
  assert.equal(s.gizli[0], 'kalem', 'büyük harf tr küçüğe iner');
  assert.equal(s.faz, 'secim');
  const s2 = act(s, { type: 'sec', kelime: 'kitap' }, B);
  assert.equal(s2.faz, 'oyun');
  assert.ok(s2.seq > s.seq);
});

test('seçim: hazırken kelime değiştirilebilir (karşı taraf seçmeden)', () => {
  let s = act(yeni(), { type: 'sec', kelime: 'kalem' }, A);
  s = act(s, { type: 'sec', kelime: 'deniz' }, A);
  assert.equal(s.gizli[0], 'deniz');
  assert.equal(s.faz, 'secim');
});

test('tahmin: geri bildirim karşının kelimesine göre; sözlük ve tekrar denetimi', () => {
  let s = basla();
  assert.equal(act(s, { type: 'tahmin', kelime: 'xyzab' }, A), s, 'sözlükte yok');
  s = act(s, { type: 'tahmin', kelime: 'kitle' }, A); // A, B'nin "kitap"ını arıyor
  assert.deepEqual(s.tahmin[0], [{ k: 'kitle', r: 'dddyy' }]);
  assert.equal(act(s, { type: 'tahmin', kelime: 'kitle' }, A), s, 'aynı tahmin iki kez olmaz');
  s = act(s, { type: 'tahmin', kelime: 'melek' }, B); // B, A'nın "kalem"ini arıyor
  assert.deepEqual(s.tahmin[1], [{ k: 'melek', r: 'vyddv' }]);
  assert.equal(s.faz, 'oyun');
});

test('tahmin: seçim fazında ve bitince kabul edilmez', () => {
  const s = act(yeni(), { type: 'sec', kelime: 'kalem' }, A);
  assert.equal(act(s, { type: 'tahmin', kelime: 'kitap' }, A), s);
});

test('sonuç: daha az denemede bulan kazanır; erken karar', () => {
  let s = basla();
  s = act(s, { type: 'tahmin', kelime: 'kitap' }, A); // A 1. denemede buldu
  assert.equal(s.faz, 'oyun', 'B hâlâ eşitleyebilir');
  assert.equal(act(s, { type: 'tahmin', kelime: 'deniz' }, A), s, 'bulan bir daha tahmin etmez');
  s = act(s, { type: 'tahmin', kelime: 'melek' }, B); // B 1. denemede bulamadı → A kazandı
  assert.equal(s.faz, 'bitti');
  assert.equal(s.sonuc.kazanan, 0);
  assert.deepEqual(s.sonuc.puan, [1, null]);
});

test('sonuç: aynı denemede bulan ikisi berabere', () => {
  let s = basla();
  s = act(s, { type: 'tahmin', kelime: 'deniz' }, A);
  s = act(s, { type: 'tahmin', kelime: 'kitap' }, A); // A: 2
  s = act(s, { type: 'tahmin', kelime: 'melek' }, B);
  assert.equal(s.faz, 'oyun');
  s = act(s, { type: 'tahmin', kelime: 'kalem' }, B); // B: 2
  assert.equal(s.faz, 'bitti');
  assert.equal(s.sonuc.kazanan, -1);
  assert.deepEqual(s.sonuc.puan, [2, 2]);
});

test('sonuç: 6 hakta bulamayan; ikisi de bulamazsa berabere', () => {
  const yanlis = ['deniz', 'güneş', 'şeker', 'bahar', 'çiçek', 'limon'];
  let s = basla();
  for (const k of yanlis) s = act(s, { type: 'tahmin', kelime: k }, A);
  assert.equal(s.tahmin[0].length, D.HAK);
  assert.equal(act(s, { type: 'tahmin', kelime: 'kitap' }, A), s, 'hak bitti');
  assert.equal(s.faz, 'oyun', 'B bulursa kazanır');
  for (const k of yanlis) s = act(s, { type: 'tahmin', kelime: k }, B);
  assert.equal(s.faz, 'bitti');
  assert.equal(s.sonuc.kazanan, -1);
  assert.deepEqual(s.sonuc.puan, [null, null]);
});

test('sonuç: biri 6 hakta bulamadıysa öbürü bulunca kazanır', () => {
  let s = basla();
  for (const k of ['deniz', 'güneş', 'şeker', 'bahar', 'çiçek', 'limon']) s = act(s, { type: 'tahmin', kelime: k }, A);
  s = act(s, { type: 'tahmin', kelime: 'kalem' }, B);
  assert.equal(s.faz, 'bitti');
  assert.equal(s.sonuc.kazanan, 1);
  assert.deepEqual(s.sonuc.puan, [null, 1]);
});

test('gorunum: gizli kelimeler gitmez; karşının harfleri gizli, renkleri açık', () => {
  let s = basla();
  s = act(s, { type: 'tahmin', kelime: 'kitle' }, A);
  s = act(s, { type: 'tahmin', kelime: 'melek' }, B);
  const v = D.gorunum(s, B); // misafir B'nin gördüğü
  const json = JSON.stringify(v);
  assert.equal('gizli' in v, false);
  assert.equal(json.includes('kalem'), false, 'A’nın kelimesi B’ye gitmez');
  assert.equal(json.includes('kitle'), false, 'A’nın tahmin harfleri B’ye gitmez');
  assert.deepEqual(v.tahmin[0], [{ r: 'dddyy' }]);
  assert.deepEqual(v.tahmin[1], [{ k: 'melek', r: 'vyddv' }]);
  assert.equal(v.kendi, 'kitap', 'kendi kelimesini görür');
  assert.deepEqual(v.eksik, [false, false]);
});

test('gorunum: ev sahibi arayüzü de misafirin kelimesini almaz', () => {
  const v = D.gorunum(basla(), A);
  assert.equal(JSON.stringify(v).includes('kitap'), false);
  assert.equal(v.kendi, 'kalem');
});

test('gorunum: kayıt görünümü (izleyen yok) gizlisizdir, tahmin harfleri durur', () => {
  let s = act(basla(), { type: 'tahmin', kelime: 'kitle' }, A);
  const v = D.gorunum(s, null);
  const json = JSON.stringify(v);
  assert.equal(json.includes('kalem'), false);
  assert.equal(json.includes('kitap'), false);
  assert.equal(v.kendi, undefined);
  assert.deepEqual(v.tahmin[0], [{ k: 'kitle', r: 'dddyy' }]);
});

test('gorunum: yabancı izleyici harf görmez', () => {
  const s = act(basla(), { type: 'tahmin', kelime: 'kitle' }, A);
  const v = D.gorunum(s, 'zzz');
  assert.deepEqual(v.tahmin[0], [{ r: 'dddyy' }]);
});

test('gorunum: bitince iki kelime ve tüm harfler açılır', () => {
  let s = basla();
  s = act(s, { type: 'tahmin', kelime: 'kitap' }, A);
  s = act(s, { type: 'tahmin', kelime: 'melek' }, B);
  const v = D.gorunum(s, B);
  assert.deepEqual(v.acik, ['kalem', 'kitap']);
  assert.deepEqual(v.tahmin[0], [{ k: 'kitap', r: 'ddddd' }]);
});

test('kayıttan dönüş: gizli eksikse tahmin beklemede; sahibi yeniden yollar, tutarlılık denetlenir', () => {
  let s = act(basla(), { type: 'tahmin', kelime: 'melek' }, B); // B, "kalem"e karşı vyddv aldı
  // Kayda yazılan görünümden yeni ev sahibi kurulur: gizliler yok.
  const kayit = D.gorunum(s, null);
  let t = D.reduce(s, { type: 'load', s: { ...D.kayittanDurum(kayit), seq: s.seq + 1 } });
  assert.deepEqual(t.gizli, [null, null]);
  assert.deepEqual(D.gorunum(t, B).eksik, [true, true]);
  assert.equal(act(t, { type: 'tahmin', kelime: 'kalem' }, B), t, 'gizli yokken tahmin işlenmez');
  // A yanlış (tutarsız) kelime yollarsa reddedilir: "melek" → "vyddv" vermeli
  assert.equal(act(t, { type: 'sec', kelime: 'deniz' }, A), t);
  t = act(t, { type: 'sec', kelime: 'kalem' }, A);
  assert.equal(t.gizli[0], 'kalem');
  assert.equal(t.faz, 'oyun', 'oyun sürüyor');
  // Ev sahibi kendi cihazındaki misafir kelimesini idx ile geri koyar; misafir idx veremez
  assert.equal(act(t, { type: 'sec', kelime: 'kitap', idx: 1 }, B).gizli[1], 'kitap', 'B kendi idx’i');
  assert.equal(act(t, { type: 'sec', kelime: 'kitap', idx: 0 }, B), t, 'B, A’nın yerine yazamaz');
  t = act(t, { type: 'sec', kelime: 'kitap', idx: 1 }, A);
  assert.equal(t.gizli[1], 'kitap');
  t = act(t, { type: 'tahmin', kelime: 'kalem' }, B);
  assert.equal(t.tahmin[1].at(-1).r, 'ddddd');
});

test('oyun sırasında seçilmiş kelime değişmez', () => {
  const s = basla();
  assert.equal(act(s, { type: 'sec', kelime: 'deniz' }, A), s);
});

test('yeni: aynı oyun numarasında bir kez; yeni kimlik', () => {
  const s = basla();
  const t = act(s, { type: 'yeni', no: s.no }, B);
  assert.equal(t.no, s.no + 1);
  assert.equal(t.faz, 'secim');
  assert.equal(t.kimlik, 99);
  assert.deepEqual(t.gizli, [null, null]);
  assert.equal(act(t, { type: 'yeni', no: s.no }, A), t, 'eski numarayla ikinci istek yok sayılır');
  assert.ok(t.seq > s.seq);
});

test('toAction: seat ve load yalnız ev sahibinden', () => {
  const s = yeni();
  assert.equal(D.toAction({ type: 'seat', ids: [A, 'ccc'] }, B, s, { hostId: A }), null);
  assert.equal(D.toAction({ type: 'load', s }, B, s, { hostId: A }), null);
  assert.ok(D.toAction({ type: 'seat', ids: [A, 'ccc'] }, A, s, { hostId: A }));
  assert.equal(D.toAction({ type: 'bilinmez' }, A, s, { hostId: A }), null);
});

test('seat: yer tutucunun yerine partner oturur, seq artar', () => {
  const s = D.initialState({ players: [A, '?'], names: { [A]: 'Ömer' }, now: 1, kimlik: 1 });
  const t = seat(s, [A, B], { [B]: 'Gül' });
  assert.deepEqual(t.players, [A, B]);
  assert.equal(t.names[B], 'Gül');
  assert.equal(t.seq, s.seq + 1);
  assert.equal(seat(t, [A, B], {}), t, 'değişiklik yoksa aynı nesne');
  // yeni cihazdan gelen (A yok, B var) A'nın koltuğuna oturur
  const u = seat(t, ['yeni', B], {});
  assert.deepEqual(u.players, ['yeni', B]);
});

test('isNewer: seq büyük olan yenidir', () => {
  assert.equal(isNewer({ seq: 3 }, { seq: 2 }), true);
  assert.equal(isNewer({ seq: 2 }, { seq: 3 }), false);
  assert.equal(isNewer(null, { seq: 1 }), false);
});

test('load: yalnız daha yeni ve aynı türde durum benimsenir', () => {
  const s = yeni();
  assert.equal(D.reduce(s, { type: 'load', s: { ...s, seq: s.seq + 1, kind: 'dama' } }), s);
  assert.equal(D.reduce(s, { type: 'load', s: { ...s, seq: s.seq - 1 } }), s);
  const n = { ...s, seq: s.seq + 5 };
  assert.equal(D.reduce(s, { type: 'load', s: n }), n);
});

test('kayittanDurum: eksik alanlar tamamlanır, gizli boş başlar', () => {
  const k = D.gorunum(basla(), null);
  const s = D.kayittanDurum(k);
  assert.deepEqual(s.gizli, [null, null]);
  assert.equal('eksik' in s, false);
  assert.equal('kendi' in s, false);
});

test('gecerliKayit: biçimi bozuk kayıt reddedilir', () => {
  assert.equal(D.gecerliKayit(D.gorunum(basla(), null)), true);
  assert.equal(D.gecerliKayit({ kind: 'duello', v: 1, players: ['a'] }), false);
  assert.equal(D.gecerliKayit(null), false);
});

test('resultOf: kısa özet', () => {
  let s = basla();
  s = act(s, { type: 'tahmin', kelime: 'kitap' }, A);
  s = act(s, { type: 'tahmin', kelime: 'melek' }, B);
  assert.deepEqual(D.resultOf(s), { kazanan: 0, puan: [1, null], deneme: [1, 1], no: s.no });
});
