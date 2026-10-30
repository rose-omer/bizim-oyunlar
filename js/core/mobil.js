// Mobil uygulama köprüsü (Capacitor). Sahip: Mobil ajanı. Web'de güvenli yedekler.
// Android uygulaması canlı siteyi açar (mobil/capacitor.config.json server.url). Capacitor köprüsü
// sayfaya window.Capacitor olarak gelir; eklentiler window.Capacitor.Plugins.<Ad> altındadır.
// npm import ve build yok. Saf yardımcılar (hatirlaticiId, bildirimListesi, titresimAdimlari,
// renkHex, cubukStili, apkSurumu, kabukKarari) ve paylas Node'da test edilir: tests/mobil-*.test.mjs.
// Konum köprüsü yok: sayfa navigator.geolocation kullanır; uygulamada Capacitor WebView'ı izni sorar
// (manifest izinleri: mobil/scripts/android-hazirla.mjs).
// FCM (partnerden anlık bildirim): fcmBaslat, fcmAc, fcmKapat; js/core/bildirim.js uygulamada bunları kullanır.
import { APK_URL } from '../../sayfalar/daha/mantik.js';
import { SITE_ROOT, me } from './identity.js';

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

// ---------- Paylaşım ----------

/**
 * Sistem paylaşım menüsü: uygulamada Share eklentisi (Android WebView'da navigator.share yok),
 * tarayıcıda navigator.share. -> 'shared' | 'cancelled' | 'yok' | 'failed'. Hata fırlatmaz.
 * 'yok' ve 'failed' durumunda çağıran panoya kopyalamaya düşer.
 */
/**
 * Adresi uygulamanın dışında açar (ör. APK indirme: WebView indirme yapamaz).
 * Uygulamada Browser eklentisi (Chrome özel sekmesi) → yoksa (eski APK) paylaşım menüsü; tarayıcıda aynı sekmede açar.
 * -> 'browser' | 'paylas' | 'sayfa'
 */
export async function disariAc(url, { git = (u) => { globalThis.location.href = u; } } = {}) {
  if (isNative()) {
    try {
      if (eklenti('Browser')?.open) {
        await cagir('Browser', 'open', { url });
        return 'browser';
      }
    } catch { /* paylaşıma düş */ }
    await paylas('Biz İkimiz yeni sürüm', url);
    return 'paylas';
  }
  git(url);
  return 'sayfa';
}

export async function paylas(metin, url) {
  const share = eklenti('Share');
  try {
    if (typeof share?.share === 'function') {
      await share.share({ title: 'Biz İkimiz', text: metin, url, dialogTitle: 'Paylaş' });
      return 'shared';
    }
    const nav = globalThis.navigator;
    if (typeof nav?.share !== 'function') return 'yok';
    await nav.share({ title: 'Biz İkimiz', text: metin, url });
    return 'shared';
  } catch (e) {
    // Tarayıcı: AbortError. Android eklentisi: "Share canceled".
    if (e?.name === 'AbortError' || /cancel/i.test(e?.message || '')) return 'cancelled';
    console.warn('[mobil] paylaşım', e);
    return 'failed';
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
// Son APK'nın sürümü sitede: indir/surum.json { surum, kod, tarih, fcm } (.github/workflows/pages.yml yazar;
// depo gizli olduğu için GitHub Releases API'si girişsiz okunamaz).

export const APK_SURUM_URL = new URL('indir/surum.json', SITE_ROOT).href;
const APK_DEPO_KEY = 'bizim.apk';
const APK_KONTROL_MS = 12 * 3_600_000; // APK seyrek değişir

/** surum.json → kod (versionCode, pozitif tam sayı). Geçersizse null. */
export function apkSurumu(veri) {
  const kod = veri?.kod;
  return Number.isSafeInteger(kod) && kod > 0 ? kod : null;
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
    const res = await fetchFn(APK_SURUM_URL, { cache: 'no-store' });
    if (!res.ok) return false;
    const son = apkSurumu(await res.json());
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

// ---------- FCM: partnerden anlık bildirim (yalnız uygulamada) ----------
// Android WebView Web Push desteklemez. Uygulamada @capacitor/push-notifications FCM belirteci (token) verir;
// RPC fcm_kaydet onu odaya bağlar (supabase/schema.sql 7. bölüm). Edge Function'lar ('bildir', 'hatirlat')
// Web Push'a ek olarak bu belirteçlere FCM HTTP v1 ile gönderir (supabase/functions/_shared/fcm.js).
// Uygulama arka plandayken bildirimi sistem gösterir (kanal FCM_KANAL); dokununca data.url açılır.
// Eski APK'da ve FCM'siz derlemede (GOOGLE_SERVICES_JSON_B64 yok) eklenti yoktur: fcmVar() false.

export const FCM_KANAL = 'biz-ikimiz'; // sunucu mesajı ve manifest varsayılanı ile aynı
export const FCM_TOKEN_RE = /^[A-Za-z0-9_:-]{20,4096}$/; // schema.sql fcm_kaydet ile aynı kural
const FCM_DEPO_KEY = 'bizim.fcm';
const FCM_BEKLE_MS = 20000;

/** Uygulamada FCM eklentisi var mı? */
export function fcmVar() {
  const p = eklenti('PushNotifications');
  return typeof p?.register === 'function' && typeof p?.addListener === 'function';
}

/** Bu cihazın sunucuya kaydedilmiş belirteci: { room, token } | null. fcmAc yazar, fcmKapat siler. */
export function fcmKayit(depo = yerelDepo()) {
  try {
    const k = JSON.parse(depo?.getItem(FCM_DEPO_KEY) || 'null');
    return typeof k?.room === 'string' && typeof k?.token === 'string' ? k : null;
  } catch {
    return null;
  }
}

function fcmKaydiYaz(depo, kayit) {
  try {
    if (kayit) depo?.setItem(FCM_DEPO_KEY, JSON.stringify(kayit));
    else depo?.removeItem(FCM_DEPO_KEY);
  } catch { /* depo kapalı */ }
}

/** Bildirim izni: 'granted' | 'denied' | 'prompt' | 'prompt-with-rationale' | 'yok'. Hata fırlatmaz. */
export async function fcmIzin() {
  try {
    return (await cagir('PushNotifications', 'checkPermissions'))?.receive || 'yok';
  } catch {
    return 'yok';
  }
}

/** Bildirimdeki göreli adres → site içi mutlak adres; boş ya da site dışıysa null. */
export function fcmHedef(url, kok = SITE_ROOT) {
  const s = typeof url === 'string' ? url.trim() : '';
  if (!s) return null;
  try {
    const u = new URL(s, kok);
    return u.href.startsWith(kok) ? u.href : null;
  } catch {
    return null;
  }
}

/** Supabase RPC (room.js istemcisi; yalnız gerekince yüklenir). */
async function varsayilanRpc(ad, args) {
  const { getSupabase } = await import('./room.js');
  const { data, error } = await (await getSupabase()).rpc(ad, args);
  if (error) throw new Error(error.message);
  return data;
}

async function fcmSunucuyaYaz(rpc, depo, roomId, token) {
  await rpc('fcm_kaydet', { p_room: roomId, p_client: me().clientId, p_token: token });
  fcmKaydiYaz(depo, { room: roomId, token });
}

let fcmKurulu = null; // dinleyicilerin kurulduğu eklenti nesnesi
let fcmBekleyen = null; // fcmAc'ın beklediği belirteç: { coz, reddet }
let fcmSira = Promise.resolve();

/** fcmAc / fcmKapat çağrıları sırayla işlenir (ör. açılıştaki tazeleme ile kullanıcı tıklaması). */
function sirayla(is) {
  const s = fcmSira.then(is, is);
  fcmSira = s.catch(() => {});
  return s;
}

/**
 * FCM olaylarını dinler. Her sayfada bir kez (mobilBaslat çağırır); sayfa değişince köprü dinleyicileri sıfırlanır.
 * - Belirteç yenilenirse ve bildirim açıksa (fcmKayit) yeni belirteci kaydeder.
 * - Uygulama açıkken gelen bildirim sistemde gösterilmez; window'a 'bizim:bildirim' olayı yayılır
 *   (detail = { tur, baslik, metin, url }; url site içi mutlak adres ya da null).
 * - Bildirime dokununca (uygulama kapalıyken de) data.url sayfasına gider.
 */
export function fcmBaslat({ rpc = varsayilanRpc, depo = yerelDepo(), git = (u) => { globalThis.location.href = u; } } = {}) {
  const p = eklenti('PushNotifications');
  if (!fcmVar() || fcmKurulu === p) return;
  fcmKurulu = p;
  p.addListener('registration', (veri) => {
    const token = veri?.value;
    if (fcmBekleyen) {
      fcmBekleyen.coz(token);
      return;
    }
    const kayit = fcmKayit(depo);
    if (!kayit || token === kayit.token || !FCM_TOKEN_RE.test(String(token))) return;
    sessiz(fcmSunucuyaYaz(rpc, depo, kayit.room, token), 'fcm belirteci yenilenemedi');
  });
  p.addListener('registrationError', (veri) => {
    const hata = new Error(veri?.error || 'FCM kaydı başarısız');
    if (fcmBekleyen) fcmBekleyen.reddet(hata);
    else console.warn('[mobil] fcm', hata.message);
  });
  p.addListener('pushNotificationReceived', (n) => {
    try {
      globalThis.dispatchEvent?.(new CustomEvent('bizim:bildirim', {
        detail: { tur: String(n?.data?.tur || ''), baslik: String(n?.title || ''), metin: String(n?.body || ''), url: fcmHedef(n?.data?.url) },
      }));
    } catch { /* eski WebView */ }
  });
  p.addListener('pushNotificationActionPerformed', (eylem) => {
    const hedef = fcmHedef(eylem?.notification?.data?.url);
    if (hedef && hedef !== globalThis.location?.href) git(hedef);
  });
}

/** register() → 'registration' olayındaki belirteç (en çok bekleMs). */
function fcmBelirtec(p, bekleMs) {
  return new Promise((coz, reddet) => {
    let zaman;
    const bitir = (f, x) => {
      clearTimeout(zaman);
      fcmBekleyen = null;
      f(x);
    };
    zaman = setTimeout(() => bitir(reddet, new Error('FCM belirteci gelmedi')), bekleMs);
    const bekleyen = {
      coz: (t) => (FCM_TOKEN_RE.test(String(t)) ? bitir(coz, t) : bitir(reddet, new Error('FCM belirteci geçersiz'))),
      reddet: (e) => bitir(reddet, e),
    };
    fcmBekleyen = bekleyen;
    Promise.resolve().then(() => p.register()).catch(bekleyen.reddet);
  });
}

/**
 * Bu cihazda bildirimi açar: izin ister, kanalı kurar, FCM belirteci alır, fcm_kaydet ile odaya bağlar.
 * İzin varken tekrar çağırmak belirteci tazeler (soru çıkmaz). -> başarılı mı. Hata fırlatmaz.
 */
export function fcmAc(roomId, { rpc = varsayilanRpc, depo = yerelDepo(), bekleMs = FCM_BEKLE_MS } = {}) {
  if (!fcmVar()) return Promise.resolve(false);
  fcmBaslat({ rpc, depo });
  const p = eklenti('PushNotifications');
  return sirayla(async () => {
    try {
      let izin = (await p.checkPermissions())?.receive;
      if (izin === 'prompt' || izin === 'prompt-with-rationale') izin = (await p.requestPermissions())?.receive;
      if (izin !== 'granted') return false;
      try {
        // Yüksek önem: ekranın üstünde belirir; ses (varsayılan) ve titreşim. Kanal varsa kullanıcı ayarı korunur.
        await p.createChannel({
          id: FCM_KANAL, name: 'Anlık bildirimler', description: 'Sevgilinin mesajları, dokunuşları ve hatırlatmalar',
          importance: 4, vibration: true,
        });
      } catch { /* Android 7: kanal yok */ }
      await fcmSunucuyaYaz(rpc, depo, roomId, await fcmBelirtec(p, bekleMs));
      return true;
    } catch (e) {
      console.warn('[mobil] fcm açılamadı:', e?.message || e);
      return false;
    }
  });
}

/** Bu cihazda bildirimi kapatır: belirteci siler (unregister) ve sunucudan çıkarır. -> true. Hata fırlatmaz. */
export function fcmKapat(roomId, { rpc = varsayilanRpc, depo = yerelDepo() } = {}) {
  if (!fcmVar()) return Promise.resolve(true);
  const p = eklenti('PushNotifications');
  return sirayla(async () => {
    const kayit = fcmKayit(depo);
    fcmKaydiYaz(depo, null);
    try {
      await p.unregister();
    } catch (e) {
      console.warn('[mobil] fcm kapatılamadı:', roomId, e?.message || e);
    }
    if (kayit) {
      try {
        await rpc('fcm_sil', { p_token: kayit.token });
      } catch (e) {
        console.warn('[mobil] fcm sunucudan silinemedi:', e?.message || e);
      }
    }
    return true;
  });
}

let basladi = false;

/**
 * Uygulama içinde bir kez: geri tuşu (geçmişte geri; kökte uygulamayı küçült), durum çubuğu
 * rengi ve stili temaya uyar, açılış ekranı kapanır, yeni APK varsa yeniApk(url) çağrılır,
 * FCM olayları dinlenir (bildirime dokununca ilgili sayfa açılır).
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
  fcmBaslat();
}
