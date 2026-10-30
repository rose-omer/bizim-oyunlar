// Uzun türleri (mesaj, dokunuş) geriye doğru yükleme: recent koleksiyonu + loadOlder (DOM yok; Node'da test edilir).
import { MESAJ_SINIRI } from './mantik.js';

const zaman = (s) => { const t = Date.parse(s); return Number.isFinite(t) ? t : NaN; };

/**
 * col = openCollection(room, tür, { recent }) sonucu. En eski yüklü belge `kadar` (ms) anından eskiye inene,
 * daha eski kalmayana, `sinir` belgeye ya da `yeter(docs)` doğru olana dek loadOlder çağırır.
 * ilerleme({ sayi, enEski }) her sayfadan sonra. -> { docs, tamam, asildi }
 * tamam: gereken her şey yüklendi. asildi: sınır yüzünden durdu (daha eskisi var).
 */
export async function geriYukle(col, { kadar = 0, sinir = MESAJ_SINIRI, sayfa = 200, ilerleme = null, yeter = null } = {}) {
  let docs = col.all();
  const gerek = () => col.hasOlder() && !(docs.length && zaman(docs[0].created_at) < kadar) && !(yeter && yeter(docs));
  while (gerek() && docs.length < sinir) {
    const n = await col.loadOlder(Math.min(sayfa, sinir - docs.length));
    docs = col.all();
    ilerleme?.({ sayi: docs.length, enEski: docs[0]?.created_at || null });
    if (!n) break;
  }
  const eksik = gerek();
  return { docs, tamam: !eksik, asildi: eksik && docs.length >= sinir };
}

/** İlerleme çubuğu: şimdiden `kadar` anına zamanca ne kadar inildi (0–1). */
export function ilerlemeOrani(enEski, kadar, simdi = Date.now()) {
  const t = zaman(enEski);
  if (Number.isNaN(t)) return 0;
  if (t <= kadar) return 1;
  return Math.max(0, Math.min(1, (simdi - t) / (simdi - kadar)));
}
