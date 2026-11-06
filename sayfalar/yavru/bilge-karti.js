// Yavrumuz kartı: bebeğin adına dokununca açılan alt sayfanın içeriği (ad bebeğe göre değişir; alt-sayfa.js ile açılır).
// buyumeAdimlari, siradakiMetin, siradakiSatir saf. Kart yalnız bilgeKartiKur içinde DOM kurar: modül Node'da yüklenir.
// Ad, ihtiyaç ve bakım alanları app.js'in kalıcı öğeleridir; kart yerleştirir, kopyalamaz.
import { h } from '../../js/core/ui.js';
import { daysBetween, daysInMonth, leftText, parseDay, toDay } from '../../js/core/gunler.js';
import { ikon } from './ikonlar.js';
import { ayYasi, EVRELER, evreSon } from './evre.js';
import { buyumeDurumu, dogumGunu } from './mantik.js';

const evreAdi = (ay) => (ay % 12 ? `${ay} ay` : `${ay / 12} yaş`);
const ADIMLAR = Object.freeze([
  { id: 'yumurta', ad: 'Yumurta' }, { id: 'kucuk', ad: 'Küçük' }, { id: 'buyuk', ad: 'Büyük' },
  ...EVRELER.map((e) => ({ id: e.id, ad: evreAdi(e.ay) })),
]);

/** -> [{ id, ad, durum: 'gecti'|'simdi'|'sonra' }]. Şimdiki adım: yazılmış son evre, yoksa aşama. */
export function buyumeAdimlari(y) {
  const simdi = Math.max(0, ADIMLAR.findIndex((a) => a.id === (evreSon(y)?.id ?? y?.asama)));
  return ADIMLAR.map((a, i) => ({ ...a, durum: i < simdi ? 'gecti' : i === simdi ? 'simdi' : 'sonra' }));
}

// durationParts ile aynı kural: ayın o günü yoksa ayın son günü. gunler.js'te ay ekleyen dışa açık işlev yok.
function ayEkle(gun, ay) {
  const p = parseDay(gun);
  const t = p.m - 1 + ay;
  const yil = p.y + Math.floor(t / 12);
  const m = (t % 12) + 1;
  return toDay({ y: yil, m, d: Math.min(p.d, daysInMonth(yil, m)) });
}

function siradakiBul(y, simdi) {
  const gun = y?.asama === 'buyuk' ? dogumGunu(y) : null;
  if (!gun) return null;
  const esik = Math.max(ayYasi(y, simdi), evreSon(y)?.ay ?? 0);
  const evre = EVRELER.find((e) => e.ay > esik);
  return evre ? { evre, kalanGun: daysBetween(toDay(new Date(simdi)), ayEkle(gun, evre.ay)) } : null;
}

/** Büyük aşamada sıradaki evre: { unvan, kalanGun } | null (başka aşama ya da bitti). */
export function siradakiMetin(y, simdi) {
  const s = siradakiBul(y, simdi);
  return s && { unvan: s.evre.unvan, kalanGun: s.kalanGun };
}

/** Karttaki satır: { ne: '1 aylıkken Meraklı minik', kalan: '24 gün kaldı' } | null. */
export function siradakiSatir(y, simdi) {
  const s = siradakiBul(y, simdi);
  if (!s) return null;
  const yas = s.evre.ay % 12 ? `${s.evre.ay} aylıkken` : `${s.evre.ay / 12} yaşındayken`;
  return { ne: `${yas} ${s.evre.unvan}`, kalan: leftText(s.kalanGun) };
}

const puanMetni = (n) => n.toLocaleString('tr-TR', { maximumFractionDigits: 1 });

/** -> { el, guncelle({ y, simdi, portreSvg, kisilik, buyumeMetni, seriN, yasMetni, sesAcik, onSes }) } */
export function bilgeKartiKur({ adAlani, ihtiyacAlani, bakimAlani }) {
  const portre = h('div', { class: 'yvk-portre' });
  const kisilikAd = h('b', { class: 'yvk-kisilik-ad' });
  const kisilikAciklama = h('span');
  const kisilikEl = h('p', { class: 'yvk-kisilik' }, kisilikAd, ' ', kisilikAciklama);

  const adimlar = ADIMLAR.map((a) => h('li', { class: 'yvk-adim' },
    h('span', { class: 'yvk-yuva' }, h('span', { class: 'yvk-nokta' })),
    h('span', { class: 'yvk-etiket' }, a.ad)));
  const buyumeEl = h('p', { class: 'yvk-buyume' });
  const siradakiNe = h('span');
  const siradakiKalan = h('span');
  const siradakiEl = h('p', { class: 'yvk-siradaki' },
    h('span', { class: 'yvk-soluk' }, 'Sıradaki:'), ' ', siradakiNe, ' ',
    h('span', { class: 'yvk-soluk' }, '· ', siradakiKalan));

  const sayi = (etiket) => {
    const deger = h('dd', { class: 'yvk-sayi-deger' });
    return { deger, el: h('div', { class: 'yvk-sayi' }, h('dt', { class: 'yvk-sayi-etiket' }, etiket), deger) };
  };
  const bakim = sayi('Birlikte bakım');
  const seri = sayi('Görev serisi');
  const yas = sayi('Yaşı');

  let sonOnSes = null;
  const sesIkon = h('span', { class: 'yvk-ses-ikon' });
  const sesYazi = h('span');
  const sesBtn = h('button', { type: 'button', class: 'yvk-ses', onclick: () => sonOnSes?.() }, sesIkon, sesYazi);

  const el = h('div', { class: 'yvk-kart' },
    portre,
    h('div', { class: 'yvk-kimlik' }, adAlani, kisilikEl),
    h('div', { class: 'yvk-gelisim' },
      h('ol', { class: 'yvk-zaman', 'aria-label': 'Büyüme adımları' }, adimlar),
      buyumeEl, siradakiEl),
    h('dl', { class: 'yvk-sayilar' }, bakim.el, seri.el, yas.el),
    ihtiyacAlani,
    bakimAlani,
    sesBtn);

  let sonPortre = null;
  let sonSes = null;
  function guncelle({ y, simdi, portreSvg, kisilik, buyumeMetni, seriN, yasMetni, sesAcik, onSes }) {
    const svg = portreSvg ?? '';
    if (svg !== sonPortre) {
      portre.innerHTML = svg;
      sonPortre = svg;
    }

    kisilikEl.hidden = !kisilik;
    if (kisilik) {
      kisilikAd.textContent = `${kisilik.ad}.`;
      kisilikAciklama.textContent = kisilik.aciklama;
    }

    buyumeAdimlari(y).forEach((a, i) => {
      adimlar[i].dataset.durum = a.durum;
      if (a.durum === 'simdi') adimlar[i].setAttribute('aria-current', 'step');
      else adimlar[i].removeAttribute('aria-current');
    });

    // Büyük aşamada app.js'in büyüme metni "Birlikte N bakım" der; o sayı aşağıda zaten var.
    const buyume = y?.asama === 'kucuk' ? buyumeMetni : '';
    buyumeEl.hidden = !buyume;
    buyumeEl.textContent = buyume || '';

    const s = siradakiSatir(y, simdi);
    siradakiEl.hidden = !s;
    if (s) {
      siradakiNe.textContent = s.ne;
      siradakiKalan.textContent = s.kalan;
    }

    bakim.deger.textContent = puanMetni(buyumeDurumu(y, simdi).toplam);
    seri.deger.textContent = `${seriN || 0} gün`;
    yas.deger.textContent = yasMetni ?? '';

    sonOnSes = onSes;
    const acik = !!sesAcik;
    if (acik !== sonSes) {
      sonSes = acik;
      sesIkon.innerHTML = ikon(acik ? 'ses' : 'sessiz', 22);
      sesYazi.textContent = acik ? 'Ses açık' : 'Ses kapalı';
      sesBtn.setAttribute('aria-pressed', String(acik));
    }
  }

  return { el, guncelle };
}

export const CSS = `
.yvk-kart { display: flex; flex-direction: column; gap: 18px; min-width: 0; font-family: var(--font-body); font-size: 0.9375rem; }
.yvk-kart [hidden] { display: none; }

.yvk-portre {
  display: flex; justify-content: center; height: clamp(11rem, 32dvh, 16.375rem); overflow: hidden;
  border-radius: 22px; background: var(--surface-2);
}
.yvk-portre > svg { display: block; width: auto; height: 100%; max-width: 100%; aspect-ratio: 1; }

.yvk-kimlik { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.yvk-kisilik { margin: 0; color: var(--muted); font-weight: 600; line-height: 1.4; }
.yvk-kisilik-ad { color: var(--text); font-weight: 800; }

.yvk-gelisim { display: flex; flex-direction: column; gap: 12px; min-width: 0; }
.yvk-zaman { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); margin: 0; padding: 0; list-style: none; }
.yvk-adim { position: relative; display: flex; flex-direction: column; align-items: center; gap: 7px; min-width: 0; color: var(--muted); }
.yvk-adim:not(:first-child)::before {
  content: ''; position: absolute; top: 11px; right: 50%; width: 100%; height: 3px; background: var(--line);
}
.yvk-adim:not(:first-child)[data-durum='gecti']::before,
.yvk-adim:not(:first-child)[data-durum='simdi']::before { background: var(--accent); }
.yvk-yuva { position: relative; z-index: 1; display: grid; place-items: center; height: 25px; }
.yvk-nokta { display: block; box-sizing: border-box; width: 14px; height: 14px; border: 2px solid var(--muted); border-radius: 50%; background: var(--surface-2); }
.yvk-adim[data-durum='gecti'] .yvk-nokta { border: 0; background: var(--accent); }
.yvk-adim[data-durum='simdi'] .yvk-nokta { width: 24px; height: 24px; border: 0; background: var(--accent); box-shadow: 0 0 0 4px var(--accent-soft); }
.yvk-etiket { font-size: 0.75rem; font-weight: 700; line-height: 1.2; white-space: nowrap; }
.yvk-adim[data-durum='simdi'] .yvk-etiket { color: var(--text); font-weight: 800; }
/* 320 px: "Yumurta" ile "Küçük" çarpışmasın; sütunlar sayfa boşluğuna taşar. */
@media (max-width: 340px) { .yvk-zaman { margin-inline: -10px; } }

.yvk-buyume, .yv-buyume { margin: 0; color: var(--muted); font-size: 0.8125rem; font-weight: 700; line-height: 1.4; }
.yv-buyume[hidden] { display: none; }
.yvk-siradaki { margin: 0; font-weight: 700; line-height: 1.35; }
.yvk-soluk { color: var(--muted); }

.yvk-sayilar {
  display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; margin: 0; padding: 14px 0;
  border-top: 1px solid var(--line); border-bottom: 1px solid var(--line);
}
.yvk-sayi { display: flex; flex-direction: column-reverse; justify-content: flex-end; gap: 1px; min-width: 0; }
.yvk-sayi-deger {
  margin: 0; font-family: var(--font-display); font-size: 1.25rem; font-weight: 600; font-variation-settings: 'SOFT' 100;
  font-variant-numeric: tabular-nums; line-height: 1.15; overflow-wrap: anywhere;
}
.yvk-sayi-etiket { color: var(--muted); font-size: 0.8125rem; font-weight: 700; line-height: 1.25; }

.yvk-ses {
  display: flex; align-items: center; gap: 11px; width: 100%; min-height: 44px; padding: 6px 0 0;
  border: 0; border-top: 1px solid var(--line); background: none; color: inherit;
  font: inherit; font-weight: 700; text-align: left; cursor: pointer;
}
.yvk-ses:focus-visible { outline: 3px solid var(--focus); outline-offset: 2px; }
.yvk-ses-ikon { display: block; flex: none; color: var(--muted); }

.yv-bilgi { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.yv-ad-satir { display: flex; align-items: center; gap: 8px; min-width: 0; }
.yv-ad-satir[hidden] { display: none; }
.yv-ad {
  min-width: 0; margin: 0; font-family: var(--font-display); font-size: 1.625rem; font-weight: 600;
  font-variation-settings: 'SOFT' 100; line-height: 1.15; overflow-wrap: anywhere;
}
.yv-ad-btn { margin: -8px 0; color: var(--muted); }
.yv-ad-btn[hidden] { display: none; }

.yv-adform { display: flex; flex-direction: column; gap: 10px; padding: 14px; border-radius: 18px; background: var(--surface-2); }
.yv-adform[hidden] { display: none; }
.yv-adform-baslik {
  color: var(--text); font-family: var(--font-display); font-size: 1.25rem; font-weight: 600;
  font-variation-settings: 'SOFT' 100; line-height: 1.25;
}
.yv-adform-dugmeler { display: flex; justify-content: flex-end; gap: 8px; }
.yv-adform-dugmeler .btn[hidden] { display: none; }
@media (max-width: 480px) { .yv-adform-dugmeler .btn.primary { flex: 1 1 auto; } }
.yv-ad-oneri { display: flex; flex-wrap: wrap; gap: 8px; }
.yv-ad-oneri[hidden] { display: none; }
.yv-ad-oneri .btn { min-height: 44px; }

.yv-ihtiyaclar { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px 18px; }
.yv-ihtiyaclar[hidden] { display: none; }
.yv-ihtiyac { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.yv-ihtiyac-bas { display: flex; align-items: center; gap: 6px; min-width: 0; font-size: 0.8125rem; font-weight: 800; line-height: 1.2; }
.yv-ihtiyac-ikon { display: grid; place-items: center; flex: none; width: 22px; height: 22px; color: var(--muted); }
.yv-ihtiyac-ikon svg { width: 20px; height: 20px; }
.yv-ihtiyac-ad { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.yv-ihtiyac-deger { margin-left: auto; color: var(--muted); font-variant-numeric: tabular-nums; }
.yv-cubuk { display: block; height: 8px; overflow: hidden; border-radius: 999px; background: var(--surface-2); }
.yv-cubuk-dolu { display: block; height: 100%; border-radius: inherit; background: var(--muted); }
.yv-ihtiyac[data-dusuk] .yv-cubuk-dolu { background: var(--accent); }
.yv-ihtiyac[data-dusuk] .yv-ihtiyac-ikon,
.yv-ihtiyac[data-dusuk] .yv-ihtiyac-deger { color: var(--accent); }
/* Tuvalet: çubuk sıkışıklık (dolu = çişi var), sakinken soluk. */
.yv-tuvalet { grid-column: 1 / -1; }
.yv-tuvalet .yv-cubuk-dolu { opacity: 0.45; }
.yv-tuvalet[data-dusuk] .yv-cubuk-dolu { opacity: 1; }

.yv-son { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.yv-son > h2 {
  margin: 0; font-family: var(--font-display); font-size: 1.25rem; font-weight: 600;
  font-variation-settings: 'SOFT' 100; line-height: 1.25;
}
.yv-bakimlar { display: flex; flex-direction: column; margin: 0; padding: 0; list-style: none; }
.yv-bakimlar[hidden] { display: none; }
.yv-bakim { display: flex; align-items: center; gap: 11px; min-height: 44px; font-size: 0.9375rem; font-weight: 700; line-height: 1.35; }
.yv-bakim .yv-ikon { color: var(--muted); }
.yv-bakim-metin { flex: 1; min-width: 0; overflow-wrap: anywhere; }
.yv-bakim-zaman { flex: none; color: var(--muted); font-size: 0.8125rem; font-variant-numeric: tabular-nums; white-space: nowrap; }
.yv-bos { margin: 0; padding: 8px 0; color: var(--muted); font-size: 0.9375rem; font-weight: 600; }
.yv-bos[hidden] { display: none; }
.yv-yukleniyor { padding: 48px 0; text-align: center; }

@media (prefers-reduced-motion: no-preference) {
  .yv-cubuk-dolu { transition: width 0.6s var(--ease), background-color 0.3s ease; }
}
`;
