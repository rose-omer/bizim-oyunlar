// Cihaz üyeliğinin saf mantığı (Node'da test edilir; DOM ve depo yok). TALIMAT §2, §4.3, §5.1.
// Üst kısım: biçimler ve sunucu yanıtı. Alt kısım: yerel SIKI öykünme (sunucudaki oda_katil, oda_durum,
// cihaz_* , davet_olustur, kurtarma_olustur kurallarının aynısı). Öykünme durumu düz JSON'dur; çağıran saklar.
// Öykünme anahtarları özet yerine düz tutar (aynı tarayıcı; davranış aynı). Hız sınırı öykünmede yok.

export const ANAHTAR_RE = /^[A-Za-z0-9_-]{43}$/;
export const CIHAZ_RE = /^[A-Za-z0-9_-]{1,64}$/;
const DAVET_RE = /^[a-z2-9]{32}$/;
const KANAL_RE = /^[A-Za-z0-9_-]{1,64}$/;
const DAVET_ALFABE = 'abcdefghijkmnpqrstuvwxyz23456789'; // oda koduyla aynı: l, o, 0, 1 yok
const KURTARMA_ALFABE = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const DURUMLAR = ['onayli', 'bekliyor', 'reddedildi', 'cakisma', 'yok', 'silindi'];
const ACIK = ['onayli', 'eski-sunucu'];
const AD_MAX = 60;
const GUN_MS = 864e5;
const DAVET_GUN = 7;
const ESKI_ODA_GUN = 3;
const GORULME_MS = 10 * 60_000;
const MAX_ONAYLI = 8;
const MAX_SATIR = 20;
const MAX_DAVET = 5;

// ---------- Biçimler ----------

/** Baytlar → base64url, dolgusuz. 32 bayt → 43 karakter. */
export function base64url(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

const hex = (bytes) => [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
const secim = (bytes, alfabe) => [...bytes].map((b) => alfabe[b & 31]).join(''); // 32 harf: yansız

function cihazTuru(ua) {
  const s = String(ua || '');
  if (/iPhone/.test(s)) return 'iPhone';
  if (/iPad/.test(s)) return 'iPad';
  if (/Android/.test(s)) return /Mobile/.test(s) ? 'Android telefon' : 'Android tablet';
  if (/Windows/.test(s)) return 'Windows bilgisayar';
  if (/CrOS/.test(s)) return 'Chromebook';
  if (/Macintosh|Mac OS X/.test(s)) return 'Mac';
  if (/Linux/.test(s)) return 'Linux bilgisayar';
  return 'cihaz';
}

/** 'Ömer · Android telefon' | 'Gül · iPhone' | 'Windows bilgisayar' (ad yoksa). En çok 60 karakter. */
export function cihazAdi(ua, ad) {
  const tur = cihazTuru(ua);
  const temiz = String(ad || '').replace(/\s+/g, ' ').trim();
  if (!temiz) return tur;
  return `${temiz.slice(0, AD_MAX - tur.length - 3).trim()} · ${tur}`;
}

/** Postgres 42501 (yetki yok) ya da veri.js'in yetki işaretli hatası. */
export function yetkiHatasiMi(err) {
  return !!err && (err.code === '42501' || err.yetki === true);
}

/** Sunucuda RPC yok: PostgREST PGRST202 ya da HTTP 404. */
export function eskiSunucuHatasiMi(err, status) {
  return !!err && (err.code === 'PGRST202' || status === 404);
}

/** oda_katil / oda_durum yanıtı → { durum, kanal, zorunlu, ilk } | null. Kanal yalnız onaylıda. */
export function sonucCoz(data) {
  const d = Array.isArray(data) ? data[0] : data;
  if (!d || typeof d !== 'object' || !DURUMLAR.includes(d.durum)) return null;
  const kanal = d.durum === 'onayli' && typeof d.kanal === 'string' && KANAL_RE.test(d.kanal) ? d.kanal : null;
  return {
    durum: d.durum,
    kanal,
    zorunlu: typeof d.zorunlu === 'string' ? d.zorunlu : null,
    ilk: d.ilk === true,
  };
}

/** Sayfa açılır mı? Onaylı, eski sunucu ya da çevrimdışıyken son bilinen durum bunlardan biri. */
export function girisAcikMi(s) {
  if (!s) return false;
  if (ACIK.includes(s.durum)) return true;
  return s.durum === 'cevrimdisi' && ACIK.includes(s.onceki);
}

/** Gerçek zamanlı kanal adındaki gizli değer | null (katılma). Eski sunucu ya da koruma öncesi: oda kodu. */
export function kanalSec(s, roomId) {
  if (!girisAcikMi(s)) return null;
  if (s.durum === 'eski-sunucu' || s.onceki === 'eski-sunucu') return roomId;
  return s.kanal || roomId;
}

/** Kullanıcının yazdığı kurtarma kodu → 16 büyük harf (boşluk ve tire atılır). */
export function kurtarmaTemizle(kod) {
  return String(kod ?? '').toUpperCase().replace(/[\s-]/g, '');
}

export function davetKoduMu(kod) {
  return typeof kod === 'string' && DAVET_RE.test(kod);
}

// ---------- Yerel sıkı öykünme ----------

const hata = (code, mesaj) => Object.assign(new Error(mesaj), { code });
const iso = (ms) => new Date(ms).toISOString();
const zaman = (s) => { const t = Date.parse(s); return Number.isFinite(t) ? t : 0; };

/** Boş öykünme durumu (bir oda için). */
export function yeniDurum() {
  return { oda: null, cihazlar: {}, davetler: {} };
}

function onayliSayisi(st) {
  return Object.values(st.cihazlar).filter((r) => r.durum === 'onayli').length;
}

function gorul(row, simdi) {
  if (!row.son_gorulme || simdi - zaman(row.son_gorulme) >= GORULME_MS) row.son_gorulme = iso(simdi);
}

function sonucOf(st, row, simdi, ilk = false) {
  const zorunlu = st.oda?.zorunlu ?? null;
  if (!row) return { durum: 'yok', kanal: null, zorunlu, ilk: false };
  if (row.durum !== 'onayli') return { durum: row.durum, kanal: null, zorunlu, ilk: false };
  return { durum: 'onayli', kanal: simdi < zaman(zorunlu) ? st.oda.room : st.oda.kanal, zorunlu, ilk };
}

/** oda_yetki: kimlik onaylı ve anahtar eşit olmalı. Kimliksiz çağrı yalnız koruma öncesinde geçer. */
export function ykYetki(st, kim, simdi) {
  if (!kim || (kim.cihaz == null && kim.anahtar == null)) {
    if (!st.oda || simdi < zaman(st.oda.zorunlu)) return;
    throw hata('42501', 'yetki yok');
  }
  const row = CIHAZ_RE.test(kim.cihaz || '') ? st.cihazlar[kim.cihaz] : null;
  if (!row || row.durum !== 'onayli' || row.anahtar !== kim.anahtar) throw hata('42501', 'yetki yok');
  gorul(row, simdi);
}

/**
 * oda_katil. args: { room, cihaz, anahtar, ad, davet, kurtarma, veriVar, eskiYazar }. Durumu yerinde değiştirir.
 * eskiYazar = odada oda satırından önce yazılmış, id'si bu cihaz olan 'kisi' belgesi var (geçiş yolu).
 */
export function ykKatil(st, args, { simdi, rastgele }) {
  const { room, cihaz, anahtar, davet, kurtarma, veriVar = false, eskiYazar = false } = args;
  if (!CIHAZ_RE.test(cihaz || '') || !ANAHTAR_RE.test(anahtar || '')) throw hata('22023', 'oda_katil: gecersiz');
  const ad = args.ad ? String(args.ad).slice(0, AD_MAX) : null;
  if (!st.oda) {
    st.oda = {
      room, kanal: hex(rastgele(16)), kurtarma: null, olusturma: iso(simdi),
      zorunlu: iso(veriVar ? simdi + ESKI_ODA_GUN * GUN_MS : simdi),
    };
  }
  const kurtarmaGecerli = !!(kurtarma && st.oda.kurtarma && kurtarmaTemizle(kurtarma) === st.oda.kurtarma);
  // Geçerli davet: kullanılmamış, süresi geçmemiş. Kişiye bağlı davet yalnız o kimlik için; başkasına yok sayılır.
  const d = davet ? st.davetler[davet] : null;
  const davetGecerli = !!(d && !d.kullanildi && zaman(d.son) > simdi && (!d.kimlik || d.kimlik === cihaz));
  let row = st.cihazlar[cihaz];
  if (row && row.anahtar !== anahtar) {
    // Çakışma: yalnız bu kimliğe bağlı davet ya da geçerli kurtarma kodu çözer; genel davet çözmez.
    // Bağlı davet önce: davet harcanır, kurtarma kodu kalır. Anahtar yenilenir, onaylanır; eski anahtarın
    // davetleri silinir, kanal yenilenir.
    const bagli = davetGecerli && d.kimlik === cihaz;
    if (!bagli && !kurtarmaGecerli) return { durum: 'cakisma', kanal: null, zorunlu: st.oda.zorunlu, ilk: false };
    if (row.durum !== 'onayli' && onayliSayisi(st) >= MAX_ONAYLI) throw hata('54000', 'oda_katil: cok fazla cihaz');
    if (bagli) d.kullanildi = iso(simdi);
    else st.oda.kurtarma = null;
    for (const [k, x] of Object.entries(st.davetler)) if (x.olusturan === cihaz) delete st.davetler[k];
    st.oda.kanal = hex(rastgele(16));
    row.anahtar = anahtar;
    row.durum = 'onayli';
    if (ad) row.ad = ad;
    row.son_gorulme = iso(simdi);
    return sonucOf(st, row, simdi);
  }
  if (row && row.durum === 'onayli') {
    if (ad) row.ad = ad;
    gorul(row, simdi);
    return sonucOf(st, row, simdi);
  }

  const n = onayliSayisi(st);
  let ilk = false;
  let yol = null;
  if (n === 0 && !veriVar) { yol = 'kurucu'; ilk = true; }
  else if (eskiYazar && simdi < zaman(st.oda.zorunlu)) yol = 'gecis'; // geçiş yalnız koruma başlamadan
  else if (davetGecerli) yol = 'davet';
  else if (kurtarmaGecerli) yol = 'kurtarma';

  if (!yol) {
    if (!row) {
      if (Object.keys(st.cihazlar).length >= MAX_SATIR) throw hata('54000', 'oda_katil: cok fazla cihaz');
      row = { anahtar, ad, durum: 'bekliyor', olusturma: iso(simdi), son_gorulme: null, onaylayan: null };
      st.cihazlar[cihaz] = row;
    }
    return sonucOf(st, row, simdi);
  }
  if (n >= MAX_ONAYLI || (!row && Object.keys(st.cihazlar).length >= MAX_SATIR)) {
    throw hata('54000', 'oda_katil: cok fazla cihaz');
  }
  if (yol === 'davet') d.kullanildi = iso(simdi);
  if (yol === 'kurtarma') st.oda.kurtarma = null;
  row = { anahtar, ad: ad ?? row?.ad ?? null, durum: 'onayli', olusturma: row?.olusturma || iso(simdi), son_gorulme: iso(simdi), onaylayan: null };
  st.cihazlar[cihaz] = row;
  return sonucOf(st, row, simdi, ilk);
}

/** oda_durum: hiçbir şey değiştirmez (son_gorulme hariç). */
export function ykDurum(st, kim, simdi) {
  if (!st.oda) return { durum: 'yok', kanal: null, zorunlu: null, ilk: false };
  const row = st.cihazlar[kim?.cihaz];
  if (row && row.anahtar !== kim.anahtar) return { durum: 'cakisma', kanal: null, zorunlu: st.oda.zorunlu, ilk: false };
  if (row?.durum === 'onayli') gorul(row, simdi);
  return sonucOf(st, row, simdi);
}

/** cihaz_listele: çağıran onaylı olmalı. Oluşturma sırasıyla. */
export function ykListele(st, kim, simdi) {
  ykYetki(st, kim, simdi);
  return Object.entries(st.cihazlar)
    .map(([cihaz, r]) => ({ cihaz, ad: r.ad ?? null, durum: r.durum, olusturma: r.olusturma, son_gorulme: r.son_gorulme ?? null }))
    .sort((a, b) => zaman(a.olusturma) - zaman(b.olusturma));
}

/** cihaz_onayla: bekliyor/reddedildi → onaylı. */
export function ykOnayla(st, kim, hedef, { simdi }) {
  ykYetki(st, kim, simdi);
  const row = st.cihazlar[hedef];
  if (!row || row.durum === 'onayli') return false;
  if (onayliSayisi(st) >= MAX_ONAYLI) throw hata('54000', 'cihaz_onayla: cok fazla cihaz');
  row.durum = 'onayli';
  row.onaylayan = kim.cihaz;
  return true;
}

/** cihaz_reddet: bekliyor → reddedildi. */
export function ykReddet(st, kim, hedef, { simdi }) {
  ykYetki(st, kim, simdi);
  const row = st.cihazlar[hedef];
  if (!row || row.durum !== 'bekliyor') return false;
  row.durum = 'reddedildi';
  return true;
}

/** cihaz_cikar: satırı siler, kanalı yeniler, korumayı en geç şimdi başlatır. Kendini çıkarmak serbest. */
export function ykCikar(st, kim, hedef, { simdi, rastgele = null }) {
  ykYetki(st, kim, simdi);
  if (!st.cihazlar[hedef]) return false;
  delete st.cihazlar[hedef];
  st.oda.kanal = hex(rastgele ? rastgele(16) : globalThis.crypto.getRandomValues(new Uint8Array(16)));
  st.oda.zorunlu = iso(Math.min(zaman(st.oda.zorunlu), simdi));
  return true;
}

/**
 * davet_olustur: 32 karakter, 7 gün, tek kullanım; en çok 5 geçerli davet (fazlası en eskiden silinir).
 * kimlik: kişiye bağlı davet; odada cihaz satırı ya da 'kisi' belgesi (kisiVar, çağıran bilir) olmalı (yoksa 22023).
 */
export function ykDavetOlustur(st, kim, { simdi, rastgele }, { kimlik = null, kisiVar = false } = {}) {
  ykYetki(st, kim, simdi);
  if (kimlik != null) {
    if (!CIHAZ_RE.test(kimlik)) throw hata('22023', 'davet_olustur: gecersiz kimlik');
    if (!kisiVar && !st.cihazlar[kimlik]) throw hata('22023', 'davet_olustur: kimlik odada yok');
  }
  for (const [k, d] of Object.entries(st.davetler)) {
    if (d.kullanildi || zaman(d.son) <= simdi) delete st.davetler[k];
  }
  const kod = secim(rastgele(32), DAVET_ALFABE);
  st.davetler[kod] = {
    olusturan: kim.cihaz, son: iso(simdi + DAVET_GUN * GUN_MS), kullanildi: null, olusturma: iso(simdi), kimlik: kimlik ?? null,
  };
  const gecerli = Object.entries(st.davetler).sort((a, b) => zaman(a[1].olusturma) - zaman(b[1].olusturma));
  while (gecerli.length > MAX_DAVET) delete st.davetler[gecerli.shift()[0]];
  return kod;
}

/** kurtarma_olustur: 'ABCD-EFGH-JKLM-NPQR'. Eskisinin yerine geçer. */
export function ykKurtarmaOlustur(st, kim, { simdi, rastgele }) {
  ykYetki(st, kim, simdi);
  const ham = secim(rastgele(16), KURTARMA_ALFABE);
  st.oda.kurtarma = ham;
  return ham.match(/.{4}/g).join('-');
}
