// Anlık bildirim (Web Push; Android uygulamasında FCM). Sahip: Sunucu ajanı. Sözleşme §20.
// Abonelik: tarayıcı push adresi → RPC push_kaydet (supabase/schema.sql 5. bölüm).
// Android uygulaması (Capacitor) Web Push desteklemez: FCM belirteci → RPC fcm_kaydet (8. bölüm; js/core/mobil.js).
// Gönderim: Edge Function 'bildir' (supabase/functions/bildir) odadaki diğer cihazlara iki kanaldan iletir.
// Cihaz kimliği (js/core/uyelik.js kimlik): push_kaydet ve fcm_kaydet'e p_anahtar, bildir gövdesine anahtar.
// Yerel modda ya da Supabase ayarı yoksa hiçbir şey yapmaz. Üst kısım saf (Node'da test edilir).
import { SUPABASE_URL, SUPABASE_ANON_KEY, VAPID_PUBLIC_KEY } from '../config.js';
import { me, isLocalMode, isValidRoomId } from './identity.js';
import { getSupabase } from './room.js';
import { kimlik } from './uyelik.js';
import { listDocs } from './veri.js';
import { pickPartnerDoc } from './profil.js';
import { isNative, fcmVar, fcmIzin, fcmKayit, fcmAc, fcmKapat } from './mobil.js';
import { KOK_URL, iosMu, standaloneMu, registerPwa } from './pwa.js';

export const TURLER = ['dokunus', 'mesaj', 'mektup', 'ani', 'gun', 'oyun', 'soru', 'liste', 'izle'];
const KISIT_MS = 10000; // aynı türden bildirim en çok 10 sn'de bir (ör. art arda mesajlar)
const KISI_BEKLE_MS = 3000; // partnerin ayarı bu sürede okunamazsa gizli sayılır

// ---------- Saf yardımcılar ----------

/** -> 'var' | 'ana-ekran-gerek' | 'yok'. Uygulamada (native) yalnız FCM eklentisi varsa 'var'. */
export function destekKarari({ sunucu = true, native = false, fcm = false, ios = false, standalone = false, guvenli = true, sw = false, push = false, bildirim = false } = {}) {
  if (native) return sunucu && fcm ? 'var' : 'yok';
  if (!sunucu) return 'yok';
  if (ios && !standalone) return 'ana-ekran-gerek'; // iPhone'da Web Push yalnız ana ekrana eklenmiş uygulamada
  return guvenli && sw && push && bildirim ? 'var' : 'yok';
}

/** -> 'acik' | 'kapali' | 'engelli' | 'yok' */
export function durumKarari({ destek, izin, abonelik }) {
  if (destek !== 'var') return 'yok';
  if (izin === 'denied') return 'engelli';
  return izin === 'granted' && abonelik ? 'acik' : 'kapali';
}

/** base64url VAPID genel anahtarı → Uint8Array (pushManager.subscribe applicationServerKey). */
export function anahtarBaytlari(b64u) {
  const t = String(b64u || '').replace(/-/g, '+').replace(/_/g, '/').replace(/=+$/, '');
  const bin = atob(t + '='.repeat((4 - (t.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

/** Mevcut aboneliğin anahtarı bizimkiyle aynı mı? (anahtar değiştiyse yeniden abone olunur) */
export function ayniAnahtar(mevcut, b64u) {
  if (!mevcut) return true; // tarayıcı bilgiyi vermiyorsa dokunma
  const a = new Uint8Array(mevcut);
  const b = anahtarBaytlari(b64u);
  return a.length === b.length && a.every((x, i) => x === b[i]);
}

/** PushSubscription → push_kaydet'in beklediği { endpoint, keys: { p256dh, auth } }. */
export function aboneJson(sub) {
  const j = typeof sub?.toJSON === 'function' ? sub.toJSON() : sub || {};
  return { endpoint: j.endpoint, keys: { p256dh: j.keys?.p256dh, auth: j.keys?.auth } };
}

/** Edge Function gövdesi | null (tür geçersizse). Sunucu da doğrular ve kısaltır. */
export function bildirGovdesi(roomId, from, { tur, baslik, metin, url } = {}) {
  if (!TURLER.includes(tur)) return null;
  const s = (v, n) => String(v ?? '').slice(0, n);
  return { room: roomId, from, tur, baslik: s(baslik, 120), metin: s(metin, 300), url: s(url, 200) };
}

export function bildirAdresi(supabaseUrl) {
  return `${String(supabaseUrl).replace(/\/+$/, '')}/functions/v1/bildir`;
}

/** Eski JWT anahtarı (eyJ...) Bearer olarak da gider; sb_publishable_ yalnız apikey başlığında. */
export function istekBasliklari(anahtar) {
  const h = { 'Content-Type': 'application/json', apikey: anahtar };
  if (String(anahtar).startsWith('eyJ')) h.Authorization = `Bearer ${anahtar}`;
  return h;
}

/** Aynı tür son KISIT_MS içinde gönderildiyse false. `son` = Map(tür → zaman), yerinde güncellenir. */
export function kisitla(son, tur, simdi, ms = KISIT_MS) {
  const t = son.get(tur);
  if (t != null && simdi - t < ms) return false;
  son.set(tur, simdi);
  return true;
}

/** Kilit ekranı: alıcı açıkça izin vermedikçe (kisi.bildirimGizli === false) içerik gitmez. Profil bilinmiyorsa gizli. */
export function bildirimGizliMi(kisi) {
  return kisi?.bildirimGizli !== false;
}

/** Gizliyse { baslik?, metin } yerine geçer. */
export function bildirimIcerigi({ baslik, metin }, kisi, gizli) {
  if (!gizli || !bildirimGizliMi(kisi)) return { baslik, metin };
  return { baslik: gizli.baslik ?? baslik, metin: gizli.metin };
}

/** 'kisi' belgelerinden partnerin verisi | null. */
export function partnerKisisi(docs, myId) {
  return pickPartnerDoc((docs || []).filter((d) => !d.deleted), myId)?.data || null;
}

// ---------- Tarayıcı ----------

/** Partnerin güncel kisi verisi (önbellek eski kalabilir). Okunamazsa null: gizli sayılır. */
async function partnerKisiOku(roomId, myId) {
  let zaman = 0;
  try {
    const sure = new Promise((_, reddet) => { zaman = setTimeout(() => reddet(new Error('zaman aşımı')), KISI_BEKLE_MS); });
    return partnerKisisi(await Promise.race([listDocs(roomId, 'kisi'), sure]), myId);
  } catch {
    return null;
  } finally {
    clearTimeout(zaman);
  }
}

function sunucuVar() {
  return !!(SUPABASE_URL && SUPABASE_ANON_KEY) && !isLocalMode();
}

/** -> 'var' | 'ana-ekran-gerek' (iPhone'da Safari sekmesi) | 'yok' */
export function bildirimDestegi() {
  try {
    const nav = globalThis.navigator || {};
    const native = isNative();
    return destekKarari({
      sunucu: sunucuVar() && (native || !!VAPID_PUBLIC_KEY),
      native,
      fcm: native && fcmVar(),
      ios: iosMu(nav.userAgent || '', nav.maxTouchPoints || 0),
      standalone: standaloneMu(),
      guvenli: !!globalThis.isSecureContext,
      sw: 'serviceWorker' in nav,
      push: 'PushManager' in globalThis,
      bildirim: 'Notification' in globalThis,
    });
  } catch {
    return 'yok';
  }
}

async function aboneligiBul() {
  const reg = await globalThis.navigator?.serviceWorker?.getRegistration(KOK_URL.href);
  return (await reg?.pushManager?.getSubscription()) || null;
}

/** -> 'acik' | 'kapali' | 'engelli' | 'yok' */
export async function bildirimDurumu() {
  const destek = bildirimDestegi();
  if (destek !== 'var') return 'yok';
  if (isNative()) return durumKarari({ destek, izin: await fcmIzin(), abonelik: !!fcmKayit() });
  const izin = globalThis.Notification.permission;
  let abonelik = null;
  if (izin === 'granted') {
    try { abonelik = await aboneligiBul(); } catch { /* yok say */ }
  }
  return durumKarari({ destek, izin, abonelik: !!abonelik });
}

/** Etkin service worker kaydı (en çok 10 sn beklenir). */
async function hazirKayit() {
  if (!(await registerPwa())) return null;
  return Promise.race([
    globalThis.navigator.serviceWorker.ready,
    new Promise((r) => setTimeout(() => r(null), 10000)),
  ]);
}

/** Kullanıcı tıklamasıyla çağrılır: izin ister, aboneliği kaydeder. -> başarılı mı */
export async function bildirimAc(roomId) {
  if (bildirimDestegi() !== 'var' || !isValidRoomId(roomId)) return false;
  if (isNative()) return fcmAc(roomId, { kimlikAl: kimlik });
  try {
    // İzin isteği tıklamanın hemen içinde olmalı (Safari): başka await'ten önce.
    const N = globalThis.Notification;
    const izin = N.permission === 'granted' ? 'granted' : await N.requestPermission();
    if (izin !== 'granted') return false;
    const reg = await hazirKayit();
    if (!reg?.pushManager) return false;
    let sub = await reg.pushManager.getSubscription();
    if (sub && !ayniAnahtar(sub.options?.applicationServerKey, VAPID_PUBLIC_KEY)) {
      await sub.unsubscribe().catch(() => {});
      sub = null;
    }
    if (!sub) {
      sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: anahtarBaytlari(VAPID_PUBLIC_KEY) });
    }
    const client = await getSupabase();
    const { p_anahtar } = kimlik(roomId); // eski sunucuda yok: parametre gönderilmez
    const { error } = await client.rpc('push_kaydet', {
      p_room: roomId, p_client: me().clientId, p_sub: aboneJson(sub),
      p_ua: String(globalThis.navigator.userAgent || '').slice(0, 200),
      ...(p_anahtar ? { p_anahtar } : {}),
    });
    if (error) throw new Error(error.message);
    return true;
  } catch (e) {
    console.warn('[bildirim] açılamadı:', e?.message || e);
    return false;
  }
}

/** Bu cihazın aboneliğini kapatır ve sunucudan siler. -> başarılı mı */
export async function bildirimKapat(roomId) {
  if (isNative()) return fcmKapat(roomId);
  try {
    const sub = await aboneligiBul();
    if (!sub) return true;
    const endpoint = sub.endpoint;
    await sub.unsubscribe().catch(() => {});
    if (sunucuVar()) {
      const client = await getSupabase();
      const { error } = await client.rpc('push_sil', { p_endpoint: endpoint });
      if (error) console.warn('[bildirim] sunucudan silinemedi:', error.message);
    }
    return true;
  } catch (e) {
    console.warn('[bildirim] kapatılamadı:', roomId, e?.message || e);
    return false;
  }
}

const sonGonderim = new Map();

/**
 * Partnerin cihazlarına bildirim. Hata fırlatmaz. -> gönderildi mi
 * tur: 'dokunus'|'mesaj'|'mektup'|'ani'|'gun'|'oyun'|'soru'|'liste'|'izle'. url site köküne göre göreli ('sayfalar/sohbet/').
 * Aynı tür 10 sn içinde ikinci kez gönderilmez (art arda mesajlar tek bildirim).
 * gizli: { metin, baslik? }: içerik taşıyan bildirimde verilir; partner gizlilik istiyorsa bunlar gider (bildirimIcerigi).
 */
export async function bildir(roomId, { tur, baslik, metin, url, gizli } = {}) {
  try {
    if (!sunucuVar() || !isValidRoomId(roomId)) return false;
    const myId = me().clientId;
    let govde = bildirGovdesi(roomId, myId, { tur, baslik, metin, url });
    if (!govde || !kisitla(sonGonderim, `${roomId}:${tur}`, Date.now())) return false;
    if (gizli) {
      const icerik = bildirimIcerigi({ baslik, metin }, await partnerKisiOku(roomId, myId), gizli);
      govde = bildirGovdesi(roomId, myId, { tur, ...icerik, url });
    }
    const { p_anahtar } = kimlik(roomId); // cihaz anahtarı (sunucu push_hedef'te doğrular)
    if (p_anahtar) govde.anahtar = p_anahtar;
    const res = await fetch(bildirAdresi(SUPABASE_URL), {
      method: 'POST',
      headers: istekBasliklari(SUPABASE_ANON_KEY),
      body: JSON.stringify(govde),
      keepalive: true, // sayfadan hemen çıkılsa da gitsin
      credentials: 'omit',
    });
    return res.ok;
  } catch {
    return false;
  }
}
