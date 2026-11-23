// Gece yedeği: bu bilgisayar odaya 'yedek-pc-*' cihazı olarak girer, tam yedeği (.bizyedek) klasöre yazar.
// Biçim uygulamadaki "Tam yedek al" ile aynı; Ayarlar › Yedekten geri yükle ile ayar.json'daki parolayla açılır.
// Kurulum:   node dev/gece-yedek.mjs --kur <oda kodu>   → telefondan Ayarlar › Cihazlar › Onayla
// Çalıştırma: node dev/gece-yedek.mjs                    (zamanlanmış görev bunu çağırır)
// Ayar ve yedekler: %USERPROFILE%\BizYedek (BIZ_YEDEK_KLASOR ile değişir). Anahtar ve parola depoya girmez.
import { randomBytes } from 'node:crypto';
import { appendFile, mkdir, readdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../js/config.js';
import { normalizeDoc } from '../js/core/veri.js';
import { medyaYolu } from '../js/core/storage.js';
import { tamYedekUret, yedekMedyalari } from '../sayfalar/ayarlar/yedek-tam.js';
import { YEDEK_TURLERI, yedekVerisi, yedekSayisi, tamYedekDosyaAdi } from '../sayfalar/ayarlar/mantik.js';

const KLASOR = process.env.BIZ_YEDEK_KLASOR || join(homedir(), 'BizYedek');
const AYAR = join(KLASOR, 'ayar.json');
const YEDEKLER = join(KLASOR, 'yedekler');
const GUNLUK = join(KLASOR, 'gunluk.txt');
const SAKLA = 14; // en yeni bu kadar yedek kalır
const CIHAZ_ADI = 'Bilgisayar (gece yedeği)';
const LIST_PAGE = 500; // veri.js listDocs ile aynı
const IMZA_PARCA = 100; // Edge Function sınırı
const YEDEK_RE = /^biz-ikimiz-tam-yedek-\d{4}-\d{2}-\d{2}\.bizyedek$/;

const KOK = String(SUPABASE_URL).replace(/\/+$/, '');
const BASLIK = {
  apikey: SUPABASE_ANON_KEY,
  'Content-Type': 'application/json',
  ...(String(SUPABASE_ANON_KEY).startsWith('eyJ') ? { Authorization: `Bearer ${SUPABASE_ANON_KEY}` } : {}),
};

async function gunluk(satir) {
  await mkdir(KLASOR, { recursive: true });
  await appendFile(GUNLUK, `${new Date().toISOString()} ${satir}\n`);
  console.log(satir);
}

async function rpc(fn, govde) {
  const res = await fetch(`${KOK}/rest/v1/rpc/${fn}`, {
    method: 'POST', headers: BASLIK, body: JSON.stringify(govde), signal: AbortSignal.timeout(60_000),
  });
  const metin = await res.text();
  if (!res.ok) throw new Error(`${fn} ${res.status}: ${metin.slice(0, 200)}`);
  return metin ? JSON.parse(metin) : null;
}

const kimlik = (a) => ({ p_cihaz: a.cihaz, p_anahtar: a.anahtar });
const katil = (a) => rpc('oda_katil', { p_room: a.oda, ...kimlik(a), p_ad: CIHAZ_ADI });

/** veri.js listDocs ile aynı sayfalama (silinenler dahil; yedekVerisi ayıklar). */
async function belgeler(a, kind) {
  const out = [];
  let since = null;
  for (let i = 0; i < 200; i++) {
    const rows = await rpc('doc_list', { p_room: a.oda, p_kind: kind, p_since: since, p_limit: LIST_PAGE, ...kimlik(a) });
    out.push(...rows.map(normalizeDoc));
    if (rows.length < LIST_PAGE) break;
    since = rows[rows.length - 1].updated_at;
  }
  return out;
}

/** İmzalı adresle indirir; adresleri 100'lük parçalarla ister, süresi dolana yeniden ister. */
function medyaIndirici(a, refs) {
  const sira = [...new Set(refs.map(medyaYolu).filter((y) => y && y.startsWith(`${a.oda}/`)))];
  const konum = new Map(sira.map((y, i) => [y, i]));
  const adres = new Map(); // yol -> { u, son }
  const taze = (y) => (adres.get(y)?.son || 0) > Date.now();

  async function imzala(yollar) {
    const res = await fetch(`${KOK}/functions/v1/medya?islem=imzala`, {
      method: 'POST', headers: BASLIK, signal: AbortSignal.timeout(60_000),
      body: JSON.stringify({ room: a.oda, cihaz: a.cihaz, anahtar: a.anahtar, yollar }),
    });
    if (!res.ok) throw new Error(`imza ${res.status}`);
    const r = await res.json();
    const son = Date.now() + ((Number(r.sure) || 0) - 300) * 1000;
    for (const [y, u] of Object.entries(r.adresler || {})) adres.set(y, { u, son });
  }

  return async function indir(ref) {
    const yol = medyaYolu(ref);
    if (!yol || !konum.has(yol)) throw new Error('bu odanın dosyası değil');
    if (!taze(yol)) {
      const i = konum.get(yol);
      await imzala(sira.slice(i, i + IMZA_PARCA).filter((y) => !taze(y)));
    }
    const v = adres.get(yol);
    if (!v) throw new Error('kovada yok');
    const res = await fetch(v.u, { signal: AbortSignal.timeout(120_000) });
    if (!res.ok) throw new Error(`indirme ${res.status}`);
    return res.blob();
  };
}

async function ayarOku() {
  const a = JSON.parse(await readFile(AYAR, 'utf8'));
  if (!a?.oda || !a?.cihaz || !a?.anahtar || !a?.parola) throw new Error(`Ayar eksik: ${AYAR}`);
  return a;
}

async function kur(oda) {
  if (!/^[a-z2-9]{10}$/.test(oda || '')) throw new Error('Oda kodu 10 karakter olmalı (a-z, 2-9).');
  let a = await ayarOku().catch(() => null);
  if (a && a.oda !== oda) throw new Error(`${AYAR} başka bir odaya ait. Önce o dosyayı kaldır.`);
  if (!a) {
    a = {
      oda,
      cihaz: `yedek-pc-${randomBytes(6).toString('hex')}`,
      anahtar: randomBytes(32).toString('base64url'),
      parola: randomBytes(18).toString('base64url'),
    };
    await mkdir(KLASOR, { recursive: true });
    await writeFile(AYAR, JSON.stringify(a, null, 2), { flag: 'wx' });
  }
  const r = await katil(a);
  await gunluk(`kurulum: cihaz ${a.cihaz}, durum ${r?.durum}`);
  if (r?.durum === 'bekliyor') console.log(`Telefondan onayla: Ayarlar › Cihazlar › "${CIHAZ_ADI}" › Onayla.`);
}

async function eskileriSil() {
  const dosyalar = (await readdir(YEDEKLER)).filter((d) => YEDEK_RE.test(d)).sort();
  for (const d of dosyalar.slice(0, -SAKLA)) await unlink(join(YEDEKLER, d));
}

async function yedekAl() {
  const a = await ayarOku();
  const r = await katil(a);
  if (r?.durum !== 'onayli') throw new Error(`cihaz ${r?.durum || 'bilinmiyor'}: telefondan Ayarlar › Cihazlar › Onayla`);

  const simdi = new Date();
  const sonuclar = {};
  const hatalar = {};
  for (const t of YEDEK_TURLERI) {
    try {
      sonuclar[t] = await belgeler(a, t);
    } catch (e) {
      hatalar[t] = e.message;
    }
  }
  if (!Object.keys(sonuclar).length) throw new Error(`hiçbir tür okunamadı: ${Object.values(hatalar)[0]}`);
  const yedek = yedekVerisi({ sonuclar, hatalar, simdi });

  const { blob, medyaSayisi, eksikMedya } = await tamYedekUret({
    yedek, parola: a.parola, indir: medyaIndirici(a, yedekMedyalari(yedek)),
  });
  await mkdir(YEDEKLER, { recursive: true });
  const hedef = join(YEDEKLER, tamYedekDosyaAdi(simdi));
  await writeFile(`${hedef}.yarim`, Buffer.from(await blob.arrayBuffer()));
  await rename(`${hedef}.yarim`, hedef);
  await eskileriSil();

  const mb = (blob.size / 1048576).toFixed(1);
  const ek = [
    eksikMedya.length ? `alınamayan dosya ${eksikMedya.length}` : '',
    yedek.eksik ? `okunamayan tür ${yedek.eksik.join(',')}` : '',
  ].filter(Boolean).join('; ');
  await gunluk(`tamam: ${yedekSayisi(yedek)} kayıt, ${medyaSayisi} dosya, ${mb} MB${ek ? ` (${ek})` : ''}`);
}

const [islem, arg] = process.argv.slice(2);
try {
  if (islem === '--kur') await kur(arg);
  else await yedekAl();
} catch (e) {
  await gunluk(`HATA: ${e.message}`).catch(() => console.error(e));
  process.exitCode = 1;
}
