// Tema üreteci: saf CSS farkı (Node'da çalışır, yayınlanmaz).
// ata = stillerin ayrıldığı sürüm, ana = şimdiki site, tema = stilin hâli.
// Çıktı ana dosyanın ardına eklenince, temanın kendi dosyasıyla aynı sonucu vermeyi amaçlar:
// aynı seçici aynı seçicilikle yazılır; sıra bozulmasın diye sonraki eşit seçicilikli bildirimler de yeniden yazılır.
import { posix } from 'node:path';

const BAGLAM_RE = /^@(media|supports|container|layer)\b/i;
const ILE_GELEN = /^(color|font|letter-spacing|line-height|text-|word-spacing|white-space|cursor|visibility)/; // kalıtımla gelen özellikler

/** Metinde i'den sonra dize, yorum ve parantez dışındaki ilk `dur` karakterlerinden birini bulur. */
function tara(m, i, dur) {
  let parantez = 0;
  for (; i < m.length; i++) {
    const c = m[i];
    if (c === '"' || c === "'") {
      i = dizeSonu(m, i);
    } else if (c === '/' && m[i + 1] === '*') {
      const s = m.indexOf('*/', i + 2);
      i = s < 0 ? m.length : s + 1;
    } else if (c === '(') {
      parantez++;
    } else if (c === ')') {
      parantez--;
    } else if (parantez <= 0 && dur.includes(c)) {
      return i;
    }
  }
  return -1;
}

function dizeSonu(m, i) {
  const q = m[i];
  for (i++; i < m.length; i++) {
    if (m[i] === '\\') i++;
    else if (m[i] === q) return i;
  }
  return m.length;
}

function yorumsuz(m) {
  let c = '';
  for (let i = 0; i < m.length; i++) {
    if (m[i] === '"' || m[i] === "'") {
      const s = dizeSonu(m, i);
      c += m.slice(i, s + 1);
      i = s;
    } else if (m[i] === '/' && m[i + 1] === '*') {
      const s = m.indexOf('*/', i + 2);
      i = s < 0 ? m.length : s + 1;
    } else {
      c += m[i];
    }
  }
  return c;
}

const sade = (s) => s.replace(/\s+/g, ' ').trim();

function kapanis(m, ac) {
  let d = 0;
  for (let i = ac; i < m.length; i++) {
    const c = m[i];
    if (c === '"' || c === "'") i = dizeSonu(m, i);
    else if (c === '{') d++;
    else if (c === '}' && --d === 0) return i;
  }
  return m.length;
}

function bildirimler(govde) {
  const out = [];
  let i = 0;
  while (i < govde.length) {
    let s = tara(govde, i, ';');
    if (s < 0) s = govde.length;
    const parca = govde.slice(i, s);
    const k = parca.indexOf(':');
    if (k > 0) out.push([parca.slice(0, k).trim(), sade(parca.slice(k + 1))]);
    i = s + 1;
  }
  return out;
}

/** CSS metni → düz öğe listesi: { tur:'kural'|'blok'|'import', baglam:[], ... }. */
export function ayristir(metin, baglam = []) {
  const m = yorumsuz(metin);
  const out = [];
  let i = 0;
  while (i < m.length) {
    const s = tara(m, i, '{;');
    if (s < 0) break;
    const bas = sade(m.slice(i, s));
    if (m[s] === ';') {
      const a = bas.match(/^@import\s+(?:url\()?\s*['"]?([^'")\s]+)/i);
      if (a) out.push({ tur: 'import', baglam, adres: a[1] });
      i = s + 1;
      continue;
    }
    const son = kapanis(m, s);
    const govde = m.slice(s + 1, son);
    if (BAGLAM_RE.test(bas)) {
      out.push(...ayristir(govde, [...baglam, bas]));
    } else if (bas.startsWith('@') || govde.includes('{')) {
      out.push({ tur: 'blok', baglam, bas, govde: sade(govde) });
    } else if (bas) {
      out.push({ tur: 'kural', baglam, secici: bas, bildirimler: bildirimler(govde) });
    }
    i = son + 1;
  }
  return out;
}

/** Üst düzey virgüllerden böler. */
function bol(s) {
  const out = [];
  let d = 0;
  let b = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '"' || c === "'") i = dizeSonu(s, i);
    else if (c === '(' || c === '[') d++;
    else if (c === ')' || c === ']') d--;
    else if (c === ',' && d === 0) { out.push(s.slice(b, i).trim()); b = i + 1; }
  }
  out.push(s.slice(b).trim());
  return out;
}

function tekSecicilik(s) {
  let a = 0;
  let b = 0;
  let c = 0;
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (ch === '#') {
      a++;
      i++;
      while (i < s.length && /[\w-]/.test(s[i])) i++;
    } else if (ch === '.') {
      b++;
      i++;
      while (i < s.length && /[\w-]/.test(s[i])) i++;
    } else if (ch === '[') {
      b++;
      let d = 0;
      for (; i < s.length; i++) {
        if (s[i] === '"' || s[i] === "'") i = dizeSonu(s, i);
        else if (s[i] === '[') d++;
        else if (s[i] === ']' && --d === 0) { i++; break; }
      }
    } else if (ch === ':') {
      const ikili = s[i + 1] === ':';
      i += ikili ? 2 : 1;
      const b0 = i;
      while (i < s.length && /[\w-]/.test(s[i])) i++;
      const ad = s.slice(b0, i).toLowerCase();
      let ic = null;
      if (s[i] === '(') {
        let d = 0;
        const a0 = i + 1;
        for (; i < s.length; i++) {
          if (s[i] === '(') d++;
          else if (s[i] === ')' && --d === 0) break;
        }
        ic = s.slice(a0, i);
        i++;
      }
      if (ikili || ['before', 'after', 'first-line', 'first-letter'].includes(ad)) c++;
      else if (ad === 'where') { /* sıfır */ }
      else if (['is', 'not', 'has'].includes(ad) && ic != null) {
        const [x, y, z] = secicilik(ic);
        a += x; b += y; c += z;
      } else {
        b++;
      }
    } else if (/[a-zA-Z]/.test(ch)) {
      c++;
      while (i < s.length && /[\w-]/.test(s[i])) i++;
    } else {
      i++;
    }
  }
  return [a, b, c];
}

/** En yüksek seçicilik (liste için en büyüğü). */
export function secicilik(secici) {
  return bol(secici).map(tekSecicilik).reduce((e, x) => (x[0] - e[0] || x[1] - e[1] || x[2] - e[2]) > 0 ? x : e, [0, 0, 0]);
}

function aile(p) {
  if (p.startsWith('--')) return p;
  const y = p.replace(/^-(webkit|moz|ms)-/, '');
  if (['top', 'right', 'bottom', 'left'].includes(y)) return 'inset';
  return y.split('-')[0];
}

const anahtar = (o) => `${o.baglam.join(' | ')} || ${bol(o.secici).join(',')}`;

function harita(ogeler) {
  const kurallar = new Map();
  const bloklar = new Map();
  for (const o of ogeler) {
    if (o.tur === 'kural') {
      const k = anahtar(o);
      if (!kurallar.has(k)) kurallar.set(k, new Map());
      for (const [p, v] of o.bildirimler) kurallar.get(k).set(p, v);
    } else if (o.tur === 'blok') {
      bloklar.set(`${o.baglam.join(' | ')} || ${o.bas === '@font-face' ? o.govde : o.bas}`, o.govde);
    }
  }
  return { kurallar, bloklar };
}

/**
 * -> { ogeler, importlar }. anaKorur: temanın atadan farklı yazmadığı yere dokunmaz
 * (ana dalın o dosyadaki değişiklikleri temaya da geçer).
 */
export function temaFarki({ ata = '', ana = '', tema = '', anaKorur = false }) {
  const oAta = ayristir(ata);
  const oAna = ayristir(ana);
  const oTema = ayristir(tema);
  const hAta = harita(oAta);
  const hAna = harita(oAna);
  const hTema = harita(oTema);
  const ogeler = [];
  const degen = new Set();
  const izler = (secici, p) => bol(secici).map((s) => `${aile(p)}|${tekSecicilik(s).join()}`);

  // Temada olmayan bildirimler: önce geri al, sonra temanın kuralları üstüne yazılır.
  for (const o of oAna) {
    if (o.tur !== 'kural') continue;
    const k = anahtar(o);
    const ap = hAta.kurallar.get(k);
    if (!ap) continue; // sonradan gelen kural kalır; Pamuk süsü kaynakta [data-tema='pamuk'] ile ayrılır
    const tp = hTema.kurallar.get(k);
    const geri = [];
    for (const [p] of o.bildirimler) {
      if (tp?.has(p) || geri.some((g) => g[0] === p)) continue;
      if (p.startsWith('--') || !ap.has(p)) continue; // değişken temada başka seçiciye taşınmış olabilir; sonradan gelen bildirim kalır
      geri.push([p, ILE_GELEN.test(p) ? 'inherit' : 'initial']); // revert kullanma: düğmeyi tarayıcı varsayılanına düşürür
      for (const iz of izler(o.secici, p)) degen.add(iz);
    }
    if (geri.length) ogeler.push({ tur: 'kural', baglam: o.baglam, secici: o.secici, bildirimler: geri });
  }

  const importlar = [];
  for (const o of oTema) {
    if (o.tur === 'import') {
      importlar.push(o.adres);
    } else if (o.tur === 'blok') {
      const k = `${o.baglam.join(' | ')} || ${o.bas === '@font-face' ? o.govde : o.bas}`;
      if (hAna.bloklar.get(k) === o.govde) continue;
      if (anaKorur && hAta.bloklar.get(k) === o.govde) continue;
      ogeler.push(o);
    } else {
      if (o.secici.includes('§')) continue;
      const k = anahtar(o);
      const tp = hTema.kurallar.get(k);
      const secilen = [];
      for (const [p, v] of o.bildirimler) {
        if (v.includes('§')) continue;
        const son = tp.get(p);
        const anaDeger = hAna.kurallar.get(k)?.get(p);
        let degisti = anaDeger !== son;
        if (degisti && anaKorur && anaDeger !== undefined && hAta.kurallar.get(k)?.get(p) === son) degisti = false;
        const iz = izler(o.secici, p);
        if (degisti || iz.some((x) => degen.has(x))) {
          secilen.push([p, v]);
          for (const x of iz) degen.add(x);
        }
      }
      if (secilen.length) ogeler.push({ tur: 'kural', baglam: o.baglam, secici: o.secici, bildirimler: secilen });
    }
  }
  return { ogeler, importlar };
}

/** Öğeleri CSS metnine çevirir. donustur: seçiciyi değiştirmek için. */
export function yaz(ogeler, { donustur = (s) => s } = {}) {
  const satirlar = [];
  let acik = [];
  const kapat = (n) => { while (acik.length > n) { acik.pop(); satirlar.push('}'); } };
  for (const o of ogeler) {
    let ortak = 0;
    while (ortak < acik.length && ortak < o.baglam.length && acik[ortak] === o.baglam[ortak]) ortak++;
    kapat(ortak);
    for (const b of o.baglam.slice(ortak)) { satirlar.push(`${b} {`); acik.push(b); }
    if (o.tur === 'blok') satirlar.push(`${o.bas} { ${o.govde} }`);
    else satirlar.push(`${donustur(o.secici)} { ${o.bildirimler.map(([p, v]) => `${p}: ${v};`).join(' ')} }`);
  }
  kapat(0);
  return satirlar.length ? `${satirlar.join('\n')}\n` : '';
}

/** Seçicinin ilk bileşik parçasının bittiği yer (üst düzey boşluk ya da birleştirici). */
function bilesikSonu(s) {
  let d = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '"' || c === "'") i = dizeSonu(s, i);
    else if (c === '(' || c === '[') d++;
    else if (c === ')' || c === ']') d--;
    else if (d === 0 && /[\s>+~]/.test(c)) return i;
  }
  return s.length;
}

/** Seçici listesini sayfa kapsamına alır (kapsam :where olduğundan seçicilik değişmez). */
export function kapsamla(secici, kapsam) {
  return bol(secici).map((s) => {
    if (/^(:root|html)(?![\w-])/.test(s)) {
      const son = bilesikSonu(s);
      return s.slice(0, son) + kapsam + s.slice(son);
    }
    return `${kapsam} ${s}`;
  }).join(', ');
}

/** Seçiciliği bir sınıf artırır: çalışma anında sonradan eklenen <style> yenilsin. */
export function yukselt(secici) {
  return bol(secici).map((s) => {
    if (s.startsWith(':root')) return `:root${s}`;
    if (/^html(?![\w-])/.test(s)) return `html:root${s.slice(4)}`;
    return `:root ${s}`;
  }).join(', ');
}

/** url(...) adreslerini kaynaktan hedefe göre yeniden yazar. esle(sitede yol) -> yeni yol. */
export function urlCevir(metin, kaynak, hedef, esle = (y) => y) {
  return metin.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g, (tum, _q, adres) => {
    if (/^(data:|https?:|\/|#|%23)/i.test(adres)) return tum; // %23: data adresi içindeki SVG başvurusu
    const yol = esle(posix.normalize(posix.join(posix.dirname(kaynak), adres)));
    return `url('${posix.relative(posix.dirname(hedef), yol)}')`;
  });
}

/** JS'teki şablon metinlerinden CSS olanları birleştirir; ${...} yerine § yazar. */
export function jsCss(js) {
  const temiz = js.replace(/^\s*\/\/.*$/gm, '');
  const out = [];
  for (const m of temiz.matchAll(/`((?:[^`\\]|\\.)*)`/g)) {
    let s = m[1];
    for (let i = 0; i < 3; i++) s = s.replace(/\$\{[^{}]*\}/g, '§');
    if (s.includes('<') || !/[^{}]+\{[^{}]*:[^{}]*\}/.test(s)) continue;
    out.push(s.replace(/\\\\/g, '\\'));
  }
  return out.join('\n');
}
