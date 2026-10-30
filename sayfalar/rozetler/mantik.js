// Rozetler: saf hesap (DOM yok; Node'da test edilir). Rozetler saklanmaz; her açılışta mevcut veriden hesaplanır.
import { parseDay, toDay, daysBetween, daysTogether, durationParts, daysInMonth, addDays } from '../../js/core/gunler.js';
import { gunYazi } from '../anilar/mantik.js';

/** Rozet sayfası için en çok taranacak mesaj (ilk fotoğraf / sesli mesaj, 1000 mesaj). */
export const ROZET_MESAJ_SINIRI = 5000;
const MESAJ_HEDEF = 1000;

export const GRUPLAR = [
  { id: 'birlikte', baslik: 'Birlikte geçen zaman' },
  { id: 'seri', baslik: 'Günün Sorusu' },
  { id: 'oyun', baslik: 'Oyunlar' },
  { id: 'ani', baslik: 'Anılar' },
  { id: 'ilk', baslik: 'İlkler' },
  { id: 'sohbet', baslik: 'Sohbet ve dokunuş' },
];

const sayiFmt = new Intl.NumberFormat('tr-TR');
const sayiYaz = (n) => sayiFmt.format(n || 0);
const oranOf = (deger, hedef) => (hedef > 0 ? Math.max(0, Math.min(1, deger / hedef)) : 0);

/** n. yıl dönümü günü (29 Şubat artık olmayan yılda 28 Şubat). */
export function yilDonumu(baslangic, n) {
  const p = parseDay(baslangic);
  if (!p) return null;
  const y = p.y + n;
  return toDay({ y, m: p.m, d: Math.min(p.d, daysInMonth(y, p.m)) });
}

/** Sayıya bağlı rozet. */
function sayiRozeti({ id, grup, simge, baslik, aciklama, deger, hedef, bekliyor = false }) {
  const acik = deger >= hedef;
  const r = { id, grup, simge, baslik, aciklama, hedef, deger, acik, oran: oranOf(deger, hedef) };
  if (bekliyor && !acik) {
    r.bekliyor = true;
    r.durum = 'Bakılıyor…';
  } else {
    r.durum = acik ? 'Açıldı' : hedef === 1 ? 'Henüz yok' : `${sayiYaz(deger)} / ${sayiYaz(hedef)}`;
  }
  return r;
}

/**
 * v = { baslangic, enUzunSeri, oyunSayisi, aniSayisi, mektupSayisi, dokunusSayisi,
 *       mesaj: { sayi, foto, ses, tamam } | null (null: tarama sürüyor) }
 * -> [{ id, grup, simge, baslik, aciklama, hedef, deger, acik, oran, durum, tarih?, bekliyor? }]
 */
export function rozetHesapla(v, { bugun = new Date() } = {}) {
  const t = typeof bugun === 'string' ? bugun : toDay(bugun);
  const bas = parseDay(v.baslangic) && v.baslangic <= t ? v.baslangic : null;
  const out = [];

  // Birlikte geçen günler.
  const gun = bas ? daysTogether(bas, t) : 0;
  for (const n of [100, 365, 1000]) {
    const r = {
      id: `gun-${n}`, grup: 'birlikte', simge: 'takvim', baslik: `${n}. gün`,
      aciklama: `Birlikte ${sayiYaz(n)} gün.`, hedef: n, deger: gun, acik: gun >= n, oran: oranOf(gun, n),
    };
    if (!bas) r.durum = 'Başlangıç tarihinizi Ayarlar\'dan girin.';
    else if (r.acik) { r.tarih = addDays(bas, n - 1); r.durum = gunYazi(r.tarih); }
    else r.durum = `${sayiYaz(n - gun)} gün kaldı`;
    out.push(r);
  }
  // Yıl dönümleri: geçenler + sıradaki.
  const yillar = bas ? durationParts(bas, t).years : 0;
  for (let n = 1; n <= yillar + 1; n++) {
    const tarih = bas ? yilDonumu(bas, n) : null;
    const gecen = bas ? daysBetween(bas, t) : 0;
    const hedefGun = bas ? daysBetween(bas, tarih) : 0;
    const r = {
      id: `yil-${n}`, grup: 'birlikte', simge: 'yuzuk', baslik: `${n}. yıl dönümü`,
      aciklama: n === 1 ? 'İlk yılınızı doldurun.' : `Birlikte ${n} yıl.`, hedef: n, deger: yillar,
      acik: n <= yillar, oran: n <= yillar ? 1 : oranOf(gecen, hedefGun),
    };
    if (!bas) r.durum = 'Başlangıç tarihinizi Ayarlar\'dan girin.';
    else if (r.acik) { r.tarih = tarih; r.durum = gunYazi(tarih); }
    else r.durum = `${sayiYaz(daysBetween(t, tarih))} gün kaldı`;
    out.push(r);
  }

  for (const n of [7, 30, 100]) {
    out.push(sayiRozeti({ id: `seri-${n}`, grup: 'seri', simge: 'alev', baslik: `${n} günlük seri`,
      aciklama: `Günün Sorusu'nu ${n} gün üst üste birlikte cevaplayın.`, deger: v.enUzunSeri || 0, hedef: n }));
  }
  for (const n of [10, 50, 100]) {
    out.push(sayiRozeti({ id: `oyun-${n}`, grup: 'oyun', simge: 'zar', baslik: `${n} oyun`,
      aciklama: `Birlikte ${n} oyun bitirin.`, deger: v.oyunSayisi || 0, hedef: n }));
  }
  for (const n of [10, 50, 100]) {
    out.push(sayiRozeti({ id: `ani-${n}`, grup: 'ani', simge: 'foto', baslik: `${n} anı`,
      aciklama: `${n} anı biriktirin.`, deger: v.aniSayisi || 0, hedef: n }));
  }

  const m = v.mesaj || null;
  const bekliyor = !m;
  out.push(sayiRozeti({ id: 'mektup-1', grup: 'ilk', simge: 'zarf', baslik: 'İlk mektup',
    aciklama: 'Birbirinize ilk mektubu yazın.', deger: Math.min(1, v.mektupSayisi || 0), hedef: 1 }));
  out.push(sayiRozeti({ id: 'foto-1', grup: 'ilk', simge: 'resim', baslik: 'İlk fotoğraf',
    aciklama: 'Sohbette ilk fotoğrafı gönderin.', deger: m?.foto ? 1 : 0, hedef: 1, bekliyor }));
  out.push(sayiRozeti({ id: 'ses-1', grup: 'ilk', simge: 'mikrofon', baslik: 'İlk sesli mesaj',
    aciklama: 'Sohbette ilk sesli mesajı gönderin.', deger: m?.ses ? 1 : 0, hedef: 1, bekliyor }));
  out.push(sayiRozeti({ id: 'mesaj-1000', grup: 'sohbet', simge: 'balon', baslik: `${sayiYaz(MESAJ_HEDEF)} mesaj`,
    aciklama: `Birbirinize ${sayiYaz(MESAJ_HEDEF)} mesaj yazın.`, deger: Math.min(m?.sayi || 0, MESAJ_HEDEF), hedef: MESAJ_HEDEF, bekliyor }));
  out.push(sayiRozeti({ id: 'dokunus-100', grup: 'sohbet', simge: 'kalp', baslik: '100 dokunuş',
    aciklama: 'Birbirinize 100 dokunuş gönderin.', deger: v.dokunusSayisi || 0, hedef: 100 }));
  return out;
}

/** -> { acik, toplam, siradaki } siradaki = en çok ilerlemiş kilitli rozet (beklemede olmayan). */
export function rozetOzeti(list) {
  const kilitli = (list || []).filter((r) => !r.acik && !r.bekliyor);
  const siradaki = kilitli.reduce((b, r) => (!b || r.oran > b.oran ? r : b), null);
  return { acik: (list || []).filter((r) => r.acik).length, toplam: (list || []).length, siradaki };
}

/** Taranan mesajlardan rozet verisi. */
export function mesajRozetVerisi(docs) {
  let foto = false; let ses = false;
  for (const d of docs || []) {
    if (d?.data?.foto) foto = true;
    if (d?.data?.ses) ses = true;
  }
  return { sayi: (docs || []).length, foto, ses };
}

/** Tarama erken bitebilir mi: fotoğraf, sesli mesaj ve 1000 mesaj bulundu. */
export function mesajYeter(docs) {
  const m = mesajRozetVerisi(docs);
  return m.foto && m.ses && m.sayi >= MESAJ_HEDEF;
}
