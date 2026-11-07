// İzin Belgesi: saf mantık (DOM yok; Node'da test edilir). Tür 'izin', id uuid (SOZLESME §26):
// { tur: 'hanim'|'bey', tarih, ad, soyad?, kisi, yer, neden, cikis, varis, isteyen, onaylayan,
//   durum: 'bekliyor'|'izinli'|'reddedildi'|'dondu', gonderildi, karar?, donus?, gec?, sebep? }
import { parseDay } from '../../js/core/gunler.js';

export const AD_MAX = 40;
export const METIN_MAX = 60;
export const SEBEP_MAX = 200;

const BELGE = {
  hanim: { ust: 'HANIMDAN', makam: 'HANIM MAKAMI', ad: 'Hanım' },
  bey: { ust: 'BEYDEN', makam: 'BEY MAKAMI', ad: 'Bey' },
};
const bilgi = (tur) => BELGE[tur] || BELGE.hanim;
const SAAT = /^([01]\d|2[0-3]):[0-5]\d$/;
const uzunluk = (s) => [...String(s ?? '').trim()].length;
const metin = (s) => String(s ?? '').trim();
const isoOf = (simdi) => new Date(simdi).toISOString();
const zaman = (s) => {
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : 0;
};

/** Kâğıdın iki satırlık başlığı. */
export const belgeBasligi = (tur) => [bilgi(tur).ust, 'İZİN BELGESİ'];
/** 'Hanım' | 'Bey': makam adı (metinlerde). */
export const makamAdi = (tur) => bilgi(tur).ad;

/** -> { alan, mesaj } | null. alan: formda odaklanılacak girdi. */
export function belgeDogrula(f = {}) {
  if (!Object.hasOwn(BELGE, f.tur ?? '')) return { alan: 'tur', mesaj: 'Belgenin kimden olduğunu seç.' };
  if (!parseDay(f.tarih)) return { alan: 'tarih', mesaj: 'Belgeye geçerli bir tarih yaz.' };
  if (!metin(f.ad)) return { alan: 'ad', mesaj: 'Adını yazmadan belge çıkmaz.' };
  if (uzunluk(f.ad) > AD_MAX) return { alan: 'ad', mesaj: `Ad en çok ${AD_MAX} karakter olabilir.` };
  if (uzunluk(f.soyad) > AD_MAX) return { alan: 'soyad', mesaj: `Soyadı en çok ${AD_MAX} karakter olabilir.` };
  const zorunlu = [
    ['kisi', 'Buluşacağın kişiyi yaz. Gizlisi saklısı olmaz.'],
    ['yer', 'Buluşma yerini yaz. “Dışarı” yer sayılmaz.'],
    ['neden', 'Buluşma nedenini yaz. Makam merak ediyor.'],
  ];
  for (const [alan, mesaj] of zorunlu) {
    if (!metin(f[alan])) return { alan, mesaj };
    if (uzunluk(f[alan]) > METIN_MAX) return { alan, mesaj: `Bu satıra en çok ${METIN_MAX} karakter sığar.` };
  }
  if (!SAAT.test(f.cikis ?? '')) return { alan: 'cikis', mesaj: 'Evden çıkış saatini seç.' };
  if (!SAAT.test(f.varis ?? '')) return { alan: 'varis', mesaj: 'Eve varış saatini seç. Saatsiz izin olmaz.' };
  if (f.varis === f.cikis) return { alan: 'varis', mesaj: 'Çıktığın saatte eve varamazsın.' };
  return null;
}

/** Formdan kaydedilecek veri. Boş soyad yazılmaz. */
export function belgeVerisi(f = {}, { isteyen, onaylayan, simdi = Date.now() } = {}) {
  const out = { tur: f.tur, tarih: f.tarih, ad: metin(f.ad) };
  if (metin(f.soyad)) out.soyad = metin(f.soyad);
  Object.assign(out, {
    kisi: metin(f.kisi), yer: metin(f.yer), neden: metin(f.neden), cikis: f.cikis, varis: f.varis,
    isteyen, onaylayan, durum: 'bekliyor', gonderildi: isoOf(simdi),
  });
  return out;
}

/** Sözü verilen varış anı (yerel saat, ms). Varış çıkıştan küçükse ertesi gün. Bozuk tarih: null. */
export function varisAni(data) {
  const g = parseDay(data?.tarih);
  if (!g || !SAAT.test(data?.varis ?? '')) return null;
  const [s, d] = data.varis.split(':').map(Number);
  const ertesi = SAAT.test(data.cikis ?? '') && data.varis < data.cikis ? 1 : 0;
  return new Date(g.y, g.m - 1, g.d + ertesi, s, d).getTime();
}

/** Kaç tam dakika geç kalındı (vaktindeyse 0). */
export function gecDakika(data, simdi = Date.now()) {
  const v = varisAni(data);
  return v === null ? 0 : Math.max(0, Math.floor((simdi - v) / 60000));
}

/** 47 -> '47 dakika'; 125 -> '2 saat 5 dakika'; 1500 -> '1 gün 1 saat'. */
export function gecMetni(dk) {
  const gun = Math.floor(dk / 1440);
  const saat = Math.floor((dk % 1440) / 60);
  const dakika = dk % 60;
  const parca = gun ? [[gun, 'gün'], [saat, 'saat']] : [[saat, 'saat'], [dakika, 'dakika']];
  return parca.filter(([n]) => n).map(([n, ad]) => `${n} ${ad}`).join(' ');
}

/** Dönüş formu. -> Türkçe hata | null. */
export function donusDogrula(gec, sebep) {
  if (!gec) return null;
  if (!metin(sebep)) return 'Geç kaldın. Sebebini yazmadan eve giremezsin.';
  if (uzunluk(sebep) > SEBEP_MAX) return `Sebep en çok ${SEBEP_MAX} karakter olabilir.`;
  return null;
}

export function donusYamasi(gec, sebep, simdi = Date.now()) {
  const out = { durum: 'dondu', donus: isoOf(simdi), gec };
  if (gec) out.sebep = metin(sebep);
  return out;
}

export const kararYamasi = (izin, simdi = Date.now()) => ({ durum: izin ? 'izinli' : 'reddedildi', karar: isoOf(simdi) });
export const kararGeriAlYamasi = () => ({ durum: 'bekliyor', karar: null });

export const damgalayabilir = (doc, myId) => doc?.data?.durum === 'bekliyor' && doc.data.isteyen !== myId;
export const donebilir = (doc, myId) => doc?.data?.durum === 'izinli' && doc.data.isteyen === myId;
export const silinebilir = (doc, myId) => doc?.data?.isteyen === myId;

/** Kâğıda vurulan damgalar, vuruluş sırasıyla. */
export function damgalar(data) {
  const { makam } = bilgi(data?.tur);
  const durum = data?.durum;
  if (durum === 'reddedildi') return [{ metin: 'REDDEDİLDİ', alt: makam, renk: 'kirmizi' }];
  if (durum !== 'izinli' && durum !== 'dondu') return [];
  const out = [{ metin: 'ONAYLANDI', alt: makam, renk: 'yesil' }];
  if (durum === 'dondu') {
    out.push(data.gec > 0
      ? { metin: 'GEÇ KALDI', alt: gecMetni(data.gec).toLocaleUpperCase('tr'), renk: 'kirmizi' }
      : { metin: 'TAM VAKTİNDE', alt: 'AFERİN', renk: 'yesil' });
  }
  return out;
}

const BOLUM_ADLARI = { karar: 'Senin damganı bekliyor', bekliyor: 'Damga bekliyor', disarida: 'Dönüş bekleniyor', arsiv: 'Arşiv' };

/** Belgeler bölüm bölüm, yeni önce; boş bölüm gelmez. -> [{ id, baslik, docs }] */
export function bolumler(docs, myId) {
  const gruplar = { karar: [], bekliyor: [], disarida: [], arsiv: [] };
  for (const d of docs || []) {
    if (!d?.data) continue;
    if (d.data.durum === 'izinli') gruplar.disarida.push(d);
    else if (d.data.durum === 'bekliyor') gruplar[d.data.isteyen === myId ? 'bekliyor' : 'karar'].push(d);
    else gruplar.arsiv.push(d);
  }
  const son = (d) => zaman(d.data.donus) || zaman(d.data.karar) || zaman(d.data.gonderildi);
  return Object.keys(gruplar)
    .filter((id) => gruplar[id].length)
    .map((id) => ({ id, baslik: BOLUM_ADLARI[id], docs: gruplar[id].sort((a, b) => son(b) - son(a)) }));
}

/** Yeni belge için son belgemdeki ad ve soyad. */
export function kimlikOneri(docs, myId) {
  const benim = (docs || []).filter((d) => d?.data?.isteyen === myId);
  const son = benim.sort((a, b) => zaman(b.data.gonderildi) - zaman(a.data.gonderildi))[0];
  return { ad: son?.data.ad || '', soyad: son?.data.soyad || '' };
}

/** '2026-11-07' -> '07/11/2026' (kâğıttaki biçim). */
export function tarihYazi(gun) {
  const g = parseDay(gun);
  return g ? `${String(g.d).padStart(2, '0')}/${String(g.m).padStart(2, '0')}/${g.y}` : '';
}

/** Yerel 'SS:DD'. */
export function saatYazi(iso) {
  const t = new Date(iso);
  return Number.isNaN(t.getTime()) ? '' : `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`;
}

/** Eve Varış satırı: söz verilen saat; döndüyse gerçek saat de. */
export function varisYazi(data) {
  const gercek = data?.donus ? saatYazi(data.donus) : '';
  return gercek ? `${data.varis} (vardığı saat ${gercek})` : String(data?.varis || '');
}

/** Bildirim başlığı ve metni. olay: 'gonderildi'|'izinli'|'reddedildi'|'dondu'. ad = olayı yapan kişi. */
export function bildirimMetni(olay, ad, data) {
  const kim = metin(ad) || 'Sevgilin';
  const yer = metin(data?.yer);
  if (olay === 'izinli') return { baslik: 'İzin çıktı ✅', metin: `${kim} damgayı vurdu: ${yer} için izin var.` };
  if (olay === 'reddedildi') return { baslik: 'İzin çıkmadı 🚫', metin: `${kim} ${yer} belgeni reddetti.` };
  if (olay === 'dondu') {
    return { baslik: 'Eve varıldı 🏠', metin: data?.gec > 0 ? `${kim} eve vardı, ${gecMetni(data.gec)} geç.` : `${kim} eve tam vaktinde vardı.` };
  }
  return { baslik: 'İzin belgesi geldi 📜', metin: `${kim} damganı bekliyor: ${yer}.` };
}
