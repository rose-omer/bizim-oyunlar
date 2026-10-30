// Özel Günler sayfasının saf mantığı (DOM yok; Node'da test edilir).
// Tarih hesapları js/core/gunler.js'ten gelir; burada yalnız birleştirme ve metin var.
import {
  parseDay, toDay, addDays, daysBetween, nextOccurrence, occurrenceIndex,
  upcoming, milestones, milestonesBetween, leftText,
} from '../../js/core/gunler.js';

export const TURLER = [
  { id: 'yildonumu', ad: 'Yıl dönümü', emoji: '💞' },
  { id: 'dogumgunu', ad: 'Doğum günü', emoji: '🎂' },
  { id: 'ozel', ad: 'Özel gün', emoji: '💗' },
  { id: 'plan', ad: 'Plan', emoji: '📌' },
];
export const TEKRARLAR = [
  { id: 'yil', ad: 'Her yıl' },
  { id: 'ay', ad: 'Her ay' },
  { id: 'yok', ad: 'Bir kez' },
];
export const HATIRLATMALAR = [
  { id: 0, ad: 'Gününde' },
  { id: 1, ad: '1 gün önce' },
  { id: 7, ad: '1 hafta önce' },
];
export const EMOJILER = ['💗', '💞', '💍', '✨', '🎂', '🎉', '🌹', '💋', '☕', '🍽️', '✈️', '🏖️', '🎁', '🎬', '🎵', '🏠', '🌙', '📌', '🐾'];
export const TAS_EMOJI = { baslangic: '🌱', gun: '✨', ay: '🌙', yil: '💞' };

const TUR_IDS = new Set(TURLER.map((t) => t.id));
const TEKRAR_IDS = new Set(TEKRARLAR.map((t) => t.id));
const HATIRLAT_IDS = new Set(HATIRLATMALAR.map((t) => t.id));
// Zaman çizelgesinde gösterilen büyük gün sayıları (takvim ve liste tümünü gösterir).
const BUYUK_GUNLER = new Set([100, 200, 365, 500, 1000, 1111, 1500, 2000, 2222, 2500, 3000, 3333, 4000, 5000, 6000, 7000, 7777, 8000, 9000, 10000]);

export const BASLIK_MAX = 60;
export const NOT_MAX = 300;

const gunOf = (v) => (typeof v === 'string' ? v : toDay(v));
const pad = (n) => String(n).padStart(2, '0');

/** Türün varsayılan simgesi. */
export function turEmoji(tur) {
  return TURLER.find((t) => t.id === tur)?.emoji || '💗';
}

/** Hazır öneriler. Sevgililer Günü tarihi bu yılın 14 Şubat'ı (her yıl tekrar eder). */
export function oneriler(bugun = new Date()) {
  const y = parseDay(gunOf(bugun)).y;
  return [
    { etiket: 'İlk tanıştığımız gün', baslik: 'İlk tanıştığımız gün', tur: 'yildonumu', tekrar: 'yil', emoji: '✨' },
    { etiket: 'İlk buluşma', baslik: 'İlk buluşma', tur: 'yildonumu', tekrar: 'yil', emoji: '☕' },
    { etiket: 'İlk öpücük', baslik: 'İlk öpücük', tur: 'yildonumu', tekrar: 'yil', emoji: '💋' },
    { etiket: 'Sevgililer Günü (14 Şubat)', baslik: 'Sevgililer Günü', tur: 'ozel', tekrar: 'yil', emoji: '🌹', tarih: `${y}-02-14` },
  ];
}

/** Türkçe tamlayan eki: Ömer → Ömer'in, Gül → Gül'ün, Ayşe → Ayşe'nin. */
export function iyelik(ad) {
  const s = String(ad || '').trim();
  if (!s) return '';
  const low = s.toLocaleLowerCase('tr');
  const sesliler = low.match(/[aeıioöuü]/g);
  const son = sesliler ? sesliler[sesliler.length - 1] : 'e';
  const ek = { a: 'ın', ı: 'ın', e: 'in', i: 'in', o: 'un', u: 'un', ö: 'ün', ü: 'ün' }[son];
  return `${s}'${/[aeıioöuü]$/.test(low) ? 'n' : ''}${ek}`;
}

/**
 * Kişi belgelerindeki doğum günlerinden sanal özel gün belgeleri.
 * Aynı ay-güne elle eklenmiş bir doğum günü varsa otomatik olanı atlar.
 */
export function dogumGunleri(kisiler = [], gunler = []) {
  const elle = new Set((gunler || [])
    .filter((g) => g?.data?.tur === 'dogumgunu' && parseDay(g.data.tarih))
    .map((g) => g.data.tarih.slice(5)));
  const out = [];
  for (const k of kisiler || []) {
    const dogum = k?.data?.dogum;
    if (!parseDay(dogum) || elle.has(dogum.slice(5))) continue;
    const ad = String(k.data.ad || '').trim();
    out.push({
      id: `dogum-${k.id}`,
      kisiId: k.id,
      data: {
        baslik: ad ? `${iyelik(ad)} doğum günü` : 'Doğum günü',
        tarih: dogum, tekrar: 'yil', tur: 'dogumgunu', emoji: '🎂', hatirlat: [0, 1],
      },
    });
  }
  return out;
}

/** "3. yıl dönümü", "25. yaş", "4. ay", "2. yıl" ya da null. */
export function kacinciYazi({ kaynak, tur, tekrar, kacinci }) {
  if (kaynak === 'tas' || !(kacinci > 0)) return null;
  if (tekrar === 'ay') return `${kacinci}. ay`;
  if (tekrar === 'yok') return null;
  if (tur === 'dogumgunu') return `${kacinci}. yaş`;
  if (tur === 'yildonumu') return `${kacinci}. yıl dönümü`;
  if (tur === 'ozel') return `${kacinci}. yıl`;
  return null;
}

function tasOgesi(m, bugun) {
  return {
    kaynak: 'tas', id: `tas-${m.tur}-${m.n}`, key: `tas-${m.tur}-${m.n}`,
    baslik: m.baslik, emoji: TAS_EMOJI[m.tur] || '✨', tur: 'tas', tasTur: m.tur, n: m.n,
    tarih: m.date, date: m.date, daysLeft: daysBetween(gunOf(bugun), m.date), kacinci: null, ek: null,
  };
}

function gunOgesi(doc, kaynak, date, bugun) {
  const d = doc.data || {};
  const tekrar = d.tekrar || 'yil';
  const tur = d.tur || 'ozel';
  const kacinci = occurrenceIndex(d.tarih, tekrar, date);
  return {
    kaynak, id: doc.id, key: `${doc.id}@${date}`, kisiId: doc.kisiId,
    baslik: d.baslik || 'Özel gün', emoji: d.emoji || turEmoji(tur), tur, tekrar,
    tarih: d.tarih, date, daysLeft: daysBetween(gunOf(bugun), date), kacinci,
    ek: kacinciYazi({ kaynak, tur, tekrar, kacinci }), not: d.not || '',
  };
}

const sirala = (a, b) => a.daysLeft - b.daysLeft
  || (a.kaynak === 'tas') - (b.kaynak === 'tas')
  || a.baslik.localeCompare(b.baslik, 'tr');

/**
 * Yaklaşanlar: özel günler + doğum günleri + kilometre taşları (ay dönümü dahil), en yakın önce.
 * -> [{ kaynak: 'gun'|'dogum'|'tas', id, key, baslik, emoji, tur, tekrar?, date, daysLeft, kacinci, ek, not? }]
 */
export function birlesikListe({ gunler = [], kisiler = [], baslangic = null, bugun = new Date(), within = 400 } = {}) {
  const today = gunOf(bugun);
  const dogum = dogumGunleri(kisiler, gunler);
  const belgeler = new Map();
  for (const g of gunler) belgeler.set(g.id, { doc: g, kaynak: 'gun' });
  for (const g of dogum) belgeler.set(g.id, { doc: g, kaynak: 'dogum' });
  const out = upcoming([...gunler, ...dogum], { today, limit: Infinity, within })
    .map((u) => { const b = belgeler.get(u.id); return gunOgesi(b.doc, b.kaynak, u.date, today); });
  if (parseDay(baslangic)) {
    for (const m of milestones(baslangic, { today, limit: 4, monthly: true })) {
      if (m.daysLeft <= within) out.push(tasOgesi(m, today));
    }
  }
  return out.sort(sirala);
}

/** Tek seferlik ve geçmişte kalmış özel günler, yeniden eskiye (listede görünmezler; düzenlenebilsinler). */
export function gecmisPlanlar(gunler = [], bugun = new Date()) {
  const today = gunOf(bugun);
  return (gunler || [])
    .filter((g) => (g.data?.tekrar === 'yok') && parseDay(g.data.tarih) && !nextOccurrence(g.data.tarih, 'yok', today))
    .map((g) => gunOgesi(g, 'gun', g.data.tarih, today))
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

/** Bir günün [from, to] aralığındaki tüm gerçekleşmeleri. */
export function olusumlar(tarih, tekrar, from, to) {
  const out = [];
  let cur = gunOf(from);
  const son = gunOf(to);
  for (let i = 0; i < 1000; i++) {
    const d = nextOccurrence(tarih, tekrar, cur);
    if (!d || daysBetween(d, son) < 0) break;
    out.push(d);
    if (tekrar === 'yok') break;
    cur = addDays(d, 1);
  }
  return out;
}

/**
 * Takvim: [from, to] aralığındaki olaylar, güne göre. İlk gün ve ay dönümleri dahil.
 * -> { 'YYYY-MM-DD': [öğe...] } (öğe biçimi birlesikListe ile aynı)
 */
export function takvimOlaylari({ gunler = [], kisiler = [], baslangic = null, from, to, bugun = new Date() } = {}) {
  const today = gunOf(bugun);
  const map = {};
  const ekle = (o) => { (map[o.date] ||= []).push(o); };
  for (const g of gunler) {
    const d = g.data || {};
    if (!parseDay(d.tarih)) continue;
    for (const date of olusumlar(d.tarih, d.tekrar || 'yil', from, to)) ekle(gunOgesi(g, 'gun', date, today));
  }
  for (const g of dogumGunleri(kisiler, gunler)) {
    for (const date of olusumlar(g.data.tarih, 'yil', from, to)) ekle(gunOgesi(g, 'dogum', date, today));
  }
  if (parseDay(baslangic)) {
    if (daysBetween(gunOf(from), baslangic) >= 0 && daysBetween(baslangic, gunOf(to)) >= 0) {
      ekle(tasOgesi({ date: baslangic, baslik: 'İlk günümüz', tur: 'baslangic', n: 1 }, today));
    }
    for (const m of milestonesBetween(baslangic, from, to, { monthly: true })) ekle(tasOgesi(m, today));
  }
  for (const k of Object.keys(map)) map[k].sort(sirala);
  return map;
}

/**
 * Kilometre taşları zaman çizelgesi: ilk gün + büyük gün sayıları + yıl dönümleri.
 * Geçmişlerin tamamı, bugün olanlar ve gelecekten ilk `gelecek` tanesi; tarihe göre.
 * -> [{ date, baslik, tur, n, emoji, daysLeft, durum: 'gecti'|'bugun'|'gelecek' }]
 */
export function tasZaman(baslangic, bugun = new Date(), { gelecek = 3 } = {}) {
  if (!parseDay(baslangic)) return [];
  const today = gunOf(bugun);
  if (daysBetween(today, baslangic) > 0) return []; // başlangıç ileride: henüz taş yok
  const tum = [
    { date: baslangic, baslik: 'İlk günümüz', tur: 'baslangic', n: 1 },
    ...milestonesBetween(baslangic, baslangic, addDays(today, 3700))
      .filter((m) => m.tur === 'yil' || BUYUK_GUNLER.has(m.n)),
  ];
  const out = [];
  let ileri = 0;
  for (const m of tum) {
    const daysLeft = daysBetween(today, m.date);
    const durum = daysLeft < 0 ? 'gecti' : daysLeft === 0 ? 'bugun' : 'gelecek';
    if (durum === 'gelecek' && ileri++ >= gelecek) break;
    out.push({ ...m, emoji: TAS_EMOJI[m.tur] || '✨', daysLeft, durum });
  }
  return out;
}

function hatirlatmaBaslik(gunOnce, baslik, emoji) {
  if (gunOnce === 0) return `Bugün: ${baslik} ${emoji}`;
  if (gunOnce === 1) return `Yarın: ${baslik} ${emoji}`;
  return `1 hafta kaldı: ${baslik} ${emoji}`;
}

function hatirlatmaMetin(gunOnce, ek) {
  if (gunOnce === 0) return ek ? `${ek}, kutlu olsun 💗` : 'Birlikte güzel bir gün geçirin 💗';
  if (gunOnce === 1) return 'Unutma, yarın sizin için özel.';
  return 'Küçük bir sürpriz için tam zamanı.';
}

/**
 * Cihaz hatırlatıcıları: önümüzdeki `gun` gündeki olaylar için yerel saat `saat`:00 zamanları.
 * Özel günler kendi `hatirlat` listesine göre (yoksa gününde), doğum günleri gününde ve 1 gün önce,
 * kilometre taşları gününde. Geçmiş zamanlar atlanır. -> [{ id, baslik, metin, zaman: ISO }] zamana göre
 */
export function hatirlatmalar({ gunler = [], kisiler = [], baslangic = null, simdi = new Date(), gun = 60, saat = 9, sinir = 64 } = {}) {
  const nowMs = simdi instanceof Date ? simdi.getTime() : Number(simdi);
  const today = toDay(new Date(nowMs));
  const son = addDays(today, gun);
  const out = [];
  const ekle = (id, baslik, metin, day) => {
    const p = parseDay(day);
    const z = new Date(p.y, p.m - 1, p.d, saat, 0, 0, 0);
    if (z.getTime() > nowMs) out.push({ id, baslik, metin, zaman: z.toISOString() });
  };
  const kaynaklar = [
    ...gunler.map((g) => ({ g, kaynak: 'gun' })),
    ...dogumGunleri(kisiler, gunler).map((g) => ({ g, kaynak: 'dogum' })),
  ];
  for (const { g, kaynak } of kaynaklar) {
    const d = g.data || {};
    if (!parseDay(d.tarih)) continue;
    const once = Array.isArray(d.hatirlat) ? [...new Set(d.hatirlat)].filter((x) => HATIRLAT_IDS.has(x)) : [0];
    for (const date of olusumlar(d.tarih, d.tekrar || 'yil', today, son)) {
      const o = gunOgesi(g, kaynak, date, today);
      for (const n of once) ekle(`${g.id}_${date}_${n}`, hatirlatmaBaslik(n, o.baslik, o.emoji), hatirlatmaMetin(n, o.ek), addDays(date, -n));
    }
  }
  if (parseDay(baslangic)) {
    for (const m of milestonesBetween(baslangic, today, son, { monthly: true })) {
      ekle(`tas_${m.date}`, hatirlatmaBaslik(0, m.baslik, TAS_EMOJI[m.tur]), hatirlatmaMetin(0, null), m.date);
    }
  }
  return out.sort((a, b) => (a.zaman < b.zaman ? -1 : a.zaman > b.zaman ? 1 : 0)).slice(0, sinir);
}

/** Bugün kutlama gösterilmeli mi? (cihaz başına günde bir kez) */
export function kutlamaGerekli(sonKutlama, bugun, olaySayisi) {
  return olaySayisi > 0 && sonKutlama !== gunOf(bugun);
}

/**
 * Özel gün formu doğrulaması. yeni: tek seferlik gün geçmişte olamaz.
 * -> { hatalar: { baslik?, tarih?, not? }, data } (hata yoksa data veri.js'e yazılır)
 */
export function gunDogrula(girdi = {}, { bugun = new Date(), yeni = true } = {}) {
  const hatalar = {};
  const baslik = String(girdi.baslik ?? '').trim().replace(/\s+/g, ' ');
  if (!baslik) hatalar.baslik = 'Bu güne bir ad ver.';
  else if ([...baslik].length > BASLIK_MAX) hatalar.baslik = `Başlık en çok ${BASLIK_MAX} karakter olsun.`;
  const tarih = String(girdi.tarih ?? '').trim();
  const p = parseDay(tarih);
  const tekrar = TEKRAR_IDS.has(girdi.tekrar) ? girdi.tekrar : 'yil';
  const tur = TUR_IDS.has(girdi.tur) ? girdi.tur : 'ozel';
  if (!p) hatalar.tarih = 'Bir tarih seç.';
  else if (p.y < 1900 || p.y > 2100) hatalar.tarih = 'Bu tarih çok uzak görünüyor.';
  else if (yeni && tekrar === 'yok' && daysBetween(gunOf(bugun), tarih) < 0) {
    hatalar.tarih = 'Bu tarih geçmişte kaldı. Her yıl tekrar etsin ya da ileri bir tarih seç.';
  }
  const not = String(girdi.not ?? '').trim();
  if ([...not].length > NOT_MAX) hatalar.not = `Not en çok ${NOT_MAX} karakter olsun.`;
  const emoji = typeof girdi.emoji === 'string' && girdi.emoji && [...girdi.emoji].length <= 8 ? girdi.emoji : turEmoji(tur);
  const hatirlat = [...new Set(Array.isArray(girdi.hatirlat) ? girdi.hatirlat : [])]
    .filter((x) => HATIRLAT_IDS.has(x)).sort((a, b) => a - b);
  const data = { baslik, tarih, tekrar, tur, emoji, hatirlat };
  if (not) data.not = not;
  return { hatalar, data };
}

/** Buluşma: yerel tarih + saat → ISO. Geçersizse null. */
export function bulusmaIso(tarih, saat = '20:00') {
  const p = parseDay(tarih);
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(saat || '').trim());
  if (!p || !m || +m[1] > 23 || +m[2] > 59) return null;
  return new Date(p.y, p.m - 1, p.d, +m[1], +m[2], 0, 0).toISOString();
}

/** ISO → yerel { tarih: 'YYYY-MM-DD', saat: 'HH:MM' } | null. */
export function isoParcala(iso) {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  const d = new Date(t);
  return { tarih: toDay(d), saat: `${pad(d.getHours())}:${pad(d.getMinutes())}` };
}

/** Buluşma formu doğrulaması. -> { hata: string|null, iso } */
export function bulusmaDogrula(tarih, saat, simdi = new Date()) {
  if (!parseDay(tarih)) return { hata: 'Bir tarih seç.', iso: null };
  const iso = bulusmaIso(tarih, saat || '20:00');
  if (!iso) return { hata: 'Saati 19:30 gibi yaz.', iso: null };
  const nowMs = simdi instanceof Date ? simdi.getTime() : Number(simdi);
  if (Date.parse(iso) <= nowMs) return { hata: 'Bu zaman geçti. İleri bir zaman seç.', iso: null };
  return { hata: null, iso };
}

// ---- Metin biçimleri (tr-TR) ----

const fmt = (opts) => new Intl.DateTimeFormat('tr-TR', opts);
const dateOf = (day) => { const p = parseDay(day); return p ? new Date(p.y, p.m - 1, p.d) : null; };

/** "14 Şubat Pazar"; başka yıldaysa "14 Şubat 2027 Pazar". */
export function tarihYazi(day, bugun = new Date(), { haftaGunu = true } = {}) {
  const d = dateOf(day);
  if (!d) return '';
  const opts = { day: 'numeric', month: 'long' };
  if (haftaGunu) opts.weekday = 'long';
  if (d.getFullYear() !== parseDay(gunOf(bugun)).y) opts.year = 'numeric';
  return fmt(opts).format(d);
}

/** "Ekim 2026". */
export function ayBasligi(y, m) {
  return fmt({ month: 'long', year: 'numeric' }).format(new Date(y, m - 1, 1));
}

/** ['Pzt', 'Sal', ...] Pazartesi'den. */
export function haftaGunleri() {
  return Array.from({ length: 7 }, (_, i) => fmt({ weekday: 'short' }).format(new Date(2024, 0, 1 + i)));
}

/** Ay kaydır: (2026, 12, +1) → { y: 2027, m: 1 }. */
export function ayKaydir(y, m, n) {
  const i = y * 12 + (m - 1) + n;
  return { y: Math.floor(i / 12), m: (i % 12) + 1 };
}

/** leftText; geçmiş için "N gün önce". */
export function kalanYazi(daysLeft) {
  if (daysLeft < 0) return daysLeft === -1 ? 'Dün' : `${-daysLeft} gün önce`;
  return leftText(daysLeft);
}

/** "1 yıl, 4 ay, 2 gün" (sıfırlar atlanır). */
export function sureYazi({ years = 0, months = 0, days = 0 } = {}) {
  const p = [];
  if (years) p.push(`${years} yıl`);
  if (months) p.push(`${months} ay`);
  if (days) p.push(`${days} gün`);
  return p.join(', ');
}
