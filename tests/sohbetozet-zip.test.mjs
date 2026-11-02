// Sohbet Özetimiz: ZIP okuma. Test ZIP'leri burada elle kurulur (node:zlib yalnız testte).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deflateRawSync } from 'node:zlib';
import { zipMi, zipGirdileri, sohbetGirdisi, zipMetni, dosyaMetni } from '../sayfalar/sohbet-ozeti/zip.js';

const enc = new TextEncoder();

/** dosyalar: [{ ad, veri: string, yontem: 0|8 }] → Uint8Array (yerel başlıklar + merkezi dizin + EOCD). */
function zipKur(dosyalar) {
  const parcalar = [];
  const merkez = [];
  let ofset = 0;
  for (const d of dosyalar) {
    const ad = enc.encode(d.ad);
    const acik = enc.encode(d.veri);
    const veri = d.yontem === 8 ? new Uint8Array(deflateRawSync(acik)) : acik;
    const yerel = new Uint8Array(30 + ad.length);
    const v = new DataView(yerel.buffer);
    v.setUint32(0, 0x04034b50, true);
    v.setUint16(4, 20, true);
    v.setUint16(8, d.yontem, true);
    v.setUint32(18, veri.length, true);
    v.setUint32(22, acik.length, true);
    v.setUint16(26, ad.length, true);
    yerel.set(ad, 30);
    const m = new Uint8Array(46 + ad.length);
    const mv = new DataView(m.buffer);
    mv.setUint32(0, 0x02014b50, true);
    mv.setUint16(10, d.yontem, true);
    mv.setUint32(20, veri.length, true);
    mv.setUint32(24, acik.length, true);
    mv.setUint16(28, ad.length, true);
    mv.setUint32(42, ofset, true);
    m.set(ad, 46);
    parcalar.push(yerel, veri);
    merkez.push(m);
    ofset += yerel.length + veri.length;
  }
  const merkezBoy = merkez.reduce((s, x) => s + x.length, 0);
  const son = new Uint8Array(22);
  const sv = new DataView(son.buffer);
  sv.setUint32(0, 0x06054b50, true);
  sv.setUint16(8, dosyalar.length, true);
  sv.setUint16(10, dosyalar.length, true);
  sv.setUint32(12, merkezBoy, true);
  sv.setUint32(16, ofset, true);
  const hepsi = [...parcalar, ...merkez, son];
  const out = new Uint8Array(hepsi.reduce((s, x) => s + x.length, 0));
  let p = 0;
  for (const x of hepsi) { out.set(x, p); p += x.length; }
  return out;
}

const METIN = '[8/9/26, 3:57:40 PM] Ali: selam\n[8/9/26, 3:58:00 PM] Ayşe: merhaba ☕';

test('zipMi: PK imzası', () => {
  assert.ok(zipMi(zipKur([{ ad: 'a.txt', veri: 'x', yontem: 0 }])));
  assert.ok(!zipMi(enc.encode('düz metin')));
  assert.ok(!zipMi(new Uint8Array(2)));
});

test('saklı (yöntem 0) _chat.txt okunur; diğer dosyalar atlanır', async () => {
  const z = zipKur([
    { ad: '00000012-PHOTO-2026-08-09.jpg', veri: 'jpeg gibi', yontem: 0 },
    { ad: '_chat.txt', veri: METIN, yontem: 0 },
  ]);
  assert.deepEqual(zipGirdileri(z).map((g) => g.ad), ['00000012-PHOTO-2026-08-09.jpg', '_chat.txt']);
  assert.equal(await zipMetni(z), METIN);
});

test('deflate (yöntem 8) açılır; BOM atılır', async () => {
  const z = zipKur([{ ad: '_chat.txt', veri: `﻿${METIN}`, yontem: 8 }]);
  assert.equal(await zipMetni(z.buffer), METIN);
});

test('_chat.txt yoksa ilk .txt; __MACOSX atlanır', () => {
  const g = sohbetGirdisi([{ ad: '__MACOSX/._x.txt' }, { ad: 'WhatsApp Chat - Ali.txt' }, { ad: 'b.txt' }]);
  assert.equal(g.ad, 'WhatsApp Chat - Ali.txt');
  assert.equal(sohbetGirdisi([{ ad: 'a.jpg' }]), null);
});

test('hatalar: metin yok, ZIP değil', async () => {
  await assert.rejects(zipMetni(zipKur([{ ad: 'a.jpg', veri: 'x', yontem: 0 }])), /bulunamadı/);
  assert.throws(() => zipGirdileri(enc.encode('ZIP değil, düz bir metin dosyası')), /okunamadı/);
});

test('dosyaMetni: Blob ZIP ise içinden, değilse düz metin', async () => {
  const z = zipKur([{ ad: '_chat.txt', veri: METIN, yontem: 8 }]);
  assert.equal(await dosyaMetni(new Blob([z])), METIN);
  assert.equal(await dosyaMetni(new Blob([`﻿${METIN}`])), METIN);
});
