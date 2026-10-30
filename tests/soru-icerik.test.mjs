// Soru oyunlarının içerik dosyaları: sayı, tekillik, boş metin yok.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SORULAR } from '../games/tanis/sorular.js';
import { IKILILER } from '../games/aynikafa/ikililer.js';
import { KARTLAR, CARDS } from '../games/dogruluk/kartlar.js';

const filled = (v) => typeof v === 'string' && v.trim().length > 0 && v === v.trim();
const norm = (v) => v.toLocaleLowerCase('tr').replace(/\s+/g, ' ').trim();

test('tanis: en az 80 soru, tekil id ve metin, 4 farklı şık', () => {
  assert.ok(SORULAR.length >= 80, `soru sayısı ${SORULAR.length}`);
  const ids = new Set();
  const selfs = new Set();
  const others = new Set();
  for (const q of SORULAR) {
    assert.ok(filled(q.id), 'id boş');
    assert.ok(!ids.has(q.id), `tekrarlanan id ${q.id}`);
    ids.add(q.id);
    assert.ok(filled(q.self), `${q.id} self`);
    assert.ok(filled(q.other), `${q.id} other`);
    assert.ok(!selfs.has(norm(q.self)), `tekrarlanan soru ${q.self}`);
    assert.ok(!others.has(norm(q.other)), `tekrarlanan soru ${q.other}`);
    selfs.add(norm(q.self));
    others.add(norm(q.other));
    assert.ok(Array.isArray(q.a) && q.a.length === 4, `${q.id} şık sayısı`);
    assert.ok(q.a.every(filled), `${q.id} boş şık`);
    assert.equal(new Set(q.a.map(norm)).size, 4, `${q.id} şıklar farklı olmalı`);
  }
});

test('aynikafa: en az 120 ikili, en az 6 kategori, tekrar yok', () => {
  assert.ok(IKILILER.length >= 120, `ikili sayısı ${IKILILER.length}`);
  const pairs = new Set();
  const cats = new Set();
  for (const p of IKILILER) {
    assert.ok(filled(p.a) && filled(p.b) && filled(p.cat), JSON.stringify(p));
    assert.notEqual(norm(p.a), norm(p.b), JSON.stringify(p));
    const key = [norm(p.a), norm(p.b)].sort().join('|');
    assert.ok(!pairs.has(key), `tekrarlanan ikili ${key}`);
    pairs.add(key);
    cats.add(p.cat);
  }
  assert.ok(cats.size >= 6, `kategori sayısı ${cats.size}`);
});

test('dogruluk: her seviyede en az 40 doğruluk ve 40 cesaret, tekrar yok', () => {
  const texts = new Set();
  for (const level of ['tatli', 'eglenceli', 'cesur']) {
    for (const kind of ['dogruluk', 'cesaret']) {
      const list = KARTLAR[level]?.[kind];
      assert.ok(Array.isArray(list), `${level}.${kind} yok`);
      assert.ok(list.length >= 40, `${level}.${kind}: ${list.length}`);
      for (const t of list) {
        assert.ok(filled(t), `${level}.${kind} boş kart`);
        assert.ok(!texts.has(norm(t)), `tekrarlanan kart: ${t}`);
        texts.add(norm(t));
      }
    }
  }
  const ids = new Set(CARDS.map((c) => c.id));
  assert.equal(ids.size, CARDS.length);
  assert.equal(CARDS.length, texts.size);
  for (const c of CARDS) {
    assert.ok(['tatli', 'eglenceli', 'cesur'].includes(c.level));
    assert.ok(['dogruluk', 'cesaret'].includes(c.kind));
  }
});
