// Yavrumuz: SVG çizimi (sayfalar/yavru/cizim.js; küçük ve büyük aşama bebek.js). Saf metin üretir; DOM yok.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { yavruSvg, CIZIM_CSS, ASAMALAR, RUHLAR } from '../sayfalar/yavru/cizim.js';
import { bebekSvg, BEBEK_RUHLARI } from '../sayfalar/yavru/bebek.js';

test('yumurta cizim.js çizimi; küçük ve büyük bebek.js çizimi (aynı imza)', () => {
  assert.deepEqual(ASAMALAR, ['yumurta', 'kucuk', 'buyuk']);
  const asamalar = ASAMALAR.map((asama) => yavruSvg({ asama, ruh: 'normal', renk: 2, kimlik: 'k' }));
  assert.equal(new Set(asamalar).size, 3);
  for (const s of asamalar) {
    assert.match(s, /<\/svg>$/);
    assert.match(s, /--yv-govde:var\(--yv-r2\)/);
  }
  assert.match(asamalar[0], /^<svg [^>]*class="yv-svg"/);
  for (const asama of ['kucuk', 'buyuk']) {
    const s = yavruSvg({ asama, ruh: 'mutlu', renk: 3, kisilik: 'obur', etiket: 'Pamuk', kimlik: 'k' });
    assert.equal(s, bebekSvg({ asama, ruh: 'mutlu', renk: 3, kisilik: 'obur', etiket: 'Pamuk', kimlik: 'k' }), asama);
  }
  assert.match(asamalar[2], /yvb-fiyonk/, 'büyükte fiyonk');
  assert.match(asamalar[1], /yvb-kabuk/, 'küçük kabukta');
  // Mantığın ruh hâlleri ve dokunma ifadeleri bebekte ayrı yüz.
  for (const r of RUHLAR) assert.ok(BEBEK_RUHLARI.includes(r), r);
  const yuzler = BEBEK_RUHLARI.map((ruh) => yavruSvg({ asama: 'kucuk', ruh, renk: 1, kimlik: 'k' }));
  assert.equal(new Set(yuzler).size, BEBEK_RUHLARI.length);
  assert.match(yavruSvg({ asama: 'kucuk', ruh: 'uyuyor' }), /yvb-zzz/);
  assert.match(yavruSvg({ asama: 'buyuk', ruh: 'uzgun' }), /yvb-damla/);
  assert.match(yavruSvg({ asama: 'yumurta', ruh: 'mutlu' }), /data-ruh="yumurta"/, 'yumurtada ruh yok');
});

test('dış kaynak yok; bilinmeyen değerler güvenli varsayılana düşer', () => {
  for (const asama of [...ASAMALAR, 'x']) {
    for (const ruh of [...RUHLAR, '<script>']) {
      const s = yavruSvg({ asama, ruh, renk: 4 });
      assert.doesNotMatch(s, /https?:|href|<script|url\((?!#)/i, `${asama}/${ruh}`);
    }
  }
  assert.equal(yavruSvg({ asama: 'x', ruh: 'y', renk: 99, kimlik: 'k' }), yavruSvg({ asama: 'kucuk', ruh: 'normal', renk: 1, kimlik: 'k' }));
  assert.equal(yavruSvg({ asama: 'yumurta', renk: 99 }), yavruSvg({ asama: 'yumurta', renk: 1 }));
  assert.match(yavruSvg(), /data-asama="kucuk"/);
});

test('aynı sayfada birden çok yavru SVG: gradyan id çakışmaz', () => {
  const idler = (s) => [...s.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
  const a = idler(yavruSvg({ asama: 'buyuk' }));
  const b = idler(yavruSvg({ asama: 'buyuk' }));
  assert.ok(a.length > 0);
  assert.equal(a.filter((x) => b.includes(x)).length, 0);
});

test('erişilebilir ad: etiket varsa role=img, yoksa gizli; etiket kaçışlı', () => {
  for (const asama of ASAMALAR) {
    assert.match(yavruSvg({ asama }), /aria-hidden="true"/);
    const s = yavruSvg({ asama, etiket: 'Pamuk <b>"mutlu"</b> & tok' });
    assert.match(s, /role="img"/);
    assert.match(s, /aria-label="Pamuk &lt;b&gt;&quot;mutlu&quot;&lt;\/b&gt; &amp; tok"/);
    assert.doesNotMatch(s, /<b>/);
  }
});

test('yumurta: çatlak yalnız hazırken; stil renkleri değişkenden', () => {
  assert.doesNotMatch(yavruSvg({ asama: 'yumurta' }), /yv-catlak/);
  assert.match(yavruSvg({ asama: 'yumurta', hazir: true }), /yv-catlak/);
  for (let r = 1; r <= 6; r++) assert.match(CIZIM_CSS, new RegExp(`--yv-r${r}:`));
  assert.match(CIZIM_CSS, /prefers-reduced-motion/);
  // Kurallar sabit renk yazmaz: hex yalnız --yv-* jeton tanımlarında.
  for (const satir of CIZIM_CSS.split('\n')) {
    if (/#[0-9a-f]{3,8}\b/i.test(satir)) assert.match(satir, /^\s*--yv-[a-z0-9-]+:\s*#[0-9a-f]{6};/i, satir);
  }
});
