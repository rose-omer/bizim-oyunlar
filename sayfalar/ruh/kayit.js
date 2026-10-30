// Ruh hâli geçmişi yazıcısı. js/hub.js ruh seçiminde (ve not kaydında) çağırır:
//   import('../sayfalar/ruh/kayit.js').then((m) => m.ruhGecmisineYaz(room, { emoji, not?, at }))
// Belge: tür 'ruhgecmis', id '<yerel gün>-<clientId>' (günün son seçimi; aynı gün üzerine yazılır).
import { openCollection } from '../../js/core/veri.js';
import { GECMIS_TURU, gecmisId, gecmisVerisi, gunAnahtari } from './mantik.js';

// Oda başına tek koleksiyon (açık kalır: çevrimdışı yazma giden kutusundan sonra gönderilir).
// recent: 1 → açılışta yalnız en yeni belge çekilir; yazmak için geçmişin tamamı gerekmez.
const acik = new WeakMap();

function koleksiyon(room) {
  let p = acik.get(room);
  if (!p) {
    p = openCollection(room, GECMIS_TURU, { recent: 1 });
    p.catch(() => acik.delete(room));
    acik.set(room, p);
  }
  return p;
}

/** -> Promise<id | null>. Geçersiz veri ya da oda yoksa null. Ağ hatasında veri.js bekletir (hata fırlatmaz). */
export async function ruhGecmisineYaz(room, ruh) {
  const data = gecmisVerisi(ruh);
  const kim = room?.me?.clientId;
  if (!room?.roomId || !kim || !data) return null;
  const col = await koleksiyon(room);
  return col.put(data, gecmisId(gunAnahtari(data.at), kim));
}
