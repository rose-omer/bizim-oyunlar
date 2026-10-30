// Yılımız: uzun türleri (mesaj, dokunuş) o yılın başına ya da sınıra dek geri yükleme.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeStore } from '../js/core/identity.js';
import { openCollection } from '../js/core/veri.js';
import { geriYukle, ilerlemeOrani } from '../sayfalar/yilimiz/yukle.js';

writeStore('session', 'bizim.yerel', '1');

const room = (roomId) => ({ roomId, me: { clientId: 'ali', name: 'Ömer' }, on: () => () => {}, sendAll: () => true, partner: () => null });

// Yerel depoya tarihli mesajlar: her gün bir mesaj, 2025-12-01'den 2026-03-10'a (100 mesaj).
function tohum(roomId, adet = 100) {
  const all = {};
  const bas = Date.UTC(2025, 11, 1, 12);
  for (let i = 0; i < adet; i++) {
    const iso = new Date(bas + i * 864e5).toISOString();
    all[`m${i}`] = { id: `m${i}`, data: { metin: String(i), kimden: 'ali' }, author: 'ali', deleted: false, created_at: iso, updated_at: iso };
  }
  writeStore('local', `bizim.yerelveri.${roomId}.mesaj`, JSON.stringify(all));
}

test('geriYukle: yılın başına kadar yükler, ilerleme bildirir', async () => {
  tohum('testyila11');
  const col = await openCollection(room('testyila11'), 'mesaj', { recent: 10 });
  const adimlar = [];
  const r = await geriYukle(col, { kadar: Date.UTC(2026, 0, 1), sayfa: 10, ilerleme: (x) => adimlar.push(x.sayi) });
  assert.equal(r.tamam, true);
  assert.equal(r.asildi, false);
  assert.ok(Date.parse(r.docs[0].created_at) < Date.UTC(2026, 0, 1), 'yılın başından öncesine inildi');
  assert.ok(r.docs.length < 100, 'gereğinden fazlası yüklenmedi');
  assert.ok(adimlar.length >= 6 && adimlar.every((v, i) => i === 0 || v > adimlar[i - 1]));
  col.close();
});

test('geriYukle: sınıra gelince durur ve aşıldı der', async () => {
  tohum('testyilb22');
  const col = await openCollection(room('testyilb22'), 'mesaj', { recent: 10 });
  const r = await geriYukle(col, { kadar: Date.UTC(2025, 0, 1), sinir: 35, sayfa: 10 });
  assert.equal(r.docs.length, 35);
  assert.equal(r.asildi, true);
  assert.equal(r.tamam, false);
  col.close();
});

test('geriYukle: hepsi yüklenince tamam; yeter koşulu erken durdurur', async () => {
  tohum('testyilc33');
  const col = await openCollection(room('testyilc33'), 'mesaj', { recent: 10 });
  const r = await geriYukle(col, { kadar: 0, sayfa: 30, yeter: (docs) => docs.length >= 40 });
  assert.equal(r.tamam, true);
  assert.ok(r.docs.length >= 40 && r.docs.length < 100);
  const r2 = await geriYukle(col, { kadar: 0, sayfa: 30 });
  assert.equal(r2.docs.length, 100);
  assert.equal(r2.tamam, true);
  col.close();
});

test('geriYukle: tümü yüklendikten sonra önbellekten açılan koleksiyon da başa inebilir', async () => {
  tohum('testyild44', 260); // önbellek sınırından (200) fazla
  const r = room('testyild44');
  const c1 = await openCollection(r, 'mesaj', { recent: 10 });
  assert.equal((await geriYukle(c1, { kadar: 0, sayfa: 50 })).docs.length, 260);
  assert.equal(c1.hasOlder(), false);
  c1.close();
  // Önbellek yalnız son 200 belgeyi tutar; imleç ona göre olmalı ki aradakiler yeniden yüklenebilsin.
  const c2 = await openCollection(r, 'mesaj', { recent: 10 });
  const s = await geriYukle(c2, { kadar: 0, sayfa: 50 });
  assert.equal(s.docs.length, 260);
  c2.close();
});

test('ilerlemeOrani: şimdiden hedefe zamanca ne kadar inildi', () => {
  const simdi = Date.UTC(2026, 9, 31);
  const kadar = Date.UTC(2026, 0, 1);
  assert.equal(ilerlemeOrani(null, kadar, simdi), 0);
  assert.equal(ilerlemeOrani(new Date(kadar).toISOString(), kadar, simdi), 1);
  assert.equal(ilerlemeOrani(new Date(Date.UTC(2025, 5, 1)).toISOString(), kadar, simdi), 1);
  const yarim = new Date((simdi + kadar) / 2).toISOString();
  assert.ok(Math.abs(ilerlemeOrani(yarim, kadar, simdi) - 0.5) < 0.01);
});
