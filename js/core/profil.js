// Çift profili (veri.js üstünde):
//   tür 'kisi', id = clientId → { ad, foto?, dogum?: 'YYYY-MM-DD', renk? }  (her cihaz kendi belgesini yazar)
//   tür 'cift', id = 'cift'   → { baslangic?: 'YYYY-MM-DD', bulusma?: ISO, kapak?: url, ad?: string }
import { openCollection } from './veri.js';

/** Saf: kişi belgelerinden partneri seç (benden farklı, en son güncellenen). */
export function pickPartnerDoc(docs, myId, presenceId = null) {
  const others = (docs || []).filter((d) => d.id !== myId);
  if (presenceId) {
    const p = others.find((d) => d.id === presenceId);
    if (p) return p;
  }
  return others.sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at))[0] || null;
}

/**
 * -> { ben(), partner(), cift(), setBen(patch), setCift(patch), on('change', fn), close() }
 * ben()/partner() -> { clientId, ad, foto, dogum, renk } | null (partner yoksa null)
 */
export async function openProfil(room) {
  const myId = room.me.clientId;
  const [kisi, cift] = await Promise.all([openCollection(room, 'kisi'), openCollection(room, 'cift')]);
  let presenceId = room.partner?.()?.clientId || null;
  const listeners = new Set();
  const emit = () => { for (const fn of listeners) { try { fn(); } catch (e) { console.error(e); } } };

  const asPerson = (d) => (d ? { clientId: d.id, ad: '', ...d.data } : null);
  const api = {
    ben: () => asPerson(kisi.get(myId)) || { clientId: myId, ad: room.me.name || '' },
    partner: () => asPerson(pickPartnerDoc(kisi.all(), myId, presenceId)),
    cift: () => ({ ...(cift.get('cift')?.data || {}) }),
    setBen: (patch) => kisi.put({ ...(kisi.get(myId)?.data || {}), ...patch }, myId),
    setCift: (patch) => cift.put({ ...(cift.get('cift')?.data || {}), ...patch }, 'cift'),
    on(type, fn) {
      if (type !== 'change') return () => {};
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    close() { kisi.close(); cift.close(); offP?.(); listeners.clear(); },
    kisiler: kisi,
    ciftKoleksiyon: cift,
  };

  kisi.on('change', emit);
  cift.on('change', emit);
  const offP = room.on?.('presence', (p) => {
    const id = p?.clientId || null;
    if (id && id !== presenceId) { presenceId = id; emit(); }
  });

  // Adım değiştiyse kendi belgemi güncelle (partner çevrimdışıyken de adımı görsün).
  const myName = room.me.name || '';
  if (myName && kisi.get(myId)?.data?.ad !== myName) api.setBen({ ad: myName }).catch(() => {});
  return api;
}
