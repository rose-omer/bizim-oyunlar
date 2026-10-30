// Mobil uygulama köprüsü (Capacitor). Sahip: Mobil ajanı. Web'de güvenli yedekler.
// Android uygulaması canlı siteyi açar (mobil/capacitor.config.json server.url). Capacitor köprüsü
// sayfaya window.Capacitor olarak gelir; eklentiler window.Capacitor.Plugins.<Ad> altındadır.
// npm import ve build yok. Saf yardımcılar (hatirlaticiId, bildirimListesi, titresimAdimlari,
// renkHex, cubukStili, apkSurumu, kabukKarari, widgetVerisi) Node'da test edilir: tests/mobil-*.test.mjs, tests/widget-*.test.mjs.
import { APK_URL } from '../../sayfalar/daha/mantik.js';
import { parseDay } from './gunler.js';

const EN_COK_HATIRLATICI = 64; // Android alarm sınırının çok altında kalır.
const EN_BUYUK_ID = 0x7fffffff; // Java int
const EN_COK_TITRESIM = 10;
const EN_UZUN_TITRESIM_MS = 1000;

/** Android uygulamasının içinde mi? */
export function isNative() {
  return !!globalThis.Capacitor?.isNativePlatform?.();
}

/** Uygulamadaysa eklenti nesnesi, değilse null. */
function eklenti(ad) {
  return isNative() ? globalThis.Capacitor?.Plugins?.[ad] || null : null;
}

/** Eklenti yöntemini çağırır; eklenti ya da yöntem yoksa undefined döner. Hata Promise'te kalır. */
async function cagir(ad, yontem, secenek = {}) {
  const p = eklenti(ad);
  if (typeof p?.[yontem] !== 'function') return undefined;
  return p[yontem](secenek);
}

function sessiz(promise, etiket) {
  promise?.catch?.((e) => console.warn(`[mobil] ${etiket}`, e));
}

// ---------- Titreşim ----------

function ms(x) {
  const n = Number(x);
  return Number.isFinite(n) ? Math.min(EN_UZUN_TITRESIM_MS, Math.max(0, Math.round(n))) : 0;
}

/**
 * navigator.vibrate deseni → [{ sure, bekle }] (ms). Sayı ya da [titreşim, bekleme, titreşim, ...].
 * Süreler 0–1000 ms; sıfır titreşim atlanır, beklemesi öncekine eklenir; en çok 10 adım.
 */
export function titresimAdimlari(desen = 200) {
  const dizi = Array.isArray(desen) ? desen : [desen];
  const adimlar = [];
  for (let i = 0; i < dizi.length; i += 2) {
    const sure = ms(dizi[i]);
    const bekle = ms(dizi[i + 1]);
    const son = adimlar[adimlar.length - 1];
    if (sure > 0) {
      if (adimlar.length === EN_COK_TITRESIM) break;
      adimlar.push({ sure, bekle });
    } else if (son) {
      son.bekle += bekle;
    }
  }
  return adimlar;
}

/** Titreşim: uygulamada Haptics, tarayıcıda navigator.vibrate (iPhone Safari desteklemez). */
export function titret(desen = 200) {
  const haptics = eklenti('Haptics');
  if (!haptics?.vibrate) {
    try { globalThis.navigator?.vibrate?.(desen); } catch { /* yok */ }
    return;
  }
  let gecikme = 0;
  for (const { sure, bekle } of titresimAdimlari(desen)) {
    const calis = () => sessiz(haptics.vibrate({ duration: sure }), 'titreşim');
    if (gecikme === 0) calis();
    else setTimeout(calis, gecikme);
    gecikme += sure + bekle;
  }
}

// ---------- Yerel hatırlatıcılar ----------

/** Olay kimliğinden kararlı bildirim kimliği: FNV-1a 32 bit → 1..2^31-1. */
export function hatirlaticiId(id) {
  const s = String(id);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) & EN_BUYUK_ID || 1;
}

function yazi(x) {
  return typeof x === 'string' ? x.trim() : x == null ? '' : String(x).trim();
}

/**
 * Olaylar → LocalNotifications.schedule listesi. Yalnız kimliği olan ve gelecekteki olaylar;
 * aynı kimlikten ilki; zamana göre sıralı; en çok 64. Kimlik çakışırsa sonraki boş sayı alınır.
 * olaylar: [{ id, baslik, metin, zaman: ISO }]
 */
export function bildirimListesi(olaylar, simdi = Date.now()) {
  const adaylar = [];
  const gorulen = new Set();
  for (const o of Array.isArray(olaylar) ? olaylar : []) {
    const anahtar = o && typeof o === 'object' ? yazi(o.id) : '';
    if (!anahtar || gorulen.has(anahtar)) continue;
    const at = new Date(o.zaman).getTime(); // null → 1970: geçmiş sayılır
    if (!Number.isFinite(at) || at <= simdi) continue;
    gorulen.add(anahtar);
    adaylar.push({ anahtar, at, baslik: yazi(o.baslik) || 'Biz İkimiz', metin: yazi(o.metin) });
  }
  adaylar.sort((a, b) => a.at - b.at || (a.anahtar < b.anahtar ? -1 : a.anahtar > b.anahtar ? 1 : 0));

  const kullanilan = new Set();
  return adaylar.slice(0, EN_COK_HATIRLATICI).map((a) => {
    let id = hatirlaticiId(a.anahtar);
    while (kullanilan.has(id)) id = id >= EN_BUYUK_ID ? 1 : id + 1;
    kullanilan.add(id);
    return {
      id,
      title: a.baslik,
      body: a.metin,
      schedule: { at: new Date(a.at).toISOString(), allowWhileIdle: true },
      // Kesin alarm izni istenmez (SCHEDULE_EXACT_ALARM kaldırıldı); birkaç dakika sapabilir.
      isExactNotification: false,
      extra: { kaynak: a.anahtar },
    };
  });
}

async function bildirimIzni(ln) {
  let durum = (await ln.checkPermissions({}))?.display;
  if (durum === 'prompt' || durum === 'prompt-with-rationale') {
    durum = (await ln.requestPermissions({}))?.display;
  }
  return durum === 'granted';
}

async function planla(olaylar) {
  const ln = eklenti('LocalNotifications');
  if (!ln) return 0;
  try {
    const liste = bildirimListesi(olaylar);
    const bekleyen = (await ln.getPending({}))?.notifications || [];
    if (bekleyen.length) await ln.cancel({ notifications: bekleyen.map((n) => ({ id: n.id })) });
    if (!liste.length || !(await bildirimIzni(ln))) return 0;
    await ln.schedule({ notifications: liste });
    return liste.length;
  } catch (e) {
    console.warn('[mobil] hatırlatıcı', e);
    return 0;
  }
}

let sira = Promise.resolve(0);

/**
 * Cihazda yerel hatırlatıcı planla (yalnız uygulamada). olaylar: [{ id, baslik, metin, zaman: ISO }]
 * Önceki planlananları iptal eder, yeni listeyi kurar. Gerekirse bildirim izni ister.
 * -> planlanan sayı (web'de ve izin yoksa 0). Hata fırlatmaz. Çağrılar sırayla işlenir.
 */
export async function yerelHatirlaticilar(olaylar) {
  if (!eklenti('LocalNotifications')) return 0;
  const is = sira.then(() => planla(olaylar));
  sira = is.catch(() => 0);
  return is;
}

// ---------- Ana ekran widget'ı (Android) ----------
// Yerel eklenti BizWidget (mobil/android-ek/java/.../widget/BizWidgetPlugin.java) veriyi cihaza yazar,
// widget gün sayısını kendisi hesaplar (gece yarısı ve uygulama her öne geldiğinde tazelenir).

const WIDGET_AD_MAX = 24; // hub.js cleanName ile aynı sınır

/**
 * widgetGuncelle girdisi → eklentiye giden kayıt (saf).
 * -> { v: 1, baslangic: 'YYYY-MM-DD' | null, bulusma: epoch ms | null, adlar: 'Ömer & Gül' | '' }
 * Buluşma an olarak gider: widget yerel günü cihazın saat diliminde bulur.
 */
export function widgetVerisi({ baslangic = null, bulusma = null, adlar = [] } = {}) {
  const gun = typeof baslangic === 'string' && parseDay(baslangic) ? baslangic : null;
  const an = typeof bulusma === 'string' || typeof bulusma === 'number' ? new Date(bulusma).getTime() : NaN;
  const liste = (Array.isArray(adlar) ? adlar : [adlar])
    .map((a) => Array.from(yazi(a).replace(/\s+/g, ' ')).slice(0, WIDGET_AD_MAX).join(''))
    .filter(Boolean)
    .slice(0, 2);
  return { v: 1, baslangic: gun, bulusma: Number.isFinite(an) ? an : null, adlar: liste.join(' & ') };
}

let sonWidget = null; // son yazılan kayıt (aynısını tekrar yazma)

/**
 * Widget verisini yazar ve widget'ı hemen yeniler (yalnız uygulamada; web'de ve widget'sız eski APK'da iş yapmaz).
 * girdi: { baslangic: 'YYYY-MM-DD', bulusma: ISO, adlar: [ben, partner] }. -> yazıldı mı. Hata fırlatmaz.
 */
export async function widgetGuncelle(girdi) {
  if (typeof eklenti('BizWidget')?.guncelle !== 'function') return false;
  const veri = JSON.stringify(widgetVerisi(girdi));
  if (veri === sonWidget) return false;
  sonWidget = veri;
  try {
    await cagir('BizWidget', 'guncelle', { veri });
    return true;
  } catch (e) {
    if (sonWidget === veri) sonWidget = null; // sonraki çağrı yeniden denesin
    console.warn('[mobil] widget', e);
    return false;
  }
}

// ---------- Uygulama açılışı: geri tuşu, durum çubuğu, açılış ekranı ----------

/** CSS rengi → '#RRGGBB' | null. '#abc', '#aabbcc', '#aabbccdd', 'rgb(…)', 'rgba(…)'. Saydam → null. */
export function renkHex(css) {
  const s = yazi(css).toLowerCase();
  let m = s.match(/^#([0-9a-f]{3,8})$/);
  if (m) {
    let h = m[1];
    if (h.length === 3 || h.length === 4) h = [...h].map((c) => c + c).join('');
    if (h.length !== 6 && h.length !== 8) return null;
    if (h.length === 8 && h.slice(6) === '00') return null;
    return `#${h.slice(0, 6).toUpperCase()}`;
  }
  m = s.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/);
  if (!m) return null;
  if (m[4] != null && Number.parseFloat(m[4]) === 0) return null;
  const parca = m.slice(1, 4).map((x) => Math.min(255, Math.round(Number(x))));
  return `#${parca.map((x) => x.toString(16).padStart(2, '0')).join('').toUpperCase()}`;
}

/** Zemin rengine göre çubuk yazı stili: koyu zemine 'DARK' (açık yazı), açık zemine 'LIGHT'. */
export function cubukStili(hex) {
  const h = renkHex(hex);
  if (!h) return 'DEFAULT';
  const kanal = (i) => {
    const c = Number.parseInt(h.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const parlaklik = 0.2126 * kanal(1) + 0.7152 * kanal(3) + 0.0722 * kanal(5);
  return parlaklik < 0.179 ? 'DARK' : 'LIGHT';
}

function temaRengi() {
  try {
    const kok = getComputedStyle(document.documentElement).getPropertyValue('--bg');
    return renkHex(kok) || (document.body && renkHex(getComputedStyle(document.body).backgroundColor));
  } catch {
    return null;
  }
}

function durumCubugu() {
  const uygula = () => {
    const renk = temaRengi();
    if (!renk) return;
    const style = cubukStili(renk);
    // SystemBars (Capacitor 8 çekirdeği) durum ve gezinme çubuğu simgelerini birlikte ayarlar.
    const stilEklentisi = eklenti('SystemBars')?.setStyle ? 'SystemBars' : 'StatusBar';
    sessiz(cagir(stilEklentisi, 'setStyle', { style }), 'çubuk stili');
    // Zemin rengi yalnız Android 14 ve öncesinde uygulanır; 15+ uçtan uca çizer (site zemini görünür).
    sessiz(cagir('StatusBar', 'setBackgroundColor', { color: renk }), 'çubuk rengi');
  };
  uygula();
  try {
    globalThis.matchMedia?.('(prefers-color-scheme: dark)')?.addEventListener?.('change', uygula);
  } catch { /* eski WebView */ }
}

function geriTusu() {
  const app = eklenti('App');
  if (typeof app?.addListener !== 'function') return;
  app.addListener('backButton', (veri) => {
    const acik = [...document.querySelectorAll('dialog[open]')].pop();
    if (acik) {
      acik.close();
      return;
    }
    if (veri?.canGoBack) history.back();
    else sessiz(cagir('App', 'minimizeApp'), 'küçült');
  });
}

// ---------- Kabuk (APK) güncellemesi ----------
// Site güncellemesi uygulamaya kendiliğinden gelir (canlı siteyi açar). Kabuk (mobil/) değişince yeni
// APK gerekir; Android, Play Store dışından kurulumu kullanıcı onayı olmadan yapmaz. Burada haber verilir.

export const APK_SURUM_API = 'https://api.github.com/repos/rose-omer/bizim-oyunlar/releases/tags/android-latest';
const APK_DEPO_KEY = 'bizim.apk';
const APK_KONTROL_MS = 12 * 3_600_000; // GitHub API: IP başına saatte 60 istek

/** Sürüm notundaki "sürüm 1.0.N" → N (.github/workflows/android.yml yazar; N = versionCode). Yoksa null. */
export function apkSurumu(metin) {
  const m = /sürüm 1\.0\.(\d+)/.exec(String(metin ?? ''));
  return m ? Number(m[1]) : null;
}

/** Son APK kuruludan yeni ve henüz haber verilmemiş mi? */
export function kabukKarari({ kurulu, son, gosterilen = null } = {}) {
  return Number.isFinite(kurulu) && Number.isFinite(son) && son > kurulu && son !== gosterilen;
}

function yerelDepo() {
  try {
    return globalThis.localStorage || null;
  } catch {
    return null;
  }
}

/**
 * Uygulamada 12 saatte bir son APK sürümüne bakar; yeniyse bir kez bildir(APK_URL) çağırır.
 * -> haber verildi mi. Hata fırlatmaz; web'de hiçbir şey yapmaz.
 */
export async function kabukGuncellemeKontrol({ bildir, fetchFn = (...a) => globalThis.fetch(...a), depo = yerelDepo(), simdi = Date.now() } = {}) {
  const app = eklenti('App');
  if (typeof app?.getInfo !== 'function') return false;
  let kayit = {};
  try {
    kayit = JSON.parse(depo?.getItem(APK_DEPO_KEY) || '{}') || {};
  } catch { /* bozuk kayıt: baştan */ }
  if (simdi - (kayit.kontrol || 0) < APK_KONTROL_MS) return false;
  try {
    const kurulu = Number((await app.getInfo())?.build);
    const res = await fetchFn(APK_SURUM_API, { headers: { Accept: 'application/vnd.github+json' } });
    if (!res.ok) return false;
    const son = apkSurumu((await res.json())?.body);
    const yeni = kabukKarari({ kurulu, son, gosterilen: kayit.gosterilen ?? null });
    kayit.kontrol = simdi;
    if (yeni) kayit.gosterilen = son;
    try {
      depo?.setItem(APK_DEPO_KEY, JSON.stringify(kayit));
    } catch { /* depo dolu */ }
    if (yeni) bildir?.(APK_URL);
    return yeni;
  } catch (e) {
    console.warn('[mobil] apk sürümü', e);
    return false;
  }
}

let basladi = false;

/**
 * Uygulama içinde bir kez: geri tuşu (geçmişte geri; kökte uygulamayı küçült), durum çubuğu
 * rengi ve stili temaya uyar, açılış ekranı kapanır, yeni APK varsa yeniApk(url) çağrılır.
 * Web'de hiçbir şey yapmaz. Her sayfada çağrılmalı (ui.js startAppServices); sayfa değişince köprü
 * dinleyicileri sıfırlanır.
 */
export function mobilBaslat({ yeniApk } = {}) {
  if (basladi || !isNative() || typeof document === 'undefined') return;
  basladi = true;
  geriTusu();
  durumCubugu();
  sessiz(cagir('SplashScreen', 'hide'), 'açılış ekranı');
  kabukGuncellemeKontrol({ bildir: yeniApk });
}
