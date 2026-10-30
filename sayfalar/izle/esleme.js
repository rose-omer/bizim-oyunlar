// Birlikte İzle: saf mantık. DOM yok; Node'da test edilir.
// - YouTube bağlantısı ayrıştırma
// - İki oynatıcıyı eşleyen denetleyici (son eylem kazanır, gecikme telafisi, yankı bastırma)
// - Son izlenenler listesi

const ID_RE = /^[A-Za-z0-9_-]{11}$/;
const YT_HOSTS = /(^|\.)(youtube\.com|youtube-nocookie\.com)$/i;

export function gecerliId(id) {
  return typeof id === 'string' && ID_RE.test(id);
}

/** '90', '90s', '1m30s', '1h2m3s', '1:30', '01:02:03' → saniye (geçersizse 0). */
export function saniyeAyristir(t) {
  if (t == null) return 0;
  const s = String(t).trim().toLowerCase();
  if (!s) return 0;
  if (/^\d+(\.\d+)?$/.test(s)) return Math.floor(Number(s));
  if (/^\d+(:\d{1,2}){1,2}$/.test(s)) return s.split(':').reduce((a, p) => a * 60 + Number(p), 0);
  const m = s.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/);
  if (!m || !(m[1] || m[2] || m[3])) return 0;
  return (Number(m[1]) || 0) * 3600 + (Number(m[2]) || 0) * 60 + (Number(m[3]) || 0);
}

/**
 * Metindeki YouTube videosunu bulur: watch, youtu.be, shorts, embed, live, v/, m. ve music. alt alanları,
 * nocookie, ya da yalın 11 karakterlik kimlik. -> { id, baslangic } | null
 */
export function videoAyristir(metin) {
  const s = String(metin ?? '').trim();
  if (!s) return null;
  if (gecerliId(s)) return { id: s, baslangic: 0 };
  const aday = s.match(/(?:https?:\/\/)?[^\s]*(?:youtube\.com|youtu\.be|youtube-nocookie\.com)[^\s]*/i)?.[0];
  if (!aday) return null;
  let u;
  try {
    u = new URL(/^https?:\/\//i.test(aday) ? aday : `https://${aday}`);
  } catch {
    return null;
  }
  const host = u.hostname.toLowerCase();
  let id = null;
  if (host === 'youtu.be' || host.endsWith('.youtu.be')) {
    id = u.pathname.split('/')[1];
  } else if (YT_HOSTS.test(host)) {
    const parca = u.pathname.split('/').filter(Boolean);
    if (parca[0] === 'watch') id = u.searchParams.get('v');
    else if (['shorts', 'embed', 'live', 'v', 'e'].includes(parca[0])) id = parca[1];
    else if (u.searchParams.get('v')) id = u.searchParams.get('v');
  }
  if (!gecerliId(id)) return null;
  const hash = new URLSearchParams(u.hash.replace(/^#/, ''));
  const t = u.searchParams.get('t') ?? u.searchParams.get('start') ?? u.searchParams.get('time_continue') ?? hash.get('t');
  return { id, baslangic: saniyeAyristir(t) };
}

/** Kapak görseli (YouTube'un herkese açık önizlemesi). */
export function kapakUrl(id) {
  return gecerliId(id) ? `https://i.ytimg.com/vi/${id}/mqdefault.jpg` : '';
}

/** Son izlenenler: başa ekler, aynı videoyu tekilleştirir, en çok max tutar. Başlık boşsa eskisini korur. */
export function sonaEkle(liste, oge, max = 10) {
  if (!oge || !gecerliId(oge.id)) return Array.isArray(liste) ? liste.slice(0, max) : [];
  const eski = (liste || []).find((x) => x?.id === oge.id);
  const yeni = { id: oge.id, baslik: oge.baslik || eski?.baslik || '', at: oge.at ?? Date.now() };
  return [yeni, ...(liste || []).filter((x) => x && x.id !== oge.id && gecerliId(x.id))].slice(0, max);
}

/** Ne kadar önce: 'az önce', '5 dk önce', '3 sa önce', 'dün', '4 gün önce'. */
export function oncesi(at, simdi = Date.now()) {
  const dk = Math.floor(Math.max(0, simdi - at) / 60000);
  if (dk < 1) return 'az önce';
  if (dk < 60) return `${dk} dk önce`;
  const sa = Math.floor(dk / 60);
  if (sa < 24) return `${sa} sa önce`;
  const gun = Math.floor(sa / 24);
  return gun === 1 ? 'dün' : `${gun} gün önce`;
}

/** saniye → '1:05' ya da '1:02:03' */
export function sureYazi(sn) {
  const s = Math.max(0, Math.floor(sn || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

// ---------- Eşleme ----------

export const KAYMA_ESIK = 1.5;     // sn: bundan büyük farkta seekTo
export const SICRAMA_ESIK = 1.2;   // sn: ölçümler arası beklenmeyen sıçrama = kullanıcı sardı
export const BASTIR_MS = 1200;     // uzaktan komuttan sonra oynatıcının kendi olaylarını yayma
export const YUKLE_BASTIR_MS = 4000;
export const KALP_MS = 10000;      // lider oynarken bu aralıkla konum yayar
export const GECIKME_UST_MS = 4000;
const HIZLAR = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

/** Ortak durumun şimdiki zamanı (sn). o.at yerel saattir. */
export function hedefZaman(o, simdi) {
  if (!o) return 0;
  const gecen = o.durum === 'oynuyor' ? (Math.max(0, simdi - o.at) / 1000) * (o.hiz || 1) : 0;
  return o.zaman + gecen;
}

/** İki ölçüm arasında beklenmeyen zaman sıçraması var mı? onceki = { zaman, at, oynuyor, hiz } */
export function sicramaVar(onceki, simdiki, esik = SICRAMA_ESIK) {
  if (!onceki) return false;
  const beklenen = hedefZaman({ durum: onceki.oynuyor ? 'oynuyor' : 'durdu', zaman: onceki.zaman, hiz: onceki.hiz, at: onceki.at }, simdiki.at);
  return Math.abs(simdiki.zaman - beklenen) > esik;
}

/** NTP benzeri saat farkı: a = gönderim (benim saatim), b = karşının saati, c = alış (benim saatim). */
export function saatFarki(a, b, c) {
  return { fark: b - (a + c) / 2, rtt: Math.max(0, c - a) };
}

function hizTemiz(h) {
  const n = Number(h);
  return HIZLAR.includes(n) ? n : 1;
}

/** Sürüm karşılaştırma: Lamport sayacı + clientId ile kesin sıra. a yeni mi b'den? */
export function dahaYeni(a, b) {
  if (!b) return true;
  if (a.surum !== b.surum) return a.surum > b.surum;
  return String(a.sahip) > String(b.sahip);
}

/**
 * İki tarayıcıdaki oynatıcıyı eşler.
 * oynatici: { zaman(), durum(): 'oynuyor'|'durdu'|'tamponda'|'bitti'|'hazir'|'yok', hiz(),
 *             oynat(), duraklat(), git(sn), hizAyarla(h), yukle(videoId, sn, oynat) }
 * gonder(msg): karşıya { t:'izle', videoId, durum, zaman, hiz, at, surum, sahip, kalp? }
 * Kurallar: son eylem kazanır (surum); uzaktan gelen eylem tekrar yayılmaz; alıcı gecikmeyi (at) telafi eder;
 * 1,5 sn'den büyük kaymada git(); oynatma engellenirse onEngel(true).
 */
export function createEsleyici({ oynatici, gonder, ben = 'ben', simdi = () => Date.now(), onEngel = () => {}, onOrtak = () => {} }) {
  let ortak = null;     // { videoId, durum, zaman, hiz, at } (at yerel saat)
  let eylem = null;     // { surum, sahip } ortak durumu belirleyen son eylem
  let lider = false;    // son eylemi ben mi yaptım
  let bastir = 0;
  let olcum = null;
  let oynadi = false;   // son komuttan beri oynatıcı gerçekten oynadı mı
  let engel = false;
  let sonKalp = 0;
  let saat = null;      // { fark, rtt } en iyi ölçüm

  const oku = () => ({ zaman: Number(oynatici.zaman()) || 0, durum: oynatici.durum(), hiz: Number(oynatici.hiz()) || 1, at: simdi() });
  const olcumYenile = (o) => { olcum = { zaman: o.zaman, at: o.at, oynuyor: o.durum === 'oynuyor', hiz: o.hiz }; };
  const engelAyarla = (v) => { if (v !== engel) { engel = v; onEngel(v); } };
  const yuvarla = (n) => Math.round(n * 1000) / 1000;

  function mesaj(kalp = false) {
    const t = simdi();
    const m = {
      t: 'izle', videoId: ortak.videoId, durum: ortak.durum, zaman: yuvarla(hedefZaman(ortak, t)), hiz: ortak.hiz,
      at: t, surum: eylem.surum, sahip: eylem.sahip,
    };
    if (kalp) m.kalp = true;
    return m;
  }

  function yeniEylem() {
    eylem = { surum: (eylem?.surum ?? 0) + 1, sahip: ben };
    lider = true;
  }

  // Yerel kullanıcı eylemi: oynatıcının şimdiki hâlini ortak yap ve yay.
  function yayinla(o) {
    const durum = o.durum === 'oynuyor' ? 'oynuyor' : o.durum === 'durdu' ? 'durdu' : ortak.durum;
    ortak = { videoId: ortak.videoId, durum, zaman: o.zaman, hiz: o.hiz, at: o.at };
    yeniEylem();
    sonKalp = o.at;
    olcumYenile(o);
    if (durum === 'durdu' || o.durum === 'oynuyor') engelAyarla(false);
    gonder(mesaj());
    onOrtak(ortak, 'yerel');
  }

  function kalpGonder(o) {
    ortak = { ...ortak, zaman: o.zaman, at: o.at };
    sonKalp = o.at;
    gonder(mesaj(true));
  }

  function yetis(o) {
    const hedef = hedefZaman(ortak, o.at);
    if (Math.abs(o.zaman - hedef) <= KAYMA_ESIK) return;
    if (lider) { kalpGonder(o); return; } // lider geride kaldıysa (tampon) karşıyı kendine çeker
    bastir = o.at + BASTIR_MS;
    olcum = null;
    oynatici.git(hedef);
  }

  /** Oynatıcı olayı (durum/hız değişti) ya da 500 ms'lik yoklama. */
  function denetle() {
    if (!ortak) return;
    const o = oku();
    if (o.durum === 'yok') return;
    if (o.durum === 'oynuyor') oynadi = true;
    if (o.at < bastir) { if (o.durum !== 'tamponda') olcumYenile(o); return; }
    const kararli = o.durum === 'oynuyor' || o.durum === 'durdu';
    const sicradi = !!olcum && (kararli || o.durum === 'tamponda') && sicramaVar(olcum, o);
    const durumFarkli = kararli && (o.durum === 'oynuyor') !== (ortak.durum === 'oynuyor');
    const hizFarkli = kararli && o.hiz !== ortak.hiz;
    // Hiç oynamamış oynatıcının "durdu"su kullanıcı değil, otomatik oynatma engelidir.
    const kullanici = sicradi || hizFarkli || (durumFarkli && (o.durum === 'oynuyor' || oynadi));
    if (kullanici) { yayinla(o); return; }
    if (o.durum === 'tamponda') { olcum = { zaman: o.zaman, at: o.at, oynuyor: false, hiz: o.hiz }; return; }
    olcumYenile(o);
    if (ortak.durum !== 'oynuyor') { engelAyarla(false); return; }
    if (o.durum === 'oynuyor') {
      engelAyarla(false);
      yetis(o);
      if (lider && o.at - sonKalp >= KALP_MS) kalpGonder(o);
    } else if (o.durum === 'durdu' || o.durum === 'hazir') {
      engelAyarla(true);
    }
  }

  return {
    get ortak() { return ortak; },
    get lider() { return lider; },
    get engel() { return engel; },
    get saat() { return saat; },

    /** Yerel kullanıcı yeni video açtı. */
    videoAc(videoId, baslangic = 0) {
      if (!videoId) return;
      const t = simdi();
      ortak = { videoId, durum: 'oynuyor', zaman: Math.max(0, baslangic || 0), hiz: 1, at: t };
      yeniEylem();
      sonKalp = t;
      bastir = t + YUKLE_BASTIR_MS;
      olcum = null;
      oynadi = false;
      engelAyarla(false);
      oynatici.yukle(videoId, ortak.zaman, true);
      gonder(mesaj());
      onOrtak(ortak, 'yerel');
    },

    /** Karşıdan gelen { t:'izle', ... }. -> 'tamam' | 'eski' (benimki daha yeni) | 'gecersiz' */
    uzaktan(m) {
      if (!m || m.t !== 'izle' || !gecerliId(m.videoId) || !Number.isFinite(Number(m.surum))) return 'gecersiz';
      const gelen = { surum: Number(m.surum), sahip: String(m.sahip ?? '') };
      const ayni = eylem && gelen.surum === eylem.surum && gelen.sahip === eylem.sahip;
      if (!ayni && !dahaYeni(gelen, eylem)) return 'eski'; // eskimiş eylem: son eylem kazanır
      const t = simdi();
      const at = Number(m.at) - (saat?.fark ?? 0); // karşının saatini benimkine çevir
      const gecikme = Number.isFinite(at) ? Math.min(GECIKME_UST_MS, Math.max(0, t - at)) : 0;
      const yeni = {
        videoId: m.videoId,
        durum: m.durum === 'oynuyor' ? 'oynuyor' : 'durdu',
        zaman: Math.max(0, Number(m.zaman) || 0),
        hiz: hizTemiz(m.hiz),
        at: t - gecikme,
      };
      const videoDegisti = !ortak || ortak.videoId !== yeni.videoId;
      const komut = !ayni; // kalp atışı yalnız kaymayı düzeltir
      ortak = yeni;
      eylem = gelen;
      lider = false;
      const hedef = hedefZaman(ortak, t);
      const d = oynatici.durum();
      if (videoDegisti || d === 'yok') {
        bastir = t + YUKLE_BASTIR_MS;
        oynadi = false;
        oynatici.yukle(yeni.videoId, hedef, yeni.durum === 'oynuyor');
      } else {
        if (komut) {
          bastir = t + BASTIR_MS;
          if (yeni.durum === 'oynuyor' && d !== 'oynuyor') oynadi = false;
        }
        if (Number(oynatici.hiz()) !== yeni.hiz) { bastir = t + BASTIR_MS; oynatici.hizAyarla(yeni.hiz); }
        if (yeni.durum === 'oynuyor' && d !== 'oynuyor' && d !== 'tamponda') { bastir = t + BASTIR_MS; oynatici.oynat(); }
        if (yeni.durum === 'durdu' && (d === 'oynuyor' || d === 'tamponda')) { bastir = t + BASTIR_MS; oynatici.duraklat(); }
        if (Math.abs((Number(oynatici.zaman()) || 0) - hedef) > KAYMA_ESIK) { bastir = t + BASTIR_MS; oynatici.git(hedef); }
      }
      olcum = null;
      if (yeni.durum === 'durdu') engelAyarla(false);
      onOrtak(ortak, 'uzak');
      return 'tamam';
    },

    denetle,

    /** Oynatıcı yeni hazır oldu: ortak durum varsa yükle. */
    oynaticiHazir() {
      if (!ortak) return;
      const t = simdi();
      bastir = t + YUKLE_BASTIR_MS;
      olcum = null;
      oynadi = false;
      oynatici.yukle(ortak.videoId, hedefZaman(ortak, t), ortak.durum === 'oynuyor');
    },

    /** "Oynatmak için dokun": kullanıcı dokunuşuyla ortak zamana gidip oynat. Yayın yapmaz. */
    dokunOynat() {
      if (!ortak) return;
      const t = simdi();
      bastir = t + BASTIR_MS;
      olcum = null;
      oynatici.git(hedefZaman(ortak, t));
      oynatici.oynat();
      engelAyarla(false);
    },

    /** "Bana eşitle": oynatıcımın şimdiki hâlini yeni eylem olarak yay. */
    esitle() {
      if (!ortak) return false;
      const o = oku();
      if (o.durum === 'yok') return false;
      yayinla(o);
      return true;
    },

    /** Partner gelince ya da isteyince yollanacak güncel durum (yoksa null). */
    durumMesaji() {
      return ortak && eylem ? mesaj() : null;
    },

    /** Saat farkı ölçümü ekle; en kısa gidiş-dönüşlü ölçüm tutulur. */
    saatOrnek(a, b, c) {
      const o = saatFarki(a, b, c);
      if (!saat || o.rtt <= saat.rtt) saat = o;
      return saat;
    },
  };
}
