// Anı haritası: saf mantık (DOM yok; Node'da test edilir).
// Konum: ani.konum = { lat, lng } (4 ondalık ≈ 11 m). Kümeleme: Web Mercator dünya pikselinde basit ızgara.

export const KONUM_ONDALIK = 4;
/** Konumlu anı yokken harita merkezi: Türkiye. */
export const VARSAYILAN_MERKEZ = { lat: 39.0, lng: 35.0, zoom: 5 };

const CARPAN = 10 ** KONUM_ONDALIK;
const MAX_ENLEM = 85.05112878; // Web Mercator sınırı

export function yuvarla4(x) {
  return Math.round(x * CARPAN) / CARPAN;
}

/**
 * { lat, lng } ya da Geolocation coords { latitude, longitude } → { lat, lng } (4 ondalık) | null.
 * Yalnız sonlu sayı kabul edilir (metin değil); enlem [-90, 90], boylam [-180, 180].
 */
export function konumDogrula(k) {
  if (!k || typeof k !== 'object') return null;
  const lat = k.lat ?? k.latitude;
  const lng = k.lng ?? k.longitude;
  if (typeof lat !== 'number' || typeof lng !== 'number' || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat: yuvarla4(lat) || 0, lng: yuvarla4(lng) || 0 }; // -0 yazılmasın
}

/** Boylamı [-180, 180) aralığına sarar (harita yan yana dünya kopyası gösterir). */
export function boylamSar(lng) {
  if (lng >= -180 && lng < 180) return lng; // kayan nokta hatası eklenmesin
  return ((((lng + 180) % 360) + 360) % 360) - 180;
}

/** Haritaya dokunulan nokta → kaydedilecek konum | null. */
export function haritaNoktasi(latlng) {
  if (!latlng || !Number.isFinite(latlng.lng)) return null;
  return konumDogrula({ lat: latlng.lat, lng: boylamSar(latlng.lng) });
}

/** Web Mercator dünya pikseli (zoom'da dünya genişliği = karo × 2^zoom). */
export function dunyaPikseli({ lat, lng }, zoom, karo = 256) {
  const olcek = karo * 2 ** zoom;
  const enlem = Math.max(-MAX_ENLEM, Math.min(MAX_ENLEM, lat));
  const s = Math.sin((enlem * Math.PI) / 180);
  return {
    x: ((lng + 180) / 360) * olcek,
    y: (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * olcek,
  };
}

/**
 * Basit ızgara kümeleme: aynı zoom'da aynı `hucre` piksellik kareye düşen noktalar bir küme.
 * noktalar: [{ id, lat, lng, ... }] → [{ anahtar, lat, lng, uyeler }]; merkez = üyelerin ortalaması.
 * Sıra: kümenin ilk üyesinin girişteki sırası.
 */
export function kumele(noktalar, zoom, { hucre = 60 } = {}) {
  const kumeler = new Map();
  for (const n of noktalar || []) {
    const p = dunyaPikseli(n, zoom);
    const anahtar = `${zoom}:${Math.floor(p.x / hucre)}:${Math.floor(p.y / hucre)}`;
    let k = kumeler.get(anahtar);
    if (!k) kumeler.set(anahtar, (k = { anahtar, uyeler: [] }));
    k.uyeler.push(n);
  }
  return [...kumeler.values()].map((k) => ({
    anahtar: k.anahtar,
    lat: k.uyeler.reduce((s, u) => s + u.lat, 0) / k.uyeler.length,
    lng: k.uyeler.reduce((s, u) => s + u.lng, 0) / k.uyeler.length,
    uyeler: k.uyeler,
  }));
}

/** Noktaları kapsayan kutu: [[güney, batı], [kuzey, doğu]] | null (Leaflet fitBounds biçimi). */
export function sinirlar(noktalar) {
  const l = noktalar || [];
  if (!l.length) return null;
  let g = Infinity, b = Infinity, k = -Infinity, d = -Infinity;
  for (const n of l) {
    g = Math.min(g, n.lat); k = Math.max(k, n.lat);
    b = Math.min(b, n.lng); d = Math.max(d, n.lng);
  }
  return [[g, b], [k, d]];
}

export function ayniYerde(noktalar) {
  const l = noktalar || [];
  return l.length > 0 && l.every((n) => n.lat === l[0].lat && n.lng === l[0].lng);
}

/** Kümeye dokununca: 'ani' (tek anı) | 'liste' (aynı yer ya da daha yakınlaşılamaz) | 'yakinlas'. */
export function kumeTiklama(kume, zoom, maxZoom) {
  if (kume.uyeler.length === 1) return 'ani';
  if (ayniYerde(kume.uyeler) || zoom >= maxZoom - 1) return 'liste';
  return 'yakinlas';
}

/** Konumu geçerli anılar: [{ id, lat, lng, ani }] (sıra korunur). */
export function konumluAnilar(docs) {
  const out = [];
  for (const d of docs || []) {
    const k = konumDogrula(d?.data?.konum);
    if (k) out.push({ id: d.id, lat: k.lat, lng: k.lng, ani: d });
  }
  return out;
}

const ONDALIK = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: KONUM_ONDALIK, maximumFractionDigits: KONUM_ONDALIK });

/** { lat, lng } → '41,0082° K · 28,9784° D' (K/G kuzey/güney, D/B doğu/batı). */
export function konumYazi(k) {
  const v = konumDogrula(k);
  if (!v) return '';
  return `${ONDALIK.format(Math.abs(v.lat))}° ${v.lat < 0 ? 'G' : 'K'} · ${ONDALIK.format(Math.abs(v.lng))}° ${v.lng < 0 ? 'B' : 'D'}`;
}

/** Geolocation hatası (ya da 'yok': tarayıcı desteklemiyor) → nazik Türkçe metin. */
export function konumHataMetni(e) {
  if (e === 'yok') return 'Bu cihaz konumunu paylaşamıyor. Haritada dokunarak seçebilirsin.';
  if (e?.code === 1) return 'Konum izni verilmedi, sorun değil. Haritada dokunarak da seçebilirsin.';
  if (e?.code === 2) return 'Konumun bulunamadı. Haritadan seçmeyi dener misin?';
  if (e?.code === 3) return 'Konum zamanında alınamadı. Tekrar dener misin?';
  return 'Konum alınamadı. Haritadan seçebilirsin.';
}
