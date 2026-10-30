// Edge Function istek işleyicileri. Ortam (env) ve fetch dışarıdan verilir: Deno'da gerçekleri,
// Node testlerinde sahteleri. index.ts dosyaları yalnız bunları Deno.serve'e bağlar.
// İki kanal: Web Push (push_sub, VAPID) ve FCM (fcm_sub, FCM_SERVICE_ACCOUNT; yoksa atlanır).
import {
  istegiDogrula, pushYuku, endpointIzinli, kokIzinli, corsBasliklari, esitMi, publishableAnahtarlar,
  servisAnahtari, restBasliklari, istanbulGunu, gunNo, odaPlani, odayaGore,
} from './mantik.js';
import { parseDay } from './gunler.js';
import { vapidHazirla, pushGonder } from './webpush.js';
import { fcmHesabi, erisimBelirteci, fcmGonder } from './fcm.js';

const VARSAYILAN_SUBJECT = 'https://rose-omer.github.io/bizim-oyunlar/';
const GOVDE_MAX = 4096;
const ACIL_TURLER = new Set(['mesaj', 'dokunus']);
const ANAHTAR_ONBELLEK_MS = 5 * 60_000;

/** PostgREST RPC çağırıcı (servis anahtarıyla; RLS'yi aşar). Hata: e.code = Postgres kodu. */
export function rpcIstemcisi(env, fetchFn = fetch) {
  const url = String(env('SUPABASE_URL') || '').replace(/\/+$/, '');
  const anahtar = servisAnahtari(env);
  if (!url || !anahtar) throw new Error('SUPABASE_URL ya da servis anahtarı yok');
  return async (ad, args = {}) => {
    const res = await fetchFn(`${url}/rest/v1/rpc/${ad}`, {
      method: 'POST', headers: restBasliklari(anahtar), body: JSON.stringify(args),
    });
    const metin = await res.text();
    let veri = null;
    try { veri = metin ? JSON.parse(metin) : null; } catch { /* düz metin hata */ }
    if (!res.ok) {
      const e = new Error(veri?.message || `rpc ${ad}: HTTP ${res.status}`);
      e.code = veri?.code;
      e.status = res.status;
      throw e;
    }
    return veri;
  };
}

export const SAYFA = 500;
const SAYFA_MAX = 2000; // 1 milyon satır: imleç ilerlemezse sonsuz döngü olmasın

/**
 * Sayfalı RPC'nin tüm satırları (PostgREST en çok 1000 satır döner). Her çağrı p_limit = boyut alır;
 * sonraki sayfa imlec(son satır) argümanlarıyla istenir. Sayfa boyuttan kısaysa biter.
 */
export async function sayfala(rpc, ad, args, imlec, boyut = SAYFA) {
  const hepsi = [];
  let sonraki = {};
  for (let i = 0; i < SAYFA_MAX; i++) {
    const sayfa = (await rpc(ad, { ...args, ...sonraki, p_limit: boyut })) || [];
    hepsi.push(...sayfa);
    if (sayfa.length < boyut) return hepsi;
    sonraki = imlec(sayfa[sayfa.length - 1]);
  }
  throw new Error(`rpc ${ad}: sayfa sınırı aşıldı`);
}

let vapidOnbellek = null;
/** VAPID anahtarları (secret'lardan). Bir kez içe aktarılır. */
export function vapidAl(env) {
  const publicKey = env('VAPID_PUBLIC_KEY');
  const privateKey = env('VAPID_PRIVATE_KEY');
  const subject = env('VAPID_SUBJECT') || VARSAYILAN_SUBJECT;
  if (!publicKey || !privateKey) return Promise.reject(new Error('VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY yok'));
  const k = `${publicKey}|${subject}`;
  if (vapidOnbellek?.k !== k) vapidOnbellek = { k, v: vapidHazirla({ publicKey, privateKey, subject }) };
  return vapidOnbellek.v;
}

/** isler için fn'i çalıştırır; en çok `esZamanli` iş aynı anda. -> sonuçlar */
async function havuz(isler, fn, esZamanli = 6) {
  const sonuclar = [];
  let i = 0;
  const isci = async () => {
    while (i < isler.length) sonuclar.push(await fn(isler[i++]));
  };
  await Promise.all(Array.from({ length: Math.min(esZamanli, isler.length) }, isci));
  return sonuclar;
}

/** isler: [{ abone, yuk, urgency? }] → sonuçlar (en çok `esZamanli` istek aynı anda). */
export function topluGonder(isler, vapid, { fetchFn = fetch, esZamanli = 6 } = {}) {
  return havuz(isler, (is) => pushGonder(is.abone, is.yuk, vapid, { fetchFn, urgency: is.urgency || 'normal' }), esZamanli);
}

/**
 * FCM_SERVICE_ACCOUNT → hesap | null. Tanımlı değilse ya da bozuksa null (bozuksa günlüğe yazılır):
 * FCM atlanır, Web Push sürer.
 */
export function fcmAyari(env, etiket) {
  try {
    return fcmHesabi(env);
  } catch (e) {
    console.error(`[${etiket}] FCM ayarı`, e.message);
    return null;
  }
}

/**
 * FCM işleri: [{ token, mesaj }] → sonuçlar. Erişim belirteci alınamazsa (ayar sorunu) boş döner:
 * belirteçlerin hata sayacı artmaz.
 */
export async function fcmToplu(isler, hesap, { fetchFn = fetch, esZamanli = 6 } = {}) {
  if (!hesap || !isler.length) return [];
  let erisim;
  try {
    erisim = await erisimBelirteci(hesap, { fetchFn });
  } catch (e) {
    console.error('[fcm]', e.message);
    return [];
  }
  return havuz(isler, (is) => fcmGonder(is.token, is.mesaj, { hesap, erisim, fetchFn }), esZamanli);
}

/**
 * push_sonuc / fcm_sonuc RPC argümanları. reddedilen = izinli olmayan adresler (silinir).
 * anahtar: sonuçtaki kimlik alanı ('endpoint' ya da FCM için 'token'). yetki sorunu olan FCM sonucu yazılmaz.
 */
export function sonucOzeti(sonuclar, reddedilen = [], anahtar = 'endpoint') {
  const yazilacak = sonuclar.filter((s) => !s.yetki);
  return {
    p_ok: yazilacak.filter((s) => s.ok).map((s) => s[anahtar]),
    p_gone: [...yazilacak.filter((s) => s.gone).map((s) => s[anahtar]), ...reddedilen],
    p_fail: yazilacak.filter((s) => !s.ok && !s.gone).map((s) => s[anahtar]),
  };
}

async function sonucYaz(rpc, ad, ozet) {
  if (!ozet.p_ok.length && !ozet.p_gone.length && !ozet.p_fail.length) return;
  try {
    await rpc(ad, ozet);
  } catch (e) {
    console.error(`[${ad}]`, e.message);
  }
}

/** İki kanalın özetlerinden yanıt sayıları. */
function sayilar(...ozetler) {
  const n = (k) => ozetler.reduce((t, o) => t + o[k].length, 0);
  return { gonderilen: n('p_ok'), silinen: n('p_gone'), hatali: n('p_fail') };
}

const jsonYanit = (status, veri, basliklar = {}) => new Response(JSON.stringify(veri), {
  status, headers: { ...basliklar, 'Content-Type': 'application/json; charset=utf-8' },
});

/**
 * POST { room, from, tur, baslik, metin, url, anahtar? } → odadaki diğer cihazlara Web Push ve FCM.
 * Başlık `apikey` = publishable anahtar. Köken: GitHub Pages ya da localhost.
 * `anahtar` = gönderen cihazın anahtarı (push_hedef ve fcm_hedef'e p_anahtar). Yetki yoksa (42501) 403.
 * FCM kısmı ayar ya da veritabanı sorununda düşer (günlüğe yazılır); Web Push yine gider.
 */
export function bildirIsleyici({ env, fetchFn = fetch }) {
  return async (req) => {
    const origin = req.headers.get('origin');
    const cors = corsBasliklari(origin);
    const yanit = (status, veri) => jsonYanit(status, veri, cors);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (req.method !== 'POST') return yanit(405, { hata: 'yalnız POST' });
    if (origin && !kokIzinli(origin)) return yanit(403, { hata: 'bu adresten izin yok' });

    const anahtarlar = publishableAnahtarlar(env);
    if (!anahtarlar.length) return yanit(500, { hata: 'sunucu ayarı eksik' });
    const verilen = req.headers.get('apikey') || '';
    if (!anahtarlar.some((a) => esitMi(a, verilen))) return yanit(401, { hata: 'geçersiz anahtar' });

    if (Number(req.headers.get('content-length') || 0) > GOVDE_MAX) return yanit(413, { hata: 'istek çok büyük' });
    const metin = await req.text();
    if (metin.length > GOVDE_MAX) return yanit(413, { hata: 'istek çok büyük' });
    let govde;
    try { govde = JSON.parse(metin); } catch { return yanit(400, { hata: 'JSON değil' }); }
    const { deger, hata } = istegiDogrula(govde);
    if (hata) return yanit(400, { hata });

    let rpc;
    let vapid;
    try {
      rpc = rpcIstemcisi(env, fetchFn);
      vapid = await vapidAl(env);
    } catch (e) {
      console.error('[bildir] ayar', e.message);
      return yanit(500, { hata: 'sunucu ayarı eksik' });
    }

    // p_anahtar yalnız verilince gider: eski şema (push_hedef iki parametreli) bozulmasın.
    const hedefArgs = { p_room: deger.room, p_from: deger.from };
    if (deger.anahtar) hedefArgs.p_anahtar = deger.anahtar;
    let hedefler;
    try {
      hedefler = (await rpc('push_hedef', hedefArgs)) || [];
    } catch (e) {
      if (e.code === '54000') return yanit(429, { hata: 'çok fazla bildirim, biraz bekle' });
      if (e.code === '42501') return yanit(403, { hata: 'yetki yok' });
      console.error('[bildir] push_hedef', e.message);
      return yanit(502, { hata: 'veritabanına ulaşılamadı' });
    }
    const fcm = fcmAyari(env, 'bildir');
    let fcmHedefler = [];
    if (fcm) {
      try {
        fcmHedefler = (await rpc('fcm_hedef', hedefArgs)) || [];
      } catch (e) {
        if (e.code === '54000') return yanit(429, { hata: 'çok fazla bildirim, biraz bekle' });
        if (e.code === '42501') return yanit(403, { hata: 'yetki yok' });
        console.error('[bildir] fcm_hedef', e.message);
      }
    }

    const yuk = pushYuku(deger);
    const urgency = ACIL_TURLER.has(deger.tur) ? 'high' : 'normal';
    const reddedilen = hedefler.filter((h) => !endpointIzinli(h.endpoint)).map((h) => h.endpoint);
    const isler = hedefler.filter((h) => endpointIzinli(h.endpoint)).map((abone) => ({ abone, yuk, urgency }));
    const fcmIsler = fcmHedefler.map((h) => ({ token: h.token, mesaj: deger }));
    const [webSonuc, fcmSonuc] = await Promise.all([
      topluGonder(isler, vapid, { fetchFn }),
      fcmToplu(fcmIsler, fcm, { fetchFn }),
    ]);
    const ozet = sonucOzeti(webSonuc, reddedilen);
    const fcmOzet = sonucOzeti(fcmSonuc, [], 'token');
    await sonucYaz(rpc, 'push_sonuc', ozet);
    await sonucYaz(rpc, 'fcm_sonuc', fcmOzet);
    return yanit(200, { ok: true, ...sayilar(ozet, fcmOzet) });
  };
}

/**
 * hatirlat'ın beklediği anahtar: veritabanından (RPC hatirlat_anahtar → vault; 5 dk önbellek),
 * okunamazsa HATIRLAT_ANAHTAR secret'ı. Önbellek işleyiciye özel (Deno'da yalıtım ömrünce yaşar).
 */
export function anahtarKaynagi(env, fetchFn = fetch, saat = () => Date.now()) {
  let onbellek = null;
  return async () => {
    const t = saat();
    if (onbellek && onbellek.son > t) return onbellek.deger;
    try {
      const deger = await rpcIstemcisi(env, fetchFn)('hatirlat_anahtar');
      if (typeof deger === 'string' && deger) {
        onbellek = { deger, son: t + ANAHTAR_ONBELLEK_MS };
        return deger;
      }
    } catch (e) {
      console.error('[hatirlat] anahtar okunamadı', e.message);
    }
    return env('HATIRLAT_ANAHTAR') || '';
  };
}

/**
 * Günlük hatırlatma (pg_cron çağırır). Başlık `x-hatirlat-anahtar` = vault'taki 'hatirlat_anahtar'
 * (anahtarKaynagi). Gövde: { slot: 'sabah' | 'aksam', bugun?: 'YYYY-MM-DD' (elle deneme) }.
 * Aynı gün aynı vakit bir oda bir kez alır (hatirlat_isaretle). Web Push aboneleri ve FCM belirteçleri.
 */
export function hatirlatIsleyici({ env, fetchFn = fetch, simdi = () => new Date() }) {
  const anahtar = anahtarKaynagi(env, fetchFn, () => simdi().getTime());
  return async (req) => {
    if (req.method !== 'POST') return jsonYanit(405, { hata: 'yalnız POST' });
    const beklenen = await anahtar();
    if (!beklenen) return jsonYanit(500, { hata: 'hatırlatma anahtarı yok' });
    if (!esitMi(req.headers.get('x-hatirlat-anahtar'), beklenen)) return jsonYanit(401, { hata: 'geçersiz anahtar' });

    let govde = {};
    try { govde = (await req.json()) || {}; } catch { /* boş gövde */ }
    const an = simdi();
    const saat = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Istanbul', hour: '2-digit', hourCycle: 'h23' }).format(an));
    const slot = govde.slot === 'sabah' || govde.slot === 'aksam' ? govde.slot : (saat >= 15 ? 'aksam' : 'sabah');
    const bugun = typeof govde.bugun === 'string' && parseDay(govde.bugun) ? govde.bugun : istanbulGunu(an);

    let rpc;
    let vapid;
    try {
      rpc = rpcIstemcisi(env, fetchFn);
      vapid = await vapidAl(env);
    } catch (e) {
      console.error('[hatirlat] ayar', e.message);
      return jsonYanit(500, { hata: 'sunucu ayarı eksik' });
    }

    try {
      const webAboneler = await sayfala(rpc, 'push_abonelikler', {}, (s) => ({ p_after: s.endpoint }));
      const fcm = fcmAyari(env, 'hatirlat');
      let fcmAboneler = [];
      if (fcm) {
        try {
          fcmAboneler = await sayfala(rpc, 'fcm_abonelikler', {}, (s) => ({ p_after: s.token }));
        } catch (e) {
          console.error('[hatirlat] fcm_abonelikler', e.message);
        }
      }
      // Satır: Web Push { room, client, endpoint, p256dh, auth } ya da FCM { room, client, token }.
      const odalar = odayaGore([...webAboneler, ...fcmAboneler]);
      const sonuc = { ok: true, slot, bugun, oda: 0, gonderilen: 0, silinen: 0, hatali: 0 };
      if (!odalar.size) return jsonYanit(200, sonuc);
      const belgeler = odayaGore(await sayfala(rpc, 'hatirlat_belgeler', slot === 'sabah'
        ? { p_kinds: ['gun', 'kisi', 'cift'] }
        : { p_kinds: ['gs'], p_gs_gun: gunNo(bugun) }, (d) => ({ p_after: [d.room, d.kind, d.id] })));

      const planlar = new Map();
      for (const [room, aboneler] of odalar) {
        const plan = odaPlani({ slot, bugun, belgeler: belgeler.get(room) || [], aboneler });
        if (plan.length) planlar.set(room, plan);
      }
      // Tek çağrıda işaretle; yalnız bugün bu vakitte ilk kez işaretlenen odalara gönderilir.
      const isaretli = planlar.size
        ? new Set((await rpc('hatirlat_isaretle', { p_rooms: [...planlar.keys()], p_gun: bugun, p_slot: slot })) || [])
        : new Set();
      const isler = [];
      const fcmIsler = [];
      for (const [room, plan] of planlar) {
        if (!isaretli.has(room)) continue;
        sonuc.oda++;
        for (const { abone, mesaj } of plan) {
          if (abone.token) fcmIsler.push({ token: abone.token, mesaj });
          else if (endpointIzinli(abone.endpoint)) isler.push({ abone, yuk: pushYuku(mesaj) });
        }
      }
      const [webSonuc, fcmSonuc] = await Promise.all([
        topluGonder(isler, vapid, { fetchFn }),
        fcmToplu(fcmIsler, fcm, { fetchFn }),
      ]);
      const ozet = sonucOzeti(webSonuc);
      const fcmOzet = sonucOzeti(fcmSonuc, [], 'token');
      await sonucYaz(rpc, 'push_sonuc', ozet);
      await sonucYaz(rpc, 'fcm_sonuc', fcmOzet);
      Object.assign(sonuc, sayilar(ozet, fcmOzet));
      console.log('[hatirlat]', JSON.stringify(sonuc));
      return jsonYanit(200, sonuc);
    } catch (e) {
      console.error('[hatirlat]', e.message);
      return jsonYanit(502, { hata: 'veritabanına ulaşılamadı' });
    }
  };
}
