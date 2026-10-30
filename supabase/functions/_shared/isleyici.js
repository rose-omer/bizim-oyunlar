// Edge Function istek işleyicileri. Ortam (env) ve fetch dışarıdan verilir: Deno'da gerçekleri,
// Node testlerinde sahteleri. index.ts dosyaları yalnız bunları Deno.serve'e bağlar.
import {
  istegiDogrula, pushYuku, endpointIzinli, kokIzinli, corsBasliklari, esitMi, publishableAnahtarlar,
  servisAnahtari, restBasliklari, istanbulGunu, gunNo, odaPlani, odayaGore,
} from './mantik.js';
import { parseDay } from './gunler.js';
import { vapidHazirla, pushGonder } from './webpush.js';

const VARSAYILAN_SUBJECT = 'https://rose-omer.github.io/bizim-oyunlar/';
const GOVDE_MAX = 4096;
const ACIL_TURLER = new Set(['mesaj', 'dokunus']);

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

/** isler: [{ abone, yuk, urgency? }] → sonuçlar (en çok `esZamanli` istek aynı anda). */
export async function topluGonder(isler, vapid, { fetchFn = fetch, esZamanli = 6 } = {}) {
  const sonuclar = [];
  let i = 0;
  const isci = async () => {
    while (i < isler.length) {
      const is = isler[i++];
      sonuclar.push(await pushGonder(is.abone, is.yuk, vapid, { fetchFn, urgency: is.urgency || 'normal' }));
    }
  };
  await Promise.all(Array.from({ length: Math.min(esZamanli, isler.length) }, isci));
  return sonuclar;
}

/** push_sonuc RPC argümanları. reddedilen = izinli olmayan adresler (silinir). */
export function sonucOzeti(sonuclar, reddedilen = []) {
  return {
    p_ok: sonuclar.filter((s) => s.ok).map((s) => s.endpoint),
    p_gone: [...sonuclar.filter((s) => s.gone).map((s) => s.endpoint), ...reddedilen],
    p_fail: sonuclar.filter((s) => !s.ok && !s.gone).map((s) => s.endpoint),
  };
}

async function sonucYaz(rpc, ozet) {
  if (!ozet.p_ok.length && !ozet.p_gone.length && !ozet.p_fail.length) return;
  try {
    await rpc('push_sonuc', ozet);
  } catch (e) {
    console.error('[push_sonuc]', e.message);
  }
}

const jsonYanit = (status, veri, basliklar = {}) => new Response(JSON.stringify(veri), {
  status, headers: { ...basliklar, 'Content-Type': 'application/json; charset=utf-8' },
});

/**
 * POST { room, from, tur, baslik, metin, url } → odadaki diğer cihazlara Web Push.
 * Başlık `apikey` = publishable anahtar. Köken: GitHub Pages ya da localhost.
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

    let hedefler;
    try {
      hedefler = (await rpc('push_hedef', { p_room: deger.room, p_from: deger.from })) || [];
    } catch (e) {
      if (e.code === '54000') return yanit(429, { hata: 'çok fazla bildirim, biraz bekle' });
      console.error('[bildir] push_hedef', e.message);
      return yanit(502, { hata: 'veritabanına ulaşılamadı' });
    }

    const yuk = pushYuku(deger);
    const urgency = ACIL_TURLER.has(deger.tur) ? 'high' : 'normal';
    const reddedilen = hedefler.filter((h) => !endpointIzinli(h.endpoint)).map((h) => h.endpoint);
    const isler = hedefler.filter((h) => endpointIzinli(h.endpoint)).map((abone) => ({ abone, yuk, urgency }));
    const ozet = sonucOzeti(await topluGonder(isler, vapid, { fetchFn }), reddedilen);
    await sonucYaz(rpc, ozet);
    return yanit(200, { ok: true, gonderilen: ozet.p_ok.length, silinen: ozet.p_gone.length, hatali: ozet.p_fail.length });
  };
}

/**
 * Günlük hatırlatma (pg_cron çağırır). Başlık `x-hatirlat-anahtar` = HATIRLAT_ANAHTAR secret'ı.
 * Gövde: { slot: 'sabah' | 'aksam', bugun?: 'YYYY-MM-DD' (elle deneme) }.
 * Aynı gün aynı vakit bir oda bir kez alır (hatirlat_isaretle).
 */
export function hatirlatIsleyici({ env, fetchFn = fetch, simdi = () => new Date() }) {
  return async (req) => {
    if (req.method !== 'POST') return jsonYanit(405, { hata: 'yalnız POST' });
    const beklenen = env('HATIRLAT_ANAHTAR');
    if (!beklenen) return jsonYanit(500, { hata: 'HATIRLAT_ANAHTAR yok' });
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
      const odalar = odayaGore(await sayfala(rpc, 'push_abonelikler', {}, (s) => ({ p_after: s.endpoint })));
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
      for (const [room, plan] of planlar) {
        if (!isaretli.has(room)) continue;
        sonuc.oda++;
        for (const { abone, mesaj } of plan) {
          if (endpointIzinli(abone.endpoint)) isler.push({ abone, yuk: pushYuku(mesaj) });
        }
      }
      const ozet = sonucOzeti(await topluGonder(isler, vapid, { fetchFn }));
      await sonucYaz(rpc, ozet);
      Object.assign(sonuc, { gonderilen: ozet.p_ok.length, silinen: ozet.p_gone.length, hatali: ozet.p_fail.length });
      console.log('[hatirlat]', JSON.stringify(sonuc));
      return jsonYanit(200, sonuc);
    } catch (e) {
      console.error('[hatirlat]', e.message);
      return jsonYanit(502, { hata: 'veritabanına ulaşılamadı' });
    }
  };
}
