// Yavrumuz: çiftin birlikte baktığı sanal yavru (yumurta → küçük → büyük).
// Saf mantık mantik.js'te, SVG çizimi cizim.js'te (ana sayfa kartı da kullanır).
// Veri: 'yavru' türünde tek belge 'bizim' (alan düzeyinde yama), bakım günlüğü 'yavrubakim' (son 10).
import { bootPage } from '../../js/core/sayfa.js';
import { openCollection } from '../../js/core/veri.js';
import { openProfil } from '../../js/core/profil.js';
import { bildir } from '../../js/core/bildirim.js';
import { partnerGoruyor } from '../../js/core/room.js';
import { readStore, writeStore, isLocalMode } from '../../js/core/identity.js';
import { h, toast, knownPartner, formatDay, celebrate, ICONS } from '../../js/core/ui.js';
import { sfx } from '../../js/core/sound.js';
import { titret, yerelHatirlaticilar } from '../../js/core/mobil.js';
import * as M from './mantik.js';
import { yavruSvg, catlamaSvg, CIZIM_CSS } from './cizim.js';

const { room, roomId, me } = await bootPage({ ns: 'yavru', title: 'Yavrumuz', tab: 'daha' });
const app = document.getElementById('app');
document.head.append(h('style', { id: 'yv-cizim-stil' }, CIZIM_CSS));
app.replaceChildren(h('div', { class: 'yv' }, h('p', { class: 'yv-yukleniyor muted', role: 'status' }, 'Yavrunuz geliyor…')));

const [col, bakim, profil] = await Promise.all([
  openCollection(room, M.TUR),
  openCollection(room, M.BAKIM_TUR, { recent: 10 }),
  openProfil(room).catch((e) => { console.warn('[yavru] profil açılamadı', e); return null; }),
]);

const azHareket = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const bekle = (ms) => new Promise((r) => setTimeout(r, ms));
const YEMEK = ['mama', 'meyve', 'tatli'];
const BAKIM = ['oyna', 'yika', 'sev', 'uyut'];
const ASAMA_ADI = { yumurta: 'Yumurta', kucuk: 'Küçük', buyuk: 'Büyük' };
const IHTIYAC_ADI = { tokluk: 'Tokluk', mutluluk: 'Mutluluk', temizlik: 'Temizlik', enerji: 'Enerji' };
const IKON = 'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"';
const IHTIYAC_IKON = {
  tokluk: `<svg ${IKON}><path d="M3.5 11.5h17a8.5 8.5 0 0 1-17 0z"/><path d="M9.5 7.5c0-1.6 1.2-2 1.2-3.6M13.8 7.5c0-1.6 1.2-2 1.2-3.6"/></svg>`,
  mutluluk: `<svg ${IKON}><circle cx="12" cy="12" r="8.6"/><path d="M8.4 13.6a4.1 4.1 0 0 0 7.2 0"/><path d="M9.2 9.6v.2M14.8 9.6v.2" stroke-width="2.6"/></svg>`,
  temizlik: `<svg ${IKON}><path d="M12 3.6s-5.6 6.2-5.6 10.1a5.6 5.6 0 0 0 11.2 0c0-3.9-5.6-10.1-5.6-10.1z"/><path d="M9.6 14.4a2.6 2.6 0 0 0 2.2 2.2"/></svg>`,
  enerji: `<svg ${IKON}><path d="M13.2 3 5.6 13.4h6.1l-1 7.6 7.7-10.6h-6.2z"/></svg>`,
};
const KALEM = `<svg ${IKON}><path d="M4.5 19.5 5.6 15 15.8 4.8a2.1 2.1 0 0 1 3 3L8.6 18l-4.1 1.5z"/><path d="m14 6.6 3 3"/></svg>`;
const saatBicim = new Intl.DateTimeFormat('tr-TR', { hour: '2-digit', minute: '2-digit' });

// ---------- Adlar ----------
const benAdi = () => profil?.ben()?.ad || me.name || 'Sen';
function partnerAdi() {
  return profil?.partner()?.ad || room.partner?.()?.name || knownPartner(roomId)?.name || 'Sevgilin';
}
/** clientId → ad (ben: benAdi). */
function kisiAdi(id) {
  if (id === me.clientId) return benAdi();
  const p = room.partner?.();
  const k = knownPartner(roomId);
  return profil?.kisiler?.get(id)?.data?.ad || (p?.clientId === id && p.name) || (k?.clientId === id && k.name) || partnerAdi();
}

// ---------- Durum ----------
let y = null; // M.oku(belge) | null (henüz yok)
let simdi = Date.now();
let gorunenAsama = null; // aşama geçişinde (çatlama, büyüme) animasyon için
let catliyor = false;
let buyuyor = false;
let adDuzenle = false;
let adOdak = false;
let benimDogum = null; // bu cihaz yumurtayı oluşturduysa: iki cihaz aynı anda oluşturursa en erken doğum kalsın
let yuklemeHatasi = false;
let svgAnahtar = '';
let tepkiZaman = 0;
let olayZaman = 0;
let sonrakiZaman = 0;
let hatKey = null;
let partner = room.partner?.() || null;

// ---------- İskelet ----------
const cizimEl = h('span', { class: 'yv-cizim' });
const dokunBtn = h('button', { type: 'button', class: 'yv-dokun', onclick: sahneDokun }, cizimEl);
const parcaEl = h('div', { class: 'yv-parca', 'aria-hidden': 'true' });
const sozEl = h('p', { class: 'yv-soz', 'aria-live': 'polite' });
const buradaEl = h('span', { class: 'yv-burada', hidden: true });
const sahne = h('section', { class: 'yv-sahne', 'aria-label': 'Yavrumuz' },
  h('span', { class: 'yv-gok', 'aria-hidden': 'true' }), buradaEl, dokunBtn, parcaEl, sozEl);

const adBaslik = h('h2', { class: 'yv-ad', id: 'yv-ad' });
const adBtn = h('button', {
  type: 'button', class: 'icon-btn yv-ad-btn', 'aria-label': 'Adını değiştir', html: KALEM,
  onclick: () => { adDuzenle = true; adOdak = true; ciz(); },
});
const adSatir = h('div', { class: 'yv-ad-satir' }, adBaslik, adBtn);
const adGirdi = h('input', {
  id: 'yv-ad-girdi', class: 'input', type: 'text', maxlength: 40, autocomplete: 'off', enterkeyhint: 'done',
  placeholder: 'ör. Pamuk',
});
const adVazgec = h('button', { type: 'button', class: 'btn ghost', onclick: () => { adDuzenle = false; ciz(); adBtn.focus(); } }, 'Vazgeç');
const adBaslikForm = h('label', { class: 'yv-adform-baslik', for: 'yv-ad-girdi' });
const adForm = h('form', { class: 'yv-adform', novalidate: true, onsubmit: adKaydet },
  adBaslikForm, adGirdi,
  h('div', { class: 'yv-adform-dugmeler' }, adVazgec, h('button', { type: 'submit', class: 'btn primary' }, 'Kaydet')));
const metaEl = h('p', { class: 'yv-meta' });
const buyumeEl = h('p', { class: 'yv-buyume' });
const bilgi = h('section', { class: 'yv-bilgi', 'aria-labelledby': 'yv-ad' }, adSatir, adForm, metaEl, buyumeEl);

const ihtiyacHucre = {};
const ihtiyacEl = h('div', { class: 'yv-ihtiyaclar', role: 'group', 'aria-label': 'İhtiyaçlar' },
  M.IHTIYACLAR.map((ad) => {
    const deger = h('span', { class: 'yv-ihtiyac-deger' });
    const dolu = h('span', { class: 'yv-cubuk-dolu' });
    const cubuk = h('span', {
      class: 'yv-cubuk', role: 'meter', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-labelledby': `yv-ih-${ad}`,
    }, dolu);
    const el = h('div', { class: 'yv-ihtiyac', dataset: { ihtiyac: ad } },
      h('div', { class: 'yv-ihtiyac-bas' },
        h('span', { class: 'yv-ihtiyac-ikon', html: IHTIYAC_IKON[ad] }),
        h('span', { class: 'yv-ihtiyac-ad', id: `yv-ih-${ad}` }, IHTIYAC_ADI[ad]),
        deger),
      cubuk);
    ihtiyacHucre[ad] = { el, deger, dolu, cubuk };
    return el;
  }));

/** Eylem düğmesi: kalıcı öğe (odak yeniden çizimde kaybolmasın); içerik ciz() ile güncellenir. */
function eylemDugmesi(eylem) {
  const emoji = h('span', { class: 'yv-eylem-emoji', 'aria-hidden': 'true' });
  const ad = h('span', { class: 'yv-eylem-ad' });
  const btn = h('button', { type: 'button', class: 'yv-eylem', dataset: { eylem }, onclick: () => eylemTikla(btn.dataset.eylem) }, emoji, ad);
  return { btn, emoji, ad };
}
const dugmeler = [...YEMEK, ...BAKIM].map(eylemDugmesi);
const eylemlerEl = h('div', { class: 'yv-eylemler' },
  h('div', { class: 'yv-eylem-grup yemek', role: 'group', 'aria-label': 'Besle' }, dugmeler.slice(0, 3).map((d) => d.btn)),
  h('div', { class: 'yv-eylem-grup', role: 'group', 'aria-label': 'Bakım' }, dugmeler.slice(3).map((d) => d.btn)));

const ilerlemeEl = h('p', { class: 'yv-ilerleme' });
const isitAd = h('span', {}, 'Isıt');
const isitBtn = h('button', { type: 'button', class: 'btn primary wide yv-isit', onclick: isitTikla },
  h('span', { class: 'yv-isit-emoji', 'aria-hidden': 'true' }, '🤲'), isitAd);
const yumurtaEl = h('div', { class: 'yv-yumurta-panel' }, ilerlemeEl, isitBtn);
const panel = h('div', { class: 'yv-panel' }, yumurtaEl, eylemlerEl);

const bakimListe = h('ol', { class: 'yv-bakimlar' });
const bakimBos = h('p', { class: 'yv-bos' });
const bakimSec = h('section', { class: 'yv-son', 'aria-labelledby': 'yv-son-baslik' },
  h('h2', { id: 'yv-son-baslik' }, 'Son bakımlar'), bakimListe, bakimBos);

const kok = h('div', { class: 'yv' }, sahne, bilgi, ihtiyacEl, panel, bakimSec);
app.replaceChildren(kok);

// ---------- Çizim ----------
function cizSahne() {
  const ruh = M.ruhHali(y, simdi);
  const asama = y?.asama || 'yumurta';
  const renk = y?.renk || M.renkSec(roomId);
  const hazir = asama === 'yumurta' && !!y && M.catlamaHazir(y, simdi);
  const anahtar = `${asama}|${ruh}|${renk}|${hazir}`;
  if (anahtar !== svgAnahtar) {
    svgAnahtar = anahtar;
    cizimEl.innerHTML = yavruSvg({ asama, ruh, renk, hazir });
  }
  kok.style.setProperty('--yv-govde', `var(--yv-r${renk})`);
  sahne.dataset.asama = asama;
  const uyuyor = ruh === 'uyuyor';
  sahne.toggleAttribute('data-gece', uyuyor);
  dokunBtn.setAttribute('aria-label', asama === 'yumurta' ? 'Yumurtayı ısıt' : `${y?.ad || 'Yavrunuzu'} sev`);
  let soz = M.durumMetni(y, simdi);
  if (uyuyor) {
    const kalan = M.kalanMetni(Date.parse(y.uyku.bit) - simdi);
    if (kalan) soz += ` · ${kalan}`;
  }
  if (sozEl.textContent !== soz) sozEl.textContent = soz;
  sozEl.dataset.ton = asama !== 'yumurta' && (M.ozledi(y, simdi) || ['ac', 'kirli', 'uykulu', 'uzgun'].includes(ruh)) ? 'ihtiyac' : '';
}

function cizBilgi() {
  const yumurta = !y || y.asama === 'yumurta';
  const adYok = !yumurta && !y.ad;
  const formAcik = !yumurta && (adYok || adDuzenle);
  adSatir.hidden = formAcik;
  adForm.hidden = !formAcik;
  adVazgec.hidden = adYok;
  adBaslik.textContent = yumurta ? 'Yumurtamız' : y.ad || 'Yavrumuz';
  adBtn.hidden = yumurta;
  if (formAcik) {
    adBaslikForm.textContent = adYok ? 'Yavrumuza bir ad koyalım 💛' : 'Yeni adı';
    if (adOdak) {
      adOdak = false;
      if (!adYok || !adGirdi.value) adGirdi.value = y.ad || '';
      adGirdi.focus({ preventScroll: true });
      adForm.scrollIntoView({ block: 'nearest', behavior: azHareket() ? 'auto' : 'smooth' });
    }
  }
  metaEl.replaceChildren(
    h('span', {}, y ? M.yasMetni(y, simdi) : 'Yeni yumurta'),
    h('span', { class: 'chip yv-asama' }, ASAMA_ADI[y?.asama || 'yumurta']));

  let buyume = '';
  if (y?.asama === 'kucuk') {
    const b = M.buyumeDurumu(y, simdi);
    const benP = y.puan[me.clientId] || 0;
    const oP = b.kisiler.find((k) => k.id !== me.clientId)?.puan || 0;
    if (b.kalanGun > 0 || b.toplam < b.gerekToplam) {
      buyume = `Büyümesine ${b.kalanGun > 0 ? `${b.kalanGun} gün · ` : ''}${Math.min(b.toplam, b.gerekToplam)}/${b.gerekToplam} bakım`;
    } else {
      buyume = `İkinizin de en az ${b.gerekKisi} bakımı olunca büyür`;
    }
    buyume += ` (sen ${benP}, ${partnerAdi()} ${oP})`;
  } else if (y?.asama === 'buyuk') {
    buyume = `Birlikte ${M.buyumeDurumu(y, simdi).toplam} bakım`;
  }
  buyumeEl.textContent = buyume;
  buyumeEl.hidden = !buyume;
}

function cizIhtiyac() {
  const gizli = !y || y.asama === 'yumurta';
  ihtiyacEl.hidden = gizli;
  if (gizli) return;
  const d = M.ihtiyaclar(y, simdi);
  for (const ad of M.IHTIYACLAR) {
    const v = Math.round(d[ad]);
    const c = ihtiyacHucre[ad];
    c.deger.textContent = String(v);
    c.dolu.style.width = `${v}%`;
    c.cubuk.setAttribute('aria-valuenow', String(v));
    c.cubuk.setAttribute('aria-valuetext', `${v}${v < M.DUSUK ? ', az' : ''}`);
    c.el.toggleAttribute('data-dusuk', v < M.DUSUK);
  }
}

function cizPanel() {
  const yumurta = !y || y.asama === 'yumurta';
  yumurtaEl.hidden = !yumurta;
  eylemlerEl.hidden = yumurta;
  panel.dataset.asama = yumurta ? 'yumurta' : 'yavru';
  if (yumurta) {
    const d = y ? M.yumurtaDurumu(y, { benId: me.clientId, simdi }) : { ben: 0, partner: 0, partnerId: null, gerek: 3, kalan: M.YUMURTA_SURE, hazir: false };
    const kalan = d.kalan > 0 ? M.saatKalanMetni(d.kalan) : '24 saat doldu';
    // "Gül 2/3 · Ömer 3/3 · 14 saat kaldı"
    const kisi = (ad, n) => h('span', { class: 'yv-ilerleme-kisi', dataset: { tamam: String(n >= d.gerek) } },
      `${ad} `, h('strong', {}, `${Math.min(n, d.gerek)}/${d.gerek}`));
    ilerlemeEl.replaceChildren(kisi(benAdi(), d.ben), ' · ', kisi(partnerAdi(), d.partner), ' · ', h('span', {}, kalan));
    const erken = y ? M.isit(y, { kim: me.clientId, simdi }) : {};
    if (d.hazir || catliyor) {
      isitAd.textContent = 'Çatlıyor…';
      isitBtn.setAttribute('aria-disabled', 'true');
    } else if (erken.hata === 'erken') {
      isitAd.textContent = `Sıcacık · ${M.kalanMetni(erken.kalan)}`;
      isitBtn.setAttribute('aria-disabled', 'true');
    } else {
      isitAd.textContent = 'Isıt';
      isitBtn.removeAttribute('aria-disabled');
    }
    return;
  }
  const uyuyor = M.uyuyorMu(y.uyku, simdi);
  for (const d of dugmeler) {
    const eylem = d.btn.dataset.eylem === 'uyut' || d.btn.dataset.eylem === 'uyandir' ? (uyuyor ? 'uyandir' : 'uyut') : d.btn.dataset.eylem;
    const e = M.EYLEMLER[eylem];
    d.btn.dataset.eylem = eylem;
    d.emoji.textContent = e.emoji;
    const kalan = M.kalanBekleme(y, me.clientId, eylem, simdi);
    const kapali = uyuyor && eylem !== 'sev' && eylem !== 'uyandir';
    if (kapali) {
      d.btn.dataset.durum = 'uyku';
      d.ad.textContent = e.ad;
      d.btn.setAttribute('aria-disabled', 'true');
      d.btn.setAttribute('aria-label', `${e.ad} (uyuyor)`);
    } else if (kalan > 0) {
      d.btn.dataset.durum = 'bekle';
      d.ad.textContent = M.kalanMetni(kalan);
      d.btn.setAttribute('aria-disabled', 'true');
      d.btn.setAttribute('aria-label', `${e.ad}: ${M.kalanMetni(kalan)} sonra`);
    } else {
      delete d.btn.dataset.durum;
      d.ad.textContent = e.ad;
      d.btn.removeAttribute('aria-disabled');
      d.btn.removeAttribute('aria-label');
    }
  }
}

function cizBakimlar() {
  const docs = bakim.all().filter((d) => d.data && M.bakimSatiri({ eylem: d.data.eylem, ad: 'x' })).slice(-10).reverse();
  const bugun = new Date();
  bakimListe.replaceChildren(...docs.map((d) => {
    const { eylem, kim, at, deger } = d.data;
    const t = new Date(at || d.created_at);
    const gun = formatDay(t, bugun);
    const zaman = Number.isNaN(t.getTime()) ? '' : `${gun === 'bugün' ? '' : `${gun} `}${saatBicim.format(t)}`;
    return h('li', { class: 'yv-bakim', dataset: { ben: String(kim === me.clientId) } },
      h('span', { class: 'yv-bakim-metin' }, M.bakimSatiri({ eylem, ad: kim === me.clientId ? 'Sen' : kisiAdi(kim), deger })),
      h('time', { class: 'yv-bakim-zaman', datetime: at || '' }, zaman));
  }));
  bakimListe.hidden = !docs.length;
  bakimBos.hidden = !!docs.length;
  bakimBos.textContent = !y || y.asama === 'yumurta'
    ? 'Henüz bakım yok. Yumurtayı ısıtarak başlayalım mı?'
    : 'Henüz bakım yok. İlk ilgiyi siz gösterin 💛';
}

function cizPartner() {
  const burada = partnerGoruyor(partner, 'yavru');
  buradaEl.hidden = !burada;
  if (burada) buradaEl.replaceChildren(h('span', { class: 'dot on', 'aria-hidden': 'true' }), `${partnerAdi()} de burada`);
}

function ciz() {
  simdi = Date.now();
  const doc = col.get(M.BELGE_ID);
  y = doc ? M.oku(doc.data) : null;
  if (y && benimDogum) {
    // Karşı cihaz da aynı anda oluşturup daha geç doğumla ezdiyse benimkini (daha erken) geri yaz.
    const duzelt = y.asama === 'yumurta' ? M.dogumBirlestir(y.dogum, benimDogum) : null;
    if (y.asama !== 'yumurta') benimDogum = null;
    if (duzelt) col.patch(M.BELGE_ID, { dogum: duzelt }).catch(() => {});
  }
  cizSahne();
  cizBilgi();
  cizIhtiyac();
  cizPanel();
  cizBakimlar();
  cizPartner();
  gecisler();
  hatirlaticiPlanla();
  zamanla();
}

/** Sonraki yeniden hesap: en geç 1 dk; bir bekleme ya da dakika metni daha önce değişiyorsa o an. */
function zamanla() {
  clearTimeout(sonrakiZaman);
  let ms = M.DK;
  if (y && y.asama !== 'yumurta') {
    for (const e of Object.keys(M.EYLEMLER)) {
      const k = M.kalanBekleme(y, me.clientId, e, simdi);
      if (k > 0) ms = Math.min(ms, k % M.DK || M.DK);
    }
  } else if (y) {
    const r = M.isit(y, { kim: me.clientId, simdi });
    if (r.hata === 'erken') ms = Math.min(ms, r.kalan % M.DK || M.DK);
  }
  sonrakiZaman = setTimeout(() => { if (document.visibilityState === 'visible') ciz(); else zamanla(); }, ms + 150);
}

// ---------- Geçişler: çatlama ve büyüme ----------
function gecisler() {
  const degisti = y && gorunenAsama && y.asama !== gorunenAsama;
  gorunenAsama = y?.asama || null;
  if (!sahneOynuyor && M.catlamaSahnesiGerekli(y, !!readStore(sahneDepo(), SAHNE_KEY), simdi)) {
    catlamaSahnesi();
  } else if (degisti && !sahneOynuyor) {
    olay(y.asama === 'buyuk' ? 'buyudu' : 'dogdu', 1600);
    sfx('win');
  }
  if (y?.asama === 'yumurta' && !catliyor && M.catlamaHazir(y, simdi)) catla();
  if (y?.asama === 'kucuk' && !buyuyor && !sahneOynuyor && M.buyumeDurumu(y, simdi).hazir) buyu();
}

function olay(ad, ms) {
  clearTimeout(olayZaman);
  delete sahne.dataset.olay;
  void sahne.offsetWidth; // animasyonu baştan başlat
  sahne.dataset.olay = ad;
  if (ad === 'dogdu' || ad === 'buyudu') pirilti();
  olayZaman = setTimeout(() => { delete sahne.dataset.olay; }, azHareket() ? 0 : ms);
}

/** Koşul sağlanınca sayfayı ilk açan cihazda durum yazılır; an, çatlama sahnesiyle (gecisler) oynar. */
async function catla() {
  catliyor = true;
  cizPanel();
  const t = Date.now();
  try {
    await col.patch(M.BELGE_ID, M.catlamaYamasi(y, { roomId, simdi: t }));
  } catch (e) {
    toast(e?.message || 'Kaydedilemedi.');
    catliyor = false;
    cizPanel();
    return;
  }
  bakim.put({ eylem: 'catlama', kim: me.clientId, at: new Date(t).toISOString() }).catch(() => {});
  partnerBildir('catlama');
  catliyor = false;
  ciz();
}

// ---------- Çatlama sahnesi: cihaz başına bir kez (çatlatan da sonra açan sevgili de görür) ----------
// Yerel modda (?yerel=1) iki sekme iki ayrı kişi: kimlik gibi sekmeye özel depo. Gerçekte cihazın localStorage'ı.
const SAHNE_KEY = `bizim.yavru.catlamaGoruldu.${roomId}`;
const sahneDepo = () => (isLocalMode() ? 'session' : 'local');
let sahneOynuyor = false;

/** Sahne sırasında arkadaki sayfa odak ve dokunuş almaz. */
function sayfaKilit(on) {
  for (const id of ['shell', 'app', 'tabbar']) {
    const el = document.getElementById(id);
    if (el) el.inert = on;
  }
  document.documentElement.classList.toggle('ui-locked', on);
}

/** Yumurta sallanır, çatlar, üst kabuk uçar, yavru çıkar; sonra kutlama ve (ad yoksa) ad formu. ~3 sn. */
async function catlamaSahnesi() {
  sahneOynuyor = true;
  writeStore(sahneDepo(), SAHNE_KEY, '1'); // başta: yarıda kapansa da yeniden oynamaz
  const az = azHareket();
  const { renk } = y;
  const T = M.catlamaMetinleri();
  // Hareket azaltmada animasyon yok: çatlak yumurta, sonra tek karede yavru.
  const cizim = h('span', { class: 'yv-cs-cizim', html: az ? yavruSvg({ asama: 'yumurta', renk, hazir: true }) : catlamaSvg({ renk }) });
  const metin = h('p', { class: 'yv-cs-metin', role: 'status' }, T.catliyor);
  const kat = h('div', { class: 'yv-cs', style: { '--yv-govde': `var(--yv-r${renk})` } },
    h('div', { class: 'yv-cs-sahne', 'aria-hidden': 'true' }, h('span', { class: 'yv-cs-hale' }), cizim), metin);
  sayfaKilit(true);
  document.body.append(kat);
  sfx('tick');
  await bekle(az ? 700 : 1750);
  if (az) cizim.innerHTML = yavruSvg({ asama: 'kucuk', ruh: 'mutlu', renk });
  metin.textContent = T.geldi;
  metin.dataset.n = '2';
  sfx('win');
  titret([30, 70, 40]);
  await bekle(az ? 1100 : 1150);
  sayfaKilit(false);
  kat.classList.add('kapaniyor');
  setTimeout(() => kat.remove(), az ? 0 : 300);
  sahneOynuyor = false;
  // Ad o arada sevgiliden gelmiş olabilir: güncel belgeye göre.
  const k = M.catlamaMetinleri(y?.ad);
  celebrate({
    title: k.baslik,
    lines: [k.satir],
    buttons: [{
      label: k.dugme,
      primary: true,
      onClick: () => {
        if (!y || y.asama === 'yumurta' || y.ad) return;
        adOdak = true; // ad formu öne çıkar: odak ve görünür alan (cizBilgi)
        ciz();
      },
    }],
  });
}

async function buyu() {
  buyuyor = true;
  const t = Date.now();
  try {
    await col.patch(M.BELGE_ID, M.buyumeYamasi(t));
  } catch (e) {
    toast(e?.message || 'Kaydedilemedi.');
    buyuyor = false;
    return;
  }
  bakim.put({ eylem: 'buyume', kim: me.clientId, at: new Date(t).toISOString() }).catch(() => {});
  partnerBildir('buyume');
  buyuyor = false;
  celebrate({
    title: `${y?.ad || 'Yavrunuz'} büyüdü!`,
    lines: ['Birlikte baktınız, birlikte büyüttünüz 💛'],
    buttons: [{ label: 'Ne güzel', primary: true }],
  });
}

// ---------- Eylemler ----------
async function yaz(yama, kayit, eylem, ek = {}) {
  try {
    await col.patch(M.BELGE_ID, yama);
  } catch (e) {
    toast(e?.message || 'Kaydedilemedi. Bağlantını kontrol et.');
    return false;
  }
  bakim.put(kayit).catch(() => {});
  partnerBildir(eylem, ek);
  return true;
}

function isitTikla() {
  if (!y || y.asama !== 'yumurta' || catliyor) return;
  const r = M.isit(y, { kim: me.clientId, simdi: Date.now() });
  if (r.hata === 'erken') {
    toast(`Yumurta hâlâ sıcacık 🥚 ${M.kalanMetni(r.kalan)} sonra yine ısıtabilirsin.`);
    tepki('dokun');
    return;
  }
  if (r.hata) return;
  tepki('isit');
  sfx('pop');
  titret(20);
  yaz(r.yama, r.kayit, 'isit');
}

function eylemTikla(eylem) {
  if (!y || y.asama === 'yumurta') return;
  const r = M.eylemYap(y, { eylem, kim: me.clientId, simdi: Date.now() });
  if (r.hata === 'bekle') {
    toast(`${M.EYLEMLER[eylem].ad} için ${M.kalanMetni(r.kalan)} bekleyelim.`);
    return;
  }
  if (r.hata === 'uyuyor') {
    toast('Şşş, uyuyor 🌙 Önce uyandıralım.');
    return;
  }
  if (r.hata) return;
  tepki(eylem);
  sfx(eylem === 'uyut' ? 'tick' : 'pop');
  titret(15);
  yaz(r.yama, r.kayit, eylem);
  if (r.mesaj) toast(r.mesaj);
}

/** Sahneye dokunmak: yumurtayı ısıtır, yavruyu sever (beklemedeyse yalnız küçük bir kıpırdanma). */
function sahneDokun() {
  if (!y || y.asama === 'yumurta') {
    isitTikla();
    return;
  }
  if (M.eylemYap(y, { eylem: 'sev', kim: me.clientId, simdi: Date.now() }).hata) {
    tepki('dokun');
    return;
  }
  eylemTikla('sev');
}

async function adKaydet(e) {
  e.preventDefault();
  if (!y || y.asama === 'yumurta') return;
  const r = M.adTemizle(adGirdi.value);
  if (r.hata) {
    adGirdi.setAttribute('aria-invalid', 'true');
    toast(r.hata);
    adGirdi.focus();
    return;
  }
  adGirdi.removeAttribute('aria-invalid');
  const ilk = !y.ad;
  adDuzenle = false;
  if (r.ad === y.ad) {
    ciz();
    return;
  }
  const at = new Date().toISOString();
  const ok = await yaz({ ad: r.ad }, { eylem: 'ad', kim: me.clientId, at, deger: r.ad }, 'ad', { deger: r.ad });
  if (!ok) return;
  sfx('pop');
  tepki('sev');
  toast(ilk ? `Merhaba ${r.ad} 💛` : 'Adı değişti');
  adBtn.focus({ preventScroll: true });
}

// ---------- Tepkiler (kısa; hareket azaltmada yalnız durum değişir) ----------
const rnd = (a, b) => a + Math.random() * (b - a);

function parcalar(list, ms = 1700) {
  if (azHareket() || !list.length) return;
  parcaEl.append(...list);
  setTimeout(() => { for (const p of list) p.remove(); }, ms);
}

function tepki(tur) {
  clearTimeout(tepkiZaman);
  delete sahne.dataset.tepki;
  void sahne.offsetWidth;
  sahne.dataset.tepki = YEMEK.includes(tur) ? 'cigne' : tur;
  tepkiZaman = setTimeout(() => { delete sahne.dataset.tepki; }, 1500);
  const bit = (cls, style, kid = null, html = null) => h('span', { class: `yv-p ${cls}`, style, html }, kid);
  if (YEMEK.includes(tur)) {
    parcalar([bit('yv-p-yemek', {}, M.EYLEMLER[tur].emoji)]);
  } else if (tur === 'oyna') {
    parcalar([bit('yv-p-top', {}, '⚽')]);
  } else if (tur === 'yika') {
    parcalar(Array.from({ length: 9 }, () => bit('yv-p-kopuk', {
      '--x': `${rnd(22, 78).toFixed(1)}%`, '--s': `${Math.round(rnd(10, 26))}px`,
      '--d': `${rnd(1.1, 1.6).toFixed(2)}s`, '--gecik': `${rnd(0, 0.35).toFixed(2)}s`, '--kay': `${Math.round(rnd(-24, 24))}px`,
    })));
  } else if (tur === 'sev') {
    parcalar(Array.from({ length: 5 }, (_, i) => bit('yv-p-kalp', {
      '--x': `${(36 + i * 7 + rnd(-3, 3)).toFixed(1)}%`, '--s': `${Math.round(rnd(14, 24))}px`,
      '--d': `${rnd(1.1, 1.5).toFixed(2)}s`, '--gecik': `${(i * 0.08).toFixed(2)}s`, '--kay': `${Math.round(rnd(-18, 18))}px`,
    }, null, ICONS.heart)));
  }
}

function pirilti() {
  parcalar(Array.from({ length: 12 }, (_, i) => {
    const aci = (i / 12) * Math.PI * 2;
    return h('span', {
      class: 'yv-p yv-p-pirilti',
      style: { '--dx': `${Math.round(Math.cos(aci) * rnd(70, 110))}px`, '--dy': `${Math.round(Math.sin(aci) * rnd(60, 96))}px`, '--gecik': `${rnd(0.1, 0.3).toFixed(2)}s` },
    });
  }), 1800);
}

// ---------- Bildirim ve hatırlatıcı ----------
const BILDIRIM_KEY = `bizim.yavru.bildirim.${roomId}.${me.clientId}`;

/** Partnere anlık bildirim: o bu sayfadaysa gitmez; kişi başına 30 dk'da bir (çatlama, büyüme, ad her zaman). */
function partnerBildir(eylem, { deger = '' } = {}) {
  if (partnerGoruyor(room.partner?.(), 'yavru')) return;
  const t = Date.now();
  const son = Number(readStore('local', BILDIRIM_KEY)) || null;
  if (!M.bildirimGerekli({ son, simdi: t, eylem })) return;
  if (!['catlama', 'buyume', 'ad'].includes(eylem)) writeStore('local', BILDIRIM_KEY, String(t));
  const metin = M.bildirimMetni({ ad: benAdi(), eylem, deger, yavruAd: y?.ad });
  bildir(roomId, { tur: 'oyun', baslik: 'Yavrumuz', metin, url: 'sayfalar/yavru/' })
    .catch((e) => console.warn('[yavru] bildirim gönderilemedi', e));
}

/** Android uygulamasında yerel hatırlatıcı (acıkma, uyanma). Her ziyarette ve değişimde yeniden planlanır. */
function hatirlaticiPlanla() {
  if (!y) return;
  const olaylar = M.hatirlaticiOlaylari(y, simdi);
  const key = JSON.stringify(olaylar);
  if (key === hatKey) return;
  hatKey = key;
  Promise.resolve().then(() => yerelHatirlaticilar(olaylar, { grup: 'yavru' })).catch((e) => console.warn('[yavru] hatırlatıcı', e));
}

// ---------- Canlı ----------
// Partnerin yeni bakımı: kısa tepki (karşı ekranda değişim görünsün).
const gorulenBakim = new Set(bakim.all().map((d) => d.id));
function yeniBakimlar() {
  for (const d of bakim.all()) {
    if (gorulenBakim.has(d.id)) continue;
    gorulenBakim.add(d.id);
    const { eylem, kim, at } = d.data || {};
    if (!kim || kim === me.clientId || Date.now() - Date.parse(at) > 2 * M.DK) continue;
    if (eylem in M.EYLEMLER || eylem === 'isit') {
      tepki(eylem);
      sfx('pop');
    }
  }
}

let sonHata = 0;
const hataGoster = (err) => {
  yuklemeHatasi = true;
  if (Date.now() - sonHata < 15000) return;
  sonHata = Date.now();
  toast(err?.message || 'Bağlantı sorunu. Bakımınız kaydedilip gönderilecek.');
};
col.on('error', hataGoster);
bakim.on('error', hataGoster);
col.on('change', ciz);
bakim.on('change', () => { yeniBakimlar(); cizBakimlar(); });
profil?.on('change', ciz);
room.on('presence', (p) => { partner = p || null; cizPartner(); cizPanel(); });
adGirdi.addEventListener('input', () => adGirdi.removeAttribute('aria-invalid'));
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') ciz(); });

/** Belge yoksa ilk açan yumurtayı oluşturur. Yükleme hatasında oluşturmaz (sunucudaki belgeyi ezmesin). */
async function belgeHazirla() {
  if (col.get(M.BELGE_ID)) return;
  await col.refresh();
  if (yuklemeHatasi || col.get(M.BELGE_ID)) return;
  const veri = M.yeniYumurta({ roomId, simdi: Date.now() });
  benimDogum = veri.dogum;
  try {
    await col.put(veri, M.BELGE_ID);
  } catch (e) {
    toast(e?.message || 'Yumurta kurulamadı. Biraz sonra yeniden dene.');
  }
}

ciz();
await belgeHazirla();
ciz();
