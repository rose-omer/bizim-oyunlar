// Yavrumuz: yatak odası ninnisi. Ezgi bizim bestemiz (telifsiz); Web Audio ile sentez, ses dosyası yok.
// Saf kısım (ezgi, frekans, süre, ifade kararı) Node'da test edilir; çalma yalnız tarayıcıda (ninniCal).
// sound.js sessiz ayarına uyar: sessizse ses çıkmaz, görsel (göz kırpma, notalar) yine süresince oynar.
// Ninni belgeye yazmaz; bitince uyut eylemi yalnız önerilir (otomatik uyutma yok).
import { isMuted } from '../../js/core/sound.js';
import { ihtiyaclar, uyuyorMu } from './mantik.js';

export const VURUS = 0.42; // sn: bir zaman birimi (3/4 ölçü, yavaş beşik ritmi)
/** [nota, süre (zaman birimi)]. Ölçü başına 3 birim; 8 ölçü. */
export const NINNI = Object.freeze([
  ['C5', 1], ['A4', 0.5], ['G4', 1.5],
  ['F4', 1], ['A4', 0.5], ['G4', 1.5],
  ['E4', 1], ['F4', 0.5], ['G4', 1], ['E4', 0.5],
  ['D4', 3],
  ['C5', 1], ['A4', 0.5], ['G4', 1.5],
  ['F4', 1], ['A4', 0.5], ['C5', 1.5],
  ['G4', 1], ['F4', 0.5], ['E4', 1], ['D4', 0.5],
  ['C4', 3],
].map(Object.freeze));
/** Her ölçünün başında yumuşak bas (kök nota). */
export const BAS = Object.freeze(['C3', 'F3', 'C3', 'G3', 'C3', 'F3', 'G3', 'C3']);
export const OLCU = 3;

const ADIM = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
/** 'A4' → 440 Hz (eşit tamperaman). Bozuk ad: NaN. */
export function notaFrekans(ad) {
  const m = /^([A-G])(#?)(\d)$/.exec(String(ad));
  if (!m) return NaN;
  const midi = 12 * (Number(m[3]) + 1) + ADIM[m[1]] + (m[2] ? 1 : 0);
  return 440 * 2 ** ((midi - 69) / 12);
}

/** Toplam süre (ms): ezgi + son notanın sönümü. */
export function ninniSuresi() {
  return Math.round((NINNI.reduce((t, [, d]) => t + d, 0) * VURUS + 0.8) * 1000);
}

export const NINNI_UYKULU = 50; // ninni çalarken enerji bunun altındaysa "uykusu geldi"

/** Ninni sırasında ifade: uyanık ve enerjisi düşükse 'uykulu', değilse null (gerçek ruh hâli kalır). */
export function ninniRuhu(y, simdi) {
  if (!y || y.asama === 'yumurta' || uyuyorMu(y.uyku, simdi)) return null;
  return ihtiyaclar(y, simdi).enerji < NINNI_UYKULU ? 'uykulu' : null;
}

// ---------- Çalma (tarayıcı) ----------

/**
 * Ninniyi çalar. Dokunma işleyicisinde çağrılmalı (ses bağlamı kullanıcı hareketiyle açılır).
 * onOlcu(i): her ölçü başında (görsel nota); onBitti(tamam): sonda ya da durdurulunca bir kez.
 * -> { durdur() }
 */
export function ninniCal({ onOlcu = () => {}, onBitti = () => {} } = {}) {
  let bitti = false;
  const zamanlar = [];
  let ctx = null;
  let cikis = null;
  const sesKapat = () => {
    if (!ctx) return;
    try {
      cikis.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.05);
      const c = ctx;
      setTimeout(() => c.close().catch(() => {}), 300);
    } catch { /* kapanıyor */ }
    ctx = null;
  };
  const sessiz = (e) => { if (e.detail) sesKapat(); };

  if (!isMuted()) {
    const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
    try { ctx = AC ? new AC() : null; } catch { ctx = null; }
  }
  if (ctx) {
    cikis = ctx.createGain();
    cikis.gain.value = 0.5;
    cikis.connect(ctx.destination);
    const t0 = ctx.currentTime + 0.08;
    const ton = (f, at, sure, vol, type) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = type;
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(vol, at + 0.06); // yumuşak giriş
      g.gain.exponentialRampToValueAtTime(0.0001, at + sure);
      o.connect(g);
      g.connect(cikis);
      o.start(at);
      o.stop(at + sure + 0.05);
    };
    let t = t0;
    for (const [ad, d] of NINNI) {
      const f = notaFrekans(ad);
      const sure = d * VURUS + 0.35;
      ton(f, t, sure, 0.16, 'sine');
      ton(f * 2, t, sure * 0.6, 0.02, 'triangle'); // hafif parıltı
      t += d * VURUS;
    }
    BAS.forEach((ad, i) => ton(notaFrekans(ad), t0 + i * OLCU * VURUS, OLCU * VURUS + 0.2, 0.06, 'sine'));
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  }
  globalThis.addEventListener?.('bizim:mute', sessiz);

  const bitir = (tamam) => {
    if (bitti) return;
    bitti = true;
    zamanlar.forEach(clearTimeout);
    globalThis.removeEventListener?.('bizim:mute', sessiz);
    sesKapat();
    onBitti(tamam);
  };
  BAS.forEach((_, i) => zamanlar.push(setTimeout(() => onOlcu(i), Math.round(i * OLCU * VURUS * 1000))));
  zamanlar.push(setTimeout(() => bitir(true), ninniSuresi()));
  return { durdur: () => bitir(false) };
}
