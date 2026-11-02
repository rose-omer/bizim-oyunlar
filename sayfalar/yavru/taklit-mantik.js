// Yavrumuz ses taklidi: saf parçalar (DOM ve Web Audio yok). Node'da test edilir: tests/yavru-taklit.test.mjs.
// Tarayıcı tarafı: ./taklit.js.
//
// Perde yöntemi: yeniden örnekleme + WSOLA zaman esnetme, düz JS.
// Gerekçe: playbackRate tek başına +6 yarım tonda sesi ~%41 hızlandırır (anlaşılmaz); WSOLA hızı ayrı ayarlar ve
// faz uyumlu bindirmeyle düz OLA'nın robotik dalgalanmasını önler. Yeniden örnekleme formantları da yükseltir:
// küçük ağız/gırtlak etkisi, yani "bebek" tınısı. Saf JS olduğu için Node'da sınanır, her tarayıcıda aynı çalışır.

export const TAKLIT = Object.freeze({
  yarimTon: 6,       // perde yükseltme (yarım ton); 5..8 tatlı aralık
  hiz: 1.12,         // konuşma hızı çarpanı
  esik: 0.02,        // sessiz odada konuşma eşiği (RMS)
  gurultuKat: 2.5,   // eşik en az ortam gürültüsünün bu katı
  sessizlikSn: 0.8,  // bu kadar sessizlik → konuşma bitti
  enCokSn: 6,        // en uzun konuşma
  enAzSn: 0.25,      // daha kısası tık sayılır
  baslamaSn: 0.08,   // eşik üstünde bu kadar kalınca konuşma başlar
  beklemeSn: 8,      // hiç konuşulmazsa dinleme biter
  olcumSn: 0.15,     // ilk bu kadar süre yalnız ortam gürültüsü ölçülür
  onSn: 0.3,         // başlangıçtan önce saklanan ses (ilk hece kesilmesin)
  tepe: 0.9,         // çıkış tepe genliği
  enCokKazanc: 8,    // sessiz kaydı en çok bu kadar yükselt (gürültü büyümesin)
});

/** Örneklerin karekök-ortalama genliği. */
export function rms(x) {
  if (!x || !x.length) return 0;
  let t = 0;
  for (let i = 0; i < x.length; i++) t += x[i] * x[i];
  return Math.sqrt(t / x.length);
}

/** Yarım ton → frekans oranı. 0..12 arası; geçersiz girdi varsayılanı alır. */
export function perdeOrani(yarimTon) {
  const n = Number.isFinite(yarimTon) ? yarimTon : TAKLIT.yarimTon;
  return 2 ** (Math.min(12, Math.max(0, n)) / 12);
}

/** Float32Array parçalarını tek diziye ekler. */
export function birlestir(parcalar) {
  let n = 0;
  for (const p of parcalar) n += p.length;
  const out = new Float32Array(n);
  let i = 0;
  for (const p of parcalar) { out.set(p, i); i += p.length; }
  return out;
}

/**
 * Ses etkinliği durum makinesi. besle(rms, blokSn) her blokta çağrılır; olay ya da null döner:
 * { tur: 'basladi' } | { tur: 'bitti', neden: 'sessizlik'|'sure', kuyrukSn } | { tur: 'vazgec' } | { tur: 'sessiz' }.
 * kuyrukSn: kaydın sonundaki sessizlik (kırpılır). 'vazgec': tık gibi kısa ses, yeniden bekler.
 * İlk olcumSn yalnız ortam gürültüsünü ölçer (uğultu konuşma sayılmasın). Eşik gürültüye uyar (yavaş yükselir,
 * hızlı düşer); konuşma bitişinde eşiğin %70'i (gecikmeli bırakma).
 */
export function sesAlgilayici(ayar = {}) {
  const a = { ...TAKLIT, ...ayar };
  let durum = 'bekliyor'; // bekliyor | aday | konusuyor | bitti
  let gurultu = null;
  let beklenen = 0;  // konuşma başlamadan geçen süre
  let aday = 0;      // eşik üstünde kesintisiz süre
  let konusma = 0;   // konuşma başından beri süre
  let sonSes = 0;    // konuşma başından son yüksek bloğa kadar süre
  let sessizlik = 0;
  let esikSabit = 0;

  const etkinEsik = () => Math.max(a.esik, (gurultu ?? 0) * a.gurultuKat);

  function besle(r, dt) {
    if (durum === 'bitti') return null;
    const deger = Number.isFinite(r) ? r : 0;
    if (durum === 'konusuyor') {
      konusma += dt;
      if (deger >= esikSabit * 0.7) { sessizlik = 0; sonSes = konusma; } else sessizlik += dt;
      if (sessizlik >= a.sessizlikSn - 1e-6) {
        if (sonSes < a.enAzSn) {
          durum = 'bekliyor';
          aday = 0;
          return { tur: 'vazgec' };
        }
        durum = 'bitti';
        return { tur: 'bitti', neden: 'sessizlik', kuyrukSn: sessizlik };
      }
      if (konusma >= a.enCokSn - 1e-6) {
        durum = 'bitti';
        return { tur: 'bitti', neden: 'sure', kuyrukSn: sessizlik };
      }
      return null;
    }
    // bekliyor / aday
    beklenen += dt;
    if (gurultu === null || beklenen <= a.olcumSn + 1e-6) {
      // Mikrofon açılırken gelen tam sıfır bloklar ölçülmez (eşik yapay düşmesin).
      if (deger > 1e-5) gurultu = gurultu === null ? deger : Math.min(gurultu, deger);
      if (beklenen >= a.beklemeSn - 1e-6) { durum = 'bitti'; return { tur: 'sessiz' }; }
      return null;
    }
    const esik = etkinEsik();
    if (deger >= esik) {
      aday += dt;
      if (aday >= a.baslamaSn - 1e-6) {
        durum = 'konusuyor';
        esikSabit = esik;
        konusma = aday;
        sonSes = aday;
        sessizlik = 0;
        return { tur: 'basladi' };
      }
    } else {
      aday = 0;
    }
    // Gürültü tabanı: düşüşe hızlı, yükselişe yavaş (2 sn) uyar.
    gurultu = deger < gurultu ? deger : gurultu + (deger - gurultu) * Math.min(1, dt / 2);
    if (beklenen >= a.beklemeSn - 1e-6) {
      durum = 'bitti';
      return { tur: 'sessiz' };
    }
    return null;
  }

  return {
    besle,
    get durum() { return durum === 'aday' ? 'bekliyor' : durum; },
  };
}

/** Doğrusal aradeğerlemeyle yeniden örnekleme: oran > 1 → kısa ve tiz (perde × oran). */
export function yenidenOrnekle(x, oran) {
  const n = Math.floor(x.length / oran);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const p = i * oran;
    const j = Math.floor(p);
    const f = p - j;
    const b = x[j] ?? 0;
    const c = x[j + 1] ?? b;
    out[i] = b + (c - b) * f;
  }
  return out;
}

/**
 * WSOLA zaman esnetme: perde aynı, süre × oran. 30 ms Hann pencere, %50 bindirme, ±8 ms hizalama araması.
 * Her pencere, önceki parçanın doğal devamına en çok benzeyen yerden alınır (faz uyumu → dalgalanma yok).
 */
export function zamanEsnet(x, oran, hz) {
  const hedef = Math.round(x.length * oran);
  const N = Math.max(64, Math.round(hz * 0.03) & ~1);
  const Hs = N / 2;
  const Ha = Hs / oran;
  const delta = Math.round(hz * 0.008);
  const out = new Float32Array(hedef + N);
  if (x.length < N + 2 * delta + Hs) return yenidenOrnekle(x, 1 / oran); // çok kısa: düz uzat
  const w = new Float32Array(N);
  for (let i = 0; i < N; i++) w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N);
  const ekle = (cikis, giris) => {
    for (let i = 0; i < N; i++) out[cikis + i] += (x[giris + i] ?? 0) * w[i];
  };
  ekle(0, 0);
  let onceki = 0;
  for (let k = 1; ; k++) {
    const cikis = k * Hs;
    if (cikis >= hedef) break;
    const dogal = onceki + Hs; // önceki parçanın kesintisiz devamı
    const nominal = Math.round(k * Ha);
    let enIyi = Math.min(Math.max(0, nominal), x.length - 1);
    if (nominal + N + delta < x.length && dogal + Hs <= x.length) {
      let enIyiDeger = -Infinity;
      for (let d = -delta; d <= delta; d++) {
        const p = nominal + d;
        if (p < 0) continue;
        let t = 0;
        for (let i = 0; i < Hs; i += 2) t += x[p + i] * x[dogal + i];
        if (t > enIyiDeger) { enIyiDeger = t; enIyi = p; }
      }
    }
    ekle(cikis, enIyi);
    onceki = enIyi;
  }
  // İlk yarım pencerede Hann toplamı 1'e ulaşmaz; orayı ilk pencereyle düzelt.
  for (let i = 0; i < Hs; i++) out[i] = x[i] ?? 0;
  return out.slice(0, hedef);
}

/**
 * Bebek sesi: perde × 2^(yarimTon/12), hız × hiz. Tepe TAKLIT.tepe'ye ölçeklenir (en çok enCokKazanc kat),
 * başta ve sonda 10 ms yumuşak geçiş (tık yok).
 */
export function bebekSesi(x, hz, { yarimTon = TAKLIT.yarimTon, hiz = TAKLIT.hiz } = {}) {
  if (!x?.length) return new Float32Array(0);
  const r = perdeOrani(yarimTon);
  const h = Number.isFinite(hiz) && hiz > 0.5 && hiz < 2 ? hiz : TAKLIT.hiz;
  const y = zamanEsnet(yenidenOrnekle(x, r), r / h, hz);
  let tepe = 0;
  for (let i = 0; i < y.length; i++) tepe = Math.max(tepe, Math.abs(y[i]));
  if (tepe > 0) {
    const k = Math.min(TAKLIT.tepe / tepe, TAKLIT.enCokKazanc);
    for (let i = 0; i < y.length; i++) y[i] *= k;
  }
  const f = Math.min(Math.round(hz * 0.01), Math.floor(y.length / 2));
  for (let i = 0; i < f; i++) {
    const g = i / f;
    y[i] *= g;
    y[y.length - 1 - i] *= g;
  }
  return y;
}

/**
 * Ağız zarfı: kare başına RMS, tepeye göre 0..1, hızlı açılır (saldırı) yavaş kapanır (80 ms).
 * 0.05 altı 0 (ağız kapalı). Kare sayısı = ceil(süre / kareSn).
 */
export function zarfCikar(x, hz, kareSn = 1 / 60) {
  const boy = Math.max(1, Math.round(hz * kareSn));
  const n = Math.ceil(x.length / boy);
  const z = new Float32Array(n);
  let tepe = 0;
  for (let k = 0; k < n; k++) {
    z[k] = rms(x.subarray(k * boy, (k + 1) * boy));
    tepe = Math.max(tepe, z[k]);
  }
  if (tepe < 1e-4) return z.fill(0);
  const birak = Math.exp(-kareSn / 0.08);
  let s = 0;
  for (let k = 0; k < n; k++) {
    const v = z[k] / tepe;
    s = v > s ? s + (v - s) * 0.7 : v + (s - v) * birak;
    z[k] = s < 0.05 ? 0 : Math.min(1, s);
  }
  return z;
}

/** Çalma anındaki (sn) ağız açıklığı; zarf dışında 0. */
export function agizDegeri(zarf, sn, kareSn = 1 / 60) {
  const k = Math.floor(sn / kareSn);
  return k >= 0 && k < zarf.length ? zarf[k] : 0;
}

/** Mikrofon bu durumda açık mı? (gösterge için) */
export function mikrofonAcikMi(durum) {
  return durum === 'dinliyor' || durum === 'konusuyor';
}

/** getUserMedia hatası → taklit durumu. */
export function mikrofonHataDurumu(e) {
  return e?.name === 'NotAllowedError' || e?.name === 'SecurityError' ? 'izin-yok' : 'hata';
}
