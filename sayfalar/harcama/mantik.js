// Ortak harcamalar: saf mantık (DOM yok, Node'da test edilir). Para hep kuruş, hep tamsayı.
// Veri: tür 'harcama', id uuid,
//   data { baslik, tutar: kuruş, odeyen: clientId, pay: { [clientId]: ağırlık }, tarih: gün, kategori, hesaplasma?: true }
// Pay ağırlıktır (1/1 = eşit, 70/30 = yüzde). Yuvarlama kuralı: ödemeyenin payı aşağı yuvarlanır,
// bölünmeyen kuruş ödeyenin payına yazılır (101 kuruş eşit: ödemeyen 50, ödeyen 51). Toplam hep tutara eşittir.
// "Hesaplaştık" kaydı: borçlu, alacaklıya borcun tamamını öder (odeyen = borçlu, pay = { alacaklı: 1 }).
import { parseDay } from '../../js/core/gunler.js';

export const KATEGORILER = [
  { id: 'market', ad: 'Market' },
  { id: 'yemek', ad: 'Yemek ve kafe' },
  { id: 'ev', ad: 'Ev ve faturalar' },
  { id: 'ulasim', ad: 'Ulaşım' },
  { id: 'eglence', ad: 'Eğlence' },
  { id: 'hediye', ad: 'Hediye' },
  { id: 'seyahat', ad: 'Seyahat' },
  { id: 'diger', ad: 'Diğer' },
];
export const MAX_KURUS = 100000000; // 1.000.000,00 ₺
export const BASLIK_MAX = 80;

const NB = ' ';
const zaman = (s) => {
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : 0;
};
const tekSatir = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
export const kategoriById = (id) => KATEGORILER.find((k) => k.id === id) || null;

/** Kullanıcının yazdığı tutar → kuruş (tamsayı) | null. "1.234,56", "1234.56", "45 ₺", "120,5". */
export function tutarCoz(metin) {
  const s = String(metin ?? '').replace(/₺|tl/gi, '').replace(/\s+/g, '');
  if (!s) return null;
  let tam;
  let kesir = '';
  if (s.includes(',')) {
    // Virgül ondalık; noktalar binlik ayırıcı.
    if (!/^\d{1,3}(\.\d{3})*,\d{1,2}$|^\d+,\d{1,2}$/.test(s)) return null;
    [tam, kesir] = s.split(',');
    tam = tam.replace(/\./g, '');
  } else if (/^\d+\.\d{1,2}$/.test(s)) {
    [tam, kesir] = s.split('.'); // tek nokta ve 1–2 hane: ondalık
  } else if (/^\d{1,3}(\.\d{3})+$|^\d+$/.test(s)) {
    tam = s.replace(/\./g, '');
  } else {
    return null;
  }
  const kurus = Number(tam) * 100 + Number((kesir + '00').slice(0, 2));
  if (!Number.isSafeInteger(kurus) || kurus <= 0 || kurus > MAX_KURUS) return null;
  return kurus;
}

/** Kuruş → "1.234,56 ₺" (tr-TR; ₺ öncesi bölünmez boşluk). */
export function paraMetni(kurus) {
  const n = Math.trunc(Number(kurus) || 0);
  const mutlak = Math.abs(n);
  const tam = String(Math.floor(mutlak / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const kesir = String(mutlak % 100).padStart(2, '0');
  return `${n < 0 ? '-' : ''}${tam},${kesir}${NB}₺`;
}

function payGecerli(pay) {
  if (!pay || typeof pay !== 'object' || Array.isArray(pay)) return false;
  const v = Object.values(pay);
  return v.length > 0 && v.every((w) => Number.isFinite(w) && w >= 0) && v.some((w) => w > 0);
}

/** Tutarı paylara böler. -> { [clientId]: kuruş } | null. Toplam = tutar (kural: dosya başı). */
export function paylar(tutar, pay, odeyen) {
  if (!payGecerli(pay)) return null;
  const W = Object.values(pay).reduce((t, w) => t + w, 0);
  const out = {};
  let dagitilan = 0;
  for (const [kim, w] of Object.entries(pay)) {
    if (!(w > 0)) continue;
    out[kim] = Math.floor((tutar * w) / W);
    dagitilan += out[kim];
  }
  const kalan = tutar - dagitilan;
  if (kalan > 0) out[odeyen] = (out[odeyen] || 0) + kalan;
  return out;
}

/** Yönelme eki: Gül → Gül'e, Ayşe → Ayşe'ye, Can → Can'a. "Sevgilin" → "Sevgiline". */
export function yonelme(ad) {
  const t = String(ad || '').trim();
  if (!t || t === 'Sevgilin') return 'Sevgiline';
  const low = t.toLocaleLowerCase('tr');
  const sesli = low.match(/[aeıioöuü]/g);
  const v = sesli ? sesli[sesli.length - 1] : 'e';
  const ek = 'aıou'.includes(v) ? 'a' : 'e';
  return `${t}'${'aeıioöuü'.includes(low.at(-1)) ? 'y' : ''}${ek}`;
}

/** Belge → doğrulanmış data | null (silinmiş ya da bozuk kayıt hesaba girmez). */
export function kayitOku(doc) {
  if (!doc || doc.deleted) return null;
  const d = doc.data || {};
  if (!Number.isSafeInteger(d.tutar) || d.tutar <= 0 || d.tutar > MAX_KURUS) return null;
  if (typeof d.odeyen !== 'string' || !d.odeyen) return null;
  if (!payGecerli(d.pay) || !parseDay(d.tarih)) return null;
  return {
    baslik: tekSatir(d.baslik) || (d.hesaplasma ? 'Hesaplaştık' : 'Harcama'),
    tutar: d.tutar,
    odeyen: d.odeyen,
    pay: d.pay,
    tarih: d.tarih,
    kategori: kategoriById(d.kategori) ? d.kategori : 'diger',
    hesaplasma: d.hesaplasma === true,
  };
}

/** Formdan yeni (ya da düzenlenmiş) kayıt. -> { data } | { hata } */
export function yeniHarcama({ baslik, tutarMetni, odeyen, pay, tarih, kategori }) {
  const b = tekSatir(baslik);
  if (!b) return { hata: 'Ne için harcandı? Kısa bir başlık yaz.' };
  if (b.length > BASLIK_MAX) return { hata: `Başlık en çok ${BASLIK_MAX} harf olsun.` };
  const tutar = tutarCoz(tutarMetni);
  if (tutar == null) return { hata: 'Tutar geçersiz. Örneğin 245,90 yaz.' };
  if (typeof odeyen !== 'string' || !odeyen) return { hata: 'Kimin ödediğini seç.' };
  if (!payGecerli(pay)) return { hata: 'Paylaşımı seç.' };
  if (!parseDay(tarih)) return { hata: 'Tarih geçersiz.' };
  return { data: { baslik: b, tutar, odeyen, pay, tarih, kategori: kategoriById(kategori) ? kategori : 'diger' } };
}

/** Kişi başına net (kuruş): ödediği − payına düşen. Artı = alacaklı. */
export function bakiye(docs) {
  const net = new Map();
  const ekle = (kim, n) => net.set(kim, (net.get(kim) || 0) + n);
  for (const doc of docs || []) {
    const k = kayitOku(doc);
    if (!k) continue;
    ekle(k.odeyen, k.tutar);
    for (const [kim, n] of Object.entries(paylar(k.tutar, k.pay, k.odeyen))) ekle(kim, -n);
  }
  return net;
}

/** Benim gözümden borç durumu. -> { borclu, alacakli, tutar } (denkse borclu/alacakli null, tutar 0). */
export function bakiyeDurumu(net, benId, partnerId) {
  const n = net.get(benId) || 0;
  if (n > 0) return { borclu: partnerId || null, alacakli: benId, tutar: n };
  if (n < 0) return { borclu: benId, alacakli: partnerId || null, tutar: -n };
  return { borclu: null, alacakli: null, tutar: 0 };
}

/** "Gül, Ömer'e 120,50 ₺ borçlu" | "Hesabınız denk…". adOf(clientId) → ad. */
export function bakiyeMetni(durum, adOf) {
  if (!durum.tutar) return 'Hesabınız denk. Kimse kimseye borçlu değil.';
  return `${adOf(durum.borclu)}, ${yonelme(adOf(durum.alacakli))} ${paraMetni(durum.tutar)} borçlu`;
}

/** Borcu kapatan kayıt verisi | null (borç yoksa ya da taraflardan biri bilinmiyorsa). */
export function hesaplasmaKaydi(durum, { tarih }) {
  if (!durum.tutar || !durum.borclu || !durum.alacakli) return null;
  return {
    baslik: 'Hesaplaştık', tutar: durum.tutar, odeyen: durum.borclu, pay: { [durum.alacakli]: 1 },
    tarih, kategori: 'diger', hesaplasma: true,
  };
}

/** Kayıtların ayları 'YYYY-MM', yeniden eskiye. */
export function aylar(docs) {
  const set = new Set();
  for (const d of docs || []) {
    const k = kayitOku(d);
    if (k) set.add(k.tarih.slice(0, 7));
  }
  return [...set].sort().reverse();
}

/** Ayın (ay null ise hepsi) geçerli kayıtları: tarih yeniden eskiye, aynı gün son eklenen üstte. */
export function ayFiltresi(docs, ay) {
  return (docs || [])
    .filter((d) => {
      const k = kayitOku(d);
      return k && (!ay || k.tarih.startsWith(`${ay}-`));
    })
    .sort((a, b) => (a.data.tarih === b.data.tarih
      ? zaman(b.created_at) - zaman(a.created_at)
      : a.data.tarih < b.data.tarih ? 1 : -1));
}

/** Ayın harcama özeti (hesaplaşmalar hariç). -> { toplam, kategoriler: [{ id, ad, toplam, oran }], odeyenler } */
export function kategoriOzeti(docs, ay) {
  const toplamlar = new Map();
  const odeyenler = {};
  let toplam = 0;
  for (const d of ayFiltresi(docs, ay)) {
    const k = kayitOku(d);
    if (k.hesaplasma) continue;
    toplam += k.tutar;
    toplamlar.set(k.kategori, (toplamlar.get(k.kategori) || 0) + k.tutar);
    odeyenler[k.odeyen] = (odeyenler[k.odeyen] || 0) + k.tutar;
  }
  const kategoriler = [...toplamlar]
    .map(([id, t]) => ({ id, ad: kategoriById(id).ad, toplam: t, oran: toplam ? Math.round((100 * t) / toplam) : 0 }))
    .sort((a, b) => b.toplam - a.toplam);
  return { toplam, kategoriler, odeyenler };
}

/** Paylaşım türü (form ve liste için). -> { tur: 'esit'|'benim'|'onun'|'ozel', yuzde: benim payım % } */
export function payTuru(pay, benId, partnerId) {
  const b = pay?.[benId] || 0;
  const o = pay?.[partnerId] || 0;
  if (b > 0 && o > 0 && b === o) return { tur: 'esit', yuzde: 50 };
  if (b > 0 && !o) return { tur: 'benim', yuzde: 100 };
  if (o > 0 && !b) return { tur: 'onun', yuzde: 0 };
  return { tur: 'ozel', yuzde: b + o ? Math.round((100 * b) / (b + o)) : 50 };
}

/** Yüzdeden pay: 70 → { ben: 70, o: 30 }; 100 ya da 0'da tek kişi. */
export function ozelPay(yuzde, benId, partnerId) {
  const y = Math.max(0, Math.min(100, Math.round(Number(yuzde) || 0)));
  const pay = {};
  if (y > 0) pay[benId] = y;
  if (y < 100) pay[partnerId] = 100 - y;
  return pay;
}

/** "yarı yarıya" | "hepsi Gül için" | "Ömer %70 · Gül %30" */
export function payAciklama(pay, benId, partnerId, adOf) {
  const p = payTuru(pay, benId, partnerId);
  if (p.tur === 'esit') return 'yarı yarıya';
  if (p.tur === 'benim') return `hepsi ${adOf(benId)} için`;
  if (p.tur === 'onun') return `hepsi ${adOf(partnerId)} için`;
  return `${adOf(benId)} %${p.yuzde} · ${adOf(partnerId)} %${100 - p.yuzde}`;
}
