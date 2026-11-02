// Yavrumuz günlük ortak görev: saf mantık (DOM yok, Node'da test edilir).
// Görev: oda + yerel günden tohumlu seçim (iki cihaz aynı görevi görür). Yumurtada görev yok.
// İlerleme bakım günlüğünden ('yavrubakim' { eylem, kim, at }) yalnız o yerel günün kayıtlarıyla hesaplanır.
// Ödül: iki kişiye GOREV_BONUS puan + gün işareti. Belgede alan: gorev: { [gün]: { id, at } } (son GOREV_TUT gün).
// Yama anahtarları en çok iki düzey: 'puan.<clientId>', 'gorev.<YYYY-MM-DD>'.
// veri: ham belge verisi (doc.data) ya da mantik.js oku() sonucu (oku 'gorev' alanını taşır).
import { toDay, parseDay } from '../../js/core/gunler.js';
import { gunNo, soruSecici } from '../gunun-sorusu/mantik.js';

export const GOREV_BONUS = 2; // kişi başı
export const GOREV_TUT = 7; // belgede tutulan gün işareti

const BESLE = ['mama', 'meyve', 'tatli'];
// Bakım sayılan eylemler (uyandır sayılmaz: uyut/uyandır döngüsüyle görev bitmesin).
const BAKIM = [...BESLE, 'oyna', 'yika', 'sev', 'uyut', 'lazimlik'];

/**
 * Koşul türleri:
 *   herkes: { eylemler, adet }  her kişi en az `adet` kez
 *   toplam: { eylemler, adet }  birlikte `adet` kez, ikisi de en az bir kez
 *   ayri:   { roller: [l1, l2] } biri l1'den, öteki l2'den (farklı kişiler)
 */
export const GOREVLER = [
  { id: 'ikisi-besle', metin: 'Bugün ikiniz de besleyin', emoji: '🍼', kosul: { tur: 'herkes', eylemler: BESLE, adet: 1 } },
  { id: 'ikisi-sev', metin: 'İkiniz de bir kez sevin', emoji: '🤍', kosul: { tur: 'herkes', eylemler: ['sev'], adet: 1 } },
  { id: 'ikisi-sev-3', metin: 'İkiniz de üçer kez sevin', emoji: '💕', kosul: { tur: 'herkes', eylemler: ['sev'], adet: 3 } },
  { id: 'ikisi-oyna', metin: 'İkiniz de onunla oynayın', emoji: '⚽', kosul: { tur: 'herkes', eylemler: ['oyna'], adet: 1 } },
  { id: 'ikisi-meyve', metin: 'İkiniz de ona meyve verin', emoji: '🍎', kosul: { tur: 'herkes', eylemler: ['meyve'], adet: 1 } },
  { id: 'birlikte-3', metin: 'Birlikte 3 bakım yapın', emoji: '🤝', kosul: { tur: 'toplam', eylemler: BAKIM, adet: 3 } },
  { id: 'birlikte-6', metin: 'Birlikte 6 bakım yapın', emoji: '✨', kosul: { tur: 'toplam', eylemler: BAKIM, adet: 6 } },
  { id: 'yika-oyna', metin: 'Biri yıkasın, biri oynasın', emoji: '🫧', kosul: { tur: 'ayri', roller: [['yika'], ['oyna']] } },
  { id: 'besle-yika', metin: 'Biri beslesin, biri yıkasın', emoji: '🛁', kosul: { tur: 'ayri', roller: [BESLE, ['yika']] } },
  { id: 'uyut-sev', metin: 'Biri uyutsun, biri sevsin', emoji: '🌙', kosul: { tur: 'ayri', roller: [['uyut'], ['sev']] } },
];

const secici = (roomId) => soruSecici(GOREVLER, `yavrugorev:${roomId ?? ''}`);

/** Odanın o günkü görevi (iki cihazda aynı). gun: 'YYYY-MM-DD' ya da Date (yerel gün). Geçersizse null. */
export function gununGorevi(roomId, gun) {
  const no = gunNo(gun);
  return Number.isFinite(no) ? secici(roomId)(no) : null;
}

/** Kayıt (belge ya da düz { eylem, kim, at }) -> { eylem, kim, gun } | null. Silinmiş ve bozuk kayıt null. */
function kayitOku(x) {
  if (!x || x.deleted) return null;
  const d = x.data && typeof x.data === 'object' ? x.data : x;
  const t = typeof d.at === 'string' ? Date.parse(d.at) : NaN;
  if (typeof d.eylem !== 'string' || typeof d.kim !== 'string' || !Number.isFinite(t)) return null;
  return { eylem: d.eylem, kim: d.kim, gun: toDay(new Date(t)) };
}

/** Tekil, boş olmayan kişi kimlikleri. */
const kisiListesi = (kisiler) => [...new Set((Array.isArray(kisiler) ? kisiler : []).filter((x) => typeof x === 'string' && x))];

/**
 * Görevin o günkü durumu. kisiler: çiftin clientId'leri [ben, partner]; başkasının kaydı sayılmaz.
 * -> { tamam, ilerleme: { n, gerek }, kisiBasi: { [clientId]: ilgili kayıt sayısı } } | null (görev yok)
 * İki kişi yoksa görev tamamlanmaz.
 */
export function gorevDurumu(gorev, bakimKayitlari, { gun, kisiler }) {
  if (!gorev?.kosul) return null;
  const kosul = gorev.kosul;
  const gunStr = gun instanceof Date ? toDay(gun) : gun;
  const kim = kisiListesi(kisiler);
  const roller = kosul.tur === 'ayri' ? kosul.roller : [kosul.eylemler];
  const ilgili = new Set(roller.flat());
  // sayi[kişi][rol indeksi]
  const sayi = Object.fromEntries(kim.map((id) => [id, roller.map(() => 0)]));
  const kisiBasi = Object.fromEntries(kim.map((id) => [id, 0]));
  for (const x of Array.isArray(bakimKayitlari) ? bakimKayitlari : []) {
    const r = kayitOku(x);
    if (!r || r.gun !== gunStr || !(r.kim in sayi) || !ilgili.has(r.eylem)) continue;
    kisiBasi[r.kim]++;
    roller.forEach((l, i) => { if (l.includes(r.eylem)) sayi[r.kim][i]++; });
  }

  let n;
  let gerek;
  if (kosul.tur === 'herkes') {
    gerek = kosul.adet * 2;
    n = kim.reduce((t, id) => t + Math.min(kisiBasi[id], kosul.adet), 0);
  } else if (kosul.tur === 'toplam') {
    gerek = kosul.adet;
    const toplam = kim.reduce((t, id) => t + kisiBasi[id], 0);
    const ikisi = kim.length >= 2 && kim.every((id) => kisiBasi[id] > 0);
    n = Math.min(toplam, ikisi ? gerek : gerek - 1);
  } else {
    gerek = 2;
    const yapan = (i) => kim.filter((id) => sayi[id][i] > 0);
    const [r1, r2] = [yapan(0), yapan(1)];
    const eslesir = r1.some((a) => r2.some((b) => a !== b));
    n = eslesir ? 2 : r1.length || r2.length ? 1 : 0;
  }
  if (kim.length < 2) n = Math.min(n, gerek - 1);
  return { tamam: n >= gerek, ilerleme: { n, gerek }, kisiBasi };
}

const nesne = (x) => (x && typeof x === 'object' && !Array.isArray(x) ? x : {});

/** O günün ödülü verildi mi? veri: ham belge verisi (doc.data). */
export function odullendiMi(veri, gun) {
  return Object.hasOwn(nesne(nesne(veri).gorev), gun);
}

/**
 * Görev ödülü yaması (görev tamamlandıktan sonra çağrılır). veri: ham belge verisi (doc.data).
 * -> { 'puan.<A>', 'puan.<B>', 'gorev.<gün>': { id, at }, 'gorev.<eski gün>': null ... } | null
 * null: yumurta, belge yok, iki kişi yok, gün geçersiz ya da o gün zaten ödüllendi.
 * Çift cihaz yarışı: puan mutlak değerle yazılır; aynı tabandan iki yama aynı sonucu verir (bonus bir kez).
 */
export function odulYamasi(veri, gun, kisiler, { gorevId = null, simdi = Date.now() } = {}) {
  const v = nesne(veri);
  const kim = kisiListesi(kisiler);
  if (!veri || !v.asama || v.asama === 'yumurta' || kim.length < 2 || !parseDay(gun)) return null;
  if (odullendiMi(v, gun)) return null;
  const yama = {};
  const puan = nesne(v.puan);
  for (const id of kim) yama[`puan.${id}`] = (Number.isFinite(puan[id]) && puan[id] > 0 ? puan[id] : 0) + GOREV_BONUS;
  yama[`gorev.${gun}`] = { id: gorevId, at: new Date(simdi).toISOString() };
  const eski = Object.keys(nesne(v.gorev)).sort();
  for (const g of eski.slice(0, Math.max(0, eski.length - (GOREV_TUT - 1)))) yama[`gorev.${g}`] = null;
  return yama;
}

/**
 * Arayüz için tek çağrı. veri: ham belge verisi. Yumurtada ya da belge yokken null.
 * -> { gorev, tamam, ilerleme, kisiBasi, odullendi }
 */
export function gorevOzeti(veri, { roomId, gun, kayitlar, kisiler }) {
  const v = nesne(veri);
  if (!veri || !v.asama || v.asama === 'yumurta') return null;
  const gorev = gununGorevi(roomId, gun);
  const d = gorevDurumu(gorev, kayitlar, { gun, kisiler });
  if (!d) return null;
  return { gorev, ...d, odullendi: odullendiMi(v, gun) };
}
