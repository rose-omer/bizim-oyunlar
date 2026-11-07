// Tema üreteci: CSS farkı. Tema dosyası ana dosyanın ardına eklenince temanın kendi hâliyle aynı sonucu vermeli.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ayristir, secicilik, temaFarki, yaz, kapsamla, yukselt, urlCevir, jsCss } from '../dev/tema-fark.mjs';

const fark = (ata, ana, tema, s) => yaz(temaFarki({ ata, ana, tema, ...s }).ogeler).replace(/\s+/g, ' ').trim();

test('ayristir: kural, bağlam, yorum, dize ve url içi noktalama', () => {
  const o = ayristir(`/* { */ .a { color: red; background: url(data:image/svg+xml;base64,AA==); content: "}"; }
    @media (min-width: 1px) { .b, .c { margin: 0 } }`);
  assert.equal(o.length, 2);
  assert.equal(o[0].secici, '.a');
  assert.deepEqual(o[0].bildirimler.map((b) => b[0]), ['color', 'background', 'content']);
  assert.equal(o[0].bildirimler[2][1], '"}"');
  assert.deepEqual(o[1].baglam, ['@media (min-width: 1px)']);
  assert.equal(o[1].secici, '.b, .c');
});

test('ayristir: @import, @font-face ve @keyframes ayrı öğedir', () => {
  const o = ayristir(`@import url('a/b.css'); @font-face { font-family: 'X'; src: url('x.woff2'); } @keyframes k { from { top: 0 } to { top: 1px } }`);
  assert.deepEqual(o.map((x) => x.tur), ['import', 'blok', 'blok']);
  assert.equal(o[0].adres, 'a/b.css');
  assert.equal(o[2].bas, '@keyframes k');
});

test('secicilik: kimlik, sınıf, öğe; :where sıfır; :not içeriği sayılır', () => {
  assert.deepEqual(secicilik('#a .b p::before'), [1, 1, 2]);
  assert.deepEqual(secicilik(":root[data-mod='koyu'] .x:hover"), [0, 4, 0]);
  assert.deepEqual(secicilik(':where(.a .b) p'), [0, 0, 1]);
  assert.deepEqual(secicilik('.a:not(.b, #c)'), [1, 1, 0]);
});

test('temaFarki: yalnız değişen bildirim yazılır', () => {
  const ata = '.a { color: red; top: 0 }';
  assert.equal(fark(ata, ata, '.a { color: blue; top: 0 }'), '.a { color: blue; }');
  assert.equal(fark(ata, ata, ata), '');
});

test('temaFarki: yeni kural ve medya bağlamı korunur', () => {
  assert.equal(fark('', '', '@media (x) { .a { top: 0 } }'), '@media (x) { .a { top: 0; } }');
});

test('temaFarki: aynı seçicilikte sonraki kural değişmese de yeniden yazılır (sıra korunur)', () => {
  const ata = '.a { color: red } .b { color: green }';
  assert.equal(fark(ata, ata, '.a { color: blue } .b { color: green }'), '.a { color: blue; } .b { color: green; }');
});

test('temaFarki: kısa ve uzun özellik aynı ailedir', () => {
  const ata = '.a { background: red } .b { background-color: green }';
  assert.equal(fark(ata, ata, '.a { background: blue } .b { background-color: green }'),
    '.a { background: blue; } .b { background-color: green; }');
});

test('temaFarki: farklı seçicilikte sonraki kural yazılmaz', () => {
  const ata = '.a { color: red } .b .c { color: green }';
  assert.equal(fark(ata, ata, '.a { color: blue } .b .c { color: green }'), '.a { color: blue; }');
});

test('temaFarki: temanın kaldırdığı bildirim geri alınır', () => {
  const ata = '.a { box-shadow: 0 0 1px; top: 0 }';
  assert.equal(fark(ata, ata, '.a { top: 0 }'), '.a { box-shadow: initial; }');
});

test('temaFarki: temanın kaldırdığı kuralın bildirimleri geri alınır', () => {
  const ata = '.a::before { content: "x" } .b { top: 0 }';
  assert.equal(fark(ata, ata, '.b { top: 0 }'), '.a::before { content: initial; }');
});

test('temaFarki: ana dalda sonradan gelen kural temada da kalır (Pamuk süsü data-tema ile ayrılır)', () => {
  const ata = '.a { top: 0 }';
  assert.equal(fark(ata, `${ata} .yeni { color: red; --x: 1 }`, ata), '');
});

test('temaFarki: ana dalda yeni olan bağlamlı kural (ekran uyarlaması) kalır', () => {
  const ata = '.a { top: 0 }';
  assert.equal(fark(ata, `${ata} @media (max-width: 379px) { .tab { font-size: 11px } }`, ata), '');
});

test('temaFarki: varsayılan temaya bağlı yeni kural zaten söner, geri alınmaz', () => {
  const ata = '.a { top: 0 }';
  assert.equal(fark(ata, `${ata} :where([data-tema='pamuk']) body .x { color: red }`, ata), '');
});

test('temaFarki: anaKorur: ana dalda yeni olan kurala dokunulmaz', () => {
  const ata = '.a { top: 0 }';
  assert.equal(fark(ata, `${ata} .yeni { color: red }`, ata, { anaKorur: true }), '');
});

test('temaFarki: ana dalın sonradan eklediği bildirim temada da kalır', () => {
  assert.equal(fark('.a { top: 0 }', '.a { top: 0; filter: blur(1px) }', '.a { top: 0 }'), '');
});

test('temaFarki: anaKorur: Pamuk için ayrılan bildirim temada kendi değeriyle yazılır', () => {
  assert.equal(fark('.a { color: red }', ":where([data-tema='pamuk']) .a { color: red }", '.a { color: red }', { anaKorur: true }), '.a { color: red; }');
});

test('temaFarki: ana dalın değiştirdiği değer temada eski kalmışsa eskiye döner', () => {
  assert.equal(fark('.a { top: 0 }', '.a { top: 1px }', '.a { top: 0 }'), '.a { top: 0; }');
});

test('temaFarki: anaKorur: temanın değiştirmediğine dokunulmaz, değiştirdiği yazılır', () => {
  const s = { anaKorur: true };
  assert.equal(fark('.a { top: 0 }', '.a { top: 1px; filter: none }', '.a { top: 0 }', s), '');
  assert.equal(fark('.a { top: 0 }', '.a { top: 1px }', '.a { top: 2px }', s), '.a { top: 2px; }');
  assert.equal(fark('.a { top: 0; color: red }', '.a { top: 0; color: red }', '.a { top: 0 }', s), '.a { color: inherit; }');
});

test('temaFarki: özel değişken kaldırılınca geri alınmaz', () => {
  const ata = ':root { --x: 1; --y: 2 }';
  assert.equal(fark(ata, ata, ':root { --y: 2 }'), '');
});

test('temaFarki: değişen @keyframes bütün yazılır, aynısı yazılmaz', () => {
  const k = (v) => `@keyframes k { from { top: ${v} } }`;
  assert.equal(fark(k(0), k(0), k(0)), '');
  assert.match(fark(k(0), k(0), k(1)), /^@keyframes k \{ from \{ top: 1 \} \}$/);
});

test('temaFarki: @font-face ve @import ayrı döner', () => {
  const r = temaFarki({ ata: '', ana: '', tema: `@import url('f/x.css'); @font-face { font-family: 'Y'; src: url('y.woff2') }` });
  assert.deepEqual(r.importlar, ['f/x.css']);
  assert.match(yaz(r.ogeler), /font-family: 'Y'/);
});

test('kapsamla: sayfa kapsamı seçiciliği değiştirmez ve kök seçiciye yapışır', () => {
  const k = ":where([data-sayfa='s/a'])";
  assert.equal(kapsamla('.a, .b p', k), `${k} .a, ${k} .b p`);
  assert.equal(kapsamla(":root[data-mod='koyu'] .x", k), `:root[data-mod='koyu']${k} .x`);
  assert.equal(kapsamla(':root', k), `:root${k}`);
  assert.equal(kapsamla('html.a', k), `html.a${k}`);
  assert.equal(kapsamla('body.a .b', k), `${k} body.a .b`);
  assert.equal(kapsamla('.a:not(.b, .c)', k), `${k} .a:not(.b, .c)`);
});

test('yukselt: seçiciliği bir sınıf artırır (sonradan gelen <style> yenilsin)', () => {
  assert.equal(yukselt('.a, .b'), ':root .a, :root .b');
  assert.equal(yukselt(":root[data-mod='koyu'] .x"), ":root:root[data-mod='koyu'] .x");
});

test('urlCevir: göreli adres yeni dosyaya göre yazılır; data ve kök adres kalır', () => {
  const c = urlCevir(`a: url('../assets/x.png'); b: url(data:image/png;base64,AA); c: url("y.svg")`, 'css/base.css', 'css/temalar/t/temel.css', (y) => y);
  assert.equal(c, `a: url('../../../assets/x.png'); b: url(data:image/png;base64,AA); c: url('../../y.svg')`);
});

test('urlCevir: data adresi içindeki SVG başvurusu bozulmaz', () => {
  const s = `a: url("data:image/svg+xml,<rect filter='url(%23n)'/>")`;
  assert.equal(urlCevir(s, 'css/base.css', 'css/temalar/t/temel.css'), s);
});

test('urlCevir: eşleyici adresi taşır', () => {
  const c = urlCevir(`src: url('../assets/fonts/a/b.woff2')`, 'css/base.css', 'css/temalar/t/temel.css', (y) => y.replace('assets/fonts/', 'assets/fonts/temalar/'));
  assert.equal(c, `src: url('../../../assets/fonts/temalar/a/b.woff2')`);
});

test('jsCss: şablon metinlerinden CSS alır, SVG ve düz metni bırakır', () => {
  const js = 'const A = `<svg viewBox="0 0 1 1"><path/></svg>`;\nconst B = `selam ${ad}`;\nconst C = `\n.a { color: red; }\n.b { top: ${x}px; }\n`;';
  const c = jsCss(js);
  assert.match(c, /\.a \{ color: red; \}/);
  assert.doesNotMatch(c, /svg/);
  assert.doesNotMatch(c, /selam/);
});

test('temaFarki: JS aradeğeri olan bildirim atlanır', () => {
  assert.equal(fark('.a { top: 0 }', '.a { top: 0 }', '.a { top: §px }'), '');
});
