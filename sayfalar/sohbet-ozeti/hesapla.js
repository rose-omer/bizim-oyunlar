// Sohbet Özetimiz: mesajlar + eşleme → özet belgesi (saf; DOM yok, Node'da test edilir).
// Belge `sohbetozet` / 'bizim'. Ham mesaj belgeye girmez; yalnız sayılar ve sıralamalar.
import { icerikTuru } from './ayristir.js';

export const OZET_SURUM = 1;
export const SOHBET_ARA_MS = 30 * 60e3;   // 30 dk'dan uzun ara yeni sohbet
export const ACMA_MS = 4 * 3600e3;        // ≥ 4 saat sonra gelen ilk mesaj sohbeti açar
export const CEVAP_SINIR_MS = 12 * 3600e3; // 12 saatten uzun ara cevap sayılmaz
export const ART_ARDA_MIN_MS = 10 * 60e3; // double text: 10 dk – 4 saat
export const GUN_BASI_SAAT = 5;           // "gün" 05:00'te başlar (günün ilki/sonu)
export const BOYUT_SINIRI = 30000;        // JSON uzunluğu (veri.js sınırı 32 KB)

export const SOZ_ANAHTARLARI = ['seviyorum', 'askim', 'sevgilim', 'canim', 'bebegim', 'ozledim', 'gunaydin', 'iyiGeceler', 'muah', 'ozur', 'tesekkur', 'gulme'];
export const SOZ_ILK_ANAHTARLARI = ['seviyorum', 'askim', 'sevgilim', 'canim', 'ozledim', 'gunaydin', 'iyiGeceler'];
const MESAJ_BASI_SINIR = 20; // bir mesajda aynı emojiden / sözden en çok

// ---------- Metin yardımcıları ----------
const SADE = { ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u', â: 'a', î: 'i', û: 'u' };
const SADE_RE = /[çğıöşüâîû]/g;

/** Türkçe küçük harf + 3 ve daha uzun harf tekrarını kısaltır ("çokkkk" → "çok"). */
export function kucult(s) {
  return String(s ?? '').toLocaleLowerCase('tr').replace(/(\p{L})\1{2,}/gu, '$1');
}
/** Sayım anahtarı: Türkçe harfler sadeleşir ("aşkım" = "askim"). */
export function sade(s) {
  return s.replace(SADE_RE, (c) => SADE[c]);
}

const DURAK = new Set([
  've', 'ile', 'de', 'da', 'ki', 'mi', 'mu', 'bu', 'su', 'o', 'ben', 'sen', 'bana', 'sana', 'beni', 'seni', 'bir', 'cok', 'ama',
  'ya', 'yani', 'ne', 'gibi', 'icin', 'daha', 'en', 'her', 'sey', 'var', 'yok', 'degil', 'evet', 'hayir', 'tamam',
  'tmm', 'tm', 'ok', 'okey', 'simdi', 'sonra', 'bi', 'zaten', 'kadar', 'bile', 'hep', 'hic', 'artik', 'nasil', 'neden',
  'niye', 'boyle', 'oyle', 'soyle', 'falan', 'filan', 'lan', 'abi', 'olur', 'oldu', 'olsun', 'onu', 'ona', 'biz', 'siz',
  'onlar', 'bizi', 'bize', 'benim', 'senin', 'onun', 'bende', 'sende', 'onda', 'benden', 'senden', 'bunu', 'buna', 'sunu', 'suna', 'mis', 'mus', 'misin', 'musun',
  'mi', 'midir', 'icin', 'diye', 'gibi', 'ise', 'eger', 'veya', 'hem', 'ayni', 'baya', 'bayagi', 'iste', 'hani', 'sanki',
  'dedim', 'dedin', 'diyor', 'dur', 'yaa', 'aaa', 'off', 'hmm', 'heh', 'iyi', 'tabi', 'tabii', 'peki', 'evt', 'hayr', 'yoo',
  'the', 'and', 'you', 'for', 'that', 'this', 'with', 'are', 'was', 'not', 'omitted', 'media', 'image', 'sticker',
  'https', 'http', 'www', 'com', 'dahil', 'edilmedi', 'message', 'deleted', 'edited', 'duzenlendi', 'mesaj',
]);

const SESLI = /[aeiou]/;
/** Gülme mi? "hahaha", "hehe", "dndjdj", "sjsj", "kdkd" (klavye ezmesi). Sade anahtar alır. */
export function gulmeMi(k) {
  if (/^(?:a?h[aei]){2,}h?$|^(?:ah){2,}a?$|^(?:j[aeij]){2,}$|^(?:k[aeik]){3,}$/.test(k)) return true;
  if (k.length < 4 || SESLI.test(k)) return false;
  if (new Set(k).size > 4) return false;
  for (let i = 0; i + 3 < k.length; i++) {
    if (k.slice(i, i + 2) === k.slice(i + 2, i + 4)) return true;
  }
  return /^(.)(.)(.)\1\2\3/.test(k);
}
/** Öpücük mü? muah, muack, muahhh, muawww… */
export function muahMi(k) {
  return /^mu+a+(?:h+|c?k+|w+h*)$/.test(k);
}

const SOZ_RE = {
  seviyorum: /(?:^|[^\p{L}])sevi+yo+ru+m+(?![\p{L}])/gu,
  askim: /(?:^|[^\p{L}])aski+m+(?![\p{L}])/gu,
  sevgilim: /(?:^|[^\p{L}])sevgili+m+(?![\p{L}])/gu,
  canim: /(?:^|[^\p{L}])cani+m+(?![\p{L}])/gu,
  bebegim: /(?:^|[^\p{L}])bebe[gk]i+m+(?![\p{L}])/gu,
  ozledim: /(?:^|[^\p{L}])ozledi+m+(?![\p{L}])/gu,
  gunaydin: /(?:^|[^\p{L}])(?:gu+n+ay+d[iy]*n+|gunoyi+|gnydn|gunaydi+n+)(?![\p{L}])/gu,
  iyiGeceler: /(?:^|[^\p{L}])iyi+ ?gece+le+r+(?![\p{L}])/gu,
  ozur: /(?:^|[^\p{L}])(?:ozur dilerim|pardon|kusura bakma)/gu,
  tesekkur: /(?:^|[^\p{L}])(?:tesekkur\p{L}*|tsk|tskler|sag ?ol\p{L}*|eyvallah)(?![\p{L}])/gu,
};
const KAHKAHA_EMOJI = /😂|🤣/gu;

function say(re, s) {
  re.lastIndex = 0;
  let n = 0;
  while (re.exec(s) && n < MESAJ_BASI_SINIR) n++;
  return n;
}

// Emoji: ten rengi ve ️ ayrı sayılmaz; ZWJ dizileri tek emoji.
const TEN_RE = /[\u{1F3FB}-\u{1F3FF}️︎]/gu;
const EMOJI_RE = /\p{Extended_Pictographic}(?:‍\p{Extended_Pictographic})*|\p{Regional_Indicator}{2}/gu;
/** Metindeki emojiler (sınırsız). */
export function emojiler(s) {
  return String(s ?? '').replace(TEN_RE, '').match(EMOJI_RE) || [];
}

const LINK_RE = /\b(?:https?:\/\/|www\.)\S+/gi;
const KELIME_RE = /\p{L}+/gu;

// ---------- Tarih yardımcıları ----------
const pad = (n) => String(n).padStart(2, '0');
const gunOf = (t) => `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`;
const ayOf = (t) => `${t.getFullYear()}-${pad(t.getMonth() + 1)}`;
const gunMs = (g) => { const [y, m, d] = g.split('-').map(Number); return Date.UTC(y, m - 1, d); };
const gunFark = (a, b) => Math.round((gunMs(b) - gunMs(a)) / 86400e3);
const gunEkle = (g, n) => { const t = new Date(gunMs(g) + n * 86400e3); return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`; };
const yuvarla = (x, b = 1) => Math.round(x * 10 ** b) / 10 ** b;

function enCok(map, n) {
  return [...map].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, n);
}

function yeniKisi() {
  return {
    mesaj: 0, harf: 0, kelime: 0, farkli: new Set(), medya: {}, silinen: 0, soru: 0,
    sohbetAcma: 0, gununIlk: 0, gununSon: 0,
    cevapToplam: 0, cevapSayi: 0, cevapAyni: 0, enBekletme: null,
    artArda: 0, enUzunSeri: { n: 0, an: null }, enUzunMesaj: { harf: 0, gun: null }, gece: 0,
    soz: Object.fromEntries(SOZ_ANAHTARLARI.map((k) => [k, 0])),
    sozIlk: Object.fromEntries(SOZ_ILK_ANAHTARLARI.map((k) => [k, null])),
    kelimeler: new Map(), yazim: new Map(), emojiler: new Map(),
    saat: new Array(24).fill(0), hafta: new Array(7).fill(0),
  };
}

/**
 * Parça parça hesaplayıcı. eslesme = { [dosyadakiAd]: clientId } (iki kişi). Eşlemede olmayan adlar atlanır.
 * h.ekle(mesaj) sırayla (eskiden yeniye); h.bitir() → özet.
 */
export function hesaplayici(eslesme, { bicim = null, saniye = false, aramalar = null, yukleyen = null, simdi = new Date() } = {}) {
  const ids = [...new Set(Object.values(eslesme || {}))];
  const kisi = Object.fromEntries(ids.map((id) => [id, yeniKisi()]));
  const gunluk = new Map();
  const aylik = {};
  let medyaTuruVar = false;
  let ilk = null;
  let onceki = null;    // { t, id }
  let seriId = null; let seriN = 0; let seriBas = null;
  let sohbetSayi = 0; let sohbetBas = null; let sohbetN = 0;
  let enUzunSohbet = null; let enHizliSohbet = null;
  let enUzunSessizlik = null;
  const gunIlkSon = new Map(); // mantıksal gün → [ilkId, sonId]
  let toplam = 0;
  let ilkMesaj = null;

  function sohbetKapat(sonT) {
    if (!sohbetBas) return;
    const dk = Math.max(0, Math.round((sonT - sohbetBas) / 60e3));
    if (!enUzunSohbet || dk > enUzunSohbet.dk) enUzunSohbet = { dk, mesaj: sohbetN, bas: sohbetBas.toISOString() };
    // En az 30 dk: dakika duyarlı dışa aktarımda tek dakikalık medya yığını "en hızlı" sayılmasın.
    if (sohbetN >= 30 && dk >= 30) {
      const hiz = sohbetN / dk;
      if (!enHizliSohbet || hiz > enHizliSohbet.mesaj / enHizliSohbet.dk) enHizliSohbet = { dk, mesaj: sohbetN, bas: sohbetBas.toISOString() };
    }
  }

  function ekle({ t, kim, m }) {
    const id = eslesme[kim];
    if (!id || !(t instanceof Date)) return;
    const k = kisi[id];
    const ms = t.getTime();
    toplam++;
    if (!ilk) ilk = t;
    if (!ilkMesaj) ilkMesaj = { kim: id, gun: gunOf(t), an: t.toISOString() };
    const gun = gunOf(t);
    gunluk.set(gun, (gunluk.get(gun) || 0) + 1);
    const ay = ayOf(t);
    (aylik[ay] ||= {})[id] = (aylik[ay][id] || 0) + 1;
    const saat = t.getHours();
    k.saat[saat]++;
    k.hafta[(t.getDay() + 6) % 7]++;
    if (saat < GUN_BASI_SAAT) k.gece++;
    k.mesaj++;

    // Mantıksal gün (05:00'te başlar): ilk ve son yazan.
    const mg = gunOf(new Date(ms - GUN_BASI_SAAT * 3600e3));
    const is = gunIlkSon.get(mg);
    if (is) is[1] = id; else gunIlkSon.set(mg, [id, id]);

    if (onceki) {
      const ara = ms - onceki.t;
      if (ara >= ACMA_MS) k.sohbetAcma++;
      if (!enUzunSessizlik || ara > enUzunSessizlik.ms) enUzunSessizlik = { ms: ara, bas: new Date(onceki.t).toISOString() };
      if (onceki.id !== id) {
        if (ara <= CEVAP_SINIR_MS && ara >= 0) {
          k.cevapToplam += ara;
          k.cevapSayi++;
          const ayni = saniye ? ara < 60e3 : ara < 60e3 && Math.floor(ms / 60e3) === Math.floor(onceki.t / 60e3);
          if (ayni) k.cevapAyni++;
          if (!k.enBekletme || ara > k.enBekletme.ms) k.enBekletme = { ms: ara, an: t.toISOString() };
        }
      } else if (ara >= ART_ARDA_MIN_MS && ara <= ACMA_MS) {
        k.artArda++;
      }
      if (ara > SOHBET_ARA_MS) {
        sohbetKapat(new Date(onceki.t));
        sohbetBas = null;
      }
    }
    if (!sohbetBas) { sohbetBas = t; sohbetN = 0; sohbetSayi++; }
    sohbetN++;

    if (seriId === id) seriN++;
    else { seriId = id; seriN = 1; seriBas = t; }
    if (seriN > k.enUzunSeri.n) k.enUzunSeri = { n: seriN, an: seriBas.toISOString() };

    onceki = { t: ms, id };

    // İçerik
    const tur = icerikTuru(m);
    if (tur.tur === 'silinen') { k.silinen++; return; }
    if (tur.tur === 'medya') {
      if (tur.medya !== 'medya') medyaTuruVar = true;
      k.medya[tur.medya] = (k.medya[tur.medya] || 0) + 1;
      return;
    }
    const metin = String(m ?? '');
    const harf = [...metin].length;
    k.harf += harf;
    if (harf > k.enUzunMesaj.harf) k.enUzunMesaj = { harf, gun };
    if (metin.includes('?')) k.soru++;

    const kucuk = kucult(metin.replace(LINK_RE, ' '));
    const anahtarli = sade(kucuk);
    // Sözler
    for (const [ad, re] of Object.entries(SOZ_RE)) {
      const n = say(re, anahtarli);
      if (n) {
        k.soz[ad] += n;
        if (ad in k.sozIlk && !k.sozIlk[ad]) k.sozIlk[ad] = t.toISOString();
      }
    }
    let gulme = Math.min(MESAJ_BASI_SINIR, (metin.match(KAHKAHA_EMOJI) || []).length);
    let muah = 0;
    // Kelimeler
    KELIME_RE.lastIndex = 0;
    let w;
    while ((w = KELIME_RE.exec(kucuk))) {
      const yazim = w[0];
      const anahtar = sade(yazim);
      k.kelime++;
      if (gulmeMi(anahtar)) { gulme++; continue; }
      if (muahMi(anahtar)) { muah++; continue; }
      if (anahtar.length >= 2) k.farkli.add(anahtar);
      if (anahtar.length < 3 || DURAK.has(anahtar)) continue;
      k.kelimeler.set(anahtar, (k.kelimeler.get(anahtar) || 0) + 1);
      let y = k.yazim.get(anahtar);
      if (!y) { y = new Map(); k.yazim.set(anahtar, y); }
      y.set(yazim, (y.get(yazim) || 0) + 1);
    }
    if (gulme) k.soz.gulme += Math.min(MESAJ_BASI_SINIR, gulme);
    if (muah) {
      k.soz.muah += Math.min(MESAJ_BASI_SINIR, muah);
    }
    // Emojiler (mesaj başı aynı emojiden en çok 20)
    const ems = emojiler(metin);
    if (ems.length) {
      const bu = new Map();
      for (const e of ems) bu.set(e, Math.min(MESAJ_BASI_SINIR, (bu.get(e) || 0) + 1));
      for (const [e, n] of bu) k.emojiler.set(e, (k.emojiler.get(e) || 0) + n);
    }
  }

  function bitir() {
    if (onceki) sohbetKapat(new Date(onceki.t));
    for (const [, [ilkId, sonId]] of gunIlkSon) {
      kisi[ilkId].gununIlk++;
      kisi[sonId].gununSon++;
    }
    const gunler = [...gunluk.keys()].sort();
    const ilkGun = gunler[0] || null;
    const sonGun = gunler.at(-1) || null;
    const gunSayisi = ilkGun ? gunFark(ilkGun, sonGun) + 1 : 0;

    // Seriler: kesintisiz konuşulan gün.
    let enUzun = { gun: 0, bas: null, bit: null };
    let n = 0; let bas = null; let prev = null;
    for (const g of gunler) {
      if (prev && gunEkle(prev, 1) === g) n++;
      else { n = 1; bas = g; }
      if (n > enUzun.gun) enUzun = { gun: n, bas, bit: g };
      prev = g;
    }
    const guncel = sonGun ? n : 0;

    const ozetKisi = {};
    for (const id of ids) {
      const k = kisi[id];
      const yazimSec = (anahtar) => enCok(k.yazim.get(anahtar), 1)[0]?.[0] || anahtar;
      ozetKisi[id] = {
        mesaj: k.mesaj, harf: k.harf, kelime: k.kelime, farkliKelime: k.farkli.size,
        medya: k.medya, silinen: k.silinen, soru: k.soru,
        sohbetAcma: k.sohbetAcma, gununIlk: k.gununIlk, gununSon: k.gununSon,
        cevapOrtDk: k.cevapSayi ? yuvarla(k.cevapToplam / k.cevapSayi / 60e3) : null,
        cevapAyniDk: k.cevapSayi ? Math.round((k.cevapAyni / k.cevapSayi) * 100) : null,
        enBekletme: k.enBekletme ? { dk: Math.round(k.enBekletme.ms / 60e3), an: k.enBekletme.an } : null,
        artArda: k.artArda,
        enUzunSeri: k.enUzunSeri,
        enUzunMesaj: k.enUzunMesaj,
        gece: k.gece,
        soz: k.soz,
        sozIlk: k.sozIlk,
        kelimeler: enCok(k.kelimeler, 15).map(([a, c]) => [yazimSec(a), c]),
        emojiler: enCok(k.emojiler, 8),
      };
    }
    const saat = Object.fromEntries(ids.map((id) => [id, kisi[id].saat]));
    const haftaGunu = Object.fromEntries(ids.map((id) => [id, kisi[id].hafta]));
    const ozet = {
      v: OZET_SURUM,
      at: simdi.toISOString(),
      yukleyen,
      kaynak: {
        bicim, ilk: ilkGun, son: sonGun, mesaj: toplam, gun: gunSayisi, konusulanGun: gunler.length,
        medyaTuru: medyaTuruVar, saniye: !!saniye,
      },
      ilkMesaj: ilkMesaj ? { kim: ilkMesaj.kim, gun: ilkMesaj.gun } : null,
      gunluk: Object.fromEntries(gunler.map((g) => [g, gunluk.get(g)])),
      aylik,
      saat,
      haftaGunu,
      enYogunGunler: enCok(gunluk, 5),
      seri: { enUzun, guncel },
      sessizlik: {
        enUzunSaat: enUzunSessizlik ? yuvarla(enUzunSessizlik.ms / 3600e3) : 0,
        bas: enUzunSessizlik?.bas || null,
        sessizGun: gunSayisi - gunler.length,
      },
      sohbet: { sayi: sohbetSayi, enUzun: enUzunSohbet, enHizli: enHizliSohbet },
      arama: bicim === 'ios' && Array.isArray(aramalar) ? aramalar.length : null,
      kisi: ozetKisi,
    };
    return boyutaSigdir(ozet);
  }

  return { ekle, bitir };
}

/**
 * Belge sınırı aşılırsa (çok uzun geçmiş) ısı haritası son günlerle kısaltılır; `kaynak.gunlukKesik` = kalan ilk gün.
 * Diğer alanlar sınırlı boydadır.
 */
export function boyutaSigdir(ozet, sinir = BOYUT_SINIRI) {
  if (JSON.stringify(ozet).length < sinir) return ozet;
  const gunler = Object.keys(ozet.gunluk);
  let lo = 0;
  let hi = gunler.length;
  // İkili arama: sığan en çok gün.
  while (lo < hi) {
    const orta = Math.ceil((lo + hi) / 2);
    const deneme = { ...ozet, gunluk: Object.fromEntries(gunler.slice(-orta).map((g) => [g, ozet.gunluk[g]])) };
    if (JSON.stringify(deneme).length < sinir - 60) lo = orta; else hi = orta - 1;
  }
  const kalan = gunler.slice(-lo);
  return {
    ...ozet,
    gunluk: Object.fromEntries(kalan.map((g) => [g, ozet.gunluk[g]])),
    kaynak: { ...ozet.kaynak, gunlukKesik: kalan[0] || null },
  };
}

/** Tek seferde hesap (küçük veri ve testler). ayr = ayristir() çıktısı. */
export function hesapla(ayr, eslesme, opts = {}) {
  const h = hesaplayici(eslesme, { bicim: ayr?.bicim, saniye: ayr?.saniye, aramalar: ayr?.aramalar, ...opts });
  for (const m of ayr?.mesajlar || []) h.ekle(m);
  return h.bitir();
}

/** Parça parça hesap: araya `await` koyar. ilerleme(0..1). */
export async function hesaplaParcali(ayr, eslesme, { ilerleme = null, parca = 4000, bekle = () => new Promise((r) => setTimeout(r, 0)), ...opts } = {}) {
  const h = hesaplayici(eslesme, { bicim: ayr?.bicim, saniye: ayr?.saniye, aramalar: ayr?.aramalar, ...opts });
  const l = ayr?.mesajlar || [];
  for (let i = 0; i < l.length; i += parca) {
    const bit = Math.min(l.length, i + parca);
    for (let j = i; j < bit; j++) h.ekle(l[j]);
    ilerleme?.(bit / (l.length || 1));
    if (bit < l.length) await bekle();
  }
  return h.bitir();
}

/**
 * Ekrandaki sıra: [ben, partner] anahtarları. Bakanın clientId'si özette yoksa yükleyen partnerdir.
 */
export function taraflar(ozet, benId) {
  const ids = Object.keys(ozet?.kisi || {});
  if (ids.includes(benId)) return [benId, ids.find((x) => x !== benId) ?? null];
  if (ozet?.yukleyen && ids.includes(ozet.yukleyen)) return [ids.find((x) => x !== ozet.yukleyen) ?? null, ozet.yukleyen];
  return [ids[0] ?? null, ids[1] ?? null];
}
