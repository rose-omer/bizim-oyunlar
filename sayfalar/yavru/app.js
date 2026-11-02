// Yavrumuz: çiftin birlikte baktığı sanal yavru (yumurta → küçük → büyük).
// Saf mantık mantik.js'te, SVG çizimi cizim.js'te (yumurta) ve bebek.js'te (küçük, büyük); ana sayfa kartı da kullanır.
// Kişilik kisilik.js, keyifsizlik ve ilaç saglik.js, günlük ortak görev gorev.js, tuvalet tuvalet.js, jeton jeton.js,
// dokunma tepkileri dokunma.js (hepsi saf). Dokunma tepkisi geçici görsel durumdur, belgeye yazılmaz.
// Odalar (odalar.js saf, oda-cizim.js çizim): sekme + kaydırma; son oda cihaz başı (localStorage). Sürükle-bırak bakım
// (yemek ağza, sabun köpüğü, lazımlık) sonunda var olan eylemTikla yolunu çağırır. Oyun odası: mini oyunlar
// (oyunlar/cerceve.js oyunAc; jeton jeton.js jetonKazan) ve ses taklidi (taklit.js; ses cihazda işlenir, saklanmaz).
// Veri: 'yavru' türünde tek belge 'bizim' (alan düzeyinde yama), bakım günlüğü 'yavrubakim' (son 50: günlük görev sayımı; liste son 10).
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
import * as S from './saglik.js';
import * as G from './gorev.js';
import { KISILIKLER, favoriBonus } from './kisilik.js';
import { toDay } from '../../js/core/gunler.js';
import * as T from './tuvalet.js';
import * as D from './dokunma.js';
import { jetonBakiye, jetonKazan, GUNLUK_SINIR, URUNLER } from './jeton.js';
import { yavruSvg, catlamaSvg, CIZIM_CSS } from './cizim.js';
import { BEBEK_CSS } from './bebek.js';
import * as O from './odalar.js';
import { odaSvg, KUVET_SVG, LAZIMLIK_SVG, SABUN_SVG } from './oda-cizim.js';
import { OYUNLAR, oyunAc } from './oyunlar/cerceve.js';
import { taklitBaslat, taklitDestegi, mikrofonAcikMi } from './taklit.js';

const { room, roomId, me } = await bootPage({ ns: 'yavru', title: 'Yavrumuz', tab: 'daha' });
const app = document.getElementById('app');
document.head.append(h('style', { id: 'yv-cizim-stil' }, CIZIM_CSS + BEBEK_CSS));
app.replaceChildren(h('div', { class: 'yv' }, h('p', { class: 'yv-yukleniyor muted', role: 'status' }, 'Yavrunuz geliyor…')));

const [col, bakim, profil] = await Promise.all([
  openCollection(room, M.TUR),
  openCollection(room, M.BAKIM_TUR, { recent: 50 }),
  openProfil(room).catch((e) => { console.warn('[yavru] profil açılamadı', e); return null; }),
]);

const azHareket = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const bekle = (ms) => new Promise((r) => setTimeout(r, ms));
const YEMEK = ['mama', 'meyve', 'tatli'];
const BAKIM = ['oyna', 'yika', 'sev', 'uyut'];
const tanim = (eylem) => (eylem === 'ilac' ? S.ILAC : eylem === 'lazimlik' ? T.LAZIMLIK : M.EYLEMLER[eylem]);
/** Puan: keyifsizken yarım puan olabilir ("12,5"). */
const puanMetni = (n) => n.toLocaleString('tr-TR', { maximumFractionDigits: 1 });
const ASAMA_ADI = { yumurta: 'Yumurta', kucuk: 'Küçük', buyuk: 'Büyük' };
const IHTIYAC_ADI = { tokluk: 'Tokluk', mutluluk: 'Mutluluk', temizlik: 'Temizlik', enerji: 'Enerji' };
const IKON = 'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"';
const IHTIYAC_IKON = {
  tokluk: `<svg ${IKON}><path d="M3.5 11.5h17a8.5 8.5 0 0 1-17 0z"/><path d="M9.5 7.5c0-1.6 1.2-2 1.2-3.6M13.8 7.5c0-1.6 1.2-2 1.2-3.6"/></svg>`,
  mutluluk: `<svg ${IKON}><circle cx="12" cy="12" r="8.6"/><path d="M8.4 13.6a4.1 4.1 0 0 0 7.2 0"/><path d="M9.2 9.6v.2M14.8 9.6v.2" stroke-width="2.6"/></svg>`,
  temizlik: `<svg ${IKON}><path d="M12 3.6s-5.6 6.2-5.6 10.1a5.6 5.6 0 0 0 11.2 0c0-3.9-5.6-10.1-5.6-10.1z"/><path d="M9.6 14.4a2.6 2.6 0 0 0 2.2 2.2"/></svg>`,
  enerji: `<svg ${IKON}><path d="M13.2 3 5.6 13.4h6.1l-1 7.6 7.7-10.6h-6.2z"/></svg>`,
};
const TUVALET_IKON = `<svg ${IKON}><path d="M7 4.5h6.5v6"/><path d="M4.5 10.5h15a7 7 0 0 1-6.2 6.9l.7 3.1H9.5l.7-3.1a7 7 0 0 1-5.7-6.9z"/></svg>`;
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
/** Sevgilinin clientId'si: çevrimiçi, profil, bilinen; yoksa belgedeki ısıtma ve puan kayıtlarından. Bilinmiyorsa null. */
function partnerId() {
  const id = room.partner?.()?.clientId || profil?.partner()?.clientId || knownPartner(roomId)?.clientId;
  if (id && id !== me.clientId) return id;
  return [...Object.keys(y?.isitma || {}), ...Object.keys(y?.puan || {})].find((k) => k !== me.clientId) || null;
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
let kazaYazilan = null; // bu cihazın yazdığı son kaza kaydı (tuvalet.js kazaYamasi kayitId)
let dokunGecmis = []; // son dokunuş anları (dokunma.js çok dürtme)
let gecici = null; // dokunma tepkisi: { ruh, metin, animasyon, bitis } (belgeye yazılmaz)
let geciciZaman = 0;
let kisayolAnahtar = '';
// Odalar: seçim cihaz başı (belgeye yazılmaz).
const ODA_KEY = `bizim.yavru.oda.${roomId}`;
let oda = O.odaOku(readStore('local', ODA_KEY));
let oyunSecAcik = false; // Oyun odasında mini oyun listesi açık
let agizAcik = false; // sürüklenen yiyecek ağza yaklaştı: ağız açılır
let kopuk = O.kopukBaslat(); // banyo: sabun köpüğü (geçici)
let tikEngel = false; // sürükleme ya da kaydırma bitti: ardından gelen tık eylem saymasın
let taklit = null; // ses taklidi denetimi (taklit.js) | null
let taklitDurum = null;

// ---------- İskelet ----------
const cizimEl = h('span', { class: 'yv-cizim' });
const kopukEl = h('span', { class: 'yv-kopukler', 'aria-hidden': 'true' }); // banyo: biriken köpük
const kuvetEl = h('span', { class: 'yv-kuvet', 'aria-hidden': 'true' }); // banyo: küvetin ön yüzü (bebeğin üstünde)
const dokunBtn = h('button', { type: 'button', class: 'yv-dokun', onclick: sahneDokun }, cizimEl, kopukEl, kuvetEl);
// Dokunma kısayolları: klavye ve ekran okuyucu için; görünmez, odaklanınca sahnenin üstünde görünür.
const kisayolEl = h('div', { class: 'yv-kisayol', role: 'group', 'aria-label': 'Dokun', hidden: true });
const parcaEl = h('div', { class: 'yv-parca', 'aria-hidden': 'true' });
const sozEl = h('p', { class: 'yv-soz', 'aria-live': 'polite' });
const buradaEl = h('span', { class: 'yv-burada', hidden: true });
// Oda sahnesi: arka plan (en altta) ve sürüklenen eşyalar. Eşyalar yalnız işaretçi içindir; aynı eylemler düğmelerde.
const odaZeminEl = h('span', { class: 'yv-oda-zemin', 'aria-hidden': 'true' });
const lazimlikEl = h('span', { class: 'yv-lazimlik', 'aria-hidden': 'true', html: LAZIMLIK_SVG, hidden: true, onclick: () => eylemTikla('lazimlik') });
const sabunEl = h('span', { class: 'yv-sabun', 'aria-hidden': 'true', html: SABUN_SVG, hidden: true });
const dusBtn = h('button', { type: 'button', class: 'btn primary yv-dus', hidden: true, onclick: durula },
  h('span', { 'aria-hidden': 'true' }, '🚿'), 'Durula');
const mikEl = h('span', { class: 'yv-mik', hidden: true }, 'Mikrofon açık');
const sahne = h('section', { class: 'yv-sahne', 'aria-label': 'Yavrumuz' },
  odaZeminEl, h('span', { class: 'yv-gok', 'aria-hidden': 'true' }), buradaEl, mikEl, lazimlikEl, dokunBtn, sabunEl, dusBtn,
  kisayolEl, parcaEl, sozEl);

// Oda sekmeleri: otomatik etkinleşen sekme listesi (oklar, Home, End); sekme paneli odanın eylem düğmeleri.
const odaSekme = {};
const odaSekmeEl = h('div', { class: 'yv-odalar', role: 'tablist', 'aria-label': 'Odalar', hidden: true, onkeydown: sekmeTus },
  O.ODALAR.map((o) => {
    const nokta = h('span', { class: 'yv-oda-nokta', 'aria-hidden': 'true', hidden: true });
    const btn = h('button', {
      type: 'button', role: 'tab', id: `yv-oda-${o.id}`, class: 'yv-oda-sekme', 'aria-controls': 'yv-oda-panel',
      dataset: { oda: o.id }, onclick: () => odaSec(o.id),
    }, h('span', { class: 'yv-oda-emoji', 'aria-hidden': 'true' }, o.emoji), h('span', { class: 'yv-oda-ad' }, o.kisa), nokta);
    odaSekme[o.id] = { btn, nokta };
    return btn;
  }));

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
// Tuvalet: dört ihtiyaçtan ayrı satır (çubuk sıkışıklığı gösterir; dolu = çişi var).
const tuvaletDeger = h('span', { class: 'yv-ihtiyac-deger' });
const tuvaletDolu = h('span', { class: 'yv-cubuk-dolu' });
const tuvaletCubuk = h('span', {
  class: 'yv-cubuk', role: 'meter', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-labelledby': 'yv-ih-tuvalet',
}, tuvaletDolu);
const tuvaletEl = h('div', { class: 'yv-ihtiyac yv-tuvalet' },
  h('div', { class: 'yv-ihtiyac-bas' },
    h('span', { class: 'yv-ihtiyac-ikon', html: TUVALET_IKON }),
    h('span', { class: 'yv-ihtiyac-ad', id: 'yv-ih-tuvalet' }, 'Tuvalet'),
    tuvaletDeger),
  tuvaletCubuk);
ihtiyacEl.append(tuvaletEl);

/** Eylem düğmesi: kalıcı öğe (odak yeniden çizimde kaybolmasın); içerik ciz() ile güncellenir. */
function eylemDugmesi(eylem) {
  const emoji = h('span', { class: 'yv-eylem-emoji', 'aria-hidden': 'true' });
  const ad = h('span', { class: 'yv-eylem-ad' });
  const fav = h('span', { class: 'yv-eylem-favori', 'aria-hidden': 'true', hidden: true }, '💛');
  const btn = h('button', { type: 'button', class: 'yv-eylem', dataset: { eylem }, onclick: () => eylemTikla(btn.dataset.eylem) }, emoji, ad, fav);
  return { btn, emoji, ad, fav };
}
const dugmeler = [...YEMEK, 'lazimlik', ...BAKIM].map(eylemDugmesi);
const ilacDugme = eylemDugmesi('ilac'); // yalnız keyifsizken görünür (her odada)
const ilacGrup = h('div', { class: 'yv-eylem-grup ilac', role: 'group', 'aria-label': 'Sağlık', hidden: true }, ilacDugme.btn);
/** Oyun odasının ek düğmeleri (bakım eylemi değil): aynı görünüm, kendi işleyicisi. */
function ekDugme(ad, emojiMetni, adMetni, onclick) {
  const emoji = h('span', { class: 'yv-eylem-emoji', 'aria-hidden': 'true' }, emojiMetni);
  const yazi = h('span', { class: 'yv-eylem-ad' }, adMetni);
  const btn = h('button', { type: 'button', class: 'yv-eylem', dataset: { ek: ad }, onclick }, emoji, yazi);
  return { btn, emoji, ad: yazi };
}
const oyunlarDugme = ekDugme('oyunlar', '🎮', 'Oyunlar', () => { oyunSecAcik = true; cizPanel(); oyunSecEl.querySelector('button')?.focus({ preventScroll: true }); });
const konusDugme = ekDugme('konus', '🎤', 'Konuş', konusTikla);
const magazaDugme = ekDugme('magaza', '🛍️', 'Mağaza', () => magazaAc());
const odaGrup = h('div', { class: 'yv-eylem-grup yv-oda-grup', id: 'yv-oda-panel', role: 'tabpanel' },
  dugmeler.map((d) => d.btn), oyunlarDugme.btn, konusDugme.btn, magazaDugme.btn);
const ipucuEl = h('p', { class: 'yv-oda-ipucu' });
const OYUN_EMOJI = { balon: '🎈', top: '🧺', cee: '🙈', ninni: '⭐' };
const oyunGeri = h('button', { type: 'button', class: 'btn ghost small yv-oyun-geri', onclick: () => { oyunSecAcik = false; cizPanel(); oyunlarDugme.btn.focus({ preventScroll: true }); } }, 'Geri');
const oyunSecEl = h('div', { class: 'yv-oyun-sec', role: 'group', 'aria-label': 'Mini oyunlar', hidden: true },
  h('div', { class: 'yv-oyun-liste' }, Object.entries(OYUNLAR).map(([id, o]) => h('button', {
    type: 'button', class: 'yv-oyun', dataset: { oyun: id }, onclick: (e) => oyunBaslat(id, e.currentTarget),
  }, h('span', { class: 'yv-oyun-emoji', 'aria-hidden': 'true' }, OYUN_EMOJI[id] || '🎲'),
  h('span', { class: 'yv-oyun-govde' }, h('b', {}, o.ad), h('span', {}, o.ozet))))),
  oyunGeri);
const eylemlerEl = h('div', { class: 'yv-eylemler' }, ilacGrup, ipucuEl, odaGrup, oyunSecEl);

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

const gorevEmoji = h('span', { class: 'yv-gorev-emoji', 'aria-hidden': 'true' });
const gorevMetin = h('p', { class: 'yv-gorev-metin' });
const gorevSayi = h('span', { class: 'yv-gorev-sayi' });
const gorevDolu = h('span', { class: 'yv-cubuk-dolu' });
const gorevCubuk = h('span', { class: 'yv-cubuk', role: 'meter', 'aria-valuemin': '0', 'aria-labelledby': 'yv-gorev-baslik' }, gorevDolu);
const gorevDurum = h('p', { class: 'yv-gorev-durum' });
const gorevSec = h('section', { class: 'yv-gorev', 'aria-labelledby': 'yv-gorev-baslik', hidden: true },
  h('div', { class: 'yv-gorev-bas' }, gorevEmoji,
    h('div', { class: 'yv-gorev-govde' }, h('h2', { class: 'yv-gorev-baslik', id: 'yv-gorev-baslik' }, 'Günün görevi'), gorevMetin),
    gorevSayi),
  gorevCubuk, gorevDurum);

const kok = h('div', { class: 'yv' }, odaSekmeEl, sahne, bilgi, ihtiyacEl, gorevSec, panel, bakimSec);
app.replaceChildren(kok);

// ---------- Çizim ----------
function cizSahne() {
  const gercekRuh = M.ruhHali(y, simdi);
  // Dokunma tepkisi yalnız uyanık bebekte ve süresince (yumurtada ruhHali 'yumurta').
  const uyanik = !['yumurta', 'uyuyor'].includes(gercekRuh);
  const tepkide = !!gecici && simdi < gecici.bitis && uyanik;
  // Öncelik: dinlerken dikkat kesilir, yiyecek ağza yaklaşınca ağız açılır, sonra dokunma tepkisi.
  const dinliyor = uyanik && !!taklit && taklitDurum !== 'tekrar';
  const ruh = dinliyor ? 'sasirma' : uyanik && agizAcik ? 'mutlu' : tepkide ? gecici.ruh : gercekRuh;
  const asama = y?.asama || 'yumurta';
  const renk = y?.renk || M.renkSec(roomId);
  const kisilik = y?.kisilik || '';
  const hazir = asama === 'yumurta' && !!y && M.catlamaHazir(y, simdi);
  const anahtar = `${asama}|${ruh}|${renk}|${hazir}|${kisilik}`;
  if (anahtar !== svgAnahtar) {
    svgAnahtar = anahtar;
    cizimEl.innerHTML = yavruSvg({ asama, ruh, renk, hazir, kisilik });
  }
  if (!tepkide) delete sahne.dataset.dokunma;
  cizKisayol(gercekRuh === 'yumurta' || gercekRuh === 'uyuyor' ? '' : asama);
  kok.style.setProperty('--yv-govde', `var(--yv-r${renk})`);
  sahne.dataset.asama = asama;
  const uyuyor = ruh === 'uyuyor';
  sahne.toggleAttribute('data-gece', uyuyor);
  dokunBtn.setAttribute('aria-label', asama === 'yumurta' ? 'Yumurtayı ısıt' : `${y?.ad || 'Yavrunuzu'} sev`);
  const keyifsiz = S.keyifsizMi(y, simdi);
  const tuvalet = T.tuvaletDurumu(y, simdi);
  let soz = (uyanik && odaSozu()) || (tepkide ? gecici.metin : M.durumMetni(y, simdi, keyifsiz, tuvalet));
  if (uyuyor) {
    const kalan = M.kalanMetni(Date.parse(y.uyku.bit) - simdi);
    if (kalan) soz += ` · ${kalan}`;
  }
  if (sozEl.textContent !== soz) sozEl.textContent = soz;
  const ihtiyac = keyifsiz || tuvalet?.cisVar || tuvalet?.yeniKaza || M.ozledi(y, simdi) || ['ac', 'kirli', 'uykulu', 'uzgun', 'aglama'].includes(ruh);
  sozEl.dataset.ton = asama !== 'yumurta' && ihtiyac ? 'ihtiyac' : '';
}

/** Bölge kısayolları (aşama değişince yeniden kurulur). asama '' = gizli (yumurta, uyku). */
function cizKisayol(asama) {
  if (asama === kisayolAnahtar) return;
  const odakIcerde = kisayolEl.contains(document.activeElement);
  kisayolAnahtar = asama;
  const bolgeler = D.bolgeler(asama);
  kisayolEl.hidden = !bolgeler.length;
  kisayolEl.replaceChildren(...bolgeler.map((b) => h('button', { type: 'button', class: 'yv-kisayol-btn', onclick: () => dokun(b) }, D.BOLGE_ADI[b])));
  if (odakIcerde) (kisayolEl.querySelector('button') || dokunBtn).focus({ preventScroll: true });
}

// ---------- Odalar ----------
const TAKLIT_SOZ = { dinliyor: 'Dinliyorum… bir şey söyle 👂', konusuyor: 'Duyuyorum…', tekrar: 'Seni taklit ediyor 🎶' };

/** Odaya özgü geçici söz (ses taklidi, banyo köpüğü); yoksa ''. Köpük yüzdesi onluk adımla (ekran okuyucu boğulmasın). */
function odaSozu() {
  if (taklit && TAKLIT_SOZ[taklitDurum]) return TAKLIT_SOZ[taklitDurum];
  if (oda === 'banyo' && kopuk.yol > 0) {
    return O.kopukTamam(kopuk) ? 'Köpük tamam! Şimdi durulayalım 🚿' : `Köpürüyor… %${Math.floor(O.kopukOrani(kopuk) * 10) * 10}`;
  }
  return '';
}

/** Sekmeler, ihtiyaç noktaları, oda arka planı ve sahne eşyaları. Yumurtada oda yok. */
function cizOda() {
  const yavru = !!y && y.asama !== 'yumurta';
  odaSekmeEl.hidden = !yavru;
  if (!yavru) {
    delete sahne.dataset.oda;
    odaZeminEl.replaceChildren();
    kuvetEl.replaceChildren();
    lazimlikEl.hidden = true;
    sabunEl.hidden = true;
    dusBtn.hidden = true;
    return;
  }
  if (sahne.dataset.oda !== oda) {
    sahne.dataset.oda = oda;
    odaZeminEl.innerHTML = odaSvg(oda);
    kuvetEl.innerHTML = oda === 'banyo' ? KUVET_SVG : '';
  }
  const uyuyor = M.uyuyorMu(y.uyku, simdi);
  const noktalar = O.odaNoktalari({ ihtiyac: M.ihtiyaclar(y, simdi), cisVar: !!T.tuvaletDurumu(y, simdi)?.cisVar, uyuyor });
  for (const o of O.ODALAR) {
    const { btn, nokta } = odaSekme[o.id];
    const secili = o.id === oda;
    btn.setAttribute('aria-selected', String(secili));
    btn.tabIndex = secili ? 0 : -1;
    nokta.hidden = !noktalar.includes(o.id);
    btn.setAttribute('aria-label', nokta.hidden ? o.ad : `${o.ad}, ihtiyacı var`);
  }
  odaGrup.setAttribute('aria-labelledby', `yv-oda-${oda}`);
  lazimlikEl.hidden = oda !== 'tuvalet';
  sabunEl.hidden = oda !== 'banyo' || uyuyor;
  dusBtn.hidden = oda !== 'banyo' || uyuyor || !O.kopukTamam(kopuk);
}

/** Oda değiştir: seçim cihazda kalır; yarım köpük ve dinleme biter. */
function odaSec(yeni, { odak = false } = {}) {
  yeni = O.odaOku(yeni);
  if (yeni !== oda) {
    const yon = O.ODA_IDLERI.indexOf(yeni) > O.ODA_IDLERI.indexOf(oda) ? 'ileri' : 'geri';
    oda = yeni;
    writeStore('local', ODA_KEY, oda);
    oyunSecAcik = false;
    kopukSifirla();
    taklit?.durdur();
    delete sahne.dataset.gecis;
    void sahne.offsetWidth; // geçişi baştan başlat
    sahne.dataset.gecis = yon;
    simdi = Date.now();
    cizOda();
    cizSahne();
    cizPanel();
  }
  if (odak) odaSekme[oda].btn.focus({ preventScroll: true });
}

function sekmeTus(e) {
  const i = O.ODA_IDLERI.indexOf(oda);
  const hedef = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: O.ODA_IDLERI.length - 1 }[e.key];
  if (hedef == null) return;
  e.preventDefault();
  odaSec(O.ODA_IDLERI[(hedef + O.ODA_IDLERI.length) % O.ODA_IDLERI.length], { odak: true });
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
  const kisilik = !yumurta && Object.hasOwn(KISILIKLER, y.kisilik ?? '') ? KISILIKLER[y.kisilik] : null;
  metaEl.replaceChildren(
    M.dogumGunuMu(y, simdi)
      ? h('span', { style: { color: 'var(--accent-strong)' } }, M.DOGUM_GUNU_METNI)
      : h('span', {}, y ? M.yasMetni(y, simdi) : 'Yeni yumurta'),
    h('span', { class: 'chip yv-asama' }, ASAMA_ADI[y?.asama || 'yumurta']),
    ...(kisilik ? [h('span', { class: 'chip yv-kisilik', title: kisilik.aciklama },
      h('span', { 'aria-hidden': 'true' }, kisilik.emoji), kisilik.ad,
      h('span', { class: 'sr-only' }, `: ${kisilik.aciklama}`))] : []),
    // Ortak jeton bakiyesi (mağaza sonra); eşzamanlı harcamada kısa süre eksi olabilir, 0 gösterilir.
    ...(y ? [h('span', { class: 'chip yv-jeton', title: 'Ortak jeton' },
      h('span', { 'aria-hidden': 'true' }, '🪙'), h('span', { class: 'sr-only' }, 'Ortak jeton: '),
      String(Math.max(0, jetonBakiye(y))))] : []));

  let buyume = '';
  if (y?.asama === 'kucuk') {
    const b = M.buyumeDurumu(y, simdi);
    const benP = y.puan[me.clientId] || 0;
    const oP = b.kisiler.find((k) => k.id !== me.clientId)?.puan || 0;
    if (b.kalanGun > 0 || b.toplam < b.gerekToplam) {
      buyume = `Büyümesine ${b.kalanGun > 0 ? `${b.kalanGun} gün · ` : ''}${puanMetni(Math.min(b.toplam, b.gerekToplam))}/${b.gerekToplam} bakım`;
    } else {
      buyume = `İkinizin de en az ${b.gerekKisi} bakımı olunca büyür`;
    }
    buyume += ` (sen ${puanMetni(benP)}, ${partnerAdi()} ${puanMetni(oP)})`;
  } else if (y?.asama === 'buyuk') {
    buyume = `Birlikte ${puanMetni(M.buyumeDurumu(y, simdi).toplam)} bakım`;
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
  const t = T.tuvaletDurumu(y, simdi);
  const v = Math.round(t.deger);
  const metin = t.cisVar ? (t.kalan ? `Çişi var · ${M.kalanMetni(t.kalan)}` : 'Çişi var') : 'Rahat';
  tuvaletDeger.textContent = metin;
  tuvaletDolu.style.width = `${v}%`;
  tuvaletCubuk.setAttribute('aria-valuenow', String(v));
  tuvaletCubuk.setAttribute('aria-valuetext', t.cisVar ? `Çişi var${t.kalan ? `, ${M.kalanMetni(t.kalan)} içinde lazımlığa` : ''}` : 'Rahat');
  tuvaletEl.toggleAttribute('data-dusuk', t.cisVar);
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
  ilacGrup.hidden = !S.keyifsizMi(y, simdi);
  for (const d of [...dugmeler, ilacDugme]) {
    const eylem = d.btn.dataset.eylem === 'uyut' || d.btn.dataset.eylem === 'uyandir' ? (uyuyor ? 'uyandir' : 'uyut') : d.btn.dataset.eylem;
    const e = tanim(eylem);
    d.btn.dataset.eylem = eylem;
    d.emoji.textContent = e.emoji;
    const kalan = eylem === 'ilac' ? S.ilacKalan(y, me.clientId, simdi)
      : eylem === 'lazimlik' ? T.lazimlikKalan(y, me.clientId, simdi) : M.kalanBekleme(y, me.clientId, eylem, simdi);
    const kapali = uyuyor && eylem !== 'sev' && eylem !== 'uyandir';
    const favori = favoriBonus(y.kisilik, eylem) > 0;
    const ad = favori ? `${e.ad} (en sevdiği)` : e.ad;
    d.fav.hidden = !favori;
    if (kapali) {
      d.btn.dataset.durum = 'uyku';
      d.ad.textContent = e.ad;
      d.btn.setAttribute('aria-disabled', 'true');
      d.btn.setAttribute('aria-label', `${ad} (uyuyor)`);
    } else if (kalan > 0) {
      d.btn.dataset.durum = 'bekle';
      d.ad.textContent = M.kalanMetni(kalan);
      d.btn.setAttribute('aria-disabled', 'true');
      d.btn.setAttribute('aria-label', `${ad}: ${M.kalanMetni(kalan)} sonra`);
    } else {
      delete d.btn.dataset.durum;
      d.ad.textContent = e.ad;
      d.btn.removeAttribute('aria-disabled');
      if (favori) d.btn.setAttribute('aria-label', ad);
      else d.btn.removeAttribute('aria-label');
    }
  }
  // Oda: yalnız bu odanın düğmeleri; Oyun odasında ek düğmeler ya da mini oyun listesi.
  const odaT = O.odaTanimi(oda);
  let sutun = 0;
  for (const d of dugmeler) {
    d.btn.hidden = !odaT.eylemler.includes(d.btn.dataset.eylem === 'uyandir' ? 'uyut' : d.btn.dataset.eylem);
    if (!d.btn.hidden) sutun++;
  }
  const oyunOdasi = oda === 'oyun';
  for (const d of [oyunlarDugme, konusDugme, magazaDugme]) d.btn.hidden = !oyunOdasi;
  if (oyunOdasi) sutun += 3;
  for (const d of [oyunlarDugme, konusDugme]) {
    if (uyuyor) {
      d.btn.dataset.durum = 'uyku';
      d.btn.setAttribute('aria-disabled', 'true');
    } else {
      delete d.btn.dataset.durum;
      d.btn.removeAttribute('aria-disabled');
    }
  }
  konusDugme.emoji.textContent = taklit ? '⏹️' : '🎤';
  konusDugme.ad.textContent = taklit ? 'Bitir' : 'Konuş';
  konusDugme.btn.setAttribute('aria-pressed', String(!!taklit));
  konusDugme.btn.setAttribute('aria-label', uyuyor ? 'Konuş (uyuyor)' : taklit ? 'Konuşmayı bitir' : 'Konuş: yavru seni taklit etsin');
  oyunlarDugme.btn.setAttribute('aria-label', uyuyor ? 'Mini oyunlar (uyuyor)' : 'Mini oyunlar');
  const liste = oyunOdasi && oyunSecAcik && !uyuyor;
  odaGrup.hidden = liste;
  oyunSecEl.hidden = !liste;
  odaGrup.style.setProperty('--sutun', String(Math.max(1, sutun)));
  ipucuEl.textContent = uyuyor ? '' : odaT.ipucu;
  ipucuEl.hidden = !ipucuEl.textContent || liste;
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
      h('span', { class: 'yv-bakim-metin' }, M.bakimSatiri({
        eylem, ad: kim === me.clientId ? 'Sen' : kisiAdi(kim), deger, urun: eylem === 'satinal' && Object.hasOwn(URUNLER, deger ?? '') ? URUNLER[deger] : null,
      })),
      h('time', { class: 'yv-bakim-zaman', datetime: at || '' }, zaman));
  }));
  bakimListe.hidden = !docs.length;
  bakimBos.hidden = !!docs.length;
  bakimBos.textContent = !y || y.asama === 'yumurta'
    ? 'Henüz bakım yok. Yumurtayı ısıtarak başlayalım mı?'
    : 'Henüz bakım yok. İlk ilgiyi siz gösterin 💛';
}

// ---------- Günün görevi: iki kişinin bugünkü bakımları; tamamlanınca ikisine +2 puan (bir kez) ----------
let gorevOdulGun = null; // bu cihazın ödül yazdığı gün (yazım sürerken yinelenmesin)

function cizGorev() {
  const pid = partnerId();
  const gun = toDay(new Date(simdi));
  const oz = y ? G.gorevOzeti(y, { roomId, gun, kayitlar: bakim.all(), kisiler: [me.clientId, pid].filter(Boolean) }) : null;
  gorevSec.hidden = !oz;
  if (!oz) return;
  const { gorev, tamam, odullendi, kisiBasi, ilerleme: { n, gerek } } = oz;
  const bitti = tamam || odullendi;
  gorevEmoji.textContent = gorev.emoji;
  gorevMetin.textContent = gorev.metin;
  gorevSec.dataset.tamam = String(bitti);
  const goster = bitti ? gerek : n;
  gorevSayi.textContent = `${goster}/${gerek}`;
  gorevDolu.style.width = `${Math.round((goster / gerek) * 100)}%`;
  gorevCubuk.setAttribute('aria-valuemax', String(gerek));
  gorevCubuk.setAttribute('aria-valuenow', String(goster));
  gorevCubuk.setAttribute('aria-valuetext', `${goster}/${gerek}`);
  if (!pid) {
    gorevDurum.textContent = 'Sevgilin katılınca başlar 💛';
  } else if (bitti) {
    gorevDurum.textContent = `Tamamlandı! İkiniz de +${G.GOREV_BONUS} puan kazandınız ✨`;
  } else {
    // herkes: kişi başı "1/3"; toplam ve ayri: katkı var mı.
    const adet = gorev.kosul.tur === 'herkes' ? gorev.kosul.adet : 0;
    const kisi = (id) => {
      const k = kisiBasi[id] || 0;
      const ok = adet ? k >= adet : k > 0;
      return h('span', { class: 'yv-gorev-kisi', dataset: { tamam: String(ok) } },
        `${id === me.clientId ? 'Sen' : kisiAdi(id)} `, h('strong', {}, adet ? `${Math.min(k, adet)}/${adet}` : ok ? '✓' : 'bekliyor'));
    };
    gorevDurum.replaceChildren(kisi(me.clientId), ' · ', kisi(pid));
  }
  if (tamam && !odullendi && pid && gorevOdulGun !== gun) gorevOdul(gun, pid, gorev.id);
}

/** Ödül yaması mutlak puanla yazılır: iki cihaz aynı anda yazsa da bonus bir kez (gorev.js odulYamasi). */
async function gorevOdul(gun, pid, gorevId) {
  const yama = G.odulYamasi(y, gun, [me.clientId, pid], { gorevId, simdi: Date.now() });
  if (!yama) return;
  gorevOdulGun = gun;
  try {
    await col.patch(M.BELGE_ID, yama);
  } catch (e) {
    gorevOdulGun = null;
    console.warn('[yavru] görev ödülü yazılamadı', e);
    return;
  }
  sfx('win');
  toast(`Günün görevi tamam! İkinize +${G.GOREV_BONUS} puan 💛`);
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
  if (taklit && y && M.uyuyorMu(y.uyku, simdi)) taklit.durdur(); // uyurken taklit yok
  cizOda();
  cizSahne();
  cizBilgi();
  cizIhtiyac();
  cizGorev();
  cizPanel();
  cizBakimlar();
  cizPartner();
  gecisler();
  hatirlaticiPlanla();
  zamanla();
  kazaYaz();
}

/**
 * Olmuş kazayı belgeye yazar (açılışta ve her çizimde). Yama mutlak, kayıt id'si 'kaza-<ms>': iki cihaz
 * aynı anda yazsa da kaza bir kez uygulanır, günlükte tek satır kalır. Sonda: iyimser yazım yeniden çizdirir.
 */
function kazaYaz() {
  if (!y || y.asama === 'yumurta') return;
  const r = T.kazaYamasi(y, { kim: me.clientId, simdi });
  if (!r || r.kayitId === kazaYazilan) return;
  kazaYazilan = r.kayitId;
  col.patch(M.BELGE_ID, r.yama).catch((e) => {
    kazaYazilan = null;
    console.warn('[yavru] kaza yazılamadı', e);
  });
  bakim.put(r.kayit, r.kayitId).catch(() => {});
}

/** Sonraki yeniden hesap: en geç 1 dk; bir bekleme ya da dakika metni daha önce değişiyorsa o an. */
function zamanla() {
  clearTimeout(sonrakiZaman);
  let ms = M.DK;
  if (y && y.asama !== 'yumurta') {
    const kalanlar = [...Object.keys(M.EYLEMLER).map((e) => M.kalanBekleme(y, me.clientId, e, simdi)), S.ilacKalan(y, me.clientId, simdi),
      T.lazimlikKalan(y, me.clientId, simdi)];
    for (const k of kalanlar) if (k > 0) ms = Math.min(ms, k % M.DK || M.DK);
    const kaza = T.tuvaletDurumu(y, simdi)?.kazaAn;
    if (kaza > simdi) ms = Math.min(ms, kaza - simdi);
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

/** Bakım ve ilaç aynı yoldan: yama + bakım kaydı + partner bildirimi (yaz). Keyifsizken bakım yarım puan. */
function eylemTikla(eylem) {
  if (!y || y.asama === 'yumurta') return;
  const t = Date.now();
  const puanArtis = S.puanArtisi(y, t);
  const r = eylem === 'ilac' ? S.ilacEylemi(y, { kim: me.clientId, simdi: t })
    : eylem === 'lazimlik' ? T.lazimlikEylemi(y, { kim: me.clientId, simdi: t, puanArtis })
      : M.eylemYap(y, { eylem, kim: me.clientId, simdi: t, puanArtis });
  if (r.hata === 'bekle') {
    toast(`${tanim(eylem).ad} için ${M.kalanMetni(r.kalan)} bekleyelim.`);
    return;
  }
  if (r.hata === 'uyuyor') {
    toast('Şşş, uyuyor 🌙 Önce uyandıralım.');
    return;
  }
  if (r.hata === 'iyi') {
    toast('Keyfi yerine gelmiş bile 😊');
    ciz();
    return;
  }
  if (r.hata) return;
  // Yemek sıkışıklığı artırır; uyut/uyandır uyku aralığı değişmeden önce sabitler (tuvalet.js; yamanın arkasına).
  const tuvaletli = YEMEK.includes(eylem) || eylem === 'uyut' || eylem === 'uyandir';
  const yama = tuvaletli ? { ...r.yama, ...T.tuvaletYamasi(y, { simdi: t, artis: T.YEMEK_ARTIS[eylem] || 0 }) } : r.yama;
  tepki(eylem === 'ilac' ? 'dokun' : eylem);
  sfx(eylem === 'uyut' ? 'tick' : 'pop');
  titret(15);
  yaz(yama, r.kayit, eylem);
  if (r.mesaj) toast(r.mesaj);
}

/**
 * Sahneye dokunmak: yumurtayı ısıtır. Uyanık bebekte dokunulan bölgeye göre tepki (dokunma.js); klavyeyle
 * (konumsuz tık) başı okşar. Uyurken eskisi gibi sever (beklemedeyse yalnız küçük bir kıpırdanma).
 */
function sahneDokun(e) {
  if (!y || y.asama === 'yumurta') {
    isitTikla();
    return;
  }
  if (M.uyuyorMu(y.uyku, Date.now())) {
    if (!sevDene()) tepki('dokun');
    return;
  }
  const svg = cizimEl.querySelector('svg');
  let bolge = 'bas';
  if (e?.detail > 0 && svg) {
    const k = svg.getBoundingClientRect();
    bolge = D.bolgeBul(((e.clientX - k.left) / k.width) * 200, ((e.clientY - k.top) / k.height) * 200, y.asama);
  }
  dokun(bolge);
}

/** Sev eylemini dener (bekleme ve günlük puan sınırı eylemYap'ta). Bekliyorsa sessizce false. */
function sevDene() {
  if (M.eylemYap(y, { eylem: 'sev', kim: me.clientId, simdi: Date.now() }).hata) return false;
  eylemTikla('sev');
  return true;
}

/** Bölgeye dokunuş: geçici ifade + kısa hareket; baş ve karın sev'i de dener. Bölge yoksa küçük kıpırdanma. */
function dokun(bolge) {
  if (!y || y.asama === 'yumurta' || M.uyuyorMu(y.uyku, Date.now())) return;
  const t = Date.now();
  const r = D.tepki(bolge, dokunGecmis, t);
  dokunGecmis = D.gecmisEkle(dokunGecmis, t);
  if (!r) {
    tepki('dokun');
    return;
  }
  gecici = { ruh: r.ruh, metin: r.metin, animasyon: r.animasyon, bitis: t + r.sure };
  clearTimeout(geciciZaman);
  geciciZaman = setTimeout(() => {
    gecici = null;
    simdi = Date.now();
    cizSahne();
  }, r.sure);
  delete sahne.dataset.dokunma;
  void sahne.offsetWidth; // aynı hareketi baştan başlat
  sahne.dataset.dokunma = r.animasyon;
  simdi = t;
  cizSahne();
  if (!(r.sev && sevDene())) titret(r.ruh === 'aglama' ? [25, 60, 25] : 12);
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

// ---------- Sürükle-bırak bakım (pointer events: dokunmatik ve fare) ----------
// Düğmeye tek dokunuş ve klavye eskisi gibi çalışır; sürükleme yalnız ek yoldur ve sonunda eylemTikla'yı çağırır.

/**
 * el üzerinde basılı tutup sürükleme. Eşik altı hareket dokunuştur (tık yolu aynen çalışır).
 * basla(x0, y0) false dönerse sürükleme olmaz; hareket(x, y, x0, y0); birak(x, y); iptal().
 * Sürükleme bitince ardından gelen tık yutulur (tikYut).
 */
function surukle(el, { basla, hareket, birak, iptal = () => {} }) {
  el.addEventListener('pointerdown', (e) => {
    if (!e.isPrimary || e.button > 0) return;
    const { pointerId: id, clientX: x0, clientY: y0 } = e;
    let aktif = false;
    const son = () => {
      removeEventListener('pointermove', tasi);
      removeEventListener('pointerup', bitir);
      removeEventListener('pointercancel', vazgec);
    };
    function tasi(ev) {
      if (ev.pointerId !== id) return;
      if (!aktif) {
        if (!O.surukleBasladi(ev.clientX - x0, ev.clientY - y0)) return;
        if (basla(x0, y0) === false) { son(); return; }
        aktif = true;
      }
      ev.preventDefault();
      hareket(ev.clientX, ev.clientY, x0, y0);
    }
    function bitir(ev) {
      if (ev.pointerId !== id) return;
      son();
      if (!aktif) return;
      tikYut();
      birak(ev.clientX, ev.clientY);
    }
    function vazgec(ev) {
      if (ev.pointerId !== id) return;
      son();
      if (aktif) iptal();
    }
    addEventListener('pointermove', tasi, { passive: false });
    addEventListener('pointerup', bitir);
    addEventListener('pointercancel', vazgec);
  });
}
/** Sürükleme ya da kaydırmadan sonra gelen tek tık eylem saymasın (tık gelmezse kısa sürede kalkar). */
function tikYut() {
  tikEngel = true;
  setTimeout(() => { tikEngel = false; }, 80);
}
document.addEventListener('click', (e) => {
  if (!tikEngel) return;
  tikEngel = false;
  e.preventDefault();
  e.stopPropagation();
}, true);

/** İstemci noktası → bebek viewBox'ı (odalar.js vbNokta). */
const bebekNokta = (x, yy) => O.vbNokta(x, yy, cizimEl.querySelector('svg')?.getBoundingClientRect());
/** Bebek var ve uyanık (yumurta ya da uykuda sürükleme yok). */
const uyanikYavru = () => !!y && y.asama !== 'yumurta' && !M.uyuyorMu(y.uyku, Date.now());

// Mutfak: yiyecek düğmesini ağza sürükle. Ağza yaklaşınca ağız açılır; bırakınca yutulur, sonra eylemTikla.
function agizAyarla(acik) {
  if (acik === agizAcik) return;
  agizAcik = acik;
  simdi = Date.now();
  cizSahne();
}
for (const d of dugmeler.filter((x) => YEMEK.includes(x.btn.dataset.eylem))) {
  const eylem = d.btn.dataset.eylem;
  let hayalet = null;
  const temizle = () => {
    delete d.btn.dataset.suruklenen;
    const el = hayalet;
    hayalet = null;
    return el;
  };
  surukle(d.btn, {
    basla: () => {
      // Beklemede ya da uykuda sürükleme yok; nedeni eylemTikla söyler.
      if (d.btn.getAttribute('aria-disabled') === 'true') { eylemTikla(eylem); return false; }
      hayalet = h('span', { class: 'yv-hayalet', 'aria-hidden': 'true' }, tanim(eylem).emoji);
      document.body.append(hayalet);
      d.btn.dataset.suruklenen = '';
      return true;
    },
    hareket: (x, yy) => {
      hayalet.style.translate = `${x}px ${yy}px`;
      agizAyarla(O.agizYakin(bebekNokta(x, yy), y?.asama));
    },
    birak: (x, yy) => {
      const el = temizle();
      const isabet = O.agizIsabet(bebekNokta(x, yy), y?.asama);
      el.classList.add(isabet ? 'yutuldu' : 'dustu');
      setTimeout(() => el.remove(), azHareket() ? 0 : 240);
      if (!isabet) { agizAyarla(false); return; }
      setTimeout(() => { agizAyarla(false); eylemTikla(eylem); }, azHareket() ? 0 : 180);
    },
    iptal: () => {
      temizle()?.remove();
      agizAyarla(false);
    },
  });
}

// Banyo: sabunu bebeğin üstünde gezdir → köpük birikir; tamamlanınca Durula → var olan 'yika'.
function kopukSifirla() {
  kopuk = O.kopukBaslat();
  kopukEl.replaceChildren();
  delete sahne.dataset.dus;
}
function kabarcikEkle(n) {
  const sinir = (v) => Math.min(190, Math.max(10, v));
  kopukEl.append(h('span', {
    class: 'yv-kabarcik',
    style: {
      left: `${(sinir(n.x + rnd(-14, 14)) / 2).toFixed(1)}%`,
      top: `${(sinir(n.y + rnd(-12, 12)) / 2).toFixed(1)}%`,
      '--s': `${Math.round(rnd(12, 26))}px`,
    },
  }));
}
let sabunda = false;
function sabunBirak() {
  if (!sabunda) return;
  sabunda = false;
  delete sabunEl.dataset.suruklenen;
  sabunEl.style.translate = '';
  if (O.kopukTamam(kopuk)) dusBtn.focus({ preventScroll: true });
}
surukle(sabunEl, {
  basla: () => {
    if (!uyanikYavru()) return false;
    if (M.kalanBekleme(y, me.clientId, 'yika', Date.now()) > 0) { eylemTikla('yika'); return false; }
    sabunda = true;
    sabunEl.dataset.suruklenen = '';
    kopuk = { ...kopuk, son: null };
    return true;
  },
  hareket: (x, yy, x0, y0) => {
    sabunEl.style.translate = `${x - x0}px ${yy - y0}px`;
    const n = bebekNokta(x, yy);
    const onceki = Math.floor(O.kopukOrani(kopuk) * 10);
    const r = O.kopukIlerle(kopuk, n, !!n && D.bolgeBul(n.x, n.y, y.asama) !== null);
    kopuk = r.k;
    for (let i = 0; i < r.yeni; i++) kabarcikEkle(n);
    if (Math.floor(O.kopukOrani(kopuk) * 10) !== onceki) {
      simdi = Date.now();
      cizSahne();
      cizOda();
    }
  },
  birak: sabunBirak,
  iptal: sabunBirak,
});
/** Durula: su akar, köpük süzülür; sonra 'yika' eylemi. Yıka düğmesine tek dokunuş aynı eylemi doğrudan yapar. */
function durula() {
  if (!O.kopukTamam(kopuk) || sahne.hasAttribute('data-dus')) return;
  sahne.dataset.dus = '';
  dusBtn.hidden = true;
  setTimeout(() => {
    kopukSifirla();
    eylemTikla('yika');
    simdi = Date.now();
    cizOda();
    cizSahne();
    dugmeler.find((x) => x.btn.dataset.eylem === 'yika')?.btn.focus({ preventScroll: true }); // Durula gitti
  }, azHareket() ? 0 : 900);
}

// Tuvalet: bebeği lazımlığa sürükle (lazımlığa ya da düğmeye dokunmak da olur).
let tasiniyor = false;
function tasimaBitir() {
  if (!tasiniyor) return;
  tasiniyor = false;
  delete dokunBtn.dataset.suruklenen;
  dokunBtn.style.translate = '';
  lazimlikEl.removeAttribute('data-hedef');
}
const lazimlikIsabet = (x, yy) => O.kutuIsabet(x, yy, lazimlikEl.getBoundingClientRect(), 24);
surukle(dokunBtn, {
  basla: () => {
    if (oda !== 'tuvalet' || !uyanikYavru()) return false;
    tasiniyor = true;
    dokunBtn.dataset.suruklenen = '';
    return true;
  },
  hareket: (x, yy, x0, y0) => {
    dokunBtn.style.translate = `${x - x0}px ${yy - y0}px`;
    lazimlikEl.toggleAttribute('data-hedef', lazimlikIsabet(x, yy));
  },
  birak: (x, yy) => {
    const isabet = lazimlikIsabet(x, yy);
    tasimaBitir();
    if (isabet) eylemTikla('lazimlik');
  },
  iptal: tasimaBitir,
});

// Oda kaydırma: sahnede yatay kaydırınca komşu oda. Dikey kaydırma sayfaya kalır (CSS touch-action: pan-y).
sahne.addEventListener('pointerdown', (e) => {
  if (!e.isPrimary || e.button > 0 || !y || y.asama === 'yumurta') return;
  if (e.target.closest('.yv-sabun, .yv-lazimlik, .yv-dus, .yv-kisayol') || (oda === 'tuvalet' && dokunBtn.contains(e.target))) return;
  const { pointerId: id, clientX: x0, clientY: y0 } = e;
  const son = () => {
    removeEventListener('pointerup', bitir);
    removeEventListener('pointercancel', son);
  };
  function bitir(ev) {
    if (ev.pointerId !== id) return;
    son();
    const yon = O.kaydirmaYonu(ev.clientX - x0, ev.clientY - y0);
    if (!yon) return;
    tikYut(); // kaydırma bebeğe dokunuş sayılmasın
    const yeni = O.komsuOda(oda, yon);
    if (yeni) odaSec(yeni);
  }
  addEventListener('pointerup', bitir);
  addEventListener('pointercancel', son);
});

// ---------- Oyun odası: mini oyunlar, ses taklidi, mağaza ----------

/** Mini oyun tam ekran katmanda (oyunlar/cerceve.js oyunAc). Jeton yalnız bitişte (oyunBitti). */
function oyunBaslat(id, dugme) {
  if (!uyanikYavru()) return;
  const katman = h('div', { class: 'yv-oyun-katman' });
  document.body.append(katman);
  sayfaKilit(true);
  oyunAc(katman, {
    oyun: id,
    azHareket: azHareket(),
    bebekSvg: yavruSvg({ asama: y.asama, ruh: 'mutlu', renk: y.renk, kisilik: y.kisilik || '' }),
    onBitti: oyunBitti,
    onCik: () => {
      katman.remove();
      sayfaKilit(false);
      (dugme?.isConnected && !oyunSecEl.hidden ? dugme : oyunlarDugme.btn).focus({ preventScroll: true });
    },
  });
}

/** Oyun jetonu: yalnız kendi sayacım (jeton.<clientId>, jeton.js jetonKazan); günlük sınırla kısılırsa söylenir. */
async function oyunBitti({ jeton }) {
  const doc = col.get(M.BELGE_ID);
  if (!(jeton > 0) || !doc) return;
  const r = jetonKazan(M.oku(doc.data), { kim: me.clientId, kaynak: 'oyun', miktar: jeton, simdi: Date.now() });
  if (r.hata === 'sinir') {
    toast(`Bugünkü jeton sınırı doldu (${GUNLUK_SINIR}). Yarın yine kazanırsın 🪙`);
    return;
  }
  if (r.hata) return;
  try {
    await col.patch(M.BELGE_ID, r.yama);
  } catch (e) {
    toast(e?.message || 'Jeton kaydedilemedi. Bağlantını kontrol et.');
    return;
  }
  if (r.eklenen < jeton) toast(`Günlük sınır: ${jeton} yerine ${r.eklenen} jeton eklendi 🪙`);
}

const TAKLIT_SON = ['bitti', 'izin-yok', 'hata'];
const TAKLIT_UYARI = {
  sessiz: 'Ses duymadım. Yine dener misin?',
  kisa: 'Çok kısaydı, biraz daha uzun söyle.',
  'izin-yok': 'Mikrofon izni yok. Ayarlardan izin verebilirsin.',
  'destek-yok': 'Bu cihaz ses taklidini desteklemiyor.',
  mikrofon: 'Mikrofon açılamadı. Biraz sonra yine dene.',
  isleme: 'Ses işlenemedi. Yine dener misin?',
};

/** Konuş: taklitBaslat dokunma işleyicisinde, ilk await'ten önce (taklit.js: iOS/Android sesi ancak böyle açar). */
function konusTikla() {
  if (taklit) {
    taklit.durdur();
    return;
  }
  if (!uyanikYavru()) return;
  if (!taklitDestegi()) {
    toast(TAKLIT_UYARI['destek-yok']);
    return;
  }
  let bitti = false; // taklitBaslat bitişi eşzamanlı da bildirebilir
  const t = taklitBaslat({
    onDurum: (d, ek) => {
      if (TAKLIT_SON.includes(d)) bitti = true;
      taklitDegisti(d, ek);
    },
    onAgiz: (v) => sahne.style.setProperty('--yvb-konus', Math.max(0.12, v).toFixed(3)),
  });
  if (bitti) return;
  taklit = t;
  cizPanel();
}

/** Taklit durumu: mikrofon göstergesi, konuşma ağzı, söz; bitişte uyarı (izin yok, hata, sessiz, kısa). */
function taklitDegisti(d, ek = {}) {
  taklitDurum = d;
  mikEl.hidden = !mikrofonAcikMi(d);
  sahne.toggleAttribute('data-konusuyor', d === 'tekrar');
  if (TAKLIT_SON.includes(d)) {
    taklit = null;
    taklitDurum = null;
    sahne.style.removeProperty('--yvb-konus');
    const uyari = d === 'izin-yok' ? TAKLIT_UYARI['izin-yok'] : TAKLIT_UYARI[ek?.neden];
    if (uyari) toast(uyari);
  }
  simdi = Date.now();
  cizSahne();
  cizPanel();
}

/** Mağaza kancası: koordinatör magaza.js'e bağlar (şimdilik boş). */
function magazaAc() {}

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

/** Android uygulamasında yerel hatırlatıcı (acıkma, uyanma, doğum günü). Her ziyarette ve değişimde yeniden planlanır. */
function hatirlaticiPlanla() {
  if (!y) return;
  const dogumGunu = M.dogumGunuOlayi(y, simdi);
  const olaylar = [...M.hatirlaticiOlaylari(y, simdi), ...(dogumGunu ? [dogumGunu] : [])];
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
    if (eylem in M.EYLEMLER || eylem === 'isit' || eylem === 'lazimlik') {
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
bakim.on('change', () => { yeniBakimlar(); cizBakimlar(); cizGorev(); });
profil?.on('change', ciz);
room.on('presence', (p) => { partner = p || null; cizPartner(); cizPanel(); cizGorev(); });
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
