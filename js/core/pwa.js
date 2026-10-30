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

const YENILE_GIZLI_MS = 30_000; // en az bu kadar arka planda kalan boştaki sayfa kendini yeniler
const NATIVE_ONBELLEK_MS = 10 * 60_000; // GitHub Pages max-age=600: uygulamada eski dosya bu kadar kalabilir

/** Oyun ya da Birlikte İzle sayfası mı? (yenileme oyunu ve videoyu keser) */
export function mesgulYol(yol = '') {
  return /\/(games\/[^/]+|sayfalar\/izle)\//.test(yol);
}

/**
 * Yeni yayın kararı. ilk = sayfanın geldiği yayın, son = sunucudaki yayın (ms, Last-Modified).
 * -> 'yok' | 'bekle' (uygulamada HTTP önbelleği tazelenene dek) | 'yenile' | 'bildir' (toast)
 */
export function guncellemeKarari({ ilk, son, simdi = Date.now(), gizliMs = 0, doluAlan = false, mesgul = false, native = false } = {}) {
  if (!Number.isFinite(ilk) || !Number.isFinite(son) || son <= ilk) return 'yok';
  if (native && simdi - son < NATIVE_ONBELLEK_MS) return 'bekle';
  if (gizliMs >= YENILE_GIZLI_MS && !doluAlan && !mesgul) return 'yenile';
  return 'bildir';
}

/** Sunucudaki yayın zamanı (ms): site köküne önbelleksiz HEAD, Last-Modified. Bilinmiyorsa null. */
export async function sunucuSurumu(fetchFn = (...a) => globalThis.fetch(...a)) {
  try {
    const res = await fetchFn(KOK_URL.href, { method: 'HEAD', cache: 'no-store' });
    const t = res.ok ? Date.parse(res.headers.get('Last-Modified') || '') : NaN;
    return Number.isFinite(t) ? t : null;
  } catch {
    return null;
  }
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

// ---------- Otomatik güncelleme ----------
// GitHub Pages her yayında bütün dosyalara aynı Last-Modified'ı verir: yayın sürümü odur.
// HTML ve JS her açılışta ağdan gelir; bu bölüm açık kalmış sayfanın yeni yayına geçmesini sağlar.

const KONTROL_ARASI_MS = 60_000;
const ACIKKEN_KONTROL_MS = 30 * 60_000;
let izleniyor = false;

/** Sayfada doldurulmuş yazı alanı var mı? (yenileme yazılanı siler) */
function doluAlanVar() {
  const alanlar = document.querySelectorAll('textarea, input:not([type]), input[type="text"], input[type="search"], '
    + 'input[type="email"], input[type="url"], [contenteditable="true"]');
  return [...alanlar].some((el) => String(el.value ?? el.textContent ?? '').trim() !== '');
}

/**
 * Yeni yayını izler. Her sayfada startAppServices çağırır; tekrar çağrı zararsız.
 * Sayfa öne gelince ve görünürken yarım saatte bir sunucuya bakar. Boştaki sayfa kendini yeniler;
 * oyunda, izlemede, açık pencerede ya da yazı yazılırken bildir() çağrılır (ui.js: "Yenile" toast'u).
 */
export function guncellemeIzle({ bildir } = {}) {
  if (izleniyor || typeof document === 'undefined') return;
  izleniyor = true;
  let ilk = Date.parse(document.lastModified); // başlık yoksa tarayıcı "şimdi" verir: güncelleme görünmez
  let sonKontrol = 0;
  let gizlendi = 0;
  let bildirilen = null;
  let bekleme = 0;

  const kontrol = async (gizliMs = 0) => {
    if (Date.now() - sonKontrol < KONTROL_ARASI_MS) return;
    sonKontrol = Date.now();
    const son = await sunucuSurumu();
    if (!Number.isFinite(ilk)) {
      ilk = son ?? NaN;
      return;
    }
    const karar = guncellemeKarari({
      ilk, son, simdi: Date.now(), gizliMs, doluAlan: doluAlanVar(), native: isNative(),
      mesgul: mesgulYol(location.pathname) || !!document.querySelector('dialog[open]'),
    });
    if (karar === 'yenile') {
      location.reload();
    } else if (karar === 'bekle') {
      clearTimeout(bekleme);
      bekleme = setTimeout(() => {
        sonKontrol = 0;
        if (document.visibilityState === 'visible') kontrol();
      }, NATIVE_ONBELLEK_MS - (Date.now() - son) + 5000);
    } else if (karar === 'bildir' && bildirilen !== son) {
      bildirilen = son;
      bildir?.();
    }
  };

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      gizlendi = Date.now();
      return;
    }
    const gizliMs = gizlendi ? Date.now() - gizlendi : 0;
    gizlendi = 0;
    kontrol(gizliMs);
  });
  setInterval(() => {
    if (document.visibilityState === 'visible') kontrol();
  }, ACIKKEN_KONTROL_MS);
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
