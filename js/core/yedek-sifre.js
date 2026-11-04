// Parolalı yedek dosyası biçimi (.bizyedek). Sunucuya hiçbir şey gitmez; parola unutulursa dosya açılmaz.
//
// Dosya: SIHIR (10 bayt) | başlık uzunluğu (uint32) | başlık JSON | çerçeveler
// Başlık: { v: 1, kdf: 'PBKDF2-SHA256', tekrar, tuz, onek }  (tuz, onek base64)
// Çerçeve: şifreli uzunluk (uint32) | son (1 bayt) | AES-256-GCM şifreli metin
//   IV = onek (8 bayt) + sıra (uint32). Ek veri = başlık + sıra + son. Sıra değişmesi, parça silinmesi ve kesilme yakalanır.
// Düz akış (çerçeveler birleşince): kayıtlar; kayıt = meta uzunluğu (uint32) | meta JSON ({ ..., boy }) | boy bayt.
// Node'da da çalışır (WebCrypto). crypto.subtle yalnız güvenli bağlamda var (http yerel ağda yok: sifreDestegi).

const SIHIR = new TextEncoder().encode('BIZYEDEK1\n');
export const TEKRAR = 600_000;
const TEKRAR_EN_AZ = 1000;
const TEKRAR_EN_COK = 5_000_000;
const PARCA = 4 * 1024 * 1024;
const BASLIK_MAX = 4096;

/** neden: 'parola' (yanlış parola ya da ilk parça bozuk) | 'yarim' | 'bozuk' | 'bicim'. */
export class YedekHatasi extends Error {
  constructor(neden, mesaj) {
    super(mesaj);
    this.name = 'YedekHatasi';
    this.neden = neden;
  }
}

export const sifreDestegi = (c = globalThis.crypto) => !!c?.subtle;

const b64 = (b) => btoa(String.fromCharCode(...b));
const b64Coz = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const u32 = (n) => {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, n);
  return b;
};
const oku32 = (b, i = 0) => new DataView(b.buffer, b.byteOffset, b.byteLength).getUint32(i);

function birlestir(...parcalar) {
  const out = new Uint8Array(parcalar.reduce((t, p) => t + p.length, 0));
  let i = 0;
  for (const p of parcalar) {
    out.set(p, i);
    i += p.length;
  }
  return out;
}

async function anahtarTuret(parola, tuz, tekrar) {
  const ham = await crypto.subtle.importKey('raw', new TextEncoder().encode(parola), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: tuz, iterations: tekrar, hash: 'SHA-256' }, ham,
    { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

const iv = (onek, sira) => birlestir(onek, u32(sira));
const ekVeri = (baslik, sira, son) => birlestir(baslik, u32(sira), new Uint8Array([son ? 1 : 0]));

/** Yazıcı: ekle(meta, baytlar) kayıt ekler; bitir() -> Blob. Çerçeveler Blob olarak tutulur: tarayıcı belleği yormaz. */
export async function yedekYazici(parola, { tekrar = TEKRAR } = {}) {
  const tuz = crypto.getRandomValues(new Uint8Array(16));
  const onek = crypto.getRandomValues(new Uint8Array(8));
  const baslik = new TextEncoder().encode(JSON.stringify({ v: 1, kdf: 'PBKDF2-SHA256', tekrar, tuz: b64(tuz), onek: b64(onek) }));
  const anahtar = await anahtarTuret(parola, tuz, tekrar);
  const cikti = [new Blob([SIHIR, u32(baslik.length), baslik])];
  let tampon = [];
  let dolu = 0;
  let sira = 0;

  async function cerceve(duz, son) {
    const s = new Uint8Array(await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: iv(onek, sira), additionalData: ekVeri(baslik, sira, son) }, anahtar, duz));
    cikti.push(new Blob([u32(s.length), new Uint8Array([son ? 1 : 0]), s]));
    sira++;
  }

  async function yaz(baytlar) {
    let i = 0;
    while (i < baytlar.length) {
      const al = Math.min(PARCA - dolu, baytlar.length - i);
      tampon.push(baytlar.subarray(i, i + al));
      dolu += al;
      i += al;
      if (dolu === PARCA) {
        await cerceve(birlestir(...tampon), false);
        tampon = [];
        dolu = 0;
      }
    }
  }

  return {
    async ekle(meta, baytlar = new Uint8Array(0)) {
      const m = new TextEncoder().encode(JSON.stringify({ ...meta, boy: baytlar.length }));
      await yaz(u32(m.length));
      await yaz(m);
      await yaz(baytlar);
    },
    async bitir() {
      await cerceve(birlestir(...tampon), true);
      tampon = [];
      dolu = 0;
      return new Blob(cikti, { type: 'application/octet-stream' });
    },
  };
}

export async function sifreliMi(blob) {
  const b = new Uint8Array(await blob.slice(0, SIHIR.length).arrayBuffer());
  return b.length === SIHIR.length && b.every((x, i) => x === SIHIR[i]);
}

/** -> { kayitlar() }: async üreteç { meta, veri }. İlk kayıtta yanlış parola, sonra bozuk ya da yarım dosya YedekHatasi fırlatır. */
export async function yedekOkuyucu(blob, parola) {
  const bicim = () => new YedekHatasi('bicim', 'Bu dosya bir Biz İkimiz yedeği değil.');
  if (!(await sifreliMi(blob))) throw bicim();
  const uz = oku32(new Uint8Array(await blob.slice(SIHIR.length, SIHIR.length + 4).arrayBuffer()));
  if (uz < 2 || uz > BASLIK_MAX) throw bicim();
  const bas = SIHIR.length + 4;
  const baslik = new Uint8Array(await blob.slice(bas, bas + uz).arrayBuffer());
  let b;
  try {
    b = JSON.parse(new TextDecoder().decode(baslik));
    if (b.v !== 1 || b.kdf !== 'PBKDF2-SHA256' || !(b.tekrar >= TEKRAR_EN_AZ && b.tekrar <= TEKRAR_EN_COK)) throw new Error('sürüm');
    b.tuz = b64Coz(b.tuz);
    b.onek = b64Coz(b.onek);
    if (b.tuz.length !== 16 || b.onek.length !== 8) throw new Error('uzunluk');
  } catch {
    throw bicim();
  }
  const anahtar = await anahtarTuret(parola, b.tuz, b.tekrar);

  async function* cerceveler() {
    let i = bas + uz;
    let sira = 0;
    for (;;) {
      if (i + 5 > blob.size) throw new YedekHatasi('yarim', 'Yedek dosyası yarım kalmış.');
      const k = new Uint8Array(await blob.slice(i, i + 5).arrayBuffer());
      const n = oku32(k);
      const son = k[4] === 1;
      if (i + 5 + n > blob.size) throw new YedekHatasi('yarim', 'Yedek dosyası yarım kalmış.');
      const s = await blob.slice(i + 5, i + 5 + n).arrayBuffer();
      let duz;
      try {
        duz = new Uint8Array(await crypto.subtle.decrypt(
          { name: 'AES-GCM', iv: iv(b.onek, sira), additionalData: ekVeri(baslik, sira, son) }, anahtar, s));
      } catch {
        throw sira === 0
          ? new YedekHatasi('parola', 'Parola yanlış ya da dosya bozuk.')
          : new YedekHatasi('bozuk', 'Yedek dosyası bozulmuş.');
      }
      yield duz;
      i += 5 + n;
      sira++;
      if (son) {
        if (i !== blob.size) throw new YedekHatasi('bozuk', 'Yedek dosyası bozulmuş.');
        return;
      }
    }
  }

  return {
    async* kayitlar() {
      const akis = cerceveler();
      let tampon = new Uint8Array(0);
      let bitti = false;
      /** Tamponda en az n bayt olana dek çerçeve okur. */
      const doldur = async (n) => {
        while (tampon.length < n && !bitti) {
          const { value, done } = await akis.next();
          if (done) bitti = true;
          else tampon = tampon.length ? birlestir(tampon, value) : value;
        }
        return tampon.length >= n;
      };
      const al = (n) => {
        const p = tampon.subarray(0, n);
        tampon = tampon.subarray(n);
        return p;
      };
      for (;;) {
        if (!(await doldur(4))) {
          if (tampon.length) throw new YedekHatasi('bozuk', 'Yedek dosyası bozulmuş.');
          return;
        }
        const m = oku32(al(4));
        if (m > 1024 * 1024 || !(await doldur(m))) throw new YedekHatasi('bozuk', 'Yedek dosyası bozulmuş.');
        const meta = JSON.parse(new TextDecoder().decode(al(m)));
        if (!(await doldur(meta.boy))) throw new YedekHatasi('bozuk', 'Yedek dosyası bozulmuş.');
        yield { meta, veri: al(meta.boy).slice() };
      }
    },
  };
}
