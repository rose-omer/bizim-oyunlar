// Skor tablosu: saf mantık (yama, okuma, metin, tablo, son oynananlar).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SKOR_KIND, SKOR_OYUNLARI, skorAnahtari, skorYamasi, sayaclar, skorOku, toplamMetni, birlikteMetni,
  skorHaritasi, skorTablosu, sonOynananlar, kisilerOf, liderMetni,
} from '../js/core/skor.js';
import { applyPatch } from '../js/core/veri.js';
import { YEDEK_TURLERI } from '../sayfalar/ayarlar/mantik.js';

const AN = new Date(2026, 9, 31, 21, 15); // 31 Ekim 2026, yerel

test('tür ve rekabetçi oyunlar', () => {
  assert.equal(SKOR_KIND, 'skor');
  assert.deepEqual(SKOR_OYUNLARI, ['dama', 'tavla', 'dorttas', 'amiral', 'hafiza']);
  assert.ok(YEDEK_TURLERI.includes('skor'), 'skor yedeğe girer');
});

test('skorAnahtari: clientId ya da berabere; ayrılmış ve bozuk adlar null', () => {
  assert.equal(skorAnahtari('omer-test-id'), 'omer-test-id');
  assert.equal(skorAnahtari(null), 'berabere');
  assert.equal(skorAnahtari(undefined), 'berabere');
  assert.equal(skorAnahtari('son'), null);
  assert.equal(skorAnahtari('berabere'), null);
  assert.equal(skorAnahtari('y2026'), null);
  assert.equal(skorAnahtari('a.b'), null);
  assert.equal(skorAnahtari(''), null);
  assert.equal(skorAnahtari(3), null);
});

test('skorYamasi: yalnız ilgili alan + 1, yıl sayacı ve son sonuç', () => {
  const p = skorYamasi({ ali: 4, ayse: 2, y2026: { ali: 1 } }, 'ali', AN);
  assert.deepEqual(p, { ali: 5, 'y2026.ali': 2, son: { kazanan: 'ali', at: AN.toISOString() } });
  // İlk oyun: boş veri.
  assert.deepEqual(skorYamasi(undefined, 'ayse', AN), { ayse: 1, 'y2026.ayse': 1, son: { kazanan: 'ayse', at: AN.toISOString() } });
  // Berabere.
  assert.deepEqual(skorYamasi({ berabere: 2 }, null, AN), { berabere: 3, 'y2026.berabere': 1, son: { kazanan: null, at: AN.toISOString() } });
  // Bozuk sayı sıfırdan başlar; geçersiz kazanan yazılmaz.
  assert.equal(skorYamasi({ ali: 'x' }, 'ali', AN).ali, 1);
  assert.equal(skorYamasi({}, 'son', AN), null);
});

test('skorYamasi + applyPatch: öbür kişinin sayacı ve öbür yıllar korunur', () => {
  const once = { ali: 4, ayse: 2, berabere: 1, y2025: { ali: 4 }, y2026: { ayse: 2 } };
  const sonra = applyPatch(once, skorYamasi(once, 'ayse', AN));
  assert.equal(sonra.ali, 4);
  assert.equal(sonra.ayse, 3);
  assert.deepEqual(sonra.y2025, { ali: 4 });
  assert.deepEqual(sonra.y2026, { ayse: 3 });
});

test('sayaclar: yalnız sayılar; yil verilirse o yılın sayaçları', () => {
  const d = { ali: 5, ayse: 3, berabere: 1, son: { kazanan: 'ali' }, y2026: { ali: 2, berabere: 1 }, bozuk: 'x', eksi: -2 };
  assert.deepEqual(sayaclar(d), { ali: 5, ayse: 3, berabere: 1 });
  assert.deepEqual(sayaclar(d, { yil: 2026 }), { ali: 2, berabere: 1 });
  assert.deepEqual(sayaclar(d, { yil: 2024 }), {});
  assert.deepEqual(sayaclar(null), {});
});

test('skorOku: iki kişinin galibiyeti, berabere, toplam', () => {
  const d = { ali: 5, ayse: 3, berabere: 1 };
  assert.deepEqual(skorOku(d, ['ali', 'ayse']), { kisiler: [{ id: 'ali', n: 5 }, { id: 'ayse', n: 3 }], berabere: 1, toplam: 9 });
  assert.deepEqual(skorOku(undefined, ['ali', 'ayse']).toplam, 0);
});

test('birlikteMetni: ortak toplam; tr-TR sayı; birim; 0 → boş', () => {
  assert.equal(birlikteMetni(24), 'Birlikte 24 oyun oynadık');
  assert.equal(birlikteMetni(1356), 'Birlikte 1.356 oyun oynadık');
  assert.equal(birlikteMetni(9, 'kez'), 'Birlikte 9 kez oynadık');
  assert.equal(birlikteMetni(0), '');
  assert.equal(birlikteMetni(undefined), '');
});

test('toplamMetni: üstte ortak toplam, altında kişi başı; berabere varsa eklenir; hiç oyun yoksa boş', () => {
  const k = [{ id: 'ali', ad: 'Ömer' }, { id: 'ayse', ad: 'Gül' }];
  assert.equal(toplamMetni({ ali: 5, ayse: 3 }, k), 'Birlikte 8 kez oynadık\nÖmer 5 · Gül 3');
  assert.equal(toplamMetni({ ali: 5, ayse: 3, berabere: 2 }, k), 'Birlikte 10 kez oynadık\nÖmer 5 · Gül 3 · 2 berabere');
  assert.equal(toplamMetni({ ali: 1 }, [{ id: 'ali', ad: 'Ömer' }, { id: 'ayse', ad: '' }]), 'Birlikte 1 kez oynadık\nÖmer 1 · Sevgilin 0');
  assert.equal(toplamMetni({}, k), '');
  assert.equal(toplamMetni(null, k), '');
});

const doc = (id, data, updated_at = '2026-10-30T10:00:00.000Z') => ({ id, data, created_at: updated_at, updated_at });

test('skorHaritasi: belgeler → { oyun: data }', () => {
  assert.deepEqual(skorHaritasi([doc('dama', { ali: 1 }), doc('tavla', { ayse: 2 })]), { dama: { ali: 1 }, tavla: { ayse: 2 } });
  assert.deepEqual(skorHaritasi(null), {});
});

test('skorTablosu: kayıtlı oyunlar sırayla, veride olan başka oyun sonda; genel toplam', () => {
  const h = { tavla: { ali: 2, ayse: 1 }, dama: { ayse: 4, berabere: 1 }, yenioyun: { ali: 1 } };
  const t = skorTablosu(h, ['ali', 'ayse']);
  assert.deepEqual(t.oyunlar.map((o) => o.oyun), ['dama', 'tavla', 'dorttas', 'amiral', 'hafiza', 'yenioyun']);
  assert.deepEqual(t.oyunlar[0], { oyun: 'dama', kisiler: [0, 4], berabere: 1, toplam: 5, son: null });
  assert.deepEqual(t.oyunlar[2], { oyun: 'dorttas', kisiler: [0, 0], berabere: 0, toplam: 0, son: null });
  assert.deepEqual(t.genel, { kisiler: [3, 5], berabere: 1, toplam: 9 });
  // Yıl süzgeci.
  const y = skorTablosu({ dama: { ali: 9, y2026: { ali: 2 } } }, ['ali', 'ayse'], { yil: 2026 });
  assert.deepEqual(y.genel, { kisiler: [2, 0], berabere: 0, toplam: 2 });
});

test('sonOynananlar: son sonuca göre yeniden eskiye; sonu olmayan atlanır', () => {
  const h = {
    dama: { son: { kazanan: 'ali', at: '2026-10-29T10:00:00.000Z' } },
    tavla: { son: { kazanan: null, at: '2026-10-30T10:00:00.000Z' } },
    amiral: { ali: 1 },
    hafiza: { son: { kazanan: 'ayse', at: 'bozuk' } },
  };
  assert.deepEqual(sonOynananlar(h), [
    { oyun: 'tavla', kazanan: null, at: '2026-10-30T10:00:00.000Z' },
    { oyun: 'dama', kazanan: 'ali', at: '2026-10-29T10:00:00.000Z' },
  ]);
  assert.equal(sonOynananlar(h, 1).length, 1);
});

test('kisilerOf: ben + partner; partner bilinmiyorsa verideki öbür kişi', () => {
  assert.deepEqual(kisilerOf({}, 'ali', 'ayse'), ['ali', 'ayse']);
  assert.deepEqual(kisilerOf({ dama: { ali: 1, ayse: 2, berabere: 1, y2026: { ayse: 1 } } }, 'ali', null), ['ali', 'ayse']);
  assert.deepEqual(kisilerOf({ dama: { ali: 1 } }, 'ali', null), ['ali', null]);
});

test('liderMetni: önde olan ve fark; eşitlikte başa baş; oyun yoksa boş', () => {
  assert.equal(liderMetni([5, 3], ['Ömer', 'Gül']), 'Ömer önde, 2 galibiyet farkla');
  assert.equal(liderMetni([3, 4], ['Ömer', 'Gül']), 'Gül önde, 1 galibiyet farkla');
  assert.equal(liderMetni([2, 2], ['Ömer', 'Gül']), 'Başa baş gidiyorsunuz');
  assert.equal(liderMetni([0, 0], ['Ömer', 'Gül']), '');
});
