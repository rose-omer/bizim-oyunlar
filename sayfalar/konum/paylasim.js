// Konum alma ve yazma (tarayıcı): tek sefer, canlı izleme, açılışta tazeleme, yer adı, pil.
//   const col = await konumKoleksiyonu(room)          // sayfa başına tek 'konum' koleksiyonu
//   await canliServis(room, { onHata })               // sayfa başına tek canlı izleyici (ui.js her sayfada başlatır)
//   await konumYaz(col, myId, pos, { hassas, canli })  // pos = GeolocationPosition
//   await acilistaGuncelle(col, room, myId)            // paylaşım açık + kayıt 10 dk'dan eski → bir kez
// Yazımlar putDoc (col.put); durdurma da { kapali: true, at } yazar (removeDoc değil).
// Canlı paylaşım açıkken yerel işaret (ui.js canliKonumAnahtari = bitiş ISO) tutulur; ui.js her sayfada buna bakıp
// izleyiciyi açar. İşaret yoksa ui.js bu modülü yüklemez.
import { listDocs, openCollection } from '../../js/core/veri.js';
import { readStore, writeStore } from '../../js/core/identity.js';
import { isNative } from '../../js/core/mobil.js';
import { canliKonumAnahtari } from '../../js/core/ui.js';
import * as M from './mantik.js';

const K_YER = 'bizim.konum.yer'; // { [yerAnahtari]: ad } (en çok 40)
const YER_SINIR = 40;
const YER_ZAMAN_ASIMI_MS = 6000;
const NABIZ_MS = 20000; // canlıda durağan cihaz: kayıt bayatlayınca yeniden yaz
let sonYerIstegi = 0;

// Bu modülün bütün konum yazımları sırayla gider: "Paylaşımı durdur" yoldaki canlı yazımın arkasına girer,
// sunucuya sonra varır ve konumu geri açtırmaz.
let sira = Promise.resolve();
function sirala(is) {
  const p = sira.then(is, is);
  sira = p.catch(() => {});
  return p;
}

// ---------- Konum ----------
/** Geolocation → Promise<GeolocationPosition>. Destek yoksa { code: 0 } ile reddeder. */
export function konumAl(hassas, secenek = M.konumSecenek(hassas)) {
  if (!navigator.geolocation) return Promise.reject(Object.assign(new Error('Bu cihaz konum vermiyor.'), { code: 0 }));
  return new Promise((res, rej) => navigator.geolocation.getCurrentPosition(res, rej, secenek));
}

/** 'granted' | 'denied' | 'prompt' | null (Permissions API yok) */
export async function izinDurumu() {
  try {
    return (await navigator.permissions?.query({ name: 'geolocation' }))?.state || null;
  } catch {
    return null;
  }
}

/** Sormadan konum alınabilir mi? Uygulamada izin sistemde; reddedilmediyse dene. */
async function sessizAlinir() {
  const st = await izinDurumu();
  return st === 'granted' || (isNative() && st !== 'denied');
}

// ---------- Pil ----------
export async function pilOku() {
  try {
    return M.pilVerisi(await navigator.getBattery?.());
  } catch {
    return null;
  }
}

// ---------- Yer adı ----------
function yerOnbellek() {
  try {
    const v = JSON.parse(readStore('local', K_YER) || '{}');
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  } catch {
    return {};
  }
}
function yerSakla(anahtar, ad) {
  const o = yerOnbellek();
  delete o[anahtar];
  o[anahtar] = ad;
  const anahtarlar = Object.keys(o);
  for (const k of anahtarlar.slice(0, Math.max(0, anahtarlar.length - YER_SINIR))) delete o[k];
  try { writeStore('local', K_YER, JSON.stringify(o)); } catch { /* kota */ }
}

/**
 * Yer adı: önbellek → (dakikada en çok 1) Nominatim → yoksa önceki kayıttaki ad (1 km'den az hareket).
 * Hata sessiz: null döner, belgeye yer yazılmaz.
 */
export async function yerBul(lat, lng, onceki = null) {
  const anahtar = M.yerAnahtari(lat, lng);
  const eski = M.paylasiyor(onceki) && onceki.yer && (M.mesafeKm(onceki, { lat, lng }) ?? Infinity) < 1 ? onceki.yer : null;
  const kayitli = yerOnbellek()[anahtar];
  if (typeof kayitli === 'string' && kayitli) return kayitli;
  if (Date.now() - sonYerIstegi < M.YER_ARALIK_MS || typeof fetch !== 'function') return eski;
  sonYerIstegi = Date.now();
  const iptal = typeof AbortController === 'function' ? new AbortController() : null;
  const zaman = setTimeout(() => iptal?.abort(), YER_ZAMAN_ASIMI_MS);
  try {
    const res = await fetch(M.nominatimUrl(lat, lng), {
      signal: iptal?.signal, credentials: 'omit', headers: { Accept: 'application/json' },
    });
    if (!res.ok) return eski;
    const ad = M.yerAdi(await res.json());
    if (!ad) return eski;
    yerSakla(anahtar, ad);
    return ad;
  } catch {
    return eski;
  } finally {
    clearTimeout(zaman);
  }
}

// ---------- Yazma ----------
/**
 * Konumu (yer adı ve pille) yazar. -> yazılan veri | null (gecerli() yazmadan hemen önce yanlışsa yazmaz).
 * Koordinat geçersizse hata.
 */
export async function konumYaz(col, myId, pos, { hassas = 'yaklasik', canli = null, gecerli = null } = {}) {
  const onceki = M.konumOku(col.get(myId)?.data);
  const taban = M.konumVerisi(pos?.coords, new Date(), { hassas });
  if (!taban) throw new Error('Konum okunamadı. Biraz sonra tekrar dener misin?');
  const [yer, pil] = await Promise.all([yerBul(taban.lat, taban.lng, onceki), pilOku()]);
  return sirala(async () => {
    if (gecerli && !gecerli()) return null;
    const veri = M.konumVerisi(pos.coords, new Date(), {
      hassas, yer, pil: pil?.pil, sarj: pil?.sarj, canli: canli || undefined,
    });
    await col.put(veri, myId);
    return veri;
  });
}

/** Paylaşımı durdurur: koordinatsız { kapali: true, at } yazar (removeDoc değil: veri sunucuda kalmasın). */
export function paylasimiDurdur(col, myId) {
  return sirala(() => col.put(M.kapaliVeri(new Date()), myId));
}

/** Canlıyı bitirir: canli alanı silinir, son konum kalır. */
export function canliKapat(col, myId) {
  return sirala(() => {
    const d = col.get(myId)?.data;
    return M.paylasiyor(M.konumOku(d)) ? col.put(M.canliDusur(d), myId) : null;
  });
}

/**
 * Uygulama açılınca: paylaşım açıksa (kapalı değil) ve son kayıt 10 dk'dan eskiyse bir kez güncelle.
 * Karar sunucudaki belgeyle verilir (başka cihazdan durdurulduysa önbellek yeniden açmasın).
 * İzin sorulmaz: izin yoksa sessizce geçer. Canlı açıksa izleyici yazar. -> yazıldı mı
 * Eski "Kapat ve sil" (removeDoc) kalıntısı: silinmiş belgede koordinat kaldıysa { kapali } ile ezilir.
 */
export async function acilistaGuncelle(col, room, myId) {
  try {
    const docs = await listDocs(room.roomId, M.TUR);
    const d = docs.find((x) => x.id === myId);
    if (d?.deleted && d.data && 'lat' in d.data) {
      await paylasimiDurdur(col, myId);
      return false;
    }
    const k = d && !d.deleted ? M.konumOku(d.data) : null;
    const simdi = Date.now();
    if (!M.acilistaGuncellensinMi(k, simdi) || M.canliAcik(k, simdi)) return false;
    if (!(await sessizAlinir())) return false;
    const pos = await konumAl(k.hassas);
    const hala = () => {
      const s = M.konumOku(col.get(myId)?.data);
      return M.paylasiyor(s) && s.hassas === k.hassas && !M.canliAcik(s, Date.now());
    };
    return !!(await konumYaz(col, myId, pos, { hassas: k.hassas, gecerli: hala }));
  } catch {
    return false;
  }
}

/**
 * Canlı izleme: kendi belgem canlıysa (bitiş gelecekte) watchPosition ile yazar; yazım sınırı mantik.yazilsinMi.
 * Sayfa gizlenince durur, öne gelince sürer. Süre dolunca canli alanı silinir (son konum kalır).
 * İzleme yalnız sunucu okunduktan sonra başlar (önbellekteki eski "canlı" belge yeniden açmasın).
 * -> dur()
 */
export function canliIzleyici(col, myId, { onHata = null, isaret = null } = {}) {
  let izleme = null;
  let sonIsaret;
  let izlenenHassas = null;
  let sonPos = null;
  let yaziyor = false;
  let dogrulandi = false;
  let bitti = false;
  let sureZamani = 0;
  const benim = () => M.konumOku(col.get(myId)?.data);

  function durdur() {
    if (izleme != null) navigator.geolocation?.clearWatch(izleme);
    izleme = null;
    izlenenHassas = null;
    clearTimeout(sureZamani);
  }

  function sureDoldu() {
    sirala(() => {
      const d = col.get(myId)?.data;
      return M.canliBitti(M.konumOku(d), Date.now()) ? col.put(M.canliDusur(d), myId) : null;
    }).catch(() => {});
  }

  async function yaz(pos) {
    if (yaziyor || bitti) return;
    const k = benim();
    if (!M.canliAcik(k, Date.now())) return;
    const yeni = M.konumVerisi(pos.coords, new Date(), { hassas: k.hassas });
    if (!M.yazilsinMi(k, yeni, Date.now())) return;
    yaziyor = true;
    const hala = () => {
      const s = benim();
      return M.canliAcik(s, Date.now()) && s.hassas === k.hassas && s.canli === k.canli;
    };
    try {
      await konumYaz(col, myId, pos, { hassas: k.hassas, canli: k.canli, gecerli: hala });
    } catch (e) {
      onHata?.(e);
    } finally {
      yaziyor = false;
    }
  }

  // Yerel işaret: canlıysa bitiş, değilse yok (ui.js başka sayfalarda buna bakar).
  function isaretYaz(k, simdi) {
    const v = M.canliAcik(k, simdi) ? k.canli : null;
    if (!isaret || v === sonIsaret) return;
    sonIsaret = v;
    writeStore('local', isaret, v);
  }

  function degerlendir() {
    if (bitti) return;
    const k = benim();
    const simdi = Date.now();
    isaretYaz(k, simdi);
    if (!navigator.geolocation) return;
    if (M.canliBitti(k, simdi)) { durdur(); sureDoldu(); return; }
    if (!dogrulandi || !M.canliAcik(k, simdi) || document.visibilityState === 'hidden') { durdur(); return; }
    if (izleme != null && izlenenHassas === k.hassas) return;
    durdur();
    izlenenHassas = k.hassas;
    izleme = navigator.geolocation.watchPosition((pos) => { sonPos = pos; yaz(pos); }, (e) => {
      onHata?.(e);
      if (M.konumHataTuru(e) === 'izin') durdur();
    }, M.konumSecenek(k.hassas, { canli: true }));
    const kalan = Date.parse(k.canli) - simdi;
    if (kalan < 2 ** 31 - 1) sureZamani = setTimeout(degerlendir, kalan + 500);
  }

  // Durağan cihazda watchPosition seyrek gelir: kayıt bayatlayınca son konumla (yoksa yeni alarak) yeniden yaz.
  const nabiz = setInterval(() => {
    if (izleme == null || yaziyor) return;
    const k = benim();
    if (!M.canliAcik(k, Date.now())) return;
    if (Date.now() - Date.parse(k.at) < M.YAZIM.tazeMs) return;
    if (sonPos && Date.now() - sonPos.timestamp < M.YAZIM.tazeMs) yaz(sonPos);
    else konumAl(k.hassas, M.konumSecenek(k.hassas, { canli: true })).then((p) => { sonPos = p; yaz(p); }).catch(() => {});
  }, NABIZ_MS);

  const off = col.on('change', degerlendir);
  document.addEventListener('visibilitychange', degerlendir);
  // Önce sunucudan tazele: başka cihazdan durdurulmuş paylaşımı önbellekteki "canlı" belge yeniden açmasın.
  Promise.resolve(col.refresh?.()).finally(() => { dogrulandi = true; degerlendir(); });
  return () => {
    bitti = true;
    off?.();
    document.removeEventListener('visibilitychange', degerlendir);
    clearInterval(nabiz);
    durdur();
  };
}

// ---------- Sayfa başına tek koleksiyon ve tek canlı izleyici ----------
const koleksiyonlar = new Map(); // roomId → Promise<koleksiyon>

/**
 * Sayfanın 'konum' koleksiyonu (aynı sayfada tek). Konum sayfası ve canlı servis aynı koleksiyonu paylaşır:
 * "Paylaşımı durdur" yazılınca izleyici bunu hemen görür, bayat kopyayla konum yazmaz.
 */
export function konumKoleksiyonu(room) {
  const id = room?.roomId;
  if (!koleksiyonlar.has(id)) {
    koleksiyonlar.set(id, openCollection(room, M.TUR).catch((e) => {
      koleksiyonlar.delete(id);
      throw e;
    }));
  }
  return koleksiyonlar.get(id);
}

let servis = null; // { roomId, hatalar: Set, hazir: Promise<koleksiyon> }

/**
 * Canlı izleyiciyi sayfada bir kez başlatır (ikinci çağrı aynı izleyiciyi döner; ikinci watchPosition açılmaz).
 * room: joinRoom sonucu ya da { roomId, me } (ana sayfa: ui.js). -> Promise<koleksiyon>
 */
export function canliServis(room, { onHata = null } = {}) {
  if (servis?.roomId === room?.roomId) {
    if (onHata) servis.hatalar.add(onHata);
    return servis.hazir;
  }
  const myId = room?.me?.clientId;
  const s = { roomId: room?.roomId, hatalar: new Set(onHata ? [onHata] : []) };
  s.hazir = konumKoleksiyonu(room).then((col) => {
    canliIzleyici(col, myId, {
      onHata: (e) => { for (const f of s.hatalar) { try { f(e); } catch { /* yok say */ } } },
      isaret: canliKonumAnahtari(room.roomId, myId),
    });
    return col;
  }).catch((e) => {
    if (servis === s) servis = null;
    throw e;
  });
  servis = s;
  return s.hazir;
}
