// Sohbet sayfası: ikinizin mesajlaşma yeri.
// Veri: 'mesaj' (son 100, yukarı kaydırınca eskiler) ve 'okundu' (id = clientId, { son, at }).
// Mesaj ekleri: foto (WebP/JPEG), ses ({ url, sure, tur }), yildiz ({ [clientId]: true }), sabit ({ at, kim }).
// Canlı sinyal: room.send({ t:'yaziyor' }) en çok 2 sn'de bir.
import { bootPage } from '../../js/core/sayfa.js';
import { openCollection, listDocs, patchDoc, maxUpdated, overlapSince } from '../../js/core/veri.js';
import { openProfil } from '../../js/core/profil.js';
import { uploadPhoto, uploadAudio, isAllowedPhotoUrl, SES_MAX_BAYT } from '../../js/core/storage.js';
import { fotoKucult } from '../../js/core/foto.js';
import { readStore, writeStore } from '../../js/core/identity.js';
import { bildir } from '../../js/core/bildirim.js';
import { partnerGoruyor } from '../../js/core/room.js';
import { h, toast, confirmDialog, knownPartner, fotoSrc } from '../../js/core/ui.js';
import { sfx } from '../../js/core/sound.js';
import { titret } from '../../js/core/mobil.js';
import * as M from './mantik.js';
import { ikon, gunSatiri, mesajSatiri, yuklemeSatiri, sesBoya } from './ekran.js';
import { jestleriBagla, CIFT_MS } from './jest.js';
import { aramaPaneli } from './panel.js';
import { sohbetBul } from './bul.js';
import { eslesmeler } from './arama.js';
import {
  kayitDestegi, kayitBaslat, tekOynatici, sesVerisi, sesSuresi, sureYazisi, kaydirIptalMi, IPTAL_ESIK, SES_EN_AZ_MS,
} from './ses.js';
import { onizlemeBagla } from '../anilar/onizleme.js';

const EMOJILER = ['❤️', '😘', '🥰', '😍', '😂', '🤭', '😊', '🥺', '😢', '😴', '🤗', '🙈', '🔥', '✨', '🌹', '💌'];
const ONERILER = ['Günaydın sevgilim ☀️', 'Seni özledim 🥺', 'Bu akşam ne yapıyoruz?'];
const ESKI_ESIK = 500; // tepeye bu kadar yaklaşınca eski mesajlar yüklenir
const TUTMA_MS = 350; // mikrofona bu kadar basılı tutunca kayıt başlar (bırakınca gönderilir)
const PENCERE = 30; // açılışta DOM'a basılan son mesaj sayısı; yukarı kaydırdıkça PENCERE kadar artar
const BALON_FOTO = Object.freeze({ uzun: 960 }); // balon en çok ~312 CSS px × 3
const GUN_UST = 8; // yapışkan gün ayırıcısının üst boşluğu (style.css .sh-gun top ile aynı)
// Sabit taraması bu andan sonra değişen mesajlara bakar (öncesinde sabitleme yoktu).
const SABIT_BASLANGIC = '2026-10-31T00:00:00.000Z';
const kok = document.documentElement;
const kaba = typeof matchMedia === 'function' ? matchMedia('(pointer: coarse)') : { matches: false };
const azHareket = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };

// ---------- Görünür alan (klavye açılınca giriş alanı görünür kalsın) ----------
// Kök değişkeni her yazılışta tüm sayfanın stili yeniden hesaplanır: yalnız değer değişince yaz.
function kokDegisken(ad, deger) {
  if (kok.style.getPropertyValue(ad) !== deger) kok.style.setProperty(ad, deger);
}
function gorunurAlan() {
  const vv = window.visualViewport;
  if (vv && vv.scale > 1.01) return; // kıstırarak yakınlaştırma: dokunma
  kokDegisken('--sh-vh', `${Math.round(vv ? vv.height : window.innerHeight)}px`);
  kokDegisken('--sh-vtop', `${Math.round(vv ? vv.offsetTop : 0)}px`);
}
gorunurAlan();
window.visualViewport?.addEventListener('resize', gorunurAlan);
window.visualViewport?.addEventListener('scroll', gorunurAlan);
window.addEventListener('resize', gorunurAlan);

const { room, roomId, me } = await bootPage({ ns: 'sohbet', title: 'Sohbet', tab: 'sohbet' });
const benId = me.clientId;

// Alt sekme çubuğunun yüksekliği (#app alt boşluğu).
const tabbar = document.getElementById('tabbar');
if (tabbar && typeof ResizeObserver === 'function') {
  new ResizeObserver(() => kokDegisken('--sh-tab-h', `${tabbar.offsetHeight}px`)).observe(tabbar);
}

// ---------- İskelet ----------
const app = document.getElementById('app');
app.classList.add('sohbet');

const ust = h('div', { class: 'sh-ust', 'aria-live': 'polite' });
const liste = h('ol', { class: 'sh-mesajlar', 'aria-label': 'Mesajlar' });
const yaziyorAd = h('span', { class: 'sh-yaziyor-ad' });
const yaziyorEl = h('div', { class: 'sh-yaziyor', hidden: true },
  h('span', { class: 'sh-yaziyor-balon', 'aria-hidden': 'true' }, h('i'), h('i'), h('i')), yaziyorAd);
const bos = h('div', { class: 'sh-bos', hidden: true },
  h('div', { class: 'sh-bos-kalp', 'aria-hidden': 'true' }, ikon('kalp')),
  h('p', { class: 'sh-bos-baslik' }, 'İlk mesajı sen yaz 💌'),
  h('p', { class: 'sh-bos-alt' }, 'Burası yalnız ikinizin. Küçük bir “günaydın” bile güzel bir başlangıç.'),
  h('div', { class: 'sh-bos-oneriler' }, ONERILER.map((s) => h('button', {
    type: 'button', class: 'sh-oneri', onclick: () => { ta.value = s; girisDegisti(); ta.focus(); },
  }, s))));
const sutun = h('div', { class: 'sh-sutun' }, ust, bos, liste, yaziyorEl);
const kaydirma = h('div', { class: 'sh-liste' }, sutun);
const asagiYazi = h('span', { class: 'sh-asagi-yazi' });
const asagi = h('button', { type: 'button', class: 'sh-asagi', hidden: true, 'aria-label': 'En alta in' }, ikon('asagi'), asagiYazi);

const ek = h('div', { class: 'sh-ek', hidden: true });
const emojiPanel = h('div', { class: 'sh-emojiler', id: 'sh-emojiler', hidden: true, role: 'group', 'aria-label': 'Hızlı emoji' },
  EMOJILER.map((e) => h('button', { type: 'button', class: 'sh-emoji', 'aria-label': e, dataset: { e } }, e)));
const ta = h('textarea', {
  class: 'sh-yazi', rows: '1', maxlength: String(M.MAX_METIN), placeholder: 'Mesaj yaz…', 'aria-label': 'Mesaj',
  enterkeyhint: 'send', autocomplete: 'off', autocapitalize: 'sentences',
});
const fotoInput = h('input', { type: 'file', accept: 'image/*', multiple: true, hidden: true, tabindex: '-1' });
const fotoBtn = h('button', { type: 'button', class: 'sh-ikon-btn', 'aria-label': 'Fotoğraf gönder' }, ikon('foto'));
const emojiBtn = h('button', { type: 'button', class: 'sh-ikon-btn', 'aria-label': 'Emoji', 'aria-expanded': 'false', 'aria-controls': 'sh-emojiler' }, ikon('emoji'));
const gonderBtn = h('button', { type: 'submit', class: 'sh-gonder' });
const sesVar = kayitDestegi();
const micBtn = h('button', { type: 'button', class: 'sh-ikon-btn sh-mik', 'aria-label': 'Sesli mesaj kaydet', title: 'Dokun ya da basılı tut', hidden: !sesVar }, ikon('mikrofon'));
const kayitSil = h('button', { type: 'button', class: 'sh-ikon-btn sh-kayit-sil', 'aria-label': 'Kaydı sil' }, ikon('sil'));
const kayitSure = h('span', { class: 'sh-kayit-sure', role: 'timer', 'aria-label': 'Kayıt süresi' }, '0:00');
const kayitIpucu = h('span', { class: 'sh-kayit-ipucu' });
const kayitGonder = h('button', { type: 'button', class: 'sh-gonder sh-kayit-gonder', 'aria-label': 'Sesli mesajı gönder' }, ikon('gonder'));
const kayitBar = h('div', { class: 'sh-kayit', hidden: true, role: 'group', 'aria-label': 'Sesli mesaj kaydı' },
  kayitSil, h('span', { class: 'sh-kayit-nokta', 'aria-hidden': 'true' }), kayitSure, kayitIpucu, kayitGonder);
const form = h('form', { class: 'sh-giris' }, fotoBtn, fotoInput, h('div', { class: 'sh-yazi-kap' }, ta, emojiBtn, micBtn), gonderBtn, kayitBar);
const sayac = h('div', { class: 'sh-sayac', hidden: true });
const alt = h('div', { class: 'sh-alt' }, h('div', { class: 'sh-sutun' }, ek, emojiPanel, form, sayac));
const duyuru = h('div', { class: 'sr-only', 'aria-live': 'polite' });

const sabitBtn = h('button', { type: 'button', class: 'sh-sabit-btn' });
const sabitSerit = h('div', { class: 'sh-sabit', hidden: true }, h('div', { class: 'sh-sutun' }, sabitBtn));
const listeKutu = h('div', { class: 'sh-liste-kutu' }, sabitSerit, kaydirma, asagi);
app.replaceChildren(listeKutu, alt, duyuru);
ust.replaceChildren(h('span', { class: 'sh-donen', 'aria-hidden': 'true' }), h('span', {}, 'Mesajlar yükleniyor…'));

// ---------- Veri ----------
const [col, okCol, profil] = await Promise.all([
  openCollection(room, 'mesaj', { recent: 100 }),
  openCollection(room, 'okundu'),
  openProfil(room).catch(() => null),
]);

const partnerAd = () => profil?.partner()?.ad || room.partner()?.name || knownPartner(roomId)?.name || 'Sevgilin';
const benimAdim = () => profil?.ben()?.ad || me.name || '';
const ad = (id) => (id === benId ? 'Sen' : partnerAd());

let sonHata = 0;
const hataGoster = (e) => {
  if (Date.now() - sonHata < 20000) return;
  sonHata = Date.now();
  toast(e?.message || 'Bir sorun oldu.');
};
col.on('error', hataGoster);

// ---------- Fotoğraf kaynakları ----------
// Yalnız bizim kova / yerel depo (isAllowedPhotoUrl). Kendi yüklediğim fotoğrafın önizlemesi hemen kullanılır.
const fotoHazir = new Map(); // url -> blob: önizleme
// Balonda küçük önizleme (2000 px fotoğraf telefonda tam boy çözülmesin); tam ekranda özgün fotoğraf.
function fotoKaynak(img, url) {
  const kirik = () => img.replaceWith(h('span', { class: 'sh-foto-kirik' }, 'Fotoğraf açılamadı'));
  if (fotoHazir.has(url)) { img.src = fotoHazir.get(url); return; }
  if (!isAllowedPhotoUrl(url)) { kirik(); return; }
  img.addEventListener('error', kirik, { once: true });
  onizlemeBagla(img, url, { secenek: BALON_FOTO, kok: kaydirma, hata: kirik });
}

// ---------- Sesli mesaj oynatma (bir anda tek ses) ----------
const sesHazir = new Map(); // url -> blob: kendi kaydım hemen çalınır
let calanId = null;
const sesKutusuBul = (id) => liste.querySelector(`.sh-satir[data-id="${CSS.escape(id)}"] .sh-ses`);
const oynatici = tekOynatici({
  onDurum: (d) => {
    if (calanId && calanId !== d.id) sesBoya(sesKutusuBul(calanId), null);
    calanId = d.id;
    if (d.id) sesBoya(sesKutusuBul(d.id), d);
  },
  onHata: () => toast('Bu sesli mesaj bu cihazda çalınamadı.'),
});
/** -> src | Promise<src|null> | null. Yalnız bizim kova / yerel depo. */
function sesKaynak(url) {
  if (sesHazir.has(url)) return sesHazir.get(url);
  if (!isAllowedPhotoUrl(url)) return null;
  return url.startsWith('local:') ? fotoSrc(url) : url; // Supabase adresi eşzamanlı: iPhone'da dokunma anında çalar
}
async function sesOynat(id) {
  const s = col.get(id)?.data?.ses;
  if (!s) return;
  if (oynatici.durum().id === id) { oynatici.ac(id); return; }
  let src = sesKaynak(s.url);
  if (src && typeof src.then === 'function') src = await src;
  if (!src) { toast('Bu sesli mesaj açılamadı.'); return; }
  oynatici.ac(id, src, Number(s.sure) || 0);
}

// ---------- Çizim ----------
const elemanlar = new Map(); // anahtar -> { el, imza }
const gorulen = new Set();
let ilkCizim = true;
let eskiYukleniyor = false;
let zorlaAlta = false;
let altaYapisik = true;
let yeniSayisi = 0;
let yuklemeler = [];
let secili = null;
let pencereN = PENCERE; // pencerede tutulan mesaj sayısı
let pencereAnahtar = null; // pencerenin ilk satırı (yeni mesaj gelince üst kaymasın)
let gizliVar = false; // bellekte olup DOM'a basılmamış eski satır var mı
let genisletiliyor = false;
let gidisBitis = 0; // mesajaGit kaydırması bu ana dek sürer
let bul = null; // sohbet içi arama (aşağıda kurulur)

const ctxTaban = { benId, ad, bul: (id) => col.get(id), foto: fotoKaynak };

function esitle(ebeveyn, istenen) {
  const kume = new Set(istenen);
  for (const c of [...ebeveyn.children]) if (!kume.has(c)) c.remove();
  let cur = ebeveyn.firstChild;
  for (const el of istenen) {
    if (el === cur) { cur = cur.nextSibling; continue; }
    ebeveyn.insertBefore(el, cur);
  }
}

function alta() {
  kaydirma.scrollTop = kaydirma.scrollHeight;
  altaYapisik = true;
  yeniSayisi = 0;
  asagiGuncelle();
}

function ciz() {
  const docs = col.all();
  const tumSatirlar = M.satirlar(docs, { benId, simdi: new Date() });
  const bas = M.pencereBasi(tumSatirlar, pencereN, pencereAnahtar);
  const satirlar = tumSatirlar.slice(bas);
  gizliVar = bas > 0;
  pencereAnahtar = satirlar[0]?.anahtar ?? null;
  pencereN = Math.max(PENCERE, satirlar.filter((r) => r.tur === 'mesaj').length);
  const durum = M.gorulduBilgisi(docs, okCol.all(), benId);
  const pAd = partnerAd();
  const odakId = document.activeElement?.closest?.('.sh-satir')?.dataset?.id || null;
  const bulSorgu = bul?.vurguSorgu() || '';
  const bulSimdiki = bul?.simdiki() || null;
  const istenen = [];
  const anahtarlar = new Set();
  const yeniOnun = [];

  for (const r of satirlar) {
    let imza;
    let kur;
    if (r.tur === 'gun') {
      imza = r.etiket;
      kur = () => gunSatiri(r.etiket);
    } else {
      const d = r.doc.data || {};
      const hedef = d.yanit ? col.get(d.yanit) : null;
      const dr = durum && durum.id === r.doc.id ? durum : null;
      const vurgu = bulSorgu && typeof d.metin === 'string' ? eslesmeler(d.metin, bulSorgu) : null;
      imza = [r.doc.updated_at, r.doc.pending ? 1 : 0, r.ilk ? 1 : 0, r.son ? 1 : 0, dr ? `${dr.durum}${dr.at}` : '',
        d.yanit ? (hedef ? hedef.updated_at : 'yok') : '', r.benim ? '' : pAd, vurgu?.length ? bulSorgu : ''].join('|');
      kur = () => mesajSatiri(r, { ...ctxTaban, durum: dr, vurgu });
    }
    anahtarlar.add(r.anahtar);
    let e = elemanlar.get(r.anahtar);
    if (!e || e.imza !== imza) {
      e = { el: kur(), imza };
      elemanlar.set(r.anahtar, e);
      if (r.tur === 'mesaj') {
        if (secili === r.anahtar) e.el.classList.add('secili');
        if (bulSimdiki === r.anahtar) e.el.classList.add('bul-simdiki');
        if (!gorulen.has(r.anahtar)) {
          gorulen.add(r.anahtar);
          if (!ilkCizim && !eskiYukleniyor && !genisletiliyor) {
            e.el.classList.add('giris');
            if (!r.benim) yeniOnun.push(r.doc);
          }
        }
      }
    }
    istenen.push(e.el);
  }
  for (const y of yuklemeler) {
    const anahtar = `yukle-${y.id}`;
    const imza = `${y.durum}|${y.onizleme}|${y.hata}`;
    anahtarlar.add(anahtar);
    let e = elemanlar.get(anahtar);
    if (!e || e.imza !== imza) {
      e = { el: yuklemeSatiri(y, { tekrar: (x) => (x.tur === 'ses' ? sesGonder(x) : fotoGonder(x)), vazgec: yuklemeVazgec }), imza };
      elemanlar.set(anahtar, e);
    }
    istenen.push(e.el);
  }
  for (const k of [...elemanlar.keys()]) if (!anahtarlar.has(k)) elemanlar.delete(k);
  esitle(liste, istenen);
  if (calanId) {
    if (col.get(calanId)) sesBoya(sesKutusuBul(calanId), oynatici.durum()); // yeniden kurulan satır
    else oynatici.durdur(); // silindi
  }

  // Yeniden kurulan balon odağı kaybetmesin.
  if (odakId && (document.activeElement === document.body || !document.activeElement)) {
    liste.querySelector(`.sh-satir[data-id="${CSS.escape(odakId)}"] .sh-balon`)?.focus({ preventScroll: true });
  }

  bos.hidden = docs.length > 0 || yuklemeler.length > 0;
  ustGuncelle(docs.length);

  if (yeniOnun.length) {
    yaziyorGizle();
    const son = yeniOnun[yeniOnun.length - 1];
    duyuru.textContent = `${pAd}: ${M.ozet(son.data, 140)}`;
    if (document.visibilityState === 'visible') sfx('pop');
  }
  if (ilkCizim || zorlaAlta || altaYapisik) alta();
  else if (yeniOnun.length) { yeniSayisi += yeniOnun.length; asagiGuncelle(); }
  zorlaAlta = false;
  ilkCizim = false;
  okunduPlanla();
  gunPlanla();
}

// ---------- Yapışkan gün ayırıcıları ----------
// Hepsi aynı listede yapışkan: üste yığılanlardan yalnız sonuncusu görünür (öncekiler altta kalıp taşmasın).
// Tepedeki ayırıcı kaydırma durunca solar (balonun üstünü kapatmasın); kaydırınca yeniden görünür.
let gunKare = 0;
let gunDur = 0;
let gunKaydi = false;
function gunleriBoya() {
  gunKare = 0;
  const kaydi = gunKaydi;
  gunKaydi = false;
  const sinir = kaydirma.getBoundingClientRect().top + GUN_UST + 1;
  const gunler = liste.querySelectorAll(':scope > .sh-gun');
  let son = -1;
  for (let i = 0; i < gunler.length; i++) {
    if (gunler[i].getBoundingClientRect().top <= sinir) son = i;
    else break;
  }
  gunler.forEach((g, i) => {
    g.classList.toggle('ortu', i < son);
    g.classList.toggle('ust', i === son);
    if (kaydi || i !== son) g.classList.remove('dur');
  });
  const tepe = gunler[son];
  if (tepe && !tepe.classList.contains('dur')) {
    clearTimeout(gunDur);
    gunDur = setTimeout(() => tepe.classList.add('dur'), 1500);
  }
}
function gunPlanla() {
  if (!gunKare) gunKare = requestAnimationFrame(gunleriBoya);
}

let ustDurum = 'ilk';
function ustGuncelle(adet = col.all().length) {
  const durum = eskiYukleniyor ? 'yukleniyor' : adet > 0 && !col.hasOlder() && !gizliVar ? 'bas' : 'bos';
  if (durum === ustDurum) return; // canlı bölge her çizimde yeniden okunmasın
  ustDurum = durum;
  if (durum === 'yukleniyor') {
    ust.replaceChildren(h('span', { class: 'sh-donen', 'aria-hidden': 'true' }), h('span', {}, 'Eski mesajlar yükleniyor…'));
  } else if (durum === 'bas') {
    ust.replaceChildren(h('span', { class: 'sh-bas' }, ikon('kalp'), 'Sohbetinizin başlangıcı'));
  } else {
    ust.replaceChildren();
  }
}

function asagiGuncelle() {
  const uzak = kaydirma.scrollHeight - kaydirma.scrollTop - kaydirma.clientHeight > 320;
  if (altaYapisik) yeniSayisi = 0;
  asagi.hidden = !(uzak || yeniSayisi > 0);
  asagi.classList.toggle('yazili', yeniSayisi > 0);
  asagiYazi.textContent = yeniSayisi > 0 ? (yeniSayisi === 1 ? 'Yeni mesaj' : `${yeniSayisi} yeni mesaj`) : '';
  asagi.setAttribute('aria-label', yeniSayisi > 0 ? `${asagiYazi.textContent}, en alta in` : 'En alta in');
}

/** Pencereyi yukarı doğru açar (bellekteki eski mesajlar); okunan yer kaymaz. anahtar: o satıra dek aç. */
function pencereyiAc(anahtar = null) {
  const alttan = kaydirma.scrollHeight - kaydirma.scrollTop;
  if (anahtar) pencereAnahtar = anahtar;
  else { pencereAnahtar = null; pencereN += PENCERE; }
  genisletiliyor = true;
  try { ciz(); } finally { genisletiliyor = false; }
  kaydirma.scrollTop = kaydirma.scrollHeight - alttan;
  altaYapisik = M.altaYakinMi(kaydirma);
}

let eskiSoz = null;
/**
 * Sunucudan 50 eski mesaj. pencere: gelenler pencereye girsin (yukarı kaydırma); arama paneli false verir
 * (yalnız bellekte arar, pencere mesaja gidilince açılır). -> Promise<yüklenen sayısı>. Süren yükleme varsa onu bekler.
 */
function eskileriGetir({ pencere = true } = {}) {
  if (eskiSoz) return eskiSoz;
  if (!col.hasOlder()) return Promise.resolve(0);
  eskiSoz = (async () => {
    eskiYukleniyor = true;
    const alttan = kaydirma.scrollHeight - kaydirma.scrollTop;
    ustGuncelle();
    kaydirma.scrollTop = kaydirma.scrollHeight - alttan;
    if (pencere) {
      pencereAnahtar = null; // gelen eski mesajlar pencereye girsin
      pencereN += 50;
    }
    let n = 0;
    try {
      n = await col.loadOlder(50);
    } catch (e) {
      hataGoster(e);
    }
    eskiYukleniyor = false;
    ustGuncelle();
    kaydirma.scrollTop = kaydirma.scrollHeight - alttan; // okunan yer kaymasın
    altaYapisik = M.altaYakinMi(kaydirma);
    return n;
  })().finally(() => { eskiSoz = null; });
  return eskiSoz;
}

/** Tepeye yaklaşınca: önce bellekte olup çizilmeyen satırlar (pencere), yoksa sunucudan. */
function eskileriYukle() {
  if (gizliVar) {
    pencereyiAc();
    return Promise.resolve(0);
  }
  return eskileriGetir();
}

async function doldur() {
  for (let i = 0; i < 6 && (gizliVar || col.hasOlder()) && kaydirma.scrollHeight <= kaydirma.clientHeight + ESKI_ESIK; i++) {
    await eskileriYukle();
  }
}

kaydirma.addEventListener('scroll', () => {
  altaYapisik = M.altaYakinMi(kaydirma);
  asagiGuncelle();
  gunKaydi = true;
  gunPlanla();
  // Mesaja giderken (yumuşak kaydırma) eski yükleme kaydırmayı kesmesin; kullanıcı kaydırınca yüklenir.
  if (kaydirma.scrollTop < ESKI_ESIK && Date.now() > gidisBitis) eskileriYukle();
}, { passive: true });

// İçerik ya da alan boyu değişince (yazı tipi, klavye, yazıyor balonu) en altta kal.
if (typeof ResizeObserver === 'function') {
  const ro = new ResizeObserver(() => { if (altaYapisik) kaydirma.scrollTop = kaydirma.scrollHeight; });
  ro.observe(sutun);
  ro.observe(kaydirma);
}
asagi.addEventListener('click', () => {
  if (azHareket.matches) { alta(); return; }
  // Uzaksa son ekrana atla, kalanı yumuşak kaydır (yolda eski mesaj yüklemesi tetiklenmesin).
  const hedef = kaydirma.scrollHeight - kaydirma.clientHeight;
  if (hedef - kaydirma.scrollTop > kaydirma.clientHeight * 1.5) kaydirma.scrollTop = hedef - kaydirma.clientHeight;
  kaydirma.scrollTo({ top: hedef, behavior: 'smooth' });
});

// ---------- Okundu ----------
let okZamanlayici = 0;
function okunduPlanla() {
  if (okZamanlayici) return;
  okZamanlayici = setTimeout(() => {
    okZamanlayici = 0;
    if (document.visibilityState !== 'visible') return;
    const hedef = M.okunduHedefi(col.all(), benId, okCol.get(benId)?.data?.son || null);
    if (hedef) okCol.put({ son: hedef, at: new Date().toISOString() }, benId).catch(() => {});
  }, 1200);
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') { ciz(); okunduPlanla(); }
});

// ---------- Yazıyor… ----------
let sonYaziyor = 0;
let yaziyorZaman = 0;
function yaziyorGoster() {
  yaziyorAd.textContent = `${partnerAd()} yazıyor…`;
  yaziyorEl.hidden = false;
  clearTimeout(yaziyorZaman);
  yaziyorZaman = setTimeout(yaziyorGizle, M.YAZIYOR_GOSTER_MS);
}
function yaziyorGizle() {
  clearTimeout(yaziyorZaman);
  yaziyorEl.hidden = true;
}
room.on('message', (msg, from) => {
  if (msg?.t === 'yaziyor' && from?.clientId !== benId) yaziyorGoster();
});
room.on('presence', (p) => { if (!p || p.page !== 'sohbet') yaziyorGizle(); });

// ---------- Giriş alanı ----------
let yanitlanan = null;
let duzenlenen = null;
let duzenOncesi = '';
const taslakAnahtar = `bizim.sohbet.taslak.${roomId}.${benId}`;

function boyutla() {
  ta.style.height = 'auto';
  ta.style.height = `${Math.min(ta.scrollHeight, 148)}px`;
}
function gonderBtnGuncelle() {
  micBtn.hidden = !sesVar || !!duzenlenen || !!ta.value.trim();
  let tur = 'gonder';
  if (duzenlenen) tur = 'tamam';
  else if (!ta.value.trim()) tur = 'kalp';
  if (gonderBtn.dataset.tur === tur) return;
  gonderBtn.dataset.tur = tur;
  gonderBtn.classList.toggle('kalp', tur === 'kalp');
  gonderBtn.setAttribute('aria-label', tur === 'tamam' ? 'Kaydet' : tur === 'kalp' ? 'Kalp gönder' : 'Gönder');
  gonderBtn.replaceChildren(ikon(tur));
}
function sayacGuncelle() {
  const n = ta.value.length;
  sayac.hidden = n < M.MAX_METIN - 500;
  sayac.textContent = `${n} / ${M.MAX_METIN}`;
  sayac.classList.toggle('cok', n >= M.MAX_METIN);
}
function girisDegisti() {
  boyutla();
  gonderBtnGuncelle();
  sayacGuncelle();
  if (!duzenlenen) writeStore('local', taslakAnahtar, ta.value || null);
}

ta.addEventListener('input', () => {
  girisDegisti();
  if (!duzenlenen && ta.value.trim() && M.yaziyorGonderilsinMi(sonYaziyor, Date.now())) {
    sonYaziyor = Date.now();
    room.send({ t: 'yaziyor' });
  }
});
ta.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && e.keyCode !== 229) {
    e.preventDefault();
    gonder();
  } else if (e.key === 'Escape' && (duzenlenen || yanitlanan)) {
    e.preventDefault();
    ekKapat();
  }
});
form.addEventListener('submit', (e) => { e.preventDefault(); gonder(); });
// Düğmeye basınca klavye kapanmasın.
for (const b of [gonderBtn, emojiBtn]) b.addEventListener('mousedown', (e) => e.preventDefault());
ta.addEventListener('focus', () => { if (kaba.matches) document.body.classList.add('sh-klavye'); });
ta.addEventListener('blur', () => document.body.classList.remove('sh-klavye'));

emojiBtn.addEventListener('click', () => {
  const ac = emojiPanel.hidden;
  emojiPanel.hidden = !ac;
  emojiBtn.setAttribute('aria-expanded', String(ac));
});
emojiPanel.addEventListener('mousedown', (e) => e.preventDefault());
emojiPanel.addEventListener('click', (e) => {
  const b = e.target.closest('.sh-emoji');
  if (!b) return;
  const s = b.dataset.e;
  const bas = ta.selectionStart ?? ta.value.length;
  const son = ta.selectionEnd ?? ta.value.length;
  if (ta.value.length + s.length > M.MAX_METIN) return;
  ta.value = ta.value.slice(0, bas) + s + ta.value.slice(son);
  ta.selectionStart = ta.selectionEnd = bas + s.length;
  girisDegisti();
});

function ekGoster(tur, doc) {
  const benim = M.gonderen(doc) === benId;
  const baslik = tur === 'duzenle' ? 'Mesajı düzenle' : `Yanıtla · ${benim ? 'Sen' : partnerAd()}`;
  ek.replaceChildren(
    ikon(tur === 'duzenle' ? 'duzenle' : 'yanitla'),
    h('div', { class: 'sh-ek-govde' },
      h('span', { class: 'sh-ek-baslik' }, baslik),
      h('span', { class: 'sh-ek-metin' }, M.ozet(doc.data, 120) || 'Mesaj')),
    h('button', { type: 'button', class: 'sh-ikon-btn', 'aria-label': tur === 'duzenle' ? 'Düzenlemeyi bırak' : 'Yanıtı kaldır', onclick: () => { ekKapat(); ta.focus(); } }, ikon('kapat')));
  ek.hidden = false;
}
function ekKapat() {
  if (duzenlenen) {
    duzenlenen = null;
    ta.value = duzenOncesi;
    girisDegisti();
  }
  yanitlanan = null;
  ek.hidden = true;
  ek.replaceChildren();
  gonderBtnGuncelle();
}
function imleciSonaAl() {
  ta.focus();
  ta.selectionStart = ta.selectionEnd = ta.value.length;
}

function yanitBasla(id) {
  const d = col.get(id);
  if (!d) return;
  if (duzenlenen) ekKapat();
  yanitlanan = id;
  ekGoster('yanit', d);
  imleciSonaAl();
}

function duzenlemeBasla(id) {
  const d = col.get(id);
  if (!d || M.gonderen(d) !== benId || typeof d.data.metin !== 'string') return;
  if (!duzenlenen) duzenOncesi = ta.value;
  yanitlanan = null;
  duzenlenen = id;
  ta.value = d.data.metin;
  ekGoster('duzenle', d);
  girisDegisti();
  imleciSonaAl();
}

async function duzenlemeKaydet(metin) {
  const id = duzenlenen;
  const d = col.get(id);
  if (!metin) { toast('Mesaj boş kalamaz. Silmek istersen basılı tut.'); return; }
  const hata = M.metinHatasi(metin);
  if (hata) { toast(hata); return; }
  ekKapat();
  if (!d || d.data.metin === metin) return;
  try {
    await col.patch(id, { metin, duzenlendi: new Date().toISOString() });
  } catch (e) {
    toast(e.message);
  }
}

function bildirGerekirse(data) {
  if (partnerGoruyor(room.partner(), 'sohbet')) return; // sohbette ve sekmesi önde: mesajı zaten görüyor
  Promise.resolve(bildir(roomId, { tur: 'mesaj', baslik: benimAdim() || 'Sevgilin', metin: M.ozet(data, 80), url: 'sayfalar/sohbet/' }))
    .catch(() => {});
}

// Çevrimdışı gönderilen mesaj giden kutusunda bekler: bildirim, sunucu onaylayınca (pending kalkınca) bir kez gider.
const bildirimBekleyen = new Map(); // mesajId -> data
function gonderildiBildir(id, data) {
  if (col.get(id)?.pending) bildirimBekleyen.set(id, data);
  else bildirGerekirse(data);
}
col.on('change', () => {
  for (const [id, data] of bildirimBekleyen) {
    const d = col.get(id);
    if (d?.pending) continue;
    bildirimBekleyen.delete(id);
    if (d) bildirGerekirse(data); // silindiyse bildirim yok
  }
});

async function gonder() {
  const metin = M.metniTemizle(ta.value);
  if (duzenlenen) { await duzenlemeKaydet(metin); return; }
  const icerik = metin || '❤️';
  const hata = M.metinHatasi(icerik);
  if (hata) { toast(hata); return; }
  const data = { metin: icerik, kimden: benId };
  if (yanitlanan && col.get(yanitlanan)) data.yanit = yanitlanan;
  ta.value = '';
  ekKapat();
  girisDegisti();
  sonYaziyor = 0;
  zorlaAlta = true;
  let id;
  try {
    id = await col.put(data);
  } catch (e) {
    toast(e.message);
    if (!ta.value) { ta.value = metin; girisDegisti(); }
    return;
  }
  gonderildiBildir(id, data);
}

// ---------- Fotoğraf ----------
let yukSayac = 0;
fotoBtn.addEventListener('click', () => fotoInput.click());
fotoInput.addEventListener('change', () => {
  const dosyalar = [...(fotoInput.files || [])].slice(0, 10);
  fotoInput.value = '';
  for (const dosya of dosyalar) fotoGonder({ id: `y${++yukSayac}`, dosya });
});

async function fotoGonder(y) {
  if (!yuklemeler.includes(y)) {
    y.yanit = yanitlanan && col.get(yanitlanan) ? yanitlanan : null;
    if (yanitlanan) ekKapat();
    yuklemeler.push(y);
  }
  y.durum = y.blob ? 'yukleniyor' : 'hazirlaniyor';
  y.hata = null;
  zorlaAlta = true;
  ciz();
  try {
    if (!y.blob) {
      const n = await fotoKucult(y.dosya); // WebP (destek varsa) ya da JPEG
      y.blob = n.blob;
      y.en = n.width;
      y.boy = n.height;
      y.onizleme = URL.createObjectURL(n.blob);
      y.durum = 'yukleniyor';
      ciz();
    }
    const url = await uploadPhoto(y.blob, roomId);
    fotoHazir.set(url, y.onizleme);
    const data = { foto: url, en: y.en, boy: y.boy, kimden: benId };
    if (y.yanit && col.get(y.yanit)) data.yanit = y.yanit;
    yuklemeler = yuklemeler.filter((x) => x !== y);
    zorlaAlta = true;
    let id;
    try {
      id = await col.put(data);
    } catch (e) {
      toast(e.message);
      return;
    }
    gonderildiBildir(id, data);
  } catch (e) {
    if (!yuklemeler.includes(y)) return;
    y.durum = 'hata';
    y.hata = e?.name === 'PhotoError' ? e.message : 'Gönderilemedi. Bağlantını kontrol et.';
    ciz();
  }
}

// ---------- Sesli mesaj: kayıt ve gönderim ----------
// Dokun: kayıt başlar, şeritteki Gönder / Sil ile biter. Basılı tut: bırakınca gönderilir, sola kaydırınca silinir.
let kayit = null;   // { mod: 'dokun'|'tut', k, hazir, birakildi, doldu }
let tutma = null;   // { id, x, zaman, tut }
let tutmaBitti = 0;
let kayitSaat = 0;

function kayitArayuz(acik) {
  form.classList.toggle('kayitta', acik);
  kayitBar.hidden = !acik;
  if (!acik) {
    kayitBar.style.removeProperty('--kaydir');
    kayitBar.classList.remove('tut', 'doldu', 'iptal-yakin', 'hazir');
  }
}
function kayitYaz() {
  if (!kayit) return;
  kayitSure.textContent = sureYazisi(kayit.k ? kayit.k.gecen() : 0);
  const ipucu = !kayit.hazir ? 'Mikrofon açılıyor…'
    : kayit.doldu ? 'Süre doldu. Gönderebilirsin.'
      : kayit.mod === 'tut' ? 'İptal için sola kaydır' : 'Kaydediliyor';
  if (kayitIpucu.dataset.yazi !== ipucu) {
    kayitIpucu.dataset.yazi = ipucu;
    kayitIpucu.replaceChildren(kayit.mod === 'tut' && kayit.hazir && !kayit.doldu ? ikon('sol') : '', ipucu);
  }
}

async function kayitBasla(mod) {
  if (kayit || !sesVar) return;
  oynatici.durdur();
  emojiPanel.hidden = true;
  emojiBtn.setAttribute('aria-expanded', 'false');
  const bu = { mod, k: null, hazir: false, birakildi: false, doldu: false };
  kayit = bu;
  kayitArayuz(true);
  kayitBar.classList.toggle('tut', mod === 'tut');
  kayitYaz();
  if (mod === 'dokun') kayitGonder.focus({ preventScroll: true });
  let k;
  try {
    k = await kayitBaslat({
      onSinir: (neden) => {
        if (kayit !== bu) return;
        bu.doldu = true;
        kayitBar.classList.add('doldu');
        kayitYaz();
        titret(20);
        duyuru.textContent = neden === 'sure' ? '2 dakika doldu. Gönderebilir ya da silebilirsin.' : 'Kayıt sınıra ulaştı. Gönderebilir ya da silebilirsin.';
      },
    });
  } catch (e) {
    if (kayit === bu) { kayit = null; kayitArayuz(false); }
    toast(e?.message || 'Mikrofon açılamadı.');
    return;
  }
  if (kayit !== bu) { k.iptal(); return; } // açılırken silindi
  bu.k = k;
  if (mod === 'tut' && bu.birakildi) { // izin sorulurken parmak kalktı
    k.iptal();
    kayit = null;
    kayitArayuz(false);
    toast('Mikrofon hazır. Kaydetmek için dokun ya da basılı tut.');
    return;
  }
  bu.hazir = true;
  kayitBar.classList.add('hazir');
  titret(12);
  kayitYaz();
  duyuru.textContent = mod === 'tut' ? 'Kayıt başladı. Bırakınca gönderilir.' : 'Kayıt başladı.';
  clearInterval(kayitSaat);
  kayitSaat = setInterval(kayitYaz, 250);
}

async function kayitBitir(gonder) {
  const bu = kayit;
  if (!bu) return;
  kayit = null;
  clearInterval(kayitSaat);
  const odakBardaydi = kayitBar.contains(document.activeElement);
  kayitArayuz(false);
  if (odakBardaydi) (micBtn.hidden ? ta : micBtn).focus({ preventScroll: true });
  if (!bu.k) return; // mikrofon hâlâ açılıyor: kayitBasla kapatır
  if (!gonder) {
    bu.k.iptal();
    duyuru.textContent = 'Kayıt silindi.';
    return;
  }
  const { blob, ms } = await bu.k.bitir();
  if (ms < SES_EN_AZ_MS || !blob.size) {
    toast(bu.mod === 'tut' ? 'Çok kısa oldu. Basılı tutup konuş.' : 'Çok kısa oldu.');
    return;
  }
  if (blob.size > SES_MAX_BAYT) { toast('Kayıt çok büyük oldu (en çok 2 MB).'); return; }
  sesGonder({ id: `s${++yukSayac}`, tur: 'ses', blob, ms, sure: sesSuresi(ms), onizleme: URL.createObjectURL(blob) });
}

async function sesGonder(y) {
  if (!yuklemeler.includes(y)) {
    y.yanit = yanitlanan && col.get(yanitlanan) ? yanitlanan : null;
    if (yanitlanan) ekKapat();
    yuklemeler.push(y);
  }
  y.durum = 'yukleniyor';
  y.hata = null;
  zorlaAlta = true;
  ciz();
  try {
    const url = await uploadAudio(y.blob, roomId);
    sesHazir.set(url, y.onizleme);
    const data = { ses: sesVerisi({ url, ms: y.ms, mime: y.blob.type }), kimden: benId };
    if (y.yanit && col.get(y.yanit)) data.yanit = y.yanit;
    yuklemeler = yuklemeler.filter((x) => x !== y);
    zorlaAlta = true;
    let id;
    try {
      id = await col.put(data);
    } catch (e) {
      toast(e.message);
      return;
    }
    gonderildiBildir(id, data);
  } catch (e) {
    if (!yuklemeler.includes(y)) return;
    y.durum = 'hata';
    y.hata = /^(Ses|Sesi|Bu ses)/.test(e?.message || '') ? e.message : 'Gönderilemedi. Bağlantını kontrol et.';
    ciz();
  }
}

const tutmaOlaylari = [['pointermove', tutmaHareket], ['pointerup', tutmaBirak], ['pointercancel', tutmaKesildi]];
function tutmaTemizle() {
  clearTimeout(tutma?.zaman);
  tutma = null;
  for (const [t, fn] of tutmaOlaylari) window.removeEventListener(t, fn, true);
}
function tutmaHareket(e) {
  if (!tutma || e.pointerId !== tutma.id || !tutma.tut || !kayit) return;
  const dx = Math.min(0, e.clientX - tutma.x);
  kayitBar.style.setProperty('--kaydir', `${Math.round(dx)}px`);
  kayitBar.classList.toggle('iptal-yakin', dx < -IPTAL_ESIK * 0.6);
  if (kaydirIptalMi(dx)) {
    tutmaBitti = Date.now();
    tutmaTemizle();
    titret(15);
    kayitBitir(false);
  }
}
function tutmaBirak(e) {
  if (!tutma || e.pointerId !== tutma.id) return;
  const t = tutma;
  tutmaTemizle();
  if (!t.tut) return; // kısa dokunma: 'click' dokun kipini başlatır
  tutmaBitti = Date.now();
  if (!kayit) return;
  if (!kayit.hazir) { kayit.birakildi = true; return; }
  kayitBitir(true);
}
function tutmaKesildi(e) {
  // Tarayıcı jesti aldı (kaydırma vb.): kayıt sürer, dokun kipine geçer.
  if (!tutma || e.pointerId !== tutma.id) return;
  const t = tutma;
  tutmaTemizle();
  if (!t.tut || !kayit) return;
  tutmaBitti = Date.now();
  kayit.mod = 'dokun';
  kayitBar.classList.remove('tut', 'iptal-yakin');
  kayitBar.style.removeProperty('--kaydir');
  kayitYaz();
}

micBtn.addEventListener('contextmenu', (e) => e.preventDefault());
micBtn.addEventListener('pointerdown', (e) => {
  if (!sesVar || kayit || tutma || (e.pointerType === 'mouse' && e.button !== 0)) return;
  e.preventDefault(); // klavye açıksa kapanmasın, metin seçilmesin
  tutma = { id: e.pointerId, x: e.clientX, tut: false };
  tutma.zaman = setTimeout(() => {
    if (!tutma) return;
    tutma.tut = true;
    kayitBasla('tut');
  }, TUTMA_MS);
  for (const [t, fn] of tutmaOlaylari) window.addEventListener(t, fn, true);
});
micBtn.addEventListener('click', () => {
  if (Date.now() - tutmaBitti < 600 || kayit) return;
  kayitBasla('dokun');
});
kayitSil.addEventListener('click', () => kayitBitir(false));
kayitGonder.addEventListener('click', () => kayitBitir(true));
for (const b of [kayitSil, kayitGonder]) b.addEventListener('mousedown', (e) => e.preventDefault());
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && kayit) { e.preventDefault(); kayitBitir(false); }
});
window.addEventListener('pagehide', () => { if (kayit) kayitBitir(false); });

function yuklemeVazgec(y) {
  yuklemeler = yuklemeler.filter((x) => x !== y);
  if (y.onizleme) URL.revokeObjectURL(y.onizleme);
  ciz();
}

function fotoAc(src, alt) {
  const dlg = h('dialog', { class: 'sh-isik', 'aria-label': 'Fotoğraf' },
    h('img', { src, alt }),
    h('button', { type: 'button', class: 'sh-isik-kapat', 'aria-label': 'Kapat', onclick: () => dlg.close() }, ikon('kapat')));
  dlg.addEventListener('click', (e) => { if (e.target === dlg || e.target.tagName === 'IMG') dlg.close(); });
  dlg.addEventListener('close', () => dlg.remove());
  document.body.append(dlg);
  dlg.showModal();
}

// ---------- Tepki, menü, kopyala, sil ----------
async function tepkiVer(id, emoji, { yalnizEkle = false } = {}) {
  const d = col.get(id);
  if (!d) return;
  if (yalnizEkle && d.data.tepki?.[benId] === emoji) return;
  try {
    await col.patch(id, M.tepkiYamasi(d, benId, emoji)); // yalnız kendi tepkim: partnerinkini ezmez
  } catch (e) {
    toast(e.message);
  }
}

function kalpPatlat(satir, x, y) {
  const balon = satir.querySelector('.sh-balon');
  if (!balon) return;
  const r = balon.getBoundingClientRect();
  const b = document.body.getBoundingClientRect();
  const k = h('span', { class: 'sh-kalp-patla', 'aria-hidden': 'true' }, ikon('kalp'));
  k.style.left = `${(x ?? r.left + r.width / 2) - b.left}px`;
  k.style.top = `${(y ?? r.top + r.height / 2) - b.top}px`;
  document.body.append(k);
  setTimeout(() => k.remove(), 900);
}

async function kopyala(s) {
  let ok = false;
  try { await navigator.clipboard.writeText(s); ok = true; } catch { /* izin yok */ }
  if (!ok) {
    const t = h('textarea', { readonly: true, style: { position: 'fixed', top: '0', left: '0', opacity: '0' } });
    t.value = s;
    document.body.append(t);
    t.select();
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    t.remove();
  }
  toast(ok ? 'Kopyalandı' : 'Kopyalanamadı');
}

async function yildizla(id) {
  const d = col.get(id);
  if (!d) return;
  const ekle = d.data.yildiz?.[benId] !== true;
  try {
    await col.patch(id, M.yildizYamasi(d, benId)); // yalnız kendi yıldızım
  } catch (e) {
    toast(e.message);
    return;
  }
  if (ekle) toast('Yıldızlandı', { action: { label: 'Yıldızlılar', onClick: () => panel.ac('yildiz') } });
  else toast('Yıldız kaldırıldı');
}

// ---------- Sabitlenen mesajlar ----------
// Yalnız son 100 mesaj yüklü: sabitler yerel önbellekte de tutulur (eski sabit kaybolmasın).
// Kaynaklar: görünen mesajlar, karşı tarafın canlı yazmaları, açılışta ve öne gelişte artımlı tarama.
const sabitAnahtar = `bizim.sohbet.sabit.${roomId}`;
const sabitKayit = (() => {
  try {
    const k = JSON.parse(readStore('local', sabitAnahtar) || 'null');
    if (k && Array.isArray(k.liste)) return { since: k.since || SABIT_BASLANGIC, liste: M.sabitBirlestir([], k.liste).liste };
  } catch { /* bozuk önbellek */ }
  return { since: SABIT_BASLANGIC, liste: [] };
})();
let sabitListeCiz = null; // liste penceresi açıkken onu tazeler

function sabitKaydet() {
  try { writeStore('local', sabitAnahtar, JSON.stringify(sabitKayit)); } catch { /* kota */ }
}

function sabitGuncelle(docs) {
  const r = M.sabitBirlestir(sabitKayit.liste, docs);
  if (!r.degisti) return;
  sabitKayit.liste = r.liste;
  sabitKaydet();
  sabitCiz();
  sabitListeCiz?.();
}

let sabitTaraniyor = false;
let sonSabitTarama = 0;
/** Son taramadan beri değişen mesajlar (silinenler dahil): başka cihazda sabitlenen eski mesajlar da gelir. */
async function sabitTara() {
  if (sabitTaraniyor || Date.now() - sonSabitTarama < 60000) return;
  sabitTaraniyor = true;
  sonSabitTarama = Date.now();
  try {
    const docs = await listDocs(roomId, 'mesaj', { since: overlapSince(sabitKayit.since) });
    sabitKayit.since = maxUpdated(docs, sabitKayit.since);
    sabitKaydet();
    sabitGuncelle(docs);
  } catch { /* çevrimdışı ya da yetki yok: önbellek yeter */ } finally {
    sabitTaraniyor = false;
  }
}

function sabitCiz() {
  const l = sabitKayit.liste;
  sabitSerit.hidden = !l.length;
  if (!l.length) return;
  const d = l[0];
  const kim = ad(M.gonderen(d));
  const metin = M.ozet(d.data, 120) || 'Mesaj';
  const cok = l.length > 1;
  sabitBtn.setAttribute('aria-label', cok
    ? `${l.length} sabitlenen mesaj. En son: ${kim}, ${metin}. Listeyi aç.`
    : `Sabitlenen mesaj. ${kim}, ${metin}. Mesaja git.`);
  if (cok) sabitBtn.setAttribute('aria-haspopup', 'dialog');
  else sabitBtn.removeAttribute('aria-haspopup');
  sabitBtn.replaceChildren(
    h('span', { class: 'sh-sabit-ik', 'aria-hidden': 'true' }, ikon('sabit')),
    h('span', { class: 'sh-sabit-metin', 'aria-hidden': 'true' }, h('b', {}, kim), ` ${metin}`));
  if (cok) sabitBtn.append(h('span', { class: 'sh-sabit-sayi', 'aria-hidden': 'true' }, String(l.length), ikon('liste')));
}
sabitBtn.addEventListener('click', () => {
  const l = sabitKayit.liste;
  if (l.length > 1) sabitListesiAc();
  else if (l.length) sabiteGit(l[0]);
});

async function sabitle(id) {
  const d = col.get(id);
  if (!d) return;
  const ekle = !M.sabitMi(d);
  if (ekle && sabitKayit.liste.filter((x) => x.id !== id).length >= M.SABIT_EN_COK) {
    toast(`En çok ${M.SABIT_EN_COK} mesaj sabitlenebilir. Önce birini kaldır.`, { action: { label: 'Sabitlenenler', onClick: sabitListesiAc } });
    return;
  }
  try {
    await col.patch(id, M.sabitYamasi(d, benId));
  } catch (e) {
    toast(e.message);
    return;
  }
  sabitGuncelle([col.get(id)]);
  toast(ekle ? 'Sabitlendi' : 'Sabitleme kaldırıldı');
}

/** Listeden kaldırma. Mesaj bu cihazda hiç yüklenmediyse (eski) doğrudan yazılır ve karşıya yayılır. */
async function sabitKaldir(id) {
  const d = col.get(id);
  const onbellek = sabitKayit.liste.find((x) => x.id === id);
  try {
    if (d) {
      if (M.sabitMi(d)) await col.patch(id, M.sabitYamasi(d, benId));
      sabitGuncelle([col.get(id)]);
    } else if (onbellek) {
      const doc = await patchDoc(roomId, 'mesaj', id, M.sabitYamasi(onbellek, benId), benId);
      room.sendAll({ t: 'veri', kind: 'mesaj', doc });
      sabitGuncelle([doc]);
    }
  } catch (e) {
    toast(e?.message || 'Kaldırılamadı. Bağlantını kontrol et.');
    return;
  }
  toast('Sabitleme kaldırıldı');
}

const gorunurMu = (id) => col.all().some((x) => x.id === id);
let sabiteGidiliyor = false;
/** Sabit mesaja gider; yüklü değilse geçmiş yükleme yoluyla ona dek eski mesajları getirir. */
async function sabiteGit(d) {
  if (sabiteGidiliyor) return;
  if (!gorunurMu(d.id)) {
    if (!col.hasOlder()) { toast('Bu mesaj artık yok.'); return; }
    sabiteGidiliyor = true;
    toast('Eski mesajlara gidiliyor…', { ms: 2000 });
    const hedefAn = Date.parse(d.created_at);
    try {
      for (let i = 0; i < 40 && col.hasOlder() && !gorunurMu(d.id); i++) {
        const ilk = col.all()[0];
        if (ilk && Date.parse(ilk.created_at) <= hedefAn) break; // o ana dek yüklendi: mesaj silinmiş
        await eskileriGetir({ pencere: false });
      }
    } finally {
      sabiteGidiliyor = false;
    }
    if (!gorunurMu(d.id)) { toast('Bu mesaja ulaşılamadı.'); return; }
  }
  mesajaGit(d.id, { odak: true });
}

function sabitListesiAc() {
  if (document.querySelector('dialog.sh-menu[open]')) return;
  let bekleyen = null;
  const baslik = h('h2', { class: 'sh-sabitler-baslik', id: 'sh-sabitler-baslik' });
  const kapatBtn = h('button', { type: 'button', class: 'sh-ara-kapat' }, 'Kapat');
  const ol = h('ol', { class: 'sh-sabitler-liste' });
  const dlg = h('dialog', { class: 'sh-menu sh-sabitler', 'aria-labelledby': 'sh-sabitler-baslik' },
    h('div', { class: 'sh-sabitler-kart' }, h('div', { class: 'sh-sabitler-bas' }, baslik, kapatBtn), ol));
  kapatBtn.addEventListener('click', () => dlg.close());
  sabitListeCiz = () => {
    const l = sabitKayit.liste;
    if (!l.length) { dlg.close(); return; }
    const odakVardi = ol.contains(document.activeElement);
    baslik.textContent = `Sabitlenenler · ${l.length}`;
    ol.replaceChildren(...l.map((d) => h('li', {},
      h('button', { type: 'button', class: 'sh-sabit-oge', onclick: () => { bekleyen = () => sabiteGit(d); dlg.close(); } },
        h('span', { class: 'sh-sonuc-ust' },
          h('span', { class: 'sh-sonuc-kim' }, ad(M.gonderen(d))),
          h('span', { class: 'sh-sonuc-zaman' }, [M.gunEtiketi(d.created_at), M.saatEtiketi(d.created_at)].filter(Boolean).join(' · '))),
        h('span', { class: 'sh-sabit-oge-metin' }, M.ozet(d.data, 160) || 'Mesaj')),
      h('button', {
        type: 'button', class: 'sh-ikon-btn', 'aria-label': `Sabitlemeyi kaldır: ${M.ozet(d.data, 40) || 'Mesaj'}`,
        title: 'Sabitlemeyi kaldır', onclick: () => sabitKaldir(d.id),
      }, ikon('sabitKaldir')))));
    if (odakVardi) (ol.querySelector('.sh-sabit-oge') || kapatBtn).focus({ preventScroll: true });
  };
  sabitListeCiz();
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
  dlg.addEventListener('close', () => {
    sabitListeCiz = null;
    dlg.remove();
    if (bekleyen) bekleyen();
    else if (!sabitSerit.hidden) sabitBtn.focus({ preventScroll: true });
  });
  document.body.append(dlg);
  dlg.showModal();
  ol.querySelector('.sh-sabit-oge')?.focus({ preventScroll: true });
}

/**
 * Mesaja kaydırır ve kısa süre vurgular. Mesaj bellekte ama çizim penceresinin dışındaysa (eski mesaj, arama
 * sonucu, yıldızlı) pencere o mesaja dek açılır.
 */
function mesajaGit(id, { odak = false } = {}) {
  const sec = `.sh-satir[data-id="${CSS.escape(id)}"]`;
  let acildi = false;
  if (!liste.querySelector(sec) && gizliVar && col.get(id)) {
    pencereyiAc(id);
    acildi = true;
  }
  const hedef = liste.querySelector(sec);
  if (!hedef) { toast('Bu mesaj artık yok.'); return; }
  altaYapisik = false; // yeniden çizim / boyut değişimi alta atmasın
  gidisBitis = Date.now() + 900;
  // Pencere yeni açıldıysa doğrudan atla: yumuşak kaydırma sürerken boy gözcüsü en alta geri çekmesin.
  const anlik = acildi || azHareket.matches;
  // Uzaksa hedefin yakınına atla, kalanı yumuşak kaydır.
  const kr = kaydirma.getBoundingClientRect();
  const fark = hedef.getBoundingClientRect().top - kr.top - kr.height / 2;
  if (!anlik && Math.abs(fark) > kr.height * 1.5) kaydirma.scrollTop += fark - Math.sign(fark) * kr.height;
  hedef.scrollIntoView({ block: 'center', behavior: anlik ? 'auto' : 'smooth' });
  hedef.classList.remove('parla');
  void hedef.offsetWidth;
  hedef.classList.add('parla');
  setTimeout(() => hedef.classList.remove('parla'), 1400);
  if (odak) hedef.querySelector('.sh-balon')?.focus({ preventScroll: true });
}

async function silSor(id) {
  const ok = await confirmDialog('Bu mesaj ikiniz için de silinsin mi?', { ok: 'Sil', cancel: 'Vazgeç' });
  if (!ok) return;
  if (duzenlenen === id || yanitlanan === id) ekKapat();
  try {
    await col.remove(id);
  } catch (e) {
    toast(e.message);
    return;
  }
  sabitGuncelle([{ id, deleted: true, updated_at: new Date().toISOString() }]);
}

/** basili: menü parmak hâlâ ekrandayken (uzun basma) açıldı. */
function menuAc(satir, { basili = false } = {}) {
  const id = satir?.dataset?.id;
  const d = id ? col.get(id) : null;
  if (!d || document.querySelector('dialog.sh-menu[open]')) return;
  const benim = M.gonderen(d) === benId;
  const metin = typeof d.data.metin === 'string' ? d.data.metin : '';
  const benimTepki = d.data.tepki?.[benId] || null;
  const benimYildiz = d.data.yildiz?.[benId] === true;
  const sabitli = M.sabitMi(d);
  titret(10);
  secili = id;
  satir.classList.add('secili');

  let bekleyen = null;
  const dlg = h('dialog', { class: 'sh-menu', 'aria-label': 'Mesaj seçenekleri' });
  const islem = (fn) => { bekleyen = fn; dlg.close(); };
  const eylem = (ik, yazi, fn, cls = '') => h('button', { type: 'button', class: `sh-menu-eylem ${cls}`, onclick: () => islem(fn) },
    h('span', {}, yazi), ikon(ik));

  dlg.append(h('div', { class: 'sh-menu-kart' },
    h('p', { class: 'sh-menu-ozet' }, M.ozet(d.data, 140) || 'Mesaj'),
    h('div', { class: 'sh-menu-tepkiler', role: 'group', 'aria-label': 'Tepki ver' },
      M.HIZLI_TEPKILER.map((e) => h('button', {
        type: 'button', class: `sh-menu-tepki${benimTepki === e ? ' secili' : ''}`,
        'aria-label': `${e} tepkisi`, 'aria-pressed': String(benimTepki === e),
        onclick: () => islem(() => tepkiVer(id, e)),
      }, e))),
    h('div', { class: 'sh-menu-eylemler' },
      eylem('yanitla', 'Yanıtla', () => yanitBasla(id)),
      eylem(benimYildiz ? 'yildizDolu' : 'yildiz', benimYildiz ? 'Yıldızı kaldır' : 'Yıldızla', () => yildizla(id)),
      eylem(sabitli ? 'sabitKaldir' : 'sabit', sabitli ? 'Sabitlemeyi kaldır' : 'Sabitle', () => sabitle(id)),
      metin ? eylem('kopyala', 'Kopyala', () => kopyala(metin)) : null,
      benim && metin ? eylem('duzenle', 'Düzenle', () => duzenlemeBasla(id)) : null,
      benim ? eylem('sil', 'Sil', () => silSor(id), 'tehlike') : null)));
  // Uzun basmadan sonra parmak kalkınca gelen tıklama, parmağın altındaki eyleme düşmesin.
  let tutuluyor = basili;
  let birakildi = 0;
  const OLAYLAR = ['pointerup', 'pointercancel', 'touchend'];
  const birak = () => {
    tutuluyor = false;
    birakildi = Date.now();
    for (const t of OLAYLAR) window.removeEventListener(t, birak, true);
  };
  if (basili) for (const t of OLAYLAR) window.addEventListener(t, birak, true);
  dlg.addEventListener('click', (e) => {
    if (tutuluyor || Date.now() - birakildi < 350) { e.preventDefault(); e.stopPropagation(); }
  }, true);
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
  dlg.addEventListener('close', () => {
    birak();
    dlg.remove();
    secili = null;
    liste.querySelector('.sh-satir.secili')?.classList.remove('secili');
    if (bekleyen) bekleyen();
  });
  document.body.append(dlg);
  dlg.showModal();
}

// Liste tıklamaları: alıntı, tepki pili, fotoğraf.
let sonCift = 0;
liste.addEventListener('click', (e) => {
  const alinti = e.target.closest('.sh-alinti[data-hedef]');
  if (alinti) {
    if (liste.querySelector(`.sh-satir[data-id="${CSS.escape(alinti.dataset.hedef)}"]`) || col.get(alinti.dataset.hedef)) {
      mesajaGit(alinti.dataset.hedef);
    }
    return;
  }
  const oynat = e.target.closest('.sh-ses:not(.yer) .sh-ses-oynat');
  if (oynat) { sesOynat(oynat.closest('.sh-satir').dataset.id); return; }
  const pil = e.target.closest('.sh-tepkiler');
  if (pil) { menuAc(pil.closest('.sh-satir')); return; }
  const foto = e.target.closest('.sh-foto:not(.yer)');
  if (foto) {
    const img = foto.querySelector('img');
    if (!img?.src) return;
    const t = Date.now();
    const url = img.dataset.foto;
    setTimeout(() => {
      if (sonCift >= t) return;
      if (!url || fotoHazir.has(url)) { fotoAc(img.src, img.alt); return; }
      fotoSrc(url).then((src) => fotoAc(src || img.src, img.alt));
    }, CIFT_MS);
  }
});
liste.addEventListener('keydown', (e) => {
  const balon = e.target.closest?.('.sh-balon');
  if (!balon || e.target !== balon) return;
  if (e.key === 'Enter' || e.key === ' ' || e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) {
    e.preventDefault();
    menuAc(balon.closest('.sh-satir'));
  }
});

// Oynat düğmesi jest sayılmaz: hızlı oynat/duraklat çift dokunma (❤️) olmasın.
liste.addEventListener('pointerdown', (e) => {
  if (e.target.closest?.('.sh-ses-oynat')) e.stopPropagation();
}, true);

jestleriBagla(liste, {
  uzunBas: (satir, secenek) => menuAc(satir, secenek),
  ciftDokun: (satir, x, y) => {
    sonCift = Date.now();
    const id = satir.dataset.id;
    if (!col.get(id)) return;
    kalpPatlat(satir, x, y);
    titret(12);
    tepkiVer(id, '❤️', { yalnizEkle: true });
  },
  kaydir: (satir) => yanitBasla(satir.dataset.id),
  esik: () => titret(8),
  okIkonu: () => ikon('yanitla'),
});

// ---------- Arama ve yıldızlılar ----------
// Ara düğmesi sohbet içi arama çubuğunu açar (bul.js); sonuç listesi ve yıldızlılar paneli (panel.js) oradan açılır.
const araBtn = h('button', {
  type: 'button', class: 'icon-btn sh-ara-btn', 'aria-label': 'Sohbette ara', title: 'Sohbette ara',
  'aria-controls': 'sh-bul', 'aria-expanded': 'false',
}, ikon('ara'));
const panel = aramaPaneli({
  col, benId, ad, partnerAd,
  mesajaGit: (id, sorgu) => { if (!(bul.acikMi() && sorgu && bul.sec(id, sorgu))) mesajaGit(id, { odak: true }); },
  eskiYukle: () => eskileriGetir({ pencere: false }),
  arkaPlan: [listeKutu, alt],
  donus: araBtn,
});
app.append(panel.el);

/** Arama sonucuna gider ve işaretler (null: işareti kaldırır). */
function bulGit(id, secenek = {}) {
  liste.querySelector('.sh-satir.bul-simdiki')?.classList.remove('bul-simdiki');
  if (!id) return;
  mesajaGit(id, secenek);
  liste.querySelector(`.sh-satir[data-id="${CSS.escape(id)}"]`)?.classList.add('bul-simdiki');
}
bul = sohbetBul({
  col,
  git: bulGit,
  cizdir: () => ciz(),
  eskiYukle: () => eskileriGetir({ pencere: false }),
  listeAc: (sorgu, dugme) => panel.ac('ara', { sorgu, donus: dugme }),
  yildizAc: (dugme) => panel.ac('yildiz', { sorgu: '', donus: dugme }),
  acildi: () => {
    app.classList.add('sh-bul-acik');
    araBtn.setAttribute('aria-expanded', 'true');
    emojiPanel.hidden = true;
    emojiBtn.setAttribute('aria-expanded', 'false');
  },
  kapandi: ({ odakGeriVer }) => {
    app.classList.remove('sh-bul-acik');
    araBtn.setAttribute('aria-expanded', 'false');
    if (odakGeriVer) araBtn.focus();
  },
});
listeKutu.prepend(bul.ust);
form.after(bul.gez);
const araclar = document.querySelector('#shell .shell-tools');
if (araclar) araclar.insertBefore(araBtn, araclar.lastElementChild);
araBtn.addEventListener('click', () => {
  if (bul.acikMi()) { bul.kapat(); return; }
  if (kayit) { toast('Önce sesli mesajı gönder ya da sil.'); return; }
  if (panel.acikMi()) panel.kapat({ odakGeriVer: false });
  bul.ac();
});
// Telefonda arama klavyesi açıkken alt sekme çubuğu yer kaplamasın (mesaj alanındaki gibi).
for (const kutu of [panel.el, bul.ust]) {
  kutu.addEventListener('focusin', (e) => {
    if (kaba.matches && e.target.matches?.('.sh-ara-girdi')) document.body.classList.add('sh-klavye');
  });
  kutu.addEventListener('focusout', (e) => {
    if (e.target.matches?.('.sh-ara-girdi')) document.body.classList.remove('sh-klavye');
  });
}
let panelKare = 0;
const panelTazele = () => {
  if ((!panel.acikMi() && !bul.acikMi()) || panelKare) return;
  panelKare = requestAnimationFrame(() => { panelKare = 0; panel.guncelle(); bul.tazele(); });
};

// ---------- Başlat ----------
col.on('change', ciz);
col.on('change', panelTazele);
col.on('change', (docs) => sabitGuncelle(docs));
okCol.on('change', ciz);
profil?.on('change', ciz);
profil?.on('change', panelTazele);
profil?.on('change', sabitCiz);
// Karşı tarafın yazması (eski, yüklü olmayan mesajı sabitlemesi dahil).
room.on('message', (msg) => {
  if (msg?.t === 'veri' && msg.kind === 'mesaj' && msg.doc) sabitGuncelle([msg.doc]);
});
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') sabitTara(); });

ta.value = readStore('local', taslakAnahtar) || '';
girisDegisti();
// Önce iskelet (üst şerit, giriş alanı) boyansın; balonlar sonraki görevde (tek uzun görev olmasın).
// Arka sekmede kare gelmez: beklemeden çiz.
await new Promise((r) => (document.hidden ? setTimeout(r, 0) : requestAnimationFrame(() => setTimeout(r, 0))));
ciz();
sabitGuncelle(col.all());
sabitCiz();
doldur();
sabitTara();
