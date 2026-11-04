// İmzalı medya adreslerinin önbelleği ve toplu isteği. Saf: ağ ve depo dışarıdan verilir (Node'da test edilir).
// Çok sayfalı site: adresler depoda (sessionStorage) kalır, sayfa geçişinde yeniden imza istenmez ve tarayıcının
// HTTP önbelleği aynı adresle çalışır. Sekme kapanınca silinir.

const PAY_MS = 5 * 60_000; // süresine bu kadar kalan adres kullanılmaz
const BEKLE_MS = 25; // aynı anda çizilen fotoğraflar tek istekte toplansın
const PARCA = 100; // Edge Function sınırı
const KAPALI_MS = 60_000; // istek başarısızsa bu süre yeniden denenmez (işlev yayında değilken istek yağmuru olmasın)
const EN_COK = 1500;

/**
 * iste(oda, yollar) -> { adresler: { yol: url }, eksik: [yol], sure: sn }; hata fırlatabilir.
 * depo: { oku() -> nesne, yaz(nesne) } (isteğe bağlı). Sonuç yoksa (hata, eksik dosya) al() null döner.
 */
export function imzaDeposu({ iste, depo = null, simdi = () => Date.now(), zamanla = setTimeout } = {}) {
  let bellek = null; // yol -> { u, s }
  const bekleyen = new Map(); // yol -> [çöz]
  let zaman = null;
  let kapaliKadar = 0;

  const yukle = () => {
    if (bellek) return bellek;
    bellek = new Map();
    try {
      const k = depo?.oku?.();
      if (k && typeof k === 'object') {
        for (const [y, v] of Object.entries(k)) if (v && typeof v.u === 'string' && v.s > simdi() + PAY_MS) bellek.set(y, v);
      }
    } catch { /* bozuk depo: baştan */ }
    return bellek;
  };

  const kaydet = () => {
    if (!depo) return;
    const t = simdi() + PAY_MS;
    const kalan = [...bellek].filter(([, v]) => v.s > t).slice(-EN_COK);
    bellek = new Map(kalan);
    try { depo.yaz(Object.fromEntries(kalan)); } catch { /* depo dolu: bellek yeter */ }
  };

  const hazir = (yol) => {
    const v = yukle().get(yol);
    return v && v.s > simdi() + PAY_MS ? v.u : null;
  };

  const coz = (yol, deger) => {
    const l = bekleyen.get(yol);
    bekleyen.delete(yol);
    for (const f of l || []) f(deger);
  };

  async function bosalt() {
    zaman = null;
    const odalar = new Map();
    for (const yol of bekleyen.keys()) {
      const oda = yol.split('/')[0];
      if (!odalar.has(oda)) odalar.set(oda, []);
      odalar.get(oda).push(yol);
    }
    for (const [oda, yollar] of odalar) {
      for (let i = 0; i < yollar.length; i += PARCA) {
        const parca = yollar.slice(i, i + PARCA);
        try {
          const r = await iste(oda, parca);
          const son = simdi() + (Number(r?.sure) || 0) * 1000;
          for (const yol of parca) {
            const u = r?.adresler?.[yol];
            if (u) yukle().set(yol, { u, s: son });
            coz(yol, u || null);
          }
          kaydet();
        } catch {
          kapaliKadar = simdi() + KAPALI_MS;
          for (const yol of parca) coz(yol, null);
        }
      }
    }
  }

  return {
    hazir,
    /** yol -> Promise<url|null>. */
    al(yol) {
      const h = hazir(yol);
      if (h) return Promise.resolve(h);
      if (simdi() < kapaliKadar) return Promise.resolve(null);
      return new Promise((f) => {
        if (bekleyen.has(yol)) bekleyen.get(yol).push(f);
        else bekleyen.set(yol, [f]);
        zaman ??= zamanla(bosalt, BEKLE_MS);
      });
    },
    /** Süresi dolmamış görünen adres açılmadıysa: bir daha kullanılmaz. */
    unut(yol) {
      yukle().delete(yol);
      kaydet();
    },
  };
}
