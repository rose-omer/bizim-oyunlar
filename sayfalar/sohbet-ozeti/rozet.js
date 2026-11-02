// Sohbet Özetimiz: özet → rozetler (saf; saklanmaz, ekranda hesaplanır).
// Kural: kategoride önde olan kişi alır; fark %5'ten azsa (berabere) ikisi de almaz. Kişi başı en çok 6.

export const KISI_BASI_ROZET = 6;
export const BERABERE_ORAN = 0.05;

/** Sıra önemlidir: kişi başı sınır dolunca sondakiler düşer. kucuk: küçük değer kazanır. */
export const ROZETLER = [
  { id: 'baslatici', ad: 'Sohbet Başlatıcı', aciklama: 'Sessizliği ilk bozan', simge: 'bayrak', deger: (k) => k.sohbetAcma },
  { id: 'isik', ad: 'Işık Hızı', aciklama: 'Daha hızlı cevap veren', simge: 'simsek', kucuk: true, deger: (k) => k.cevapOrtDk },
  { id: 'gece', ad: 'Gece Kuşu', aciklama: 'Gece yarısından sonra daha çok yazan', simge: 'ay', deger: (k) => k.gece },
  { id: 'gunaydin', ad: 'Günaydın Elçisi', aciklama: 'Daha çok "günaydın" diyen', simge: 'gunes', deger: (k) => k.soz?.gunaydin },
  { id: 'sonsoz', ad: 'Son Söz', aciklama: 'Günü daha sık kapatan', simge: 'balon', deger: (k) => k.gununSon },
  { id: 'kahkaha', ad: 'Kahkaha Makinesi', aciklama: 'Daha çok gülen', simge: 'gulus', deger: (k) => k.soz?.gulme },
  { id: 'muah', ad: 'Muah Ustası', aciklama: 'Daha çok öpücük yollayan', simge: 'kalp', deger: (k) => k.soz?.muah },
  { id: 'destan', ad: 'Destan Yazarı', aciklama: 'En uzun mesajın sahibi', simge: 'tuy', deger: (k) => k.enUzunMesaj?.harf },
  { id: 'tesekkur', ad: 'Teşekkür Elçisi', aciklama: 'Daha sık teşekkür eden', simge: 'isilti', deger: (k) => k.soz?.tesekkur },
  { id: 'kelime', ad: 'Kelime Hazinesi', aciklama: 'Daha çok farklı kelime kullanan', simge: 'kitap', deger: (k) => k.farkliKelime },
  { id: 'ses', ad: 'Sesli Mesaj Ustası', aciklama: 'Daha çok sesli mesaj yollayan', simge: 'mikrofon', medyaTuru: true, deger: (k) => k.medya?.ses },
  { id: 'cikartma', ad: 'Çıkartma Koleksiyoncusu', aciklama: 'Daha çok çıkartma yollayan', simge: 'yildiz', medyaTuru: true, deger: (k) => k.medya?.cikartma },
];

/** İki değerden kazanan: 0 (ilk), 1 (ikinci) ya da null (berabere / veri yok). */
export function kazanan(a, b, { kucuk = false, oran = BERABERE_ORAN } = {}) {
  const x = Number.isFinite(a) ? a : null;
  const y = Number.isFinite(b) ? b : null;
  if (kucuk) {
    if (x == null || y == null || x <= 0 && y <= 0) return null;
  } else if ((x || 0) <= 0 && (y || 0) <= 0) return null;
  const p = x ?? 0;
  const q = y ?? 0;
  const buyuk = Math.max(p, q);
  if (buyuk <= 0 || Math.abs(p - q) / buyuk < oran) return null;
  if (kucuk) return p < q ? 0 : 1;
  return p > q ? 0 : 1;
}

/** ozet + [benId, partnerId] → { [id]: [{ id, ad, aciklama, simge }] } */
export function rozetler(ozet, ids) {
  const out = Object.fromEntries((ids || []).filter(Boolean).map((id) => [id, []]));
  const [a, b] = ids || [];
  const ka = ozet?.kisi?.[a];
  const kb = ozet?.kisi?.[b];
  if (!ka || !kb) return out;
  for (const r of ROZETLER) {
    if (r.medyaTuru && !ozet.kaynak?.medyaTuru) continue;
    const i = kazanan(r.deger(ka), r.deger(kb), { kucuk: r.kucuk });
    if (i == null) continue;
    const liste = out[i === 0 ? a : b];
    if (liste.length < KISI_BASI_ROZET) liste.push({ id: r.id, ad: r.ad, aciklama: r.aciklama, simge: r.simge });
  }
  return out;
}
