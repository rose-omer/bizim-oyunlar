// Sohbet sekmesinde okunmamış rozeti. Hafif: yalnız son 10 mesaj ve 'okundu' belgeleri okunur; koleksiyon açılmaz.
// Son sayı yerelde durur: sayfa geçişinde rozet hemen görünür, kısa sürede yeniden sorulmaz.
import { currentRoom, me, readStore, writeStore } from './identity.js';
import { pageDocs, listDocs } from './veri.js';
import { uyelikGecince } from './ui.js';
import { okunmamisSayisi, rozetMetni } from '../../sayfalar/sohbet/mantik.js';

const SAYFA = 10; // rozet en çok "9+" der; fazlası gerekmez
const TAZE_MS = 15_000; // sayfadan sayfaya geçerken yeniden sorma
const GECIKME_MS = 800; // art arda gelen mesajları topla

let aktif = null;
let sira = 0;
let zaman = 0;
let dinliyor = false;

function kimlik() {
  const roomId = currentRoom();
  if (!roomId) return null;
  try {
    return { roomId, clientId: me().clientId };
  } catch {
    return null;
  }
}

const anahtar = ({ roomId, clientId }) => `bizim.sohbet.rozet.${roomId}.${clientId}`;

function kayitOku(k) {
  try {
    return JSON.parse(readStore('local', anahtar(k))) || null;
  } catch {
    return null;
  }
}

function ciz(n) {
  const tab = document.querySelector('#tabbar .tab[data-tab="sohbet"]');
  if (!tab) return;
  tab.querySelectorAll('.tab-rozet, .tab-rozet-sr').forEach((el) => el.remove());
  const metin = rozetMetni(aktif === 'sohbet' ? 0 : n);
  if (!metin) return;
  const rozet = document.createElement('span');
  rozet.className = 'tab-rozet';
  rozet.setAttribute('aria-hidden', 'true');
  rozet.textContent = metin;
  tab.querySelector('.tab-icon')?.append(rozet);
  const sr = document.createElement('span');
  sr.className = 'sr-only tab-rozet-sr';
  sr.textContent = `, ${metin} okunmamış mesaj`;
  tab.append(sr);
}

function kaydet(k, n) {
  writeStore('local', anahtar(k), JSON.stringify({ n, at: Date.now() }));
  ciz(n);
}

async function sor(k) {
  const no = ++sira;
  try {
    const [mesajlar, okunduDocs] = await Promise.all([
      pageDocs(k.roomId, 'mesaj', { limit: SAYFA }),
      listDocs(k.roomId, 'okundu'),
    ]);
    if (no !== sira || aktif === 'sohbet') return;
    const benim = okunduDocs.find((d) => d.id === k.clientId && !d.deleted) || null;
    kaydet(k, okunmamisSayisi(mesajlar, benim, k.clientId));
  } catch (e) {
    console.debug('[rozet]', e); // ağ yok ya da yetki yok: son sayı kalır
  }
}

/** mountTabBar çağırır. active: seçili sekme. Sohbet açıksa rozet yok ve sayaç sıfırlanır. */
export function rozetKur(active) {
  aktif = active;
  const k = kimlik();
  if (!k) return;
  if (aktif === 'sohbet') {
    kaydet(k, 0);
    return;
  }
  const kayit = kayitOku(k);
  ciz(kayit?.n || 0);
  if (!dinliyor) {
    dinliyor = true;
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') rozetTazele();
    });
  }
  // Kayıt tazeyse hemen sorma; ama geçiş sırasında gelen mesaj kaçmasın diye süre dolunca sor.
  planla(Math.max(0, TAZE_MS - (Date.now() - (kayit?.at || 0))));
}

/** Yeni mesaj gelince ya da sayfa öne gelince: kısa gecikmeyle yeniden sorar. */
export function rozetTazele() {
  planla(GECIKME_MS);
}

function planla(ms) {
  clearTimeout(zaman);
  zaman = setTimeout(() => {
    const k = kimlik();
    if (k && aktif !== 'sohbet') uyelikGecince(k.roomId, () => sor(k), 'rozet');
  }, ms);
}
