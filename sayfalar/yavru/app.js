// Yavrumuz: çiftin birlikte baktığı sanal yavru (yumurta → küçük → büyük).
// Saf mantık mantik.js'te, SVG çizimi cizim.js'te (yumurta) ve bebek.js'te (küçük, büyük); ana sayfa kartı da kullanır.
// Kişilik kisilik.js, keyifsizlik ve ilaç saglik.js, günlük ortak görev gorev.js, tuvalet tuvalet.js, jeton jeton.js,
// dokunma tepkileri dokunma.js (hepsi saf). Dokunma tepkisi geçici görsel durumdur, belgeye yazılmaz.
// Odalar (odalar.js saf, oda-cizim.js çizim): sekme + kaydırma; son oda cihaz başı (localStorage). Sürükle-bırak bakım
// (yemek ağza, sabun köpüğü, lazımlık) sonunda var olan eylemTikla yolunu çağırır. Oyun odası: mini oyunlar
// (oyunlar/cerceve.js oyunAc; jeton jeton.js jetonKazan) ve ses taklidi (taklit.js; ses cihazda işlenir, saklanmaz).
// Bulunulan oda partnere presence alanıyla gider (room.setAlan; belgeye yazılmaz). Yatak odasında ninni (ninni.js).
// Erken uyandırma ağlatır, sallama (düğme ya da sağ-sol hareket) susturur (dokunma.js; geçici, belgeye yazılmaz).
// Veri: 'yavru' türünde tek belge 'bizim' (alan düzeyinde yama), bakım günlüğü 'yavrubakim' (son 50: günlük görev sayımı; liste son 10).
import { bootPage } from '../../js/core/sayfa.js';
import { openCollection } from '../../js/core/veri.js';
import { openProfil } from '../../js/core/profil.js';
import { bildir } from '../../js/core/bildirim.js';
import { partnerGoruyor } from '../../js/core/room.js';
import { readStore, writeStore, isLocalMode, lobbyUrl } from '../../js/core/identity.js';
import { h, toast, knownPartner, formatDay, celebrate, shareInvite, ICONS } from '../../js/core/ui.js';
import { sfx, isMuted, setMuted } from '../../js/core/sound.js';
import { titret, yerelHatirlaticilar } from '../../js/core/mobil.js';
import * as M from './mantik.js';
import * as S from './saglik.js';
import * as G from './gorev.js';
import { KISILIKLER, favoriBonus } from './kisilik.js';
import { toDay } from '../../js/core/gunler.js';
import * as T from './tuvalet.js';
import * as D from './dokunma.js';
import { jetonBakiye, jetonKazan, satinAl, pastaBedavaMi, gunlukKalan, GUNLUK_SINIR, URUNLER } from './jeton.js';
import * as E from './evre.js';
import { GOREV_JETON, seriDurumu } from './seri.js';
import { yavruSvg, catlamaSvg, CIZIM_CSS } from './cizim.js';
import { BEBEK_CSS } from './bebek.js';
import * as O from './odalar.js';
import { odaSvg, KUVET_SVG, LAZIMLIK_SVG, SABUN_SVG, ODA_CSS } from './oda-cizim.js';
import { OYUNLAR, oyunAc } from './oyunlar/cerceve.js';
import { taklitBaslat, taklitDestegi, mikrofonAcikMi } from './taklit.js';
import { giyimOku } from './giyim.js';
import { magazaAc as magazaKatmani } from './magaza.js';
import { buyumeSahnesi, buyumeSahnesiGerekli, kutlamaSahnesi } from './buyume-sahne.js';
import { ninniCal, ninniRuhu } from './ninni.js';
import { tazelikIzleyici, otoYazimIzinli, kazaKarari } from './tazelik.js';
import { ikon, renkliIkon, paraIkon, ODA_IKON, EYLEM_IKON } from './ikonlar.js';
import { altSayfaAc } from './alt-sayfa.js';
import { oyunSecKur, CSS as OYUN_SEC_CSS } from './oyun-sec.js';
import { bilgeKartiKur, CSS as KART_CSS } from './bilge-karti.js';
import { gorevSeritKur, seriNoktaKur, CSS as GOREV_CSS } from './gorev-sayfa.js';

const { room, roomId, me } = await bootPage({ ns: 'yavru', title: 'Yavrumuz', tab: 'yavru' });
const app = document.getElementById('app');
document.head.append(h('style', { id: 'yv-cizim-stil' }, CIZIM_CSS + BEBEK_CSS + ODA_CSS + OYUN_SEC_CSS + KART_CSS + GOREV_CSS));
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
/** Sekme ve düğme ikonu: yalnız değişince yazılır. */
function ikonYaz(el, ad, boy = 28) {
  if (el.dataset.ikon === ad) return;
  el.dataset.ikon = ad;
  el.innerHTML = renkliIkon(ad, boy);
}
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
let agizAcik = false; // sürüklenen yiyecek ağza yaklaştı: ağız açılır
let kopuk = O.kopukBaslat(); // banyo: sabun köpüğü (geçici)
let tikEngel = false; // sürükleme ya da kaydırma bitti: ardından gelen tık eylem saymasın
let taklit = null; // ses taklidi denetimi (taklit.js) | null
let taklitDurum = null;
let ninni = null; // çalan ninni denetimi (ninni.js ninniCal) | null

// Otomatik yazımlar (kaza, çatlama, büyüme, görev ödülü, görev jetonu, evre) sunucudan tazelenmeden çalışmaz (tazelik.js). Ekran ve düğmeler beklemez.
const tazelik = tazelikIzleyici({
  tazele: async () => (await Promise.all([col.refresh(), bakim.refresh()])).every(Boolean),
  tazelenince: () => ciz(),
  gizli: document.visibilityState !== 'visible',
});
const otoIzin = () => otoYazimIzinli({ tazelendi: tazelik.taze(), cevrimici: navigator.onLine !== false });

// ---------- İskelet ----------
const cizimEl = h('span', { class: 'yv-cizim' });
const kopukEl = h('span', { class: 'yv-kopukler', 'aria-hidden': 'true' }); // banyo: biriken köpük
const kuvetEl = h('span', { class: 'yv-kuvet', 'aria-hidden': 'true' }); // banyo: küvetin ön yüzü (bebeğin üstünde)
const dokunBtn = h('button', { type: 'button', class: 'yv-dokun', onclick: sahneDokun }, cizimEl, kopukEl, kuvetEl);
// Dokunma kısayolları: klavye ve ekran okuyucu için; görünmez, odaklanınca sahnenin üstünde görünür.
const kisayolEl = h('div', { class: 'yv-kisayol', role: 'group', 'aria-label': 'Dokun', hidden: true });
const parcaEl = h('div', { class: 'yv-parca', 'aria-hidden': 'true' });
const sozEl = h('p', { class: 'yv-soz', 'aria-live': 'polite' });
// Oda sahnesi: arka plan (en altta) ve sürüklenen eşyalar. Eşyalar yalnız işaretçi içindir; aynı eylemler düğmelerde.
const odaZeminEl = h('span', { class: 'yv-oda-zemin', 'aria-hidden': 'true' });
const lazimlikEl = h('span', { class: 'yv-lazimlik', 'aria-hidden': 'true', html: LAZIMLIK_SVG, hidden: true, onclick: () => eylemTikla('lazimlik') });
const mikEl = h('span', { class: 'yv-mik', hidden: true }, 'Mikrofon açık');
// Ağlarken: Salla (sağ-sol sallama hareketiyle aynı; klavyeyle erişilir).
const sallaBtn = h('button', { type: 'button', class: 'btn primary small yv-salla', hidden: true, onclick: () => sakinlestir() }, 'Salla');
// Başlık sahnenin üstünde: geri, ad (kartı açar), jeton (mağazayı açar). Genel kabuk bu sayfada gizli; geri onun yolunu kullanır.
const ustAd = h('span', { class: 'yv-ust-ad' });
const ustAlt = h('span', { class: 'yv-ust-alt' });
const jetonSayi = h('span', { class: 'yv-ust-sayi' });
const ustJeton = h('button', { type: 'button', class: 'yv-ust-jeton', onclick: () => magazaAc() }, h('span', { html: paraIkon(20) }), jetonSayi);
const ustSes = h('button', { type: 'button', class: 'yv-ust-ses', onclick: () => { setMuted(!isMuted()); sesCiz(); if (kartSayfa) kartCiz(); } });
const ustEl = h('header', { class: 'yv-ust' },
  h('button', { type: 'button', class: 'yv-ust-kart', onclick: () => kartAc() }, ustAd, ustAlt),
  h('div', { class: 'yv-ust-sag' }, ustJeton, ustSes));
/** Üstteki ses düğmesi: kart açıkken karttaki düğmeyle aynı ayarı değiştirir. */
function sesCiz() {
  const sessiz = isMuted();
  ustSes.innerHTML = ikon(sessiz ? 'sessiz' : 'ses', 22);
  ustSes.setAttribute('aria-label', sessiz ? 'Sesi aç' : 'Sesi kapat');
}
sesCiz();
const sahne = h('section', { class: 'yv-sahne', 'aria-label': 'Yavrumuz' },
  odaZeminEl, h('span', { class: 'yv-gok', 'aria-hidden': 'true' }), ustEl, mikEl, lazimlikEl, dokunBtn, sallaBtn, kisayolEl, parcaEl);
const durumAltEl = h('p', { class: 'yv-durum-alt' });
const rozetEl = h('div', { class: 'yv-rozetler' });
const durumEl = h('div', { class: 'yv-durum' }, h('div', { class: 'yv-durum-ust' }, sozEl, rozetEl), durumAltEl);

// Oda sekmeleri: otomatik etkinleşen sekme listesi (oklar, Home, End); sekme paneli odanın eylem düğmeleri.
const odaSekme = {};
const HALKA_C = Math.round(2 * Math.PI * 22 * 10) / 10;
const odaSekmeEl = h('div', { class: 'yv-odalar', role: 'tablist', 'aria-label': 'Odalar', hidden: true, onkeydown: sekmeTus },
  O.ODALAR.map((o) => {
    const nokta = h('span', { class: 'yv-oda-nokta', 'aria-hidden': 'true', hidden: true });
    const deger = h('span', { class: 'yv-halka-deger' });
    const halka = h('span', { class: 'yv-halka', 'aria-hidden': 'true', html: `<svg viewBox="0 0 52 52" focusable="false"><circle class="yv-halka-iz" cx="26" cy="26" r="22"/><circle class="yv-halka-dolu" cx="26" cy="26" r="22" stroke-dasharray="0 ${HALKA_C}"/></svg><span class="yv-halka-ikon">${renkliIkon(ODA_IKON[o.id], 26)}</span>` }, nokta, deger);
    const btn = h('button', {
      type: 'button', role: 'tab', id: `yv-oda-${o.id}`, class: 'yv-oda-sekme', 'aria-controls': 'yv-oda-panel',
      dataset: { oda: o.id }, onclick: () => odaSec(o.id),
    }, halka, h('span', { class: 'yv-oda-ad' }, o.kisa));
    odaSekme[o.id] = { btn, nokta, deger, dolu: halka.querySelector('.yv-halka-dolu') };
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
// İlk ad için öneriler: dokununca girdiye yazar, kaydetmek yine kişinin elinde.
const adOneriEl = h('div', { class: 'yv-ad-oneri', role: 'group', 'aria-label': 'Ad önerileri' },
  M.adOnerileri(roomId).map((ad) => h('button', {
    type: 'button', class: 'btn small ghost', onclick: () => { adGirdi.value = ad; adGirdi.removeAttribute('aria-invalid'); adGirdi.focus({ preventScroll: true }); },
  }, ad)));
const adForm = h('form', { class: 'yv-adform', novalidate: true, onsubmit: adKaydet },
  adBaslikForm, adGirdi, adOneriEl,
  h('div', { class: 'yv-adform-dugmeler' }, adVazgec, h('button', { type: 'submit', class: 'btn primary' }, 'Kaydet')));
const bilgi = h('section', { class: 'yv-bilgi', 'aria-labelledby': 'yv-ad' }, adSatir, adForm);

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
  const emoji = h('span', { class: 'yv-eylem-ikon', 'aria-hidden': 'true' });
  const ad = h('span', { class: 'yv-eylem-ad' });
  const alt = h('span', { class: 'yv-eylem-alt' });
  const fav = h('span', { class: 'yv-eylem-favori', 'aria-hidden': 'true', hidden: true, html: ikon('kalp', 16) });
  const btn = h('button', { type: 'button', class: 'yv-eylem', dataset: { eylem }, onclick: () => eylemTikla(btn.dataset.eylem) }, emoji, ad, alt, fav);
  return { btn, emoji, ad, alt, fav };
}
const dugmeler = [...YEMEK, 'lazimlik', ...BAKIM].map(eylemDugmesi);
const ilacDugme = eylemDugmesi('ilac'); // yalnız keyifsizken görünür (her odada)
const ilacGrup = h('div', { class: 'yv-eylem-grup ilac', role: 'group', 'aria-label': 'Sağlık', hidden: true }, ilacDugme.btn);
/** Oyun odasının ek düğmeleri (bakım eylemi değil): aynı görünüm, kendi işleyicisi. */
function ekDugme(ad, ikonAd, adMetni, altMetni, onclick) {
  const emoji = h('span', { class: 'yv-eylem-ikon', 'aria-hidden': 'true' });
  ikonYaz(emoji, ikonAd);
  const yazi = h('span', { class: 'yv-eylem-ad' }, adMetni);
  const alt = h('span', { class: 'yv-eylem-alt' }, altMetni);
  const btn = h('button', { type: 'button', class: 'yv-eylem', dataset: { ek: ad }, onclick }, emoji, yazi, alt);
  return { btn, emoji, ad: yazi, alt };
}
const oyunlarDugme = ekDugme('oyunlar', EYLEM_IKON.oyunlar, 'Oyunlar', `${Object.keys(OYUNLAR).length} oyun`, () => oyunlarAc());
const konusDugme = ekDugme('konus', EYLEM_IKON.konus, 'Konuş', 'Taklit', konusTikla);
const magazaDugme = ekDugme('magaza', EYLEM_IKON.magaza, 'Mağaza', `${Object.keys(URUNLER).length} ürün`, () => magazaAc());
const ninniDugme = ekDugme('ninni', EYLEM_IKON.ninni, 'Ninni', 'Bizim bestemiz', ninniTikla); // yatak odası
const durulaDugme = ekDugme('durula', EYLEM_IKON.durula, 'Durula', 'Önce sabun', durula); // banyo
const odaGrup = h('div', { class: 'yv-eylem-grup yv-oda-grup', id: 'yv-oda-panel', role: 'tabpanel' },
  dugmeler.map((d) => d.btn), ninniDugme.btn, oyunlarDugme.btn, konusDugme.btn, magazaDugme.btn, durulaDugme.btn);
const eylemlerEl = h('div', { class: 'yv-eylemler' }, ilacGrup, odaGrup);

// İlk gün rehberi: üç adım (mantik.js yumurtaRehberi) ve sevgili yoksa davet. Kalıcı öğeler: odak kaybolmasın.
const rehberAdim = {};
const davetBtn = h('button', { type: 'button', class: 'btn small primary yv-davet', onclick: () => shareInvite(roomId) }, 'Sevgilini davet et');
const rehberEl = h('section', { class: 'yv-rehber', 'aria-labelledby': 'yv-rehber-baslik', hidden: true },
  h('h2', { class: 'yv-gorev-baslik', id: 'yv-rehber-baslik' }, 'İlk gününüz'),
  h('ol', { class: 'yv-adimlar' }, ['isit', 'sure', 'ad'].map((id, i) => {
    const baslik = h('strong', { class: 'yv-adim-baslik' });
    const alt = h('span', { class: 'yv-adim-alt' });
    const el = h('li', { class: 'yv-adim' },
      h('span', { class: 'yv-adim-no', 'aria-hidden': 'true' }, String(i + 1)),
      h('span', { class: 'yv-adim-govde' }, baslik, alt, id === 'isit' ? davetBtn : null));
    rehberAdim[id] = { el, baslik, alt, no: el.firstChild, sira: String(i + 1) };
    return el;
  })));

const ilerlemeEl = h('p', { class: 'yv-ilerleme' });
const isitAd = h('span', {}, 'Isıt');
const isitBtn = h('button', { type: 'button', class: 'btn primary wide yv-isit', onclick: isitTikla },
  h('span', { class: 'yv-isit-emoji', 'aria-hidden': 'true', html: ikon('kalp', 22) }), isitAd);
const yumurtaEl = h('div', { class: 'yv-yumurta-panel' }, ilerlemeEl, isitBtn);
const panel = h('div', { class: 'yv-panel' }, yumurtaEl, eylemlerEl);

const bakimListe = h('ol', { class: 'yv-bakimlar' });
const bakimBos = h('p', { class: 'yv-bos' });
const bakimSec = h('section', { class: 'yv-son', 'aria-labelledby': 'yv-son-baslik' },
  h('h2', { id: 'yv-son-baslik' }, 'Son bakımlar'), bakimListe, bakimBos);

const gorevEmoji = h('span', { class: 'yv-gorev-emoji', 'aria-hidden': 'true', html: ikon('yildiz', 22) });
const gorevMetin = h('p', { class: 'yv-gorev-metin' });
const gorevSayi = h('span', { class: 'yv-gorev-sayi' });
const gorevDolu = h('span', { class: 'yv-cubuk-dolu' });
const gorevCubuk = h('span', { class: 'yv-cubuk', role: 'meter', 'aria-valuemin': '0', 'aria-labelledby': 'yv-gorev-baslik' }, gorevDolu);
const gorevDurum = h('p', { class: 'yv-gorev-durum' });
const gorevOdulEl = h('p', { class: 'yv-gorev-durum yv-gorev-odul', hidden: true });
const gorevSeriEl = h('p', { class: 'yv-gorev-seri', hidden: true }); // telafi ve sonraki ödül
const gorevOdaEl = h('div', { class: 'yv-gorev-odalar', hidden: true }); // "Banyoya git" (gorev.js gorevOdalari)
const mumBtn = h('button', { type: 'button', class: 'btn small primary', hidden: true, onclick: mumUfle }, 'Mumunu üfle');
const pastaBtn = h('button', { type: 'button', class: 'btn small', hidden: true, onclick: pastaVer }, 'Bedava pastasını ver');
const gorevOzelEl = h('div', { class: 'yv-gorev-odalar', hidden: true }, mumBtn, pastaBtn);
let gorevOdaAnahtar = '';
const seriNokta = seriNoktaKur();
const gorevSec = h('section', { class: 'yv-gorev', 'aria-labelledby': 'yv-gorev-baslik', hidden: true },
  h('div', { class: 'yv-gorev-bas' }, gorevEmoji,
    h('div', { class: 'yv-gorev-govde' }, h('h2', { class: 'yv-gorev-baslik', id: 'yv-gorev-baslik' }, 'Günün görevi'), gorevMetin),
    gorevSayi),
  gorevOdulEl, gorevCubuk, gorevDurum, seriNokta.el, gorevSeriEl, gorevOzelEl, gorevOdaEl);

// Alt sayfalar: kalıcı öğeler alt sayfaya taşınır, ciz() onları kapalıyken de güncel tutar.
const bilgeKarti = bilgeKartiKur({ adAlani: bilgi, ihtiyacAlani: ihtiyacEl, bakimAlani: bakimSec });
const gorevSerit = gorevSeritKur({ onAc: () => gorevAc() });
const oyunSec = oyunSecKur({
  lobiUrl: lobbyUrl(),
  onOyun: (id) => {
    oyunSayfa?.kapat();
    oyunBaslat(id, oyunlarDugme.btn);
  },
});
let kartSayfa = null;
let gorevSayfa = null;
let oyunSayfa = null;

function kartAc() {
  if (kartSayfa) return;
  kartSayfa = altSayfaAc(document.body, { icerik: bilgeKarti.el, onKapat: () => { kartSayfa = null; } });
  kartCiz();
}
function gorevAc() {
  if (gorevSayfa) return;
  gorevSayfa = altSayfaAc(document.body, { baslik: 'Günün görevi', icerik: gorevSec, onKapat: () => { gorevSayfa = null; } });
}
function oyunlarAc() {
  if (oyunSayfa || !y) return;
  if (!uyanikYavru()) {
    toast('Şşş, uyuyor 🌙 Uyanınca oynayalım.');
    return;
  }
  oyunSec.guncelle({ bugun: GUNLUK_SINIR - gunlukKalan(y, me.clientId, Date.now()), sinir: GUNLUK_SINIR, partnerVar: !!partner });
  oyunSayfa = altSayfaAc(document.body, { baslik: 'Oyunlar', icerik: oyunSec.el, onKapat: () => { oyunSayfa = null; } });
}

const kok = h('div', { class: 'yv' }, sahne, h('div', { class: 'yv-alt' }, durumEl, panel, rehberEl, gorevSerit.el), odaSekmeEl);
app.replaceChildren(kok);

// ---------- Çizim ----------
function cizSahne() {
  const keyifsiz = S.keyifsizMi(y, simdi);
  const tuvalet = T.tuvaletDurumu(y, simdi);
  // Yüz durum yazısıyla uyumlu: çişi var, kaza, keyifsiz, özledi (kart.js ile aynı kural).
  const gercekRuh = M.kartRuhu(y, simdi, { keyifsiz, tuvalet });
  // Dokunma tepkisi yalnız uyanık bebekte ve süresince (yumurtada ruhHali 'yumurta').
  const uyanik = !['yumurta', 'uyuyor'].includes(gercekRuh);
  const tepkide = !!gecici && simdi < gecici.bitis && uyanik;
  // Öncelik: dinlerken dikkat kesilir, yiyecek ağza yaklaşınca ağız açılır, sonra dokunma tepkisi, sonra ninni uykusu.
  const dinliyor = uyanik && !!taklit && taklitDurum !== 'tekrar';
  const ninniUykulu = !!ninni && ninniRuhu(y, simdi);
  const ruh = dinliyor ? 'sasirma' : uyanik && agizAcik ? 'mutlu' : tepkide ? gecici.ruh : ninniUykulu || gercekRuh;
  const asama = y?.asama || 'yumurta';
  const renk = y?.renk || M.renkSec(roomId);
  const kisilik = y?.kisilik || '';
  const hazir = asama === 'yumurta' && !!y && M.catlamaHazir(y, simdi);
  const giyim = y ? giyimOku(y) : {};
  const anahtar = `${asama}|${ruh}|${renk}|${hazir}|${kisilik}|${JSON.stringify(giyim)}`;
  if (anahtar !== svgAnahtar) {
    svgAnahtar = anahtar;
    cizimEl.innerHTML = yavruSvg({ asama, ruh, renk, hazir, kisilik, giyim });
  }
  // Tepki bitince hareket kalkar (erken uyandırmada tepki yama gelmeden başlar: süre dolmadıysa dokunma).
  if (!gecici || simdi >= gecici.bitis) delete sahne.dataset.dokunma;
  sallaBtn.hidden = !(tepkide && gecici.ruh === 'aglama');
  cizKisayol(gercekRuh === 'yumurta' || gercekRuh === 'uyuyor' ? '' : asama);
  kok.style.setProperty('--yv-govde', `var(--yv-r${renk})`);
  sahne.dataset.asama = asama;
  kok.dataset.asama = asama;
  const uyuyor = ruh === 'uyuyor';
  sahne.toggleAttribute('data-gece', uyuyor);
  dokunBtn.setAttribute('aria-label', asama === 'yumurta' ? 'Yumurtayı ısıt' : `${y?.ad || 'Yavrunuzu'} sev`);
  const soz = (uyanik && odaSozu()) || (tepkide ? gecici.metin : M.durumMetni(y, simdi, keyifsiz, tuvalet));
  if (sozEl.textContent !== soz) sozEl.textContent = soz;
  durumAltEl.textContent = asama === 'yumurta' ? '' : O.durumAltMetni({
    uyuyor, kalan: uyuyor ? M.kalanMetni(Date.parse(y.uyku.bit) - simdi) : '', oda, ihtiyac: M.ihtiyaclar(y, simdi),
  });
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
  if (ninni) return ninniRuhu(y, simdi) ? 'Uykusu geldi, gözleri kapanıyor 😴' : 'Ninni çalıyor… 🎵';
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
    return;
  }
  if (sahne.dataset.oda !== oda) {
    sahne.dataset.oda = oda;
    odaZeminEl.innerHTML = odaSvg(oda);
    kuvetEl.innerHTML = oda === 'banyo' ? KUVET_SVG : '';
  }
  const uyuyor = M.uyuyorMu(y.uyku, simdi);
  const tuvalet = T.tuvaletDurumu(y, simdi);
  const durumlar = O.odaDurumlari({ ihtiyac: M.ihtiyaclar(y, simdi), tuvaletDeger: tuvalet?.deger, cisVar: !!tuvalet?.cisVar, uyuyor });
  for (const o of O.ODALAR) {
    const { btn, nokta, dolu, deger } = odaSekme[o.id];
    const d = durumlar[o.id];
    deger.textContent = String(d.deger);
    const secili = o.id === oda;
    btn.setAttribute('aria-selected', String(secili));
    btn.tabIndex = secili ? 0 : -1;
    dolu.setAttribute('stroke-dasharray', `${Math.round((HALKA_C * d.deger) / 10) / 10} ${HALKA_C}`);
    btn.toggleAttribute('data-uyari', d.uyari);
    nokta.hidden = !d.acil;
    btn.setAttribute('aria-label', `${o.ad}, ${d.ihtiyac} ${d.deger}${d.acil ? ', ihtiyacı var' : ''}`);
  }
  odaGrup.setAttribute('aria-labelledby', `yv-oda-${oda}`);
  lazimlikEl.hidden = oda !== 'tuvalet';
  const durulaHazir = O.kopukTamam(kopuk);
  durulaDugme.alt.textContent = durulaHazir ? 'Köpük tamam' : 'Önce sabun';
  if (durulaHazir) durulaDugme.btn.removeAttribute('aria-disabled');
  else durulaDugme.btn.setAttribute('aria-disabled', 'true');
  oneriCiz();
}

/** Odada vurgulanan tek eylem (odalar.js onerilenEylem). Köpük tamamsa sıradaki iş durulamak. */
function oneriCiz() {
  if (!y || y.asama === 'yumurta') return;
  const oneri = oda === 'banyo' && O.kopukTamam(kopuk) ? 'durula' : O.onerilenEylem(oda, {
    ihtiyac: M.ihtiyaclar(y, simdi), cisVar: !!T.tuvaletDurumu(y, simdi)?.cisVar, uyuyor: M.uyuyorMu(y.uyku, simdi),
  });
  for (const d of [...dugmeler, oyunlarDugme, konusDugme, magazaDugme, ninniDugme, durulaDugme]) {
    const ad = d.btn.dataset.eylem || d.btn.dataset.ek;
    d.btn.toggleAttribute('data-ana', ad === oneri && d.btn.getAttribute('aria-disabled') !== 'true');
  }
}

/** Oda değiştir: seçim cihazda kalır; yarım köpük ve dinleme biter. */
function odaSec(yeni, { odak = false } = {}) {
  yeni = O.odaOku(yeni);
  if (yeni !== oda) {
    const yon = O.ODA_IDLERI.indexOf(yeni) > O.ODA_IDLERI.indexOf(oda) ? 'ileri' : 'geri';
    oda = yeni;
    writeStore('local', ODA_KEY, oda);
    kopukSifirla();
    taklit?.durdur();
    ninni?.durdur();
    delete sahne.dataset.gecis;
    void sahne.offsetWidth; // geçişi baştan başlat
    sahne.dataset.gecis = yon;
    simdi = Date.now();
    cizOda();
    cizSahne();
    cizPanel();
    cizGorev();
    odaYay();
  }
  if (odak) odaSekme[oda].btn.focus({ preventScroll: true });
}

/** Bulunduğum oda partnere presence alanıyla gider (belgeye yazılmaz). Yumurtada oda yok: alan silinir. */
function odaYay() {
  room.setAlan?.(y && y.asama !== 'yumurta' ? oda : null);
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
  adOneriEl.hidden = !adYok;
  adBaslik.textContent = yumurta ? 'Yumurtamız' : y.ad || 'Yavrumuz';
  adBtn.hidden = yumurta;
  rozetEl.hidden = yumurta;
  if (!yumurta) {
    const kisilik = Object.hasOwn(KISILIKLER, y.kisilik ?? '') ? KISILIKLER[y.kisilik] : null;
    rozetEl.replaceChildren(
      h('span', { class: 'chip yv-rozet evre' }, E.evreSon(y)?.unvan || ASAMA_ADI[y.asama]),
      ...(kisilik ? [h('span', { class: 'chip yv-rozet kisilik', title: kisilik.aciklama }, kisilik.ad,
        h('span', { class: 'sr-only' }, `: ${kisilik.aciklama}`))] : []));
  }
  ustAd.textContent = adBaslik.textContent;
  ustJeton.hidden = yumurta;
  if (!yumurta) {
    const jeton = String(Math.max(0, jetonBakiye(y))); // eşzamanlı harcamada kısa süre eksi olabilir, 0 gösterilir
    jetonSayi.textContent = jeton;
    ustJeton.setAttribute('aria-label', `${jeton} ortak jeton, mağazayı aç`);
  }
  if (formAcik) {
    adBaslikForm.textContent = adYok ? 'Yavrumuza bir ad koyalım 💛' : 'Yeni adı';
    if (adOdak) {
      adOdak = false;
      kartAc(); // ad formu kartta
      if (!adYok || !adGirdi.value) adGirdi.value = y.ad || '';
      adGirdi.focus({ preventScroll: true });
      adForm.scrollIntoView({ block: 'nearest', behavior: azHareket() ? 'auto' : 'smooth' });
    }
  }
  cizUst();
  if (kartSayfa) kartCiz();
}

/** Başlığın alt satırı: yaş (özel günde kutlama, ad yoksa çağrı) ve sevgilinin yeri. */
function cizUst() {
  const ozel = y ? M.ozelGun(y, toDay(new Date(simdi))) : null;
  const yavru = !!y && y.asama !== 'yumurta';
  const yas = !y ? 'Yeni yumurta'
    : ozel ? (M.dogumGunuMu(y, simdi) ? M.DOGUM_GUNU_METNI : M.ozelGunMetni(ozel, y.ad))
      : yavru && !y.ad ? 'Ona bir ad koyalım' : M.yasMetni(y, simdi);
  const yer = partnerGoruyor(partner, 'yavru') ? (O.partnerOdaKisa(partnerAdi(), partner.alan) || `${partnerAdi()} burada`)
    : partner ? `${partnerAdi()} çevrimiçi` : '';
  if (yer) ustAlt.replaceChildren(`${yas} · `, h('span', { class: 'dot on yv-ust-nokta', 'aria-hidden': 'true' }), yer);
  else ustAlt.textContent = yas;
  ustEl.querySelector('.yv-ust-kart').setAttribute('aria-label', `${ustAd.textContent}: ${ustAlt.textContent}. Kartı aç`);
}

/** Bilge kartı içeriği: yalnız açıkken çizilir (portre pahalı). */
function kartCiz() {
  const yumurta = !y || y.asama === 'yumurta';
  const kisilik = !yumurta && Object.hasOwn(KISILIKLER, y.kisilik ?? '') ? KISILIKLER[y.kisilik] : null;
  let buyumeMetni = '';
  if (y?.asama === 'kucuk') {
    const b = M.buyumeDurumu(y, simdi);
    const benP = y.puan[me.clientId] || 0;
    const oP = b.kisiler.find((k) => k.id !== me.clientId)?.puan || 0;
    if (b.kalanGun > 0 || b.toplam < b.gerekToplam) {
      buyumeMetni = `Büyümesine ${b.kalanGun > 0 ? `${b.kalanGun} gün · ` : ''}${puanMetni(Math.min(b.toplam, b.gerekToplam))}/${b.gerekToplam} bakım`;
    } else {
      buyumeMetni = `İkinizin de en az ${b.gerekKisi} bakımı olunca büyür`;
    }
    buyumeMetni += ` (sen ${puanMetni(benP)}, ${partnerAdi()} ${puanMetni(oP)})`;
  }
  bilgeKarti.guncelle({
    y, simdi, kisilik, buyumeMetni,
    portreSvg: yavruSvg({ asama: y?.asama || 'yumurta', ruh: 'mutlu', renk: y?.renk || M.renkSec(roomId), kisilik: y?.kisilik || '', giyim: y ? giyimOku(y) : {}, kimlik: 'yvk' }),
    seriN: yumurta ? 0 : seriDurumu(y, toDay(new Date(simdi))).n,
    yasMetni: y ? M.yasMetni(y, simdi) : 'Yeni yumurta',
    sesAcik: !isMuted(),
    onSes: () => { setMuted(!isMuted()); sesCiz(); kartCiz(); },
  });
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
  cizRehber(yumurta);
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
    ikonYaz(d.emoji, EYLEM_IKON[eylem]);
    const kalan = eylem === 'ilac' ? S.ilacKalan(y, me.clientId, simdi)
      : eylem === 'lazimlik' ? T.lazimlikKalan(y, me.clientId, simdi) : M.kalanBekleme(y, me.clientId, eylem, simdi);
    const kapali = uyuyor && eylem !== 'sev' && eylem !== 'uyandir';
    const favori = favoriBonus(y.kisilik, eylem) > 0;
    const ad = favori ? `${e.ad} (en sevdiği)` : e.ad;
    d.fav.hidden = !favori;
    d.ad.textContent = e.ad;
    if (kapali) {
      d.btn.dataset.durum = 'uyku';
      d.alt.textContent = 'Uyuyor';
      d.btn.setAttribute('aria-disabled', 'true');
      d.btn.setAttribute('aria-label', `${ad} (uyuyor)`);
    } else if (kalan > 0) {
      d.btn.dataset.durum = 'bekle';
      d.alt.textContent = `${M.kalanMetni(kalan)} sonra`;
      d.btn.setAttribute('aria-disabled', 'true');
      d.btn.setAttribute('aria-label', `${ad}: ${M.kalanMetni(kalan)} sonra`);
    } else {
      delete d.btn.dataset.durum;
      d.alt.textContent = eylemAlt(eylem);
      d.btn.removeAttribute('aria-disabled');
      if (favori) d.btn.setAttribute('aria-label', ad);
      else d.btn.removeAttribute('aria-label');
    }
  }
  // Oda: yalnız bu odanın düğmeleri. Sev gösterilmez: bebeğe dokunmak aynı işi yapar.
  const odaT = O.odaTanimi(oda);
  let sutun = 0;
  for (const d of dugmeler) {
    const e = d.btn.dataset.eylem === 'uyandir' ? 'uyut' : d.btn.dataset.eylem;
    d.btn.hidden = !odaT.eylemler.includes(e) || e === 'sev';
    if (!d.btn.hidden) sutun++;
  }
  const oyunOdasi = oda === 'oyun';
  for (const d of [oyunlarDugme, konusDugme, magazaDugme]) d.btn.hidden = !oyunOdasi;
  if (oyunOdasi) sutun += 3;
  ninniDugme.btn.hidden = oda !== 'yatak';
  if (oda === 'yatak') sutun++;
  durulaDugme.btn.hidden = oda !== 'banyo' || uyuyor;
  if (!durulaDugme.btn.hidden) sutun++;
  ikonYaz(ninniDugme.emoji, ninni ? EYLEM_IKON.durdur : EYLEM_IKON.ninni);
  ninniDugme.ad.textContent = ninni ? 'Durdur' : 'Ninni';
  ninniDugme.alt.textContent = ninni ? 'Çalıyor' : 'Bizim bestemiz';
  ninniDugme.btn.setAttribute('aria-pressed', String(!!ninni));
  ninniDugme.btn.setAttribute('aria-label', ninni ? 'Ninniyi durdur' : 'Ninni çal');
  for (const d of [oyunlarDugme, konusDugme]) {
    if (uyuyor) {
      d.btn.dataset.durum = 'uyku';
      d.btn.setAttribute('aria-disabled', 'true');
    } else {
      delete d.btn.dataset.durum;
      d.btn.removeAttribute('aria-disabled');
    }
  }
  ikonYaz(konusDugme.emoji, taklit ? EYLEM_IKON.durdur : EYLEM_IKON.konus);
  konusDugme.ad.textContent = taklit ? 'Bitir' : 'Konuş';
  konusDugme.btn.setAttribute('aria-pressed', String(!!taklit));
  konusDugme.btn.setAttribute('aria-label', uyuyor ? 'Konuş (uyuyor)' : taklit ? 'Konuşmayı bitir' : 'Konuş: yavru seni taklit etsin');
  oyunlarDugme.btn.setAttribute('aria-label', uyuyor ? 'Mini oyunlar (uyuyor)' : 'Mini oyunlar');
  odaGrup.style.setProperty('--sutun', String(Math.max(1, sutun)));
  oneriCiz();
}

/** Düğmenin alt satırı. */
function eylemAlt(eylem) {
  if (eylem === 'uyut') return `Uyku ${M.UYKU_SURE / M.SAAT} saat`;
  if (eylem === 'uyandir') return D.uyandirmaTepkisi(y.uyku, simdi) ? 'Erken uyanırsa ağlar' : 'Günaydın';
  if (eylem === 'lazimlik') return T.tuvaletDurumu(y, simdi)?.cisVar ? 'Çişi var' : 'Rahat';
  if (eylem === 'ilac') return 'Keyfi yerine gelsin';
  if (eylem === 'oyna') return `+${M.EYLEMLER.oyna.etki.mutluluk}`; // dört düğmeli sırada dar
  return O.eylemAltMetni(eylem, M.EYLEMLER);
}

/** İlk gün rehberi: adım durumları ve sevgili henüz yoksa davet düğmesi. */
function cizRehber(yumurta) {
  rehberEl.hidden = !yumurta;
  if (!yumurta) return;
  const r = M.yumurtaRehberi(y, { benId: me.clientId, simdi, partnerVar: !!partnerId(), partnerAd: partnerAdi() });
  for (const a of r.adimlar) {
    const k = rehberAdim[a.id];
    k.el.dataset.durum = a.durum;
    k.baslik.textContent = a.baslik;
    k.alt.textContent = a.alt;
    k.no.textContent = a.durum === 'tamam' ? '✓' : k.sira;
  }
  davetBtn.hidden = !r.davet;
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

// ---------- Günün görevi: iki kişinin bugünkü bakımları; tamamlanınca seri ve kişi başı jeton (bir kez) ----------
let gorevOdulGun = null; // bu cihazın ödül yazdığı gün (yazım sürerken yinelenmesin)
let jetonYazilan = null; // yazımı süren görev jetonu yaması
let evreYazilan = null; // yazımı süren evre

function cizGorev() {
  const pid = partnerId();
  const gun = toDay(new Date(simdi));
  const oz = y ? G.gorevOzeti(y, { roomId, gun, kayitlar: bakim.all(), kisiler: [me.clientId, pid].filter(Boolean) }) : null;
  gorevSec.hidden = !oz;
  if (!oz) {
    gorevSerit.guncelle({ gizli: true });
    return;
  }
  const { gorev, tamam, odullendi, kisiBasi, ilerleme: { n, gerek } } = oz;
  const bitti = tamam || odullendi;
  const ozel = M.ozelGun(y, gun);
  gorevMetin.textContent = gorev.id === G.MUM_GOREV.id && ozel ? `${M.ozelGunMetni(ozel, y.ad)} ${gorev.metin}` : gorev.metin;
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
    gorevDurum.textContent = `Tamamlandı! İkinize de +${y.gorev?.[gun]?.jeton || GOREV_JETON} jeton ✨`;
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
  gorevOdulEl.hidden = bitti;
  gorevOdulEl.replaceChildren('Tamamlayınca ikinize ', h('span', { html: paraIkon(16) }), h('strong', {}, String(gorev.id === G.MUM_GOREV.id ? GOREV_JETON + G.MUM_JETON : GOREV_JETON)));
  const seri = seriDurumu(y, gun);
  gorevSerit.guncelle({ gizli: false, metin: gorevMetin.textContent, goster, gerek, tamam: bitti, seriN: seri.n });
  seriNokta.guncelle(seri);
  cizGorevSeri(gun);
  cizGorevOzel(gun, gorev, kisiBasi, ozel);
  cizGorevOdalari(bitti ? [] : G.gorevOdalari(gorev).filter((o) => o !== oda));
  if (otoIzin() && tamam && !odullendi && pid && gorevOdulGun !== gun) gorevOdul(gun, pid, gorev.id);
}

/** Seri notu: dün kaçtıysa telafi, yoksa sonraki ödüle kalan. */
function cizGorevSeri(gun) {
  const s = seriDurumu(y, gun);
  const metin = s.telafiBekliyor ? `Dün kaçtı, sorun değil: bugün tamamlarsanız ${s.n} gün sürer 💛`
    : s.n && s.sonraki ? `${s.n} gün · ${s.sonraki.gun}. günde hediye var, ${s.sonraki.kalan} gün kaldı` : s.n ? `${s.n} gün` : '';
  gorevSeriEl.hidden = !metin;
  gorevSeriEl.textContent = metin;
}

/** Özel gün düğmeleri: kendi mumun (üflemediysen) ve kendi bedava pasta hakkın. */
function cizGorevOzel(gun, gorev, kisiBasi, ozel) {
  mumBtn.hidden = !(gorev.id === G.MUM_GOREV.id && !kisiBasi[me.clientId]);
  pastaBtn.hidden = !(ozel && pastaBedavaMi(y, me.clientId, simdi));
  gorevOzelEl.hidden = mumBtn.hidden && pastaBtn.hidden;
}

/** Mum: bakım günlüğüne tek kayıt (id gün ve kişiye bağlı, iki kez sayılmaz); belgeye yazılmaz, görev bitince ödül gelir. */
function mumUfle() {
  if (!y || y.asama === 'yumurta') return;
  const at = new Date().toISOString();
  bakim.put({ eylem: 'mum', kim: me.clientId, at }, `mum-${toDay(new Date())}-${me.clientId}`).catch(() => {});
  sfx('pop');
  titret(15);
  tepki('sev');
  partnerBildir('mum');
  simdi = Date.now();
  cizGorev();
}

/** Özel gün pastası: mağazayı açmadan aynı satın alma yolu (fiyat düşmez). */
function pastaVer() {
  if (!y) return;
  const t = Date.now();
  const r = satinAl(y, { kim: me.clientId, urun: 'pasta', simdi: t });
  if (r.hata === 'uyuyor') { toast('Şşş, uyuyor 🌙 Uyanınca verelim.'); return; }
  if (r.hata) return;
  sfx('pop');
  titret(15);
  tepki('tatli');
  yaz(r.yama, r.kayit, 'satinal', { deger: 'pasta' });
  toast('Afiyet olsun 🎂');
}

/** Görev kartında ilgili odaya tek dokunuşla geçiş ("Banyoya git"). Bulunduğum oda listede yok. */
function cizGorevOdalari(odalar) {
  const anahtar = odalar.join(',');
  if (anahtar === gorevOdaAnahtar) return;
  gorevOdaAnahtar = anahtar;
  gorevOdaEl.hidden = !odalar.length;
  gorevOdaEl.replaceChildren(...odalar.map((id) => {
    const o = O.odaTanimi(id);
    return h('button', {
      type: 'button', class: 'btn small yv-gorev-git', dataset: { oda: id },
      onclick: () => {
        gorevSayfa?.kapat();
        odaSec(id, { odak: true });
      },
    }, h('span', { 'aria-hidden': 'true', html: ikon(ODA_IKON[id], 18) }), `${o.yonelme} git`);
  }));
}

/** Ödül yaması mutlak: iki cihaz aynı anda yazsa da gün kaydı ve seri tek (gorev.js odulYamasi). Jetonu gorevJetonuAl alır. */
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
}

/** Bana düşen görev jetonu kendi sayacıma; ödül her cihazda bir kez kutlanır. Seri ve mum sahneli. */
function gorevJetonuAl() {
  if (!otoIzin() || !y) return;
  const r = G.gorevJetonTopla(y, { kim: me.clientId, simdi });
  if (!r) return;
  const anahtar = JSON.stringify(r.yama);
  if (anahtar === jetonYazilan) return;
  jetonYazilan = anahtar;
  col.patch(M.BELGE_ID, r.yama).then(() => {
    jetonYazilan = null; // bekçi yalnız yazım sürerken: yazım kaybolursa sonraki tazelemede yeniden alınır
    sfx('win');
    const son = r.gunler[r.gunler.length - 1];
    const urun = son.kiyafet ? URUNLER[son.kiyafet] : null;
    const alt = `İkinize de +${son.jeton} jeton 🪙${urun ? ` · ${urun.ad} dolabınızda` : ''}`;
    if (son.seri) kutla({ emoji: '🔥', baslik: `${son.seri} gün üst üste!`, alt });
    else if (son.id === G.MUM_GOREV.id) kutla({ emoji: '🎂', baslik: 'Mumlar söndü!', alt });
    else toast(`Günün görevi tamam! +${r.eklenen} jeton 🪙`);
  }).catch((e) => {
    jetonYazilan = null;
    console.warn('[yavru] görev jetonu yazılamadı', e);
  });
}

/** Evre geldiyse (büyükte; 1, 3, 6, 12. ay) tek yamayla yazar: unvan ve kıyafet. İki cihaz aynı yamayı yazar. */
function evreYaz() {
  if (!otoIzin() || !y) return;
  const r = E.evreYamasi(y, { kim: me.clientId, simdi });
  if (!r || evreYazilan === r.evre.id) return;
  evreYazilan = r.evre.id;
  col.patch(M.BELGE_ID, r.yama).then(() => { evreYazilan = null; }).catch((e) => {
    evreYazilan = null;
    console.warn('[yavru] evre yazılamadı', e);
  });
  bakim.put({ eylem: 'evre', kim: me.clientId, at: new Date(simdi).toISOString(), deger: r.evre.unvan }, `evre-${r.evre.id}`).catch(() => {});
  partnerBildir('evre', { deger: r.evre.unvan });
}

/** Kısa kutlama sahnesi; başka sahne oynuyorsa yalnız toast. */
function kutla({ emoji, baslik, alt, onBitti }) {
  if (sahneOynuyor) {
    toast(`${baslik} ${alt}`);
    return;
  }
  sahneOynuyor = true;
  kutlamaSahnesi(document.body, {
    asama: y.asama, renk: y.renk, kisilik: y.kisilik, giyim: giyimOku(y), emoji, baslik, alt,
    onBitti: () => { sahneOynuyor = false; onBitti?.(); ciz(); },
  });
}

function cizPartner() {
  cizUst();
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
  odaYay();
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
  gorevJetonuAl();
  evreYaz();
  tazelik.dene();
}

/**
 * Olmuş kazayı belgeye yazar (açılışta ve her çizimde). Yama mutlak, kayıt id'si 'kaza-<ms>': iki cihaz
 * aynı anda yazsa da kaza bir kez uygulanır, günlükte tek satır kalır. Sonda: iyimser yazım yeniden çizdirir.
 */
function kazaYaz() {
  const r = kazaKarari({ tazelendi: otoIzin(), y, kim: me.clientId, simdi });
  if (!r || r.kayitId === kazaYazilan) return;
  kazaYazilan = r.kayitId;
  col.patch(M.BELGE_ID, r.yama).catch((e) => {
    kazaYazilan = null;
    console.warn('[yavru] kaza yazılamadı', e);
  });
  bakim.put(r.kayit, r.kayitId).catch(() => {});
  partnerBildir('kaza');
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
  } else if (!sahneOynuyor && buyumeSahnesiGerekli(y, !!readStore(sahneDepo(), BUYUME_KEY), simdi)) {
    writeStore(sahneDepo(), BUYUME_KEY, '1'); // başta: yarıda kapansa da yeniden oynamaz
    sahneOynuyor = true;
    buyumeSahnesi(document.body, {
      renk: y.renk, kisilik: y.kisilik, giyim: giyimOku(y), ad: y.ad,
      onBitti: () => { sahneOynuyor = false; },
    });
  } else if (!sahneOynuyor && E.evreSahnesiGerekli(y, readStore(sahneDepo(), EVRE_KEY), simdi)) {
    const e = E.evreSahnesiGerekli(y, readStore(sahneDepo(), EVRE_KEY), simdi);
    writeStore(sahneDepo(), EVRE_KEY, e.id);
    writeStore(sahneDepo(), OZEL_KEY, toDay(new Date(simdi))); // aynı gün ikinci sahne olmasın
    sfx('win');
    const yas = e.ay === 12 ? '1 yaşına bastı' : `${e.ay} aylık oldu`;
    kutla({ emoji: URUNLER[e.urun].emoji, baslik: `${y.ad || 'Yavrumuz'} artık ${e.unvan}!`, alt: `${yas}. ${URUNLER[e.urun].ad} dolabınızda ✨` });
  } else if (!sahneOynuyor && M.ozelGun(y, toDay(new Date(simdi))) && readStore(sahneDepo(), OZEL_KEY) !== toDay(new Date(simdi))
    && !E.evreYamasi(y, { kim: me.clientId, simdi })) { // evre yazılacaksa o günün sahnesi evre sahnesidir
    writeStore(sahneDepo(), OZEL_KEY, toDay(new Date(simdi)));
    sfx('win');
    kutla({ emoji: '🎂', baslik: M.ozelGunMetni(M.ozelGun(y, toDay(new Date(simdi))), y.ad), alt: 'Bugün pasta bedava. İkiniz de mumunuzu üfleyin 🕯️' });
  } else if (degisti && !sahneOynuyor) {
    olay(y.asama === 'buyuk' ? 'buyudu' : 'dogdu', 1600);
    sfx('win');
  }
  if (otoIzin()) {
    if (y?.asama === 'yumurta' && !catliyor && M.catlamaHazir(y, simdi)) catla();
    if (y?.asama === 'kucuk' && !buyuyor && !sahneOynuyor && M.buyumeDurumu(y, simdi).hazir) buyu();
  }
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
const BUYUME_KEY = `bizim.yavru.buyumeGoruldu.${roomId}`;
const EVRE_KEY = `bizim.yavru.evreGoruldu.${roomId}`;
const OZEL_KEY = `bizim.yavru.ozelGoruldu.${roomId}`;
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
  ciz(); // büyüme sahnesi gecisler'de oynar
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
  // Uykunun ilk yarısında uyandırılırsa kısa ağlar (geçici; yama gelince yüzde görünür).
  const erken = eylem === 'uyandir' ? D.uyandirmaTepkisi(y.uyku, t) : null;
  if (erken) {
    dokunGecmis = [];
    geciciBaslat(erken, t);
    titret([25, 60, 25]);
  }
  if (eylem === 'uyut') ninni?.durdur();
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
  geciciBaslat(r, t);
  if (!(r.sev && sevDene())) titret(r.ruh === 'aglama' ? [25, 60, 25] : 12);
}

/** Geçici ifade (dokunma.js tepkisi): süre dolunca kendiliğinden biter. */
function geciciBaslat(r, t = Date.now()) {
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
}

/** Ağlıyor mu (dokunma ya da erken uyandırma ağlaması; uyanık bebek)? */
const agliyor = () => gecici?.ruh === 'aglama' && Date.now() < gecici.bitis && uyanikYavru();

/** Sallayınca ağlama hemen biter: kısa huzur. Odak gizlenen Salla'dan bebeğe geçer. */
function sakinlestir() {
  if (!agliyor()) return;
  const odakSallada = document.activeElement === sallaBtn;
  dokunGecmis = [];
  geciciBaslat(D.SAKIN);
  sfx('tap');
  titret(10);
  if (odakSallada) dokunBtn.focus({ preventScroll: true });
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
 * dokunmatik (isteğe bağlı): { karar(dx, dy, basili) → 'surukle'|'kaydir'|null, basiliMs }. Verilirse dokunuşta
 * yön kararı bekler ('kaydir' = tarayıcı sayfayı kaydırır; CSS touch-action: pan-y), basiliMs dolunca sürükleme başlar;
 * sürüklerken touchmove engellenir (kaydırma başlamasın). Fare eski yolla (eşik) çalışır.
 */
function surukle(el, { basla, hareket, birak, iptal = () => {}, dokunmatik = null }) {
  let surukluyor = false;
  if (dokunmatik) {
    el.addEventListener('touchmove', (ev) => { if (surukluyor && ev.cancelable) ev.preventDefault(); }, { passive: false });
    el.addEventListener('contextmenu', (ev) => { if (surukluyor) ev.preventDefault(); });
  }
  el.addEventListener('pointerdown', (e) => {
    if (!e.isPrimary || e.button > 0) return;
    const { pointerId: id, clientX: x0, clientY: y0 } = e;
    const kararli = dokunmatik && e.pointerType !== 'mouse';
    let aktif = false;
    let basili = false;
    const baslat = () => {
      if (basla(x0, y0) === false) { son(); return false; }
      aktif = true;
      surukluyor = true;
      return true;
    };
    const tut = kararli && dokunmatik.basiliMs > 0 ? setTimeout(() => {
      basili = true;
      if (!aktif && baslat()) {
        titret(10);
        hareket(x0, y0, x0, y0);
      }
    }, dokunmatik.basiliMs) : 0;
    const son = () => {
      clearTimeout(tut);
      surukluyor = false;
      removeEventListener('pointermove', tasi);
      removeEventListener('pointerup', bitir);
      removeEventListener('pointercancel', vazgec);
    };
    function tasi(ev) {
      if (ev.pointerId !== id) return;
      if (!aktif) {
        const dx = ev.clientX - x0;
        const dy = ev.clientY - y0;
        if (kararli) {
          const k = dokunmatik.karar(dx, dy, basili);
          if (!k) return;
          if (k === 'kaydir') { son(); return; } // dikey kaydırma tarayıcıda
        } else if (!O.surukleBasladi(dx, dy)) return;
        clearTimeout(tut);
        if (!baslat()) return;
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
      hayalet = h('span', { class: 'yv-hayalet', 'aria-hidden': 'true', html: renkliIkon(EYLEM_IKON[eylem], 36) });
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
    // Düğme üstünden başlayan dikey kaydırma sayfaya kalsın: yatay, yukarı-çapraz ya da basılı tutma sürükler.
    dokunmatik: { karar: O.yemekSurukleKarar, basiliMs: O.BASILI_TUT },
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
let sabunHayalet = null;
const yikaDugme = dugmeler.find((x) => x.btn.dataset.eylem === 'yika');
function sabunBirak() {
  if (!sabunda) return;
  sabunda = false;
  delete yikaDugme.btn.dataset.suruklenen;
  sabunHayalet?.remove();
  sabunHayalet = null;
  if (O.kopukTamam(kopuk)) durulaDugme.btn.focus({ preventScroll: true });
}
surukle(yikaDugme.btn, {
  basla: () => {
    if (!uyanikYavru()) return false;
    if (M.kalanBekleme(y, me.clientId, 'yika', Date.now()) > 0) { eylemTikla('yika'); return false; }
    sabunda = true;
    yikaDugme.btn.dataset.suruklenen = '';
    sabunHayalet = h('span', { class: 'yv-hayalet sabun', 'aria-hidden': 'true', html: SABUN_SVG });
    document.body.append(sabunHayalet);
    kopuk = { ...kopuk, son: null };
    return true;
  },
  hareket: (x, yy) => {
    sabunHayalet.style.translate = `${x}px ${yy}px`;
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
  dokunmatik: { karar: O.yemekSurukleKarar, basiliMs: O.BASILI_TUT },
});
/** Durula: su akar, köpük süzülür; sonra 'yika' eylemi. Yıka düğmesine tek dokunuş aynı eylemi doğrudan yapar. */
function durula() {
  if (!O.kopukTamam(kopuk)) {
    toast('Önce sabunu yavrunun üstünde gezdir');
    return;
  }
  if (sahne.hasAttribute('data-dus')) return;
  sahne.dataset.dus = '';
  setTimeout(() => {
    kopukSifirla();
    eylemTikla('yika');
    simdi = Date.now();
    cizOda();
    cizSahne();
    yikaDugme.btn.focus({ preventScroll: true });
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
  if (e.target.closest('.yv-ust, .yv-lazimlik, .yv-kisayol') || (oda === 'tuvalet' && dokunBtn.contains(e.target))) return;
  if (e.target.closest('.yv-salla')) return;
  const { pointerId: id, clientX: x0, clientY: y0 } = e;
  // Ağlarken sağ-sol sallama (dokunma.js sallaIlerle) ağlamayı dindirir; bu hareket oda değiştirmez.
  let salla = agliyor() ? D.sallaBaslat(x0) : null;
  let sallandi = false;
  const son = () => {
    removeEventListener('pointerup', bitir);
    removeEventListener('pointercancel', son);
    removeEventListener('pointermove', sallaTasi);
  };
  function sallaTasi(ev) {
    if (ev.pointerId !== id || !salla) return;
    const r = D.sallaIlerle(salla, ev.clientX);
    salla = r.s;
    if (!r.tamam) return;
    salla = null;
    sallandi = true;
    sakinlestir();
  }
  function bitir(ev) {
    if (ev.pointerId !== id) return;
    son();
    if (sallandi || salla?.n > 0) {
      tikYut(); // sallama bebeğe dokunuş ya da oda kaydırması sayılmasın
      return;
    }
    const yon = O.kaydirmaYonu(ev.clientX - x0, ev.clientY - y0);
    if (!yon) return;
    tikYut(); // kaydırma bebeğe dokunuş sayılmasın
    const yeni = O.komsuOda(oda, yon);
    if (yeni) odaSec(yeni);
  }
  addEventListener('pointerup', bitir);
  addEventListener('pointercancel', son);
  if (salla) addEventListener('pointermove', sallaTasi);
});

// ---------- Yatak odası: ninni ----------

/** Ninni çal / durdur. Ses bağlamı dokunuşla açılır (ninniCal ilk iş). Bitince uyutma önerilir; kendisi uyutmaz. */
function ninniTikla() {
  if (ninni) {
    ninni.durdur();
    return;
  }
  if (!y || y.asama === 'yumurta') return;
  ninni = ninniCal({
    onOlcu: (i) => parcalar([h('span', {
      class: 'yv-p yv-p-nota', style: { '--x': `${(i % 2 ? 62 : 32) + Math.round(rnd(-6, 6))}%` },
    }, i % 3 ? '♪' : '♫')], 2600),
    onBitti: (tamam) => {
      ninni = null;
      sahne.removeAttribute('data-ninni');
      simdi = Date.now();
      cizSahne();
      cizPanel();
      if (tamam && uyanikYavru()) {
        toast(`${y.ad || 'Yavrumuz'} mışıl mışıl olmaya hazır 🌙`, { action: { label: 'Uyut', onClick: () => eylemTikla('uyut') } });
      }
    },
  });
  sahne.setAttribute('data-ninni', '');
  simdi = Date.now();
  cizSahne();
  cizPanel();
}

// ---------- Oyun odası: mini oyunlar, ses taklidi, mağaza ----------

/** Mini oyun tam ekran katmanda (oyunlar/cerceve.js oyunAc). Jeton yalnız bitişte (oyunBitti). */
function oyunBaslat(id, dugme) {
  if (!uyanikYavru()) return;
  if (id === 'salla') {
    if (!partner) { toast('Sevgilin şu an çevrimdışı. İkiniz de açıkken oynanır 💞'); return; }
    room.send({ tur: 'salla-davet' });
  }
  const katman = h('div', { class: 'yv-oyun-katman' });
  document.body.append(katman);
  sayfaKilit(true);
  oyunAc(katman, {
    oyun: id,
    azHareket: azHareket(),
    bebekSvg: yavruSvg({ asama: y.asama, ruh: 'mutlu', renk: y.renk, kisilik: y.kisilik || '', giyim: giyimOku(y) }),
    baglam: { room, renk: y.renk, kisilik: y.kisilik || '', giyim: giyimOku(y) },
    onBitti: oyunBitti,
    onCik: () => {
      katman.remove();
      sayfaKilit(false);
      oyunlarDugme.btn.focus({ preventScroll: true });
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

/** Mağaza: alt sayfa (magaza.js). Satın alma bakım günlüğüne yazılır ve partnere bildirilir. */
let magaza = null;
function magazaAc() {
  if (magaza || !y || y.asama === 'yumurta') return;
  magaza = magazaKatmani(document.body, {
    veri: () => y,
    kim: me.clientId,
    simdi: Date.now,
    sekme: 'giyim',
    bebekOpts: { renk: y.renk, kisilik: y.kisilik },
    onKapat: () => { magaza = null; },
    // Hata yakalanmaz: mağaza iletiyi kendisi gösterir.
    yaz: async (yama, kayit) => {
      await col.patch(M.BELGE_ID, yama);
      if (kayit) {
        bakim.put(kayit).catch(() => {});
        partnerBildir('satinal', { deger: kayit.deger });
      }
    },
  });
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
    parcalar([bit('yv-p-yemek', {}, null, renkliIkon(EYLEM_IKON[tur], 32))]);
  } else if (tur === 'oyna') {
    parcalar([bit('yv-p-top', {}, null, renkliIkon('top', 30))]);
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
  if (!M.ONEMLI.has(eylem)) writeStore('local', BILDIRIM_KEY, String(t));
  const metin = M.bildirimMetni({ ad: benAdi(), eylem, deger, yavruAd: y?.ad });
  bildir(roomId, { tur: 'oyun', baslik: 'Yavrumuz', metin, url: 'sayfalar/yavru/' })
    .catch((e) => console.warn('[yavru] bildirim gönderilemedi', e));
}

/** Android uygulamasında yerel hatırlatıcı (acıkma, uyanma, çişi var, çatlama, ay dönümü, doğum günü). Her ziyarette ve değişimde yeniden planlanır. */
function hatirlaticiPlanla() {
  if (!y) return;
  const dogumGunu = M.dogumGunuOlayi(y, simdi);
  const ay = M.ozelGunOlayi(y, simdi);
  const olaylar = [...M.hatirlaticiOlaylari(y, simdi), ...T.tuvaletOlaylari(y, simdi), ...(ay ? [ay] : []), ...(dogumGunu ? [dogumGunu] : [])];
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
    if (eylem === 'mum') {
      tepki('sev');
      sfx('pop');
    } else if (eylem in M.EYLEMLER || eylem === 'isit' || eylem === 'lazimlik') {
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
col.on('error', tazelik.koptu);
bakim.on('error', tazelik.koptu);
col.on('change', () => { ciz(); magaza?.guncelle(); });
bakim.on('change', () => { yeniBakimlar(); cizBakimlar(); cizGorev(); });
profil?.on('change', ciz);
room.on('presence', (p) => { partner = p || null; cizPartner(); cizPanel(); cizGorev(); });
room.on('message', (m, from) => { if (m?.tur === 'salla-davet') toast(`${from?.name || 'Sevgilin'} Birlikte Salla'da seni bekliyor 💞`); });
adGirdi.addEventListener('input', () => adGirdi.removeAttribute('aria-invalid'));
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    tazelik.gorundu();
    ciz();
  } else {
    tazelik.gizlendi();
  }
});
room.on('status', (st) => { if (st === 'online') tazelik.hemenDene(); });
window.addEventListener('online', tazelik.hemenDene);
window.addEventListener('offline', tazelik.koptu);

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
