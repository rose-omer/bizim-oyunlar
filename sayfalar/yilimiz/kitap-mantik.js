// Anı Kitabı: saf hesap (DOM yok; Node'da test edilir). Yılın anıları, seçilmiş mesajları, özel günleri.
import { parseDay, toDay } from '../../js/core/gunler.js';
import { AY_ADLARI, gunYazi, filtrele } from '../anilar/mantik.js';
import { gonderen } from '../sohbet/mantik.js';
import { takvimOlaylari } from '../gunler/mantik.js';
import { sayiYaz } from './mantik.js';

/** Kitapta bir anının en çok fotoğrafı. */
export const KITAP_FOTO = 4;
/** Yıldızlı mesaj yoksa seçilen en uzun mesaj sayısı. */
export const UZUN_MESAJ = 10;
/** Yıldızlı mesajlardan en çok bu kadarı (eskiden yeniye ilkleri). */
export const YILDIZ_SINIRI = 60;

const zaman = (s) => { const t = Date.parse(s); return Number.isFinite(t) ? t : 0; };
const gunStr = (v) => (typeof v === 'string' ? v : toDay(v));
const metniOf = (d) => (typeof d?.data?.metin === 'string' ? d.data.metin.trim() : '');

/**
 * O yılın anıları, aylara göre eskiden yeniye: [{ ay, ad, anilar: [{ id, baslik, tarih, tarihYazi, yer, not, fotolar }] }].
 * Aynı gün: önce eklenen önce. Fotoğraf en çok KITAP_FOTO.
 */
export function kitapAnilari(docs, yil) {
  const sirali = filtrele(docs, { yil }).sort((a, b) => (a.data.tarih < b.data.tarih ? -1 : a.data.tarih > b.data.tarih ? 1 : zaman(a.created_at) - zaman(b.created_at)));
  const aylar = [];
  for (const d of sirali) {
    const p = parseDay(d.data.tarih);
    let m = aylar[aylar.length - 1];
    if (!m || m.ay !== p.m) aylar.push((m = { ay: p.m, ad: AY_ADLARI[p.m - 1], anilar: [] }));
    const data = d.data;
    m.anilar.push({
      id: d.id,
      baslik: String(data.baslik || '').trim() || 'Bir anı',
      tarih: data.tarih,
      tarihYazi: gunYazi(data.tarih, { yil: false }),
      yer: String(data.yer || '').trim(),
      not: String(data.not || '').trim(),
      fotolar: (Array.isArray(data.fotolar) ? data.fotolar : []).filter((u) => typeof u === 'string' && u).slice(0, KITAP_FOTO),
    });
  }
  return aylar;
}

/** Kitaptaki tüm fotoğraf adresleri, tekil, sırayla. */
export function kitapFotolari(aylar) {
  return [...new Set((aylar || []).flatMap((m) => m.anilar.flatMap((a) => a.fotolar)))];
}

/**
 * Seçilmiş mesajlar: o yılın yıldızlı (herhangi biri yıldızlamış) yazılı mesajları; yoksa en uzun UZUN_MESAJ tanesi.
 * Eskiden yeniye. -> { tur: 'yildiz' | 'uzun' | null, mesajlar: [{ id, metin, ad, tarih, tarihYazi }] }
 */
export function seciliMesajlar(docs, yil, { kisiler = [], uzun = UZUN_MESAJ, yildizSiniri = YILDIZ_SINIRI } = {}) {
  const yazili = (docs || []).filter((d) => metniOf(d) && new Date(zaman(d.created_at)).getFullYear() === yil);
  const kronolojik = (liste) => liste.sort((a, b) => zaman(a.created_at) - zaman(b.created_at));
  const yildizli = yazili.filter((d) => Object.values(d.data.yildiz || {}).some((v) => v === true));
  let tur = null;
  let secili = [];
  if (yildizli.length) {
    tur = 'yildiz';
    secili = kronolojik(yildizli).slice(0, yildizSiniri);
  } else if (yazili.length) {
    tur = 'uzun';
    secili = kronolojik([...yazili].sort((a, b) => metniOf(b).length - metniOf(a).length || zaman(a.created_at) - zaman(b.created_at)).slice(0, uzun));
  }
  const adlar = new Map((kisiler || []).map((k) => [k.id, k.ad]));
  return {
    tur,
    mesajlar: secili.map((d) => {
      const tarih = toDay(new Date(zaman(d.created_at)));
      return { id: d.id, metin: metniOf(d), ad: adlar.get(gonderen(d)) || '', tarih, tarihYazi: gunYazi(tarih, { yil: false }) };
    }),
  };
}

/**
 * O yılın bugüne dek gelmiş özel günleri: Günler kayıtları, doğum günleri, ilk gün, gün sayıları ve yıl dönümleri.
 * Ay dönümleri ve her ay tekrarlananlar kitaba girmez. -> [{ key, date, tarihYazi, baslik, emoji, ek }] tarihe göre.
 */
export function kitapOzelGunleri({ gunler = [], kisiler = [], baslangic = null, yil, bugun = new Date() } = {}) {
  const from = `${yil}-01-01`;
  const t = gunStr(bugun);
  const to = t < `${yil}-12-31` ? t : `${yil}-12-31`;
  if (to < from) return [];
  const harita = takvimOlaylari({ gunler, kisiler, baslangic, from, to, bugun: t });
  return Object.keys(harita).sort().flatMap((date) => harita[date]
    .filter((o) => o.tasTur !== 'ay' && o.tekrar !== 'ay')
    .map((o) => ({ key: o.key, date, tarihYazi: gunYazi(date, { yil: false }), baslik: o.baslik, emoji: o.emoji, ek: o.ek || null })));
}

/** Kapakta birlikte gün sayısı. */
export function kapakSatiri(ozet) {
  const n = ozet?.birlikteGun || 0;
  if (!n) return null;
  return `${ozet.buYil ? 'Bu yıl ' : ''}${sayiYaz(n)} gün birlikte`;
}

/** Kapanış sayfasında yılın kısa dökümü; veri yoksa null. */
export function kapanisSatiri(ozet) {
  const o = ozet || {};
  const parcalar = [
    [o.ani?.sayi, 'anı'], [o.mesaj?.sayi, 'mesaj'], [o.oyun?.toplam, 'maç'], [o.dokunus?.sayi, 'dokunuş'],
  ].filter(([n]) => n > 0).map(([n, ad]) => `${sayiYaz(n)} ${ad}`);
  if (!parcalar.length) return null;
  const liste = parcalar.length > 1 ? `${parcalar.slice(0, -1).join(', ')} ve ${parcalar[parcalar.length - 1]}` : parcalar[0];
  return `${o.buYil ? 'Bu yıl' : 'O yıl'} ${liste} biriktirdiniz.`;
}

/**
 * Yazdırma yolu. Android uygulamasının WebView'ında window.print hiçbir şey yapmaz:
 * orada (ya da print yoksa) site dışarıda (Chrome) açılır. -> 'yazdir' | 'disari'
 */
export function yazdirmaYolu({ native = false, printVar = true } = {}) {
  return !native && printVar ? 'yazdir' : 'disari';
}

/** Adres parametreleri: ?kitap=1&yil=2025 -> { kitap, yil|null }. */
export function kitapParametreleri(search) {
  const p = new URLSearchParams(search || '');
  const y = Number(p.get('yil'));
  return { kitap: p.get('kitap') === '1', yil: Number.isInteger(y) && y > 1900 ? y : null };
}
