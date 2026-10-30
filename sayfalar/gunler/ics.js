// Takvime ekle: özel günlerden RFC 5545 .ics metni (saf; DOM yok, Node'da test edilir: tests/ics-*).
// Tekrar kuralı js/core/gunler.js kırpmasıyla aynı: ayda olmayan gün → ayın son günü; 29 Şubat → 28 Şubat.
// Doğum günleri ve kilometre taşları ./mantik.js ve gunler.js'teki hesaplardan gelir.
import { parseDay, toDay, addDays, nextOccurrence, milestonesBetween } from '../../js/core/gunler.js';
import { dogumGunleri, turEmoji, HATIRLATMALAR, TAS_EMOJI } from './mantik.js';

export const ICS_DOSYA = 'biz-ikimiz.ics';
export const ICS_TUR = 'text/calendar';

const CRLF = '\r\n';
const UID_SONU = '@biz-ikimiz';
const HATIRLAT_IDS = new Set(HATIRLATMALAR.map((x) => x.id));
const HATIRLAT_SAAT = 9; // mantik.js hatirlatmalar ile aynı: sabah 09.00
const TAS_ARALIK_GUN = 3652; // kilometre taşları: bugünden ~10 yıl
const BULUSMA_MS = 3600000; // buluşma etkinliği 1 saat

const pad = (n, w = 2) => String(n).padStart(w, '0');
const gunIcs = (day) => day.replace(/-/g, '');

/** TEXT kaçışı (RFC 5545 §3.3.11): \ ; , ve satır sonu (\n). Diğer denetim karakterleri atılır. */
export function icsKacis(s) {
  return String(s ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

const oktet = (cp) => (cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4);

/**
 * Satır katlama (§3.1): en çok 75 oktet (UTF-8). Devam satırı bir boşlukla başlar (boşluk + 74).
 * Kod noktası sınırında böler; çok baytlı karakter bölünmez.
 */
export function icsKatla(satir) {
  const parcalar = [];
  let cur = '';
  let n = 0;
  let sinir = 75;
  for (const ch of satir) {
    const b = oktet(ch.codePointAt(0));
    if (n + b > sinir) {
      parcalar.push(cur);
      cur = '';
      n = 0;
      sinir = 74;
    }
    cur += ch;
    n += b;
  }
  parcalar.push(cur);
  return parcalar.join(`${CRLF} `);
}

/** An (Date | ms | ISO) → 'YYYYMMDDTHHMMSSZ' (UTC). */
export function icsZaman(an) {
  const d = new Date(typeof an === 'string' ? Date.parse(an) : an instanceof Date ? an.getTime() : an);
  return `${pad(d.getUTCFullYear(), 4)}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`
    + `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}

/**
 * Tekrar → RRULE değeri | null. 'yil' (varsayılan) YEARLY, 'ay' MONTHLY, 'yok' null.
 * RFC 5545 geçersiz günü (30 Şubat) atlar; gunler.js ise ayın son gününe kırpar. Kırpma şöyle yazılır:
 *   29 Şubat, yıllık → BYMONTH=2;BYMONTHDAY=-1 (artık olmayan yılda 28 Şubat)
 *   ayın 31'i, aylık → BYMONTHDAY=-1 (her ayın son günü)
 *   ayın 29'u / 30'u, aylık → BYMONTHDAY=28..d;BYSETPOS=-1 (ayda var olan, d'yi geçmeyen en büyük gün)
 */
export function tekrarKurali(tarih, tekrar = 'yil') {
  const p = parseDay(tarih);
  if (!p || tekrar === 'yok') return null;
  if (tekrar === 'ay') {
    if (p.d === 31) return 'FREQ=MONTHLY;BYMONTHDAY=-1';
    if (p.d > 28) return `FREQ=MONTHLY;BYMONTHDAY=${[28, 29, 30].filter((x) => x <= p.d).join(',')};BYSETPOS=-1`;
    return 'FREQ=MONTHLY';
  }
  if (p.m === 2 && p.d === 29) return 'FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=-1';
  return 'FREQ=YEARLY';
}

/** Hatırlatma (kaç gün önce) → tüm gün başlangıcına göre o günün 09:00'ı: 0 → PT9H, 1 → -PT15H, 7 → -P6DT15H. */
export function alarmTetik(gunOnce) {
  if (gunOnce === 0) return `PT${HATIRLAT_SAAT}H`;
  const gun = gunOnce - 1;
  return `-P${gun ? `${gun}D` : ''}T${24 - HATIRLAT_SAAT}H`;
}

/** mantik.js hatirlatmalar ile aynı: dizi yoksa gününde; yalnız 0/1/7, tekil, sıralı. */
function alarmListesi(h) {
  if (!Array.isArray(h)) return [0];
  return [...new Set(h)].filter((x) => HATIRLAT_IDS.has(x)).sort((a, b) => a - b);
}

/**
 * Özel gün belgesi (ya da dogumGunleri sanal belgesi) → olay | null.
 * Olay: { uid, baslik, aciklama, gun: 'YYYY-MM-DD', kural, alarmlar } (tüm gün).
 */
export function gunOlayi(doc) {
  const d = doc?.data || {};
  if (!doc?.id || !parseDay(d.tarih)) return null;
  return {
    uid: `${doc.id}${UID_SONU}`,
    baslik: `${d.emoji || turEmoji(d.tur || 'ozel')} ${d.baslik || 'Özel gün'}`,
    aciklama: d.not || '',
    gun: d.tarih,
    kural: tekrarKurali(d.tarih, d.tekrar || 'yil'),
    alarmlar: alarmListesi(d.hatirlat),
  };
}

/** Gelecekteki buluşma → saatli olay (UTC). UID buluşma anını içerir: her buluşma ayrı, aynısı tekrar eklenmez. */
function bulusmaOlayi(cift, simdi) {
  const bas = Date.parse(cift?.bulusma);
  const now = simdi instanceof Date ? simdi.getTime() : Number(simdi);
  if (!Number.isFinite(bas) || bas <= now) return null;
  return {
    uid: `bulusma-${icsZaman(bas)}${UID_SONU}`,
    baslik: '💞 Buluşmamız',
    aciklama: cift.bulusmaNotu || '',
    bas,
    bit: bas + BULUSMA_MS,
    alarmlar: [],
  };
}

/** Kilometre taşları (gün sayıları + yıl dönümleri), bugünden ~10 yıl. UID başlangıcı içerir. */
function tasOlaylari(baslangic, bugun) {
  if (!parseDay(baslangic)) return [];
  return milestonesBetween(baslangic, bugun, addDays(bugun, TAS_ARALIK_GUN)).map((m) => ({
    uid: `tas-${m.tur}-${m.n}-${gunIcs(baslangic)}${UID_SONU}`,
    baslik: `${TAS_EMOJI[m.tur] || '✨'} ${m.baslik}`,
    aciklama: '',
    gun: m.date,
    kural: null,
    alarmlar: [0],
  }));
}

/**
 * "Tümünü takvime aktar" olayları: özel günler (geçmişte kalmış tek seferlikler hariç), doğum günleri,
 * gelecekteki buluşma; taslar: true ise kilometre taşları. -> [olay]
 */
export function icsOlaylari({ gunler = [], kisiler = [], baslangic = null, cift = {}, taslar = false, bugun = new Date(), simdi = new Date() } = {}) {
  const today = typeof bugun === 'string' ? bugun : toDay(bugun);
  const out = [];
  for (const g of gunler || []) {
    const d = g?.data || {};
    if (!nextOccurrence(d.tarih, d.tekrar || 'yil', today)) continue;
    const o = gunOlayi(g);
    if (o) out.push(o);
  }
  for (const g of dogumGunleri(kisiler, gunler)) out.push(gunOlayi(g));
  const b = bulusmaOlayi(cift, simdi);
  if (b) out.push(b);
  if (taslar) out.push(...tasOlaylari(baslangic, today));
  return out;
}

function etkinlik(o, damga) {
  const s = ['BEGIN:VEVENT', `UID:${icsKacis(o.uid)}`, `DTSTAMP:${damga}`];
  if (o.gun) s.push(`DTSTART;VALUE=DATE:${gunIcs(o.gun)}`, `DTEND;VALUE=DATE:${gunIcs(addDays(o.gun, 1))}`);
  else s.push(`DTSTART:${icsZaman(o.bas)}`, `DTEND:${icsZaman(o.bit)}`);
  if (o.kural) s.push(`RRULE:${o.kural}`);
  s.push(`SUMMARY:${icsKacis(o.baslik)}`);
  if (o.aciklama) s.push(`DESCRIPTION:${icsKacis(o.aciklama)}`);
  if (o.gun) s.push('TRANSP:TRANSPARENT'); // tüm gün anma: takvimi "meşgul" göstermez
  for (const n of o.alarmlar || []) {
    s.push('BEGIN:VALARM', 'ACTION:DISPLAY', `TRIGGER;RELATED=START:${alarmTetik(n)}`, `DESCRIPTION:${icsKacis(o.baslik)}`, 'END:VALARM');
  }
  s.push('END:VEVENT');
  return s;
}

/** Olaylar → .ics metni: CRLF, 75 oktet katlama. simdi: DTSTAMP. null olaylar atlanır. */
export function icsMetni(olaylar = [], { simdi = new Date() } = {}) {
  const damga = icsZaman(simdi);
  const satirlar = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Biz Ikimiz//TR', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    `X-WR-CALNAME:${icsKacis('Biz İkimiz')}`, 'X-WR-TIMEZONE:Europe/Istanbul',
  ];
  for (const o of olaylar) if (o) satirlar.push(...etkinlik(o, damga));
  satirlar.push('END:VCALENDAR');
  return satirlar.map(icsKatla).join(CRLF) + CRLF;
}
