// Site oyunu bitince Yavrumuz jetonu yazar. Her iki oyuncunun cihazı kendi sayacı için bir kez çağırır.
// Oyun sayfası yavaşlamasın: veri ve yavru modülleri ilk ödülde yüklenir. Hata fırlatmaz; ödül oyunu bozmaz.
// Kural (tutar, hak, sınır): sayfalar/yavru/site-oyun.js.
import { me, readStore, writeStore } from './identity.js';
import { toast } from './ui.js';

const sonKey = (roomId, oyun) => `bizim.oyunodul.${roomId}.${oyun}`;

/**
 * roomId: oda; oyun: site-oyun.js SITE_OYUNLARI; sonuc: 'kazan'|'kayip'|'beraber'|'ortak';
 * ikiKisi: oyunu gerçekten iki kişi oynadı (yalnız oyun ve bilgisayara karşı oyun ödül almaz);
 * oyunNo: oyun başına benzersiz değer (varsa): sayfa yenilenince aynı oyun iki kez ödül almaz.
 * -> { eklenen, kalanHak, yama } | { hata } | null
 */
export async function oyunOdulu({ roomId, oyun, sonuc, ikiKisi = false, oyunNo = null } = {}) {
  if (!roomId || !ikiKisi) return null;
  try {
    if (oyunNo != null) {
      const no = String(oyunNo);
      if (readStore('local', sonKey(roomId, oyun)) === no) return null;
      writeStore('local', sonKey(roomId, oyun), no);
    }
    const [{ listDocs, patchDoc }, { oku, TUR, BELGE_ID }, { siteOyunYamasi }] = await Promise.all([
      import('./veri.js'), import('../../sayfalar/yavru/mantik.js'), import('../../sayfalar/yavru/site-oyun.js'),
    ]);
    const doc = (await listDocs(roomId, TUR)).find((d) => d.id === BELGE_ID && !d.deleted);
    if (!doc) return null;
    const kim = me().clientId;
    const r = siteOyunYamasi(oku(doc.data), { kim, oyun, sonuc, simdi: Date.now() });
    if (r.hata === 'hak') toast('Bu oyunun bugünkü jeton hakkı doldu 🪙');
    else if (r.hata === 'sinir') toast('Bugünkü jeton sınırı doldu. Yarın yine kazanırsın 🪙');
    if (r.hata) return r;
    await patchDoc(roomId, TUR, BELGE_ID, r.yama, kim);
    toast(`+${r.eklenen} jeton 🪙 Yavrumuz için`);
    return r;
  } catch (e) {
    console.warn('[oyun-odul]', e?.message || e);
    return null;
  }
}
