// Kelime Düellosu: saf durum makinesi. DOM yok; Node'da test edilir.
//
// Her oyuncu karşısına 5 harfli gizli kelime seçer; ikisi de seçince aynı anda tahmin başlar.
// gizli[i] = i. oyuncunun SEÇTİĞİ kelime (karşısındaki bulmaya çalışır). tahmin[i] = i. oyuncunun tahminleri.
// Ev sahibi hakemdir: iki gizliyi de tutar, geri bildirimi o hesaplar.
// Gizlilik: gizli kelimeler yalnız ev sahibinin bellekteki durumunda durur. Misafire ve kayda (oyunkayit)
// giden görünümde (gorunum) gizli yoktur; karşının tahmin harfleri de oyun bitene dek gitmez (yalnız renkler).
// Kayıttan dönen ev sahibinde gizli eksikse (eksik[i]) sahibi kelimesini yeniden yollar (sec); önceki
// tahminlerle tutarlı değilse kabul edilmez.
import { kelimeVar } from './sozluk.js';
import { seat, isNewer } from './koltuk.js';

export const HARF = 5;
export const HAK = 6;
export const KIND = 'duello';
export const ALFABE = 'abcçdefgğhıijklmnoöprsştuüvyz';
export const BULDU = 'd'.repeat(HARF);
const FAZLAR = new Set(['secim', 'oyun', 'bitti']);

// ---------- Türkçe harf ----------

/** tr-TR küçük harf: I→ı, İ→i (JS varsayılanı İ'yi "i̇" yapar). */
export function trKucuk(s) {
  return String(s ?? '').replace(/I/g, 'ı').replace(/İ/g, 'i').toLowerCase().normalize('NFC');
}

/** tr-TR büyük harf: i→İ, ı→I. */
export function trBuyuk(s) {
  return String(s ?? '').replace(/i/g, 'İ').replace(/ı/g, 'I').toUpperCase();
}

export function harfMi(h) {
  return typeof h === 'string' && h.length === 1 && ALFABE.includes(h);
}

/** Klavye tuşu (KeyboardEvent.key) → tr küçük harf | null. */
export function normalizeTus(key) {
  if (typeof key !== 'string' || key.length !== 1) return null;
  const h = trKucuk(key);
  return harfMi(h) ? h : null;
}

// ---------- Geri bildirim ----------

/**
 * Tahminin gizliye göre geri bildirimi: her harf için 'd' (doğru yer), 'v' (kelimede var, başka yerde), 'y' (yok).
 * Tekrarlı harf: önce doğru yerdekiler sayılır; kalan adet kadar 'v' verilir, fazlası 'y'.
 */
export function geriBildirim(tahmin, gizli) {
  const t = [...tahmin];
  const g = [...gizli];
  const r = Array(t.length).fill('y');
  const kalan = new Map();
  for (let i = 0; i < t.length; i++) {
    if (t[i] === g[i]) r[i] = 'd';
    else kalan.set(g[i], (kalan.get(g[i]) || 0) + 1);
  }
  for (let i = 0; i < t.length; i++) {
    if (r[i] === 'd') continue;
    const n = kalan.get(t[i]) || 0;
    if (n > 0) {
      r[i] = 'v';
      kalan.set(t[i], n - 1);
    }
  }
  return r.join('');
}

const SIRA = { y: 1, v: 2, d: 3 };

/** Tahminlerden harf → en iyi bilgi ('d' > 'v' > 'y'). Harfsiz (gizlenmiş) satırlar yok sayılır. */
export function klavyeDurumu(tahminler) {
  const out = {};
  for (const t of tahminler || []) {
    if (!t?.k) continue;
    [...t.k].forEach((h, i) => {
      const r = t.r[i];
      if (!out[h] || SIRA[r] > SIRA[out[h]]) out[h] = r;
    });
  }
  return out;
}

// ---------- Durum ----------

/** Bir oyuncunun tahmin listesinin özeti. */
export function oyuncuDurumu(liste) {
  const l = liste || [];
  const i = l.findIndex((t) => t.r === BULDU);
  const bulundu = i >= 0 ? i + 1 : 0;
  return { bulundu, kullanilan: l.length, bitti: bulundu > 0 || l.length >= HAK };
}

const enAz = (d) => d.bulundu || (d.bitti ? HAK + 1 : d.kullanilan + 1);
const enCok = (d) => d.bulundu || HAK + 1;

/** Sonuç belli mi? -> null (sürüyor) | { kazanan: -1|0|1, puan: [n|null, n|null] } (n = kaçıncı denemede buldu). */
export function sonucBul(s) {
  const d = s.tahmin.map(oyuncuDurumu);
  const puan = d.map((x) => x.bulundu || null);
  if (d[0].bitti && d[1].bitti) {
    const a = enCok(d[0]);
    const b = enCok(d[1]);
    return { kazanan: a === b ? -1 : a < b ? 0 : 1, puan };
  }
  if (enAz(d[0]) > enCok(d[1])) return { kazanan: 1, puan };
  if (enAz(d[1]) > enCok(d[0])) return { kazanan: 0, puan };
  return null;
}

export function yeniOyun({ players, names = {}, no = 1, seq = 0, now = null, kimlik = 0 }) {
  return {
    v: 1,
    kind: KIND,
    no,
    seq: seq + 1,
    at: now,
    kimlik,
    players: players.slice(0, 2),
    names: { ...names },
    faz: 'secim',
    hazir: [false, false],
    gizli: [null, null],
    tahmin: [[], []],
    sonuc: null,
  };
}

export function initialState({ players, names, now = null, kimlik = 0 }) {
  return yeniOyun({ players, names, now, kimlik });
}

function bump(s, now, patch) {
  return { ...s, ...patch, seq: s.seq + 1, at: now ?? s.at };
}
const setAt = (arr, i, v) => arr.map((x, j) => (j === i ? v : x));

/** Kelime, karşının şimdiye dek aldığı geri bildirimlerle tutarlı mı? (yeniden yollanan gizli için) */
export function tutarli(kelime, tahminler) {
  return (tahminler || []).every((t) => !t.k || geriBildirim(t.k, kelime) === t.r);
}

export function reduce(s, a) {
  switch (a?.type) {
    case 'sec': {
      const i = a.idx;
      if ((i !== 0 && i !== 1) || s.faz === 'bitti') return s;
      const k = trKucuk(a.kelime);
      if (!kelimeVar(k)) return s;
      if (s.faz === 'secim') {
        if (s.hazir[i] && s.gizli[i] === k) return s;
        const hazir = setAt(s.hazir, i, true);
        const gizli = setAt(s.gizli, i, k);
        return bump(s, a.now, { hazir, gizli, faz: hazir[0] && hazir[1] ? 'oyun' : 'secim' });
      }
      // oyun sürerken yalnız eksik gizli geri konur (kayıttan dönüş)
      if (!s.hazir[i] || s.gizli[i] || !tutarli(k, s.tahmin[1 - i])) return s;
      return bump(s, a.now, { gizli: setAt(s.gizli, i, k) });
    }
    case 'tahmin': {
      if (s.faz !== 'oyun') return s;
      const i = s.players.indexOf(a.by);
      if (i < 0) return s;
      const k = trKucuk(a.kelime);
      const hedef = s.gizli[1 - i];
      if (!kelimeVar(k) || !hedef) return s;
      const liste = s.tahmin[i];
      if (oyuncuDurumu(liste).bitti || liste.some((t) => t.k === k)) return s;
      const tahmin = setAt(s.tahmin, i, [...liste, { k, r: geriBildirim(k, hedef) }]);
      const sonuc = sonucBul({ ...s, tahmin });
      return bump(s, a.now, sonuc ? { tahmin, faz: 'bitti', sonuc } : { tahmin });
    }
    case 'yeni': {
      // a.no = isteyenin gördüğü oyun: iki taraf aynı anda "Tekrar" derse ikincisi yok sayılır.
      if (a.no !== s.no) return s;
      return yeniOyun({ players: s.players, names: s.names, no: s.no + 1, seq: s.seq, now: a.now, kimlik: a.kimlik ?? 0 });
    }
    case 'seat':
      return seat(s, a.ids, a.names);
    case 'load':
      return isNewer(a.s, s) && a.s.kind === s.kind ? a.s : s;
    default:
      return s;
  }
}

/** Ev sahibi: niyeti eyleme çevirir. by = gönderenin clientId'si. null = yok say. */
export function toAction(intent, by, s, { hostId, now = null, seed = 0 } = {}) {
  const host = !!by && by === hostId;
  switch (intent?.type) {
    case 'sec': {
      const own = s.players.indexOf(by);
      // ev sahibi kendi cihazında sakladığı misafir kelimesini idx ile geri koyabilir
      const idx = intent.idx === 0 || intent.idx === 1 ? intent.idx : own;
      if (idx < 0 || (!host && idx !== own)) return null;
      return { type: 'sec', idx, kelime: String(intent.kelime ?? ''), now };
    }
    case 'tahmin':
      return { type: 'tahmin', by, kelime: String(intent.kelime ?? ''), now };
    case 'yeni':
      return s.players.includes(by) ? { type: 'yeni', no: intent.no, kimlik: seed, now } : null;
    case 'seat':
      return host ? { type: 'seat', ids: intent.ids, names: intent.names } : null;
    case 'load':
      return host ? { type: 'load', s: intent.s } : null;
    default:
      return null;
  }
}

/**
 * Dışarıya giden görünüm. izleyen = görünümü alacak clientId; null = kayıt (oyunkayit).
 * - gizli hiçbir zaman yok; eksik[i] = i. oyuncu seçti ama ev sahibinde kelimesi yok.
 * - izleyenin kendi kelimesi `kendi` olarak gelir.
 * - oyun bitmeden izleyen dışındakilerin tahmin harfleri silinir (yalnız renk). Kayıtta harfler durur
 *   (sürdürmek için); kayıtta gizli olmadığından kelimeler yine açılmaz.
 * - bitince iki kelime `acik` ile açılır.
 */
export function gorunum(s, izleyen = null) {
  const { gizli, ...rest } = s;
  const out = { ...rest, eksik: s.hazir.map((h, i) => !!h && !gizli?.[i]) };
  if (s.faz === 'bitti') {
    out.acik = [gizli?.[0] ?? null, gizli?.[1] ?? null];
    return out;
  }
  if (izleyen != null) {
    const vi = s.players.indexOf(izleyen);
    out.tahmin = s.tahmin.map((l, i) => (i === vi ? l : l.map((t) => ({ r: t.r }))));
    if (vi >= 0 && gizli?.[vi]) out.kendi = gizli[vi];
  }
  return out;
}

/** Kayıttan (gorunum(s, null)) ev sahibi durumu: gizliler boş, görünüm alanları atılır. */
export function kayittanDurum(d) {
  const { eksik, kendi, acik, ...rest } = d;
  return { ...rest, gizli: [null, null] };
}

export function gecerliKayit(d) {
  return !!d && d.kind === KIND && d.v === 1 && typeof d.seq === 'number' && FAZLAR.has(d.faz)
    && Array.isArray(d.players) && d.players.length === 2
    && Array.isArray(d.hazir) && d.hazir.length === 2
    && Array.isArray(d.tahmin) && d.tahmin.length === 2 && d.tahmin.every(Array.isArray);
}

/** logGame için küçük özet. */
export function resultOf(s) {
  return { kazanan: s.sonuc?.kazanan ?? -1, puan: s.sonuc?.puan ?? [null, null], deneme: s.tahmin.map((l) => l.length), no: s.no };
}
