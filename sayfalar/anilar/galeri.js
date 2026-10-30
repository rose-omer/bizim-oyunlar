// Fotoğraf galerisi: kaydırarak (scroll-snap) ya da ok tuşlarıyla gezilir; tam ekran görüntüleyici.
import { h } from '../../js/core/ui.js';
import { fotoImg } from '../../js/core/foto.js';
import { ikon } from './ikon.js';

const azHareket = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * fotolar: [{ url, alt }]. -> { el, git(i), indeks(), tus(e) }
 * tam: tam ekran görünümü (resimler sığdırılır, ilk resim hemen yüklenir).
 */
export function galeri(fotolar, { baslangic = 0, tam = false, onDegis, onTamEkran } = {}) {
  const n = fotolar.length;
  let i = Math.max(0, Math.min(n - 1, baslangic));
  const iz = h('div', {
    class: 'galeri-iz', tabindex: '0', role: 'group',
    'aria-roledescription': 'galeri', 'aria-label': n > 1 ? `${n} fotoğraf. Ok tuşlarıyla gezebilirsin.` : 'Fotoğraf',
  }, fotolar.map((f, k) => h('figure', { class: 'galeri-kare', 'aria-label': `${k + 1} / ${n}` },
    fotoImg(f.url, { alt: f.alt || '', eager: Math.abs(k - i) <= 1 }))));
  const sayac = h('span', { class: 'galeri-sayac', 'aria-live': 'polite' });
  const onceki = h('button', { type: 'button', class: 'galeri-ok sol', 'aria-label': 'Önceki fotoğraf', onclick: () => git(i - 1) }, ikon('sol'));
  const sonraki = h('button', { type: 'button', class: 'galeri-ok sag', 'aria-label': 'Sonraki fotoğraf', onclick: () => git(i + 1) }, ikon('sag'));
  const noktalar = h('div', { class: 'galeri-noktalar', 'aria-hidden': 'true' }, fotolar.map(() => h('span')));
  const el = h('div', { class: `galeri${tam ? ' tam' : ''}`, dataset: n <= 1 ? { tek: '1' } : null },
    iz,
    n > 1 ? [onceki, sonraki, sayac] : null,
    onTamEkran ? h('button', { type: 'button', class: 'galeri-genislet', 'aria-label': 'Tam ekran', onclick: () => onTamEkran(i) }, ikon('genislet')) : null,
    n > 1 && !tam ? noktalar : null);

  const boya = () => {
    sayac.textContent = `${i + 1} / ${n}`;
    onceki.disabled = i <= 0;
    sonraki.disabled = i >= n - 1;
    [...noktalar.children].forEach((d, k) => d.classList.toggle('on', k === i));
  };

  // Düğme/tuşla kaydırırken ara kareler sayacı geri çekmesin: hedefe varana kadar kaydırma olayı yok sayılır.
  let hedefK = null;
  let hedefZaman = 0;
  function git(k, { anlik = false } = {}) {
    const hedef = Math.max(0, Math.min(n - 1, k));
    const w = iz.clientWidth;
    hedefK = hedef;
    clearTimeout(hedefZaman);
    hedefZaman = setTimeout(() => { hedefK = null; }, 900);
    if (w) iz.scrollTo({ left: hedef * w, behavior: anlik || azHareket() ? 'auto' : 'smooth' });
    if (hedef !== i) {
      i = hedef;
      boya();
      onDegis?.(i);
    }
  }

  // Sayaç yalnız kullanıcı kaydırınca kaydırmadan okunur; boyut değişimi ya da tarayıcının
  // kaydırmayı kırpması sırayı bozmasın.
  let dokunus = 0;
  for (const ev of ['pointerdown', 'touchstart', 'wheel']) {
    iz.addEventListener(ev, () => { dokunus = Date.now(); hedefK = null; }, { passive: true });
  }
  let kare = 0;
  iz.addEventListener('scroll', () => {
    if (kare || Date.now() - dokunus > 2500) return;
    kare = requestAnimationFrame(() => {
      kare = 0;
      const w = iz.clientWidth;
      if (!w) return;
      const k = Math.round(iz.scrollLeft / w);
      if (hedefK !== null) {
        if (k === hedefK) hedefK = null;
        return;
      }
      if (k !== i && k >= 0 && k < n) {
        i = k;
        boya();
        onDegis?.(i);
      }
    });
  }, { passive: true });

  const tus = (e) => {
    if (e.defaultPrevented) return; // iç içe dinleyiciler aynı tuşu iki kez işlemesin
    if (e.key === 'ArrowLeft') { git(i - 1); e.preventDefault(); }
    else if (e.key === 'ArrowRight') { git(i + 1); e.preventDefault(); }
  };
  iz.addEventListener('keydown', tus);

  // Yerleşim oluşunca başlangıç karesine atla; boyut değişince hizayı koru.
  requestAnimationFrame(() => git(i, { anlik: true }));
  if (typeof ResizeObserver === 'function') {
    new ResizeObserver(() => { const w = iz.clientWidth; if (w) iz.scrollLeft = i * w; }).observe(iz);
  }
  boya();
  return { el, git, indeks: () => i, tus };
}

/**
 * Tam ekran görüntüleyici. fotolar: [{ url, alt, altyazi?, eylem?: { label, onClick } }]
 * Esc / kapat düğmesi kapatır; ok tuşları gezer.
 */
export function tamEkranAc(fotolar, baslangic = 0) {
  const onceOdak = document.activeElement;
  const altyazi = h('div', { class: 'tam-altyazi' });
  const boyaAlt = (k) => {
    const f = fotolar[k] || {};
    altyazi.replaceChildren(...[
      f.altyazi ? h('p', { class: 'tam-altyazi-metin' }, f.altyazi) : null,
      f.eylem ? h('button', { type: 'button', class: 'btn small', onclick: () => { dlg.close(); f.eylem.onClick(); } }, f.eylem.label) : null,
    ].filter(Boolean));
    altyazi.hidden = !f.altyazi && !f.eylem;
  };
  const g = galeri(fotolar, { baslangic, tam: true, onDegis: boyaAlt });
  const dlg = h('dialog', { class: 'galeri-tam', 'aria-label': 'Fotoğraf görüntüleyici' },
    h('button', { type: 'button', class: 'tam-kapat', 'aria-label': 'Kapat', onclick: () => dlg.close() }, ikon('kapat')),
    g.el,
    altyazi);
  dlg.addEventListener('keydown', g.tus);
  dlg.addEventListener('close', () => {
    dlg.remove();
    if (onceOdak?.isConnected) onceOdak.focus({ preventScroll: true });
  });
  boyaAlt(g.indeks());
  document.body.append(dlg);
  dlg.showModal();
  dlg.querySelector('.galeri-iz')?.focus({ preventScroll: true });
  return () => dlg.close();
}
