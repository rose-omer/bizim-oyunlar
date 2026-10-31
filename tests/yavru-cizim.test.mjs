// Yavrumuz: SVG çizimi (sayfalar/yavru/cizim.js). Saf metin üretir; DOM yok.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { yavruSvg, CIZIM_CSS, ASAMALAR, RUHLAR } from '../sayfalar/yavru/cizim.js';

test('üç aşama ayrı görünüş; her ruh hâli ayrı yüz', () => {
  assert.deepEqual(ASAMALAR, ['yumurta', 'kucuk', 'buyuk']);
  const asamalar = ASAMALAR.map((asama) => yavruSvg({ asama, ruh: 'normal', renk: 2 }));
  assert.equal(new Set(asamalar).size, 3);
  for (const s of asamalar) {
    assert.match(s, /^<svg [^>]*class="yv-svg"/);
    assert.match(s, /<\/svg>$/);
    assert.match(s, /--yv-govde:var\(--yv-r2\)/);
  }
  assert.match(asamalar[2], /yv-kulak/, 'büyükte kulak');
  assert.match(asamalar[2], /yv-kuyruk/, 'büyükte kuyruk');
  assert.doesNotMatch(asamalar[1], /yv-kulak/);
  const yuzler = RUHLAR.map((ruh) => yavruSvg({ asama: 'kucuk', ruh, renk: 1 }));
  assert.equal(new Set(yuzler).size, RUHLAR.length);
  assert.match(yavruSvg({ asama: 'kucuk', ruh: 'uyuyor' }), /yv-zzz/);
  assert.match(yavruSvg({ asama: 'buyuk', ruh: 'uzgun' }), /yv-damla/);
});

test('dış kaynak yok; bilinmeyen değerler güvenli varsayılana düşer', () => {
  for (const asama of [...ASAMALAR, 'x']) {
    for (const ruh of [...RUHLAR, '<script>']) {
      const s = yavruSvg({ asama, ruh, renk: 4 });
      assert.doesNotMatch(s, /https?:|href|<script|url\(/i, `${asama}/${ruh}`);
    }
  }
  assert.equal(yavruSvg({ asama: 'x', ruh: 'y', renk: 99 }), yavruSvg({ asama: 'kucuk', ruh: 'normal', renk: 1 }));
  assert.match(yavruSvg(), /data-asama="kucuk"/);
});

test('erişilebilir ad: etiket varsa role=img, yoksa gizli; etiket kaçışlı', () => {
  assert.match(yavruSvg({ asama: 'kucuk' }), /aria-hidden="true"/);
  const s = yavruSvg({ asama: 'kucuk', etiket: 'Pamuk <b>"mutlu"</b> & tok' });
  assert.match(s, /role="img"/);
  assert.match(s, /aria-label="Pamuk &lt;b&gt;&quot;mutlu&quot;&lt;\/b&gt; &amp; tok"/);
  assert.doesNotMatch(s, /<b>/);
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
