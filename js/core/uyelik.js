// Cihaz üyeliği: oda kodu tek başına veriye erişim vermez; her cihaz onay alır (TALIMAT §5.1).
// Sunucu: RPC oda_katil, oda_durum, cihaz_*, davet_olustur, kurtarma_olustur (supabase/schema.sql).
// Sunucu eskiyse (oda_katil yok) 'eski-sunucu': kimliksiz, kanal = oda kodu (eskisi gibi).
// Yerel mod (?yerel=1): varsayılan GEVŞEK (her cihaz onaylı). sessionStorage 'bizim.yerel.uyelik' = '1' ise SIKI
// öykünme: sunucu kuralları localStorage'da (sekmeler 'storage' olayıyla haberleşir).
// Değişen durum window 'bizim:uyelik' olayıyla yayılır (detail = { roomId, durum, kanal, zorunlu, ilk }).
// Node'da içe aktarılabilir: tarayıcı nesnelerine yalnız fonksiyon içinde erişilir.
import { me, isLocalMode, readStore, writeStore } from './identity.js';
import { getSupabase, _testSupabase } from './room.js';
import {
  ANAHTAR_RE, base64url, cihazAdi, yetkiHatasiMi, eskiSunucuHatasiMi, sonucCoz, girisAcikMi, kanalSec,
  kurtarmaTemizle, davetKoduMu, yeniDurum, ykKatil, ykDurum, ykYetki, ykListele, ykOnayla, ykReddet, ykCikar,
  ykDavetOlustur, ykKurtarmaOlustur,
} from './uyelik-mantik.js';

export { cihazAdi, yetkiHatasiMi, girisAcikMi, kanalSec };

const K_SIKI = 'bizim.yerel.uyelik';
const OLAY = 'bizim:uyelik';
const anahtarKey = (roomId) => `bizim.anahtar.${roomId}`;
const onbellekKey = (roomId) => `bizim.uyelik.${roomId}`;
// Öykünme durumu sunucunun yerini tutar: 'bizim.yerelveri.' öneki "odadan çık"ta silinmez (kilit.js).
const yerelKey = (roomId) => `bizim.yerelveri.${roomId}._uyelik`;

// Yerel modda iki sekme iki ayrı cihazdır: anahtar ve önbellek sekmeye özel.
const depo = () => (isLocalMode() ? 'session' : 'local');
const rastgele = (n) => globalThis.crypto.getRandomValues(new Uint8Array(n));
const tarayiciAdi = () => cihazAdi(globalThis.navigator?.userAgent || '', me().name);

/** Test: sahte Supabase istemcisi (room.js _testSupabase ile aynı kanca). */
export const _testIstemci = _testSupabase;
const istemci = () => getSupabase();

function mod() {
  if (!isLocalMode()) return 'sunucu';
  return readStore('session', K_SIKI) === '1' ? 'yerel-siki' : 'yerel-gevsek';
}

/** 'sunucu' | 'eski-sunucu' | 'yerel-gevsek' | 'yerel-siki' (arayüz hangi bölümü göstereceğini seçer). */
export function uyelikModu(roomId) {
  const m = mod();
  return m === 'sunucu' && sonDurum(roomId)?.durum === 'eski-sunucu' ? 'eski-sunucu' : m;
}

// ---------- Anahtar ve kimlik ----------

/** Bu cihazın bu odadaki gizli anahtarı (yoksa üretir). */
export function anahtarim(roomId) {
  const kind = depo();
  let a = readStore(kind, anahtarKey(roomId));
  if (!ANAHTAR_RE.test(a || '')) {
    a = base64url(rastgele(32));
    writeStore(kind, anahtarKey(roomId), a);
  }
  return a;
}

/** RPC'lere eklenecek kimlik. Eski sunucu ve yerel modda {}. */
export function kimlik(roomId) {
  if (!roomId || isLocalMode() || sonDurum(roomId)?.durum === 'eski-sunucu') return {};
  return { p_cihaz: me().clientId, p_anahtar: anahtarim(roomId) };
}

const tamKimlik = (roomId) => ({ p_cihaz: me().clientId, p_anahtar: anahtarim(roomId) });

// ---------- Önbellek ve olay ----------

/** Önbellekteki son sonuç | null (sayfa anında açılsın diye). */
export function sonDurum(roomId) {
  if (!roomId) return null;
  try {
    const v = JSON.parse(readStore(depo(), onbellekKey(roomId)) || 'null');
    if (!v || typeof v.durum !== 'string') return null;
    return { durum: v.durum, kanal: v.kanal ?? null, zorunlu: v.zorunlu ?? null, ilk: v.ilk === true };
  } catch {
    return null;
  }
}

function yay(roomId, s) {
  const w = globalThis.window;
  if (!w || typeof w.dispatchEvent !== 'function' || typeof CustomEvent !== 'function') return;
  try { w.dispatchEvent(new CustomEvent(OLAY, { detail: { roomId, ...s } })); } catch { /* yok say */ }
}

/** Sonucu önbelleğe yazar; durum ya da kanal değiştiyse olay yayar. -> sonuç */
function kaydet(roomId, s) {
  const once = sonDurum(roomId);
  const temiz = { durum: s.durum, kanal: s.kanal ?? null, zorunlu: s.zorunlu ?? null, ilk: s.ilk === true };
  writeStore(depo(), onbellekKey(roomId), JSON.stringify(temiz));
  if (!once || once.durum !== temiz.durum || once.kanal !== temiz.kanal) yay(roomId, temiz);
  return temiz;
}

function cevrimdisi(roomId) {
  const on = sonDurum(roomId);
  return { durum: 'cevrimdisi', kanal: on?.kanal ?? null, zorunlu: on?.zorunlu ?? null, ilk: false, onceki: on?.durum ?? null };
}

const eskiSunucu = (roomId) => ({ durum: 'eski-sunucu', kanal: roomId, zorunlu: null, ilk: false });
const gevsek = (roomId) => ({ durum: 'onayli', kanal: roomId, zorunlu: null, ilk: false });

// ---------- Yerel sıkı öykünme (localStorage) ----------

function ykOku(roomId) {
  try {
    const v = JSON.parse(readStore('local', yerelKey(roomId)) || 'null');
    if (v && typeof v === 'object' && v.cihazlar && v.davetler) return v;
  } catch { /* bozuk: baştan */ }
  return yeniDurum();
}

/** Öykünme durumunda iş yapar; değiştiyse yazar (aynı değer 'storage' olayı doğurmaz). */
function ykIs(roomId, fn) {
  const ham = readStore('local', yerelKey(roomId));
  const st = ykOku(roomId);
  const sonuc = fn(st);
  const yeni = JSON.stringify(st);
  if (yeni !== ham) writeStore('local', yerelKey(roomId), yeni);
  return sonuc;
}

const ykKim = (roomId) => ({ cihaz: me().clientId, anahtar: anahtarim(roomId) });
const ykCtx = () => ({ simdi: Date.now(), rastgele });
const zaman = (s) => { const t = Date.parse(s); return Number.isFinite(t) ? t : 0; };

/** Yerel veri belgeleri (yalnız tarayıcıda): oda_katil'in "odada veri var" ve "geçiş" kuralları için. */
function yerelBelgeler(roomId) {
  const ls = globalThis.window?.localStorage; // Node'da yok (globalThis.localStorage uyarı basar)
  const out = [];
  if (!ls) return out;
  const on = `bizim.yerelveri.${roomId}.`;
  try {
    for (let i = 0; i < ls.length; i++) {
      const k = ls.key(i);
      if (!k || !k.startsWith(on) || k === yerelKey(roomId)) continue;
      const kind = k.slice(on.length);
      const hepsi = JSON.parse(ls.getItem(k) || '{}');
      for (const d of Object.values(hepsi || {})) if (d && typeof d === 'object') out.push({ kind, ...d });
    }
  } catch { /* depo yok */ }
  return out;
}

let dinleniyor = false;
function yerelDinle() {
  const w = globalThis.window;
  if (dinleniyor || !w || typeof w.addEventListener !== 'function') return;
  dinleniyor = true;
  w.addEventListener('storage', (e) => {
    const m = /^bizim\.yerelveri\.([^.]+)\._uyelik$/.exec(e?.key || '');
    if (m && mod() === 'yerel-siki') durumTazele(m[1]).catch(() => {});
  });
}

function ykGiris(roomId, { davet, kurtarma }) {
  yerelDinle();
  const belgeler = yerelBelgeler(roomId);
  const cihaz = me().clientId;
  return ykIs(roomId, (st) => {
    const sinir = st.oda ? zaman(st.oda.olusturma) : Date.now();
    const eskiYazar = belgeler.some((d) => zaman(d.created_at) < sinir
      && ((d.kind === 'kisi' && d.id === cihaz) || d.author === cihaz));
    return ykKatil(st, {
      room: roomId, cihaz, anahtar: anahtarim(roomId), ad: tarayiciAdi(), davet, kurtarma,
      veriVar: belgeler.length > 0, eskiYazar,
    }, ykCtx());
  });
}

/**
 * Yerel SIKI modda veri erişimi denetimi (veri.js / db.js yerel arka ucu çağırır).
 * Onaylı değilse { code: '42501' } fırlatır. Diğer modlarda bir şey yapmaz.
 */
export function yerelVeriYetkisi(roomId) {
  if (mod() !== 'yerel-siki') return;
  ykIs(roomId, (st) => ykYetki(st, ykKim(roomId), Date.now()));
}

// ---------- Giriş ve durum ----------

/**
 * oda_katil → { durum, kanal, zorunlu, ilk }.
 * durum: 'onayli' | 'bekliyor' | 'reddedildi' | 'cakisma' | 'eski-sunucu' | 'cevrimdisi'.
 * 'cevrimdisi': ağ hatası; önbellekteki son durum `onceki`, kanal da ondan.
 */
export async function odaGiris(roomId, { davet = null, kurtarma = null } = {}) {
  const m = mod();
  if (m === 'yerel-gevsek') return kaydet(roomId, gevsek(roomId));
  const d = davetKoduMu(davet) ? davet : null;
  const k = kurtarma ? kurtarmaTemizle(kurtarma) || null : null;
  if (m === 'yerel-siki') {
    try {
      return kaydet(roomId, ykGiris(roomId, { davet: d, kurtarma: k }));
    } catch (e) {
      console.warn('[uyelik] yerel giriş:', e?.message || e);
      return cevrimdisi(roomId);
    }
  }
  try {
    const client = await istemci();
    const { data, error, status } = await client.rpc('oda_katil', {
      p_room: roomId, ...tamKimlik(roomId), p_ad: tarayiciAdi(), p_davet: d, p_kurtarma: k,
    });
    if (error) {
      if (eskiSunucuHatasiMi(error, status)) return kaydet(roomId, eskiSunucu(roomId));
      throw error;
    }
    const s = sonucCoz(data);
    if (!s) throw new Error('Geçersiz yanıt.');
    return kaydet(roomId, s);
  } catch (e) {
    console.warn('[uyelik] oda_katil:', e?.message || e);
    return cevrimdisi(roomId);
  }
}

/** oda_durum: önbelleği tazeler; durum ya da kanal değişince 'bizim:uyelik' olayı. -> sonuç */
export async function durumTazele(roomId) {
  const m = mod();
  if (m === 'yerel-gevsek') return sonDurum(roomId) || kaydet(roomId, gevsek(roomId));
  const once = sonDurum(roomId);
  // Hiç kayıt olmamış (ya da eski sunucudan yükselen) cihaz için 'yok' çıkarma değildir: kayıt ol.
  const kayitsiz = !once || once.durum === 'eski-sunucu';
  let s;
  if (m === 'yerel-siki') {
    yerelDinle();
    s = ykIs(roomId, (st) => ykDurum(st, ykKim(roomId), Date.now()));
  } else {
    try {
      const client = await istemci();
      const { data, error, status } = await client.rpc('oda_durum', { p_room: roomId, ...tamKimlik(roomId) });
      if (error) {
        if (eskiSunucuHatasiMi(error, status)) return kaydet(roomId, eskiSunucu(roomId));
        throw error;
      }
      s = sonucCoz(data);
      if (!s) throw new Error('Geçersiz yanıt.');
    } catch (e) {
      console.warn('[uyelik] oda_durum:', e?.message || e);
      return cevrimdisi(roomId);
    }
  }
  if (s.durum === 'yok' && kayitsiz) return odaGiris(roomId);
  return kaydet(roomId, s);
}

/** Sunucu 42501 dedi: erişim gitti. Önbellek 'yok' olur, olay yayılır (kapı ekranı açılır). */
export function yetkiKaybedildi(roomId) {
  const once = sonDurum(roomId);
  if (once && !girisAcikMi(once)) return; // zaten kapıda (bekliyor, reddedildi, yok...)
  if (once?.durum === 'eski-sunucu') {
    // Sunucu güncellenmiş, koruma başlamış: kimlikle yeniden kayıt ol.
    writeStore(depo(), onbellekKey(roomId), null);
    odaGiris(roomId).catch(() => {});
    return;
  }
  kaydet(roomId, { durum: 'yok', kanal: null, zorunlu: once?.zorunlu ?? null, ilk: false });
}

// ---------- Cihaz yönetimi (kimlik zorunlu) ----------

/** Kimlikli RPC. Hata: 42501 ise yetki kaybı işlenir; Error fırlatır (code ile). */
async function cagir(roomId, ad, ek = {}) {
  const client = await istemci();
  const { data, error, status } = await client.rpc(ad, { p_room: roomId, ...tamKimlik(roomId), ...ek });
  if (error) {
    if (yetkiHatasiMi(error)) yetkiKaybedildi(roomId);
    throw Object.assign(new Error(error.message || 'İstek başarısız.'), { code: error.code, status });
  }
  return data;
}

/** Yerel sıkı modda öykünme, sunucuda RPC. 42501 → yetki kaybı. */
async function yonet(roomId, rpcAdi, ek, yerelFn) {
  if (mod() === 'yerel-siki') {
    try {
      return ykIs(roomId, (st) => yerelFn(st, ykKim(roomId), ykCtx()));
    } catch (e) {
      if (yetkiHatasiMi(e)) yetkiKaybedildi(roomId);
      throw e;
    }
  }
  return cagir(roomId, rpcAdi, ek);
}

/** -> [{ cihaz, ad, durum, olusturma, son_gorulme, ben }]. Yetki yoksa []. Ağ hatasında fırlatır. */
export async function cihazlar(roomId) {
  const benId = me().clientId;
  const m = uyelikModu(roomId);
  if (m === 'eski-sunucu') return [];
  if (m === 'yerel-gevsek') return [{ cihaz: benId, ad: tarayiciAdi(), durum: 'onayli', olusturma: null, son_gorulme: null, ben: true }];
  try {
    const rows = await yonet(roomId, 'cihaz_listele', {}, (st, kim) => ykListele(st, kim, Date.now()));
    return (Array.isArray(rows) ? rows : []).map((r) => ({
      cihaz: String(r.cihaz), ad: r.ad ?? null, durum: r.durum, olusturma: r.olusturma ?? null,
      son_gorulme: r.son_gorulme ?? null, ben: String(r.cihaz) === benId,
    }));
  } catch (e) {
    if (yetkiHatasiMi(e)) return [];
    throw e;
  }
}

async function evetHayir(roomId, rpcAdi, hedef, yerelFn) {
  if (uyelikModu(roomId) === 'yerel-gevsek' || uyelikModu(roomId) === 'eski-sunucu') return false;
  try {
    return (await yonet(roomId, rpcAdi, { p_hedef: hedef }, (st, kim, ctx) => yerelFn(st, kim, hedef, ctx))) === true;
  } catch (e) {
    console.warn(`[uyelik] ${rpcAdi}:`, e?.message || e);
    return false;
  }
}

export const cihazOnayla = (roomId, hedef) => evetHayir(roomId, 'cihaz_onayla', hedef, ykOnayla);
export const cihazReddet = (roomId, hedef) => evetHayir(roomId, 'cihaz_reddet', hedef, ykReddet);

/** Cihazı çıkarır. Kanal yenilendiği için kendi durumumuz tazelenir (kendimizi çıkardıysak önbellek silinir). */
export async function cihazCikar(roomId, hedef) {
  const ok = await evetHayir(roomId, 'cihaz_cikar', hedef, ykCikar);
  if (!ok) return false;
  if (hedef === me().clientId) writeStore(depo(), onbellekKey(roomId), null);
  else await durumTazele(roomId);
  return true;
}

/** Tek kullanımlık, 7 gün geçerli davet kodu | null (eski sunucu, yerel gevşek mod ya da hata). */
export async function davetOlustur(roomId) {
  const m = uyelikModu(roomId);
  if (m === 'eski-sunucu' || m === 'yerel-gevsek') return null;
  try {
    const kod = await yonet(roomId, 'davet_olustur', {}, ykDavetOlustur);
    return davetKoduMu(kod) ? kod : null;
  } catch (e) {
    console.warn('[uyelik] davet_olustur:', e?.message || e);
    return null;
  }
}

/** Kurtarma kodu 'ABCD-EFGH-JKLM-NPQR'. Eskisinin yerine geçer. Hata fırlatır. */
export async function kurtarmaOlustur(roomId) {
  const m = uyelikModu(roomId);
  if (m === 'eski-sunucu' || m === 'yerel-gevsek') throw new Error('Kurtarma kodu bu modda yok.');
  const kod = await yonet(roomId, 'kurtarma_olustur', {}, ykKurtarmaOlustur);
  if (typeof kod !== 'string' || !/^[A-Z2-9]{4}(-[A-Z2-9]{4}){3}$/.test(kod)) throw new Error('Geçersiz yanıt.');
  return kod;
}
