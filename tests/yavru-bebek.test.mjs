// Yavrumuz: bebek çizimi prototipi (sayfalar/yavru/bebek.js). Saf metin üretir; DOM yok.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bebekSvg, giyimParcaSvg, BEBEK_CSS, BEBEK_ASAMALARI, BEBEK_RUHLARI } from '../sayfalar/yavru/bebek.js';
import { YUVALAR } from '../sayfalar/yavru/giyim.js';
import { RUHLAR, yavruSvg } from '../sayfalar/yavru/cizim.js';

// Basit iyi biçim denetimi: etiketler dengeli, tek kök <svg>.
function dengeli(s) {
  const yigin = [];
  for (const [, kapa, ad, kendi] of s.matchAll(/<(\/?)([a-zA-Z]+)\b[^>]*?(\/?)>/g)) {
    if (kendi) continue;
    if (kapa) { if (yigin.pop() !== ad) return false; } else yigin.push(ad);
  }
  return yigin.length === 0;
}
const idler = (s) => [...s.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);

test('her aşama × ruh geçerli, ayrı SVG üretir', () => {
  assert.deepEqual(BEBEK_ASAMALARI, ['kucuk', 'buyuk']);
  for (const r of RUHLAR) assert.ok(BEBEK_RUHLARI.includes(r), `eski ruh: ${r}`);
  for (const r of ['aglama', 'kahkaha', 'sasirma']) assert.ok(BEBEK_RUHLARI.includes(r), `yeni ruh: ${r}`);
  for (const asama of BEBEK_ASAMALARI) {
    const hepsi = BEBEK_RUHLARI.map((ruh) => bebekSvg({ asama, ruh, renk: 3, kimlik: 'x' }));
    assert.equal(new Set(hepsi).size, BEBEK_RUHLARI.length, `${asama}: her ruh ayrı`);
    hepsi.forEach((s, i) => {
      const ad = `${asama}/${BEBEK_RUHLARI[i]}`;
      assert.match(s, /^<svg [^>]*class="yvb-svg"/, ad);
      assert.match(s, /<\/svg>$/, ad);
      assert.match(s, new RegExp(`data-asama="${asama}"`), ad);
      assert.match(s, new RegExp(`data-ruh="${BEBEK_RUHLARI[i]}"`), ad);
      assert.match(s, /--yv-govde:var\(--yv-r3\)/, ad);
      assert.ok(dengeli(s), `${ad}: etiketler dengeli`);
      assert.doesNotMatch(s, /undefined|NaN/, ad);
    });
  }
});

test('katmanlar ayrı <g> ve sınıflı', () => {
  const ortak = ['yvb-beden', 'yvb-govde', 'yvb-kiyafet', 'yvb-bas', 'yvb-sac', 'yvb-yuz', 'yvb-goz', 'yvb-kas', 'yvb-agiz', 'yvb-yanak'];
  const b = bebekSvg({ asama: 'buyuk', kimlik: 'x' });
  for (const k of [...ortak, 'yvb-bacak', 'yvb-ayak', 'yvb-kol', 'yvb-el', 'yvb-aksesuar', 'yvb-fiyonk']) {
    assert.match(b, new RegExp(`<g class="[^"]*\\b${k}\\b`), `büyük: ${k}`);
  }
  const k = bebekSvg({ asama: 'kucuk', kimlik: 'x' });
  for (const s of [...ortak, 'yvb-kabuk', 'yvb-emzik']) assert.match(k, new RegExp(`<g class="[^"]*\\b${s}\\b`), `küçük: ${s}`);
  assert.doesNotMatch(k, /yvb-fiyonk/, 'küçükte fiyonk yok');
});

test('ruh işaretleri: biberon balonu, leke, zzz, gözyaşı', () => {
  for (const asama of BEBEK_ASAMALARI) {
    assert.match(bebekSvg({ asama, ruh: 'ac' }), /yvb-dusunce/);
    assert.match(bebekSvg({ asama, ruh: 'kirli' }), /yvb-leke/);
    assert.match(bebekSvg({ asama, ruh: 'uyuyor' }), /yvb-zzz/);
    assert.match(bebekSvg({ asama, ruh: 'uykulu' }), /yvb-z\b/);
    assert.match(bebekSvg({ asama, ruh: 'aglama' }), /yvb-gozyasi/);
    assert.match(bebekSvg({ asama, ruh: 'uzgun' }), /yvb-damla/);
  }
});

test('id benzersiz: aynı sayfada birden çok SVG çakışmaz; kimlik verilirse kararlı', () => {
  const a = bebekSvg({ asama: 'buyuk', ruh: 'mutlu' });
  const b = bebekSvg({ asama: 'buyuk', ruh: 'mutlu' });
  const ia = idler(a);
  const ib = idler(b);
  assert.ok(ia.length > 0, 'gradyan id var');
  assert.equal(new Set(ia).size, ia.length, 'tek SVG içinde tekrar yok');
  assert.equal(ia.filter((x) => ib.includes(x)).length, 0, 'iki SVG arasında ortak id yok');
  // Her url(#…) başvurusu aynı SVG'deki bir id'ye gider.
  for (const s of [a, bebekSvg({ asama: 'kucuk', ruh: 'aglama' })]) {
    for (const [, ref] of s.matchAll(/url\(#([^)]+)\)/g)) assert.ok(idler(s).includes(ref), ref);
  }
  assert.equal(bebekSvg({ asama: 'kucuk', kimlik: 'k1' }), bebekSvg({ asama: 'kucuk', kimlik: 'k1' }));
  assert.match(bebekSvg({ kimlik: 'a b"<' }), /id="ab-/, 'kimlik temizlenir');
});

test('dış kaynak yok; bilinmeyen değerler varsayılana düşer', () => {
  for (const asama of [...BEBEK_ASAMALARI, 'yumurta', 'x']) {
    for (const ruh of [...BEBEK_RUHLARI, '<script>']) {
      const s = bebekSvg({ asama, ruh, renk: 4 });
      assert.doesNotMatch(s, /https?:|href|<script|url\((?!#)/i, `${asama}/${ruh}`);
    }
  }
  const v = { kimlik: 'v' };
  assert.equal(bebekSvg({ ...v, asama: 'x', ruh: 'y', renk: 99, kisilik: 'z' }), bebekSvg({ ...v, asama: 'buyuk', ruh: 'normal', renk: 1 }));
  assert.equal(bebekSvg({ ...v, renk: 2.5 }), bebekSvg({ ...v, renk: 1 }));
  assert.match(bebekSvg(), /data-asama="buyuk"/);
  assert.match(bebekSvg({ kisilik: 'obur' }), /data-kisilik="obur"/);
  assert.doesNotMatch(bebekSvg({ kisilik: 'yok' }), /data-kisilik/);
});

test('erişilebilir ad: etiket varsa role=img, yoksa gizli; etiket kaçışlı', () => {
  assert.match(bebekSvg(), /aria-hidden="true"/);
  const s = bebekSvg({ etiket: 'Pamuk <b>"mutlu"</b> & tok' });
  assert.match(s, /role="img"/);
  assert.match(s, /aria-label="Pamuk &lt;b&gt;&quot;mutlu&quot;&lt;\/b&gt; &amp; tok"/);
  assert.doesNotMatch(s, /<b>/);
  assert.match(s, /focusable="false"/);
});

test('stil: hareket yalnız isteyene; sabit renk yalnız jeton tanımında', () => {
  assert.match(BEBEK_CSS, /@media \(prefers-reduced-motion: no-preference\)/);
  // @keyframes dışındaki animation kuralları hareket bloğunun içinde olmalı.
  const hareketDisi = BEBEK_CSS.replace(/@media \(prefers-reduced-motion: no-preference\) \{[\s\S]*?\n\}/, '');
  assert.doesNotMatch(hareketDisi, /animation:/);
  for (const satir of BEBEK_CSS.split('\n')) {
    if (/#[0-9a-f]{3,8}\b/i.test(satir)) assert.match(satir, /^\s*--yvb-[a-z0-9-]+:\s*#[0-9a-f]{6};/i, satir);
  }
});

// ---------- Giyim (aksesuar katmanı) ----------
const HEPSI = { bas: 'tac', goz: 'gozluk', boyun: 'atki' };

test('giyim: her yuva ürünü kendi <g class="yvb-giyim"> katmanında; baş doluysa varsayılan fiyonk yok', () => {
  for (const [yuva, liste] of Object.entries(YUVALAR)) {
    for (const id of liste) {
      const s = bebekSvg({ asama: 'buyuk', kimlik: 'g', giyim: { [yuva]: id } });
      assert.match(s, new RegExp(`<g class="yvb-giyim yvb-giyim-${yuva}" data-urun="${id}"`), `${yuva}/${id}`);
      assert.ok(dengeli(s), `${id}: etiketler dengeli`);
      assert.doesNotMatch(s, /undefined|NaN/, id);
      assert.equal(/yvb-aksesuar/.test(s), yuva !== 'bas', `${id}: varsayılan fiyonk yalnız baş boşken`);
    }
  }
  const varsayilan = bebekSvg({ asama: 'buyuk', kimlik: 'g' });
  assert.match(varsayilan, /<g class="yvb-aksesuar"><path class="yvb-bant"/, 'giyimsiz: pembe fiyonk ve bant');
  assert.doesNotMatch(varsayilan, /yvb-giyim/);
  assert.equal(bebekSvg({ kimlik: 'g', giyim: {} }), varsayilan);
  assert.equal(bebekSvg({ kimlik: 'g', giyim: null }), varsayilan);
});

test('giyim: katman sırası (atkı çenenin altında, gözlük yüzün üstünde, baş en önde); yüz değişmez', () => {
  const s = bebekSvg({ asama: 'buyuk', kimlik: 'g', giyim: HEPSI });
  const i = (x) => s.indexOf(x);
  assert.ok(i('yvb-kiyafet-kol') < i('yvb-giyim-boyun') && i('yvb-giyim-boyun') < i('<g class="yvb-bas">'), 'atkı kolların üstünde, başın altında');
  assert.ok(i('yvb-yuz') < i('yvb-giyim-goz') && i('yvb-sac-on') < i('yvb-giyim-goz'), 'gözlük yüz ve saçın üstünde');
  assert.ok(i('yvb-giyim-goz') < i('yvb-giyim-bas'), 'baş aksesuarı en önde');
  // Yüz grubu giyimden bağımsız (konuşma ağzı gibi yüz değişiklikleri ayrı birleşir).
  const yuz = (x) => x.slice(x.indexOf('<g class="yvb-yuz"'), x.indexOf('<g class="yvb-sac yvb-sac-on">'));
  assert.ok(yuz(s).length > 100);
  assert.equal(yuz(s), yuz(bebekSvg({ asama: 'buyuk', kimlik: 'g' })));
});

test('giyim: küçükte (kundak) yalnız baş yuvası, küçük boy; gözlük ve atkı çizilmez', () => {
  for (const bas of YUVALAR.bas) {
    const s = bebekSvg({ asama: 'kucuk', kimlik: 'k', giyim: { ...HEPSI, bas } });
    assert.match(s, new RegExp(`yvb-giyim-bas" data-urun="${bas}" transform="[^"]*scale\\(0\\.\\d+\\)"`), bas);
    assert.doesNotMatch(s, /yvb-giyim-(goz|boyun)/);
    assert.ok(dengeli(s));
  }
  assert.equal(bebekSvg({ asama: 'kucuk', kimlik: 'k', giyim: { goz: 'gozluk', boyun: 'atki' } }), bebekSvg({ asama: 'kucuk', kimlik: 'k' }));
});

test('giyim: bilinmeyen yuva/değer yok sayılır; id benzersizliği bozulmaz; dış kaynak yok', () => {
  const v = { asama: 'buyuk', kimlik: 'g' };
  assert.equal(bebekSvg({ ...v, giyim: { bas: 'atki', goz: 'tac', boyun: 'x', el: 'tac' } }), bebekSvg(v));
  assert.equal(bebekSvg({ ...v, giyim: { bas: '"><script>' } }), bebekSvg(v));
  assert.equal(bebekSvg({ ...v, giyim: { bas: '__proto__', goz: 'constructor' } }), bebekSvg(v));
  assert.equal(bebekSvg({ ...v, giyim: 'tac' }), bebekSvg(v));
  const a = bebekSvg({ asama: 'buyuk', giyim: HEPSI });
  const b = bebekSvg({ asama: 'buyuk', giyim: HEPSI });
  const ia = idler(a);
  assert.equal(new Set(ia).size, ia.length);
  assert.equal(ia.filter((x) => idler(b).includes(x)).length, 0, 'iki giyimli SVG ortak id taşımaz');
  for (const [, ref] of a.matchAll(/url\(#([^)]+)\)/g)) assert.ok(ia.includes(ref), ref);
  assert.doesNotMatch(a, /https?:|href|<script|url\((?!#)/i);
  // cizim.js yavruSvg giyimi geçirir.
  assert.equal(yavruSvg({ ...v, giyim: HEPSI }), bebekSvg({ ...v, giyim: HEPSI }));
});

test('giyimParcaSvg: her kıyafet için tek parça (kart önizlemesi); bilinmeyen boş', () => {
  for (const id of Object.values(YUVALAR).flat()) {
    const s = giyimParcaSvg(id, { renk: 5 });
    assert.match(s, /^<svg viewBox="[-\d. ]+" class="yvb-svg yvb-parca"/, id);
    assert.match(s, /aria-hidden="true"/);
    assert.match(s, /--yv-govde:var\(--yv-r5\)/);
    assert.ok(dengeli(s), id);
    assert.doesNotMatch(s, /\sid="/, 'id yok');
  }
  assert.equal(giyimParcaSvg('pizza'), '');
  assert.equal(giyimParcaSvg('__proto__'), '');
  assert.equal(giyimParcaSvg(), '');
  assert.match(giyimParcaSvg('tac', { renk: 9 }), /--yv-r1\)/);
});
