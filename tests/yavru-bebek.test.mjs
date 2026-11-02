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
      // Gövde yuvası kıyafet katmanında (.yvb-kiyafet), diğerleri aksesuar katmanında (.yvb-giyim).
      const sinif = yuva === 'govde' ? 'yvb-kiyafet yvb-kiyafet-govde' : `yvb-giyim yvb-giyim-${yuva}`;
      assert.match(s, new RegExp(`<g class="${sinif}" data-urun="${id}"`), `${yuva}/${id}`);
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

// ---------- Kıyafet (gövde yuvası), emzik, battaniye ----------
const KIYAFET_HEPSI = { ...HEPSI, govde: 'elbise', agiz: 'emzik', kucak: 'battaniye' };

test('giyim: küçükte (kundak) gövde ve kucak yok; ağız yuvası yok sayılır (emzik zaten var)', () => {
  for (const ruh of BEBEK_RUHLARI) {
    assert.equal(bebekSvg({ asama: 'kucuk', ruh, kimlik: 'k', giyim: { govde: 'elbise', agiz: 'emzik', kucak: 'battaniye' } }), bebekSvg({ asama: 'kucuk', ruh, kimlik: 'k' }), ruh);
  }
});

test('kıyafet: gövde boşsa bugünkü benekli tulum; dolu ise kıyafet ve tulum benekleri yok', () => {
  const v = bebekSvg({ asama: 'buyuk', kimlik: 't' });
  assert.match(v, /<g class="yvb-kiyafet yvb-kiyafet-govde"><path class="yvb-kumas" fill="url\(#t-kumas\)"/);
  assert.match(v, /fill="url\(#t-benek\)"/, 'tulum benekli');
  assert.doesNotMatch(v, /yvb-kiyafet-bacak|data-urun/);
  assert.equal(bebekSvg({ asama: 'buyuk', kimlik: 't', giyim: { govde: 'tulum' } }), v, 'tulum ürün değil; yok sayılır');
  const ciktilar = new Set([v]);
  for (const id of YUVALAR.govde) {
    const s = bebekSvg({ asama: 'buyuk', kimlik: 't', giyim: { govde: id } });
    ciktilar.add(s);
    assert.doesNotMatch(s, /url\(#t-benek\)/, `${id}: tulum beneği yok`);
    assert.match(s, new RegExp(`<g class="yvb-kiyafet yvb-kiyafet-kol" data-urun="${id}"`), id);
    assert.ok(dengeli(s), id);
    assert.doesNotMatch(s, /undefined|NaN/, id);
    assert.match(s, /class="yvb-kumas" fill="url\(#t-kumas\)"/, `${id}: renk --yv-govde kumaşından`);
  }
  assert.equal(ciktilar.size, YUVALAR.govde.length + 1, 'her kıyafet ayrı çizim');
  // Etek ve paça bacakların üstünde, ayakların altında.
  for (const id of ['elbise', 'pijama']) {
    const s = bebekSvg({ asama: 'buyuk', kimlik: 't', giyim: { govde: id } });
    const i = (x) => s.indexOf(x);
    assert.ok(i('<g class="yvb-bacak">') < i('yvb-kiyafet-bacak') && i('yvb-kiyafet-bacak') < i('<g class="yvb-ayak"'), id);
  }
  assert.ok((bebekSvg({ asama: 'buyuk', giyim: { govde: 'elbise' } }).match(/class="yvb-etek-fisto"/g) || []).length >= 3, 'kat kat fistolu etek');
});

test('kıyafet: banyo gizlemesi için yeni katmanlar .yvb-kiyafet ya da .yvb-giyim altında; id benzersiz', () => {
  const s = bebekSvg({ asama: 'buyuk', kimlik: 'b', giyim: KIYAFET_HEPSI });
  for (const x of ['yvb-kiyafet yvb-kiyafet-govde', 'yvb-kiyafet yvb-kiyafet-bacak', 'yvb-kiyafet yvb-kiyafet-kol',
    'yvb-giyim yvb-giyim-agiz', 'yvb-giyim yvb-giyim-kucak']) {
    assert.match(s, new RegExp(`<g class="${x}"`), x);
  }
  // Yeni süs sınıfları yalnız bu katmanların içinde.
  for (const [sinif, kap] of [['yvb-etek-fisto', 'yvb-kiyafet-bacak'], ['yvb-g-battaniye', 'yvb-giyim-kucak'], ['yvb-emzik-kalkan', 'yvb-giyim-agiz']]) {
    const bas = s.indexOf(`${kap}"`);
    assert.ok(bas > 0 && s.indexOf(sinif) > bas, sinif);
  }
  assert.ok(dengeli(s));
  const ids = idler(s);
  assert.equal(new Set(ids).size, ids.length, 'id tekrar yok');
  for (const [, ref] of s.matchAll(/url\(#([^)]+)\)/g)) assert.ok(ids.includes(ref), ref);
  const b = bebekSvg({ asama: 'buyuk', giyim: KIYAFET_HEPSI });
  const c = bebekSvg({ asama: 'buyuk', giyim: KIYAFET_HEPSI });
  assert.equal(idler(b).filter((x) => idler(c).includes(x)).length, 0, 'iki kıyafetli SVG ortak id taşımaz');
});

test('emzik: ağzın üstünde; ağlama ve kahkahada çıkar (ağız görünür); konuşmada CSS gizler', () => {
  const ag = (x) => x.slice(x.indexOf('<g class="yvb-agiz">'), x.indexOf('</g>', x.indexOf('<g class="yvb-agiz">')));
  for (const ruh of BEBEK_RUHLARI) {
    const s = bebekSvg({ asama: 'buyuk', ruh, kimlik: 'e', giyim: { agiz: 'emzik' } });
    const yok = bebekSvg({ asama: 'buyuk', ruh, kimlik: 'e' });
    if (['aglama', 'kahkaha'].includes(ruh)) {
      assert.equal(s, yok, `${ruh}: emzik yok, çizim aynı`);
    } else {
      assert.match(s, /<g class="yvb-giyim yvb-giyim-agiz" data-urun="emzik" transform="translate\(100 102\)"><g class="yvb-emzik">/, ruh);
      assert.match(ag(s), /M-3\.5 27 Q0 29 3\.5 27/, `${ruh}: ağız emziğin altında minik`);
      assert.ok(s.indexOf('yvb-giyim-agiz') > s.indexOf('<g class="yvb-yuz"'), `${ruh}: emzik yüzün önünde`);
    }
  }
  assert.match(BEBEK_CSS, /\[data-konusuyor\] \.yvb-emzik \{ display: none; \}/);
  assert.match(ag(bebekSvg({ asama: 'buyuk', ruh: 'mutlu', kimlik: 'e' })), /yvb-agiz-ic/, 'emziksiz mutlu ağız açık');
});

test('battaniye: elin altında (bacaklardan sonra, kol katmanından önce)', () => {
  const s = bebekSvg({ asama: 'buyuk', kimlik: 'b', giyim: { kucak: 'battaniye' } });
  const i = (x) => s.indexOf(x);
  assert.ok(i('<g class="yvb-bacak">') < i('yvb-giyim-kucak') && i('yvb-giyim-kucak') < i('<g class="yvb-kol">'));
});

test('kucukBoy: büyükte el ve ayak parmaksız; baş, yüz, kıyafet aynı; yavruSvg geçirir', () => {
  const normal = bebekSvg({ asama: 'buyuk', kimlik: 'kb', giyim: KIYAFET_HEPSI });
  const kucuk = bebekSvg({ asama: 'buyuk', kimlik: 'kb', giyim: KIYAFET_HEPSI, kucukBoy: true });
  assert.match(normal, /yvb-parmak/);
  assert.doesNotMatch(kucuk, /yvb-parmak/, 'el parmaksız');
  assert.equal((kucuk.match(/<g class="yvb-el"/g) || []).length, 2);
  assert.equal((kucuk.match(/<circle class="yvb-ten"/g) || []).length, 0, 'ayak parmağı yok');
  const bas = (x) => x.slice(x.indexOf('<g class="yvb-bas">'));
  assert.equal(bas(kucuk), bas(normal), 'baş, yüz ve aksesuarlar aynı');
  const ust = (x) => x.slice(0, x.indexOf('<g class="yvb-bacak">'));
  assert.equal(ust(kucuk), ust(normal), 'gövde ve kıyafet aynı');
  assert.ok(dengeli(kucuk));
  assert.equal(bebekSvg({ asama: 'kucuk', kimlik: 'kb', kucukBoy: true }), bebekSvg({ asama: 'kucuk', kimlik: 'kb' }), 'kundakta el yok; aynı');
  assert.equal(bebekSvg({ kimlik: 'kb', kucukBoy: 'evet' }), bebekSvg({ kimlik: 'kb' }), 'yalnız true');
  assert.equal(yavruSvg({ asama: 'buyuk', kimlik: 'kb', kucukBoy: true }), bebekSvg({ asama: 'buyuk', kimlik: 'kb', kucukBoy: true }));
});
