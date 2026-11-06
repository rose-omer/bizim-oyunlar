// Yavrumuz: mağaza (alt sayfa). Yiyecek al, kıyafet al (alınca hemen giyilir), giy ve çıkar; giyimde canlı önizleme.
// Kural ve yama jeton.js (satinAl) ile giyim.js'ten gelir; yazımı çağıran yapar (yaz). Stil MAGAZA_CSS (ilk açılışta
// <head>'e bir kez eklenir; bebek stili yoksa o da eklenir). Üst düzeyde DOM yok: saf yardımcılar Node'da test edilir.
import { URUNLER, satinAl, jetonBakiye, dolaptaMi, pastaBedavaMi } from './jeton.js';
import { urunKilidi } from './evre.js';
import { giyimOku, giyYamasi, cikarYamasi, yuvaBul, satinAlGiyYamasi, YUVALAR } from './giyim.js';
import { bebekSvg, giyimParcaSvg, BEBEK_CSS } from './bebek.js';
import { CIZIM_CSS } from './cizim.js';
import { ikon, paraIkon } from './ikonlar.js';

export const SEKMELER = Object.freeze([
  Object.freeze({ id: 'yiyecek', ad: 'Yiyecek', tur: 'yiyecek' }),
  Object.freeze({ id: 'giyim', ad: 'Giyim', tur: 'kiyafet' }),
]);
const GORUNEN_SEKMELER = Object.freeze([...SEKMELER].reverse()); // Ekranda: Giyim | Yiyecek.
const ETKI_AD = { tokluk: 'tokluk', mutluluk: 'mutluluk', temizlik: 'temizlik', enerji: 'enerji' };

/** Giyim sekmesi filtreleri; 'tumu' dışındaki id, giyim.js YUVALAR anahtarıdır. */
export const FILTRELER = Object.freeze([
  Object.freeze({ id: 'tumu', ad: 'Tümü' }),
  Object.freeze({ id: 'govde', ad: 'Kıyafet' }),
  Object.freeze({ id: 'bas', ad: 'Başlık' }),
  Object.freeze({ id: 'goz', ad: 'Gözlük' }),
  Object.freeze({ id: 'boyun', ad: 'Boyun' }),
  Object.freeze({ id: 'agiz', ad: 'Emzik' }),
  Object.freeze({ id: 'kucak', ad: 'Kucak' }),
]);

const yiyecekSvg = (d) => `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="${d}"/></svg>`;

/** Yiyecek kartı çizimleri: ikonlar.js ile aynı çizgi dili (24×24, currentColor). */
export const YIYECEK_CIZIM = Object.freeze({
  cilek: yiyecekSvg('M12 21.5c-3.6-1.7-7.5-5.8-7.5-10 0-2.7 2-4.5 4.4-4.5 1.2 0 2.3.4 3.1 1.2.8-.8 1.9-1.2 3.1-1.2 2.4 0 4.4 1.8 4.4 4.5 0 4.2-3.9 8.3-7.5 10ZM8 3.8c.4 2 1.8 3.7 4 4.4 2.2-.7 3.6-2.4 4-4.4M12 8.2V3M9 12v.01M15 12v.01M12 14v.01M9.8 16.5v.01M14.2 16.5v.01'),
  kurabiye: yiyecekSvg('M12 3.5a8.5 8.5 0 1 0 8.5 8.5c-2.4 0-3.7-1-3.5-2.8-2.7.1-5.2-1.9-5-5.7ZM9 9.5v.01M8.5 14.5v.01M13 12.5v.01M12.5 17v.01M16.5 15v.01'),
  dondurma: yiyecekSvg('M7 11.5a5.5 5.5 0 1 1 10 0M6 11.5h12M7.2 11.5l4.8 10 4.8-10M9.3 15.9l3.7-4.4M14.7 15.9 11 11.5'),
  pizza: yiyecekSvg('M12 21.5 4.2 7.2c4.9-2.6 10.7-2.6 15.6 0L12 21.5ZM5.6 9.8c4-2 8.8-2 12.8 0M10 13.2v.01M14.2 13.7v.01M12 17.5v.01'),
  pasta: yiyecekSvg('M4.5 21v-7.5A1.5 1.5 0 0 1 6 12h12a1.5 1.5 0 0 1 1.5 1.5V21M3 21h18M4.5 16.2c2.5 1.6 5 1.6 7.5 0s5-1.6 7.5 0M12 12V8.5M12 5.8c-.9-.8-.9-1.8 0-2.8.9 1 .9 2 0 2.8Z'),
});

/** Sekmedeki ürün id'leri (katalog sırası; fiyata göre artan). */
export function sekmeUrunleri(sekme) {
  const tur = SEKMELER.find((s) => s.id === sekme)?.tur;
  return Object.keys(URUNLER).filter((id) => URUNLER[id].tur === tur).sort((a, b) => URUNLER[a].fiyat - URUNLER[b].fiyat);
}

/** Giyim sekmesinde filtrenin ürünleri (sekmeUrunleri sırası). Bilinmeyen filtre: tümü. */
export function filtreliUrunler(filtre) {
  const tumu = sekmeUrunleri('giyim');
  return Object.hasOwn(YUVALAR, filtre ?? '') ? tumu.filter((id) => YUVALAR[filtre].includes(id)) : tumu;
}

/** Önizleme bandının ürünü. denenen önce; yoksa üstündeki (kıyafet önce). -> { urun, giyili } | null. giyili: giyimOku sonucu. */
export function onizlemeUrunu(giyili, denenen) {
  if (denenen) return { urun: denenen, giyili: giyili[yuvaBul(denenen)] === denenen };
  const urun = giyili.govde ?? Object.values(giyili).find(Boolean);
  return urun ? { urun, giyili: true } : null;
}

/**
 * Kartın durumu. -> { durum, eksik? }
 * kıyafet: 'giyili' (Üstünde; Çıkar önizleme bandında) | 'dolapta' (Giy) | 'kilitli' (evre gelince açılır) | 'al' | 'yetersiz';
 * yiyecek: 'al' (bedava? özel gün pastası) | 'yetersiz' | 'yumurta' | 'uyuyor'.
 */
export function urunDurumu(y, urun, { kim, simdi }) {
  const u = URUNLER[urun];
  if (u.tur === 'kiyafet') {
    if (dolaptaMi(y, urun)) return { durum: giyimOku(y)[yuvaBul(urun)] === urun ? 'giyili' : 'dolapta' };
    const evre = urunKilidi(y, urun);
    if (evre) return { durum: 'kilitli', evre };
    const eksik = u.fiyat - jetonBakiye(y);
    return eksik > 0 ? { durum: 'yetersiz', eksik } : { durum: 'al' };
  }
  const r = satinAl(y, { kim, urun, simdi });
  if (!r.hata) return urun === 'pasta' && pastaBedavaMi(y, kim, simdi) ? { durum: 'al', bedava: true } : { durum: 'al' };
  if (r.hata === 'yetersiz') return { durum: 'yetersiz', eksik: r.eksik };
  return { durum: r.hata === 'uyuyor' ? 'uyuyor' : 'yumurta' };
}

/** Hata kodu → kullanıcıya Türkçe ileti. */
export function hataMetni(r) {
  switch (r?.hata) {
    case 'yetersiz': return `${r.eksik} jeton eksik`;
    case 'zaten': return 'Bu zaten dolapta.';
    case 'kilitli': return `${kilitMetni(r.evre)} kendiliğinden dolabınıza gelecek 🔒`;
    case 'yumurta': return 'Yumurtadan çıkınca yiyebilir 🥚';
    case 'uyuyor': return 'Şşş, uyuyor 🌙 Uyanınca yedirelim.';
    case 'dolapta-yok': return 'Önce satın alalım.';
    default: return 'Bu ürün şu an alınamıyor.';
  }
}

/** '3 aylıkken', '1 yaşında'. */
export function kilitMetni(evre) {
  return evre?.ay === 12 ? '1 yaşında' : `${evre?.ay} aylıkken`;
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
  let filtre = FILTRELER[0].id;
  let mesgul = false;
  let kapandi = false;

  const baslikId = `yvm-baslik-${Math.random().toString(36).slice(2, 8)}`;
  const bakiyeSayi = el('span', { class: 'yvm-bakiye-sayi' });
  const bakiye = el('p', { class: 'yvm-bakiye', 'aria-live': 'polite', 'aria-atomic': 'true' },
    el('span', { class: 'yvm-simge', html: paraIkon(18) }), el('span', { class: 'sr-only' }, 'Ortak jeton: '), bakiyeSayi);
  const kapatBtn = el('button', { type: 'button', class: 'yvm-kapat', 'aria-label': 'Mağazayı kapat', html: ikon('kapat', 22), onclick: () => kapat() });

  const sekmeBtn = {};
  const paneller = {};
  const tablist = el('div', { class: 'yvm-sekmeler', role: 'tablist', 'aria-label': 'Ürün türü' });
  for (const s of GORUNEN_SEKMELER) {
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
    const i = GORUNEN_SEKMELER.findIndex((s) => s.id === aktif);
    const n = GORUNEN_SEKMELER.length;
    const j = e.key === 'Home' ? 0 : e.key === 'End' ? n - 1 : (i + (e.key === 'ArrowRight' ? 1 : -1) + n) % n;
    sekmeSec(GORUNEN_SEKMELER[j].id);
    sekmeBtn[GORUNEN_SEKMELER[j].id].focus();
  });

  // Giyim önizlemesi (yapışık bant) ve filtreler
  const onizCizim = el('div', { class: 'yvm-oniz-cizim' });
  const onizAd = el('p', { class: 'yvm-oniz-ad' });
  const onizDurum = el('p', { class: 'yvm-oniz-durum' });
  const cikarBtn = el('button', { type: 'button', class: 'yvm-cikar', onclick: () => eylemYap(cikarBtn.dataset.urun) }, 'Çıkar');
  const onizNot = el('p', { class: 'yvm-oniz-not' });
  const filtreBtn = {};
  const filtreler = el('div', { class: 'yvm-filtreler', role: 'group', 'aria-label': 'Filtre' });
  for (const f of FILTRELER) {
    filtreBtn[f.id] = el('button', { type: 'button', class: 'yvm-filtre', onclick: () => filtreSec(f.id) }, f.ad);
    filtreler.append(filtreBtn[f.id]);
  }
  paneller.giyim.append(
    el('div', { class: 'yvm-oniz' }, onizCizim, el('div', { class: 'yvm-oniz-yazi' }, onizAd, onizDurum, cikarBtn)),
    onizNot,
    filtreler,
  );

  // Kartlar
  const kartlar = {};
  for (const s of SEKMELER) {
    const liste = el('ul', { class: 'yvm-izgara', role: 'list' });
    for (const id of sekmeUrunleri(s.id)) {
      const u = URUNLER[id];
      const adId = `${baslikId}-u-${id}`;
      const gorsel = u.tur === 'kiyafet'
        ? el('button', { type: 'button', class: 'yvm-gorsel yvm-dene', 'aria-pressed': 'false', 'aria-label': `${u.ad}: önizlemede dene`, html: giyimParcaSvg(id, { renk: bebekOpts.renk }), onclick: () => dene(id) })
        : el('span', { class: 'yvm-gorsel yvm-yiyecek', 'aria-hidden': 'true', html: YIYECEK_CIZIM[id] });
      const fiyat = el('span', { class: 'yvm-fiyat' }, el('span', { class: 'yvm-simge', html: paraIkon(17) }), el('span', { class: 'sr-only' }, 'Fiyat: '), `${u.fiyat}`, el('span', { class: 'sr-only' }, ' jeton'));
      const not = el('span', { class: 'yvm-not' });
      const eylem = el('button', { type: 'button', class: 'yvm-eylem', 'aria-describedby': adId, onclick: () => eylemYap(id) });
      const kart = el('li', { class: 'yvm-kart', 'data-urun': id },
        gorsel,
        el('h3', { class: 'yvm-ad', id: adId }, u.ad),
        u.tur === 'yiyecek' ? el('p', { class: 'yvm-etki' }, etkiMetni(id)) : null,
        el('div', { class: 'yvm-satir' }, fiyat, not, eylem));
      kartlar[id] = { kart, gorsel, fiyat, not, eylem };
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

  function filtreSec(id) {
    filtre = id;
    mesaj('');
    boya();
  }

  const ETIKET = { al: 'Al', yetersiz: 'Yetersiz', dolapta: 'Giy', yumurta: 'Al', uyuyor: 'Uyuyor' };
  const FIYATSIZ = ['giyili', 'dolapta', 'kilitli'];

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
    for (const f of FILTRELER) filtreBtn[f.id].setAttribute('aria-pressed', String(f.id === filtre));
    const gorunen = filtreliUrunler(filtre);
    for (const [id, k] of Object.entries(kartlar)) {
      const d = urunDurumu(v, id, { kim, simdi: t });
      k.kart.dataset.durum = d.durum;
      if (URUNLER[id].tur === 'kiyafet') k.kart.hidden = !gorunen.includes(id);
      k.fiyat.hidden = d.bedava || FIYATSIZ.includes(d.durum);
      k.not.hidden = d.durum !== 'giyili' && !d.bedava;
      if (d.durum === 'giyili') k.not.innerHTML = `${ikon('tik', 17)}Üstünde`;
      else if (d.bedava) k.not.textContent = 'Bugün bedava';
      k.eylem.hidden = d.durum === 'giyili';
      if (d.durum === 'kilitli') k.eylem.innerHTML = `${ikon('kilit', 16)}<span class="sr-only">Kilitli: </span>${kilitMetni(d.evre)}`;
      else k.eylem.textContent = d.bedava ? 'Ver' : ETIKET[d.durum] ?? '';
      const pasif = d.durum === 'yetersiz' || d.durum === 'yumurta' || d.durum === 'uyuyor' || d.durum === 'kilitli';
      if (pasif) k.eylem.setAttribute('aria-disabled', 'true'); else k.eylem.removeAttribute('aria-disabled');
      k.eylem.disabled = mesgul;
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
    const o = onizlemeUrunu(giyili, denenen);
    onizAd.textContent = o ? URUNLER[o.urun].ad : 'Bir kıyafet seç, üstünde dene';
    onizDurum.textContent = !o ? '' : o.giyili ? 'Şu an üstünde' : 'Deneniyor';
    cikarBtn.hidden = !o?.giyili;
    cikarBtn.disabled = mesgul;
    if (o?.giyili) {
      cikarBtn.dataset.urun = o.urun;
      cikarBtn.setAttribute('aria-label', `${URUNLER[o.urun].ad}: çıkar`);
    }
    onizNot.textContent = asama === 'kucuk' ? 'Kundaktayken yalnız başlık görünür; kıyafet, gözlük, atkı, emzik ve battaniye büyüyünce.' : '';
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
    } else {
      // Kıyafet: satın alma ve giyme tek yazım (dolap + giyim yaması birlikte).
      r = u.tur === 'kiyafet' ? satinAlGiyYamasi(v, { kim, urun: id, simdi: t }) : satinAl(v, { kim, urun: id, simdi: t });
      kayit = r.kayit || null;
      basari = u.tur === 'kiyafet' ? `${u.emoji} ${u.ad} alındı ve giyildi ✨` : `${u.emoji} Afiyet olsun!`;
    }
    if (r.hata) { mesaj(hataMetni(r), 'hata'); return; }
    // Bant son işlemin ürününü gösterir; çıkarılan ürün önizlemede kalmaz.
    if (u.tur === 'kiyafet') denenen = d.durum === 'giyili' ? null : id;
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
      // Odak sayfada kalsın: disabled ve hidden düğme odağı düşürür. Çıkar ya da eylem gizlendiyse sıradaki hedef alır.
      const odak = document.activeElement;
      if (!sayfa.contains(odak) || odak.closest('[hidden]')) {
        const k = kartlar[id];
        for (const hedef of [d.durum === 'giyili' ? cikarBtn : k.eylem, k.gorsel, sayfa]) {
          hedef.focus();
          if (document.activeElement === hedef) break;
        }
      }
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
/* Görsel kutusu iki temada açık: koyu parçalar seçilsin. */
:root { --yvm-tabak: #F8EEE8; }
@media (prefers-color-scheme: dark) { :root:not([data-mod="acik"]) { --yvm-tabak: #F3E7DF; } }
:root[data-mod="koyu"] { --yvm-tabak: #F3E7DF; }
.yvm-kat { position: fixed; inset: 0; z-index: 870; display: grid; grid-template-columns: minmax(0, 1fr); align-items: end; justify-items: center; }
.yvm-kat [hidden] { display: none !important; }
.yvm-kat .yv-ikon, .yvm-kat .yv-para { display: block; flex: none; }
.yvm-perde { position: absolute; inset: 0; background: var(--overlay); -webkit-backdrop-filter: blur(3px); backdrop-filter: blur(3px); }
.yvm-sayfa {
  position: relative; display: flex; flex-direction: column;
  width: 100%; max-width: 520px; height: min(90dvh, 800px);
  border-radius: 28px 28px 0 0;
  background: var(--bg); color: var(--text); box-shadow: var(--shadow-lg);
  padding: 8px 0 calc(8px + var(--safe-bottom));
  overscroll-behavior: contain;
}
.yvm-panel:focus, .yvm-sayfa:focus { outline: none; }
.yvm-tutamak { flex: none; align-self: center; width: 40px; height: 5px; border-radius: 3px; background: var(--line); margin-bottom: 4px; }
.yvm-ust { flex: none; display: flex; align-items: center; gap: 10px; padding: 4px 12px 8px 20px; }
.yvm-baslik { margin: 0; flex: 1; min-width: 0; font-family: var(--font-display); font-size: 1.625rem; font-weight: 600; line-height: 1.1; font-variation-settings: 'SOFT' 100; }
.yvm-simge { display: inline-flex; flex: none; }
.yvm-bakiye {
  display: inline-flex; align-items: center; gap: 7px; margin: 0; height: 36px; padding: 0 13px 0 10px;
  border-radius: 999px; background: var(--surface-2); color: var(--text);
  font-weight: 800; font-size: 0.9375rem; font-variant-numeric: tabular-nums;
}
.yvm-kapat {
  display: grid; place-items: center; width: 44px; height: 44px; flex: none;
  border: 0; border-radius: 50%; background: transparent; color: var(--muted); cursor: pointer;
}
.yvm-kapat:focus-visible, .yvm-sekmeler > button:focus-visible, .yvm-dene:focus-visible, .yvm-eylem:focus-visible, .yvm-cikar:focus-visible {
  outline: 3px solid var(--focus); outline-offset: 2px;
}
.yvm-filtre:focus-visible { outline: 3px solid var(--focus); outline-offset: 0; }
@media (hover: hover) { .yvm-kapat:hover { background: var(--surface-2); color: var(--text); } }
.yvm-sekmeler {
  flex: none; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 4px; margin: 0 16px 12px; padding: 4px;
  border-radius: 16px; background: var(--surface-2);
}
.yvm-sekmeler > button {
  min-height: 44px; border: 0; border-radius: 12px; background: transparent; color: var(--muted);
  font: inherit; font-size: 0.9375rem; font-weight: 700; cursor: pointer;
}
.yvm-sekmeler > button[aria-selected='true'] { background: var(--line); color: var(--text); font-weight: 800; }
.yvm-govde { flex: 1; min-height: 0; overflow-x: hidden; overflow-y: auto; padding: 0 16px 8px; scrollbar-width: thin; scrollbar-color: var(--line) transparent; }
.yvm-oniz {
  /* Yapışık: aşağıdaki ürünü denerken önizleme görünür kalır. Halka, kayan kartları bandın köşelerinde örter. */
  position: sticky; top: 0; z-index: 1;
  display: flex; align-items: center; gap: 12px; min-height: 124px; padding-right: 14px;
  border-radius: 22px; background: var(--surface); box-shadow: 0 0 0 10px var(--bg);
}
.yvm-oniz-cizim { flex: none; width: clamp(96px, 32vw, 124px); aspect-ratio: 1; }
.yvm-oniz-yazi { flex: 1; min-width: 0; padding: 8px 0; }
.yvm-oniz-ad { margin: 0; font-family: var(--font-display); font-size: 1.25rem; font-weight: 600; line-height: 1.2; font-variation-settings: 'SOFT' 100; }
.yvm-oniz-durum { margin: 3px 0 0; color: var(--muted); font-size: 0.8125rem; font-weight: 700; }
.yvm-oniz-durum:empty { display: none; }
.yvm-cikar {
  margin-top: 6px; min-height: 44px; padding: 0 16px; border: 1.5px solid var(--line); border-radius: 999px;
  background: transparent; color: var(--text); font: inherit; font-size: 0.8125rem; font-weight: 800; cursor: pointer;
}
.yvm-oniz-not { margin: 12px 4px 0; color: var(--muted); font-size: 0.8125rem; line-height: 1.4; }
.yvm-oniz-not:empty { display: none; }
.yvm-filtreler {
  /* Yatay kayar; gövdenin kenarına dek uzanır. Düğmenin saydam kenarı 38 px hapı 44 px dokunma alanına büyütür. */
  display: flex; gap: 2px; margin: 0 -16px; padding: 9px 13px;
  overflow-x: auto; overscroll-behavior-x: contain; scrollbar-width: none;
}
.yvm-filtreler::-webkit-scrollbar { display: none; }
.yvm-filtre {
  flex: none; height: 44px; padding: 0 15px; border: 3px solid transparent; border-radius: 999px;
  background: var(--surface-2); background-clip: padding-box; color: var(--muted);
  font: inherit; font-size: 0.8125rem; font-weight: 800; cursor: pointer;
}
.yvm-filtre[aria-pressed='true'] { background-color: var(--text); color: var(--bg); }
.yvm-izgara { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
.yvm-kart {
  position: relative; display: flex; flex-direction: column; min-width: 0; padding: 8px 8px 10px;
  border-radius: 22px; background: var(--surface); box-shadow: var(--shadow-sm);
}
.yvm-kart[data-durum='giyili'] { box-shadow: inset 0 0 0 2px var(--accent), var(--shadow-sm); }
.yvm-gorsel {
  flex: none; display: grid; place-items: center; width: 100%; height: 116px; overflow: hidden;
  border-radius: 15px; background: var(--yvm-tabak);
}
.yvm-yiyecek { height: 96px; color: var(--yvb-murekkep); }
.yvm-yiyecek svg { width: 52px; height: 52px; }
.yvm-dene { padding: 4px; border: 0; color: inherit; font: inherit; cursor: pointer; }
.yvm-dene svg { height: 108px; } /* kare parçalar (emzik) kutudan taşmasın */
.yvm-dene[aria-pressed='true'] { box-shadow: inset 0 0 0 3px var(--accent); }
.yvm-kart[data-durum='giyili'] .yvm-dene[aria-pressed='true'] { box-shadow: none; }
.yvm-ad { margin: 8px 4px 6px; font-size: 0.9375rem; font-weight: 800; line-height: 1.2; }
.yvm-etki { margin: -2px 4px 6px; color: var(--muted); font-size: 0.8125rem; line-height: 1.35; }
.yvm-satir {
  margin-top: auto; display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 4px 6px;
  min-height: 44px; padding: 0 4px;
}
.yvm-fiyat { display: inline-flex; align-items: center; gap: 5px; font-size: 0.9375rem; font-weight: 800; font-variant-numeric: tabular-nums; }
.yvm-not { display: inline-flex; align-items: center; gap: 4px; color: var(--accent); font-size: 0.8125rem; font-weight: 800; }
.yvm-kart[data-durum='al'] .yvm-not { color: var(--good); }
.yvm-eylem {
  display: inline-flex; align-items: center; justify-content: center; gap: 5px; min-width: 44px; min-height: 44px; padding: 0 18px;
  border: 0; border-radius: 999px; background: var(--surface-2); color: var(--text);
  font: inherit; font-size: 0.9375rem; font-weight: 800; cursor: pointer;
}
.yvm-kart[data-durum='al'] .yvm-eylem { background: var(--accent); color: var(--accent-ink); }
.yvm-eylem[aria-disabled='true'] { padding: 0 10px; color: var(--muted); font-size: 0.8125rem; }
.yvm-kart[data-durum='kilitli'] .yvm-eylem { padding: 0; background: transparent; }
.yvm-eylem:disabled, .yvm-cikar:disabled { opacity: 0.6; cursor: default; }
.yvm-durum { flex: none; min-height: 1.5em; margin: 6px 20px 0; font-weight: 700; font-size: 0.9375rem; text-align: center; color: var(--text); }
.yvm-durum[data-tur='hata'] { color: var(--bad); }
.yvm-durum[data-tur='iyi'] { color: var(--good); }
@media (prefers-reduced-motion: no-preference) {
  .yvm-perde { animation: yvm-sol 0.22s ease-out both; }
  .yvm-sayfa { animation: yvm-yuksel 0.34s cubic-bezier(0.16, 1, 0.3, 1) both; }
  .yvm-kat.kapaniyor .yvm-perde { animation: yvm-sol 0.2s ease-in reverse both; }
  .yvm-kat.kapaniyor .yvm-sayfa { animation: yvm-in 0.2s ease-in both; }
  .yvm-dene, .yvm-kart { transition: box-shadow 0.15s ease; }
  .yvm-filtre, .yvm-sekmeler > button { transition: background-color 0.15s ease, color 0.15s ease; }
}
@keyframes yvm-sol { from { opacity: 0; } }
@keyframes yvm-yuksel { from { transform: translateY(48px); opacity: 0; } }
@keyframes yvm-in { to { transform: translateY(40px); opacity: 0; } }
`;
