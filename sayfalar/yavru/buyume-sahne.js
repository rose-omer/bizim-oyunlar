// Yavrumuz: "büyüdü" geçiş sahnesi. Kundaktaki bebek parıltıyla oturan büyük bebeğe dönüşür; yazı ve kısa konfeti.
// ~3,8 sn; dokununca (ya da Escape/Enter) geçilir; hareket azaltmada doğrudan son kare. Çatlama sahnesi deseni
// (cizim.js .yv-cs + app.js catlamaSahnesi): tam ekran kat, arka plan inert, cihaz başına bir kez (kararı çağıran verir).
// Üst düzeyde DOM yok: buyumeSahnesiGerekli, buyumeMetni, konfetiParcalari, buyumeCizimleri Node'da test edilir.
import { bebekSvg } from './bebek.js';
import { SAHNE_SURE } from './mantik.js';

export const BUYUME_SURE = 3800; // ms: kendiliğinden kapanma (hareketli)
export const BUYUME_SURE_AZ = 2400; // ms: hareket azaltmada son karenin ekranda kalma süresi

/**
 * Büyüme sahnesi oynasın mı: yavru büyümüş, büyüme son SAHNE_SURE (3 gün) içinde ve bu cihaz sahneyi görmemiş
 * (goruldu: cihaz deposu). Büyüten de sonra açan sevgili de bir kez görür. Eski büyümelerde oynamaz.
 */
export function buyumeSahnesiGerekli(y, goruldu, simdi = Date.now()) {
  const t = Date.parse(y?.buyume);
  return y?.asama === 'buyuk' && !goruldu && Number.isFinite(t) && simdi - t < SAHNE_SURE;
}

/** 'Pamuk büyüdü! ✨'; ad yoksa 'Yavrumuz büyüdü! ✨'. */
export function buyumeMetni(ad) {
  const a = typeof ad === 'string' ? ad.trim() : '';
  return `${a || 'Yavrumuz'} büyüdü! ✨`;
}

/**
 * Konfeti parçaları (tohumlu, kararlı): [{ x: 0–100 (%), gecik: sn, sure: sn, don: derece, kay: px, renk: 1–6, sekil }].
 * sekil: 'serit' | 'daire' | 'kalp'.
 */
export function konfetiParcalari(n = 26, tohum = 7) {
  let s = tohum >>> 0 || 1;
  const r = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 2 ** 32; };
  const sekiller = ['serit', 'serit', 'daire', 'kalp'];
  return Array.from({ length: n }, (_, i) => ({
    x: Math.round(((i + r()) / n) * 1000) / 10,
    gecik: Math.round(r() * 45) / 100,
    sure: Math.round((1.3 + r() * 0.8) * 100) / 100,
    don: Math.round((r() - 0.5) * 720),
    kay: Math.round((r() - 0.5) * 80),
    renk: 1 + Math.floor(r() * 6),
    sekil: sekiller[Math.floor(r() * sekiller.length)],
  }));
}

/** Sahnenin iki çizimi: önce küçük (kundak), sonra büyük; ikisi de mutlu ve aynı giyimle. */
export function buyumeCizimleri({ renk = 1, kisilik = '', giyim = null } = {}) {
  return {
    kucuk: bebekSvg({ asama: 'kucuk', ruh: 'mutlu', renk, giyim }),
    buyuk: bebekSvg({ asama: 'buyuk', ruh: 'mutlu', renk, kisilik, giyim }),
  };
}

// Parıltılar: [x %, y %, gecikme sn, ölçek]
const YILDIZLAR = [[14, 40, 0, 1], [84, 34, 0.06, 1.25], [22, 72, 0.14, 0.8], [80, 70, 0.1, 0.95], [34, 16, 0.2, 0.75], [66, 14, 0.04, 0.9], [50, 6, 0.16, 0.7]];
const YILDIZ = '<svg viewBox="-8 -8 16 16" aria-hidden="true" focusable="false"><path d="M0 -7 L1.8 -1.8 L7 0 L1.8 1.8 L0 7 L-1.8 1.8 L-7 0 L-1.8 -1.8 Z"/></svg>';

const azHareket = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

function stilEkle() {
  if (document.getElementById('yv-bs-stil')) return;
  const s = document.createElement('style');
  s.id = 'yv-bs-stil';
  s.textContent = BUYUME_CSS;
  document.head.append(s);
}

/**
 * Sahneyi oynatır. kok: eklenecek kap (genelde document.body; diğer çocukları sahne boyunca inert).
 * renk 1–6, kisilik, giyim ({ bas, goz, boyun }: giyim.js giyimOku), ad (yazı), onBitti (kapanınca bir kez).
 * -> { kapat() }. Çizim stilleri (CIZIM_CSS + BEBEK_CSS) sayfada olmalı.
 */
export function buyumeSahnesi(kok, { renk = 1, kisilik = '', giyim = null, ad = '', onBitti } = {}) {
  stilEkle();
  const az = azHareket();
  const c = Number.isInteger(renk) && renk >= 1 && renk <= 6 ? renk : 1;
  const ciz = buyumeCizimleri({ renk: c, kisilik, giyim });
  const onceOdak = document.activeElement;
  const yap = (tag, cls, html) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html) e.innerHTML = html; // yalnız kodla üretilen SVG
    return e;
  };

  const sahne = yap('div', 'yv-bs-sahne');
  sahne.setAttribute('aria-hidden', 'true');
  sahne.append(yap('span', 'yv-bs-hale'), yap('span', 'yv-bs-kucuk', ciz.kucuk), yap('span', 'yv-bs-isik'), yap('span', 'yv-bs-buyuk', ciz.buyuk));
  for (const [x, yy, g, s] of YILDIZLAR) {
    const y = yap('span', 'yv-bs-yildiz', YILDIZ);
    y.style.cssText = `left:${x}%;top:${yy}%;--gecik:${g}s;--olcek:${s}`;
    sahne.append(y);
  }
  const metin = yap('p', 'yv-bs-metin');
  metin.setAttribute('role', 'status');
  const gec = yap('button', 'yv-bs-gec');
  gec.type = 'button';
  gec.textContent = 'Devam';
  const kat = yap('div', `yv-bs${az ? ' az' : ''}`);
  kat.setAttribute('role', 'dialog');
  kat.setAttribute('aria-modal', 'true');
  kat.setAttribute('aria-label', buyumeMetni(ad));
  kat.style.setProperty('--yv-govde', `var(--yv-r${c})`);
  kat.append(sahne, metin, gec);
  if (!az) {
    const konfeti = yap('div', 'yv-bs-konfeti');
    konfeti.setAttribute('aria-hidden', 'true');
    for (const p of konfetiParcalari()) {
      const k = yap('i', `yv-bs-k ${p.sekil}`);
      k.style.cssText = `left:${p.x}%;--gecik:${p.gecik}s;--sure:${p.sure}s;--don:${p.don}deg;--kay:${p.kay}px;--renk:var(--yv-r${p.renk})`;
      konfeti.append(k);
    }
    kat.append(konfeti);
  }

  const inertler = [...kok.children].filter((e) => !e.inert && e.tagName !== 'SCRIPT');
  for (const e of inertler) e.inert = true;
  kok.append(kat);
  gec.focus({ preventScroll: true });

  const zamanlar = [];
  // Yazı parıltıyla gelir (ekran okuyucu bir kez okur); hareket azaltmada hemen.
  zamanlar.push(setTimeout(() => { metin.textContent = buyumeMetni(ad); }, az ? 0 : 1900));
  zamanlar.push(setTimeout(kapat, az ? BUYUME_SURE_AZ : BUYUME_SURE));

  let kapandi = false;
  function kapat() {
    if (kapandi) return;
    kapandi = true;
    zamanlar.forEach(clearTimeout);
    document.removeEventListener('keydown', tus);
    for (const e of inertler) e.inert = false;
    const bitir = () => { kat.remove(); onBitti?.(); };
    if (az) bitir();
    else { kat.classList.add('kapaniyor'); setTimeout(bitir, 280); }
    if (onceOdak?.isConnected && typeof onceOdak.focus === 'function') onceOdak.focus({ preventScroll: true });
  }
  function tus(e) {
    if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') { e.preventDefault(); kapat(); }
    else if (e.key === 'Tab') { e.preventDefault(); gec.focus(); }
  }
  kat.addEventListener('click', kapat);
  document.addEventListener('keydown', tus);
  return { kapat };
}

/**
 * Sahne stili (.yv-bs-*). Durağan kurallar son kareyi gösterir (hareket azaltma); hareket yalnız no-preference altında.
 * Zaman çizelgesi: 0,2–1,5 sn küçük bebek kıpırdar ve ışır; 1,45 sn parıltı; 1,6 sn büyük bebek belirir; 1,9 sn yazı
 * ve konfeti; 3,8 sn kapanır.
 */
export const BUYUME_CSS = `
.yv-bs {
  position: fixed; inset: 0; z-index: 880;
  display: grid; place-content: center; justify-items: center; gap: 14px;
  padding: calc(24px + var(--safe-top)) 20px calc(24px + var(--safe-bottom));
  overflow: hidden; cursor: pointer;
  background:
    radial-gradient(72% 48% at 50% 44%, color-mix(in srgb, var(--yv-govde) var(--yv-cs-sis, 46%), var(--bg)) 0%, transparent 100%),
    var(--bg);
  touch-action: none; overscroll-behavior: contain;
  user-select: none; -webkit-user-select: none; -webkit-tap-highlight-color: transparent;
}
.yv-bs-sahne { position: relative; width: min(320px, 82vw); aspect-ratio: 1; }
.yv-bs-hale {
  position: absolute; inset: -12%; border-radius: 50%; opacity: 0.55;
  background: radial-gradient(closest-side,
    color-mix(in srgb, color-mix(in srgb, var(--yv-r6) 38%, var(--hero-ink)) var(--yv-cs-isik, 95%), transparent), transparent);
}
.yv-bs-kucuk, .yv-bs-buyuk { position: absolute; inset: 0; display: block; }
.yv-bs-kucuk { opacity: 0; }
.yv-bs-isik {
  position: absolute; inset: 8%; border-radius: 50%; opacity: 0; pointer-events: none;
  background: radial-gradient(closest-side, var(--hero-ink), color-mix(in srgb, var(--hero-ink) 40%, transparent) 55%, transparent);
}
.yv-bs-yildiz { position: absolute; width: 22px; height: 22px; margin: -11px 0 0 -11px; opacity: 0; transform: scale(var(--olcek, 1)); }
.yv-bs-yildiz svg { display: block; width: 100%; height: 100%; fill: var(--accent); }
.yv-bs-metin {
  max-width: 22ch; min-height: 2.6em; margin: 0;
  color: var(--text); font-family: var(--font-display); font-size: clamp(1.5rem, 1.3rem + 1vw, 1.875rem);
  font-weight: 600; font-variation-settings: 'SOFT' 100; letter-spacing: -0.01em; line-height: 1.3;
  text-align: center; text-wrap: balance;
}
.yv-bs-gec {
  min-height: 44px; padding: 0 20px; border: 1.5px solid var(--line); border-radius: var(--radius-pill);
  background: color-mix(in srgb, var(--surface) 70%, transparent); color: var(--muted);
  font: inherit; font-weight: 750; cursor: pointer;
}
.yv-bs-gec:focus-visible { outline: 3px solid var(--focus); outline-offset: 2px; }
.yv-bs-konfeti { position: absolute; inset: 0; pointer-events: none; overflow: hidden; }
.yv-bs-k {
  position: absolute; top: -16px; width: 8px; height: 14px; border-radius: 2px; opacity: 0;
  background: color-mix(in oklab, var(--renk) 78%, var(--accent));
}
.yv-bs-k.daire { width: 10px; height: 10px; border-radius: 50%; }
.yv-bs-k.kalp { width: 12px; height: 12px; border-radius: 0; background: var(--accent);
  clip-path: path('M6 11 C1 7.5 0 5 0 3.4 C0 1.4 1.5 0 3.3 0 C4.5 0 5.4 0.6 6 1.5 C6.6 0.6 7.5 0 8.7 0 C10.5 0 12 1.4 12 3.4 C12 5 11 7.5 6 11 Z'); }
.yv-bs-sahne .yvb-svg .yvb-beden { animation: none; }
@media (prefers-reduced-motion: no-preference) {
  .yv-bs { animation: yv-bs-gir 0.3s ease-out both; }
  .yv-bs.kapaniyor { animation: yv-bs-kapan 0.28s ease-in forwards; }
  .yv-bs-hale { animation: yv-bs-hale 2.6s ease-in-out both; }
  .yv-bs-kucuk { transform-origin: 50% 90%; animation: yv-bs-kucuk 1.55s 0.15s both; }
  .yv-bs-isik { animation: yv-bs-isik 0.8s 1.3s cubic-bezier(0.16, 1, 0.3, 1) both; }
  .yv-bs-buyuk { transform-origin: 50% 92%; animation: yv-bs-buyuk 0.8s 1.55s cubic-bezier(0.16, 1, 0.3, 1) both; }
  .yv-bs-yildiz { animation: yv-bs-yildiz 0.9s calc(1.6s + var(--gecik, 0s)) ease-out both; }
  .yv-bs-metin { animation: yv-bs-metin 0.45s 1.9s cubic-bezier(0.16, 1, 0.3, 1) both; }
  .yv-bs-gec { animation: yv-bs-gir 0.4s 0.6s both; }
  .yv-bs-k { animation: yv-bs-dus var(--sure) calc(1.85s + var(--gecik)) cubic-bezier(0.3, 0.6, 0.5, 1) both; }
}
@keyframes yv-bs-gir { from { opacity: 0; } }
@keyframes yv-bs-kapan { to { opacity: 0; } }
@keyframes yv-bs-metin { from { opacity: 0; transform: translateY(8px); } }
@keyframes yv-bs-hale {
  0% { opacity: 0; transform: scale(0.7); }
  50% { opacity: 0.5; transform: scale(0.95); }
  62% { opacity: 1; transform: scale(1.25); }
  100% { opacity: 0.55; transform: scale(1.05); }
}
@keyframes yv-bs-kucuk {
  0% { opacity: 0; transform: translateY(10px) scale(0.92); }
  14% { opacity: 1; transform: none; }
  26% { transform: rotate(-3deg); }
  38% { transform: rotate(3deg); }
  50% { transform: rotate(-4deg) scale(1.02); }
  62% { transform: rotate(4deg) scale(1.04); }
  72% { opacity: 1; transform: scale(1.06, 0.94); filter: brightness(1); }
  86% { opacity: 1; transform: scale(1.1); filter: brightness(1.6); }
  100% { opacity: 0; transform: scale(1.22); filter: brightness(2); }
}
@keyframes yv-bs-isik {
  0% { opacity: 0; transform: scale(0.3); }
  30% { opacity: 1; transform: scale(1.05); }
  100% { opacity: 0; transform: scale(1.5); }
}
@keyframes yv-bs-buyuk {
  0% { opacity: 0; transform: scale(0.7); filter: brightness(1.8); }
  25% { opacity: 1; }
  60% { transform: scale(1.06, 0.97); filter: brightness(1.1); }
  80% { transform: scale(0.98, 1.02); }
  100% { opacity: 1; transform: none; filter: none; }
}
@keyframes yv-bs-yildiz {
  0% { opacity: 0; transform: scale(0.2); }
  35% { opacity: 1; transform: scale(calc(var(--olcek, 1) * 1.15)); }
  100% { opacity: 0; transform: scale(calc(var(--olcek, 1) * 0.4)) rotate(60deg); }
}
@keyframes yv-bs-dus {
  0% { opacity: 1; transform: translate(0, 0) rotate(0); }
  85% { opacity: 1; }
  100% { opacity: 0; transform: translate(var(--kay), 100dvh) rotate(var(--don)); }
}
`;
