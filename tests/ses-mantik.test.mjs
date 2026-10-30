import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sesTuru, uploadAudio, SES_MAX_BAYT, isAllowedPhotoUrl } from '../js/core/storage.js';
import {
  kayitTuruSec, sureYazisi, sesSuresi, sesVerisi, kaydirIptalMi, SES_MAX_SN, IPTAL_ESIK,
} from '../sayfalar/sohbet/ses.js';
import { writeStore } from '../js/core/identity.js';
import { SUPABASE_URL } from '../js/config.js';

test('sesTuru: kovaya giden tür (parametresiz) ve uzantı', () => {
  assert.deepEqual(sesTuru('audio/webm;codecs=opus'), { mime: 'audio/webm', uzanti: 'webm' });
  assert.deepEqual(sesTuru('audio/webm'), { mime: 'audio/webm', uzanti: 'webm' });
  assert.deepEqual(sesTuru('audio/mp4'), { mime: 'audio/mp4', uzanti: 'm4a' });
  assert.deepEqual(sesTuru('AUDIO/MP4; codecs="mp4a.40.2"'), { mime: 'audio/mp4', uzanti: 'm4a' });
  assert.equal(sesTuru('audio/ogg;codecs=opus'), null); // kova kabul etmez
  assert.equal(sesTuru('video/webm'), null);
  assert.equal(sesTuru(''), null);
  assert.equal(sesTuru(undefined), null);
});

test('kayitTuruSec: Chrome/Android webm-opus, iPhone Safari mp4, hiçbiri yoksa null', () => {
  const destek = (...turler) => (t) => turler.includes(t);
  assert.equal(kayitTuruSec(destek('audio/webm;codecs=opus', 'audio/webm', 'audio/mp4')), 'audio/webm;codecs=opus');
  assert.equal(kayitTuruSec(destek('audio/webm')), 'audio/webm');
  assert.equal(kayitTuruSec(destek('audio/mp4')), 'audio/mp4');
  assert.equal(kayitTuruSec(destek('audio/ogg;codecs=opus')), null);
  assert.equal(kayitTuruSec(null), null);
  assert.equal(kayitTuruSec(() => { throw new Error('x'); }), null);
});

test('süre: yazı, saniye, sınır', () => {
  assert.equal(SES_MAX_SN, 120);
  assert.equal(sureYazisi(0), '0:00');
  assert.equal(sureYazisi(7.4), '0:07');
  assert.equal(sureYazisi(59.6), '0:59'); // aşağı yuvarla: sayaç ileri atlamasın
  assert.equal(sureYazisi(75), '1:15');
  assert.equal(sureYazisi(120), '2:00');
  assert.equal(sureYazisi(NaN), '0:00');
  assert.equal(sureYazisi(-3), '0:00');
  assert.equal(sesSuresi(400), 1);   // en az 1 sn
  assert.equal(sesSuresi(7600), 8);
  assert.equal(sesSuresi(500000), 120);
  assert.equal(sesSuresi(NaN), 1);
});

test('sesVerisi: mesaj.ses = { url, sure, tur }', () => {
  assert.deepEqual(sesVerisi({ url: 'local:a', ms: 7200, mime: 'audio/webm;codecs=opus' }), { url: 'local:a', sure: 7, tur: 'audio/webm' });
  assert.deepEqual(sesVerisi({ url: 'local:b', ms: 1000, mime: 'audio/mp4' }), { url: 'local:b', sure: 1, tur: 'audio/mp4' });
});

test('kaydırarak iptal: sola eşiği geçince', () => {
  assert.equal(kaydirIptalMi(-IPTAL_ESIK - 1), true);
  assert.equal(kaydirIptalMi(-IPTAL_ESIK + 1), false);
  assert.equal(kaydirIptalMi(200), false);
});

test('isAllowedPhotoUrl: ses (.webm, .m4a) adresleri de kabul', () => {
  const base = 'https://abcd.supabase.co';
  const pub = `${base}/storage/v1/object/public/photos/abcdefghij/0f8e2a1c-1b2d-4c3e-8f9a-0123456789ab`;
  assert.equal(isAllowedPhotoUrl(`${pub}.webm`, base, 'photos'), true);
  assert.equal(isAllowedPhotoUrl(`${pub}.m4a`, base, 'photos'), true);
  assert.equal(isAllowedPhotoUrl(`https://evil.example/a.webm`, base, 'photos'), false);
});

test('uploadAudio: Blob, boyut ve tür ağa çıkmadan denetlenir', async () => {
  assert.equal(SES_MAX_BAYT, 2 * 1024 * 1024);
  await assert.rejects(uploadAudio('blob değil', 'abcdefghij'), TypeError);
  await assert.rejects(uploadAudio(new Blob([new Uint8Array(SES_MAX_BAYT + 1)], { type: 'audio/webm' }), 'abcdefghij'), /çok büyük/);
  await assert.rejects(uploadAudio(new Blob(['x'], { type: 'audio/ogg' }), 'abcdefghij'), /desteklenmiyor/);
});

test('uploadAudio (yerel): Node\'da IndexedDB yok → anlaşılır hata', async () => {
  globalThis.location = { search: '?yerel=1' };
  try {
    await assert.rejects(uploadAudio(new Blob(['x'], { type: 'audio/webm;codecs=opus' }), 'abcdefghij'), /yerel/);
  } finally {
    delete globalThis.location;
    writeStore('session', 'bizim.yerel', null);
  }
});

test('uploadAudio (Supabase): geçerli oda yoksa ağa çıkmadan hata', { skip: !SUPABASE_URL }, async () => {
  writeStore('session', 'bizim.yerel', null);
  const blob = new Blob(['x'], { type: 'audio/mp4' });
  await assert.rejects(uploadAudio(blob, null), /geçerli bir oda/);
  await assert.rejects(uploadAudio(blob, '../abcdefgh'), /geçerli bir oda/);
});
