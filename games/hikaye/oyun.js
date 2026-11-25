// Birlikte Hikâye: durum makinesi (saf). Ev sahibi uygular, misafir yalnız çizer.
//
// Oyun bir açılış cümlesiyle başlar. Sırayla birer cümle eklenir. HEDEF cümleye varınca hikâye biter;
// en az BITIR_EN_AZ cümleden sonra iki taraf da "Bitir" diyebilir. Kazanan yok: ortak oyun.
// Durum: players [ilk yazan, ikinci], acilis (ACILISLAR sırası), parts [{ by: koltuk, text }], turn,
//  phase 'play' | 'end', result { reason: 'hedef'|'bitir' } | null, seq.
import { seat, isNewer } from '../dama/oyun.js';

export { seat, isNewer };

export const HEDEF = 12;
export const BITIR_EN_AZ = 4;
export const EN_UZUN = 200;
export const EN_KISA = 2;

/** Açılış cümleleri: sıcak, hafif, her yaşa uygun. */
export const ACILISLAR = Object.freeze([
  'Bir sabah uyandığımızda mutfakta konuşan bir kedi bizi bekliyordu.',
  'Eski bir kitabın arasından iki kişilik bir tren bileti düştü.',
  'Yağmur öyle bir bastırdı ki küçük bir kafeye sığınmak zorunda kaldık.',
  'Telefonumuza tanımadığımız bir numaradan tek kelimelik bir mesaj geldi: "Hazır mısınız?"',
  'Balkonda bulduğumuz haritanın üstünde evimiz kırmızıyla işaretlenmişti.',
  'Bir gün bütün şehrin saatleri tam beş dakika geri kaldı.',
  'Tatile çıktık ama valizlerimiz başka birinin valizleriyle karıştı.',
  'Komşunun bahçesindeki ağaç bir gecede şeker vermeye başladı.',
  'Denize attığımız şişe, içinde bir cevapla geri döndü.',
  'Bir sabah aynaya baktık ve birbirimizin bedeninde uyandığımızı fark ettik.',
  'Piknik sepetini açtığımızda içinden küçük bir ejderha çıktı.',
  'Yıllar sonra çocukluk mahallemize döndüğümüzde her şey küçülmüştü, bir kapı hariç.',
  'Kayak merkezinde teleferik tam en tepede durdu.',
  'Radyoyu açtığımızda spiker bizim adlarımızı okuyordu.',
  'Bir dilek tuttuk ve ertesi gün gerçek oldu; ama biraz yanlış anlaşılmıştı.',
  'Eve gelen kargo kutusunun üstünde "On yıl sonra açın" yazıyordu.',
  'Bir yemek yarışmasına yanlışlıkla çift olarak kaydolmuştuk.',
  'Gece yarısı gökyüzünde yalnız ikimizin görebildiği bir yıldız belirdi.',
  'Asansör yedinci kata çıkacağına bizi hiç bilmediğimiz bir kata götürdü.',
  'Kütüphanede ödünç aldığımız kitabın son sayfası bizim hikâyemizi anlatıyordu.',
  'Çok sevdiğimiz o şarkıyı söyleyen sanatçı bir gün kapımızı çaldı.',
  'Kamp ateşinin başında otururken ormandan kibar bir ses "Yer var mı?" diye sordu.',
  'Bir sabah ikimiz de aynı rüyayı gördüğümüzü fark ettik.',
  'Pazardan aldığımız eski lamba silinince içinden uykulu bir cin çıktı.',
  'Tek bir gün için istediğimiz her dili konuşabiliyorduk.',
  'Vapurda yanımıza oturan yaşlı teyze, ilk buluşmamızı bizden iyi hatırlıyordu.',
  'Kar yağdı ve bütün şehirde yalnızca bizim sokağımız beyaza büründü.',
  'Fotoğraf makinesinden çıkan kareler, henüz yaşamadığımız günleri gösteriyordu.',
  'Bir kuş penceremize her gün başka bir harf bırakmaya başladı.',
  'Yolculukta navigasyon "Kalbinizin sesini dinleyin" deyip sustu.',
]);

/** Metni temizler: kontrol karakterleri ve fazla boşluk gider; uzunsa kesilir. Geçersizse ''. */
export function temizle(text) {
  if (typeof text !== 'string') return '';
  // eslint-disable-next-line no-control-regex
  const t = text.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, EN_UZUN).trim();
  return t.length >= EN_KISA ? t : '';
}

const acilisOf = (seed, onceki = -1) => {
  const n = ACILISLAR.length;
  let i = Number.isFinite(seed) ? Math.abs(Math.floor(seed)) % n : 0;
  if (i === onceki) i = (i + 1) % n;
  return i;
};

export function newGame({ players, names = {}, no = 1, seq = 0, now = null, seed = 0, onceki = -1 }) {
  return {
    v: 1,
    kind: 'hikaye',
    no,
    seq: seq + 1,
    at: now,
    startedAt: now,
    players: players.slice(0, 2),
    names: { ...names },
    acilis: acilisOf(seed, onceki),
    parts: [],
    turn: 0,
    ply: 0,
    phase: 'play',
    result: null,
    tally: {},
  };
}

export function initialState({ players, names, now = null, seed = 0 }) {
  return newGame({ players, names, now, seed });
}

function bump(s, now, patch) {
  return { ...s, ...patch, seq: s.seq + 1, at: now ?? s.at };
}

/** Bu oyuncu şimdi "Bitir" diyebilir mi? */
export function bitirebilir(s) {
  return s.phase === 'play' && s.parts.length >= BITIR_EN_AZ;
}

export function reduce(s, a) {
  switch (a?.type) {
    case 'yaz': {
      if (s.phase !== 'play' || s.players[s.turn] !== a.by) return s;
      const text = temizle(a.text);
      if (!text) return s;
      const parts = [...s.parts, { by: s.turn, text }];
      const done = parts.length >= HEDEF;
      return bump(s, a.now, {
        parts,
        turn: 1 - s.turn,
        ply: s.ply + 1,
        phase: done ? 'end' : 'play',
        result: done ? { reason: 'hedef' } : null,
        startedAt: s.startedAt ?? a.now ?? null,
      });
    }
    case 'bitir': {
      if (!bitirebilir(s) || !s.players.includes(a.by)) return s;
      return bump(s, a.now, { phase: 'end', result: { reason: 'bitir', by: s.players.indexOf(a.by) } });
    }
    case 'new': {
      // a.no = isteyenin gördüğü oyun: iki taraf aynı anda "Yeni hikâye" derse ikincisi yok sayılır.
      if (!s.players.includes(a.by) || a.no !== s.no) return s;
      return newGame({
        players: [s.players[1], s.players[0]],
        names: s.names,
        no: s.no + 1,
        seq: s.seq,
        now: a.now,
        seed: a.seed,
        onceki: s.acilis,
      });
    }
    case 'seat':
      return seat(s, a.ids, a.names);
    case 'load':
      return isNewer(a.s, s) && a.s.kind === s.kind ? a.s : s;
    default:
      return s;
  }
}

// Ev sahibi: niyeti eyleme çevirir. null = yok say.
export function toAction(intent, by, s, { hostId, now, seed }) {
  switch (intent?.type) {
    case 'yaz':
      return typeof intent.text === 'string' ? { type: 'yaz', by, text: intent.text.slice(0, EN_UZUN * 2), now } : null;
    case 'bitir':
      return { type: 'bitir', by, now };
    case 'new':
      return { type: 'new', by, no: intent.no, now, seed };
    case 'seat':
      return by === hostId ? { type: 'seat', ids: intent.ids, names: intent.names } : null;
    case 'load':
      return by === hostId ? { type: 'load', s: intent.s } : null;
    default:
      return null;
  }
}

/** Kayıttan gelen durum geçerli mi? */
export function validSaved(d) {
  return Number.isInteger(d?.acilis) && d.acilis >= 0 && d.acilis < ACILISLAR.length
    && Array.isArray(d.parts) && d.parts.length <= HEDEF
    && d.parts.every((p) => (p?.by === 0 || p?.by === 1) && typeof p.text === 'string' && p.text.length <= EN_UZUN)
    && Array.isArray(d.players) && (d.turn === 0 || d.turn === 1);
}

/** Hikâyenin tam metni (paylaşmak için). */
export function tamMetin(s) {
  return [ACILISLAR[s.acilis], ...s.parts.map((p) => p.text)].join(' ');
}

/** Sıra partnere geçince ona gidecek bildirim. by = değişikliği yapan, ad(id) = görünen ad. */
export function notice(prev, s, { by, ad }) {
  if (s.phase === 'end' && prev.phase !== 'end') {
    return { baslik: 'Hikâyeniz bitti', metin: `Birlikte Hikâye: ${s.parts.length} cümlelik hikâyeniz hazır` };
  }
  if (s.no !== prev.no) return { baslik: 'Yeni hikâye', metin: `Birlikte Hikâye: ${ad(by)} yeni hikâye başlattı · ilk cümle senin` };
  return { baslik: 'Sıra sende', metin: `Birlikte Hikâye: ${ad(by)} bir cümle ekledi (${s.parts.length}/${HEDEF})` };
}

export function resultOf(s) {
  return { reason: s.result?.reason ?? null, cumle: s.parts.length, no: s.no, acilis: s.acilis };
}
