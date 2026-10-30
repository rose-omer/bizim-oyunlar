// Soru oyunları v2 içerikleri: sayı, tekillik, boş yok, biçim, PG-13 kelime süzgeci.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as kd from '../games/kimdaha/ifadeler.js';
import * as hy from '../games/hicyaptin/ifadeler.js';
import { ASAMALAR, ARA_GOREVLERI, SORULAR } from '../games/derin/sorular.js';
import { COUNTS } from '../games/kimdaha/secim.js';

const filled = (v) => typeof v === 'string' && v.trim().length > 0 && v === v.trim() && !/\s{2,}/.test(v);
const norm = (v) => v.toLocaleLowerCase('tr').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const MAX_LEN = 110; // telefonda kart taşmasın

// Açık saçık, küfür, madde: içerikte geçmemeli. Kök eşleşmesi (kelime başı).
const STEMS = ['seks', 'sevişm', 'çıplak', 'porno', 'erotik', 'orgazm', 'mastürb', 'prezervatif',
  'iç çamaşır', 'sütyen', 'külot', 'uyuşturucu', 'kokain', 'esrar ', 'alkol', 'sarhoş', 'kumar',
  'intihar', 'orospu', 'kahpe', 'siktir', 'yarak', 'amcık', 'şerefsiz', 'gerizekalı', 'aptal'];
// Kısa küfürler: yalnız tam kelime.
const WORDS = ['sik', 'amk', 'aq', 'piç', 'göt', 'oç', 'mal'];

function pg13Ihlali(text) {
  const t = ` ${norm(text)} `;
  for (const s of STEMS) if (t.includes(` ${s}`)) return s;
  const words = new Set(norm(text).split(' '));
  for (const w of WORDS) if (words.has(w)) return w;
  return null;
}

function checkList(name, items, { min, prefix }) {
  assert.ok(items.length >= min, `${name}: ${items.length} < ${min}`);
  const seen = new Set();
  for (const it of items) {
    assert.ok(filled(it.text), `${name} boş ya da bozuk: ${JSON.stringify(it)}`);
    assert.ok(it.text.length <= MAX_LEN, `${name} çok uzun: ${it.text}`);
    assert.ok(it.text.endsWith('?'), `${name} "?" ile bitmeli: ${it.text}`);
    if (prefix) assert.ok(it.text.startsWith(prefix), `${name} "${prefix}" ile başlamalı: ${it.text}`);
    const k = norm(it.text);
    assert.ok(!seen.has(k), `${name} tekrar: ${it.text}`);
    seen.add(k);
    const bad = pg13Ihlali(it.text);
    assert.equal(bad, null, `${name} PG-13 dışı (${bad}): ${it.text}`);
  }
  assert.equal(new Set(items.map((x) => x.id)).size, items.length, `${name}: id tekrarı`);
}

test('PG-13 süzgeci: yakalar ve masum kelimeleri geçirir', () => {
  assert.equal(pg13Ihlali('Hiç sarhoş oldun mu?'), 'sarhoş');
  assert.equal(pg13Ihlali('Kim daha çok SİK…'), 'sik');
  assert.equal(pg13Ihlali('Hiç sikke topladın mı?'), null);
  assert.equal(pg13Ihlali('Hiç esrarengiz bir mektup aldın mı?'), null);
  assert.equal(pg13Ihlali('Hiç götürüp getirdin mi?'), null);
});

test('kimdaha: en az 150 ifade, 4 kategori, her kategori en büyük tur sayısını karşılar', () => {
  assert.deepEqual(kd.KATEGORILER, ['eglenceli', 'romantik', 'gunluk', 'cesur']);
  checkList('kimdaha', kd.LISTE, { min: 150, prefix: 'Kim ' });
  const max = Math.max(...COUNTS);
  for (const cat of kd.KATEGORILER) {
    const n = kd.LISTE.filter((x) => x.cat === cat).length;
    assert.ok(n >= max, `kimdaha ${cat}: ${n} < ${max}`);
    assert.equal(n, kd.IFADELER[cat].length);
  }
});

test('hicyaptin: en az 150 ifade, 3 seviye, her seviye en büyük tur sayısını karşılar', () => {
  assert.deepEqual(hy.SEVIYELER, ['tatli', 'eglenceli', 'cesur']);
  checkList('hicyaptin', hy.LISTE, { min: 150, prefix: 'Hiç ' });
  const max = Math.max(...COUNTS);
  for (const cat of hy.SEVIYELER) {
    const n = hy.LISTE.filter((x) => x.cat === cat).length;
    assert.ok(n >= max, `hicyaptin ${cat}: ${n} < ${max}`);
  }
});

test('derin: 3 aşama, her aşamada tam 36 özgün soru; toplam 108', () => {
  assert.equal(ASAMALAR.length, 3);
  assert.deepEqual(ASAMALAR.map((a) => a.ad), ['Tanışma', 'Yakınlık', 'Derin']);
  for (const a of ASAMALAR) {
    assert.equal(a.sorular.length, 36, `${a.ad}: ${a.sorular.length}`);
    assert.ok(filled(a.ad) && filled(a.aciklama));
  }
  checkList('derin', SORULAR, { min: 108 });
  assert.equal(SORULAR.length, 108);
  for (const st of [0, 1, 2]) assert.equal(SORULAR.filter((q) => q.stage === st).length, 36);
});

test('derin: her aşama arası en az bir nazik görev; boş ve PG-13 dışı yok', () => {
  assert.equal(ARA_GOREVLERI.length, ASAMALAR.length - 1);
  const seen = new Set();
  for (const list of ARA_GOREVLERI) {
    assert.ok(list.length >= 1);
    for (const t of list) {
      assert.ok(filled(t) && t.length <= MAX_LEN, t);
      assert.equal(pg13Ihlali(t), null, t);
      assert.ok(!seen.has(norm(t)), `tekrar: ${t}`);
      seen.add(norm(t));
    }
  }
});

test('üç oyun arasında birebir aynı metin yok', () => {
  const all = [...kd.LISTE, ...hy.LISTE, ...SORULAR].map((x) => norm(x.text));
  assert.equal(new Set(all).size, all.length);
});
