// Sohbet sayfası: ikinizin mesajlaşma yeri.
// Veri: 'mesaj' (son 100, yukarı kaydırınca eskiler) ve 'okundu' (id = clientId, { son, at }).
// Canlı sinyal: room.send({ t:'yaziyor' }) en çok 2 sn'de bir.
import { bootPage } from '../../js/core/sayfa.js';
import { openCollection } from '../../js/core/veri.js';
import { openProfil } from '../../js/core/profil.js';
import { uploadPhoto, isAllowedPhotoUrl } from '../../js/core/storage.js';
import { readStore, writeStore } from '../../js/core/identity.js';
import { bildir } from '../../js/core/bildirim.js';
import { partnerGoruyor } from '../../js/core/room.js';
import { h, toast, confirmDialog, knownPartner, fotoSrc } from '../../js/core/ui.js';
import { sfx } from '../../js/core/sound.js';
import { titret } from '../../js/core/mobil.js';
import { normalizeImage } from '../../games/yapboz/image.js';
import * as M from './mantik.js';
import { ikon, gunSatiri, mesajSatiri, yuklemeSatiri } from './ekran.js';
import { jestleriBagla, CIFT_MS } from './jest.js';
import { onizlemeBagla } from '../anilar/onizleme.js';

const EMOJILER = ['❤️', '😘', '🥰', '😍', '😂', '🤭', '😊', '🥺', '😢', '😴', '🤗', '🙈', '🔥', '✨', '🌹', '💌'];
const ONERILER = ['Günaydın sevgilim ☀️', 'Seni özledim 🥺', 'Bu akşam ne yapıyoruz?'];
const ESKI_ESIK = 500; // tepeye bu kadar yaklaşınca eski mesajlar yüklenir
const PENCERE = 30; // açılışta DOM'a basılan son mesaj sayısı; yukarı kaydırdıkça PENCERE kadar artar
const BALON_FOTO = Object.freeze({ uzun: 960 }); // balon en çok ~312 CSS px × 3
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
const form = h('form', { class: 'sh-giris' }, fotoBtn, fotoInput, h('div', { class: 'sh-yazi-kap' }, ta, emojiBtn), gonderBtn);
const sayac = h('div', { class: 'sh-sayac', hidden: true });
const alt = h('div', { class: 'sh-alt' }, h('div', { class: 'sh-sutun' }, ek, emojiPanel, form, sayac));
const duyuru = h('div', { class: 'sr-only', 'aria-live': 'polite' });

app.replaceChildren(h('div', { class: 'sh-liste-kutu' }, kaydirma, asagi), alt, duyuru);
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
      imza = [r.doc.updated_at, r.doc.pending ? 1 : 0, r.ilk ? 1 : 0, r.son ? 1 : 0, dr ? `${dr.durum}${dr.at}` : '',
        d.yanit ? (hedef ? hedef.updated_at : 'yok') : '', r.benim ? '' : pAd].join('|');
      kur = () => mesajSatiri(r, { ...ctxTaban, durum: dr });
    }
    anahtarlar.add(r.anahtar);
    let e = elemanlar.get(r.anahtar);
    if (!e || e.imza !== imza) {
      e = { el: kur(), imza };
      elemanlar.set(r.anahtar, e);
      if (r.tur === 'mesaj') {
        if (secili === r.anahtar) e.el.classList.add('secili');
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
      e = { el: yuklemeSatiri(y, { tekrar: fotoGonder, vazgec: yuklemeVazgec }), imza };
      elemanlar.set(anahtar, e);
    }
    istenen.push(e.el);
  }
  for (const k of [...elemanlar.keys()]) if (!anahtarlar.has(k)) elemanlar.delete(k);
  esitle(liste, istenen);

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

async function eskileriYukle() {
  if (gizliVar) { pencereyiAc(); return; }
  if (eskiYukleniyor || !col.hasOlder()) return;
  eskiYukleniyor = true;
  const alttan = kaydirma.scrollHeight - kaydirma.scrollTop;
  ustGuncelle();
  kaydirma.scrollTop = kaydirma.scrollHeight - alttan;
  pencereAnahtar = null; // gelen eski mesajlar pencereye girsin
  pencereN += 50;
  try {
    await col.loadOlder(50);
  } catch (e) {
    hataGoster(e);
  }
  eskiYukleniyor = false;
  ustGuncelle();
  kaydirma.scrollTop = kaydirma.scrollHeight - alttan; // okunan yer kaymasın
  altaYapisik = M.altaYakinMi(kaydirma);
}

async function doldur() {
  for (let i = 0; i < 6 && (gizliVar || col.hasOlder()) && kaydirma.scrollHeight <= kaydirma.clientHeight + ESKI_ESIK; i++) {
    await eskileriYukle();
  }
}

kaydirma.addEventListener('scroll', () => {
  altaYapisik = M.altaYakinMi(kaydirma);
  asagiGuncelle();
  if (kaydirma.scrollTop < ESKI_ESIK) eskileriYukle();
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
      const n = await normalizeImage(y.dosya);
      try { n.image?.close?.(); } catch { /* tuval */ }
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

async function silSor(id) {
  const ok = await confirmDialog('Bu mesaj ikiniz için de silinsin mi?', { ok: 'Sil', cancel: 'Vazgeç' });
  if (!ok) return;
  if (duzenlenen === id || yanitlanan === id) ekKapat();
  try {
    await col.remove(id);
  } catch (e) {
    toast(e.message);
  }
}

/** basili: menü parmak hâlâ ekrandayken (uzun basma) açıldı. */
function menuAc(satir, { basili = false } = {}) {
  const id = satir?.dataset?.id;
  const d = id ? col.get(id) : null;
  if (!d || document.querySelector('dialog.sh-menu[open]')) return;
  const benim = M.gonderen(d) === benId;
  const metin = typeof d.data.metin === 'string' ? d.data.metin : '';
  const benimTepki = d.data.tepki?.[benId] || null;
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
    const sec = `.sh-satir[data-id="${CSS.escape(alinti.dataset.hedef)}"]`;
    let acildi = false;
    if (!liste.querySelector(sec) && gizliVar && col.get(alinti.dataset.hedef)) {
      pencereyiAc(alinti.dataset.hedef);
      acildi = true;
    }
    const hedef = liste.querySelector(sec);
    if (hedef) {
      // Pencere yeni açıldıysa doğrudan atla: yumuşak kaydırma sürerken boy gözcüsü en alta geri çekmesin.
      hedef.scrollIntoView({ block: 'center', behavior: acildi || azHareket.matches ? 'auto' : 'smooth' });
      if (acildi) altaYapisik = false;
      hedef.classList.remove('parla');
      void hedef.offsetWidth;
      hedef.classList.add('parla');
      setTimeout(() => hedef.classList.remove('parla'), 1400);
    }
    return;
  }
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

// ---------- Başlat ----------
col.on('change', ciz);
okCol.on('change', ciz);
profil?.on('change', ciz);

ta.value = readStore('local', taslakAnahtar) || '';
girisDegisti();
// Önce iskelet (üst şerit, giriş alanı) boyansın; balonlar sonraki görevde (tek uzun görev olmasın).
// Arka sekmede kare gelmez: beklemeden çiz.
await new Promise((r) => (document.hidden ? setTimeout(r, 0) : requestAnimationFrame(() => setTimeout(r, 0))));
ciz();
doldur();
