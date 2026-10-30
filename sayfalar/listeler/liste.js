// Listelerimiz: saf mantık (DOM yok; Node'da test edilir).
// Belge türü 'liste' (SÖZLEŞME §17):
//   { liste, metin, not?, ekleyen?: clientId, yapildi?: ISO, yapan?: clientId, kimin?: clientId, alacak?: clientId }
// 'ekleyen': öğeyi ilk ekleyen (belgenin author alanı son yazandır; işaretleyince değişir).
// 'kimin' yalnız hediye listesinde: istek listesinin sahibi.
// 'alacak' yalnız hediye listesinde: "Ben alacağım 🤫" diyen partnerin clientId'si.
//   UYARI: Bu işaret gerçek bir gizlilik değildir. Belge iki cihaza da gider; sahibi
//   tarayıcı araçlarıyla görebilir. Yalnız arayüzde sahibinden gizlenir (gizliIsaret, sahibeGoster).

export const LISTELER = [
  {
    id: 'yapilacak', emoji: '🌍', ad: 'Birlikte yapılacaklar', kisa: 'Yapılacak',
    ipucu: 'Ne yapalım? ör. balon turu',
    bos: 'Henüz bir hayalimiz yok. İlkini yazalım mı?',
    fiil: ['yaptın', 'yaptı'],
  },
  {
    id: 'izlenecek', emoji: '🎬', ad: 'İzlenecekler', kisa: 'İzlenecek',
    ipucu: 'Film, dizi… ör. Babam ve Oğlum',
    bos: 'İzleme listemiz boş. Aklında bir film var mı?',
    fiil: ['izledin', 'izledi'],
  },
  {
    id: 'gidilecek', emoji: '📍', ad: 'Gidilecek yerler', kisa: 'Gidilecek',
    ipucu: "Nereye? ör. Kaş'ta kahvaltı",
    bos: 'Henüz bir rota yok. Haritaya ilk iğneyi batıralım mı?',
    fiil: ['gittin', 'gitti'],
  },
  {
    id: 'hediye', emoji: '🎁', ad: 'Hediye fikirleri', kisa: 'Hediye',
    ipucu: 'Ne isterdin? ör. Bir plak',
    bos: 'İstek listen boş. Aklındakini yaz, sevgilin görsün.',
    fiil: null,
  },
  {
    id: 'alisveris', emoji: '🛒', ad: 'Alışveriş', kisa: 'Alışveriş',
    ipucu: 'Ne lazım? ör. Süt, çilek',
    bos: 'Alışveriş listesi boş. Dolap dolu demek!',
    fiil: ['aldın', 'aldı'],
  },
];

export const MAX_METIN = 140;
export const MAX_NOT = 500;
export const BILDIRIM_ARALIK = 5 * 60 * 1000;
const MAX_BASLIK = 80;

export function listeById(id) {
  return LISTELER.find((l) => l.id === id) || null;
}

const tekSatir = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const notTemiz = (s) => String(s ?? '').replace(/\r\n?/g, '\n').trim();
const zaman = (s) => {
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : 0;
};

function metinNotKontrol(metin, not) {
  const m = tekSatir(metin);
  const n = notTemiz(not);
  if (!m) return { hata: 'Önce bir şey yaz.' };
  if (m.length > MAX_METIN) return { hata: `En çok ${MAX_METIN} harf olsun.` };
  if (n.length > MAX_NOT) return { hata: `Not en çok ${MAX_NOT} harf olsun.` };
  return { m, n };
}

/** Yeni öğe verisi. -> { data } | { hata } */
export function yeniOge({ liste, metin, not, me }) {
  if (!listeById(liste)) return { hata: 'Bilinmeyen liste.' };
  const k = metinNotKontrol(metin, not);
  if (k.hata) return k;
  const data = { liste, metin: k.m };
  if (k.n) data.not = k.n;
  if (me) data.ekleyen = me;
  if (liste === 'hediye') data.kimin = me;
  return { data };
}

/** Metin ve notu değiştirir; diğer alanları (yapildi, kimin, alacak) korur. -> { data } | { hata } */
export function duzenle(data, { metin, not }) {
  const k = metinNotKontrol(metin, not);
  if (k.hata) return k;
  const out = { ...data, metin: k.m };
  if (k.n) out.not = k.n;
  else delete out.not;
  return { data: out };
}

/** Öğeyi ilk ekleyen; eski belgelerde yazana düşer. */
export function ekleyen(doc) {
  return doc?.data?.ekleyen || doc?.author || null;
}

/** Hediye öğesinin sahibi: kimin; yoksa yazan. */
export function sahibi(doc) {
  return doc?.data?.kimin || doc?.author || null;
}

/** Hediye öğesi kimin listesinde? 'ben' | 'o' */
export function grubu(doc, me) {
  return sahibi(doc) === me ? 'ben' : 'o';
}

const listeninMi = (doc, liste, me, grup) =>
  doc?.data?.liste === liste && (liste !== 'hediye' || !grup || grubu(doc, me) === grup);

/**
 * Bir listenin görünen öğeleri. Yapılmayanlar üstte (yeniden eskiye), yapılanlar altta (son yapılan üstte).
 * gizle: yapılanları çıkarır. grup: hediye listesinde 'ben' | 'o'.
 */
export function ogeler(docs, { liste, me = null, grup = 'ben', gizle = false } = {}) {
  const hepsi = (docs || []).filter((d) => listeninMi(d, liste, me, grup));
  const acik = hepsi.filter((d) => !d.data.yapildi)
    .sort((a, b) => zaman(b.created_at) - zaman(a.created_at));
  if (gizle) return acik;
  const biten = hepsi.filter((d) => d.data.yapildi)
    .sort((a, b) => zaman(b.data.yapildi) - zaman(a.data.yapildi));
  return [...acik, ...biten];
}

/** -> { yapilan, toplam }. Hediyede grup verilirse yalnız o grup. */
export function sayac(docs, liste, { me = null, grup = null } = {}) {
  const hepsi = (docs || []).filter((d) => listeninMi(d, liste, me, grup));
  return { yapilan: hepsi.filter((d) => d.data.yapildi).length, toplam: hepsi.length };
}

/** Her liste için { yapilan, toplam } (hediye: iki grup birlikte). */
export function tumSayaclar(docs) {
  const out = {};
  for (const l of LISTELER) out[l.id] = sayac(docs, l.id);
  return out;
}

export function isaretle(data, me, simdi = new Date()) {
  return { ...data, yapildi: new Date(simdi).toISOString(), yapan: me };
}

export function geriAl(data) {
  const { yapildi, yapan, ...kalan } = data || {};
  return kalan;
}

/** Hediyeyi yalnız sahibi işaretler ("geldi"); partner işaretlerse sürpriz bozulur. */
export function isaretleyebilir(doc, me) {
  return doc?.data?.liste !== 'hediye' || sahibi(doc) === me;
}

/** Hediye istek listesini yalnız sahibi düzenler ve siler. */
export function duzenleyebilir(doc, me) {
  return doc?.data?.liste !== 'hediye' || sahibi(doc) === me;
}

/**
 * "Ben alacağım 🤫" işareti bu kişiye gösterilir mi?
 * -> null (gösterme) | { ben: true/false }. Listenin sahibine HİÇBİR ZAMAN gösterilmez.
 */
export function gizliIsaret(doc, me) {
  const d = doc?.data;
  if (!d || d.liste !== 'hediye' || !d.alacak) return null;
  if (sahibi(doc) === me) return null;
  return { ben: d.alacak === me };
}

/** Ekrana gidecek veri: sahibi bakıyorsa 'alacak' alanı çıkarılır (yalnız arayüz gizlemesi). */
export function sahibeGoster(doc, me) {
  const data = { ...(doc?.data || {}) };
  if (data.liste === 'hediye' && sahibi(doc) === me) delete data.alacak;
  return data;
}

/** Partner "Ben alacağım" işaretini açar/kapatır. -> { data } | { hata } */
export function alacakDegistir(doc, me) {
  const d = doc?.data;
  if (!d || d.liste !== 'hediye') return { hata: 'Yalnız hediye fikirlerinde olur.' };
  if (sahibi(doc) === me) return { hata: 'Kendi isteğini işaretleyemezsin.' };
  const out = { ...d };
  if (out.alacak === me) delete out.alacak;
  else out.alacak = me;
  return { data: out };
}

/**
 * "Gül yaptı · 12 Ekim". kim = { ben: true } ya da { ad }. tarih = hazır biçimlenmiş gün metni.
 */
export function yapildiMetni(liste, kim = {}, tarih = '') {
  const l = listeById(liste);
  let bas;
  if (!l?.fiil) bas = 'Hediye geldi';
  else if (kim.ben) bas = `Sen ${l.fiil[0]}`;
  else bas = `${kim.ad || 'Sevgilin'} ${l.fiil[1]}`;
  return tarih ? `${bas} · ${tarih}` : bas;
}

/** Ekleme bildirimi seyreltmesi: son bildirimden bu yana en az BILDIRIM_ARALIK geçti mi? */
export function bildirimZamaniMi(son, simdi = Date.now(), aralik = BILDIRIM_ARALIK) {
  const s = Number(son);
  if (son == null || !Number.isFinite(s)) return true;
  return simdi - s >= aralik;
}

/** Anılar sayfasına "yeni anı" adres parametreleri. */
export function aniParametreleri(metin, gun) {
  return { yeni: 1, baslik: tekSatir(metin).slice(0, MAX_BASLIK), tarih: gun };
}
