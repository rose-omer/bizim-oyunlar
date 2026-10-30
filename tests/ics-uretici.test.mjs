// sayfalar/gunler/ics.js: RFC 5545 .ics üretici. Üretilen metin küçük bir ayrıştırıcıyla geri okunur.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ICS_DOSYA, ICS_TUR, icsKacis, icsKatla, icsZaman, tekrarKurali, alarmTetik, gunOlayi, icsOlaylari, icsMetni,
} from '../sayfalar/gunler/ics.js';
import { parseDay, toDay, addDays, daysInMonth, milestonesBetween } from '../js/core/gunler.js';
import { olusumlar } from '../sayfalar/gunler/mantik.js';

const BUGUN = '2026-10-30';
const SIMDI = new Date('2026-10-30T10:00:00Z');
const BAS = '2025-02-14';
const doc = (id, data) => ({ id, data });

const UZUN = 'Şükrü ile Çiğdem’in İğdır’daki düğün yıl dönümü; ğüşiöç ĞÜŞİÖÇ, çok özel ✨💞';
const gunler = [
  doc('g-ilk', {
    baslik: 'İlk buluşmamız; Kadıköy, iskele', tarih: '2024-05-12', tekrar: 'yil', tur: 'yildonumu', emoji: '☕',
    not: 'Çay içtik,\nsimit yedik\\ martılar\r\nsonra yürüdük', hatirlat: [0, 1, 7],
  }),
  doc('g-ay', { baslik: 'Ay dönümü', tarih: '2025-01-31', tekrar: 'ay', tur: 'ozel', emoji: '🌙', hatirlat: [] }),
  doc('g-plan', { baslik: 'Kapadokya', tarih: '2026-12-20', tekrar: 'yok', tur: 'plan', emoji: '🎈' }),
  doc('g-eski', { baslik: 'Eski plan', tarih: '2026-01-05', tekrar: 'yok', tur: 'plan', emoji: '📌' }),
  doc('g-bozuk', { baslik: 'Bozuk', tarih: '2026-02-30', tekrar: 'yil' }),
  doc('g-uzun', { baslik: UZUN, tarih: '2023-08-30', tekrar: 'ay', tur: 'ozel', emoji: '💍', hatirlat: [7] }),
];
const kisiler = [
  doc('omer-id', { ad: 'Ömer', dogum: '1996-02-29' }),
  doc('gul-id', { ad: 'Gül', dogum: '1999-03-15' }),
];
const cift = { baslangic: BAS, bulusma: '2026-11-05T17:30:00.000Z', bulusmaNotu: 'Kadıköy iskelesi, 2. kapı' };
const veri = (ek = {}) => ({ gunler, kisiler, baslangic: BAS, cift, bugun: BUGUN, simdi: SIMDI, ...ek });

// ---------- Küçük ayrıştırıcı ----------

/** CRLF ile ayrılmış fiziksel satırlar (bayt düzeyinde). */
function fizikselSatirlar(metin) {
  const b = Buffer.from(metin, 'utf8');
  const out = [];
  let bas = 0;
  for (let i = 0; i < b.length - 1; i++) {
    if (b[i] === 13 && b[i + 1] === 10) { out.push(b.subarray(bas, i)); bas = i + 2; i++; }
  }
  assert.equal(bas, b.length, 'metin CRLF ile bitmeli');
  return out;
}

const metinCoz = (v) => v.replace(/\\([\\;,nN])/g, (_, c) => (c === 'n' || c === 'N' ? '\n' : c));

/** .ics → { ad, oz: [{ ad, param, deger }], alt: [...] } ağacı; biçim kurallarını da denetler. */
function ayristir(metin) {
  assert.ok(!/\r(?!\n)/.test(metin) && !/(^|[^\r])\n/.test(metin), 'yalnız CRLF satır sonu');
  const coz = new TextDecoder('utf-8', { fatal: true });
  for (const s of fizikselSatirlar(metin)) {
    assert.ok(s.length <= 75, `satır 75 oktetten uzun (${s.length}): ${coz.decode(s)}`);
    assert.doesNotThrow(() => coz.decode(s), 'katlama çok baytlı karakteri bölmüş');
  }
  const satirlar = metin.replace(/\r\n[ \t]/g, '').split('\r\n');
  assert.equal(satirlar.pop(), '');
  const kok = { ad: 'KOK', oz: [], alt: [] };
  const yigin = [kok];
  for (const satir of satirlar) {
    const i = satir.indexOf(':');
    assert.ok(i > 0, `geçersiz satır: ${satir}`);
    const [ad, ...ps] = satir.slice(0, i).split(';');
    const deger = satir.slice(i + 1);
    const ust = yigin[yigin.length - 1];
    if (ad === 'BEGIN') {
      const b = { ad: deger, oz: [], alt: [] };
      ust.alt.push(b);
      yigin.push(b);
    } else if (ad === 'END') {
      assert.equal(yigin.pop().ad, deger, 'BEGIN/END eşleşmeli');
    } else {
      ust.oz.push({ ad, param: Object.fromEntries(ps.map((p) => p.split('='))), deger });
    }
  }
  assert.equal(yigin.length, 1, 'kapanmamış bileşen');
  assert.equal(kok.alt.length, 1);
  return kok.alt[0];
}
const oz = (b, ad) => b.oz.filter((p) => p.ad === ad);
const tek = (b, ad) => { const l = oz(b, ad); assert.equal(l.length, 1, `${ad} tek olmalı`); return l[0]; };
const olaylar = (cal) => cal.alt.filter((b) => b.ad === 'VEVENT');
const uidIle = (cal, uid) => olaylar(cal).find((e) => tek(e, 'UID').deger === uid);

/** Test için küçük RRULE açıcı (FREQ YEARLY/MONTHLY, BYMONTH, BYMONTHDAY ±, BYSETPOS). Geçersiz gün yok sayılır (RFC 5545). */
function rruleAc(dtstart, rrule, bitis) {
  const r = Object.fromEntries(rrule.split(';').map((p) => p.split('=')));
  const s = parseDay(dtstart);
  const out = [];
  for (let i = 0; ; i++) {
    const y = s.y + Math.floor((s.m - 1 + i) / 12);
    const m = ((s.m - 1 + i) % 12) + 1;
    if (toDay({ y, m, d: 1 }) > bitis) break;
    if (r.FREQ === 'YEARLY' && m !== (r.BYMONTH ? Number(r.BYMONTH) : s.m)) continue;
    const dim = daysInMonth(y, m);
    let gunlerAy = r.BYMONTHDAY
      ? r.BYMONTHDAY.split(',').map(Number).map((d) => (d < 0 ? dim + 1 + d : d))
      : [s.d];
    gunlerAy = [...new Set(gunlerAy.filter((d) => d >= 1 && d <= dim))].sort((a, b) => a - b);
    if (r.BYSETPOS) {
      const p = Number(r.BYSETPOS);
      const sec = p < 0 ? gunlerAy[gunlerAy.length + p] : gunlerAy[p - 1];
      gunlerAy = sec ? [sec] : [];
    }
    for (const d of gunlerAy) {
      const day = toDay({ y, m, d });
      if (day >= dtstart && day <= bitis) out.push(day);
    }
  }
  return out;
}

// ---------- Birim ----------

test('sabitler: dosya adı ve tür', () => {
  assert.equal(ICS_DOSYA, 'biz-ikimiz.ics');
  assert.equal(ICS_TUR, 'text/calendar');
});

test('icsKacis: \\ ; , ve satır sonları; önce ters bölü', () => {
  assert.equal(icsKacis('a\\b'), 'a\\\\b');
  assert.equal(icsKacis('a;b,c'), 'a\\;b\\,c');
  assert.equal(icsKacis('a\\;b'), 'a\\\\\\;b');
  assert.equal(icsKacis('1\r\n2\n3\r4'), '1\\n2\\n3\\n4');
  assert.equal(icsKacis('çiçek: ğüşİ'), 'çiçek: ğüşİ');
  assert.equal(icsKacis('a\u0000b\u0007c\td\u007f'), 'abc\td');
  assert.equal(icsKacis(null), '');
  assert.equal(metinCoz(icsKacis('x\\;y,\nz')), 'x\\;y,\nz');
});

test('icsKatla: 75 oktet; devam satırı boşlukla başlar (74 + 1)', () => {
  const a75 = 'a'.repeat(75);
  assert.equal(icsKatla(a75), a75);
  assert.equal(icsKatla(`${a75}b`), `${a75}\r\n b`);
  const uzun = 'x'.repeat(75 + 74 + 10);
  const p = icsKatla(uzun).split('\r\n');
  assert.deepEqual(p.map((s) => s.length), [75, 75, 11]);
  assert.ok(p.slice(1).every((s) => s.startsWith(' ')));
  assert.equal(icsKatla(''), '');
});

test('icsKatla: çok baytlı karakter bölünmez (2 ve 4 bayt sınırda)', () => {
  const s1 = `SUMMARY:${'a'.repeat(66)}şb`; // 74 bayt + 'ş' (2) = 76 > 75
  assert.equal(icsKatla(s1), `SUMMARY:${'a'.repeat(66)}\r\n şb`);
  const s2 = `X:${'a'.repeat(72)}💞z`; // 74 bayt + 4 bayt
  assert.equal(icsKatla(s2), `X:${'a'.repeat(72)}\r\n 💞z`);
  const s3 = `X:${'a'.repeat(69)}💞`; // 2 + 69 + 4 = tam 75
  assert.equal(Buffer.byteLength(s3), 75);
  assert.equal(icsKatla(s3), s3);
  const tr = `SUMMARY:${UZUN}`;
  const katli = icsKatla(tr);
  assert.ok(katli.includes('\r\n '));
  assert.equal(katli.replace(/\r\n /g, ''), tr);
  for (const s of fizikselSatirlar(`${katli}\r\n`)) {
    assert.ok(s.length <= 75);
    assert.doesNotThrow(() => new TextDecoder('utf-8', { fatal: true }).decode(s));
  }
});

test('icsZaman: UTC biçimi', () => {
  assert.equal(icsZaman(new Date('2026-11-05T17:30:09.500Z')), '20261105T173009Z');
  assert.equal(icsZaman('2026-01-02T03:04:05Z'), '20260102T030405Z');
  assert.equal(icsZaman(Date.UTC(2026, 0, 1)), '20260101T000000Z');
});

test('tekrarKurali: yıl, ay, tek sefer; ay sonu ve 29 Şubat', () => {
  assert.equal(tekrarKurali('2024-05-12', 'yil'), 'FREQ=YEARLY');
  assert.equal(tekrarKurali('2024-05-12', undefined), 'FREQ=YEARLY');
  assert.equal(tekrarKurali('2024-02-29', 'yil'), 'FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=-1');
  assert.equal(tekrarKurali('2024-02-28', 'yil'), 'FREQ=YEARLY');
  assert.equal(tekrarKurali('2026-03-15', 'ay'), 'FREQ=MONTHLY');
  assert.equal(tekrarKurali('2026-03-28', 'ay'), 'FREQ=MONTHLY');
  assert.equal(tekrarKurali('2026-03-29', 'ay'), 'FREQ=MONTHLY;BYMONTHDAY=28,29;BYSETPOS=-1');
  assert.equal(tekrarKurali('2026-03-30', 'ay'), 'FREQ=MONTHLY;BYMONTHDAY=28,29,30;BYSETPOS=-1');
  assert.equal(tekrarKurali('2026-03-31', 'ay'), 'FREQ=MONTHLY;BYMONTHDAY=-1');
  assert.equal(tekrarKurali('2024-02-29', 'ay'), 'FREQ=MONTHLY;BYMONTHDAY=28,29;BYSETPOS=-1');
  assert.equal(tekrarKurali('2026-03-31', 'yok'), null);
  assert.equal(tekrarKurali('2026-02-30', 'yil'), null);
});

test('tekrarKurali: açılımı gunler.js kırpma kuralıyla birebir aynı (6 yıl)', () => {
  const ornekler = [
    ['2024-02-29', 'yil'], ['2023-02-28', 'yil'], ['2024-05-12', 'yil'], ['2024-12-31', 'yil'],
    ['2026-01-31', 'ay'], ['2026-01-30', 'ay'], ['2026-01-29', 'ay'], ['2024-01-29', 'ay'], ['2024-02-29', 'ay'],
    ['2026-03-30', 'ay'], ['2026-08-31', 'ay'], ['2026-03-15', 'ay'], ['2026-03-28', 'ay'],
  ];
  for (const [tarih, tekrar] of ornekler) {
    const bitis = addDays(tarih, 6 * 366);
    const beklenen = olusumlar(tarih, tekrar, tarih, bitis);
    const gercek = rruleAc(tarih, tekrarKurali(tarih, tekrar), bitis);
    assert.deepEqual(gercek, beklenen, `${tarih} ${tekrar}`);
    assert.equal(gercek[0], tarih, `${tarih}: DTSTART kuralla eşzamanlı olmalı`);
  }
  // Kırpmasız kural yanlış olurdu: 31'li aylık "FREQ=MONTHLY" Şubat'ı atlar.
  assert.notDeepEqual(rruleAc('2026-01-31', 'FREQ=MONTHLY', '2026-12-31'), olusumlar('2026-01-31', 'ay', '2026-01-31', '2026-12-31'));
});

test('alarmTetik: o günün 09:00\'ı (tüm gün başlangıcına göre)', () => {
  assert.equal(alarmTetik(0), 'PT9H');
  assert.equal(alarmTetik(1), '-PT15H');
  assert.equal(alarmTetik(7), '-P6DT15H');
  const saat = (t) => {
    const m = /^(-)?P(?:(\d+)D)?(?:T(\d+)H)?$/.exec(t);
    return (m[1] ? -1 : 1) * ((Number(m[2] || 0) * 24) + Number(m[3] || 0));
  };
  for (const n of [0, 1, 7]) assert.equal(saat(alarmTetik(n)), -24 * n + 9, `gün önce ${n}`);
});

test('gunOlayi: geçersiz tarih null; hatırlatma süzülür, yoksa gününde', () => {
  assert.equal(gunOlayi(doc('x', { baslik: 'X', tarih: '2026-02-30' })), null);
  assert.equal(gunOlayi(null), null);
  const o = gunOlayi(doc('x', { baslik: 'X', tarih: '2026-05-01', hatirlat: [7, 0, 7, 3, '1'] }));
  assert.deepEqual(o.alarmlar, [0, 7]);
  assert.equal(o.uid, 'x@biz-ikimiz');
  assert.equal(o.baslik, '💗 X'); // tür yok → özel gün simgesi
  assert.deepEqual(gunOlayi(doc('y', { baslik: 'Y', tarih: '2026-05-01' })).alarmlar, [0]);
  assert.deepEqual(gunOlayi(doc('z', { baslik: 'Z', tarih: '2026-05-01', hatirlat: [] })).alarmlar, []);
});

// ---------- Tam takvim ----------

test('icsOlaylari: geçmiş tek seferlik ve bozuk tarih yok; doğum günleri ve gelecekteki buluşma var', () => {
  const l = icsOlaylari(veri());
  assert.deepEqual(l.map((o) => o.uid), [
    'g-ilk@biz-ikimiz', 'g-ay@biz-ikimiz', 'g-plan@biz-ikimiz', 'g-uzun@biz-ikimiz',
    'dogum-omer-id@biz-ikimiz', 'dogum-gul-id@biz-ikimiz', 'bulusma-20261105T173000Z@biz-ikimiz',
  ]);
  const gecmis = icsOlaylari(veri({ cift: { bulusma: '2026-10-30T09:00:00.000Z' } }));
  assert.ok(!gecmis.some((o) => o.uid.startsWith('bulusma-')), 'geçmiş buluşma eklenmez');
  assert.deepEqual(icsOlaylari({ bugun: BUGUN, simdi: SIMDI }), []);
  // Elle eklenmiş doğum günü varsa kişi belgesinden ikincisi gelmez (mantik.js dogumGunleri).
  const elle = icsOlaylari(veri({ gunler: [doc('d1', { baslik: 'Gül doğdu', tarih: '1999-03-15', tekrar: 'yil', tur: 'dogumgunu' })] }));
  assert.ok(!elle.some((o) => o.uid === 'dogum-gul-id@biz-ikimiz'));
});

test('icsMetni: VCALENDAR başlığı, CRLF, katlama, UTF-8 ve ayrıştırma', () => {
  const metin = icsMetni(icsOlaylari(veri()), { simdi: SIMDI });
  const cal = ayristir(metin);
  assert.equal(cal.ad, 'VCALENDAR');
  assert.deepEqual(metin.split('\r\n').slice(0, 7), [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Biz Ikimiz//TR', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'X-WR-CALNAME:Biz İkimiz', 'X-WR-TIMEZONE:Europe/Istanbul',
  ]);
  assert.ok(metin.endsWith('END:VCALENDAR\r\n'));
  assert.ok(metin.includes('\r\n '), 'uzun satırlar katlanmış olmalı');
  const ev = olaylar(cal);
  assert.equal(ev.length, 7);
  for (const e of ev) {
    for (const ad of ['UID', 'DTSTAMP', 'DTSTART', 'DTEND', 'SUMMARY']) tek(e, ad);
    assert.equal(tek(e, 'DTSTAMP').deger, '20261030T100000Z');
  }
  assert.equal(new Set(ev.map((e) => tek(e, 'UID').deger)).size, ev.length, 'UID tekil');
});

test('tüm gün etkinliği: VALUE=DATE, DTEND ertesi gün, RRULE, metin geri okunur', () => {
  const cal = ayristir(icsMetni(icsOlaylari(veri()), { simdi: SIMDI }));
  const ilk = uidIle(cal, 'g-ilk@biz-ikimiz');
  assert.deepEqual(tek(ilk, 'DTSTART'), { ad: 'DTSTART', param: { VALUE: 'DATE' }, deger: '20240512' });
  assert.deepEqual(tek(ilk, 'DTEND'), { ad: 'DTEND', param: { VALUE: 'DATE' }, deger: '20240513' });
  assert.equal(tek(ilk, 'RRULE').deger, 'FREQ=YEARLY');
  assert.equal(metinCoz(tek(ilk, 'SUMMARY').deger), '☕ İlk buluşmamız; Kadıköy, iskele');
  assert.equal(metinCoz(tek(ilk, 'DESCRIPTION').deger), 'Çay içtik,\nsimit yedik\\ martılar\nsonra yürüdük');
  assert.equal(tek(ilk, 'TRANSP').deger, 'TRANSPARENT');

  const ay = uidIle(cal, 'g-ay@biz-ikimiz');
  assert.equal(tek(ay, 'RRULE').deger, 'FREQ=MONTHLY;BYMONTHDAY=-1');
  assert.equal(oz(ay, 'DESCRIPTION').length, 0, 'not yoksa DESCRIPTION yok');

  const plan = uidIle(cal, 'g-plan@biz-ikimiz');
  assert.equal(oz(plan, 'RRULE').length, 0, 'bir kez: RRULE yok');
  assert.equal(tek(plan, 'DTEND').deger, '20261221');

  const uzun = uidIle(cal, 'g-uzun@biz-ikimiz');
  assert.equal(metinCoz(tek(uzun, 'SUMMARY').deger), `💍 ${UZUN}`);
  assert.equal(tek(uzun, 'RRULE').deger, 'FREQ=MONTHLY;BYMONTHDAY=28,29,30;BYSETPOS=-1');

  const omer = uidIle(cal, 'dogum-omer-id@biz-ikimiz');
  assert.equal(metinCoz(tek(omer, 'SUMMARY').deger), "🎂 Ömer'in doğum günü");
  assert.equal(tek(omer, 'DTSTART').deger, '19960229');
  assert.equal(tek(omer, 'DTEND').deger, '19960301');
  assert.equal(tek(omer, 'RRULE').deger, 'FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=-1');
  assert.equal(tek(uidIle(cal, 'dogum-gul-id@biz-ikimiz'), 'RRULE').deger, 'FREQ=YEARLY');
});

test('VALARM: her hatırlatma için DISPLAY, o günün 09:00\'ı', () => {
  const cal = ayristir(icsMetni(icsOlaylari(veri()), { simdi: SIMDI }));
  const alarmlar = (uid) => uidIle(cal, uid).alt.filter((b) => b.ad === 'VALARM');
  const ilk = alarmlar('g-ilk@biz-ikimiz');
  assert.deepEqual(ilk.map((a) => tek(a, 'TRIGGER').deger), ['PT9H', '-PT15H', '-P6DT15H']);
  for (const a of ilk) {
    assert.equal(tek(a, 'ACTION').deger, 'DISPLAY');
    assert.deepEqual(tek(a, 'TRIGGER').param, { RELATED: 'START' });
    assert.equal(metinCoz(tek(a, 'DESCRIPTION').deger), '☕ İlk buluşmamız; Kadıköy, iskele');
  }
  assert.equal(alarmlar('g-ay@biz-ikimiz').length, 0);
  assert.deepEqual(alarmlar('g-plan@biz-ikimiz').map((a) => tek(a, 'TRIGGER').deger), ['PT9H']);
  assert.deepEqual(alarmlar('g-uzun@biz-ikimiz').map((a) => tek(a, 'TRIGGER').deger), ['-P6DT15H']);
  assert.deepEqual(alarmlar('dogum-omer-id@biz-ikimiz').map((a) => tek(a, 'TRIGGER').deger), ['PT9H', '-PT15H']);
});

test('buluşma: saatli, UTC Z, 1 saat; not açıklamada; alarm yok', () => {
  const cal = ayristir(icsMetni(icsOlaylari(veri()), { simdi: SIMDI }));
  const b = uidIle(cal, 'bulusma-20261105T173000Z@biz-ikimiz');
  assert.deepEqual(tek(b, 'DTSTART'), { ad: 'DTSTART', param: {}, deger: '20261105T173000Z' });
  assert.deepEqual(tek(b, 'DTEND'), { ad: 'DTEND', param: {}, deger: '20261105T183000Z' });
  assert.equal(metinCoz(tek(b, 'SUMMARY').deger), '💞 Buluşmamız');
  assert.equal(metinCoz(tek(b, 'DESCRIPTION').deger), 'Kadıköy iskelesi, 2. kapı');
  assert.equal(oz(b, 'RRULE').length + oz(b, 'TRANSP').length + b.alt.length, 0);
});

test('UID kararlı: farklı DTSTAMP, aynı içerik', () => {
  const a = icsMetni(icsOlaylari(veri()), { simdi: SIMDI });
  const sonra = new Date(SIMDI.getTime() + 3600000);
  const b = icsMetni(icsOlaylari(veri({ simdi: sonra })), { simdi: sonra });
  const uidler = (m) => olaylar(ayristir(m)).map((e) => tek(e, 'UID').deger);
  assert.deepEqual(uidler(a), uidler(b));
  assert.notEqual(a, b);
  const damgasiz = (m) => m.replace(/DTSTAMP:\d{8}T\d{6}Z/g, 'DTSTAMP');
  assert.equal(damgasiz(a), damgasiz(b));
  // Tek gün dosyası aynı UID'yi kullanır (yeniden içe aktarınca çift kayıt olmaz).
  const tekCal = ayristir(icsMetni([gunOlayi(gunler[0])], { simdi: SIMDI }));
  assert.equal(olaylar(tekCal).length, 1);
  assert.equal(tek(olaylar(tekCal)[0], 'UID').deger, 'g-ilk@biz-ikimiz');
  assert.equal(olaylar(ayristir(icsMetni([null, gunOlayi(gunler[4])], { simdi: SIMDI }))).length, 0);
});

test('kilometre taşları: yalnız istenirse; 10 yıl; UID başlangıcı içerir; gününde alarm', () => {
  assert.ok(!icsOlaylari(veri()).some((o) => o.uid.startsWith('tas-')));
  const l = icsOlaylari(veri({ taslar: true })).filter((o) => o.uid.startsWith('tas-'));
  const beklenen = milestonesBetween(BAS, BUGUN, addDays(BUGUN, 3652));
  assert.equal(l.length, beklenen.length);
  assert.deepEqual(l.map((o) => o.gun), beklenen.map((m) => m.date));
  assert.ok(l.every((o) => o.gun >= BUGUN && o.gun <= addDays(BUGUN, 3652)));
  assert.equal(l.filter((o) => o.uid.startsWith('tas-yil-')).length, 10);
  const cal = ayristir(icsMetni(l, { simdi: SIMDI }));
  const yil2 = uidIle(cal, 'tas-yil-2-20250214@biz-ikimiz');
  assert.equal(metinCoz(tek(yil2, 'SUMMARY').deger), '💞 2. yıl dönümümüz');
  assert.equal(tek(yil2, 'DTSTART').deger, '20270214');
  assert.equal(oz(yil2, 'RRULE').length, 0);
  assert.deepEqual(yil2.alt.map((a) => tek(a, 'TRIGGER').deger), ['PT9H']);
  assert.ok(uidIle(cal, 'tas-gun-1000-20250214@biz-ikimiz'));
  assert.deepEqual(icsOlaylari(veri({ taslar: true, baslangic: null, gunler: [], kisiler: [], cift: {} })), []);
});
