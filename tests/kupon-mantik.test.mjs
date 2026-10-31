import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BASLIK_MAX, ACIKLAMA_MAX, SABLONLAR, EMOJILER, sablonById, emojiSecenekleri, kuponDogrula, kuponVerisi,
  yon, suresiDoldu, gorunum, kullanabilir, tamamlayabilir, kullanYamasi, tamamYamasi, geriAlYamasi,
  bolumler, rozetler, sonTarihYazi, bildirimMetni, renkSirasi,
} from '../sayfalar/kupon/mantik.js';
import { SAYFALAR } from '../js/core/games.js';
import { YEDEK_TURLERI } from '../sayfalar/ayarlar/mantik.js';

const BUGUN = '2026-10-31';
const SIMDI = new Date(2026, 9, 31, 20, 0, 0);
let seq = 0;
const kupon = (data, ek = {}) => {
  seq += 1;
  const at = new Date(2026, 9, 1 + (seq % 25)).toISOString();
  return {
    id: `k${seq}`, author: data.veren, created_at: at, updated_at: at,
    data: { baslik: 'Masaj', emoji: '💆', veren: 'omer', alan: 'gul', durum: 'verildi', verildi: at, ...data },
    ...ek,
  };
};

test('kayıtlar: SAYFALAR "kupon" ve yedekte "kupon"', () => {
  const s = SAYFALAR.find((x) => x.id === 'kupon');
  assert.equal(s.path, 'sayfalar/kupon/');
  assert.equal(s.title, 'Aşk Kuponları');
  assert.equal(s.icon, '🎟️');
  assert.ok(YEDEK_TURLERI.includes('kupon'));
});

test('şablonlar: 20 hazır kupon, kimlikleri tekil, metinler sınırda', () => {
  assert.equal(SABLONLAR.length, 20);
  assert.equal(new Set(SABLONLAR.map((s) => s.id)).size, 20);
  for (const s of SABLONLAR) {
    assert.ok(s.emoji && s.baslik && s.aciklama, s.id);
    assert.ok([...s.baslik].length <= BASLIK_MAX, s.id);
    assert.ok([...s.aciklama].length <= ACIKLAMA_MAX, s.id);
  }
  for (const ad of ['Yatağa kahvaltı', 'Masaj', 'Film seçme hakkı', 'Bulaşık benden', 'Bir dilek', 'Sarılma seansı']) {
    assert.ok(SABLONLAR.some((s) => s.baslik === ad), ad);
  }
  assert.equal(sablonById('masaj').baslik, 'Masaj');
  assert.equal(sablonById('yok'), null);
});

test('emojiSecenekleri: seçili emoji başta ve tekrar yok', () => {
  assert.ok(EMOJILER.length >= 8);
  const l = emojiSecenekleri('🥐');
  assert.equal(l[0], '🥐');
  assert.equal(new Set(l).size, l.length);
  assert.deepEqual(emojiSecenekleri(EMOJILER[2]), EMOJILER);
  assert.deepEqual(emojiSecenekleri(''), EMOJILER);
});

test('kuponDogrula: başlık zorunlu, uzunluk ve son tarih denetlenir', () => {
  assert.equal(kuponDogrula({ baslik: 'Masaj', emoji: '💆' }, BUGUN), null);
  assert.match(kuponDogrula({ baslik: '   ', emoji: '💆' }, BUGUN), /ad/i);
  assert.match(kuponDogrula({ baslik: 'x'.repeat(BASLIK_MAX + 1), emoji: '💆' }, BUGUN), /en çok/);
  assert.match(kuponDogrula({ baslik: 'A', emoji: '💆', aciklama: 'y'.repeat(ACIKLAMA_MAX + 1) }, BUGUN), /Açıklama/);
  assert.match(kuponDogrula({ baslik: 'A', emoji: '' }, BUGUN), /emoji/i);
  assert.equal(kuponDogrula({ baslik: 'A', emoji: '💆', son: BUGUN }, BUGUN), null);
  assert.match(kuponDogrula({ baslik: 'A', emoji: '💆', son: '2026-10-30' }, BUGUN), /geçmiş/);
  assert.match(kuponDogrula({ baslik: 'A', emoji: '💆', son: '2026-13-01' }, BUGUN), /tarih/);
});

test('kuponVerisi: alanlar kırpılır, boş isteğe bağlılar yazılmaz', () => {
  const d = kuponVerisi({ baslik: '  Masaj ', emoji: '💆', aciklama: '  ', son: '' }, { veren: 'omer', alan: 'gul', simdi: SIMDI });
  assert.deepEqual(d, { baslik: 'Masaj', emoji: '💆', veren: 'omer', alan: 'gul', durum: 'verildi', verildi: SIMDI.toISOString() });
  const d2 = kuponVerisi({ baslik: 'Film', emoji: '🎬', aciklama: ' Bu akşam ', son: '2026-11-30' }, { veren: 'omer', alan: 'gul', simdi: SIMDI });
  assert.equal(d2.aciklama, 'Bu akşam');
  assert.equal(d2.son, '2026-11-30');
});

test('yon: veren bensem verdiğim, değilse bana', () => {
  const k = kupon({ veren: 'omer', alan: 'gul' });
  assert.equal(yon(k, 'omer'), 'verdigim');
  assert.equal(yon(k, 'gul'), 'bana');
});

test('gorunum ve süre: son gün dahil geçerli, sonrası süresi doldu', () => {
  assert.equal(gorunum({ durum: 'verildi' }, BUGUN), 'hazir');
  assert.equal(gorunum({ durum: 'verildi', son: BUGUN }, BUGUN), 'hazir');
  assert.equal(suresiDoldu({ durum: 'verildi', son: '2026-10-30' }, BUGUN), true);
  assert.equal(gorunum({ durum: 'verildi', son: '2026-10-30' }, BUGUN), 'suresi');
  assert.equal(gorunum({ durum: 'kullanildi', son: '2026-10-30' }, BUGUN), 'kullanildi'); // kullanıldıktan sonra süre önemsiz
  assert.equal(gorunum({ durum: 'tamam' }, BUGUN), 'tamam');
  assert.equal(gorunum({ durum: 'bilinmeyen' }, BUGUN), 'hazir');
});

test('kullanabilir / tamamlayabilir: yalnız doğru kişi ve doğru durumda', () => {
  const hazir = kupon({});
  assert.equal(kullanabilir(hazir, 'gul', BUGUN), true);
  assert.equal(kullanabilir(hazir, 'omer', BUGUN), false); // kendi verdiğini kullanamaz
  assert.equal(kullanabilir(kupon({ son: '2026-10-01' }), 'gul', BUGUN), false);
  const kul = kupon({ durum: 'kullanildi' });
  assert.equal(kullanabilir(kul, 'gul', BUGUN), false);
  assert.equal(tamamlayabilir(kul, 'omer'), true);
  assert.equal(tamamlayabilir(kul, 'gul'), false);
  assert.equal(tamamlayabilir(hazir, 'omer'), false);
});

test('yamalar: kullan, tamam, geri al', () => {
  assert.deepEqual(kullanYamasi(SIMDI), { durum: 'kullanildi', kullanildi: SIMDI.toISOString() });
  assert.deepEqual(tamamYamasi(SIMDI), { durum: 'tamam', tamam: SIMDI.toISOString() });
  assert.deepEqual(geriAlYamasi(), { durum: 'kullanildi', tamam: null });
});

test('bolumler: bana verilenlerde kullanılabilir, kullanılan ve biten ayrı', () => {
  const a = kupon({ baslik: 'A' });
  const b = kupon({ baslik: 'B', son: '2026-11-02' });
  const c = kupon({ baslik: 'C', durum: 'kullanildi', kullanildi: '2026-10-20T10:00:00.000Z' });
  const d = kupon({ baslik: 'D', durum: 'tamam', tamam: '2026-10-21T10:00:00.000Z' });
  const e = kupon({ baslik: 'E', son: '2026-10-01' });
  const benim = kupon({ baslik: 'F', veren: 'gul', alan: 'omer' });
  const sec = bolumler([a, b, c, d, e, benim], 'gul', 'bana', BUGUN);
  assert.deepEqual(sec.map((s) => s.id), ['hazir', 'kullanildi', 'bitti']);
  assert.deepEqual(sec[0].docs.map((x) => x.data.baslik), ['B', 'A']); // son tarihi yakın olan önce
  assert.deepEqual(sec[1].docs.map((x) => x.data.baslik), ['C']);
  assert.deepEqual(sec[2].docs.map((x) => x.data.baslik).sort(), ['D', 'E']);
});

test('bolumler: verdiklerimde önce yerine getirilecekler; boş bölüm gelmez', () => {
  const a = kupon({ baslik: 'A' });
  const c = kupon({ baslik: 'C', durum: 'kullanildi', kullanildi: '2026-10-20T10:00:00.000Z' });
  const sec = bolumler([a, c], 'omer', 'verdiklerim', BUGUN);
  assert.deepEqual(sec.map((s) => s.id), ['kullanildi', 'hazir']);
  assert.ok(sec.every((s) => s.baslik));
  assert.deepEqual(bolumler([], 'omer', 'verdiklerim', BUGUN), []);
});

test('rozetler: bana kullanılabilir sayısı, verdiklerimde bekleyen söz sayısı', () => {
  const docs = [kupon({}), kupon({}), kupon({ durum: 'kullanildi' }), kupon({ son: '2026-10-01' })];
  assert.deepEqual(rozetler(docs, 'gul', BUGUN), { bana: 2, verdiklerim: 0 });
  assert.deepEqual(rozetler(docs, 'omer', BUGUN), { bana: 0, verdiklerim: 1 });
});

test('sonTarihYazi', () => {
  assert.equal(sonTarihYazi(null, BUGUN), '');
  assert.equal(sonTarihYazi(BUGUN, BUGUN), 'Bugün son gün');
  assert.equal(sonTarihYazi('2026-11-01', BUGUN), 'Yarın son gün');
  assert.equal(sonTarihYazi('2026-11-05', BUGUN), '5 gün kaldı');
  assert.equal(sonTarihYazi('2026-12-24', BUGUN), 'Son gün 24 Aralık');
  assert.equal(sonTarihYazi('2027-02-14', BUGUN), 'Son gün 14 Şubat 2027');
  assert.equal(sonTarihYazi('2026-10-30', BUGUN), 'Süresi doldu');
});

test('bildirimMetni: verildi, kullanıldı, tamam', () => {
  const data = { baslik: 'Masaj', emoji: '💆' };
  assert.deepEqual(bildirimMetni('kullanildi', 'Gül', data), { baslik: 'Kupon kullanıldı 🎟️', metin: "Gül 'Masaj' kuponunu kullandı 💆" });
  assert.match(bildirimMetni('verildi', 'Ömer', data).metin, /Ömer.*Masaj/);
  assert.match(bildirimMetni('tamam', 'Ömer', data).metin, /Ömer.*Masaj/);
  assert.match(bildirimMetni('kullanildi', '', data).metin, /^Sevgilin/);
});

test('renkSirasi: kimliğe göre kararlı 1–6', () => {
  const r = renkSirasi('abc');
  assert.equal(r, renkSirasi('abc'));
  for (const id of ['a', 'b', 'k1', 'uuid-123', '']) {
    const n = renkSirasi(id);
    assert.ok(n >= 1 && n <= 6, id);
  }
});
