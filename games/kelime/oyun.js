// Kelime Zinciri: saf durum makinesi. DOM yok. Ev sahibi uygular, misafir yalnız çizer.
// Akış: kurulum → oyun (sıradaki yazar) → onay (partner "Geçerli mi?") → oyun … → bitti.
// Zamanlar ev sahibi saatiyle (ms). Zamanlayıcı eylemleri ('sure', 'onayZaman') schedule() ile gelir.
import { seat } from '../dorttas/oyun.js';
import { ONERILER } from './oneriler.js';

export const SURELER = [10, 20, 30, 0]; // sn; 0 = sınırsız
export const VARSAYILAN_SURE = 20;
export const CAN = 3;
export const ONAY_MS = 5000;      // partner bu sürede cevap vermezse kelime kabul
export const RED_MIN_MS = 5000;   // itirazdan sonra yazana en az bu kadar süre kalır
export const DEVAM_MIN_MS = 3000; // aradan dönünce en az bu kadar süre kalır
export const EN_KISA = 2;
export const EN_UZUN = 30;

export const MODLAR = {
  birlikte: { id: 'birlikte', ad: 'Birlikte', aciklama: 'Ortak zincir, ortak 3 can. En uzun zinciri kurun.' },
  karsi: { id: 'karsi', ad: 'Karşı karşıya', aciklama: 'Herkesin 3 canı var. Canı biten kaybeder.' },
};

export const KATEGORILER = [
  { id: 'serbest', ad: 'Serbest' },
  { id: 'hayvan', ad: 'Hayvanlar' },
  { id: 'yemek', ad: 'Yemekler' },
  { id: 'yer', ad: 'Şehirler/Ülkeler' },
  { id: 'isim', ad: 'İsimler' },
];

const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
export const modBul = (id) => (typeof id === 'string' && has(MODLAR, id) ? MODLAR[id] : null);
export const kategoriBul = (id) => KATEGORILER.find((k) => k.id === id) || null;

// ---------- Türkçe yazı kuralları ----------
const KATLA = { â: 'a', î: 'i', û: 'u' };
const HARFLER = /^[abcçdefgğhıijklmnoöprsştuüvyzâîû]+$/;

/** Kırpar, NFC yapar, Türkçe küçük harfe çevirir: I → ı, İ → i. */
export function kucuk(text) {
  return String(text ?? '').normalize('NFC').trim().toLocaleLowerCase('tr').normalize('NFC');
}

/** Ekranda büyük harf: i → İ, ı → I. */
export function buyuk(text) {
  return String(text ?? '').toLocaleUpperCase('tr');
}

/** Şapkalı harfi düz harfe indirir (zincir eşleşmesi için: â = a). */
export function katla(harf) {
  return KATLA[harf] || harf;
}

/** Zincirin sonraki harfinin kelimedeki yeri. Son harf 'ğ' ise ondan önceki harf. -1: yok. */
export function sonHarfYeri(kelime) {
  const k = kucuk(kelime);
  let i = k.length - 1;
  while (i >= 0 && k[i] === 'ğ') i--;
  return i;
}

/** Sonraki kelimenin başlaması gereken harf (şapkasız). */
export function sonHarf(kelime) {
  const k = kucuk(kelime);
  const i = sonHarfYeri(k);
  return i < 0 ? null : katla(k[i]);
}

/**
 * Kelimeyi kurallara göre denetler. harf = istenen ilk harf (null: serbest), kullanilan = zincirdekiler.
 * -> { ok: true, kelime } | { ok: false, neden, mesaj }
 */
export function kontrol(text, { harf = null, kullanilan = [] } = {}) {
  const k = kucuk(text);
  const hata = (neden, mesaj) => ({ ok: false, neden, mesaj });
  if (!k) return hata('bos', 'Bir kelime yaz.');
  if (!HARFLER.test(k)) return hata('harf', 'Yalnız harf kullan; boşluk, rakam yok.');
  if (k.length < EN_KISA) return hata('kisa', 'En az 2 harf olmalı.');
  if (k.length > EN_UZUN) return hata('uzun', 'Bu kelime çok uzun.');
  if (harf && katla(k[0]) !== harf) return hata('baslangic', `${buyuk(harf)} ile başlamalı.`);
  if (kullanilan.some((x) => kucuk(x) === k)) return hata('tekrar', 'Bu kelime zaten zincirde.');
  return { ok: true, kelime: k };
}

/** Harfe uyan, zincirde olmayan bir öneri. harf null ise herhangi bir harften. */
export function ipucuSec(harf, kullanilan = [], rnd = Math.random) {
  const used = new Set(kullanilan.map(kucuk));
  const havuz = harf ? (has(ONERILER, harf) ? ONERILER[harf] : []) : Object.values(ONERILER).flat();
  const bos = havuz.filter((k) => !used.has(k));
  return bos.length ? bos[Math.floor(rnd() * bos.length)] : null;
}

/** Puanı yazar: 11.5 → "11,5". */
export function puanYaz(p) {
  return String(Math.round((Number(p) || 0) * 2) / 2).replace('.', ',');
}

// ---------- Durum ----------
const sureMs = (s) => (s.ayar.sure > 0 ? s.ayar.sure * 1000 : 0);
const sonTarih = (s, now) => (s.ayar.sure > 0 ? now + sureMs(s) : null);
export const birlikteMi = (s) => s.ayar.mod === 'birlikte';
/** k. oyuncunun can kutusu: birlikte modda ortak (0). */
export const canYeri = (s, k) => (birlikteMi(s) ? 0 : k);
export const toplamPuan = (s) => s.puan[0] + s.puan[1];

export function initialState({ players = [], names = {}, rekor = 0, ayar = {} } = {}) {
  return {
    v: 1,
    players,
    names,
    oyun: 0,
    faz: 'kurulum',
    ayar: ayarBirlestir({ mod: 'birlikte', sure: VARSAYILAN_SURE, kategori: 'serbest' }, ayar),
    rekor: Number.isInteger(rekor) && rekor > 0 ? rekor : 0,
    yeniRekor: false,
    baslayan: 0,
    sira: 0,
    zincir: [],       // [{ k, by, ipucu }]
    harf: null,       // sıradaki kelimenin ilk harfi; null = serbest
    canlar: [CAN],
    puan: [0, 0],
    bekleyen: null,   // { k, by, ipucu, no, bitis, kalan } onay bekleyen kelime
    bitis: null,      // sıradakinin süresi (ms); null = sınırsız ya da yok
    durak: null,      // { ms } partner yokken ara; kalan süre
    kazanan: null,    // karşı karşıya: 0/1
    olay: null,       // { tur, by, k?, oto?, no } son olay (ekran ses/duyuru için)
    adim: 0,
  };
}

function ayarBirlestir(eski, yeni = {}) {
  const ayar = { ...eski };
  if (modBul(yeni.mod)) ayar.mod = yeni.mod;
  if (SURELER.includes(yeni.sure)) ayar.sure = yeni.sure;
  if (kategoriBul(yeni.kategori)) ayar.kategori = yeni.kategori;
  return ayar;
}

function olayla(s, tur, ekstra = {}) {
  const adim = s.adim + 1;
  return { ...s, adim, olay: { tur, no: adim, ...ekstra } };
}

function yeniOyun(s, now) {
  const oyun = s.oyun + 1;
  const baslayan = (oyun - 1) % 2; // her oyunda başlayan değişir
  return olayla({
    ...s,
    oyun,
    faz: 'oyun',
    baslayan,
    sira: baslayan,
    zincir: [],
    harf: null,
    canlar: birlikteMi(s) ? [CAN] : [CAN, CAN],
    puan: [0, 0],
    bekleyen: null,
    bitis: sonTarih(s, now),
    durak: null,
    kazanan: null,
    yeniRekor: false,
  }, 'basla', { by: baslayan });
}

function bitir(s, kazanan) {
  const n = s.zincir.length;
  const yeniRekor = birlikteMi(s) && n > s.rekor;
  return { ...s, faz: 'bitti', kazanan, bekleyen: null, bitis: null, durak: null, rekor: yeniRekor ? n : s.rekor, yeniRekor };
}

function kabul(s, now, oto) {
  const b = s.bekleyen;
  const puan = s.puan.slice();
  puan[b.by] += b.ipucu ? 0.5 : 1;
  return olayla({
    ...s,
    faz: 'oyun',
    zincir: [...s.zincir, { k: b.k, by: b.by, ipucu: b.ipucu }],
    puan,
    harf: sonHarf(b.k),
    sira: 1 - b.by,
    bekleyen: null,
    bitis: sonTarih(s, now),
  }, 'kabul', { by: b.by, k: b.k, oto });
}

function red(s, now) {
  const b = s.bekleyen;
  return olayla({
    ...s,
    faz: 'oyun',
    sira: b.by, // sıra yazanda kalır
    bekleyen: null,
    bitis: b.kalan == null ? null : now + Math.max(b.kalan, RED_MIN_MS),
  }, 'red', { by: b.by, k: b.k });
}

// Süre doldu ya da pas: sıradakinin (birlikte: ortak) canı gider, sıra öbürüne geçer, harf aynı kalır.
function canKaybi(s, now, tur) {
  const k = s.sira;
  const yer = canYeri(s, k);
  const canlar = s.canlar.slice();
  canlar[yer] = Math.max(0, canlar[yer] - 1);
  const t = olayla({ ...s, canlar }, tur, { by: k });
  if (canlar[yer] === 0) return bitir(t, birlikteMi(s) ? null : 1 - k);
  return { ...t, sira: 1 - k, bitis: sonTarih(s, now) };
}

export function reduce(s, a) {
  const oynuyor = s.faz === 'oyun' || s.faz === 'onay';
  switch (a?.type) {
    case 'kelime': {
      if (s.faz !== 'oyun' || s.durak || s.players[s.sira] !== a.by) return s;
      if (s.bitis != null && a.now >= s.bitis) return s; // geç kaldı; zamanlayıcı canı alır
      const r = kontrol(a.k, { harf: s.harf, kullanilan: s.zincir.map((z) => z.k) });
      if (!r.ok) return s;
      const t = olayla(s, 'yazdi', { by: s.sira, k: r.kelime });
      return {
        ...t,
        faz: 'onay',
        bitis: null,
        bekleyen: {
          k: r.kelime, by: s.sira, ipucu: !!a.ipucu, no: t.adim,
          bitis: a.now + ONAY_MS, kalan: s.bitis == null ? null : s.bitis - a.now,
        },
      };
    }
    case 'onay': {
      const b = s.bekleyen;
      if (s.faz !== 'onay' || s.durak || !b || a.no !== b.no) return s;
      if (a.by !== s.players[1 - b.by]) return s; // yalnız partner onaylar
      return a.evet ? kabul(s, a.now, false) : red(s, a.now);
    }
    case 'onayZaman':
      if (s.faz !== 'onay' || s.durak || !s.bekleyen || a.now < s.bekleyen.bitis) return s;
      return kabul(s, a.now, true);
    case 'sure':
      if (s.faz !== 'oyun' || s.durak || s.bitis == null || a.now < s.bitis) return s;
      return canKaybi(s, a.now, 'sure');
    case 'pas':
      if (s.faz !== 'oyun' || s.durak || s.players[s.sira] !== a.by) return s;
      return canKaybi(s, a.now, 'pas');
    case 'ayar': {
      if (oynuyor) return s;
      const ayar = ayarBirlestir(s.ayar, a.ayar);
      if (ayar.mod === s.ayar.mod && ayar.sure === s.ayar.sure && ayar.kategori === s.ayar.kategori) return s;
      return { ...s, ayar };
    }
    case 'yeni':
      // a.oyun = isteyenin gördüğü oyun: iki taraf aynı anda "Başla/Tekrar" derse ikincisi yok sayılır.
      if (a.oyun !== s.oyun || oynuyor) return s;
      return yeniOyun(s, a.now);
    case 'kurulum':
      if (a.oyun !== s.oyun || s.faz === 'kurulum') return s;
      return olayla({ ...s, faz: 'kurulum', bekleyen: null, bitis: null, durak: null }, 'kurulum');
    case 'rekor':
      if (!Number.isInteger(a.n) || a.n <= s.rekor || a.n > 9999) return s;
      return { ...s, rekor: a.n };
    case 'durdur': {
      if (s.durak || !oynuyor) return s;
      const hedef = s.faz === 'onay' ? s.bekleyen.bitis : s.bitis;
      return {
        ...s,
        durak: { ms: hedef == null ? null : Math.max(0, hedef - a.now) },
        bitis: null,
        bekleyen: s.bekleyen && { ...s.bekleyen, bitis: null },
      };
    }
    case 'devam': {
      if (!s.durak) return s;
      const ms = s.durak.ms == null ? null : Math.max(s.durak.ms, DEVAM_MIN_MS);
      if (s.faz === 'onay') return { ...s, durak: null, bekleyen: { ...s.bekleyen, bitis: a.now + ms } };
      return { ...s, durak: null, bitis: ms == null ? null : a.now + ms };
    }
    case 'seat':
      return seat(s, a.ids, a.names);
    default:
      return s;
  }
}

// Ev sahibi: gelen niyeti (kendi ya da misafir) eyleme çevirir. null = yok say.
// Zamanlayıcı eylemleri ('sure', 'onayZaman') niyetle gelmez.
export function toAction(intent, by, s, { hostId, now }) {
  switch (intent?.type) {
    case 'kelime':
      return typeof intent.k === 'string' ? { type: 'kelime', by, k: intent.k.slice(0, 60), ipucu: !!intent.ipucu, now } : null;
    case 'onay':
      return { type: 'onay', by, evet: !!intent.evet, no: intent.no, now };
    case 'pas':
      return { type: 'pas', by, now };
    case 'ayar':
      return intent.ayar && typeof intent.ayar === 'object' ? { type: 'ayar', ayar: intent.ayar } : null;
    case 'yeni':
      return { type: 'yeni', oyun: intent.oyun, now };
    case 'kurulum':
      return { type: 'kurulum', oyun: intent.oyun };
    case 'rekor':
      return { type: 'rekor', n: intent.n };
    case 'durdur':
    case 'devam':
      return by && by === hostId ? { type: intent.type, now } : null;
    case 'seat':
      return by && by === hostId ? { type: 'seat', ids: intent.ids, names: intent.names } : null;
    default:
      return null;
  }
}

// Ev sahibi zamanlayıcısı: sıra süresi ve onay süresi. Anahtar bitiş anını içerir; değişince yeniden kurulur.
export function schedule(s) {
  if (s.durak) return null;
  if (s.faz === 'oyun' && s.bitis != null) return { key: `s:${s.oyun}:${s.bitis}`, at: s.bitis, action: { type: 'sure' } };
  if (s.faz === 'onay' && s.bekleyen?.bitis != null) {
    return { key: `o:${s.oyun}:${s.bekleyen.bitis}`, at: s.bekleyen.bitis, action: { type: 'onayZaman' } };
  }
  return null;
}

/** logGame için küçük özet. Birlikte modda rekor burada saklanır. */
export function resultOf(s) {
  const base = { mod: s.ayar.mod, sure: s.ayar.sure, kategori: s.ayar.kategori, zincir: s.zincir.length, puan: s.puan };
  return birlikteMi(s)
    ? { ...base, toplam: toplamPuan(s), rekor: s.rekor, yeniRekor: s.yeniRekor }
    : { ...base, kazanan: s.kazanan, canlar: s.canlar };
}
