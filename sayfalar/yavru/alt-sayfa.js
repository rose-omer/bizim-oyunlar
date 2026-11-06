// Yavrumuz: tek biçim alt sayfa (Görev, Oyunlar, Bilge kartı). Alttan açılır; Escape, perde ve kapat düğmesi kapatır.
// İçerik öğeleri kalıcı olabilir: kapanınca öğeler silinmez, onKapat içinde yerine alınır.
// Arka plan odak ve dokunuş almaz. Üst düzeyde DOM yok: Node testi bu dosyayı güvenle yükler.
import { ikon } from './ikonlar.js';

const ODAKLANIR = 'button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])';
const azHareket = () => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

function yap(etiket, ozellik = {}, ...cocuk) {
  const e = document.createElement(etiket);
  for (const [k, v] of Object.entries(ozellik)) {
    if (k === 'html') e.innerHTML = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v);
  }
  e.append(...cocuk.flat().filter(Boolean));
  return e;
}

function stilEkle() {
  if (document.getElementById('yv-alt-stil')) return;
  document.head.append(yap('style', { id: 'yv-alt-stil' }, ALT_SAYFA_CSS));
}

/**
 * kok: genelde document.body. baslik: metin (boşsa başlık satırı yalnız kapat düğmesi). ust: başlığın sağında öğe (ör. jeton).
 * icerik: öğe ya da öğeler. tam: ekranı dolduran sayfa. -> { kapat(), govde }
 */
export function altSayfaAc(kok, { baslik = '', ust = null, icerik, tam = false, onKapat } = {}) {
  stilEkle();
  const onceOdak = document.activeElement;
  const id = `yv-alt-${Math.random().toString(36).slice(2, 8)}`;
  const kapatBtn = yap('button', { type: 'button', class: 'yv-alt-kapat', 'aria-label': 'Kapat', html: ikon('kapat', 22) });
  kapatBtn.addEventListener('click', () => kapat());
  const govde = yap('div', { class: 'yv-alt-govde' }, icerik);
  const sayfa = yap('section', { class: `yv-alt-sayfa${tam ? ' tam' : ''}`, role: 'dialog', 'aria-modal': 'true', ...(baslik ? { 'aria-labelledby': id } : { 'aria-label': 'Ayrıntı' }), tabindex: '-1' },
    yap('span', { class: 'yv-alt-tutamak', 'aria-hidden': 'true' }),
    yap('header', { class: 'yv-alt-ust' }, baslik ? yap('h2', { class: 'yv-alt-baslik', id }, baslik) : yap('span', { class: 'yv-alt-bosluk' }), ust, kapatBtn),
    govde);
  const perde = yap('div', { class: 'yv-alt-perde', 'aria-hidden': 'true' });
  perde.addEventListener('click', () => kapat());
  const kat = yap('div', { class: 'yv-alt-kat' }, perde, sayfa);

  const inertler = [...kok.children].filter((c) => !c.inert && c.tagName !== 'SCRIPT' && c.tagName !== 'STYLE');
  for (const c of inertler) c.inert = true;
  const eskiTasma = document.documentElement.style.overflow;
  document.documentElement.style.overflow = 'hidden';
  kok.append(kat);

  function tus(e) {
    if (e.key === 'Escape') { e.preventDefault(); kapat(); return; }
    if (e.key !== 'Tab') return;
    const odak = [...sayfa.querySelectorAll(ODAKLANIR)].filter((x) => !x.closest('[hidden]'));
    if (!odak.length) return;
    const ilk = odak[0];
    const son = odak[odak.length - 1];
    if (e.shiftKey && (document.activeElement === ilk || !sayfa.contains(document.activeElement))) { e.preventDefault(); son.focus(); }
    else if (!e.shiftKey && (document.activeElement === son || !sayfa.contains(document.activeElement))) { e.preventDefault(); ilk.focus(); }
  }
  document.addEventListener('keydown', tus);

  let kapandi = false;
  function kapat() {
    if (kapandi) return;
    kapandi = true;
    document.removeEventListener('keydown', tus);
    for (const c of inertler) c.inert = false;
    document.documentElement.style.overflow = eskiTasma;
    const bitir = () => { kat.remove(); };
    onKapat?.();
    if (azHareket()) bitir();
    else { kat.classList.add('kapaniyor'); setTimeout(bitir, 200); }
    if (onceOdak?.isConnected) onceOdak.focus({ preventScroll: true });
  }
  sayfa.focus({ preventScroll: true });
  return { kapat, govde };
}

export const ALT_SAYFA_CSS = `
.yv-ikon { display: block; flex: none; }
.yv-para { display: block; flex: none; }
.yv-alt-kat { position: fixed; inset: 0; z-index: 860; display: grid; align-items: end; justify-items: center; }
.yv-alt-perde { position: absolute; inset: 0; background: var(--overlay); }
.yv-alt-sayfa {
  position: relative; display: flex; flex-direction: column; width: 100%; max-width: 560px; max-height: 88dvh;
  border-radius: 28px 28px 0 0; background: var(--bg); color: var(--text); box-shadow: var(--shadow-lg);
  padding: 8px 0 calc(12px + var(--safe-bottom)); overscroll-behavior: contain;
}
.yv-alt-sayfa.tam { height: 100dvh; max-height: 100dvh; border-radius: 0; padding-top: calc(4px + var(--safe-top)); }
.yv-alt-sayfa.tam .yv-alt-tutamak { display: none; }
.yv-alt-sayfa:focus { outline: none; }
.yv-alt-tutamak { align-self: center; flex: none; width: 40px; height: 5px; border-radius: 3px; background: var(--line); margin-bottom: 2px; }
.yv-alt-ust { flex: none; display: flex; align-items: center; gap: 10px; padding: 4px 8px 6px 20px; }
.yv-alt-baslik { margin: 0; flex: 1; min-width: 0; font-family: var(--font-display); font-size: 1.625rem; font-weight: 600; line-height: 1.15; font-variation-settings: 'SOFT' 100; text-wrap: balance; }
.yv-alt-bosluk { flex: 1; }
.yv-alt-kapat { display: grid; place-items: center; flex: none; width: 44px; height: 44px; border: 0; border-radius: 50%; background: none; color: var(--muted); cursor: pointer; }
.yv-alt-kapat:focus-visible { outline: 3px solid var(--focus); outline-offset: 2px; }
@media (hover: hover) { .yv-alt-kapat:hover { background: var(--surface-2); color: var(--text); } }
.yv-alt-govde { flex: 1; min-height: 0; overflow-y: auto; padding: 2px 20px 8px; scrollbar-width: thin; scrollbar-color: var(--line) transparent; }
@media (prefers-reduced-motion: no-preference) {
  .yv-alt-perde { animation: yv-alt-sol 0.2s ease-out both; }
  .yv-alt-sayfa { animation: yv-alt-yuksel 0.32s cubic-bezier(0.16, 1, 0.3, 1) both; }
  .yv-alt-kat.kapaniyor .yv-alt-perde { animation: yv-alt-sol 0.18s ease-in reverse both; }
  .yv-alt-kat.kapaniyor .yv-alt-sayfa { animation: yv-alt-in 0.18s ease-in both; }
}
@keyframes yv-alt-sol { from { opacity: 0; } }
@keyframes yv-alt-yuksel { from { transform: translateY(44px); opacity: 0; } }
@keyframes yv-alt-in { to { transform: translateY(36px); opacity: 0; } }
`;
