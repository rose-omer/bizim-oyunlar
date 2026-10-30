// Uygulama olarak kurulum (PWA) ve service worker. Sahip: Sunucu ajanı.
// Service worker site kökündeki sw.js'tir; kapsamı site köküdür (alt klasörde de doğru).
// Üst kısım saf (Node'da test edilir); tarayıcı nesnelerine yalnız fonksiyonların içinde erişilir.
import { isNative } from './mobil.js';

/** Site kökündeki sw.js ve kök adres (bu dosya js/core/ içinde). */
export const SW_URL = new URL('../../sw.js', import.meta.url);
export const KOK_URL = new URL('../../', import.meta.url);

// ---------- Saf yardımcılar ----------

/** iPhone / iPad (iPadOS kendini Mac gibi tanıtır: dokunmatik Mac yok). */
export function iosMu(ua = '', maxTouchPoints = 0) {
  return /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && maxTouchPoints > 1);
}

/** Kurulum durumu kararı. -> 'kurulu' | 'kurulabilir' | 'ios-elle' | 'yok' */
export function kurulumKarari({ standalone = false, kuruldu = false, istemVar = false, ios = false, native = false } = {}) {
  if (native || standalone || kuruldu) return 'kurulu';
  if (istemVar) return 'kurulabilir';
  if (ios) return 'ios-elle';
  return 'yok';
}

// ---------- Tarayıcı ----------

let kayit = null; // Promise<ServiceWorkerRegistration | null>
let istem = null; // ertelenen beforeinstallprompt olayı
let kuruldu = false;
let dinleniyor = false;

/** Ana ekrandan (uygulama olarak) mı açıldı? */
export function standaloneMu() {
  try {
    const mm = (q) => globalThis.matchMedia?.(q)?.matches;
    return !!(mm('(display-mode: standalone)') || mm('(display-mode: fullscreen)') || mm('(display-mode: minimal-ui)')
      || globalThis.navigator?.standalone === true);
  } catch {
    return false;
  }
}

function kurulumDinle() {
  if (dinleniyor || typeof globalThis.addEventListener !== 'function') return;
  dinleniyor = true;
  globalThis.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // tarayıcının kendi şeridi yerine "Daha" sayfasındaki kurulum kartı
    istem = e;
  });
  globalThis.addEventListener('appinstalled', () => {
    istem = null;
    kuruldu = true;
  });
}

/**
 * Service worker kaydı. Her sayfada startAppServices çağırır; tekrar çağrılması zararsız.
 * -> Promise<ServiceWorkerRegistration | null> (desteklenmiyorsa ya da Android uygulamasının içindeyse null)
 */
export function registerPwa() {
  if (kayit) return kayit;
  kurulumDinle();
  const sw = globalThis.navigator?.serviceWorker;
  if (!sw || !globalThis.isSecureContext || isNative()) {
    kayit = Promise.resolve(null);
    return kayit;
  }
  kayit = sw.register(SW_URL.href, { scope: KOK_URL.pathname, updateViaCache: 'none' })
    .catch((e) => {
      console.warn('[pwa] service worker kaydedilemedi:', e?.message || e);
      return null;
    });
  return kayit;
}

/** -> { durum: 'kurulu' | 'kurulabilir' | 'ios-elle' | 'yok', kur(): Promise<boolean> } */
export function kurulumDurumu() {
  if (isNative()) return { durum: 'kurulu', kur: async () => false }; // Android uygulamasının içi
  kurulumDinle();
  const nav = globalThis.navigator || {};
  const durum = kurulumKarari({
    standalone: standaloneMu(), kuruldu, istemVar: !!istem, native: isNative(),
    ios: iosMu(nav.userAgent || '', nav.maxTouchPoints || 0),
  });
  return {
    durum,
    async kur() {
      const e = istem;
      if (!e) return false;
      istem = null; // bir olay yalnız bir kez gösterilebilir
      try {
        await e.prompt();
        const { outcome } = await e.userChoice;
        if (outcome === 'accepted') kuruldu = true;
        return outcome === 'accepted';
      } catch {
        return false;
      }
    },
  };
}
