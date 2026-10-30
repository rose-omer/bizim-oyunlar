// Tarih yardımcıları (saf, DOM yok). Gün = yerel takvim günü, 'YYYY-MM-DD'.
// Gün farkı UTC üzerinden hesaplanır: yaz saati geçişleri sonucu bozmaz.

const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_DAY = 86400000;

/** 'YYYY-MM-DD' → { y, m, d } | null (geçersiz tarih null). */
export function parseDay(s) {
  const m = DAY_RE.exec(String(s ?? ''));
  if (!m) return null;
  const y = +m[1], mo = +m[2], d = +m[3];
  if (mo < 1 || mo > 12 || d < 1 || d > daysInMonth(y, mo)) return null;
  return { y, m: mo, d };
}

export function daysInMonth(y, m) {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

const pad = (n) => String(n).padStart(2, '0');

/** Date (yerel) ya da {y,m,d} → 'YYYY-MM-DD'. */
export function toDay(v = new Date()) {
  if (v instanceof Date) return `${v.getFullYear()}-${pad(v.getMonth() + 1)}-${pad(v.getDate())}`;
  return `${v.y}-${pad(v.m)}-${pad(v.d)}`;
}

const utc = (p) => Date.UTC(p.y, p.m - 1, p.d);

/** b - a (gün). Geçersizse NaN. */
export function daysBetween(a, b) {
  const pa = typeof a === 'string' ? parseDay(a) : parseDay(toDay(a));
  const pb = typeof b === 'string' ? parseDay(b) : parseDay(toDay(b));
  if (!pa || !pb) return NaN;
  return Math.round((utc(pb) - utc(pa)) / MS_DAY);
}

/** Güne n gün ekler. */
export function addDays(day, n) {
  const p = parseDay(day);
  if (!p) return null;
  const t = new Date(utc(p) + n * MS_DAY);
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

/** Kaçıncı gündeyiz? Başlangıç günü = 1. gün. Başlangıç gelecekteyse 0. */
export function daysTogether(startDay, today = new Date()) {
  const n = daysBetween(startDay, today);
  if (!Number.isFinite(n)) return 0;
  return n < 0 ? 0 : n + 1;
}

/** Yıl/ay ayrıntısı: { years, months, days } (başlangıçtan bugüne, tamamlanmış). */
export function durationParts(startDay, today = new Date()) {
  const s = parseDay(startDay);
  const t = parseDay(typeof today === 'string' ? today : toDay(today));
  if (!s || !t || utc(t) < utc(s)) return { years: 0, months: 0, days: 0 };
  // Başlangıca tam ay ekle (ay sonu kırpılır); bugünü geçerse bir ay geri.
  const plusMonths = (n) => clampDay(s.y + Math.floor((s.m - 1 + n) / 12), ((s.m - 1 + n) % 12) + 1, s.d);
  let total = (t.y - s.y) * 12 + (t.m - s.m);
  if (utc(plusMonths(total)) > utc(t)) total -= 1;
  const days = Math.round((utc(t) - utc(plusMonths(total))) / MS_DAY);
  return { years: Math.floor(total / 12), months: total % 12, days };
}

// Ayın 31'i olmayan ayda ayın son günü; 29 Şubat artık olmayan yılda 28 Şubat.
function clampDay(y, m, d) {
  return { y, m, d: Math.min(d, daysInMonth(y, m)) };
}

/**
 * Bir sonraki gerçekleşme (bugün dahil). tekrar: 'yil' | 'ay' | 'yok'.
 * -> 'YYYY-MM-DD' | null (tek seferlik ve geçmişte kaldıysa null).
 */
export function nextOccurrence(day, tekrar = 'yil', from = new Date()) {
  const p = parseDay(day);
  const f = parseDay(typeof from === 'string' ? from : toDay(from));
  if (!p || !f) return null;
  if (tekrar === 'yok') return utc(p) >= utc(f) ? toDay(p) : null;
  if (utc(p) >= utc(f)) return toDay(p);
  if (tekrar === 'ay') {
    let c = clampDay(f.y, f.m, p.d);
    if (utc(c) < utc(f)) c = f.m === 12 ? clampDay(f.y + 1, 1, p.d) : clampDay(f.y, f.m + 1, p.d);
    return toDay(c);
  }
  let c = clampDay(f.y, p.m, p.d);
  if (utc(c) < utc(f)) c = clampDay(f.y + 1, p.m, p.d);
  return toDay(c);
}

/** Yıllık tekrarda kaçıncı kez (yıl dönümü / yaş). Aylıkta kaçıncı ay. Tek seferlikte null. */
export function occurrenceIndex(day, tekrar, occurrenceDay) {
  const p = parseDay(day);
  const o = parseDay(occurrenceDay);
  if (!p || !o || tekrar === 'yok') return null;
  if (tekrar === 'ay') return (o.y - p.y) * 12 + (o.m - p.m);
  return o.y - p.y;
}

/**
 * Yaklaşan özel günler.
 * gunler: [{ id, data: { baslik, tarih, tekrar, tur, emoji } }] (veri.js belgeleri)
 * -> [{ id, baslik, emoji, tur, tekrar, tarih, date, daysLeft, kacinci }] en yakın önce.
 */
export function upcoming(gunler, { today = new Date(), limit = 10, within = 400 } = {}) {
  const t = typeof today === 'string' ? today : toDay(today);
  const out = [];
  for (const g of gunler || []) {
    const d = g?.data || {};
    const tekrar = d.tekrar || 'yil';
    const date = nextOccurrence(d.tarih, tekrar, t);
    if (!date) continue;
    const daysLeft = daysBetween(t, date);
    if (daysLeft > within) continue;
    out.push({
      id: g.id, baslik: d.baslik || 'Özel gün', emoji: d.emoji || '💗', tur: d.tur || 'ozel', tekrar,
      tarih: d.tarih, date, daysLeft, kacinci: occurrenceIndex(d.tarih, tekrar, date),
    });
  }
  return out.sort((a, b) => a.daysLeft - b.daysLeft || a.baslik.localeCompare(b.baslik, 'tr')).slice(0, limit);
}

const DAY_MARKS = [50, 100, 200, 300, 365, 400, 500, 600, 700, 730, 800, 900, 1000, 1111, 1200, 1500, 2000, 2222, 2500, 3000, 3333, 4000, 5000, 6000, 7000, 7777, 8000, 9000, 10000];

/**
 * Birlikteliğin kilometre taşları (başlangıç = 1. gün): gün sayıları ve yıl dönümleri.
 * -> [{ date, baslik, tur: 'gun'|'yil'|'ay', n, daysLeft }] bugünden itibaren, en yakın önce.
 */
export function milestones(startDay, { today = new Date(), limit = 8, monthly = false } = {}) {
  const s = parseDay(startDay);
  if (!s) return [];
  const t = typeof today === 'string' ? today : toDay(today);
  const out = [];
  for (const n of DAY_MARKS) {
    const date = addDays(startDay, n - 1);
    const left = daysBetween(t, date);
    if (left >= 0) out.push({ date, baslik: `${n}. günümüz`, tur: 'gun', n, daysLeft: left });
  }
  const ty = parseDay(t).y;
  for (let y = Math.max(1, ty - s.y); y <= ty - s.y + 2; y++) {
    const date = toDay(clampDay(s.y + y, s.m, s.d));
    const left = daysBetween(t, date);
    if (left >= 0) out.push({ date, baslik: `${y}. yıl dönümümüz`, tur: 'yil', n: y, daysLeft: left });
  }
  if (monthly) {
    const next = nextOccurrence(startDay, 'ay', t);
    const n = occurrenceIndex(startDay, 'ay', next);
    if (next && n > 0 && n % 12 !== 0) {
      out.push({ date: next, baslik: `${n}. ayımız`, tur: 'ay', n, daysLeft: daysBetween(t, next) });
    }
  }
  const seen = new Set();
  return out
    .sort((a, b) => a.daysLeft - b.daysLeft || (a.tur === 'yil' ? -1 : 1))
    .filter((m) => (seen.has(m.date) ? false : seen.add(m.date)))
    .slice(0, limit);
}

/** Bugün kutlanacaklar: özel günler + kilometre taşları (daysLeft === 0). */
export function todaysEvents(gunler, startDay, today = new Date()) {
  const a = upcoming(gunler, { today, limit: 50, within: 0 });
  const b = startDay ? milestones(startDay, { today, limit: 5, monthly: true }).filter((m) => m.daysLeft === 0) : [];
  return [...b, ...a];
}

/** Geri sayım: hedef ISO zaman → { past, total, days, hours, minutes, seconds } (total ms). */
export function countdown(targetIso, now = new Date()) {
  const target = Date.parse(targetIso);
  if (!Number.isFinite(target)) return null;
  const nowMs = now instanceof Date ? now.getTime() : Number(now);
  const total = target - nowMs;
  const abs = Math.abs(total);
  return {
    past: total < 0,
    total,
    days: Math.floor(abs / MS_DAY),
    hours: Math.floor((abs % MS_DAY) / 3600000),
    minutes: Math.floor((abs % 3600000) / 60000),
    seconds: Math.floor((abs % 60000) / 1000),
  };
}

/** "3 gün kaldı" / "Bugün" / "Yarın". */
export function leftText(daysLeft) {
  if (daysLeft === 0) return 'Bugün';
  if (daysLeft === 1) return 'Yarın';
  return `${daysLeft} gün kaldı`;
}
