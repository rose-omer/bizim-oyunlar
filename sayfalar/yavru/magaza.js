// Yavrumuz: mağaza (alt sayfa). Yiyecek al, kıyafet al, giy ve çıkar; giyimde canlı önizleme.
// Kural ve yama jeton.js (satinAl) ile giyim.js'ten gelir; yazımı çağıran yapar (yaz). Stil MAGAZA_CSS (ilk açılışta
// <head>'e bir kez eklenir; bebek stili yoksa o da eklenir). Üst düzeyde DOM yok: saf yardımcılar Node'da test edilir.
import { URUNLER, satinAl, jetonBakiye, dolaptaMi } from './jeton.js';
import { giyimOku, giyYamasi, cikarYamasi, yuvaBul } from './giyim.js';
import { bebekSvg, giyimParcaSvg, BEBEK_CSS } from './bebek.js';
import { CIZIM_CSS } from './cizim.js';

export const SEKMELER = Object.freeze([
  Object.freeze({ id: 'yiyecek', ad: 'Yiyecek', tur: 'yiyecek' }),
  Object.freeze({ id: 'giyim', ad: 'Giyim', tur: 'kiyafet' }),
]);
const ETKI_AD = { tokluk: 'tokluk', mutluluk: 'mutluluk', temizlik: 'temizlik', enerji: 'enerji' };

/** Sekmedeki ürün id'leri (katalog sırası; fiyata göre artan). */
export function sekmeUrunleri(sekme) {
  const tur = SEKMELER.find((s) => s.id === sekme)?.tur;
  return Object.keys(URUNLER).filter((id) => URUNLER[id].tur === tur).sort((a, b) => URUNLER[a].fiyat - URUNLER[b].fiyat);
}

/**
 * Kartın durumu. -> { durum, eksik? }
 * kıyafet: 'giyili' (Çıkar) | 'dolapta' (Giy) | 'al' | 'yetersiz';
 * yiyecek: 'al' | 'yetersiz' | 'yumurta' | 'uyuyor'.
 */
export function urunDurumu(y, urun, { kim, simdi }) {
  const u = URUNLER[urun];
  if (u.tur === 'kiyafet') {
    if (dolaptaMi(y, urun)) return { durum: giyimOku(y)[yuvaBul(urun)] === urun ? 'giyili' : 'dolapta' };
    const eksik = u.fiyat - jetonBakiye(y);
    return eksik > 0 ? { durum: 'yetersiz', eksik } : { durum: 'al' };
  }
  const r = satinAl(y, { kim, urun, simdi });
  if (!r.hata) return { durum: 'al' };
  if (r.hata === 'yetersiz') return { durum: 'yetersiz', eksik: r.eksik };
  return { durum: r.hata === 'uyuyor' ? 'uyuyor' : 'yumurta' };
}

/** Hata kodu → kullanıcıya Türkçe ileti. */
export function hataMetni(r) {
  switch (r?.hata) {
    case 'yetersiz': return `${r.eksik} jeton eksik`;
    case 'zaten': return 'Bu zaten dolapta.';
    case 'yumurta': return 'Yumurtadan çıkınca yiyebilir 🥚';
    case 'uyuyor': return 'Şşş, uyuyor 🌙 Uyanınca yedirelim.';
    case 'dolapta-yok': return 'Önce satın alalım.';
    default: return 'Bu ürün şu an alınamıyor.';
  }
}

/** Yiyecek etkisi kısa metin: '+10 tokluk · +5 mutluluk'. */
export function etkiMetni(urun) {
  const e = URUNLER[urun]?.etki || {};
  return Object.entries(e).map(([ad, n]) => `+${n} ${ETKI_AD[ad] || ad}`).join(' · ');
}

// ---------- DOM ----------

function el(tag, props = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'html') e.innerHTML = v; // yalnız kodla üretilen SVG
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of kids.flat()) if (c != null && c !== false) e.append(c);
  return e;
}

function stilEkle() {
  if (!document.getElementById('yv-cizim-stil') && !document.getElementById('yvm-bebek-stil')) {
    document.head.append(el('style', { id: 'yvm-bebek-stil' }, CIZIM_CSS + BEBEK_CSS));
  }
  if (!document.getElementById('yvm-stil')) document.head.append(el('style', { id: 'yvm-stil' }, MAGAZA_CSS));
}

const azHareket = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const ODAKLANIR = 'button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])';
const KAPAT_IKON = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>';

/**
 * Mağazayı açar. kok: eklenecek kap (genelde document.body).
 * veri: () => y (önerilen; her çizimde güncel belge) ya da y. y = mantik.js oku() + ham 'giyim'.
 * kim: clientId; simdi: () => ms; yaz: async (yama, kayit | null) => void (hata fırlatırsa ileti gösterilir);
 * bebekOpts: { renk, kisilik, asama? } önizleme için; sekme: 'yiyecek'|'giyim' (ilk sekme).
 * -> { kapat(), guncelle() } (guncelle: belge dışarıda değişince yeniden boya).
 */
export function magazaAc(kok, { veri, kim, simdi = () => Date.now(), yaz, bebekOpts = {}, sekme = 'yiyecek', onKapat } = {}) {
  stilEkle();
  const y = () => (typeof veri === 'function' ? veri() : veri);
  const onceOdak = document.activeElement;
  let aktif = SEKMELER.some((s) => s.id === sekme) ? sekme : 'yiyecek';
  let denenen = null; // giyim sekmesinde önizlemede denenen ürün
  let mesgul = false;
  let kapandi = false;

  const baslikId = `yvm-baslik-${Math.random().toString(36).slice(2, 8)}`;
  const bakiyeSayi = el('span', { class: 'yvm-bakiye-sayi' });
  const bakiye = el('p', { class: 'yvm-bakiye', 'aria-live': 'polite', 'aria-atomic': 'true' },
    el('span', { 'aria-hidden': 'true' }, '🪙'), el('span', { class: 'sr-only' }, 'Ortak jeton: '), bakiyeSayi);
  const kapatBtn = el('button', { type: 'button', class: 'yvm-kapat', 'aria-label': 'Mağazayı kapat', html: KAPAT_IKON, onclick: () => kapat() });

  const sekmeBtn = {};
  const paneller = {};
  const tablist = el('div', { class: 'yvm-sekmeler', role: 'tablist', 'aria-label': 'Ürün türü' });
  for (const s of SEKMELER) {
    sekmeBtn[s.id] = el('button', {
      type: 'button', role: 'tab', id: `${baslikId}-t-${s.id}`, 'aria-controls': `${baslikId}-p-${s.id}`,
      onclick: () => sekmeSec(s.id),
    }, s.ad);
    tablist.append(sekmeBtn[s.id]);
    paneller[s.id] = el('div', { class: 'yvm-panel', role: 'tabpanel', id: `${baslikId}-p-${s.id}`, 'aria-labelledby': `${baslikId}-t-${s.id}`, tabindex: '-1' });
  }
  tablist.addEventListener('keydown', (e) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
    e.preventDefault();
    const i = SEKMELER.findIndex((s) => s.id === aktif);
    const n = SEKMELER.length;
    const j = e.key === 'Home' ? 0 : e.key === 'End' ? n - 1 : (i + (e.key === 'ArrowRight' ? 1 : -1) + n) % n;
    sekmeSec(SEKMELER[j].id);
    sekmeBtn[SEKMELER[j].id].focus();
  });

  // Giyim önizlemesi
  const onizCizim = el('div', { class: 'yvm-oniz-cizim' });
  const onizMetin = el('p', { class: 'yvm-oniz-metin' });
  const onizNot = el('p', { class: 'yvm-oniz-not' });
  paneller.giyim.append(el('div', { class: 'yvm-oniz' }, onizCizim, el('div', { class: 'yvm-oniz-yazi' }, onizMetin, onizNot)));

  // Kartlar
  const kartlar = {};
  for (const s of SEKMELER) {
    const liste = el('ul', { class: 'yvm-izgara', role: 'list' });
    for (const id of sekmeUrunleri(s.id)) {
      const u = URUNLER[id];
      const adId = `${baslikId}-u-${id}`;
      const gorsel = u.tur === 'kiyafet'
        ? el('button', { type: 'button', class: 'yvm-gorsel yvm-dene', 'aria-pressed': 'false', 'aria-label': `${u.ad}: önizlemede dene`, html: giyimParcaSvg(id, { renk: bebekOpts.renk }), onclick: () => dene(id) })
        : el('span', { class: 'yvm-gorsel yvm-emoji', 'aria-hidden': 'true' }, u.emoji);
      const rozet = el('span', { class: 'yvm-rozet', hidden: true });
      const eylem = el('button', { type: 'button', class: 'btn small yvm-eylem', 'aria-describedby': adId, onclick: () => eylemYap(id) });
      const kart = el('li', { class: 'yvm-kart', 'data-urun': id },
        gorsel, rozet,
        el('h3', { class: 'yvm-ad', id: adId }, u.ad),
        u.tur === 'yiyecek' ? el('p', { class: 'yvm-etki' }, etkiMetni(id)) : null,
        el('p', { class: 'yvm-fiyat' }, el('span', { 'aria-hidden': 'true' }, '🪙 '), el('span', { class: 'sr-only' }, 'Fiyat: '), `${u.fiyat}`, el('span', { class: 'sr-only' }, ' jeton')),
        eylem);
      kartlar[id] = { kart, gorsel, rozet, eylem };
      liste.append(kart);
    }
    paneller[s.id].append(liste);
  }

  const durum = el('p', { class: 'yvm-durum', role: 'status' });
  const sayfa = el('section', { class: 'yvm-sayfa', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': baslikId },
    el('span', { class: 'yvm-tutamak', 'aria-hidden': 'true' }),
    el('header', { class: 'yvm-ust' }, el('h2', { class: 'yvm-baslik', id: baslikId }, 'Mağaza'), bakiye, kapatBtn),
    tablist,
    el('div', { class: 'yvm-govde' }, ...SEKMELER.map((s) => paneller[s.id])),
    durum);
  const renk = bebekOpts.renk ?? y()?.renk;
  const kat = el('div', { class: 'yvm-kat', style: `--yv-govde:var(--yv-r${Number.isInteger(renk) && renk >= 1 && renk <= 6 ? renk : 1})` }, el('div', { class: 'yvm-perde', 'aria-hidden': 'true', onclick: () => kapat() }), sayfa);

  // Arka plan odak ve dokunuş almaz (odak tuzağının asıl kısmı); Tab yine de sayfa içinde döner.
  const inertler = [...kok.children].filter((c) => !c.inert && c.tagName !== 'SCRIPT');
  for (const c of inertler) c.inert = true;
  const eskiTasma = document.documentElement.style.overflow;
  document.documentElement.style.overflow = 'hidden';
  kok.append(kat);

  function tusla(e) {
    if (e.key === 'Escape') { e.preventDefault(); kapat(); return; }
    if (e.key !== 'Tab') return;
    const odak = [...sayfa.querySelectorAll(ODAKLANIR)].filter((x) => !x.closest('[hidden]'));
    if (!odak.length) return;
    const ilk = odak[0];
    const son = odak[odak.length - 1];
    if (e.shiftKey && (document.activeElement === ilk || !sayfa.contains(document.activeElement))) { e.preventDefault(); son.focus(); }
    else if (!e.shiftKey && (document.activeElement === son || !sayfa.contains(document.activeElement))) { e.preventDefault(); ilk.focus(); }
  }
  document.addEventListener('keydown', tusla);

  function mesaj(metin, tur = '') {
    durum.textContent = metin;
    durum.dataset.tur = tur;
  }

  function sekmeSec(id) {
    aktif = id;
    mesaj('');
    boya();
  }

  function dene(id) {
    denenen = denenen === id ? null : id;
    mesaj('');
    boya();
  }

  const ETIKET = { al: 'Al', yetersiz: 'Yetersiz', dolapta: 'Giy', giyili: 'Çıkar', yumurta: 'Al', uyuyor: 'Uyuyor' };

  function boya() {
    const v = y();
    const t = simdi();
    bakiyeSayi.textContent = String(Math.max(0, jetonBakiye(v)));
    for (const s of SEKMELER) {
      const secili = s.id === aktif;
      sekmeBtn[s.id].setAttribute('aria-selected', String(secili));
      sekmeBtn[s.id].tabIndex = secili ? 0 : -1;
      paneller[s.id].hidden = !secili;
    }
    for (const [id, k] of Object.entries(kartlar)) {
      const d = urunDurumu(v, id, { kim, simdi: t });
      k.kart.dataset.durum = d.durum;
      k.eylem.textContent = ETIKET[d.durum];
      k.eylem.classList.toggle('primary', d.durum === 'al' || d.durum === 'dolapta');
      const pasif = d.durum === 'yetersiz' || d.durum === 'yumurta' || d.durum === 'uyuyor';
      if (pasif) k.eylem.setAttribute('aria-disabled', 'true'); else k.eylem.removeAttribute('aria-disabled');
      k.eylem.disabled = mesgul;
      const rozet = d.durum === 'giyili' ? 'Üstünde' : d.durum === 'dolapta' ? 'Dolapta' : d.durum === 'yetersiz' ? `${d.eksik} eksik` : '';
      k.rozet.textContent = rozet;
      k.rozet.hidden = !rozet;
      k.rozet.dataset.tur = d.durum;
      if (k.gorsel.tagName === 'BUTTON') k.gorsel.setAttribute('aria-pressed', String(denenen === id));
    }
    if (aktif === 'giyim') onizBoya(v);
  }

  function onizBoya(v) {
    const giyili = giyimOku(v);
    const giyim = { ...giyili };
    if (denenen) giyim[yuvaBul(denenen)] = denenen;
    const asama = bebekOpts.asama || (v?.asama === 'buyuk' ? 'buyuk' : 'kucuk');
    const renk = bebekOpts.renk ?? v?.renk;
    const kisilik = bebekOpts.kisilik ?? v?.kisilik ?? '';
    const anahtar = JSON.stringify([asama, renk, kisilik, giyim]);
    if (onizCizim.dataset.anahtar !== anahtar) {
      onizCizim.dataset.anahtar = anahtar;
      onizCizim.innerHTML = bebekSvg({ asama, renk, kisilik, giyim, ruh: 'mutlu', etiket: 'Önizleme' });
    }
    const adlar = Object.values(giyili).filter(Boolean).map((id) => URUNLER[id].ad);
    onizMetin.textContent = denenen && giyili[yuvaBul(denenen)] !== denenen
      ? `${URUNLER[denenen].ad} deneniyor`
      : adlar.length ? `Üstünde: ${adlar.join(', ')}` : 'Bir aksesuar seç, üstünde dene';
    onizNot.textContent = asama === 'kucuk' ? 'Kundaktayken yalnız başlık görünür; gözlük ve atkı büyüyünce.' : '';
  }

  async function eylemYap(id) {
    if (mesgul) return;
    const v = y();
    const t = simdi();
    const u = URUNLER[id];
    const d = urunDurumu(v, id, { kim, simdi: t });
    let r;
    let kayit = null;
    let basari = '';
    if (d.durum === 'giyili') {
      r = cikarYamasi(v, { yuva: yuvaBul(id) });
      basari = `${u.ad} çıkarıldı`;
    } else if (d.durum === 'dolapta') {
      r = giyYamasi(v, { urun: id });
      basari = `${u.ad} çok yakıştı ✨`;
      denenen = null;
    } else {
      r = satinAl(v, { kim, urun: id, simdi: t });
      kayit = r.kayit || null;
      basari = u.tur === 'kiyafet' ? `${u.emoji} ${u.ad} dolaba girdi. Hemen giydirelim mi?` : `${u.emoji} Afiyet olsun!`;
      if (u.tur === 'kiyafet') denenen = id;
    }
    if (r.hata) { mesaj(hataMetni(r), 'hata'); return; }
    mesgul = true;
    sayfa.setAttribute('aria-busy', 'true');
    boya();
    try {
      await yaz(r.yama, kayit);
      mesaj(basari, 'iyi');
    } catch (e) {
      mesaj(e?.message || 'Kaydedilemedi. Bağlantını kontrol et.', 'hata');
    }
    mesgul = false;
    sayfa.removeAttribute('aria-busy');
    if (!kapandi) {
      boya();
      // Odak, yeniden etkinleşen düğmede kalsın (disabled odak düşürür).
      if (!sayfa.contains(document.activeElement)) kartlar[id].eylem.focus();
    }
  }

  function kapat() {
    if (kapandi) return;
    kapandi = true;
    document.removeEventListener('keydown', tusla);
    for (const c of inertler) c.inert = false;
    document.documentElement.style.overflow = eskiTasma;
    const bitir = () => { kat.remove(); onKapat?.(); };
    if (azHareket()) bitir();
    else { kat.classList.add('kapaniyor'); setTimeout(bitir, 220); }
    if (onceOdak && typeof onceOdak.focus === 'function' && onceOdak.isConnected) onceOdak.focus();
  }

  boya();
  // Odak pencerenin kendisinde: ekran okuyucu başlığı okur; dokunmatikte sekmede odak halkası görünmez.
  sayfa.tabIndex = -1;
  sayfa.focus({ preventScroll: true });
  return { kapat, guncelle: () => { if (!kapandi) boya(); } };
}

/** Mağaza stili (yvm-*). Renkler base.css değişkenlerinden; iki tema; hareket yalnız isteyene. */
export const MAGAZA_CSS = `
.yvm-kat { position: fixed; inset: 0; z-index: 870; display: grid; align-items: end; justify-items: center; }
.yvm-perde { position: absolute; inset: 0; background: var(--overlay); -webkit-backdrop-filter: blur(3px); backdrop-filter: blur(3px); }
.yvm-sayfa {
  position: relative; display: flex; flex-direction: column;
  width: 100%; max-width: 520px; max-height: min(88dvh, 760px);
  border-radius: var(--radius-lg) var(--radius-lg) 0 0;
  background: var(--bg); color: var(--text); box-shadow: var(--shadow-lg);
  padding: 8px 0 calc(8px + var(--safe-bottom));
  overscroll-behavior: contain;
}
.yvm-tutamak { align-self: center; width: 40px; height: 5px; border-radius: 3px; background: var(--line); margin-bottom: 4px; }
.yvm-ust { display: flex; align-items: center; gap: 10px; padding: 4px 12px 8px 20px; }
.yvm-baslik { margin: 0; flex: 1; font-family: var(--font-display); font-size: 1.5rem; font-weight: 600; letter-spacing: -0.01em; font-variation-settings: 'SOFT' 100; }
.yvm-bakiye {
  display: inline-flex; align-items: center; gap: 6px; margin: 0; min-height: 36px; padding: 0 14px;
  border-radius: var(--radius-pill); background: var(--surface-2); color: var(--text);
  font-weight: 800; font-size: 1.0625rem; font-variant-numeric: tabular-nums;
}
.yvm-kapat {
  display: grid; place-items: center; width: 44px; height: 44px; flex: none;
  border: 0; border-radius: 50%; background: transparent; color: var(--muted); cursor: pointer;
}
.yvm-kapat svg { width: 22px; height: 22px; }
.yvm-kapat:focus-visible, .yvm-sekmeler > button:focus-visible, .yvm-dene:focus-visible, .yvm-eylem:focus-visible {
  outline: 3px solid var(--focus); outline-offset: 2px;
}
@media (hover: hover) { .yvm-kapat:hover { background: var(--surface-2); color: var(--text); } }
.yvm-sekmeler {
  display: grid; grid-template-columns: 1fr 1fr; gap: 4px; margin: 0 16px 10px; padding: 4px;
  border-radius: 18px; background: var(--surface-2);
}
.yvm-sekmeler > button {
  min-height: 44px; border: 0; border-radius: 14px; background: transparent; color: var(--muted);
  font: inherit; font-weight: 750; cursor: pointer;
  transition: background-color 0.15s ease, color 0.15s ease, box-shadow 0.15s ease;
}
.yvm-sekmeler > button[aria-selected='true'] {
  background: var(--raised); color: var(--text);
  box-shadow: var(--shadow-sm), inset 0 0 0 1.5px color-mix(in srgb, var(--accent) 45%, transparent);
}
.yvm-govde { flex: 1; min-height: 0; overflow-y: auto; padding: 2px 16px 8px; scrollbar-width: thin; scrollbar-color: var(--line) transparent; }
.yvm-panel:focus, .yvm-sayfa:focus { outline: none; }
.yvm-izgara { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 10px; }
.yvm-kart {
  position: relative; display: grid; grid-template-rows: auto auto auto 1fr auto; gap: 2px;
  padding: 10px 10px 12px; border-radius: var(--radius-lg); background: var(--surface);
  border: 1.5px solid var(--line); box-shadow: var(--shadow-sm);
}
.yvm-kart[data-durum='giyili'] { border-color: color-mix(in srgb, var(--accent) 55%, var(--line)); }
.yvm-gorsel {
  display: grid; place-items: center; height: 84px; margin-bottom: 6px;
  border-radius: var(--radius); background: var(--surface-2);
}
.yvm-emoji { font-size: 2.75rem; line-height: 1; }
.yvm-dene { width: 100%; padding: 12px 16px; border: 2px solid transparent; cursor: pointer; color: inherit; font: inherit; }
.yvm-dene svg { width: 100%; height: 100%; }
.yvm-dene[aria-pressed='true'] { border-color: var(--accent); background: var(--accent-soft); }
.yvm-rozet {
  position: absolute; top: 16px; right: 16px; padding: 2px 8px; border-radius: var(--radius-pill);
  background: var(--surface); color: var(--muted); font-size: 0.75rem; font-weight: 800; box-shadow: var(--shadow-sm);
}
.yvm-rozet[data-tur='giyili'] { background: var(--accent); color: var(--accent-ink); }
.yvm-rozet[data-tur='dolapta'] { background: var(--good-soft); color: var(--good); }
.yvm-ad { margin: 0; font-size: 1rem; font-weight: 800; line-height: 1.25; }
.yvm-etki { margin: 0; color: var(--muted); font-size: 0.8125rem; line-height: 1.35; }
.yvm-fiyat { margin: 2px 0 8px; font-weight: 800; font-variant-numeric: tabular-nums; color: var(--text); }
.yvm-eylem { width: 100%; min-height: 44px; }
.yvm-eylem[aria-disabled='true'] { opacity: 1; --btn-bg: var(--surface-2); --btn-line: transparent; --btn-ink: var(--muted); }
.yvm-oniz {
  /* Yapışkan: aşağıdaki aksesuarı denerken önizleme görünür kalır. */
  position: sticky; top: 0; z-index: 1; box-shadow: 0 6px 12px -10px rgb(0 0 0 / 0.35);
  display: grid; grid-template-columns: 116px 1fr; align-items: center; gap: 12px;
  margin-bottom: 12px; padding: 8px 14px 8px 8px; border-radius: var(--radius-lg);
  background: color-mix(in srgb, var(--yv-govde) 32%, var(--surface));
}
.yvm-oniz-cizim { width: 116px; aspect-ratio: 1; }
.yvm-oniz-metin { margin: 0; font-family: var(--font-display); font-size: 1.125rem; font-weight: 600; line-height: 1.3; text-wrap: balance; }
.yvm-oniz-not { margin: 4px 0 0; color: var(--muted); font-size: 0.8125rem; line-height: 1.4; }
.yvm-oniz-not:empty { display: none; }
.yvm-durum { min-height: 1.5em; margin: 6px 20px 0; font-weight: 750; font-size: 0.9375rem; text-align: center; color: var(--text); }
.yvm-durum[data-tur='hata'] { color: var(--bad); }
.yvm-durum[data-tur='iyi'] { color: var(--good); }
@media (prefers-color-scheme: dark) {
  :root:not([data-mod="acik"]) .yvm-oniz { background: color-mix(in srgb, var(--yv-govde) 14%, var(--surface)); }
  :root:not([data-mod="acik"]) .yvm-dene { background: color-mix(in srgb, var(--hero-ink) 86%, var(--yv-govde)); }
}
:root[data-mod="koyu"] .yvm-oniz { background: color-mix(in srgb, var(--yv-govde) 14%, var(--surface)); }
/* Koyu temada aksesuar karosu açık: koyu çerçeve ve şapka seçilsin (pastel bebek gibi iki temada aynı). */
:root[data-mod="koyu"] .yvm-dene { background: color-mix(in srgb, var(--hero-ink) 86%, var(--yv-govde)); }
@media (prefers-reduced-motion: no-preference) {
  .yvm-perde { animation: yvm-sol 0.22s ease-out both; }
  .yvm-sayfa { animation: yvm-yuksel 0.34s cubic-bezier(0.16, 1, 0.3, 1) both; }
  .yvm-kat.kapaniyor .yvm-perde { animation: yvm-sol 0.2s ease-in reverse both; }
  .yvm-kat.kapaniyor .yvm-sayfa { animation: yvm-in 0.2s ease-in both; }
  .yvm-dene, .yvm-kart { transition: border-color 0.15s ease, background-color 0.15s ease; }
}
@keyframes yvm-sol { from { opacity: 0; } }
@keyframes yvm-yuksel { from { transform: translateY(48px); opacity: 0; } }
@keyframes yvm-in { to { transform: translateY(40px); opacity: 0; } }
`;
